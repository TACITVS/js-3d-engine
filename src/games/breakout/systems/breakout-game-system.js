// games/breakout/systems/breakout-game-system.js
// @version 1.3.0 - Integrated GameStateManager for state transitions.
// @previous 1.2.0 - Updated to use breakout-config.js

import * as THREE from 'three'; // Only needed if using THREE math utilities
import { breakoutConfig } from './breakout-config.js';
// --- ADDED: Import GameState ---
import { GameState } from '../../../systems/game-state-manager.js';
// --- END ADDITION ---

// Use game-specific config
const FALL_BOUNDARY_Y = breakoutConfig.playArea.fallBoundaryY;
const BRICK_DEFAULT_SCORE = breakoutConfig.brick.scoreValue;
const INITIAL_LIVES = breakoutConfig.score.initialLives;

/**
 * Manages the core gameplay loop, state, collisions, and scoring for Breakout.
 * Uses physics abstraction layer and GameStateManager.
 */
export class BreakoutGameSystem {
    constructor() {
        this.priority = 50;
        this.active = false; // Should be activated/deactivated by game state manager
        this._name = 'breakoutLogic';
        this.engine = null; this.entityManager = null; this.physicsSystem = null;
        this.eventEmitter = null; this.uiSystem = null;
        // --- ADDED: gameStateManager reference ---
        /** @type {import('../../../systems/game-state-manager.js').GameStateManager|null} */
        this.gameStateManager = null;
        // --- END ADDITION ---

        this.ballEntityId = null; this.paddleEntityId = null; this.gameStateEntityId = null;
        // --- REMOVED internal gameState property ---
        // this.gameState = 'IDLE'; // Now managed by GameStateManager
        // --- END REMOVAL ---
        this.brickCount = 0;
        this._contacts = [];
        this._initialized = false;
        this._entitiesFound = false;

        this._handleKeyDown = this._handleKeyDown.bind(this);
        // --- MODIFIED: Remove mode listeners, rely on gameStateChanged ---
        // this._onGameModeEntered = this._onGameModeEntered.bind(this);
        // this._onEditorModeEntered = this._onEditorModeEntered.bind(this);
        this._onGameStateChanged = this._onGameStateChanged.bind(this);
        // --- END MODIFICATION ---
    }

    async initialize(entityManager, eventEmitter, engine) {
        this.entityManager = entityManager;
        this.eventEmitter = eventEmitter;
        this.engine = engine;
        // Get core systems needed
        this.physicsSystem = engine.getSystem('physics');
        this.uiSystem = engine.getSystem('gameUI');
        // --- ADDED: Get GameStateManager ---
        this.gameStateManager = engine.getSystem('gameStateManager');
        // --- END ADDITION ---

        if (!this.physicsSystem) console.warn("[Breakout] BreakoutGameSystem: Physics system not found during init.");
        if (!this.uiSystem) console.warn("[Breakout] BreakoutGameSystem: GameUI system not found during init.");
        // --- ADDED: Check for GameStateManager ---
        if (!this.gameStateManager) {
            console.error("[Breakout] BreakoutGameSystem: CRITICAL - GameStateManager not found!");
            // Cannot function correctly without state manager
            return; // Stop initialization
        }
        // --- END ADDITION ---

        if (!this._initialized) {
             window.addEventListener('keydown', this._handleKeyDown);
             // --- MODIFIED: Listen for game state changes instead of engine mode ---
             // emitter.on('gameModeEntered', this._onGameModeEntered); // REMOVED
             // emitter.on('editorModeEntered', this._onEditorModeEntered); // REMOVED
             emitter.on('gameStateChanged', this._onGameStateChanged);
             // --- END MODIFICATION ---
             this._initialized = true;
        }
        console.log("[Breakout] BreakoutGameSystem Initialized");
        // Trigger initial setup based on current state from manager
        this._onGameStateChanged({ current: this.gameStateManager.getState() });
    }

