// src/systems/behaviors/player-control-system.js
// @version 1.1.1 - Added detailed logging for debugging control issues.
// @previous 1.1.0 - Implemented camera-relative movement and enhanced logging.

import * as logger from '../../utils/logger.js';
import * as THREE from 'three'; // Need THREE for camera/vector math
import { GameState } from '../game-state-manager.js'; // To check if playing

/**
 * Reads input from InputManagerSystem and applies movement relative to the camera
 * to entities with PlayerControlComponent and PhysicsComponent using the PhysicsSystem.
 *
 * @class PlayerControlSystem
 */
export class PlayerControlSystem {
    constructor() {
        this.priority = 55; // After Physics (50), before Spin (60)? Adjust as needed.
        this.active = false; // Start inactive
        this._name = 'playerControl';

        /** @type {import('../../core.js').Engine|null} */
        this.engine = null;
        /** @type {import('../../ecs/entity-manager.js').EntityManager|null} */
        this.entityManager = null;
        /** @type {import('../input-manager-system.js').InputManagerSystem|null} */
        this.inputManager = null;
        /** @type {import('../physics/rapier-physics-system.js').RapierPhysicsSystem|null} */
        this.physicsSystem = null;
         /** @type {import('../game-state-manager.js').GameStateManager|null} */
        this.gameStateManager = null;
        /** @type {import('../three-render-system.js').ThreeRenderSystem|null} */
        this.renderSystem = null; // Need renderer for camera

        // Reusable THREE objects for calculations
        this._moveDirectionWorld = new THREE.Vector3(); // Raw input mapped to world axes
        this._finalMoveImpulse = new THREE.Vector3(); // Calculated impulse in world space
        this._cameraForward = new THREE.Vector3();
        this._cameraRight = new THREE.Vector3();
        this._tempQuaternion = new THREE.Quaternion();
        this._tempCamPos = new THREE.Vector3(); // To avoid modifying camera directly

        this._onGameStateChanged = this._onGameStateChanged.bind(this);
        this._lastLogTime = 0; // Throttle logging
        this._logInterval = 1000; // Log every 1 second if no input
    }

    /**
     * Initializes the system and gets references to other systems.
     * @param {import('../../ecs/entity-manager.js').EntityManager} entityManager
     * @param {import('../../utils/event-emitter.js').EventEmitter} eventEmitter
     * @param {import('../../core.js').Engine} engine
     */
    async initialize(entityManager, eventEmitter, engine) {
        this.engine = engine;
        this.entityManager = entityManager;
        this.inputManager = engine.getSystem('inputManager');
        this.physicsSystem = engine.getSystem('physics');
        this.gameStateManager = engine.getSystem('gameStateManager');
        this.renderSystem = engine.getSystem('renderer'); // Get renderer system

        if (!this.inputManager) { logger.error("[PlayerControlSystem] CRITICAL: InputManagerSystem not found!"); this.active = false; return; }
        if (!this.physicsSystem) { logger.error("[PlayerControlSystem] CRITICAL: RapierPhysicsSystem not found!"); this.active = false; return; }
        if (!this.renderSystem) { logger.warn("[PlayerControlSystem] ThreeRenderSystem not found! Camera-relative movement may fail."); }
        if (!this.gameStateManager) {
             logger.warn("[PlayerControlSystem] GameStateManager not found! System will remain inactive.");
             this.active = false; // Explicitly set inactive if manager missing
        } else {
             eventEmitter.on('gameStateChanged', this._onGameStateChanged);
             // Set initial state based on current game state
             this._onGameStateChanged({ current: this.gameStateManager.getState() });
        }

        logger.log(`PlayerControlSystem Initialized. Initial active state: ${this.active}`);
    }

     /**
     * Activates/deactivates the system based on game state.
     * @private
     */
     _onGameStateChanged({ current }) {
        const shouldBeActive = (current === GameState.PLAYING);
        if (this.active !== shouldBeActive) {
            this.active = shouldBeActive;
            logger.log(`[PlayerControlSystem] GameState changed to ${current}. Active set to: ${this.active}`);
        }
    }

