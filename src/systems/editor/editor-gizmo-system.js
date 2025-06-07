// src/systems/editor/editor-gizmo-system.js
// @version 1.1.0 - Added detach logic for TransformControls on deselect/remove

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { UpdateComponentCommand } from '../../editor/command-manager.js'; // Assuming path

/**
 * Manages the TransformControls gizmo for manipulating selected entities in editor mode.
 *
 * @class EditorGizmoSystem
 */
export class EditorGizmoSystem {
    constructor() {
        this.priority = 90; // Run after most logic, before final rendering potentially
        /** @type {boolean} System active state (managed by engine mode) */
        this.active = false;
        this._name = 'editorGizmo';

        /** @type {import('../../core.js').Engine|null} */
        this.engine = null;
        /** @type {import('../three-render-system.js').ThreeRenderSystem|null} */
        this.renderer = null;
        /** @type {import('../../utils/event-emitter.js').EventEmitter|null} */
        this.eventEmitter = null;
        /** @type {import('../../editor/command-manager.js').CommandManager|null} */
        this.commandManager = null;

        /** @type {THREE.Camera|null} */
        this.camera = null;
        /** @type {HTMLElement|null} */
        this.domElement = null; // Renderer's DOM element
        /** @type {TransformControls|null} */
        this.transformControls = null;

        /** @private Stores the original transform state before dragging starts */
        this._originalTransform = null;
        /** @private The entity ID currently attached to the gizmo */
        this._attachedEntityId = null;

        // Bind methods
        this._onEntitySelected = this._onEntitySelected.bind(this);
        this._onObjectChange = this._onObjectChange.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        // *** ADDED: Listener for entity removal ***
        this._onEntityRemoved = this._onEntityRemoved.bind(this);
    }

    /**
     * Initializes the gizmo system, creating TransformControls and setting up listeners.
     * @param {import('../../ecs/entity-manager.js').EntityManager} entityManager
     * @param {import('../../utils/event-emitter.js').EventEmitter} eventEmitter
     * @param {import('../../core.js').Engine} engine
     * @returns {Promise<void>}
     * @async
     */
    async initialize(entityManager, eventEmitter, engine) {
        this.engine = engine;
        this.eventEmitter = eventEmitter;
        this.commandManager = engine.getCommandManager(); // Get command manager
        this.renderer = engine.getSystem('renderer'); // Get renderer system

        if (!this.renderer || !this.renderer.scene || !this.renderer.renderer) {
            console.error("EditorGizmoSystem: Renderer system or its scene/renderer not available!");
            return;
        }
        this.domElement = this.renderer.renderer.domElement; // Get canvas

        // Camera might change, get reference initially and update on change
        this.camera = this.renderer.activeCameraObject;

        try {
            this.transformControls = new TransformControls(this.camera, this.domElement);
            this.transformControls.size = 0.75; // Adjust size as needed
            this.renderer.scene.add(this.transformControls); // Add gizmo to the scene

            // Setup event listeners for the gizmo controls
            this.transformControls.addEventListener('change', this._onObjectChange);
            this.transformControls.addEventListener('mouseDown', this._onMouseDown);
            this.transformControls.addEventListener('mouseUp', this._onMouseUp);
            // Prevent OrbitControls while dragging gizmo
            this.transformControls.addEventListener('dragging-changed', (event) => {
                 if (this.renderer?.orbitControls) {
                     this.renderer.orbitControls.enabled = !event.value;
                 }
            });

            // Listen for engine events
            this.eventEmitter.on('entitySelected', this._onEntitySelected);
            this.eventEmitter.on('activeCameraChanged', ({ cameraObject }) => {
                 // Update camera reference for controls when main camera changes
                 if (this.transformControls && cameraObject) {
                      this.transformControls.camera = cameraObject;
                      this.camera = cameraObject; // Store current camera
                 }
            });
            // *** ADDED: Listen for entity removal ***
            this.eventEmitter.on('entityRemoved', this._onEntityRemoved);


            console.log("EditorGizmoSystem Initialized.");
        } catch (error) {
            console.error("EditorGizmoSystem: Failed to initialize TransformControls:", error);
            if (this.transformControls) { this.renderer.scene.remove(this.transformControls); this.transformControls.dispose(); this.transformControls = null; }
        }
    }

    /**
     * Handles entity selection changes. Attaches/detaches the gizmo.
     * @param {object} eventData
     * @param {number|null} eventData.id - The selected entity ID.
     * @private
     */
    _onEntitySelected({ id }) {
        if (!this.transformControls || !this.renderer?.entityObjects || !this.engine?.entityManager) {
            return;
        }

        if (this._attachedEntityId === id) return; // No change

        if (id !== null && this.engine.entityManager.hasEntity(id)) {
            const entry = this.renderer.entityObjects.get(id);
            // Attach only if it's a renderable object (mesh or model)
            if (entry && entry.threeObject && (entry.type === 'mesh' || entry.type === 'model')) {
                 // Detach from previous object first (if any)
                 if (this.transformControls.object) { this.transformControls.detach(); }
                 // Attach to new object
                this.transformControls.attach(entry.threeObject);
                this._attachedEntityId = id; // Track attached entity
                console.log(`[Gizmo] Attached to entity ${id}`);
            } else {
                // Entity exists but has no suitable render object, detach gizmo
                if (this.transformControls.object) { this.transformControls.detach(); }
                this._attachedEntityId = null;
                 console.log(`[Gizmo] Selected entity ${id} has no suitable render object. Detached.`);
            }
        } else {
            // Deselected or entity doesn't exist, detach gizmo
            if (this.transformControls.object) { this.transformControls.detach(); }
            this._attachedEntityId = null;
            // console.log("[Gizmo] Detached due to deselection or invalid ID.");
        }
    }