    // --- ADDED: Handle Game State Changes ---
    _onGameStateChanged({ previous, current }) {
        console.log(`[Breakout] Game state changed to: ${current}`);
        // Activate/Deactivate based on state
        // This system should generally only be active during PLAYING state.
        this.active = (current === GameState.PLAYING);

        if (current === GameState.PLAYING && previous !== GameState.PAUSED) {
            // If starting to play (or resuming from non-paused), ensure entities are found/reset
             console.log("[Breakout] BreakoutGameSystem: Game state is PLAYING. Finding entities / resetting.");
             this._findGameEntities(); // This will set state to WAITING_TO_LAUNCH if ball isn't launched
             if (this.uiSystem) {
                 this.uiSystem.show();
                 this.uiSystem.updateGameState(this.gameStateManager?.getState() ?? GameState.LOADING); // Update UI based on potentially changed state
             }
        } else if (current === GameState.EDITOR) {
            // Deactivate and clean up game elements when entering editor
             console.log("[Breakout] BreakoutGameSystem: Game state is EDITOR. Deactivating.");
             this.active = false;
             this.ballEntityId = null; this.paddleEntityId = null; this.gameStateEntityId = null;
             this._entitiesFound = false; this.brickCount = 0;
             this.uiSystem?.hide();
        } else if (current === GameState.GAME_OVER || current === GameState.LEVEL_COMPLETE) {
             // Ensure system is inactive but UI shows correct message
             this.active = false;
             this.uiSystem?.updateGameState(current);
             // Stop the ball if physics system is available
             if (this.ballEntityId && this.physicsSystem) {
                 this.physicsSystem.setLinearVelocity(this.ballEntityId, {x:0, y:0, z:0}, false);
                 this.physicsSystem.setAngularVelocity(this.ballEntityId, {x:0, y:0, z:0}, false);
            }
        } else if (current === GameState.LOADING) {
             this.active = false;
             this.uiSystem?.updateGameState(current);
             this.uiSystem?.show(); // Show UI while loading potentially
        } else {
             // Handle other states like PAUSED, MAIN_MENU if needed
             this.uiSystem?.updateGameState(current); // Update UI message for other states
        }
    }
    // --- END ADDITION ---

    // --- REMOVED _onGameModeEntered / _onEditorModeEntered ---

    _findGameEntities() {
        // Ensure manager refs are still valid
        if (!this.entityManager || !this.gameStateManager) return;
        console.log("[Breakout] BreakoutGameSystem: Searching for game entities...");

        this.ballEntityId = null; this.paddleEntityId = null; this.gameStateEntityId = null;
        this.brickCount = 0;

        const taggedEntities = this.entityManager.getEntitiesWithComponent('tag');
        for (const entityId of taggedEntities) { /* ... (find logic unchanged) ... */ const tagComp = this.entityManager.getComponent(entityId, 'tag'); if (tagComp?.tags?.includes('gameBall')) this.ballEntityId = entityId; if (tagComp?.tags?.includes('playerPaddle')) this.paddleEntityId = entityId; if (tagComp?.tags?.includes('gameStateManager')) this.gameStateEntityId = entityId; }
        const brickEntities = this.entityManager.getEntitiesWithComponent('brick');
        this.brickCount = brickEntities.length;

        let foundAllRequired = true;
        if (this.ballEntityId === null) { console.warn("[Breakout] BreakoutGameSystem: Ball entity ('gameBall' tag) not found."); foundAllRequired = false; }
        if (this.paddleEntityId === null) { console.warn("[Breakout] BreakoutGameSystem: Paddle entity ('playerPaddle' tag) not found."); foundAllRequired = false; }
        if (this.gameStateEntityId === null) { console.warn("[Breakout] BreakoutGameSystem: GameState entity ('gameStateManager' tag with ScoreComponent) not found."); foundAllRequired = false; }

        if (foundAllRequired) {
            console.log(`[Breakout] BreakoutGameSystem: Found required entities (Ball: ${this.ballEntityId}, Paddle: ${this.paddleEntityId}, State: ${this.gameStateEntityId}, Bricks: ${this.brickCount}).`);
            this._entitiesFound = true;

            const scoreComp = this.entityManager.getComponent(this.gameStateEntityId, 'score');
            if (this.uiSystem && scoreComp) {
                this.uiSystem.updateScore(scoreComp.score ?? breakoutConfig.score.initialScore);
                this.uiSystem.updateLives(scoreComp.lives ?? INITIAL_LIVES);
            }
             if (this.uiSystem) this.uiSystem.updateBrickCount(this.brickCount);

            // --- MODIFIED: Set game state via manager ---
            const ballComp = this.entityManager.getComponent(this.ballEntityId, 'ball');
            if (ballComp && !ballComp.isLaunched) {
                 this._resetBall();
                 // Check if current state is already appropriate (e.g. PLAYING)
                 // If not, set it to WAITING_TO_LAUNCH
                 if (this.gameStateManager.getState() === GameState.PLAYING) {
                      this.gameStateManager.setState(GameState.WAITING_TO_LAUNCH);
                 }
            } else if (ballComp?.isLaunched) {
                 // If ball launched, ensure state is PLAYING
                 if (this.gameStateManager.getState() !== GameState.PLAYING) {
                      this.gameStateManager.setState(GameState.PLAYING);
                 }
            } else {
                 console.warn("[Breakout] BreakoutGameSystem: Ball found but state is unclear.");
                 this.gameStateManager.setState(GameState.LOADING); // Revert to loading/error state
            }
            // No need to update UI state here, _onGameStateChanged handles it
            // --- END MODIFICATION ---

        } else {
             console.warn("[Breakout] BreakoutGameSystem: Could not find all required game entities. Game logic may not run correctly.");
             this._entitiesFound = false;
             this.gameStateManager.setState(GameState.LOADING); // Indicate error/loading issue
        }
    }

