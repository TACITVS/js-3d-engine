import * as logger from '../utils/logger.js';
// src/ecs/system-manager.js - System management and update loop
// @version 1.2.2 - Added logging within the update loop to trace system execution attempts.
// @previous 1.2.1 - Added robustness checks for registration, update loop, and state setting.

// Type Imports for JSDoc
/** @typedef {import('./entity-manager.js').EntityManager} EntityManager */
/** @typedef {import('../utils/event-emitter.js').EventEmitter} EventEmitter */
/** @typedef {import('../core.js').Engine} Engine */

/**
 * Defines the timing information passed to system update methods.
 * @typedef {object} SystemTiming
 * @property {number} deltaTime - Time elapsed since the last frame in seconds. Scaled by `gameTimeScale`.
 * @property {number} elapsed - Total time elapsed since the engine started in seconds.
 * @property {number} lastFrameTime - The timestamp of the last frame (from performance.now()).
 * @property {number} gameTimeScale - Multiplier for delta time (e.g., 1.0 for normal speed, 0.5 for slow-mo).
 */

/**
 * Defines the internal state tracked for each registered system.
 * @typedef {object} SystemState
 * @property {boolean} isInitialized - Whether the system's `initialize()` method has completed successfully.
 * @property {number} priority - Execution priority (lower numbers run first within the update loop).
 * @property {boolean} isActive - Whether the system should currently be updated (controlled by engine mode, etc.).
 */

/**
 * Represents the interface that all systems registered with the SystemManager
 * should adhere to. Systems encapsulate logic that operates on entities and components.
 * @interface ISystem
 */
// --- Interface Definition (Conceptual) ---
// interface ISystem {
//     /** Execution priority (lower runs first). Optional, defaults to 0. */
//     priority?: number;
//     /** Initial active state. Optional, defaults to true. */
//     active?: boolean;
//     /** System name (optional, for debugging) */
//     _name?: string;
//
//     /** Called once during registration. Use for setup, getting dependencies. */
//     initialize?(entityManager: EntityManager, eventEmitter: EventEmitter, engine: Engine): Promise<void> | void;
//
//     /** Called before the main update phase. */
//     preUpdate?(time: SystemTiming): void;
//     /** The main update logic for the system. */
//     update?(time: SystemTiming): void;
//     /** Called after the main update phase. */
//     postUpdate?(time: SystemTiming): void;
//
//     /** Called once during unregistration or engine shutdown. Use for cleanup. */
//     cleanup?(): void;
// }
// --- End Interface Definition ---


/**
 * Manages the registration, initialization, update loop execution (based on priority
 * and active state), and cleanup of all systems within the engine.
 * Ensures systems are updated in a defined order and provides error handling during updates.
 *
 * @class SystemManager
 */
export class SystemManager {
    /**
     * Creates a SystemManager instance.
     * @param {EntityManager} entityManager - Reference to the EntityManager.
     * @param {EventEmitter} eventEmitter - Reference to the EventEmitter.
     * @param {Engine} engine - Reference to the main Engine instance.
     * @throws {Error} If any of the required dependencies (entityManager, eventEmitter, engine) are missing.
     */
    constructor(entityManager, eventEmitter, engine) {
        if (!entityManager || !eventEmitter || !engine) {
            throw new Error("SystemManager requires EntityManager, EventEmitter, and Engine instances.");
        }
        this.entityManager = entityManager;
        this.eventEmitter = eventEmitter;
        this.engine = engine;
        /** @private @type {Map<string, ISystem>} */
        this.systems = new Map();
        /** @private @type {Map<string, SystemState>} */
        this.systemStates = new Map();
        /** @private @type {string[]} */
        this.executionOrder = [];
        /** @private */
        this._updateCounter = 0;

        // --- ADDED: Track logging state ---
        /** @private */
        this._loggedSystems = new Set();
        /** @private */
        this._loggedSkips = new Set();
        // --- END ADDED ---


        logger.log(`[SystemManager Constructor] Initialized.`);
    }