    /**
     * Updates controllable entities based on input.
     * @param {object} time - Timing information { deltaTime, elapsed, ... }
     */
    update(time) {
        const now = performance.now();

        if (!this.active) {
            // Log inactive state occasionally for debugging
            if (now - this._lastLogTime > this._logInterval) {
                // logger.log(`[PCS Update Skip] System Inactive (State: ${this.gameStateManager?.getState()})`);
                this._lastLogTime = now;
            }
            return;
        }

        // --- Enhanced Dependency Check ---
        if (!this.entityManager || !this.inputManager || !this.physicsSystem || !this.renderSystem?.activeCameraObject) {
             if (now - this._lastLogTime > this._logInterval) {
                 let reason = "Missing dependencies:";
                 if (!this.entityManager) reason += " EntityManager";
                 if (!this.inputManager) reason += " InputManager";
                 if (!this.physicsSystem) reason += " PhysicsSystem";
                 if (!this.renderSystem?.activeCameraObject) reason += " ActiveCamera";
                 logger.warn(`[PCS Update Skip] ${reason}`);
                 this._lastLogTime = now;
             }
             return;
        }

        const controllableEntities = this.entityManager.getEntitiesWithComponents(['playerControl', 'physics', 'transform']);
        if (controllableEntities.length === 0) {
             if (now - this._lastLogTime > this._logInterval) {
                // logger.log(`[PCS Update Skip] No controllable entities found.`);
                this._lastLogTime = now;
             }
             return;
        }

        // --- Get Camera Orientation ---
        const camera = this.renderSystem.activeCameraObject;
        camera.getWorldDirection(this._cameraForward);
        this._cameraForward.y = 0;
        this._cameraForward.normalize();
        this._cameraRight.copy(this._cameraForward).applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        // --- End Camera Orientation ---


        controllableEntities.forEach(entityId => {
            const control = this.entityManager.getComponent(entityId, 'playerControl');
            const physics = this.entityManager.getComponent(entityId, 'physics');
            const transform = this.entityManager.getComponent(entityId, 'transform');

            if (!control || !physics || !transform) {
                // logger.warn(`[PCS] Skipping Entity ${entityId}: Missing required component.`);
                return;
            }
            if (physics.bodyType !== 'dynamic') {
                // logger.log(`[PCS] Skipping Entity ${entityId}: Physics bodyType is not 'dynamic'.`);
                return;
            }

            // Get Input State
            const moveForward = this.inputManager.isKeyDown('w') || this.inputManager.isKeyDown('arrowup');
            const moveBackward = this.inputManager.isKeyDown('s') || this.inputManager.isKeyDown('arrowdown');
            const moveLeft = this.inputManager.isKeyDown('a') || this.inputManager.isKeyDown('arrowleft');
            const moveRight = this.inputManager.isKeyDown('d') || this.inputManager.isKeyDown('arrowright');
            const hasInput = moveForward || moveBackward || moveLeft || moveRight;

            // --- DEBUG LOG: Input State ---
            if (hasInput || now - this._lastLogTime > this._logInterval) {
                // logger.log(`[PCS Input] Entity ${entityId}: Fwd:${moveForward}, Bwd:${moveBackward}, Lft:${moveLeft}, Rgt:${moveRight}`);
            }
            // --- END DEBUG ---

            if (!hasInput) {
                if (now - this._lastLogTime > this._logInterval) {
                    // Log current velocity occasionally when idle
                    const currentVelocity = this.physicsSystem.getLinearVelocity(entityId);
                    if (currentVelocity) {
                        // logger.log(`[PCS Idle] Entity ${entityId} Vel: {x:${currentVelocity.x.toFixed(2)}, y:${currentVelocity.y.toFixed(2)}, z:${currentVelocity.z.toFixed(2)}}`);
                    }
                    this._lastLogTime = now;
                }
                return; // Skip if no movement input
            }

            // --- Calculate Camera-Relative Movement Direction ---
            this._moveDirectionWorld.set(0, 0, 0);
            if (moveForward) this._moveDirectionWorld.add(this._cameraForward);
            if (moveBackward) this._moveDirectionWorld.sub(this._cameraForward);
            if (moveLeft) this._moveDirectionWorld.sub(this._cameraRight);
            if (moveRight) this._moveDirectionWorld.add(this._cameraRight);
            this._moveDirectionWorld.y = 0;
            const magnitude = this._moveDirectionWorld.length();
            // --- End Calculation ---

            // --- DEBUG LOG: Calculated Direction ---
            // logger.log(`[PCS Calc] Entity ${entityId}: MoveDirWorld: {x:${this._moveDirectionWorld.x.toFixed(3)}, y:${this._moveDirectionWorld.y.toFixed(3)}, z:${this._moveDirectionWorld.z.toFixed(3)}}, Mag: ${magnitude.toFixed(3)}`);
            // --- END DEBUG ---


            if (magnitude > 1e-6) {
                this._moveDirectionWorld.normalize();

                // --- Apply Movement using Physics ---
                if (control.useForce) {
                    const forceMagnitude = control.moveForce * time.deltaTime * 60; // Roughly impulse
                    this._finalMoveImpulse.copy(this._moveDirectionWorld).multiplyScalar(forceMagnitude);

                    // --- DEBUG LOG: Applying Impulse ---
                    logger.log(`[PCS ApplyImpulse] Entity: ${entityId}, ` +
                                `Impulse: {x:${this._finalMoveImpulse.x.toFixed(3)}, y:${this._finalMoveImpulse.y.toFixed(3)}, z:${this._finalMoveImpulse.z.toFixed(3)}} (Force:${control.moveForce.toFixed(2)}, ScaledDelta:${time.deltaTime.toFixed(4)})`);
                    // --- END DEBUG ---

                    const applied = this.physicsSystem.applyImpulse(entityId, { x: this._finalMoveImpulse.x, y: this._finalMoveImpulse.y, z: this._finalMoveImpulse.z }, true);
                    // --- DEBUG LOG: Impulse Result ---
                    if (!applied) logger.error(`[PCS ApplyImpulse FAILED] Entity ${entityId}`);
                    else {
                        // Log velocity *after* applying impulse for comparison
                         const velAfter = this.physicsSystem.getLinearVelocity(entityId);
                         if(velAfter) logger.log(`[PCS ApplyImpulse OK] Entity ${entityId} - Vel AFTER: {x:${velAfter.x.toFixed(3)}, y:${velAfter.y.toFixed(3)}, z:${velAfter.z.toFixed(3)}}`);
                    }
                    // --- END DEBUG ---


                    // Speed clamping (optional, might interfere with impulse feeling)
                    if (control.maxSpeed > 0) {
                         const currentVelocity = this.physicsSystem.getLinearVelocity(entityId);
                         if (currentVelocity) {
                             const currentSpeedSq = currentVelocity.x**2 + currentVelocity.z**2;
                              if (currentSpeedSq > control.maxSpeed**2) {
                                   const currentSpeed = Math.sqrt(currentSpeedSq);
                                   const clampFactor = control.maxSpeed / currentSpeed;
                                   const clampedVel = { x: currentVelocity.x * clampFactor, y: currentVelocity.y, z: currentVelocity.z * clampFactor };
                                   // logger.log(`[PCS Clamping Vel] Entity ${entityId}: Speed=${currentSpeed.toFixed(2)}, Target=${control.maxSpeed}, NewVel: x=${clampedVel.x.toFixed(2)}, z=${clampedVel.z.toFixed(2)}`);
                                   this.physicsSystem.setLinearVelocity(entityId, clampedVel, true);
                              }
                         } else {
                              logger.warn(`[PCS] Could not get velocity for entity ${entityId} to clamp speed.`);
                         }
                    }

                } else { // Directly set velocity
                    const currentYVel = this.physicsSystem.getLinearVelocity(entityId)?.y ?? 0;
                    const targetVelocity = {
                        x: this._moveDirectionWorld.x * control.maxSpeed,
                        y: currentYVel,
                        z: this._moveDirectionWorld.z * control.maxSpeed
                    };

                     // --- DEBUG LOG: Setting Velocity ---
                    logger.log(`[PCS SetVelocity] Entity: ${entityId}, ` +
                                `TargetVel: {x:${targetVelocity.x.toFixed(3)}, y:${targetVelocity.y.toFixed(3)}, z:${targetVelocity.z.toFixed(3)}} (MaxSpeed:${control.maxSpeed.toFixed(2)})`);
                     // --- END DEBUG ---

                    const applied = this.physicsSystem.setLinearVelocity(entityId, targetVelocity, true);
                    // --- DEBUG LOG: Set Velocity Result ---
                    if (!applied) logger.error(`[PCS SetVelocity FAILED] Entity ${entityId}`);
                    // --- END DEBUG ---
                }

            } else {
                // No horizontal input this frame.
                 // logger.log(`[PCS No Input] Entity ${entityId}: No significant input magnitude.`);
            }
             this._lastLogTime = now; // Reset log timer if input was processed
        }); // End forEach entity
    } // End update

    cleanup() {
        logger.log("[PlayerControlSystem] Cleaning up.");
         if (this.eventEmitter && this.gameStateManager) {
             this.eventEmitter.off('gameStateChanged', this._onGameStateChanged);
         }
        this.engine = null;
        this.entityManager = null;
        this.inputManager = null;
        this.physicsSystem = null;
        this.gameStateManager = null;
        this.renderSystem = null;
        this.active = false;
    }
}