    _handleKeyDown(event) {
        // Ensure manager refs are valid
        if (!this.gameStateManager || !this.entityManager) return;

        const currentState = this.gameStateManager.getState();

        if (event.code === 'Space') {
            if (currentState === GameState.WAITING_TO_LAUNCH) {
                this._launchBall();
            } else if (currentState === GameState.GAME_OVER || currentState === GameState.LEVEL_COMPLETE) {
                console.log("[Breakout] Restart requested.");
                const scoreComp = this.entityManager.getComponent(this.gameStateEntityId, 'score');
                if(scoreComp) {
                    scoreComp.score = breakoutConfig.score.initialScore;
                    scoreComp.lives = INITIAL_LIVES;
                    this.uiSystem?.updateScore(scoreComp.score);
                    this.uiSystem?.updateLives(scoreComp.lives);
                }
                 // TODO: Reload level properly. For now, just reset ball and state.
                 // Need to find bricks again, potentially reload scene?
                 this.brickCount = this.entityManager.getEntitiesWithComponent('brick').length; // Recount bricks (won't work if removed)
                 this.uiSystem?.updateBrickCount(this.brickCount);

                 if (this._resetBall()) {
                     this.gameStateManager.setState(GameState.WAITING_TO_LAUNCH); // Set state
                 } else {
                     this.gameStateManager.setState(GameState.LOADING); // Error resetting ball
                 }
            }
        }
        // --- ADDED: Example Pause Handling ---
        else if (event.key === 'p' || event.key === 'P') {
            if (currentState === GameState.PLAYING) {
                 this.gameStateManager.setState(GameState.PAUSED);
                 this.engine.time.gameTimeScale = 0.0; // Freeze time
            } else if (currentState === GameState.PAUSED) {
                 this.engine.time.gameTimeScale = 1.0; // Resume time
                 this.gameStateManager.setState(GameState.PLAYING);
            }
        }
        // --- END ADDITION ---
    }

    _launchBall() {
        if (!this.ballEntityId || !this.physicsSystem || !this.entityManager.hasEntity(this.ballEntityId) || !this.gameStateManager) return;
        const ballComp = this.entityManager.getComponent(this.ballEntityId, 'ball');
        if (!ballComp || ballComp.isLaunched) return;

        const impulseStrength = ballComp.baseSpeed;
        const randomX = (Math.random() - 0.5) * (impulseStrength * 0.4);
        const impulseY = Math.sqrt(impulseStrength*impulseStrength - randomX*randomX);

        this.physicsSystem.resetForces(this.ballEntityId, true);
        this.physicsSystem.resetTorques(this.ballEntityId, true);
        const successLinvel = this.physicsSystem.setLinearVelocity(this.ballEntityId, { x: randomX, y: impulseY, z: 0 }, true);
        const successAngvel = this.physicsSystem.setAngularVelocity(this.ballEntityId, { x: 0, y: 0, z: 0 }, true);

        if (successLinvel && successAngvel) {
            ballComp.isLaunched = true;
            this.entityManager.addComponent(this.ballEntityId, 'ball', { isLaunched: true });
            // --- MODIFIED: Set state via manager ---
            this.gameStateManager.setState(GameState.PLAYING);
            // --- END MODIFICATION ---
            console.log("[Breakout] Ball Launched!");
        } else {
             console.error("[Breakout] BreakoutGameSystem: Failed to set ball velocity via physics system.");
             this.gameStateManager.setState(GameState.LOADING); // Error state
        }
    }

