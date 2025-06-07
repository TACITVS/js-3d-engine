// src/systems/physics/rapier-physics-system.js
// @version 1.2.8 - Removed dependency on RenderableComponent/render object for physics body creation.
// @previous 1.2.7 - Added detailed logging to applyImpulse and getLinearVelocity.

import * as THREE from 'three';
import { engineConfig } from '../../engine-config.js';

export class RapierPhysicsSystem {
    constructor(engine, RAPIER_INSTANCE, worldInstance) {
        this.priority = 50; this.active = true; this._name = 'physics';
        if (!engine || !RAPIER_INSTANCE || !worldInstance) { throw new Error("RapierPhysicsSystem requires engine, RAPIER, and world instances."); }
        this.engine = engine;
        /** @type {import('@dimforge/rapier3d-compat')} */
        this.RAPIER = RAPIER_INSTANCE;
        /** @type {import('@dimforge/rapier3d-compat').World} */
        this.world = worldInstance;
        /** @type {import('@dimforge/rapier3d-compat').EventQueue} */
        this.eventQueue = new this.RAPIER.EventQueue(true);
        /** @type {Map<number, number>} Map Entity ID -> RigidBody Handle */
        this.entityBodyMap = new Map();
        /** @type {Map<number, number>} Map Entity ID -> Collider Handle */
        this.entityColliderMap = new Map();
         /** @type {Map<number, number>} Map Collider Handle -> Entity ID */
        this.colliderEntityMap = new Map();

        // Reusable THREE objects
        this._tempVec3 = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._tempEuler = new THREE.Euler();

        // Bind methods that might be used as callbacks
        this.syncEntityPhysics = this.syncEntityPhysics.bind(this);
        this.removePhysicsBody = this.removePhysicsBody.bind(this);
        this.syncInitialScene = this.syncInitialScene.bind(this);
    }

    async initialize(entityManager, eventEmitter, engineInstance) {
        const emitter = this.engine.getEventEmitter();
        if (!emitter) { console.error("RapierPhysicsSystem: EventEmitter not found on engine!"); return; }
        console.log("RapierPhysicsSystem: Initializing and attaching event listeners...");
        emitter.on('componentAdded', ({ entityId, componentType }) => {
            // --- MODIFICATION: Only require physics and transform ---
            if (componentType === 'physics' || componentType === 'transform') {
                const em = this.engine?.entityManager;
                // Check if BOTH required components are now present
                if (em?.hasComponent(entityId, 'physics') && em?.hasComponent(entityId, 'transform'))
                {
                    this.syncEntityPhysics(entityId);
                }
            }
            // --- END MODIFICATION ---
        });
        emitter.on('componentRemoved', ({ entityId, componentType }) => {
            // --- MODIFICATION: Remove physics body if physics or transform removed ---
            if (componentType === 'physics' || componentType === 'transform') {
                 this.removePhysicsBody(entityId);
            }
            // --- END MODIFICATION ---
        });
        emitter.on('entityRemoved', ({ id }) => this.removePhysicsBody(id));
        emitter.on('sceneImported', () => this.syncInitialScene());
        emitter.on('entityRestored', ({ id }) => this.syncEntityPhysics(id));
        console.log("RapierPhysicsSystem: Initialization complete.");
    }

    removePhysicsBody(entityId) {
        // console.log(`[Rapier Sys] removePhysicsBody called for Entity ID: ${entityId}`); // Keep commented unless debugging removal
        if (!this.world) {
            // console.log(`[Rapier Sys Remove ${entityId}] World not available, clearing maps only.`);
            this.entityBodyMap.delete(entityId);
            const cH = this.entityColliderMap.get(entityId);
            if (cH !== undefined) {
                this.colliderEntityMap.delete(cH);
                this.entityColliderMap.delete(entityId);
            }
            return;
        }
        const rBH = this.entityBodyMap.get(entityId);
        if (rBH !== undefined) {
            // console.log(`[Rapier Sys Remove ${entityId}] Found RigidBody handle ${rBH}.`);
            const body = this.world.getRigidBody(rBH);
            if (body) {
                // console.log(`[Rapier Sys Remove ${entityId}] Found RigidBody object.`);
                const cH = this.entityColliderMap.get(entityId);
                if (cH !== undefined) {
                    // console.log(`[Rapier Sys Remove ${entityId}] Found Collider handle ${cH}.`);
                    const c = this.world.getCollider(cH);
                    if (c) {
                        // console.log(`[Rapier Sys Remove ${entityId}] Removing Collider object.`);
                        this.world.removeCollider(c, false); // false = don't wake neighbours? Check API if needed
                    } else {
                        // console.log(`[Rapier Sys Remove ${entityId}] Collider object not found for handle ${cH}.`);
                    }
                    this.colliderEntityMap.delete(cH);
                    this.entityColliderMap.delete(entityId);
                } else {
                    // console.log(`[Rapier Sys Remove ${entityId}] No Collider handle found in map.`);
                }
                // console.log(`[Rapier Sys Remove ${entityId}] Removing RigidBody object.`);
                this.world.removeRigidBody(body);
            } else {
                // console.log(`[Rapier Sys Remove ${entityId}] RigidBody object not found for handle ${rBH}.`);
            }
            this.entityBodyMap.delete(entityId);
        } else {
            // console.log(`[Rapier Sys Remove ${entityId}] No RigidBody handle found in map.`);
            // Still check for lingering collider maps just in case state is inconsistent
            const cH = this.entityColliderMap.get(entityId);
            if (cH !== undefined) {
                // console.log(`[Rapier Sys Remove ${entityId}] Found lingering Collider handle ${cH}, removing from maps.`);
                this.colliderEntityMap.delete(cH);
                this.entityColliderMap.delete(entityId);
            }
        }
    }

