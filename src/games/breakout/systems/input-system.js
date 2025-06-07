// games/breakout/systems/input-system.js
// NOTE: Moved from src/systems/game/ - Part of Engine/Game Separation step.
// @version 1.3.0 - Updated to use InputManagerSystem instead of direct window listeners.
// @previous 1.2.0 - Updated to use breakout-config.js

import { breakoutConfig } from './breakout-config.js';

// Use game-specific config
const PADDLE_DEFAULT_SPEED = breakoutConfig.paddle.speed;
const PLAY_AREA_DEFAULT_WIDTH = breakoutConfig.playArea.width;

/**
 * Handles keyboard input for controlling the paddle by querying InputManagerSystem.
 */
export class InputSystem {
    constructor() {
        this.priority = 10; // Runs after InputManagerSystem (priority 5)
        this.active = true; // System active state controlled by engine mode (or game state)
        this._name = 'input'; // Keep name consistent for now
        this.engine = null;
        this.entityManager = null;
        /** @type {import('../../systems/input-manager-system.js').InputManagerSystem | null} */
        this.inputManager = null; // Reference to the core input system
        /** @type {object|null} Reference to the physics system, fetched lazily */
        this.physicsSystem = null;
        /** @private Flag to track if physics system lookup has been attempted */
        this._physicsSystemSearched = false;

        this.paddleEntityId = null; // Found via tag
        this.paddleSpeed = PADDLE_DEFAULT_SPEED;
        this.playAreaWidth = PLAY_AREA_DEFAULT_WIDTH;

        // --- REMOVED direct input state and handlers ---
        // this.moveLeft = false;
        // this.moveRight = false;
        // this._handleKeyDown = this._handleKeyDown.bind(this);
        // this._handleKeyUp = this._handleKeyUp.bind(this);
        // --- END REMOVAL ---

        this._initialized = false; // Still useful to track if refs are set
    }

    /**
     * Initializes the system, acquiring references.
     * Defers acquiring the physics system reference.
     */
    async initialize(entityManager, eventEmitter, engine) {
        this.entityManager = entityManager;
        this.engine = engine;
        // --- ADDED: Get InputManagerSystem ---
        this.inputManager = engine.getSystem('inputManager');
        if (!this.inputManager) {
            console.error("[Breakout InputSystem] CRITICAL: InputManagerSystem ('inputManager') not found!");
            this.active = false; // Cannot function without input manager
            return;
        }
        // --- END ADDITION ---

        // Find paddle immediately using tag
        this._findPaddle();

        // --- REMOVED: Direct window listener setup ---
        // if (!this._initialized) {
        //     window.addEventListener('keydown', this._handleKeyDown);
        //     window.addEventListener('keyup', this._handleKeyUp);
        //     this._initialized = true;
        // }
        // --- END REMOVAL ---
        this._initialized = true; // Mark as initialized (refs set)

        console.log(`[Breakout] InputSystem Initialized (Paddle ID: ${this.paddleEntityId}) - Using InputManagerSystem.`);
    }

    /** Lazily gets and stores the physics system reference */
    _getPhysicsSystem() {
        if (!this.physicsSystem && !this._physicsSystemSearched && this.engine) {
            this.physicsSystem = this.engine.getSystem('physics');
            this._physicsSystemSearched = true;
            if (!this.physicsSystem) {
                console.warn("[Breakout] InputSystem: Physics system ('physics') still not found during update.");
            }
        }
        return this.physicsSystem;
    }


    /** Finds the paddle entity using the 'playerPaddle' tag and caches its ID and speed. */
    _findPaddle() {
         if (!this.entityManager) return;
         const taggedEntities = this.entityManager.getEntitiesWithComponent('tag');
         let foundPaddleId = null;

         for (const entityId of taggedEntities) {
             const tagComp = this.entityManager.getComponent(entityId, 'tag');
             if (tagComp && typeof tagComp.tags?.includes === 'function' && tagComp.tags.includes('playerPaddle')) {
                 if (this.entityManager.hasComponent(entityId, 'paddle')) {
                      foundPaddleId = entityId;
                      const paddleComp = this.entityManager.getComponent(entityId, 'paddle');
                      this.paddleSpeed = paddleComp?.speed ?? PADDLE_DEFAULT_SPEED;
                      break;
                 } else {
                      console.warn(`[Breakout] InputSystem: Found entity ${entityId} with 'playerPaddle' tag but missing PaddleComponent.`);
                 }
             }
         }
         this.paddleEntityId = foundPaddleId;
         if (this.paddleEntityId !== null) {
            console.log(`[Breakout] InputSystem: Found Paddle by tag (ID: ${this.paddleEntityId}) with speed ${this.paddleSpeed} (Default: ${PADDLE_DEFAULT_SPEED})`);
        }
    }