    // --- MODIFIED: Use GameStateManager ---
    _handleGameOver() {
         if (!this.gameStateManager) return;
         this.gameStateManager.setState(GameState.GAME_OVER);
         console.log("[Breakout] Game Over!");
         // Ball stop logic now handled by _onGameStateChanged
    }
    // --- END MODIFICATION ---

    _resetBall() {
        // Logic for positioning ball remains the same...
        /* ... (Reset ball position logic unchanged) ... */
        if (!this.ballEntityId || !this.paddleEntityId || !this.physicsSystem || !this.entityManager.hasEntity(this.ballEntityId) || !this.entityManager.hasEntity(this.paddleEntityId) ) { console.warn("[Breakout] BreakoutGameSystem: Cannot reset ball - missing entities or systems."); return false; }
        const ballComp = this.entityManager.getComponent(this.ballEntityId, 'ball'); const paddleTransform = this.entityManager.getComponent(this.paddleEntityId, 'transform'); const ballTransform = this.entityManager.getComponent(this.ballEntityId, 'transform');
        if (!ballComp || !paddleTransform || !ballTransform) { console.warn("[Breakout] BreakoutGameSystem: Cannot reset ball - missing components."); return false; }
        const targetPosition = { x: paddleTransform.position[0], y: paddleTransform.position[1] + (paddleTransform.scale[1] * 0.5) + (ballTransform.scale[1] * 0.5) + 0.1, z: paddleTransform.position[2] };
        const posSuccess = this.physicsSystem.setPosition(this.ballEntityId, targetPosition, true); const linVelSuccess = this.physicsSystem.setLinearVelocity(this.ballEntityId, { x: 0, y: 0, z: 0 }, false); const angVelSuccess = this.physicsSystem.setAngularVelocity(this.ballEntityId, { x: 0, y: 0, z: 0 }, false);
        if (posSuccess && linVelSuccess && angVelSuccess) { if (ballComp.isLaunched) { ballComp.isLaunched = false; } return true; }
        else { console.error("[Breakout] BreakoutGameSystem: Failed to reset ball state via physics system."); if(this.gameStateManager) this.gameStateManager.setState(GameState.LOADING); return false; }
    }

