// src/systems/three-render-system.js
// @version 1.5.4 - Added creation-in-progress tracking to fix potential race conditions in _syncEntity.
// @previous 1.5.3 - Added robustness checks (dependencies, data validation, try/catch).

import * as THREE from 'three';
import { OrbitControls }         from 'three/addons/controls/OrbitControls.js';
import { engineConfig }          from '../engine-config.js';

/**
 * Manages rendering entities using Three.js.
 * Uses engineConfig for default values.
 * @class ThreeRenderSystem
 */
export class ThreeRenderSystem {
    #visible = false; // Private field for visibility state

    constructor() {
        this.priority = 100;
        this.active = true;
        this._name = 'renderer';
        this.container = null;
        this.entityManager = null;
        this.eventEmitter = null;
        this.engine = null;
        this.assetManager = null;
        this.scene = null;
        this.renderer = null;
        this.activeCameraEntityId = null;
        this.activeCameraObject = null;
        this.orbitControls = null;
        this.raycaster = null;
        this.mouse = null;
        /** @type {Map<number, {entityId: number, threeObject: THREE.Object3D, type: string}>} */
        this.entityObjects = new Map();

        // --- MODIFICATION: Added Set to track creations in progress ---
        /** @private @type {Set<number>} */
        this._creationInProgress = new Set();
        // --- END MODIFICATION ---

        // Reusable THREE objects
        this._tempEuler = new THREE.Euler();
        this._tempVec3 = new THREE.Vector3();
        this._tempQuaternion = new THREE.Quaternion();
        this._tempColor = new THREE.Color();

        // Bound event handlers
        this._boundWindowClickCapture = this._handleWindowClickCapture.bind(this);
        this._boundOnResize = this._onResize.bind(this);
        this._boundOnClick = this._onClick.bind(this);

        this._ignoredUpdateSources = ['physicsSystem', 'spinSystem', 'input'];
    }