    /**
     * Registers a system instance with the manager.
     * - Validates the system object and its required `initialize` method.
     * - Stores the system instance and its initial state.
     * - Asynchronously calls the system's `initialize` method, passing dependencies.
     * - Re-sorts the execution order upon successful initialization.
     * - Logs errors and cleans up if initialization fails.
     *
     * @param {string} name - A unique name for the system (e.g., 'renderer', 'physics').
     * @param {ISystem} system - The system instance to register. Must implement `ISystem` interface, minimally the `initialize` method.
     * @returns {Promise<void>} A promise that resolves when the system is successfully registered and initialized, or rejects/throws if initialization fails critically.
     * @async
     * @method register
     * @memberof SystemManager
     * @instance
     */
    async register(name, system) {
        // --- Validation ---
        if (typeof name !== 'string' || name.trim() === '') {
             logger.error(`[SystemManager Register] Invalid system name provided: "${name}". Registration failed.`);
             return Promise.reject(new Error("System name must be a non-empty string."));
        }
        if (!system || typeof system !== 'object') {
            logger.error(`[SystemManager Register] Invalid system object provided for name "${name}". Registration failed.`);
            return Promise.reject(new Error("Invalid system object provided."));
        }
        // ---

        if (typeof system.initialize !== 'function') {
            logger.warn(`[SystemManager Register ${name}] System does not have an 'initialize' method. Initialization will be skipped.`);
        }
        if (typeof system.update !== 'function' && typeof system.preUpdate !== 'function' && typeof system.postUpdate !== 'function') {
            logger.warn(`[SystemManager Register ${name}] System does not have 'update', 'preUpdate', or 'postUpdate' methods. It may not do anything.`);
        }
        if (this.systems.has(name)) {
             logger.warn(`[SystemManager Register ${name}] System already registered. Overwriting.`);
             this.unregister(name); // Unregister previous one cleanly
        }

        logger.log(`[SystemManager Register] Registering system "${name}"...`);
        this.systems.set(name, system);

        // --- Validate priority ---
        let priority = system.priority;
        if (typeof priority !== 'number' || !isFinite(priority)) {
             logger.warn(`[SystemManager Register ${name}] System provided invalid priority (${priority}). Using default 0.`);
             priority = 0;
        }
        // ---

        const initialActive = system.active !== undefined ? !!system.active : true; // Ensure boolean
        this.systemStates.set(name, { isInitialized: false, priority, isActive: initialActive });

        try {
            if (typeof system.initialize === 'function') {
                await system.initialize(this.entityManager, this.eventEmitter, this.engine);
            }
            const state = this.systemStates.get(name);
            if (state) state.isInitialized = true; // Only mark initialized if registration succeeded
            logger.log(`[SystemManager Register] System "${name}" initialized successfully.`);
            this._sortSystems(); // Sorts and clears logged state
        } catch (error) {
            logger.error(`[SystemManager Register] CRITICAL ERROR initializing system "${name}":`, error);
            // Clean up partially registered state
            this.systems.delete(name);
            this.systemStates.delete(name);
            // Re-throw the error to signal failure to the caller
            throw error;
        }
    }

    /**
     * Unregisters a system by its unique name.
     * - Calls the system's `cleanup` method (if defined).
     * - Removes the system instance and its state from internal storage.
     * - Re-sorts the execution order.
     *
     * @param {string} name - Name of the system to unregister.
     * @returns {void}
     * @method unregister
     * @memberof SystemManager
     * @instance
     */
    unregister(name) {
        const system = this.systems.get(name);
        if (!system) { return; } // System not registered

        if (typeof system.cleanup === 'function') {
            try {
                system.cleanup();
                // logger.log(`[SystemManager Unregister] Cleaned up system "${name}".`);
            } catch (error) {
                logger.error(`[SystemManager Unregister] Error cleaning up system "${name}":`, error);
            }
        }
        this.systems.delete(name);
        this.systemStates.delete(name);
        // Clean up logged state
        this._loggedSystems.delete(name);
        this._loggedSkips.delete(name); // Potential issue: This only deletes exact match, not pattern
        // Clear all skip logs related to this system name
        this._loggedSkips.forEach(key => {
            if (key.startsWith(`${name}_`)) {
                this._loggedSkips.delete(key);
            }
        });

        this._sortSystems(); // Sorts and clears logged state again
        // logger.log(`[SystemManager Unregister] Unregistered system "${name}".`);
    }

