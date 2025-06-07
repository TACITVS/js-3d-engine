// src/core.js
// @version 1.6.0 - Implemented fixed timestep for physics update.
// @previous 1.5.8 - Call _updateSystemActivation after mode/state change in enterGameMode/enterEditorMode.

import { EventEmitter } from './utils/event-emitter.js';
import { EntityManager } from './ecs/entity-manager.js';
import { SystemManager } from './ecs/system-manager.js';
import { ComponentRegistry } from './ecs/component-registry.js';
import { AssetManager } from './asset/asset-manager.js';
import { CommandManager } from './editor/command-manager.js';
import { PrefabManager } from './ecs/prefab-manager.js';
import { engineConfig } from './engine-config.js';
import { Component } from './ecs/component.js'; // Base component needed?

// Core Components
import { TransformComponent } from './components/transform-component.js';
import { RenderableComponent } from './components/renderable-component.js';
import { VelocityDataComponent } from './components/velocity-data-component.js';
import { CameraComponent } from './components/camera-component.js';
import { LightComponent } from './components/light-component.js';
import { TagComponent } from './components/tag-component.js';
import { PhysicsComponent } from './components/physics/physics-component.js';

// Behavior Components
import { SpinComponent } from './components/behaviors/spin-component.js';
import { PlayerControlComponent } from './components/behaviors/player-control-component.js';

// GameState Manager Constants
import { GameState } from './systems/game-state-manager.js';

const EDITOR_STATE_KEY = engineConfig.persistence.localStorageKey;

// --- FIXED TIMESTEP CONSTANTS ---
const FIXED_DELTA_TIME = 1 / 60; // Target 60 physics updates per second
const MAX_ACCUMULATED_TIME = FIXED_DELTA_TIME * 5; // Prevent spiral of death if frame takes too long
// --- END CONSTANTS ---

export class Engine {
    constructor(container) {
        console.log(`[Engine Constructor] START v1.6.0`); // Version increment
        if (!container) throw new Error("Engine requires a container element.");
        this.container = container;
        this.eventEmitter = new EventEmitter();
        this.componentRegistry = new ComponentRegistry();
        this.entityManager = new EntityManager(this.componentRegistry, this.eventEmitter);
        this.assetManager = new AssetManager(this.eventEmitter, {
            basePath: engineConfig.assetManager.basePath
        });
        this.systemManager = new SystemManager(this.entityManager, this.eventEmitter, this);
        this.commandManager = new CommandManager();
        this.prefabManager = new PrefabManager(this.entityManager);

        // --- MODIFIED: Added accumulator for fixed timestep ---
        this.time = {
            deltaTime: 0,           // Variable time since last frame (for rendering/non-physics)
            elapsed: 0,             // Total time elapsed
            lastFrameTime: 0,       // Timestamp of the last frame start
            gameTimeScale: 1.0,     // Scale applied to variable AND fixed delta time
            _accumulator: 0.0       // Accumulates frame time for fixed updates
        };
        // --- END MODIFICATION ---

        this.isRunning = false; this._rafId = null; this._loopCounter = 0;
        this._boundLoop = this._loop.bind(this); this.selectedEntityId = null;
        this.mode = 'editor'; // Default mode

        this._saveStateTimeout = null;
        this._debouncedSaveEditorState = () => { clearTimeout(this._saveStateTimeout); this._saveStateTimeout = setTimeout(() => this.saveEditorState(), 500); };

        this._registerCoreComponents();
        this._setupPersistenceListeners();
        console.log("[Engine Constructor] END");
    }

    _registerCoreComponents() {
        // ... (unchanged) ...
        console.log("Engine: Registering CORE components...");
        this.componentRegistry.register('transform', TransformComponent);
        this.componentRegistry.register('renderable', RenderableComponent);
        this.componentRegistry.register('camera', CameraComponent);
        this.componentRegistry.register('light', LightComponent);
        this.componentRegistry.register('velocityData', VelocityDataComponent);
        this.componentRegistry.register('tag', TagComponent);
        this.componentRegistry.register('physics', PhysicsComponent);
        this.componentRegistry.register('spin', SpinComponent);
        this.componentRegistry.register('playerControl', PlayerControlComponent);
        console.log("Engine: Core components registered.");
        console.log("Registered component types:", this.componentRegistry.getComponentTypeNames());
        console.log("Engine: Core component registration phase COMPLETE.");
    }