    syncInitialScene() {
         console.log("RapierPhysicsSystem: Performing full scene sync...");
         const entitiesToRemove = Array.from(this.entityBodyMap.keys());
         // console.log(`[Rapier Sync] Removing ${entitiesToRemove.length} existing bodies...`);
         entitiesToRemove.forEach(id => this.removePhysicsBody(id));
         this.entityBodyMap.clear(); this.entityColliderMap.clear(); this.colliderEntityMap.clear();

         if (!this.engine || !this.engine.entityManager) { console.warn("RapierPhysicsSystem: Engine/EM unavailable for full sync."); return; }
         const em = this.engine.entityManager;
         // --- MODIFICATION: Query only for physics and transform ---
         const physicsEntities = em.getEntitiesWithComponents(['physics', 'transform']);
         // --- END MODIFICATION ---
         console.log(`[Rapier Sync] Found ${physicsEntities.length} entities with physics & transform components.`);
         physicsEntities.forEach(id => this.syncEntityPhysics(id));
         console.log(`RapierPhysicsSystem: Full scene sync complete. Attempted sync for ${physicsEntities.length} entities.`);
     }

    syncEntityPhysics(entityId) {
        // console.log(`[Physics Sync ${entityId}] Starting sync...`); // Keep commented unless debugging sync
        if (!this.engine || !this.engine.entityManager || !this.world) { return; }
        const em = this.engine.entityManager;
        if (!em.hasEntity(entityId)) {
            // console.log(`[Physics Sync ${entityId}] Entity no longer exists. Removing physics body.`);
            this.removePhysicsBody(entityId);
            return;
        }

        const physicsComp = em.getComponent(entityId, 'physics');
        const transformComp = em.getComponent(entityId, 'transform');

        // --- MODIFICATION: Removed dependency on RenderableComponent ---
        // const renderableComp = em.getComponent(entityId, 'renderable'); // REMOVED

        if (!physicsComp || !transformComp) {
            // If required components are missing, ensure any existing physics body is removed
            // console.log(`[Physics Sync ${entityId}] Missing physics or transform component. Removing physics body.`);
            this.removePhysicsBody(entityId);
            return;
        }
        // --- END MODIFICATION ---

        // --- MODIFICATION: Removed check for renderer object existence ---
        // const renderer = this.engine.getSystem('renderer');
        // const renderObjectExists = renderer?.entityObjects?.has(entityId);
        // if (!renderObjectExists) {
        //     console.log(`[Physics Sync ${entityId}] Deferring: Renderer object not found yet.`);
        //     if (this.entityBodyMap.has(entityId)) { this.removePhysicsBody(entityId); }
        //     return;
        // }
        // --- END MODIFICATION ---

        let rigidBodyHandle = this.entityBodyMap.get(entityId);
        let rigidBody = rigidBodyHandle !== undefined ? this.world.getRigidBody(rigidBodyHandle) : null;
        const targetBodyType = this._getRapierBodyType(physicsComp.bodyType);
        const targetIsStatic = (targetBodyType === this.RAPIER.RigidBodyType.Fixed);
        let needsRecreation = false;

        if (rigidBody) { if (rigidBody.bodyType() !== targetBodyType) { needsRecreation = true; } }
        else { needsRecreation = true; }

        if (needsRecreation) {
            // console.log(`[Physics Sync ${entityId}] Needs Recreation (Existing: ${!!rigidBody}, TargetType: ${targetBodyType})`);
            if (rigidBody) { this.removePhysicsBody(entityId); }
            const bodyDesc = this._createBodyDesc(physicsComp, transformComp, targetIsStatic);
            if (!bodyDesc) { console.error(`[Physics Sync ${entityId}] Failed to create BodyDesc.`); return; }
            rigidBody = this.world.createRigidBody(bodyDesc);
            if (!rigidBody) { console.error(`[Physics Sync ${entityId}] Failed to create RigidBody.`); return; }
            rigidBodyHandle = rigidBody.handle;
            this.entityBodyMap.set(entityId, rigidBodyHandle);
            // console.log(`[Physics Sync ${entityId}] Created new RigidBody handle ${rigidBodyHandle}`);

            const currentColliderHandle = this.entityColliderMap.get(entityId);
            if (currentColliderHandle !== undefined) { const c = this.world.getCollider(currentColliderHandle); if(c) this.world.removeCollider(c, false); this.entityColliderMap.delete(entityId); this.colliderEntityMap.delete(currentColliderHandle); }

            // --- MODIFICATION: Pass transformComp instead of renderableComp ---
            const colliderDesc = this._createColliderDesc(physicsComp, transformComp);
            // --- END MODIFICATION ---
            if (colliderDesc) {
                 const collider = this.world.createCollider(colliderDesc, rigidBody);
                 if (!collider) { console.error(`[Physics Sync ${entityId}] Failed to create Collider.`); return; }
                 this.entityColliderMap.set(entityId, collider.handle);
                 this.colliderEntityMap.set(collider.handle, entityId);
                 // console.log(`[Physics Sync ${entityId}] Created new Collider handle ${collider.handle}`);
            } else { console.warn(`[Physics Sync ${entityId}] Failed to create ColliderDesc.`); }

            // Reset rotation if becoming static
            if (targetIsStatic) {
                if (transformComp.rotation[0] !== 0 || transformComp.rotation[1] !== 0 || transformComp.rotation[2] !== 0) {
                     // console.log(`[Physics Sync ${entityId}] Body is static, resetting rotation in TransformComponent.`);
                     this.engine.addComponent(entityId, 'transform', { rotation: [0, 0, 0], source: 'physicsSystem_StaticReset' });
                }
            }

        } else if (rigidBody) { // Update existing body
            // console.log(`[Physics Sync ${entityId}] Updating existing RigidBody ${rigidBodyHandle}`);
            // Update position/rotation FROM transform component TO physics body
            // (Only if not controlled by physics simulation itself, e.g., for kinematic or initial static placement)
            // If the body is dynamic, physics system update loop will sync FROM physics TO transform
            if (!body.isDynamic()) {
                rigidBody.setTranslation({ x: transformComp.position[0], y: transformComp.position[1], z: transformComp.position[2] }, true);
                if (!targetIsStatic) { // Only set rotation for non-static
                    const q = this._tempQuat.setFromEuler(this._tempEuler.set(THREE.MathUtils.degToRad(transformComp.rotation[0]), THREE.MathUtils.degToRad(transformComp.rotation[1]), THREE.MathUtils.degToRad(transformComp.rotation[2]), 'XYZ'));
                    rigidBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
                }
            }

            // Update physics properties if changed
            if (!targetIsStatic) {
                const targetLinDamping = physicsComp.linearDamping ?? engineConfig.physics.linearDamping; if (Math.abs(rigidBody.linearDamping() - targetLinDamping) > 1e-5) rigidBody.setLinearDamping(targetLinDamping);
                const targetAngDamping = physicsComp.angularDamping ?? engineConfig.physics.angularDamping; if (Math.abs(rigidBody.angularDamping() - targetAngDamping) > 1e-5) rigidBody.setAngularDamping(targetAngDamping);
            }
             if (rigidBody.isCcdEnabled() !== (physicsComp.ccdEnabled ?? engineConfig.physics.ccdEnabled)) { rigidBody.enableCcd(physicsComp.ccdEnabled ?? engineConfig.physics.ccdEnabled); }

             // Update Collider properties
             const currentColliderHandle = this.entityColliderMap.get(entityId);
             if (currentColliderHandle !== undefined) {
                 const collider = this.world.getCollider(currentColliderHandle);
                 if (collider) {
                     const targetSensor = physicsComp.isSensor ?? engineConfig.physics.isSensor; if (collider.isSensor() !== targetSensor) collider.setSensor(targetSensor);
                     const targetFriction = physicsComp.friction ?? engineConfig.physics.friction; if (Math.abs(collider.friction() - targetFriction) > 1e-5) collider.setFriction(targetFriction);
                     const targetRestitution = physicsComp.restitution ?? engineConfig.physics.restitution; if (Math.abs(collider.restitution() - targetRestitution) > 1e-5) collider.setRestitution(targetRestitution);
                     // TODO: Update collider size/shape if transform.scale changed - requires recreation
                     // This part is still complex. A simple check:
                     const needsColliderRecreation = this._checkColliderNeedsRecreation(collider, physicsComp, transformComp);
                     if (needsColliderRecreation) {
                          console.warn(`[Physics Sync ${entityId}] Collider needs recreation due to scale/type change. Recreating...`);
                          // Remove old collider
                          this.world.removeCollider(collider, false);
                          this.entityColliderMap.delete(entityId);
                          this.colliderEntityMap.delete(currentColliderHandle);
                          // Create new one
                          const newColliderDesc = this._createColliderDesc(physicsComp, transformComp);
                          if (newColliderDesc) {
                              const newCollider = this.world.createCollider(newColliderDesc, rigidBody);
                              if (!newCollider) { console.error(`[Physics Sync ${entityId}] Failed to recreate Collider.`); return; }
                              this.entityColliderMap.set(entityId, newCollider.handle);
                              this.colliderEntityMap.set(newCollider.handle, entityId);
                          } else { console.warn(`[Physics Sync ${entityId}] Failed to create ColliderDesc during recreation.`); }
                     }
                 }
             }
        }
    }