    /**
     * Retrieves a registered system instance by its unique name.
     *
     * @param {string} name - The unique name of the system.
     * @returns {ISystem | undefined} The system instance if found, otherwise `undefined`.
     * @method get
     * @memberof SystemManager
     * @instance
     */
    get(name) {
        return this.systems?.get(name);
    }

    /**
     * Executes the update cycle (`preUpdate`, `update`, `postUpdate`) for all registered systems
     * that are currently active and initialized, respecting the defined execution order.
     * Includes enhanced error logging for exceptions occurring within system update methods.
     *
     * @param {SystemTiming} time - Timing information for the current frame.
     * @throws {Error} Re-throws any error caught during a system's update methods to halt the engine loop.
     * @method update
     * @memberof SystemManager
     * @instance
     */
    update(time) {
        this._updateCounter++;

        // --- Validation ---
        if (!time || typeof time.deltaTime !== 'number' || !isFinite(time.deltaTime)) {
             logger.error(`[SystemManager Update Loop #${this._updateCounter}] Invalid time object received. Aborting update.`, time);
             this.engine?.stop();
             return;
        }
        if (!Array.isArray(this.executionOrder)) {
             logger.error(`[SystemManager Update Loop #${this._updateCounter}] FATAL: this.executionOrder is not an array! Cannot update.`, this.executionOrder);
             this.engine?.stop();
             return;
        }
        // ---

        for (const name of this.executionOrder) {
            const system = this.systems.get(name);
            const state = this.systemStates.get(name);

            // Skip if system/state missing, not initialized, or not active
            if (!system || !state || !state.isInitialized || !state.isActive) {
                 // Log skip reason ONCE per mode change
                 const skipKey = `${name}_${state?.isInitialized}_${state?.isActive}`;
                 if (!this._loggedSkips.has(skipKey)) {
                     if (!system) logger.log(`[SM Update Skip] System '${name}' not found.`);
                     else if (!state) logger.log(`[SM Update Skip] State for system '${name}' not found.`);
                     else if (!state.isInitialized) logger.log(`[SM Update Skip] System '${name}' is NOT initialized.`);
                     else if (!state.isActive) logger.log(`[SM Update Skip] System '${name}' is INACTIVE.`);
                     this._loggedSkips.add(skipKey);
                 }
                continue;
            }

            // Log system execution ONCE per mode change
             if (!this._loggedSystems.has(name)) {
                  logger.log(`[SM Update EXEC] >>> EXECUTING system '${name}' (Active: ${state.isActive}, Prio: ${state.priority})`);
                  this._loggedSystems.add(name);
             }
             // Clear any previous skip logs for this system now that it's executing
             this._loggedSkips.forEach(key => {
                 if (key.startsWith(`${name}_`)) {
                     this._loggedSkips.delete(key);
                 }
             });

            try {
                // Execute lifecycle methods if they exist
                system.preUpdate?.(time);
                system.update?.(time);
                system.postUpdate?.(time);
            } catch (error) {
                 logger.error(`\n--- !!! RUNTIME ERROR in System: "${name}" !!! ---`);
                 logger.error(`[SystemManager Update Loop #${this._updateCounter}]`);
                 logger.error("Error Details:", error);
                 logger.error("Failing System Instance:", system);
                 logger.error("--- End System Error --- \n");
                 throw error; // Re-throw to stop the engine loop
            }
        }
    }