    // --- Getters (unchanged) ---
    getAssetManager() { return this.assetManager; }
    getCommandManager() { return this.commandManager; }
    getEntityManager() { return this.entityManager; }
    getSystemManager() { return this.systemManager; }
    getEventEmitter() { return this.eventEmitter; }
    getComponentRegistry() { return this.componentRegistry; }
    getPrefabManager() { return this.prefabManager; }
    getMode() { return this.mode; }

    // --- Methods ---
    initialize() {
        console.log("Engine: Initializing...");
        // Initial system activation based on default mode ('editor')
        this._updateSystemActivation();
        console.log("Engine: Initialization complete.");
        return this;
    }

    run() {
        if (this.isRunning) return;
        console.log("Engine: Starting main loop...");
        this.isRunning = true;
        this.time.lastFrameTime = performance.now();
        this.time._accumulator = 0; // Reset accumulator on start
        this._rafId = requestAnimationFrame(this._boundLoop);
    }

    stop() {
        if (!this.isRunning) return;
        console.log("Engine: Stopping main loop...");
        this.isRunning = false;
        if (this._rafId !== null) cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }

    /**
     * Engine's main loop using requestAnimationFrame.
     * Implements a fixed timestep update for physics and variable timestep for others.
     * @param {DOMHighResTimeStamp} timestamp - The timestamp provided by requestAnimationFrame.
     * @private
     */
    _loop(timestamp) {
        if (!this.isRunning) return;
        const now = performance.now();
        // Calculate raw frame time, clamp max value
        const rawDeltaTime = Math.min((now - this.time.lastFrameTime) / 1000, 0.1); // Max delta 100ms
        this.time.lastFrameTime = now;

        // --- FIXED TIMESTEP LOGIC ---
        const scaledDeltaTime = rawDeltaTime * this.time.gameTimeScale;
        this.time._accumulator += scaledDeltaTime;

        // Prevent spiral of death by capping accumulated time
        if (this.time._accumulator > MAX_ACCUMULATED_TIME) {
            // console.warn(`Engine Loop: Accumulated time (${this.time._accumulator.toFixed(4)}s) exceeded max (${MAX_ACCUMULATED_TIME}s). Clamping.`);
            this.time._accumulator = MAX_ACCUMULATED_TIME;
        }

        const physicsSystem = this.getSystem('physics');
        const fixedTimeStepScaled = FIXED_DELTA_TIME * this.time.gameTimeScale;
        let physicsSteps = 0; // Counter for debug

        // Run fixed updates (Physics) as many times as needed
        while (this.time._accumulator >= fixedTimeStepScaled) {
            if (physicsSystem && this.systemManager.isSystemActive('physics')) { // Check if system is active
                try {
                    // Pass the FIXED delta time to the physics system update
                    physicsSystem.update({ deltaTime: fixedTimeStepScaled, elapsed: this.time.elapsed });
                    physicsSteps++;
                } catch (physicsError) {
                    console.error("[Engine Loop] CRITICAL ERROR during Physics Update:", physicsError);
                    this.stop();
                    // Display error... (omitted for brevity)
                    return;
                }
            }
            this.time._accumulator -= fixedTimeStepScaled;
            this.time.elapsed += fixedTimeStepScaled; // Increment total elapsed time by fixed steps
        }
        // if (physicsSteps > 1) console.log(`Physics steps this frame: ${physicsSteps}`); // Optional debug log

        // --- END FIXED TIMESTEP LOGIC ---

        // --- Variable Update (Other Systems) ---
        // Use the scaled raw delta time for systems that depend on frame rate (rendering, animations)
        this.time.deltaTime = scaledDeltaTime; // Set the variable deltaTime for other systems

        try {
            // Temporarily deactivate physics system before calling systemManager.update
            // to prevent it from running again with variable delta time.
            const physicsWasActive = physicsSystem && this.systemManager.isSystemActive('physics');
            let originalPhysicsActiveState = false;
            if (physicsSystem) {
                originalPhysicsActiveState = physicsSystem.active; // Store original state
                physicsSystem.active = false; // Deactivate temporarily
            }

            // Run other systems (rendering, input, behaviors etc.)
            this.systemManager.update(this.time);

            // Reactivate physics system if it was active before
            if (physicsSystem) {
                 physicsSystem.active = originalPhysicsActiveState; // Restore original state
            }

        } catch (error) {
            console.error("[Engine Loop] CRITICAL ERROR during Variable Update:", error);
            this.stop();
            // Display error... (omitted for brevity)
            return; // Stop loop execution
        }
        // --- END Variable Update ---

        this._loopCounter++;
        this._rafId = requestAnimationFrame(this._boundLoop);
    }