    /**
     * Handles entity removal events. Detaches the gizmo if it was attached to the removed entity.
     * @param {object} eventData
     * @param {number} eventData.id - The ID of the removed entity.
     * @private
     */
    _onEntityRemoved({ id }) {
        if (this._attachedEntityId === id) {
             if (this.transformControls && this.transformControls.object) {
                  console.log(`[Gizmo] Detaching from removed entity ${id}.`);
                  this.transformControls.detach();
             }
             this._attachedEntityId = null;
        }
    }

    /** Stores the original transform when dragging starts. @private */
    _onMouseDown() {
        if (!this.transformControls?.object || this._attachedEntityId === null) return;
        // Store current state from the component, not the potentially lagging THREE object
        const trs = this.engine?.getComponent(this._attachedEntityId, 'transform');
        if (trs) {
            this._originalTransform = {
                position: [...trs.position], // Clone arrays
                rotation: [...trs.rotation],
                scale: [...trs.scale]
            };
        } else {
             this._originalTransform = null; // Fallback if component missing
        }
    }

    /** Creates an UpdateComponentCommand when dragging ends. @private */
    _onMouseUp() {
        if (!this.transformControls?.object || this._originalTransform === null || this._attachedEntityId === null || !this.commandManager) {
            this._originalTransform = null;
            return;
        }

        const targetObject = this.transformControls.object;
        const currentTransform = {
            position: targetObject.position.toArray(),
            rotation: [ // Convert quaternion back to euler degrees for storage
                THREE.MathUtils.radToDeg(targetObject.rotation.x),
                THREE.MathUtils.radToDeg(targetObject.rotation.y),
                THREE.MathUtils.radToDeg(targetObject.rotation.z)
            ],
            scale: targetObject.scale.toArray()
        };

        // Check if anything actually changed significantly
        const posChanged = currentTransform.position.some((p, i) => Math.abs(p - this._originalTransform.position[i]) > 1e-5);
        const rotChanged = currentTransform.rotation.some((r, i) => Math.abs(r - this._originalTransform.rotation[i]) > 1e-3);
        const scaleChanged = currentTransform.scale.some((s, i) => Math.abs(s - this._originalTransform.scale[i]) > 1e-5);

        if (posChanged || rotChanged || scaleChanged) {
             const properties = {};
             if (posChanged) properties.position = { oldValue: this._originalTransform.position, newValue: currentTransform.position };
             if (rotChanged) properties.rotation = { oldValue: this._originalTransform.rotation, newValue: currentTransform.rotation };
             if (scaleChanged) properties.scale = { oldValue: this._originalTransform.scale, newValue: currentTransform.scale };

            const cmd = new UpdateComponentCommand(
                this.engine,
                this._attachedEntityId,
                'transform',
                properties
            );
            this.commandManager.execute(cmd);
        }

        this._originalTransform = null; // Clear stored transform
    }

    /** Syncs gizmo state if properties change outside dragging (e.g., inspector). @private */
    _onObjectChange() {
        // This event fires frequently during drag. We only create commands on mouseUp.
        // However, if the object's transform is changed EXTERNALLY (e.g., via Inspector),
        // this ensures the gizmo visually updates its position/orientation.
        // No action needed here typically, as the controls update themselves.
        // console.log("Gizmo changed");
    }

    /** Update loop - currently does nothing, as TransformControls updates itself via renderer. */
    update(time) {
        // if (this.active && this.transformControls && this.transformControls.enabled) {
        //     // Usually not needed as TransformControls hooks into the renderer loop
        // }
    }

    /** Cleans up the gizmo and listeners. */
    cleanup() {
        console.log("Cleaning up EditorGizmoSystem...");
        if (this.eventEmitter) {
            this.eventEmitter.off('entitySelected', this._onEntitySelected);
            this.eventEmitter.off('activeCameraChanged', this.transformControls?.dispose); // Check if needed
            this.eventEmitter.off('entityRemoved', this._onEntityRemoved); // *** REMOVE Listener ***
        }
        if (this.transformControls) {
            this.transformControls.removeEventListener('change', this._onObjectChange);
            this.transformControls.removeEventListener('mouseDown', this._onMouseDown);
            this.transformControls.removeEventListener('mouseUp', this._onMouseUp);
            this.transformControls.removeEventListener('dragging-changed'); // Remove anonymous listener if needed?
            if (this.transformControls.object) { this.transformControls.detach(); } // Detach if attached
            this.transformControls.dispose(); // Dispose controls resources
            this.renderer?.scene?.remove(this.transformControls); // Remove from scene
        }
        this.transformControls = null; this.camera = null; this.domElement = null;
        this.renderer = null; this.engine = null; this.eventEmitter = null; this.commandManager = null;
        console.log("EditorGizmoSystem Cleaned Up.");
    }
}