    // --- MODIFICATION: Added helper to check if collider needs recreation ---
    /** @private Checks if collider properties derived from transform/physics components have changed significantly */
    _checkColliderNeedsRecreation(collider, physicsComp, transformComp) {
        if (!collider) return false;
        const type = physicsComp.colliderType || 'cuboid';
        const scale = transformComp.scale;
        const sx = (typeof scale[0] === 'number' && isFinite(scale[0]) && scale[0] > 0) ? scale[0] : 1;
        const sy = (typeof scale[1] === 'number' && isFinite(scale[1]) && scale[1] > 0) ? scale[1] : 1;
        const sz = (typeof scale[2] === 'number' && isFinite(scale[2]) && scale[2] > 0) ? scale[2] : 1;
        let size = physicsComp.colliderSize;
        if (!Array.isArray(size) || size.length === 0 || !size.every(n => typeof n === 'number' && isFinite(n))) { size = engineConfig.physics.colliderSize ? [...engineConfig.physics.colliderSize] : [0.5]; }
        const sizeX = size[0]; const sizeY = size.length > 1 ? size[1] : sizeX; const sizeZ = size.length > 2 ? size[2] : sizeX;
        const MIN_DIM = 1e-6;

        try {
            if (type === 'cuboid' && collider.shapeType() === this.RAPIER.ShapeType.Cuboid) {
                const hx = Math.max(MIN_DIM, Math.abs(sizeX) * sx * 0.5);
                const hy = Math.max(MIN_DIM, Math.abs(sizeY) * sy * 0.5);
                const hz = Math.max(MIN_DIM, Math.abs(sizeZ) * sz * 0.5);
                const currentHalfExtents = collider.halfExtents();
                return Math.abs(currentHalfExtents.x - hx) > 1e-5 || Math.abs(currentHalfExtents.y - hy) > 1e-5 || Math.abs(currentHalfExtents.z - hz) > 1e-5;
            } else if (type === 'ball' && collider.shapeType() === this.RAPIER.ShapeType.Ball) {
                const radius = Math.max(MIN_DIM, Math.abs(sizeX));
                const worldRadius = radius * Math.max(sx, sy, sz);
                return Math.abs(collider.radius() - worldRadius) > 1e-5;
            } else if (type === 'capsule' && collider.shapeType() === this.RAPIER.ShapeType.Capsule) {
                 const halfHeight = Math.max(MIN_DIM, Math.abs(sizeX) * sy * 0.5);
                 const radius = Math.max(MIN_DIM, Math.abs(sizeY) * Math.max(sx, sz) * 0.5);
                 return Math.abs(collider.halfHeight() - halfHeight) > 1e-5 || Math.abs(collider.radius() - radius) > 1e-5;
            } else {
                // Type mismatch or unknown type needs recreation
                return true;
            }
        } catch (e) {
            console.error(`[Physics CheckRecreate ${collider.handle}] Error checking collider:`, e);
            return true; // Recreate on error
        }
    }
    // --- END MODIFICATION ---