    destroy() {
        // ... (unchanged) ...
        console.log("Engine: Destroying...");
        this.stop();
        if (this.eventEmitter) { this.eventEmitter.off('entitySelected', this._debouncedSaveEditorState); this.eventEmitter.off('cameraTransformChanged', this._debouncedSaveEditorState); }
        clearTimeout(this._saveStateTimeout);
        this.systemManager?.cleanupAll(); this.commandManager?.clear(); this.entityManager?.clear(); this.assetManager?.clear(); this.eventEmitter?.offAll();
        this.container = null; this.entityManager = null; this.systemManager = null; this.componentRegistry = null; this.eventEmitter = null; this.assetManager = null; this.commandManager = null; this.prefabManager = null; this.time = null;
        console.log("Engine: Destroyed.");
    }

    async registerSystem(name, system) {
        // ... (unchanged) ...
        if (!this.systemManager) { console.error("Engine: SystemManager missing during registerSystem."); return this; }
        await this.systemManager.register(name, system);
        this._updateSystemActivation();
        return this;
    }

    unregisterSystem(name) {
        // ... (unchanged) ...
        if (this.systemManager) { this.systemManager.unregister(name); }
        return this;
    }

    getSystem(name) {
        // ... (unchanged) ...
        return this.systemManager?.get(name);
    }

    createEntity(typeHint = 'Entity', options = {}) {
        // ... (unchanged) ...
        if (!this.entityManager || !this.componentRegistry) { console.error("Engine: EntityManager or ComponentRegistry not available for createEntity."); return null; }
        const id = this.entityManager.createEntity(); if (id === null) { console.error("Engine: Failed to create new entity ID."); return null; }
        const transformData = { ...(options.transform || {}) }; if (transformData.position === undefined) transformData.position = [...engineConfig.transform.position]; if (transformData.rotation === undefined) transformData.rotation = [...engineConfig.transform.rotation]; if (transformData.scale === undefined) transformData.scale = [...engineConfig.transform.scale]; if (transformData.parent === undefined) transformData.parent = null; this.addComponent(id, 'transform', transformData);
        const primitiveTypes = ['Cube', 'Sphere', 'Ground']; const modelTypes = ['Model', 'ModelEntity']; const optionsRenderable = options.renderable || {}; let needsRenderable = false; let finalRenderableType = optionsRenderable.type;
        if (primitiveTypes.includes(typeHint)) { needsRenderable = true; if (!finalRenderableType) finalRenderableType = typeHint; } else if (modelTypes.includes(typeHint) && optionsRenderable.assetPath) { needsRenderable = true; finalRenderableType = 'Model'; } else if (options.renderable) { needsRenderable = true; if (!finalRenderableType) finalRenderableType = engineConfig.renderable.type || 'Cube'; }
        if (needsRenderable) { const renderableData = { ...optionsRenderable }; renderableData.type = finalRenderableType; if (renderableData.type !== 'Model') { if (renderableData.color === undefined) renderableData.color = (renderableData.type === 'Ground') ? engineConfig.renderable.defaultGroundColor : engineConfig.renderable.color; if (renderableData.roughness === undefined) renderableData.roughness = (renderableData.type === 'Ground') ? engineConfig.renderable.defaultGroundRoughness : engineConfig.renderable.roughness; if (renderableData.metalness === undefined) renderableData.metalness = engineConfig.renderable.metalness; } if (renderableData.visible === undefined) renderableData.visible = engineConfig.renderable.visible; if (renderableData.castShadow === undefined) renderableData.castShadow = engineConfig.renderable.castShadow; if (renderableData.receiveShadow === undefined) renderableData.receiveShadow = (renderableData.type === 'Ground') ? true : engineConfig.renderable.receiveShadow; this.addComponent(id, 'renderable', renderableData); }
        for (const componentType in options) { if (componentType === 'transform' || componentType === 'renderable') continue; if (this.componentRegistry.has(componentType)) { this.addComponent(id, componentType, options[componentType]); } else { console.warn(`Engine.createEntity: Component type '${componentType}' provided in options for entity ${id} but not registered.`); } }
        this.eventEmitter.emit('entityCreated', { id, type: typeHint, options }); return id;
    }