    // --- REMOVED: _handleKeyDown and _handleKeyUp methods ---

    /** Updates the paddle's position based on input state queried from InputManagerSystem. */
    update(time) {
        // --- ADDED: Check for inputManager ---
        if (!this.inputManager || !this.active) {
            return;
        }
        // --- END ADDITION ---

        const physics = this._getPhysicsSystem();

        if (this.paddleEntityId === null) { this._findPaddle(); }
        if (this.paddleEntityId === null) { return; }

        if (!this.entityManager.hasEntity(this.paddleEntityId)) {
             console.warn(`[Breakout] InputSystem: Paddle entity ${this.paddleEntityId} no longer exists.`);
             this.paddleEntityId = null; return;
        }
        const physicsComp = this.entityManager.getComponent(this.paddleEntityId, 'physics');
        const transformComp = this.entityManager.getComponent(this.paddleEntityId, 'transform');
        if (!transformComp) return;

        // --- Physics/Transform update logic ---

        // --- MODIFIED: Get input state from InputManagerSystem ---
        const moveLeft = this.inputManager.isKeyDown('arrowleft') || this.inputManager.isKeyDown('a');
        const moveRight = this.inputManager.isKeyDown('arrowright') || this.inputManager.isKeyDown('d');
        // --- END MODIFICATION ---

        if (physics && physicsComp && physics.world && physics.entityBodyMap) {
             const rigidBodyHandle = physics.entityBodyMap.get(this.paddleEntityId);
             if (rigidBodyHandle !== undefined) {
                 const rb = physics.world.getRigidBody(rigidBodyHandle);
                 const kinematicType = physics.RAPIER?.RigidBodyType.KinematicPositionBased;
                 if (rb && (rb.isKinematic() || (kinematicType !== undefined && rb.bodyType() === kinematicType))) {
                      const currentPosition = rb.translation();
                      let targetX = currentPosition.x;
                      const moveAmount = this.paddleSpeed * time.deltaTime;

                      // Use queried input state
                      if (moveLeft) targetX -= moveAmount;
                      if (moveRight) targetX += moveAmount;

                      // Clamp position
                      const paddleWidth = transformComp.scale[0];
                      const minX = -PLAY_AREA_DEFAULT_WIDTH / 2 + paddleWidth / 2;
                      const maxX = PLAY_AREA_DEFAULT_WIDTH / 2 - paddleWidth / 2;
                      targetX = Math.max(minX, Math.min(maxX, targetX));

                      rb.setNextKinematicTranslation({ x: targetX, y: currentPosition.y, z: currentPosition.z });
                      return; // Handled by physics
                 }
             }
        }

        // Fallback: If no physics or body isn't kinematic
        console.warn(`[Breakout] InputSystem: Updating paddle ${this.paddleEntityId} transform directly (fallback).`);
        let deltaX = 0;
        // Use queried input state
        if (moveLeft) deltaX -= this.paddleSpeed * time.deltaTime;
        if (moveRight) deltaX += this.paddleSpeed * time.deltaTime;

        if (deltaX !== 0) {
            const newPosition = [...transformComp.position];
            newPosition[0] += deltaX;
            const paddleWidth = transformComp.scale[0];
            const minX = -PLAY_AREA_DEFAULT_WIDTH / 2 + paddleWidth / 2;
            const maxX = PLAY_AREA_DEFAULT_WIDTH / 2 - paddleWidth / 2;
            newPosition[0] = Math.max(minX, Math.min(maxX, newPosition[0]));
            this.entityManager.addComponent(this.paddleEntityId, 'transform', { position: newPosition, source: 'input' });
        }
    }

    /** Cleans up. (No listeners to remove here anymore) */
    cleanup() {
        // --- REMOVED: Direct window listener removal ---
        // if (this._initialized) {
        //     window.removeEventListener('keydown', this._handleKeyDown);
        //     window.removeEventListener('keyup', this._handleKeyUp);
        //     this._initialized = false;
        // }
        // --- END REMOVAL ---

        this.paddleEntityId = null;
        this.entityManager = null;
        this.engine = null;
        this.physicsSystem = null;
        this.inputManager = null; // Clear input manager reference
        this._physicsSystemSearched = false;
        this._initialized = false; // Mark as uninitialized
        console.log("[Breakout] InputSystem Cleaned Up");
    }
}