    _createBodyDesc(physicsComp, transformComp, forceIdentityRotation = false) {
        // ... (implementation unchanged) ...
        if (!this.RAPIER) { console.error("RapierPhysicsSystem: RAPIER instance missing!"); return null; }
        const bodyType = this._getRapierBodyType(physicsComp.bodyType);
        let desc;
        if (bodyType === this.RAPIER.RigidBodyType.Dynamic) desc = this.RAPIER.RigidBodyDesc.dynamic();
        else if (bodyType === this.RAPIER.RigidBodyType.KinematicPositionBased) desc = this.RAPIER.RigidBodyDesc.kinematicPositionBased();
        else if (bodyType === this.RAPIER.RigidBodyType.KinematicVelocityBased) desc = this.RAPIER.RigidBodyDesc.kinematicVelocityBased();
        else desc = this.RAPIER.RigidBodyDesc.fixed(); // Static

        desc.setTranslation(transformComp.position[0], transformComp.position[1], transformComp.position[2]);
        if (forceIdentityRotation) { desc.setRotation({ x: 0, y: 0, z: 0, w: 1 }); }
        else { const q = this._tempQuat.setFromEuler(this._tempEuler.set( THREE.MathUtils.degToRad(transformComp.rotation[0]), THREE.MathUtils.degToRad(transformComp.rotation[1]), THREE.MathUtils.degToRad(transformComp.rotation[2]), 'XYZ' )); desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); }