    removeEntity(id) {
        // ... (unchanged) ...
        if (!this.entityManager || !this.hasEntity(id)) return false;
        const wasSelected = (this.selectedEntityId === id);
        const success = this.entityManager.removeEntity(id);
        if (success && wasSelected) { this.selectEntity(null); } else if (!success) { console.error(`Engine: Failed to remove entity ${id} via EntityManager.`); }
        return success;
    }

    addComponent(entityId, type, data = {}) {
        // ... (unchanged) ...
        if (!this.entityManager?.hasEntity(entityId)) { console.warn(`Engine: AddComponent called on missing entity ${entityId}.`); return null; }
        if (!this.componentRegistry?.has(type)) { console.warn(`Engine: Component type '${type}' not registered.`); return null; }
        const source = data.source || 'engine'; const componentData = { ...data }; delete componentData.source;
        const componentInstance = this.entityManager.addComponent(entityId, type, componentData);
        if (componentInstance && this.mode === 'editor') { if (type === 'transform' && this.entityManager.hasComponent(entityId, 'camera') && this.getSystem('renderer')?.activeCameraEntityId === entityId) { this.eventEmitter.emit('cameraTransformChanged'); } }
        return componentInstance;
    }

    removeComponent(entityId, type) {
        // ... (unchanged) ...
        if (!this.entityManager) return false;
        return this.entityManager.removeComponent(entityId, type);
    }

    getComponent(entityId, type) {
        // ... (unchanged) ...
        return this.entityManager?.getComponent(entityId, type);
    }

    hasComponent(entityId, type) {
        // ... (unchanged) ...
        return this.entityManager?.hasComponent(entityId, type) ?? false;
    }

    hasEntity(entityId) {
        // ... (unchanged) ...
        return this.entityManager?.hasEntity(entityId) ?? false;
    }

    selectEntity(id) {
        // ... (unchanged) ...
        if (this.mode !== 'editor') { return; }
        if (id !== null && !this.hasEntity(id)) { console.warn(`Engine: Attempted to select non-existent entity ${id}. Deselecting.`); id = null; }
        if (this.selectedEntityId !== id) { this.selectedEntityId = id; this.eventEmitter.emit('entitySelected', { id }); }
    }

    getSelectedEntity() {
        // ... (unchanged) ...
        return this.selectedEntityId;
    }

    enterGameMode() {
        // ... (unchanged) ...
        if (this.mode === 'game') return;
        console.log("Engine: Entering Game Mode...");
        this.selectEntity(null); this.mode = 'game';
        const gameStateManager = this.getSystem('gameStateManager');
        if (gameStateManager) { console.log("[Engine] Calling gameStateManager.setState(GameState.PLAYING)..."); gameStateManager.setState(GameState.PLAYING); console.log("[Engine] gameStateManager.setState call returned."); this._updateSystemActivation(); } else { console.warn("Engine: GameStateManager not found. Cannot set game state. Updating activation based on mode."); this._updateSystemActivation(); }
        this.container?.classList.remove('mode-editor'); this.container?.classList.add('mode-game');
        console.log("[Engine] Emitting gameModeEntered event..."); this.eventEmitter.emit('gameModeEntered');
        console.log("Engine: Game Mode Entered.");
    }

    enterEditorMode() {
        // ... (unchanged) ...
        console.log(`[Engine] enterEditorMode called. Current mode: ${this.mode}`);
        if (this.mode === 'editor') return;
        console.log("Engine: Entering Editor Mode...");
        this.mode = 'editor'; this.time.gameTimeScale = 1.0;
        const gameStateManager = this.getSystem('gameStateManager');
        if (gameStateManager) { console.log("[Engine] Calling gameStateManager.setState(GameState.EDITOR)..."); gameStateManager.setState(GameState.EDITOR); console.log("[Engine] gameStateManager.setState call returned."); this._updateSystemActivation(); } else { console.warn("Engine: GameStateManager not found. Cannot set game state. Updating activation based on mode."); this._updateSystemActivation(); }
        this.container?.classList.remove('mode-game'); this.container?.classList.add('mode-editor');
        console.log("[Engine] Emitting editorModeEntered event..."); this.eventEmitter.emit('editorModeEntered');
        this.loadEditorState();
        console.log("Engine: Editor Mode Entered.");
    }