    // initialize, isVisible, show, hide, update, _setupEventHandlers, _handleWindowClickCapture, _subscribeToECSEvents, _onResize, _onClick, _fullSceneSync
    // (These methods remain unchanged from the previous version 1.5.3)
    async initialize(entityManager, eventEmitter, engine) {
        console.log('[ThreeRenderSystem] Initializing...');
        // --- MODIFICATION: Added dependency checks ---
        if (!entityManager) { console.error("ThreeRenderSystem: EntityManager dependency missing!"); this.active = false; return this; }
        if (!eventEmitter) { console.error("ThreeRenderSystem: EventEmitter dependency missing!"); this.active = false; return this; }
        if (!engine) { console.error("ThreeRenderSystem: Engine dependency missing!"); this.active = false; return this; }
        if (typeof engine.getAssetManager !== 'function' || !engine.getAssetManager()) {
            console.error("ThreeRenderSystem: AssetManager missing or invalid!");
            this.active = false; return this;
        }
        this.container = document.getElementById('editor-container');
        if (!this.container) {
            console.error("ThreeRenderSystem: Container 'editor-container' not found!");
            this.active = false; return this;
        }
        // --- END MODIFICATION ---

        this.entityManager = entityManager;
        this.eventEmitter = eventEmitter;
        this.engine = engine;
        this.assetManager = engine.getAssetManager();

        try {
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(engineConfig.renderer.backgroundColor);

            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            // --- MODIFICATION: Check renderer creation ---
            if (!this.renderer) throw new Error("Failed to create WebGLRenderer.");
            // --- END MODIFICATION ---
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.domElement.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; display:block; z-index:0; pointer-events:auto;';

            this.container.appendChild(this.renderer.domElement);

            this.raycaster = new THREE.Raycaster();
            this.mouse = new THREE.Vector2();
            // --- MODIFICATION: Check raycaster/mouse creation ---
            if (!this.raycaster || !this.mouse) throw new Error("Failed to create Raycaster or Vector2 for mouse.");
            // --- END MODIFICATION ---

            // Add helpers - Use engineConfig
            this.scene.add(new THREE.AxesHelper(engineConfig.renderer.axesHelperSize));
            this.scene.add(new THREE.GridHelper(
                engineConfig.renderer.gridHelperSize, engineConfig.renderer.gridHelperDivisions,
                engineConfig.renderer.gridHelperColorCenter, engineConfig.renderer.gridHelperColorGrid
            ));

            this._setupEventHandlers(); // Setup window/DOM listeners
            this._subscribeToECSEvents(); // Setup ECS listeners
            this._fullSceneSync(); // Initial sync of entities

            console.log('[ThreeRenderSystem] Initialization Complete.');
            return this;
        } catch (err) {
            console.error('[ThreeRenderSystem] Initialization failed:', err);
            this.active = false;
            // Attempt cleanup of partially created resources
            if (this.renderer && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer?.dispose();
            this.scene = null;
            this.renderer = null;
            this.orbitControls?.dispose();
            // Clear maps and listeners if partially set up
            this.entityObjects.clear();
            if(this.eventEmitter) { // Remove any listeners added before failure
                 this.eventEmitter.off('entityCreated');
                 this.eventEmitter.off('componentAdded');
                 // ... etc for all listeners in _subscribeToECSEvents
            }
            window.removeEventListener('resize', this._boundOnResize);
            this.renderer?.domElement?.removeEventListener('click', this._boundOnClick);
            window.removeEventListener('click', this._boundWindowClickCapture, true);

            return this; // Return this to allow chaining if needed, even on failure
        }
    }

    get isVisible() { return this.#visible; }
    show() { if (this.renderer) { this.#visible = true; this.renderer.domElement.style.display = 'block'; console.log('[ThreeRenderSystem] Shown.'); this._onResize( this.container?.clientWidth ?? 1, this.container?.clientHeight ?? 1 ); } }
    hide() { if (this.renderer) { this.#visible = false; this.renderer.domElement.style.display = 'none'; console.log('[ThreeRenderSystem] Hidden.'); } }

    update(time) {
         // --- MODIFICATION: Added checks ---
        if (!this.active || !this.#visible || !this.renderer || !this.scene || !this.activeCameraObject || !this.container) {
             // Log if something essential is missing, otherwise just return
             if (!this.activeCameraObject && this.#visible) console.warn("ThreeRenderSystem Update: No active camera!");
             return;
        }
        // --- END MODIFICATION ---

        const currentWidth = this.container.clientWidth ?? 0;
        const currentHeight = this.container.clientHeight ?? 0;
        const rendererSize = this.renderer.getSize(new THREE.Vector2());

        if (currentWidth > 0 && currentHeight > 0 && (rendererSize.width !== currentWidth || rendererSize.height !== currentHeight)) {
            this._onResize(currentWidth, currentHeight);
        }

        // --- MODIFICATION: Check if orbitControls exists ---
        if (this.orbitControls) {
             try { this.orbitControls.update(); } catch (e) { console.error("Error updating OrbitControls:", e); }
        }
        // --- END MODIFICATION ---

        // --- MODIFICATION: Wrap render call ---
        try {
            this.renderer.render(this.scene, this.activeCameraObject);
        } catch(renderError) {
             console.error("ThreeRenderSystem: Error during render call:", renderError);
             this.active = false; // Disable system on render error
        }
        // --- END MODIFICATION ---
    }

    _setupEventHandlers() {
        // Resize listener
        let resizeTimeout;
        this._boundOnResize = () => {
            // --- MODIFICATION: Check container ---
            if (!this.container) return;
            // --- END MODIFICATION ---
            clearTimeout(resizeTimeout);
            // Debounce resize event
            resizeTimeout = setTimeout(() => {
                if (this.container) { // Check again inside timeout
                   this._onResize( this.container.clientWidth, this.container.clientHeight );
                }
            }, 100);
        };
        window.addEventListener('resize', this._boundOnResize);

        // Click listener (for entity selection in editor mode)
        this._boundOnClick = this._onClick.bind(this);
        if (this.renderer?.domElement) {
            this.renderer.domElement.addEventListener('click', this._boundOnClick);
            console.log("[TRS] Setup event handlers: Attached _onClick listener to renderer canvas.");
        } else {
            console.error("[TRS] Setup event handlers: Renderer canvas not found, cannot attach click listener!");
        }

        // Optional: Window click capture for debugging UI interactions
        this._boundWindowClickCapture = this._handleWindowClickCapture.bind(this);
        window.addEventListener('click', this._boundWindowClickCapture, true);
        console.log("[TRS] Setup event handlers: Attached window click capture listener.");
    }

    _handleWindowClickCapture(event) { /* console.log("[WINDOW CLICK CAPTURE] Target:", event.target); */ } // Keep concise

    _subscribeToECSEvents() {
        if (!this.eventEmitter) { console.error("TRS: Cannot subscribe to ECS events, eventEmitter missing."); return; }
        console.log("[TRS] Subscribing to ECS events...");
        this.eventEmitter.on('entityCreated', ({ id }) => this._syncEntity(id));
        this.eventEmitter.on('componentAdded', ({ entityId, componentType }) => {
            if (['renderable', 'light', 'camera', 'transform'].includes(componentType)) {
                // console.log(`[TRS] Event: componentAdded (${componentType}) for entity ${entityId}. Syncing.`);
                this._syncEntity(entityId);
            }
        });
        this.eventEmitter.on('componentRemoved', ({ entityId, componentType }) => {
            if (['renderable', 'light', 'camera', 'transform'].includes(componentType)) {
                // console.log(`[TRS] Event: componentRemoved (${componentType}) for entity ${entityId}. Removing object.`);
                this._remove(entityId);
            }
            // If transform removed, remove renderable/light/camera as well
            if (componentType === 'transform') this._remove(entityId);
        });
        this.eventEmitter.on('entityUpdated', ({ id, componentType, source }) => {
            // Ignore updates originating from physics/spin systems to prevent loops
            if (source && this._ignoredUpdateSources.includes(source)) {
                return;
            }
            if (['renderable', 'light', 'camera', 'transform'].includes(componentType)) {
                // console.log(`[TRS] Event: entityUpdated (${componentType}) for entity ${id} from source '${source || 'unknown'}'. Syncing.`);
                this._syncEntity(id);
            }
        });
        this.eventEmitter.on('entityRemoved', ({ id }) => {
             // console.log(`[TRS] Event: entityRemoved, ID: ${id}. Removing object.`);
             this._remove(id);
        });
        this.eventEmitter.on('sceneImported', () => {
             console.log(`[TRS] Event: sceneImported. Performing full sync.`);
             this._fullSceneSync();
        });
        this.eventEmitter.on('entityRestored', ({ id }) => {
             // console.log(`[TRS] Event: entityRestored, ID: ${id}. Syncing.`);
             this._syncEntity(id);
        });
    }

    _onResize(width, height) {
        // --- MODIFICATION: Added checks ---
        if (!this.renderer || !this.activeCameraObject || !width || !height || width <= 0 || height <= 0) return;
        // --- END MODIFICATION ---

        try {
            this.renderer.setSize(width, height);
            const aspect = width / height;

            if (this.activeCameraObject.isPerspectiveCamera) {
                this.activeCameraObject.aspect = aspect;
            } else if (this.activeCameraObject.isOrthographicCamera) {
                const camComp = this.entityManager?.getComponent(this.activeCameraEntityId, 'camera');
                const orthoSize = camComp?.orthoSize ?? engineConfig.camera.orthoSize;
                this.activeCameraObject.left = -orthoSize * aspect;
                this.activeCameraObject.right = orthoSize * aspect;
                this.activeCameraObject.top = orthoSize;
                this.activeCameraObject.bottom = -orthoSize;
            }
            this.activeCameraObject.updateProjectionMatrix();
        } catch (e) {
             console.error("ThreeRenderSystem: Error during resize:", e);
        }
    }

    _onClick(event) {
        // --- MODIFICATION: Added checks ---
        if (!this.#visible || this.engine?.getMode() !== 'editor' || !this.activeCameraObject || !this.raycaster || !this.mouse || !this.renderer || !this.renderer.domElement) {
            // console.log("[TRS] _onClick: Aborted (hidden, not editor, or missing refs).");
            return;
        }
        // --- END MODIFICATION ---

        try {
            const rect = this.renderer.domElement.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
                // console.log("[TRS] _onClick: Click outside canvas bounds.");
                return;
            }

            // Calculate mouse position in normalized device coordinates (-1 to +1)
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            // console.log(`[TRS] _onClick: Mouse coords (NDC): ${this.mouse.x.toFixed(2)}, ${this.mouse.y.toFixed(2)}`);

            this.raycaster.setFromCamera(this.mouse, this.activeCameraObject);

            const targets = Array.from(this.entityObjects.values())
                .filter(entry => (entry.type === 'mesh' || entry.type === 'model') && entry.threeObject?.isObject3D)
                .map(entry => entry.threeObject);

            // console.log(`[TRS] _onClick: Raycasting against ${targets.length} targets.`);
            let selectedId = null;
            if (targets.length > 0) {
                const intersects = this.raycaster.intersectObjects(targets, true); // true for recursive
                // console.log(`[TRS] _onClick: Found ${intersects.length} intersections.`);
                if (intersects.length > 0) {
                    // Find the closest intersected object with a valid entity ID in its userData
                    for (const intersect of intersects) {
                        let obj = intersect.object;
                        // Traverse up the hierarchy to find the object linked to the entity
                        while (obj && obj !== this.scene) {
                            if (obj.userData && obj.userData.entityId !== undefined) {
                                // --- MODIFICATION: Check if entity actually exists ---
                                if (this.entityManager?.hasEntity(obj.userData.entityId)) {
                                    selectedId = obj.userData.entityId;
                                    // console.log(`[TRS] _onClick: Found matching entity ID ${selectedId} traversing up.`);
                                    break; // Found the entity, stop searching this intersection
                                } else {
                                    console.warn(`[TRS] _onClick: Intersected object has entityId ${obj.userData.entityId}, but entity no longer exists.`);
                                }
                                // --- END MODIFICATION ---
                            }
                            obj = obj.parent;
                        }
                        if (selectedId !== null) break; // Found the entity, stop checking other intersections
                    }
                }
            }
            // console.log(`[TRS] _onClick: Raycast determined selection should be ID: ${selectedId}. Calling engine.selectEntity.`);
            this.engine.selectEntity(selectedId); // selectEntity handles null correctly
        } catch (e) {
            console.error("ThreeRenderSystem: Error during click handling/raycasting:", e);
        }
    }

    _fullSceneSync() {
        console.log("[TRS] Performing full scene sync...");
        // --- MODIFICATION: Wrap in try/catch ---
        try {
            // Dispose existing objects
            this.entityObjects.forEach(entry => this._dispose(entry.threeObject, entry.type));
            this.entityObjects.clear();
             this._creationInProgress.clear(); // Clear creation tracking as well

            // Dispose controls if they exist
            if(this.orbitControls) {
                this.orbitControls.dispose();
                this.orbitControls = null;
            }
            this.activeCameraEntityId = null;
            this.activeCameraObject = null;

            if (this.entityManager) {
                this.entityManager.entities.forEach(id => this._syncEntity(id));
            } else {
                 console.warn("[TRS Full Sync] EntityManager not available.");
            }

            // Activate a camera if none was activated during sync
            if (!this.activeCameraObject && this.engine) {
                console.warn("[TRS Full Sync] No active camera found after sync. Activating first camera or default.");
                const cameraEntities = this.entityManager?.getEntitiesWithComponent('camera') || [];
                let activated = false;
                if (cameraEntities.length > 0) {
                    const firstCamId = cameraEntities.sort((a,b) => a - b)[0]; // Get lowest ID camera
                    // Check if the object for this camera was created during the sync loop above
                    const entry = this.entityObjects.get(firstCamId);
                     if(entry && entry.type === 'camera') {
                        // Ensure component marks it active if not already
                        const camComp = this.entityManager.getComponent(firstCamId, 'camera');
                        if (camComp && !camComp.isActive) {
                             console.log(`[TRS Full Sync] Setting camera ${firstCamId} to active via component update.`);
                             this.engine.addComponent(firstCamId, 'camera', { isActive: true });
                             // _activateCamera will be called by the resulting _syncEntity event
                             activated = true;
                        } else if (camComp && camComp.isActive) {
                             console.log(`[TRS Full Sync] Activating existing camera ${firstCamId} directly.`);
                            this._activateCamera(firstCamId, entry.threeObject); // Activate manually if component already says active
                            activated = true;
                        }
                    } else {
                        console.warn(`[TRS Full Sync] Could not activate first camera ${firstCamId} immediately, entry not ready or not a camera. Might activate via event later.`);
                        // It might get activated shortly after if the _syncEntity call was async (e.g., model load delay, though not camera)
                    }
                }

                if (!activated && cameraEntities.length === 0) { // Only critical if NO cameras exist
                    console.error("[TRS Full Sync] CRITICAL: No cameras found in the scene after full sync!");
                }
            }
            console.log(`[TRS] Full sync complete. ${this.entityObjects.size} objects in map.`);
        } catch (e) {
             console.error("ThreeRenderSystem: Error during full scene sync:", e);
             // Attempt to clear state to avoid broken visuals
             this.entityObjects.clear();
             this._creationInProgress.clear();
             this.activeCameraEntityId = null;
             this.activeCameraObject = null;
        }
        // --- END MODIFICATION ---
    }

    _syncEntity(entityId) {
        // console.log(`[TRS] _syncEntity called for ID: ${entityId}`);
        if (!this.entityManager || !this.scene) { return; }

        const hasEngineEntity = this.entityManager.hasEntity(entityId);
        const currentEntry = this.entityObjects.get(entityId);

        if (!hasEngineEntity) { if (currentEntry) { this._remove(entityId); } return; }

        const trs = this.entityManager.getComponent(entityId, 'transform');
        const rend = this.entityManager.getComponent(entityId, 'renderable');
        const light = this.entityManager.getComponent(entityId, 'light');
        const cam = this.entityManager.getComponent(entityId, 'camera');

        let intendedType = null;
        if (rend && trs) { intendedType = rend.type === 'Model' ? 'model' : 'mesh'; }
        else if (light) { intendedType = 'light'; }
        else if (cam && trs) { intendedType = 'camera'; }

        if (!intendedType) { if (currentEntry) { this._remove(entityId); } return; }
        if (!trs && (intendedType === 'mesh' || intendedType === 'model' || intendedType === 'camera' || (intendedType === 'light' && light?.type !== 'ambient'))) {
            console.warn(`[TRS._syncEntity ${entityId}] Missing TransformComponent. Removing graphics.`);
            if (currentEntry) this._remove(entityId); return;
        }

        if (!currentEntry || currentEntry.type !== intendedType) {
            // --- MODIFICATION: Check if creation is already in progress ---
            if (this._creationInProgress.has(entityId)) {
                // console.log(`[TRS _syncEntity ${entityId}] Creation already in progress, skipping new creation attempt.`);
                return; // Avoid duplicate creation attempts
            }
            // --- END MODIFICATION ---
            // console.log(`[TRS] _syncEntity ${entityId}: Creating new object of type '${intendedType}'.`);
            if (currentEntry) this._remove(entityId);
            // --- MODIFICATION: Mark creation as in progress ---
            this._creationInProgress.add(entityId);
            // --- END MODIFICATION ---
            this._createObjectForEntity(entityId, intendedType, trs, rend, light, cam);
        } else {
            // console.log(`[TRS] _syncEntity ${entityId}: Updating existing object of type '${intendedType}'.`);
            this._updateObjectForEntity(entityId, currentEntry, trs, rend, light, cam);
        }
    }

    _createObjectForEntity(entityId, intendedType, trs, rend, light, cam) {
        // console.log(`[TRS] _createObjectForEntity: Attempting to create '${intendedType}' for entity ${entityId}`);
        let newObjectPromise;
        try {
            switch(intendedType) {
                case 'mesh': newObjectPromise = Promise.resolve(this._makePrimitiveMesh(trs, rend)); break;
                case 'light': newObjectPromise = Promise.resolve(this._makeLight(trs, light)); break;
                case 'camera': newObjectPromise = Promise.resolve(this._makeCamera(trs, cam)); break;
                case 'model':
                    if (!this.assetManager || !rend?.assetPath || typeof rend.assetPath !== 'string') {
                        const missing = !this.assetManager ? 'AssetManager' : 'assetPath';
                        console.error(`[TRS Create Model ${entityId}] Cannot create 'Model': ${missing} missing or invalid.`, rend);
                        newObjectPromise = Promise.resolve(null);
                    } else {
                        const relativeAssetPath = rend.assetPath;
                        newObjectPromise = this.assetManager.load(relativeAssetPath)
                            .then(gltfData => {
                                if (!gltfData || !gltfData.scene || !gltfData.scene.isObject3D) {
                                     throw new Error(`Loaded GLTF data for "${relativeAssetPath}" is invalid or missing scene object.`);
                                }
                                const modelClone = gltfData.scene.clone(true);
                                if (trs) this._applyTransform(modelClone, trs);
                                if (rend) this._applyRenderableProps(modelClone, rend, true);
                                return modelClone;
                            })
                            .catch(error => {
                                console.error(`[TRS Create Model ${entityId}] Failed to load/process model asset "${relativeAssetPath}":`, error);
                                return null; // Resolve with null on failure
                            });
                    }
                    break;
                default:
                    console.warn(`[TRS._create] Unknown intendedType: ${intendedType}`);
                    newObjectPromise = Promise.resolve(null);
            }

            newObjectPromise.then(newObject => {
                if (!newObject || !this.scene || !this.entityManager) {
                    if (!newObject) console.warn(`[TRS Create ${intendedType} ${entityId}] Object creation failed or returned null.`);
                    // --- MODIFICATION: Always clear flag on exit ---
                    this._creationInProgress.delete(entityId);
                    // --- END MODIFICATION ---
                    return;
                }
                if (!this.entityManager.hasEntity(entityId)) {
                    console.log(`[TRS Create ${intendedType} ${entityId}] Entity removed before async creation completed. Discarding.`);
                    this._dispose(newObject, intendedType);
                    // --- MODIFICATION: Always clear flag on exit ---
                    this._creationInProgress.delete(entityId);
                    // --- END MODIFICATION ---
                    return;
                }
                // --- MODIFICATION: Removed redundant check, log kept for debug ---
                if (this.entityObjects.has(entityId)) {
                     // This *shouldn't* happen now due to the _creationInProgress flag, but log if it does
                     console.warn(`[TRS Create ${intendedType} ${entityId}] Object already exists (race condition despite flag?). Discarding new.`);
                     this._dispose(newObject, intendedType);
                     this._creationInProgress.delete(entityId); // Still clear flag
                     return;
                }
                 // --- END MODIFICATION ---

                newObject.userData = { entityId: entityId };
                this.scene.add(newObject);
                this.entityObjects.set(entityId, { entityId, threeObject: newObject, type: intendedType });
                // --- MODIFICATION: Always clear flag after adding ---
                this._creationInProgress.delete(entityId);
                // --- END MODIFICATION ---

                if (intendedType === 'camera' && cam?.isActive) {
                    if (!this.activeCameraObject || this.activeCameraEntityId !== entityId) {
                        this._activateCamera(entityId, newObject);
                    }
                }
            }).catch(error => {
                 console.error(`[TRS Create ${intendedType} ${entityId}] Error in promise handling after creation:`, error);
                 // --- MODIFICATION: Always clear flag on error ---
                 this._creationInProgress.delete(entityId);
                 // --- END MODIFICATION ---
            });

        } catch (e) {
            console.error(`[TRS._create ${intendedType} ${entityId}] Synchronous error creating object:`, e);
             // --- MODIFICATION: Always clear flag on error ---
             this._creationInProgress.delete(entityId);
             // --- END MODIFICATION ---
        }
    }

    // _updateObjectForEntity, _applyTransform, _applyRenderableProps, _updateMaterialProps, _activateCamera, _remove, _dispose, _disposeMaterial, _makePrimitiveMesh, _updatePrimitiveMesh, _makeLight, _updateLight, _configureShadows, _makeCamera, _updateCamera, _isValidTransformData, cleanup
    // (These methods remain unchanged from version 1.5.3)
    _updateObjectForEntity(entityId, currentEntry, trs, rend, light, cam) {
        const obj = currentEntry.threeObject;
        const type = currentEntry.type;

        // --- MODIFICATION: Added checks ---
        if (!obj || !obj.isObject3D) { // Check if it's a valid Three.js object
            console.warn(`[TRS._update ${type} ${entityId}] Invalid or missing threeObject in entry. Cannot update.`);
            this._remove(entityId); // Remove broken entry
            return;
        }
        // --- END MODIFICATION ---

        try {
            // Update common transform if component exists and object has transform props
            if (trs && obj.position && obj.quaternion && obj.scale) {
                 this._applyTransform(obj, trs);
            }

            // Update type-specific properties
            switch(type) {
                case 'mesh':
                    if (rend) this._updatePrimitiveMesh(obj, rend);
                    break;
                case 'model':
                    if (rend) this._applyRenderableProps(obj, rend, true); // Traverse for models
                    break;
                case 'light':
                    if (light) this._updateLight(obj, trs, light); // Pass trs for position update
                    break;
                case 'camera':
                    if (cam) this._updateCamera(obj, cam);
                    break;
            }

            // Handle camera activation/deactivation
            if (type === 'camera' && cam) {
                if (cam.isActive && (!this.activeCameraObject || this.activeCameraEntityId !== entityId)) {
                    this._activateCamera(entityId, obj);
                } else if (!cam.isActive && this.activeCameraEntityId === entityId) {
                    console.warn(`[TRS Update ${entityId}] Active camera deactivated. Need fallback logic.`);
                    if (this.orbitControls) this.orbitControls.enabled = false;
                    this.activeCameraEntityId = null;
                    this.activeCameraObject = null;
                    // TODO: Implement fallback camera activation here
                }
            }
        } catch (e) {
             console.error(`[TRS._update ${type} ${entityId}] Error updating object:`, e);
        }
    }

     /** @private Helper to apply transform component data to a THREE object */
    _applyTransform(obj, trs) {
         // --- MODIFICATION: Added validation ---
         if (!trs || !obj) return;
         let needsUpdate = false;
         try {
             if (Array.isArray(trs.position) && trs.position.length === 3 && trs.position.every(n => typeof n === 'number')) {
                  if (!obj.position.equals(this._tempVec3.fromArray(trs.position))) {
                       obj.position.fromArray(trs.position); needsUpdate = true;
                  }
             } else console.warn(`[TRS ApplyTransform ${obj.userData?.entityId}] Invalid position data:`, trs.position);

             if (Array.isArray(trs.rotation) && trs.rotation.length === 3 && trs.rotation.every(n => typeof n === 'number')) {
                  this._tempEuler.set(
                       THREE.MathUtils.degToRad(trs.rotation[0]),
                       THREE.MathUtils.degToRad(trs.rotation[1]),
                       THREE.MathUtils.degToRad(trs.rotation[2]),
                       'XYZ' // Consistent order
                  );
                  this._tempQuaternion.setFromEuler(this._tempEuler);
                  // Use angleTo for comparison to avoid precision issues with direct quaternion comparison
                  if (obj.quaternion.angleTo(this._tempQuaternion) > 1e-4) {
                       obj.quaternion.copy(this._tempQuaternion); needsUpdate = true;
                  }
             } else console.warn(`[TRS ApplyTransform ${obj.userData?.entityId}] Invalid rotation data:`, trs.rotation);

             if (Array.isArray(trs.scale) && trs.scale.length === 3 && trs.scale.every(n => typeof n === 'number')) {
                  if (!obj.scale.equals(this._tempVec3.fromArray(trs.scale))) {
                       obj.scale.fromArray(trs.scale); needsUpdate = true;
                  }
             } else console.warn(`[TRS ApplyTransform ${obj.userData?.entityId}] Invalid scale data:`, trs.scale);

             if (needsUpdate) obj.updateMatrixWorld(); // Update world matrix if local changed
         } catch (e) {
              console.error(`[TRS ApplyTransform ${obj.userData?.entityId}] Error applying transform:`, e, trs);
         }
         // --- END MODIFICATION ---
    }

    /** @private Helper to apply renderable component data to a THREE object/group */
    _applyRenderableProps(obj, rend, traverse = false) {
         // --- MODIFICATION: Added validation ---
         if (!rend || !obj) return;
         try {
             const newVisibility = rend.visible ?? engineConfig.renderable.visible;
             if (obj.visible !== newVisibility) obj.visible = newVisibility;

             const cast = rend.castShadow ?? engineConfig.renderable.castShadow;
             const receive = rend.receiveShadow ?? engineConfig.renderable.receiveShadow;

             if (traverse && typeof obj.traverse === 'function') {
                 obj.traverse((child) => {
                     if (child.isMesh) {
                         if (child.castShadow !== cast) child.castShadow = cast;
                         if (child.receiveShadow !== receive) child.receiveShadow = receive;
                         // Update material on child meshes if appropriate (e.g., for models without per-mesh materials)
                         // Note: This assumes the model uses standard materials that match primitive props
                         if (child.material && child.material.isMeshStandardMaterial) {
                             this._updateMaterialProps(child.material, rend);
                         }
                     }
                 });
             } else if (obj.isMesh) { // Apply directly if obj itself is the mesh
                 if (obj.castShadow !== cast) obj.castShadow = cast;
                 if (obj.receiveShadow !== receive) obj.receiveShadow = receive;
                 if (obj.material && obj.material.isMeshStandardMaterial) {
                     this._updateMaterialProps(obj.material, rend);
                 }
             }
         } catch(e) {
              console.error(`[TRS ApplyRenderable ${obj.userData?.entityId}] Error applying properties:`, e, rend);
         }
         // --- END MODIFICATION ---
    }

     /** @private Helper to update MeshStandardMaterial properties */
    _updateMaterialProps(mat, rend) {
         // --- MODIFICATION: Added validation ---
         if (!mat || !rend || !mat.isMeshStandardMaterial) return;
         try {
             // Use defaults from engineConfig if component property is missing
             const color = rend.color ?? engineConfig.renderable.color;
             const roughness = rend.roughness ?? engineConfig.renderable.roughness;
             const metalness = rend.metalness ?? engineConfig.renderable.metalness;

             // Special handling for Ground type defaults (if needed, though usually handled in _make/_updatePrimitive)
             // const type = rend.type ?? 'Cube';
             // const targetColor = (type === 'Ground') ? engineConfig.renderable.defaultGroundColor : color;
             // const targetRoughness = (type === 'Ground') ? engineConfig.renderable.defaultGroundRoughness : roughness;
             const targetColor = color;
             const targetRoughness = roughness;


             if (mat.color.getHex() !== targetColor) {
                  mat.color.set(targetColor);
             }
             if (Math.abs(mat.roughness - targetRoughness) > 1e-5) {
                  mat.roughness = targetRoughness;
             }
             if (Math.abs(mat.metalness - metalness) > 1e-5) {
                  mat.metalness = metalness;
             }
         } catch(e) {
             console.error(`[TRS UpdateMaterialProps] Error applying material props:`, e, rend);
         }
         // --- END MODIFICATION ---
    }


    _activateCamera(entityId, cameraObject) {
        // --- MODIFICATION: Added checks ---
        if (!this.renderer?.domElement || !cameraObject || !cameraObject.isCamera) {
            console.warn(`[TRS] Attempted to activate invalid camera object for entity ${entityId}`);
            return;
        }
        // --- END MODIFICATION ---

        console.log(`[TRS] Activating camera for entity ${entityId}`);
        this.activeCameraEntityId = entityId;
        this.activeCameraObject = cameraObject;

        // Ensure camera projection is up-to-date with current aspect ratio
        const width = this.container?.clientWidth ?? 1;
        const height = this.container?.clientHeight ?? 1;
        this._onResize(width, height); // Call resize to set aspect/projection

        try {
            if (!this.orbitControls) {
                this.orbitControls = new OrbitControls(this.activeCameraObject, this.renderer.domElement);
                this.orbitControls.enableDamping = true;
                this.orbitControls.dampingFactor = 0.05;
                console.log('[TRS] OrbitControls created.');
            } else {
                // Update object and DOM element if they changed (unlikely but possible)
                if (this.orbitControls.object !== this.activeCameraObject) {
                    this.orbitControls.object = this.activeCameraObject;
                }
                if (this.orbitControls.domElement !== this.renderer.domElement) {
                    console.warn("[TRS] OrbitControls DOM element changed? Re-attaching.");
                    this.orbitControls.dispose(); // Dispose old listeners
                    this.orbitControls = new OrbitControls(this.activeCameraObject, this.renderer.domElement);
                    this.orbitControls.enableDamping = true; this.orbitControls.dampingFactor = 0.05;
                }
            }
            // Enable/disable controls based on engine mode
            this.orbitControls.enabled = (this.engine?.getMode() === 'editor');
            this.orbitControls.update(); // Initial update
        } catch (e) {
             console.error("ThreeRenderSystem: Error creating or updating OrbitControls:", e);
             if(this.orbitControls) this.orbitControls.dispose();
             this.orbitControls = null; // Nullify on error
        }


        this.eventEmitter?.emit('activeCameraChanged', { entityId, cameraObject: this.activeCameraObject });
    }

    _remove(entityId) {
        // console.log(`[TRS] _remove called for entity ID: ${entityId}`);
        const entry = this.entityObjects.get(entityId);
        if (entry) {
            // console.log(`[TRS] Found entry for ${entityId}, disposing object type '${entry.type}'.`);
            this._dispose(entry.threeObject, entry.type); // Dispose resources
            this.entityObjects.delete(entityId); // Remove from map
            // console.log(`[TRS] Removed entry for ${entityId} from entityObjects map. Size now: ${this.entityObjects.size}`);

            // If the removed entity was the active camera, deactivate it
            if (this.activeCameraEntityId === entityId) {
                console.log(`[TRS] Active camera entity ${entityId} removed.`);
                this.activeCameraEntityId = null;
                this.activeCameraObject = null;
                if (this.orbitControls) {
                     this.orbitControls.enabled = false; // Disable controls
                     // Optionally dispose and nullify controls? Depends on fallback logic.
                     // this.orbitControls.dispose();
                     // this.orbitControls = null;
                }
                // TODO: Need logic here to activate a different camera if available
            }
        } else {
            // console.log(`[TRS] _remove: No entry found in entityObjects map for ID: ${entityId}`);
        }
    }

    _dispose(obj, type) {
        // --- MODIFICATION: Added check ---
        if (!obj || !obj.isObject3D) return;
        // --- END MODIFICATION ---

        // Remove from parent (which should be the scene or another tracked object)
        obj.removeFromParent();

        // Dispose geometries and materials recursively for meshes/models
        if ((type === 'mesh' || type === 'model') && typeof obj.traverse === 'function') {
            obj.traverse((child) => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => this._disposeMaterial(mat));
                        } else {
                            this._disposeMaterial(child.material);
                        }
                    }
                }
            });
        } else if (type === 'light' && obj.isLight) {
            // Dispose shadow map texture if it exists
            if (obj.shadow?.map) {
                obj.shadow.map.dispose();
            }
        }
        // Note: Cameras don't typically have resources needing manual disposal beyond being removed from scene.
    }

    _disposeMaterial(material) {
        // --- MODIFICATION: Added check ---
        if (!material || !material.dispose) return; // Check if material and dispose exist
        // --- END MODIFICATION ---

        // Dispose textures used by the material
        for (const key of Object.keys(material)) {
            const value = material[key];
            if (value instanceof THREE.Texture) {
                value.dispose();
            }
        }
        // Dispose the material itself
        material.dispose();
    }

    _makePrimitiveMesh(trs, rend) {
        // --- MODIFICATION: Added validation ---
        if (!trs || !rend) { console.warn("[TRS._makePrimitiveMesh] Missing transform or renderable component data."); return null; }
        if (!this._isValidTransformData(trs)) { console.warn("[TRS._makePrimitiveMesh] Invalid transform data:", trs); return null; }
        // --- END MODIFICATION ---

        const type = rend.type ?? engineConfig.renderable.type ?? 'Cube';
        const color = (type === 'Ground') ? engineConfig.renderable.defaultGroundColor : (rend.color ?? engineConfig.renderable.color);
        const visible = rend.visible ?? engineConfig.renderable.visible;

        let geometry;
        try {
            switch (type) {
                case 'Cube': case 'Ground': geometry = new THREE.BoxGeometry(1, 1, 1); break;
                case 'Sphere': geometry = new THREE.SphereGeometry(0.5, 32, 16); break;
                default:
                    console.warn(`[TRS] Unknown primitive type '${type}'. Defaulting to Cube.`);
                    geometry = new THREE.BoxGeometry(1, 1, 1); break;
            }
            if (!geometry) throw new Error("Geometry creation failed.");

            const mat = new THREE.MeshStandardMaterial();
            this._updateMaterialProps(mat, rend); // Use helper to set initial props

            const mesh = new THREE.Mesh(geometry, mat);
            this._applyTransform(mesh, trs); // Use helper
            this._applyRenderableProps(mesh, rend, false); // Apply visibility, shadows

            return mesh;
        } catch (e) {
            console.error(`[TRS MakePrimitive ${type}] Error creating mesh:`, e);
            geometry?.dispose(); // Dispose geometry if created before error
            return null;
        }
    }

    _updatePrimitiveMesh(mesh, rend) {
        // --- MODIFICATION: Added validation ---
        if (!mesh || !mesh.isMesh || !rend) {
            console.warn("[TRS._updatePrimitiveMesh] Invalid mesh object or missing renderable data.", {mesh, rend});
            return;
        }
        // --- END MODIFICATION ---
        // Use helpers for consistency
        this._applyRenderableProps(mesh, rend, false); // Updates visibility, shadows, material via _updateMaterialProps
    }

    _makeLight(trs, lt) {
        // --- MODIFICATION: Added validation ---
        if (!lt) { console.warn("[TRS._makeLight] Missing light component data."); return null; }
        const type = lt.type ?? engineConfig.light.type ?? 'directional';
        if (type !== 'ambient' && (!trs || !this._isValidTransformData(trs))) {
             console.warn(`[TRS._makeLight ${type}] Missing or invalid transform component data.`, trs);
             // Allow creation for ambient, otherwise fail
             if (type !== 'ambient') return null;
        }
        // --- END MODIFICATION ---

        let intensity; // Determine default based on type
        switch(type) { case 'ambient': intensity = lt.intensity ?? engineConfig.light.ambientIntensity; break; case 'directional': intensity = lt.intensity ?? engineConfig.light.directionalIntensity; break; default: intensity = lt.intensity ?? engineConfig.light.intensity; break; }
        const color = lt.color ?? engineConfig.light.color;
        const distance = lt.distance ?? engineConfig.light.distance;
        const decay = lt.decay ?? engineConfig.light.decay;
        const castShadow = (type !== 'ambient') ? (lt.castShadow ?? engineConfig.light.castShadow) : false;

        let light;
        try {
            switch (type) {
                case 'directional':
                    light = new THREE.DirectionalLight(color, intensity);
                    if (castShadow) this._configureShadows(light, 'directional');
                    break;
                case 'point':
                    light = new THREE.PointLight(color, intensity, distance, decay);
                    if (castShadow) this._configureShadows(light, 'point', distance);
                    break;
                case 'ambient':
                    light = new THREE.AmbientLight(color, intensity);
                    break;
                default: throw new Error(`Unknown light type '${type}'`);
            }

            if (!light) throw new Error("Light object creation failed.");

            light.castShadow = castShadow; // Set shadow casting after potential configuration

            // Apply transform only if it exists and is not ambient
            if (trs && !light.isAmbientLight) {
                 this._applyTransform(light, trs);
            }
            return light;
        } catch (e) {
             console.error(`[TRS MakeLight ${type}] Error creating light:`, e);
             return null;
        }
    }

    _updateLight(light, trs, lt) {
        // --- MODIFICATION: Added validation ---
        if (!light || !light.isLight || !lt) {
             console.warn("[TRS._updateLight] Invalid light object or missing component data.", {light, lt});
             return;
        }
        const type = lt.type ?? engineConfig.light.type ?? 'directional';
        // Check if light type matches component type (cannot change light type after creation)
        if ((type === 'ambient' && !light.isAmbientLight) || (type === 'directional' && !light.isDirectionalLight) || (type === 'point' && !light.isPointLight)) {
            console.warn(`[TRS UpdateLight ${light.userData?.entityId}] Light type changed from ${light.type} to ${type}. Requires recreation (manual for now).`);
            return; // Cannot update type, needs recreate
        }
        // --- END MODIFICATION ---

        try {
            // Determine intensity default based on type
            let intensity; switch(type) { case 'ambient': intensity = lt.intensity ?? engineConfig.light.ambientIntensity; break; case 'directional': intensity = lt.intensity ?? engineConfig.light.directionalIntensity; break; default: intensity = lt.intensity ?? engineConfig.light.intensity; break; }
            const color = lt.color ?? engineConfig.light.color;
            const castShadow = (type !== 'ambient') ? ((lt.castShadow !== undefined) ? lt.castShadow : engineConfig.light.castShadow) : false;

            // Update common properties
            if (light.color?.getHex() !== color) light.color.set(color);
            if (light.intensity !== undefined && Math.abs(light.intensity - intensity) > 1e-5) light.intensity = intensity;
            if (light.castShadow !== undefined && light.castShadow !== castShadow) light.castShadow = castShadow;

            // Update PointLight specific properties
            if (light.isPointLight) {
                const distance = lt.distance ?? engineConfig.light.distance;
                const decay = lt.decay ?? engineConfig.light.decay;
                if (light.distance !== distance) light.distance = distance;
                if (light.decay !== decay) light.decay = decay;
                // Update shadow camera far plane based on distance if needed
                const targetFar = distance > 0 ? distance : 50; // Use 50 as default if distance is 0 (infinite)
                if(light.shadow && Math.abs(light.shadow.camera.far - targetFar) > 1e-5) {
                    light.shadow.camera.far = targetFar;
                    light.shadow.camera.updateProjectionMatrix();
                }
            }

            // Update position if transform provided and not ambient
            if (trs && !light.isAmbientLight) {
                 this._applyTransform(light, trs); // Use helper
            }
        } catch (e) {
             console.error(`[TRS UpdateLight ${light.userData?.entityId}] Error updating light properties:`, e, lt);
        }
    }

    /** @private Helper to configure shadow properties */
    _configureShadows(light, type, distance = 0) {
         if (!light || !light.shadow) return;
         light.shadow.mapSize.width = 1024; light.shadow.mapSize.height = 1024;
         light.shadow.camera.near = 0.5;
         light.shadow.camera.far = 50; // Default far
         if (type === 'directional') {
              light.shadow.camera.left = -15; light.shadow.camera.right = 15;
              light.shadow.camera.top = 15; light.shadow.camera.bottom = -15;
         } else if (type === 'point') {
              light.shadow.camera.far = distance > 0 ? distance : 50; // Use distance for point light far plane
         }
         // light.shadow.bias = -0.001; // Adjust bias if needed
    }


    _makeCamera(trs, cam) {
        // --- MODIFICATION: Added validation ---
        if (!trs || !cam) { console.warn("[TRS._makeCamera] Missing transform or camera component data."); return null; }
        if (!this._isValidTransformData(trs)) { console.warn("[TRS._makeCamera] Invalid transform data structure:", trs); return null; }
        if (!this.container) { console.warn("[TRS._makeCamera] Container missing, cannot calculate aspect ratio."); return null; }
        // --- END MODIFICATION ---

        const aspect = (this.container.clientWidth ?? 1) / (this.container.clientHeight ?? 1);
        const type = cam.type ?? engineConfig.camera.type ?? 'perspective';
        const near = cam.near ?? engineConfig.camera.near;
        const far = cam.far ?? engineConfig.camera.far;

        let camera;
        try {
            if (type === 'perspective') {
                const fov = cam.fov ?? engineConfig.camera.fov;
                camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
            } else if (type === 'orthographic') {
                const orthoSize = cam.orthoSize ?? engineConfig.camera.orthoSize;
                camera = new THREE.OrthographicCamera( -orthoSize * aspect, orthoSize * aspect, orthoSize, -orthoSize, near, far );
            } else {
                throw new Error(`Unknown camera type '${type}'. Defaulting to perspective.`);
            }
             if (!camera) throw new Error("Camera object creation failed.");

             this._applyTransform(camera, trs); // Use helper
             camera.updateProjectionMatrix(); // Initial update
             return camera;
        } catch (e) {
             console.error(`[TRS MakeCamera ${type}] Error creating camera:`, e);
             // Fallback to default perspective camera if creation failed
             if (!camera) camera = new THREE.PerspectiveCamera(engineConfig.camera.fov, aspect, near, far);
             camera.position.set(0,1,5); camera.lookAt(0,0,0); // Default position/lookAt
             camera.updateProjectionMatrix();
             return camera; // Return fallback
        }
    }

    _updateCamera(camera, cam) {
        // --- MODIFICATION: Added validation ---
        if (!camera || !camera.isCamera || !cam) {
            console.warn("[TRS._updateCamera] Invalid camera object or missing component data.", {camera, cam});
            return;
        }
        if (!this.container) { console.warn("[TRS._updateCamera] Container missing, cannot calculate aspect ratio."); return; }
        // --- END MODIFICATION ---

        try {
            const near = cam.near ?? engineConfig.camera.near;
            const far = cam.far ?? engineConfig.camera.far;
            let needsUpdate = false;

            if (Math.abs(camera.near - near) > 1e-5) { camera.near = near; needsUpdate = true; }
            if (Math.abs(camera.far - far) > 1e-5) { camera.far = far; needsUpdate = true; }

            const aspect = (this.container.clientWidth ?? 1) / (this.container.clientHeight ?? 1);

            if (camera.isPerspectiveCamera) {
                const fov = cam.fov ?? engineConfig.camera.fov;
                if (Math.abs(camera.fov - fov) > 1e-5) { camera.fov = fov; needsUpdate = true; }
                if (Math.abs(camera.aspect - aspect) > 1e-6) { camera.aspect = aspect; needsUpdate = true; }
            } else if (camera.isOrthographicCamera) {
                const orthoSize = cam.orthoSize ?? engineConfig.camera.orthoSize;
                const expectedLeft = -orthoSize * aspect; const expectedTop = orthoSize;
                if (camera.left !== expectedLeft || camera.right !== -expectedLeft || camera.top !== expectedTop || camera.bottom !== -expectedTop) {
                    camera.left = expectedLeft; camera.right = -expectedLeft;
                    camera.top = expectedTop; camera.bottom = -expectedTop;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                camera.updateProjectionMatrix();
            }
            // Transform is handled by _updateObjectForEntity -> _applyTransform
        } catch (e) {
             console.error(`[TRS UpdateCamera ${camera.userData?.entityId}] Error updating camera properties:`, e, cam);
        }
    }

    /** @private Helper to check if transform data is structurally valid */
    _isValidTransformData(trs) {
        return trs &&
               Array.isArray(trs.position) && trs.position.length === 3 &&
               Array.isArray(trs.rotation) && trs.rotation.length === 3 &&
               Array.isArray(trs.scale) && trs.scale.length === 3;
    }

    cleanup() {
        console.log("Cleaning up ThreeRenderSystem...");
        // Unsubscribe from ECS events
        if (this.eventEmitter) {
            this.eventEmitter.off('entityCreated'); this.eventEmitter.off('componentAdded');
            this.eventEmitter.off('componentRemoved'); this.eventEmitter.off('entityUpdated');
            this.eventEmitter.off('entityRemoved'); this.eventEmitter.off('sceneImported');
            this.eventEmitter.off('entityRestored'); this.eventEmitter.off('activeCameraChanged');
        }
        // Remove DOM listeners
        window.removeEventListener('resize', this._boundOnResize);
        if (this.renderer?.domElement) {
            this.renderer.domElement.removeEventListener('click', this._boundOnClick);
            // console.log("[TRS] Cleanup: Removed _onClick listener.");
        }
        window.removeEventListener('click', this._boundWindowClickCapture, true);
        // console.log("[TRS] Cleanup: Removed window click capture listener.");

        // Dispose THREE resources
        this.entityObjects.forEach(entry => this._dispose(entry.threeObject, entry.type));
        this.entityObjects.clear();
        this._creationInProgress.clear(); // Clear tracking set
        this.orbitControls?.dispose(); // Dispose controls if they exist
        this.renderer?.dispose(); // Dispose renderer resources

        // Remove canvas from DOM
        if (this.renderer?.domElement?.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }

        // Nullify references
        this.scene = null; this.renderer = null; this.activeCameraObject = null;
        this.orbitControls = null; this.raycaster = null; this.mouse = null;
        this.entityManager = null; this.eventEmitter = null; this.engine = null;
        this.assetManager = null; this.container = null; this.activeCameraEntityId = null;
        this.#visible = false; // Reset visibility state
        console.log("ThreeRenderSystem Cleaned Up.");
    }
}