        if (bodyType !== this.RAPIER.RigidBodyType.Fixed) { desc.setLinearDamping(physicsComp.linearDamping ?? engineConfig.physics.linearDamping); desc.setAngularDamping(physicsComp.angularDamping ?? engineConfig.physics.angularDamping); }
        desc.setCcdEnabled(physicsComp.ccdEnabled ?? engineConfig.physics.ccdEnabled);
        return desc;
    }

    // --- MODIFICATION: Removed renderableComp parameter ---
    _createColliderDesc(physicsComp, transformComp) {
        if (!this.RAPIER || !physicsComp || !transformComp) { console.error("RapierPhysicsSystem: Missing component data for _createColliderDesc!"); return null; }
    // --- END MODIFICATION ---
        const type = physicsComp.colliderType || 'cuboid';
        const scale = transformComp.scale;
        // Ensure scale factors are valid positive numbers
        const sx = (typeof scale[0] === 'number' && isFinite(scale[0]) && scale[0] > 0) ? scale[0] : 1;
        const sy = (typeof scale[1] === 'number' && isFinite(scale[1]) && scale[1] > 0) ? scale[1] : 1;
        const sz = (typeof scale[2] === 'number' && isFinite(scale[2]) && scale[2] > 0) ? scale[2] : 1;

        let size = physicsComp.colliderSize;
        // Validate colliderSize or use default
        if (!Array.isArray(size) || size.length === 0 || !size.every(n => typeof n === 'number' && isFinite(n))) {
            size = engineConfig.physics.colliderSize ? [...engineConfig.physics.colliderSize] : [0.5];
            // console.warn(`Physics: Invalid colliderSize for entity, using default: ${JSON.stringify(size)}`); // Less noisy log
        }

        let desc = null; const MIN_DIM = 1e-6; // Minimum dimension to avoid zero-size colliders
        try {
            const sizeX = size[0];
            const sizeY = size.length > 1 ? size[1] : sizeX;
            const sizeZ = size.length > 2 ? size[2] : sizeX;

            if (type === 'cuboid') {
                // Calculate half-extents based on component size AND entity scale
                const hx = Math.max(MIN_DIM, Math.abs(sizeX) * sx * 0.5);
                const hy = Math.max(MIN_DIM, Math.abs(sizeY) * sy * 0.5);
                const hz = Math.max(MIN_DIM, Math.abs(sizeZ) * sz * 0.5);
                desc = this.RAPIER.ColliderDesc.cuboid(hx, hy, hz);
            }
            else if (type === 'ball') {
                const radius = Math.max(MIN_DIM, Math.abs(sizeX));
                // Ball radius is scaled by the largest scale component
                const worldRadius = radius * Math.max(sx, sy, sz);
                desc = this.RAPIER.ColliderDesc.ball(worldRadius);
            }
            else if (type === 'capsule') {
                // Capsule scaling is tricky. Let's assume Y is height, X/Z determine radius.
                const halfHeight = Math.max(MIN_DIM, Math.abs(sizeX) * sy * 0.5); // Half-height scaled by Y-scale
                const radius = Math.max(MIN_DIM, Math.abs(sizeY) * Math.max(sx, sz) * 0.5); // Radius scaled by max of X/Z scale
                desc = this.RAPIER.ColliderDesc.capsule(halfHeight, radius);
            }
            else {
                console.warn(`Physics: Unsupported collider type "${type}". Creating default cuboid.`);
                const hx = Math.max(MIN_DIM, 0.5 * sx); // Default half-extents based on scale
                const hy = Math.max(MIN_DIM, 0.5 * sy);
                const hz = Math.max(MIN_DIM, 0.5 * sz);
                desc = this.RAPIER.ColliderDesc.cuboid(hx, hy, hz);
            }
        } catch (e) {
            console.error(`Physics: Error creating Rapier collider desc for ${type}:`, e);
            return null;
        }

        if (desc) {
            desc.setDensity(physicsComp.density ?? engineConfig.physics.density);
            desc.setRestitution(physicsComp.restitution ?? engineConfig.physics.restitution);
            desc.setFriction(physicsComp.friction ?? engineConfig.physics.friction);
            desc.setSensor(physicsComp.isSensor ?? engineConfig.physics.isSensor);
            // Consider setting activeHooks for collision events if needed later
            // desc.setActiveHooks(this.RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS | this.RAPIER.ActiveHooks.FILTER_INTERSECTION_PAIRS);
            // desc.setActiveEvents(this.RAPIER.ActiveEvents.COLLISION_EVENTS);
        }
        return desc;
    }

    _getRapierBodyType(typeString) {
        // ... (implementation unchanged) ...
        if (!this.RAPIER) { console.error("RapierPhysicsSystem: RAPIER instance missing!"); return 0; } // Default to static
        switch (typeString?.toLowerCase()) {
            case 'dynamic': return this.RAPIER.RigidBodyType.Dynamic;
            case 'static': case 'fixed': return this.RAPIER.RigidBodyType.Fixed;
            case 'kinematic': case 'kinematicposition': case 'kinematicpositionbased': return this.RAPIER.RigidBodyType.KinematicPositionBased;
            case 'kinematicvelocity': case 'kinematicvelocitybased': return this.RAPIER.RigidBodyType.KinematicVelocityBased;
            default: console.warn(`Physics: Unknown body type "${typeString}". Defaulting to Fixed.`); return this.RAPIER.RigidBodyType.Fixed;
        }
    }

    update(time) {
        // ... (implementation unchanged) ...
        if (!this.active || !this.world) return;
        if (!this.engine || !this.engine.entityManager) { console.warn("RapierPhysicsSystem: Engine/EM not available for update."); return; }
        const em = this.engine.entityManager;

        try {
            this.world.step(this.eventQueue); // Step physics world
        } catch (e) {
            console.error("Rapier world step failed:", e);
            this.active = false; // Stop physics updates on step failure
            return;
        }

        // Sync physics state back to entity components
        const POS_THRESHOLD_SQ = 1e-6; // Squared threshold for position changes
        const ROT_THRESHOLD = 1e-4;   // Threshold for quaternion angle difference

        this.entityBodyMap.forEach((handle, entityId) => {
            const body = this.world.getRigidBody(handle);
            // Only sync dynamic/kinematic bodies FROM physics TO engine
            if (!body || !(body.isDynamic() || body.isKinematic())) {
                return;
            }
            // Ensure entity still exists and has transform
            if (!em.hasEntity(entityId)) { console.warn(`RapierPhysicsSystem: Entity ${entityId} no longer exists during update sync. Removing body.`); this.removePhysicsBody(entityId); return; }
            const transform = em.getComponent(entityId, 'transform');
            if (!transform) { /* console.warn(`RapierPhysicsSystem: Entity ${entityId} missing TransformComponent during update sync.`); */ return; } // Less noise
            if (!Array.isArray(transform.position) || transform.position.length !== 3 || !Array.isArray(transform.rotation) || transform.rotation.length !== 3) { console.warn(`RapierPhysicsSystem: Entity ${entityId} has invalid transform structure during update sync.`); return; }

            const pos = body.translation(); // {x, y, z}
            const rot = body.rotation();   // {x, y, z, w}

            // Check position change
            this._tempVec3.set(transform.position[0], transform.position[1], transform.position[2]);
            const posChanged = this._tempVec3.distanceToSquared(pos) > POS_THRESHOLD_SQ;

            // Check rotation change
            this._tempQuat.set(rot.x, rot.y, rot.z, rot.w);
            this._tempEuler.setFromQuaternion(this._tempQuat, 'XYZ'); // Use consistent Euler order
            const newRotation = [ THREE.MathUtils.radToDeg(this._tempEuler.x), THREE.MathUtils.radToDeg(this._tempEuler.y), THREE.MathUtils.radToDeg(this._tempEuler.z) ];
             // Compare individual Euler angles (more intuitive than quaternion diff for small changes)
            const rotChanged = newRotation.some((r, i) => Math.abs(r - transform.rotation[i]) > 0.1); // Use degrees threshold

            // Update component only if changed significantly
            if (posChanged || rotChanged) {
                const updateData = {};
                if (posChanged) updateData.position = [pos.x, pos.y, pos.z];
                if (rotChanged) updateData.rotation = newRotation;
                updateData.source = 'physicsSystem'; // Mark source
                // Use engine's addComponent for update to trigger events properly
                this.engine.addComponent(entityId, 'transform', updateData);
            }
        });

        // TODO: Process eventQueue for collision events if needed
        // this.eventQueue.drainCollisionEvents((handle1, handle2, started) => { /* ... */ });
    }

    // --- Public API Methods (Unchanged, but logging added previously) ---
    setLinearVelocity(entityId, velocity, wakeUp = true) {
        // ... (implementation unchanged) ...
        if (!this.world) return false;
        const handle = this.entityBodyMap.get(entityId);
        if (handle === undefined) return false;
        const body = this.world.getRigidBody(handle);
        if (!body) return false;
        try {
            body.setLinvel(velocity, wakeUp);
            return true;
        } catch (e) { console.error(`RapierPhysicsSystem: Error setting linear velocity for entity ${entityId}:`, e); return false; }
    }

    setAngularVelocity(entityId, velocity, wakeUp = true) {
        // ... (implementation unchanged) ...
        if (!this.world) return false;
        const handle = this.entityBodyMap.get(entityId);
        if (handle === undefined) return false;
        const body = this.world.getRigidBody(handle);
        if (!body) return false;
        try { body.setAngvel(velocity, wakeUp); return true; }
        catch (e) { console.error(`RapierPhysicsSystem: Error setting angular velocity for entity ${entityId}:`, e); return false; }
    }

    resetForces(entityId, wakeUp = true) {
        // ... (implementation unchanged) ...
        if (!this.world) return false;
        const handle = this.entityBodyMap.get(entityId);
        if (handle === undefined) return false;
        const body = this.world.getRigidBody(handle);
        if (!body) return false;
        try { body.resetForces(wakeUp); return true; }
        catch (e) { console.error(`RapierPhysicsSystem: Error resetting forces for entity ${entityId}:`, e); return false; }
    }

    resetTorques(entityId, wakeUp = true) {
        // ... (implementation unchanged) ...
        if (!this.world) return false;
        const handle = this.entityBodyMap.get(entityId);
        if (handle === undefined) return false;
        const body = this.world.getRigidBody(handle);
        if (!body) return false;
        try { body.resetTorques(wakeUp); return true; }
        catch (e) { console.error(`RapierPhysicsSystem: Error resetting torques for entity ${entityId}:`, e); return false; }
    }

    setPosition(entityId, position, wakeUp = true) {
        // ... (implementation unchanged) ...
        if (!this.world || !this.engine?.entityManager) return false;
        const handle = this.entityBodyMap.get(entityId);
        if (handle === undefined) return false;
        const body = this.world.getRigidBody(handle);
        if (!body) return false;
        try {
            body.setTranslation(position, wakeUp);
            // Also update the entity's transform component immediately
            const transform = this.engine.entityManager.getComponent(entityId, 'transform');
            if (transform) {
                const newPositionArray = [position.x, position.y, position.z];
                // Avoid infinite loops: only update if significantly different
                if (transform.position.some((p, i) => Math.abs(p - newPositionArray[i]) > 1e-5)) {
                    this.engine.addComponent(entityId, 'transform', { position: newPositionArray, source: 'physicsSystem_setPosition' });
                }
            }
            return true;
        } catch (e) { console.error(`RapierPhysicsSystem: Error setting position for entity ${entityId}:`, e); return false; }
    }

    getLinearVelocity(entityId) {
        // console.log(`[Rapier Sys getLinearVelocity] Called for Entity ID: ${entityId}`); // Keep commented unless debugging
        if (!this.world) { console.warn(`[Rapier Sys getLinearVelocity ${entityId}] World not available.`); return null; }
        const handle = this.entityBodyMap.get(entityId);
        if (handle === undefined) { console.warn(`[Rapier Sys getLinearVelocity ${entityId}] RigidBody handle not found in map.`); return null; }
        const body = this.world.getRigidBody(handle);
        if (!body) { console.warn(`[Rapier Sys getLinearVelocity ${entityId}] RigidBody object not found for handle ${handle}.`); return null; }
        try {
            const linvel = body.linvel();
            // console.log(`[Rapier Sys getLinearVelocity ${entityId}] Returning linvel:`, linvel); // Keep commented unless debugging
            return linvel; // Returns {x, y, z}
        } catch (e) { console.error(`[Rapier Sys getLinearVelocity ${entityId}] Error getting linear velocity:`, e); return null; }
    }

    getAngularVelocity(entityId) {
        // ... (implementation unchanged) ...
        if (!this.world) return null; const handle = this.entityBodyMap.get(entityId); if (handle === undefined) return null; const body = this.world.getRigidBody(handle); if (!body) return null;
        try { return body.angvel(); } catch (e) { console.error(`RapierPhysicsSystem: Error getting angular velocity for entity ${entityId}:`, e); return null; }
    }

    getPosition(entityId) {
        // ... (implementation unchanged) ...
        if (!this.world) return null; const handle = this.entityBodyMap.get(entityId); if (handle === undefined) return null; const body = this.world.getRigidBody(handle); if (!body) return null;
        try { return body.translation(); } catch (e) { console.error(`RapierPhysicsSystem: Error getting position for entity ${entityId}:`, e); return null; }
    }

    getRotation(entityId) {
        // ... (implementation unchanged) ...
        if (!this.world) return null; const handle = this.entityBodyMap.get(entityId); if (handle === undefined) return null; const body = this.world.getRigidBody(handle); if (!body) return null;
        try { return body.rotation(); } catch (e) { console.error(`RapierPhysicsSystem: Error getting rotation for entity ${entityId}:`, e); return null; }
    }

    applyImpulse(entityId, impulse, wakeUp = true) {
        // console.log(`[Rapier Sys applyImpulse] Called for Entity ID: ${entityId}, Impulse:`, impulse); // Keep commented unless debugging
        if (!this.world) { console.warn(`[Rapier Sys applyImpulse ${entityId}] World not available.`); return false; }
        const handle = this.entityBodyMap.get(entityId);
        if (handle === undefined) { console.warn(`[Rapier Sys applyImpulse ${entityId}] RigidBody handle not found in map.`); return false; }
        const body = this.world.getRigidBody(handle);
        if (!body) { console.warn(`[Rapier Sys applyImpulse ${entityId}] RigidBody object not found for handle ${handle}.`); return false; }
        if (!body.isDynamic()) { console.warn(`[Rapier Sys applyImpulse ${entityId}] Cannot apply impulse to non-dynamic body (Type: ${body.bodyType()}).`); return false; }
        try {
             const velBefore = body.linvel(); // Get velocity BEFORE applying
             body.applyImpulse(impulse, wakeUp);
             const velAfter = body.linvel(); // Get velocity AFTER applying
             // console.log(`[Rapier Sys applyImpulse ${entityId}] Vel Before: {x:${velBefore.x.toFixed(3)}, y:${velBefore.y.toFixed(3)}, z:${velBefore.z.toFixed(3)}}, Impulse Applied: {x:${impulse.x.toFixed(3)}, y:${impulse.y.toFixed(3)}, z:${impulse.z.toFixed(3)}}, Vel After: {x:${velAfter.x.toFixed(3)}, y:${velAfter.y.toFixed(3)}, z:${velAfter.z.toFixed(3)}}`); // Keep commented unless debugging
            return true;
        } catch (e) { console.error(`[Rapier Sys applyImpulse ${entityId}] Error applying impulse:`, e); return false; }
    }

    applyTorqueImpulse(entityId, torqueImpulse, wakeUp = true) {
        // ... (implementation unchanged) ...
        if (!this.world) return false; const handle = this.entityBodyMap.get(entityId); if (handle === undefined) return false; const body = this.world.getRigidBody(handle); if (!body || !body.isDynamic()) { if(body) console.warn(`RapierPhysicsSystem: Cannot apply torque impulse to non-dynamic body for entity ${entityId}.`); return false; }
        try { body.applyTorqueImpulse(torqueImpulse, wakeUp); return true; } catch (e) { console.error(`RapierPhysicsSystem: Error applying torque impulse for entity ${entityId}:`, e); return false; }
    }

    getCollidingEntities(entityId) {
        // ... (implementation unchanged) ...
        const collidingEntities = []; if (!this.world) return collidingEntities; const colliderHandle = this.entityColliderMap.get(entityId); if (colliderHandle === undefined) { return collidingEntities; }
        try { this.world.intersectionsWith(colliderHandle, (otherCollider) => { const otherEntityId = this.colliderEntityMap.get(otherCollider.handle); if (otherEntityId !== undefined && otherEntityId !== entityId) { collidingEntities.push(otherEntityId); } return true; }); }
        catch (e) { console.error(`RapierPhysicsSystem: Error checking intersections for entity ${entityId}:`, e); } return collidingEntities;
    }

    cleanup() {
        // ... (implementation unchanged) ...
        console.log("Cleaning up RapierPhysicsSystem...");
        // Remove event listeners
        if (this.engine?.eventEmitter) { const emitter = this.engine.eventEmitter; emitter.off('componentAdded'); emitter.off('componentRemoved'); emitter.off('entityRemoved'); emitter.off('sceneImported'); emitter.off('entityRestored'); /* Remove specific handlers if they were bound */ }
        // Clear physics world resources
        const entitiesToRemove = Array.from(this.entityBodyMap.keys());
        entitiesToRemove.forEach(id => this.removePhysicsBody(id)); // Ensure bodies/colliders removed from world
        this.entityBodyMap.clear(); this.entityColliderMap.clear(); this.colliderEntityMap.clear();
        // Note: Rapier world itself doesn't have an explicit 'destroy' or 'free' in JS bindings typically. It relies on JS GC.
        this.world = null; this.RAPIER = null; this.engine = null; this.eventQueue = null; // Nullify references
        console.log("RapierPhysicsSystem Cleaned Up.");
    }

} // End Class RapierPhysicsSystem