    _updateSystemActivation() {
        // ... (unchanged) ...
        if (!this.systemManager) return;
        const allSystems = this.systemManager.getSystemNames(); const gameStateManager = this.getSystem('gameStateManager');
        const currentState = gameStateManager?.getState() ?? (this.mode === 'game' ? GameState.PLAYING : GameState.EDITOR);
        allSystems.forEach(name => {
            const system = this.systemManager.get(name); if (!system) { console.warn(`_updateSystemActivation: System '${name}' not found.`); return; }
            let shouldBeActive = false;
            if (name === 'gameStateManager' || name === 'inputManager' || name === 'renderer') { shouldBeActive = true; }
            else if (name === 'editorGizmo') { shouldBeActive = (currentState === GameState.EDITOR); }
            else if (name === 'physics' || name === 'spin' || name === 'playerControl') { shouldBeActive = (currentState !== GameState.EDITOR); }
            else if (name === 'breakoutLogic' || name === 'gameUI' || name === 'input') { shouldBeActive = (currentState === GameState.PLAYING); }
            else { shouldBeActive = (currentState !== GameState.EDITOR); }
            const state = this.systemManager.systemStates.get(name);
            if (state && state.isInitialized) { if (this.systemManager.isSystemActive(name) !== shouldBeActive) { this.systemManager.setSystemActive(name, shouldBeActive); } }
            else if (!state) { console.warn(`_updateSystemActivation: State not found for system '${name}'.`); }
        });
    }

    _setupPersistenceListeners() {
        // ... (unchanged) ...
        if (!this.eventEmitter || !this.commandManager) return;
        this.eventEmitter.on('entitySelected', (data) => { if (this.mode === 'editor') this._debouncedSaveEditorState(); });
        this.eventEmitter.on('cameraTransformChanged', () => { if (this.mode === 'editor') this._debouncedSaveEditorState(); });
        this.commandManager.on('change', () => { if(this.mode === 'editor') this._debouncedSaveEditorState(); });
    }

    saveEditorState() {
        // ... (unchanged) ...
        if (this.mode !== 'editor') return;
        try { const rendererSystem = this.getSystem('renderer'); const activeCameraId = rendererSystem?.activeCameraEntityId; let cameraState = null; if (activeCameraId !== null && this.hasEntity(activeCameraId)) { const camTransform = this.getComponent(activeCameraId, 'transform'); if (camTransform) { cameraState = { position: camTransform.getPosition(), rotation: camTransform.getRotation() }; } } const state = { selectedEntityId: this.selectedEntityId, activeCameraId: activeCameraId, cameraTransform: cameraState }; localStorage.setItem(EDITOR_STATE_KEY, JSON.stringify(state)); } catch (error) { console.error("Failed to save editor state:", error); }
    }

    loadEditorState() {
        // ... (unchanged) ...
        if (this.mode !== 'editor') return;
        try { const savedState = localStorage.getItem(EDITOR_STATE_KEY); if (!savedState) { return; } const state = JSON.parse(savedState); const rendererSystem = this.getSystem('renderer'); const activeCameraId = state.activeCameraId; if (rendererSystem && activeCameraId !== null && this.hasEntity(activeCameraId) && state.cameraTransform) { const camComp = this.getComponent(activeCameraId, 'camera'); const camTransform = this.getComponent(activeCameraId, 'transform'); if(camComp && camTransform) { this.addComponent(activeCameraId, 'transform', { position: state.cameraTransform.position, rotation: state.cameraTransform.rotation, source: 'loadEditorState' }); const cameraObject = rendererSystem.entityObjects.get(activeCameraId)?.threeObject; const shouldBeActive = camComp.isActive === undefined || camComp.isActive; if (shouldBeActive) { if (cameraObject && rendererSystem.activeCameraEntityId !== activeCameraId) { rendererSystem._activateCamera(activeCameraId, cameraObject); } else if (rendererSystem.activeCameraEntityId === activeCameraId && rendererSystem.orbitControls) { rendererSystem.orbitControls.update(); } } } else { console.warn(`Cannot restore camera transform: Camera component or Transform component missing for entity ${activeCameraId}.`); } } else if (activeCameraId !== null) { } let entityToSelect = null; if (state.selectedEntityId !== undefined && state.selectedEntityId !== null) { if(this.hasEntity(state.selectedEntityId)) { entityToSelect = state.selectedEntityId; } else { } } this.selectEntity(entityToSelect); } catch (error) { console.error("Failed to load editor state:", error); }
    }

} // End Engine Class

export function createEngine(container) {
    return new Engine(container);
}
