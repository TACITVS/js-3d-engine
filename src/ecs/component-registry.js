// src/ecs/component-registry.js - Component type registration
// @version 1.1.0 - Added JSDoc documentation

// Import base class for type hinting in JSDoc.
// Ensures that registered components ideally inherit from Component.
import * as logger from '../utils/logger.js';
import { Component } from './component.js';

/**
 * Manages the registration and retrieval of component constructors (classes).
 *
 * This registry acts as a central lookup service for associating string identifiers
 * (component type names like 'transform', 'renderable') with their corresponding
 * JavaScript class definitions. This allows the engine, particularly the
 * EntityManager, to dynamically create instances of components based on scene data
 * or editor actions without needing hardcoded references to every component class.
 *
 * @class ComponentRegistry
 */
export class ComponentRegistry {
    /**
     * Creates an instance of ComponentRegistry.
     * Initializes an internal map to store the component type registrations.
     * @constructor
     */
    constructor() {
        /**
         * Stores registered component constructors, mapping type names (strings) to
         * the component class constructor functions.
         * @private
         * @type {Map<string, typeof Component>}
         * @memberof ComponentRegistry
         * @instance
         */
        this.componentTypes = new Map();
    }

    /**
     * Registers a component constructor with a unique string name.
     *
     * If a component type with the same name is already registered, it will be
     * overwritten, and a warning will be logged to the console. It's crucial
     * that component type names are unique within the engine.
     *
     * Basic validation ensures that the provided `componentConstructor` is actually
     * a function. While ideally it should be a class extending `Component`,
     * direct `instanceof` checks were removed due to potential module resolution
     * issues in some environments; relying on the type hint and runtime behavior.
     *
     * @param {string} name - The unique string identifier for the component type (e.g., 'transform', 'renderable', 'physics'). Case-sensitive.
     * @param {typeof Component} componentConstructor - The class constructor function for the component (e.g., `TransformComponent`, `RenderableComponent`).
     * @returns {this} The ComponentRegistry instance, allowing for method chaining (e.g., `registry.register(...).register(...)`).
     * @method register
     * @memberof ComponentRegistry
     * @instance
     */
    register(name, componentConstructor) {
        if (this.componentTypes.has(name)) {
            logger.warn(`[ComponentRegistry] Warning: Component type "${name}" is already registered. Overwriting.`);
        }

        // Basic validation: Check if it's a function.
        if (typeof componentConstructor !== 'function') {
             logger.error(`[ComponentRegistry] Error: Attempted to register non-function for component type "${name}". Registration skipped.`);
             return this; // Do not register invalid constructors
        }

        // Check if prototype exists (basic check for class-like structure)
        if (!componentConstructor.prototype) {
             logger.warn(`[ComponentRegistry] Warning: Registering component type "${name}" which might not be a standard class (missing prototype).`);
        }

        this.componentTypes.set(name, componentConstructor);
        // logger.log(`[ComponentRegistry] Registered component type: "${name}"`); // Optional log
        return this;
    }

    /**
     * Unregisters a component type by its unique name.
     * If the name is not found, this method does nothing.
     *
     * @param {string} name - The name of the component type to unregister.
     * @returns {this} The ComponentRegistry instance for method chaining.
     * @method unregister
     * @memberof ComponentRegistry
     * @instance
     */
    unregister(name) {
        const deleted = this.componentTypes.delete(name);
        // if (deleted) { logger.log(`[ComponentRegistry] Unregistered component type: "${name}"`); } // Optional log
        return this;
    }

    /**
     * Retrieves a component constructor function by its registered name.
     *
     * @param {string} name - The name of the component type to retrieve.
     * @returns {typeof Component | undefined} The component constructor function if found, otherwise `undefined`.
     * @method get
     * @memberof ComponentRegistry
     * @instance
     */
    get(name) {
        return this.componentTypes.get(name);
    }

    /**
     * Checks if a component type name has been registered.
     *
     * @param {string} name - The name of the component type to check.
     * @returns {boolean} `true` if the component type name is registered, `false` otherwise.
     * @method has
     * @memberof ComponentRegistry
     * @instance
     */
    has(name) {
        return this.componentTypes.has(name);
    }

    /**
     * Gets an array containing the string names of all currently registered component types.
     * The order of names in the array is not guaranteed.
     *
     * @returns {string[]} An array of registered component type names.
     * @method getComponentTypeNames
     * @memberof ComponentRegistry
     * @instance
     */
    getComponentTypeNames() {
        return Array.from(this.componentTypes.keys());
    }
}