    update(time) {
        // --- MODIFIED: Check active flag (set by state manager) and ensure manager exists ---
        if (!this.active || !this.gameStateManager) return;
        // --- END MODIFICATION ---

        // Ensure required systems are available
        if (!this.entityManager || !this.physicsSystem || !this.uiSystem) {
             if (!this.physicsSystem) this.physicsSystem = this.engine?.getSystem('physics');
             if (!this.uiSystem) this.uiSystem = this.engine?.getSystem('gameUI');
             if (!this.entityManager || !this.physicsSystem || !this.uiSystem) { return; }
        }
        // Ensure entities found
        if (!this._entitiesFound) { this._findGameEntities(); if (!this._entitiesFound) { return; } }

        // --- MODIFIED: Removed redundant check for PLAYING state (handled by this.active) ---
        // if (this.gameState !== 'PLAYING') { return; }
        // --- END MODIFICATION ---

        // Ensure required entities still exist
        if (!this.ballEntityId || !this.gameStateEntityId || !this.paddleEntityId ||
            !this.entityManager.hasEntity(this.ballEntityId) ||
            !this.entityManager.hasEntity(this.gameStateEntityId) ||
            !this.entityManager.hasEntity(this.paddleEntityId))
        {
             console.error("[Breakout] BreakoutGameSystem Update: Required entity missing during gameplay!");
             this.gameStateManager.setState(GameState.LOADING); // Error state
            return;
        }

        // --- Collision Handling Logic ---
        const ballColliderHandle = this.physicsSystem.entityColliderMap?.get(this.ballEntityId);
        const scoreComp = this.entityManager.getComponent(this.gameStateEntityId, 'score');
        if (ballColliderHandle === undefined || !scoreComp) { return; }

        this._contacts = [];
        this.physicsSystem.world?.contactsWith(ballColliderHandle, (otherCollider) => { if (otherCollider.handle !== ballColliderHandle) { this._contacts.push(otherCollider.handle); } });

        let shouldResetBall = false;
        let levelComplete = false;

        for (const otherColliderHandle of this._contacts) {
            const otherEntityId = this.physicsSystem.colliderEntityMap?.get(otherColliderHandle);
            if (otherEntityId === undefined) continue;

            // Brick Collision
            if (this.entityManager.hasComponent(otherEntityId, 'brick')) {
                const brickComp = this.entityManager.getComponent(otherEntityId, 'brick');
                scoreComp.score += brickComp?.scoreValue ?? BRICK_DEFAULT_SCORE;
                this.uiSystem.updateScore(scoreComp.score);
                this.engine?.removeEntity(otherEntityId);
                this.brickCount--;
                this.uiSystem.updateBrickCount(this.brickCount);
                if (this.brickCount <= 0) { levelComplete = true; break; }
            }
            // Boundary Collision (Floor)
            else if (this.entityManager.hasComponent(otherEntityId, 'boundary')) {
                const boundaryComp = this.entityManager.getComponent(otherEntityId, 'boundary');
                if (boundaryComp?.type === 'floor') {
                    scoreComp.lives--;
                    this.uiSystem.updateLives(scoreComp.lives);
                    if (scoreComp.lives <= 0) {
                        this._handleGameOver(); // Calls setState(GAME_OVER)
                        return; // Exit update immediately
                    } else {
                        shouldResetBall = true;
                    }
                }
            }
            // Paddle Collision (No action needed currently)
             else if (otherEntityId === this.paddleEntityId) { /* ... */ }

        } // End collision loop


        // --- Handle State Changes AFTER loop ---
        if (levelComplete) {
             this.gameStateManager.setState(GameState.LEVEL_COMPLETE); // Set state
             console.log("[Breakout] Level Complete!");
             // Ball stop logic now handled by _onGameStateChanged
        } else if (shouldResetBall) {
            if (this._resetBall()) {
                 // --- MODIFIED: Set state via manager ---
                 this.gameStateManager.setState(GameState.WAITING_TO_LAUNCH);
                 // --- END MODIFICATION ---
            }
        }


        // --- Fallback Out of Bounds Check ---
        // Check only needed if still playing
        if (this.gameStateManager.getState() === GameState.PLAYING) {
            const ballTransform = this.entityManager.getComponent(this.ballEntityId, 'transform');
            if (ballTransform && ballTransform.position[1] < FALL_BOUNDARY_Y) {
                console.warn(`[Breakout] Ball fell out of bounds (${FALL_BOUNDARY_Y}) (fallback check).`);
                scoreComp.lives--;
                this.uiSystem.updateLives(scoreComp.lives);
                if (scoreComp.lives <= 0) { this._handleGameOver(); } // Calls setState(GAME_OVER)
                else { if(this._resetBall()) { this.gameStateManager.setState(GameState.WAITING_TO_LAUNCH); } }
            }
        }
    } // End update

    cleanup() {
        console.log("[Breakout] Cleaning up BreakoutGameSystem...");
        // --- MODIFIED: Remove game state listener ---
        if (this._initialized && this.eventEmitter) {
            window.removeEventListener('keydown', this._handleKeyDown);
            // this.eventEmitter.off('gameModeEntered', this._onGameModeEntered); // REMOVED
            // this.eventEmitter.off('editorModeEntered', this._onEditorModeEntered); // REMOVED
            this.eventEmitter.off('gameStateChanged', this._onGameStateChanged);
        }
        // --- END MODIFICATION ---
        this.uiSystem?.hide();
        this.engine = null; this.entityManager = null; this.physicsSystem = null;
        this.eventEmitter = null; this.uiSystem = null; this.gameStateManager = null; // Clear ref
        this.ballEntityId = null; this.paddleEntityId = null; this.gameStateEntityId = null;
        this._initialized = false; this._entitiesFound = false;
        console.log("[Breakout] BreakoutGameSystem Cleaned Up.");
    }
} // End Class BreakoutGameSystem