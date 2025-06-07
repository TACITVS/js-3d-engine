// src/ecs/component.js
// @version 1.2.2 - Improved serialize() base method error message.
// @previous 1.2.1 - Enhanced JSDoc comments for clarity and standards.

/**
 * Abstract base class for all components within the Entity-Component-System (ECS) architecture.
 *
 * Components are primarily intended to store data (state) associated with an entity.
 * They should generally avoid containing complex logic, which is better suited for Systems.
 *
 * Lifecycle hooks (`onAdd`, `onRemove`, `onUpdate` [optional]) can be implemented
 * to react to the component being added to, removed from, or updated on an entity
 * via the `EntityManager`.
 *
 * Subclasses **must** define their specific data properties in their constructor.
 * Subclasses **must** override the `serialize` method to return a plain JavaScript
 * object representing only the component's persistent state, suitable for saving
 * and loading scenes. Failure to override `serialize` will result in a runtime error log
 * and potentially incorrect scene saving/loading.
 *
 * @class Component
 * @abstract
 */
export class Component {
    /**
     * Creates an instance of the base Component class.
     * Subclasses should call `super()` within their own constructors.
     * @constructor
     */
    constructor() {
        // Base class constructor. Subclasses define their properties here.
    }

    /**
     * Optional lifecycle hook called by the EntityManager *after*
     * this component instance has been successfully added to an entity.
     * Useful for initialization logic that depends on the component being attached.
     *
     * @param {number} entityId - The unique ID of the entity this component was added to.
     * @returns {void}
     * @virtual
     * @method onAdd
     * @memberof Component
     * @instance
     */
    onAdd(entityId) {
        // Default implementation does nothing. Subclasses can override this.
        // console.log(`Component ${this.constructor.name} added to entity ${entityId}`);
    }

    /**
     * Optional lifecycle hook called by the EntityManager *before*
     * this component instance is removed from an entity.
     * Useful for cleanup logic specific to this component instance, like
     * releasing external resources or nullifying references it might hold.
     *
     * @returns {void}
     * @virtual
     * @method onRemove
     * @memberof Component
     * @instance
     */
    onRemove() {
        // Default implementation does nothing. Subclasses can override this.
        // console.log(`Component ${this.constructor.name} removed from entity`);
    }

		/**
		 * Optional lifecycle hook called by the EntityManager *after* an existing
		 * component instance's data has been updated via `entityManager.addComponent`.
		 * Note: This is not a standard ECS pattern, but can be useful in some cases.
		 *
		 * @param {object} updateData - The data object that was passed to `addComponent` for the update.
     * @returns {void}
     * @virtual
     * @method onUpdate
     * @memberof Component
     * @instance
     */
    onUpdate(updateData) {
        // Default implementation does nothing. Subclasses can override this.
        // console.log(`Component ${this.constructor.name} updated with data:`, updateData);
		}

    /**
     * Retrieves a plain JavaScript object representation of the component's
     * persistent state, suitable for serialization (e.g., saving to JSON).
     *
     * **Subclasses MUST override this method.** Failure to do so will result in a
     * console error and incorrect serialization. The override should return a plain object
     * containing only the data needed to reconstruct the component's state, excluding
     * runtime references (like DOM elements, renderer objects) or transient data.
     *
     * @returns {object} A serializable plain JavaScript object representing the component's persistent state.
     * @virtual
     * @method serialize
     * @memberof Component
     * @instance
     */
    serialize() {
        // --- MODIFIED ERROR MESSAGE ---
        // This base implementation should NOT be used directly.
        // It logs an error to alert developers they forgot to override it.
        console.error(
            `🔴 SERIALIZATION ERROR: Component class "${this.constructor.name}" MUST override the 'serialize()' method. ` +
            `Falling back to an empty object, but this component's state will NOT be saved correctly. ` +
            `Please implement 'serialize()' in ${this.constructor.name}.js`
        );
        // --- END MODIFICATION ---

        // Returning an empty object prevents accidental saving of potentially problematic
        // default properties but highlights the missing implementation.
        return {};
    }
}