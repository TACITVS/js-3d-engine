// src/systems/game-state-manager.js
// @version 1.1.0 - Added explicit GameState constants.
// @previous 1.0.0 - Initial implementation

/**
 * Defines standard game state identifiers.
 * Using constants helps prevent typos and improves code readability.
 */
export const GameState = Object.freeze({
    INITIALIZING: 'INITIALIZING', // State before engine/systems are ready
    EDITOR: 'EDITOR',             // Editor mode is active
    LOADING: 'LOADING',           // Loading assets or scene for gameplay
    MAIN_MENU: 'MAIN_MENU',       // Main menu screen
    PLAYING: 'PLAYING',           // Core gameplay loop active
    PAUSED: 'PAUSED',             // Gameplay is paused
    GAME_OVER: 'GAME_OVER',       // Game over screen
    LEVEL_COMPLETE: 'LEVEL_COMPLETE', // Level complete screen
    CLEANED_UP: 'CLEANED_UP'      // Engine is shutting down
    // Add more states as needed (e.g., CUTSCENE, INVENTORY)
});

/**
 * Manages the overall state of the application/game.
 * Emits events when the state changes, allowing other systems to react.
 * Uses constants defined in `GameState`.
 *
 * @class GameStateManager
 */
export class GameStateManager {
    constructor() {
        this.priority = 1; // Run extremely early
        this.active = true; // Always active
        this._name = 'gameStateManager';

        /** @private @type {string} The current state, uses values from GameState object */
        this._currentState = GameState.INITIALIZING;
        /** @private @type {import('../utils/event-emitter.js').EventEmitter|null} */
        this.eventEmitter = null;
    }

    /**
     * Initializes the system.
     * @param {import('../ecs/entity-manager.js').EntityManager} entityManager - Unused
     * @param {import('../utils/event-emitter.js').EventEmitter} eventEmitter
     * @param {import('../core.js').Engine} engine
     */
    async initialize(entityManager, eventEmitter, engine) {
        this.eventEmitter = eventEmitter;
        const initialEngineMode = engine.getMode();
        // Use GameState constants for initial state
        this._currentState = (initialEngineMode === 'game') ? GameState.LOADING : GameState.EDITOR; // Start in LOADING if game mode, EDITOR otherwise
        console.log(`[GameStateManager] Initialized. Initial state set to: ${this._currentState}`);
        // Emit initial state using constants
        this.eventEmitter?.emit('gameStateChanged', { previous: GameState.INITIALIZING, current: this._currentState });
    }

    /**
     * Gets the current game state.
     * @returns {string} The current state identifier (value from GameState).
     */
    getState() {
        return this._currentState;
    }

    /**
     * Sets a new game state and emits an event.
     * Ensures the newState is a valid known state (or logs warning).
     * @param {string} newState - The identifier for the new state (should be a value from GameState).
     * @param {object} [eventData={}] - Optional additional data to include in the event payload.
     * @returns {boolean} True if the state was changed, false otherwise.
     */
    setState(newState, eventData = {}) {
        // Validate newState against defined states
        if (typeof newState !== 'string' || !Object.values(GameState).includes(newState)) {
            console.warn(`[GameStateManager] Attempted to set invalid state: '${newState}'. Valid states are:`, Object.values(GameState));
            // Option 1: Prevent setting invalid state
             return false;
            // Option 2: Allow setting any string but log warning (less safe)
            // console.warn(`[GameStateManager] Setting potentially invalid state: '${newState}'`);
        }

        const previousState = this._currentState;
        if (previousState === newState) {
            return false; // State hasn't changed
        }

        this._currentState = newState;
        console.log(`[GameStateManager] State changed from '${previousState}' to '${newState}'`);

        // Emit using constants
        this.eventEmitter?.emit('gameStateChanged', {
            previous: previousState,
            current: this._currentState,
            ...eventData
        });

        return true;
    }

    update(time) {
        // No update logic needed for now
    }

    cleanup() {
        console.log("[GameStateManager] Cleaning up.");
        this._currentState = GameState.CLEANED_UP; // Use constant
        this.eventEmitter = null;
    }
}