    /**
     * Sorts the `executionOrder` array based on system priorities stored in `systemStates`.
     * Lower priority numbers execute first. Called internally after registration,
     * unregistration, or priority changes.
     * @private
     */
    _sortSystems() {
        this.executionOrder = Array.from(this.systemStates.entries())
            .sort(([, stateA], [, stateB]) => stateA.priority - stateB.priority)
            .map(([name]) => name);
        // Clear logged state whenever order changes
        this._loggedSystems.clear();
        this._loggedSkips.clear();
        // logger.log("[SystemManager] System execution order updated:", this.executionOrder);
    }

    /**
     * Sets the execution priority for a registered system and re-sorts the execution order.
     *
     * @param {string} name - The unique name of the system.
     * @param {number} priority - The new priority value (lower numbers run earlier).
     * @returns {void}
     * @method setPriority
     * @memberof SystemManager
     * @instance
     */
    setPriority(name, priority) {
         const state = this.systemStates.get(name);
        if (state) {
            if (typeof priority === 'number' && isFinite(priority)) {
                 if (state.priority !== priority) {
                      state.priority = priority;
                      this._sortSystems(); // Sorts and clears logged state
                 }
            } else {
                 logger.warn(`[SystemManager SetPriority ${name}] Invalid priority value "${priority}". Priority not changed.`);
            }
        } else {
            logger.warn(`[SystemManager SetPriority] Cannot set priority for unknown system: "${name}"`);
        }
    }

    /**
     * Sets the active state for a registered system.
     * Inactive systems will be skipped during the update loop.
     * This is typically controlled by the Engine based on the current mode ('editor'/'game').
     *
     * @param {string} name - The unique name of the system.
     * @param {boolean} isActive - `true` to activate the system, `false` to deactivate it.
     * @returns {void}
     * @method setSystemActive
     * @memberof SystemManager
     * @instance
     */
     setSystemActive(name, isActive) {
         if (typeof isActive !== 'boolean') {
              logger.warn(`[SystemManager SetActive ${name}] Invalid 'isActive' value provided (${isActive}). Must be boolean.`);
              return;
         }
         const state = this.systemStates.get(name);
          if (state) {
              if (!state.isInitialized) {
                  logger.warn(`[SystemManager SetActive ${name}] Attempted to set active state for uninitialized system. State change deferred.`);
                  return;
              }
              if (state.isActive !== isActive) {
                   state.isActive = isActive;
                   // Clear logged state when activation changes
                   this._loggedSystems.delete(name);
                   this._loggedSkips.clear(); // Clear all skip logs as activation changes might affect multiple systems
                   // logger.log(`[SystemManager SetActive] Set active state for system "${name}" to ${isActive}.`);
              }
          } else {
              logger.warn(`[SystemManager SetActive] Cannot set active state for unknown or unregistered system: "${name}"`);
          }
     }

     /**
      * Checks if a system is currently marked as active in the system's state map.
      *
      * @param {string} name - The unique name of the system.
      * @returns {boolean} `true` if the system state exists and is marked active, `false` otherwise.
      * @method isSystemActive
      * @memberof SystemManager
      * @instance
      */
     isSystemActive(name) {
         const state = this.systemStates.get(name);
         return state ? state.isActive : false;
     }


     /**
      * Gets an array of names for all currently registered systems.
      *
      * @returns {string[]} An array of system names.
      * @method getSystemNames
      * @memberof SystemManager
      * @instance
      */
     getSystemNames() { return Array.from(this.systems.keys()); }

     /**
      * Calls the `cleanup` method on all registered systems (if they have one)
      * and removes them from the manager. Intended for use during engine shutdown.
      * @returns {void}
      * @method cleanupAll
      * @memberof SystemManager
      * @instance
      */
     cleanupAll() {
         logger.log("[SystemManager Cleanup] Cleaning up all systems...");
         const names = Array.from(this.systems.keys());
         for (const name of names) {
             this.unregister(name); // unregister handles cleanup call and clearing logged state
         }
         this.systems.clear(); this.systemStates.clear();
         this.executionOrder = [];
         this._loggedSystems.clear(); this._loggedSkips.clear(); // Final clear
         logger.log("[SystemManager Cleanup] All systems unregistered and cleaned up.");
     }

} // End SystemManager Class