import * as logger from '../utils/logger.js';
// src/ecs/prefab-manager.js
// @version 1.1.0 - Added listPrefabs method

/** @typedef {import('./entity-manager').EntityManager} EntityManager */

/**
 * Manages the creation, saving, and instantiation of entity prefabs.
 * Currently uses localStorage for persistence (simple, but not recommended for production).
 *
 * @class PrefabManager
 */
export class PrefabManager {
    /**
     * Creates an instance of PrefabManager.
     * @param {EntityManager} entityManager - Reference to the EntityManager.
     */
    constructor(entityManager) {
        if (!entityManager) throw new Error("PrefabManager requires an EntityManager instance.");
        /** @type {EntityManager} */
        this.entityManager = entityManager;
        /**
         * Prefix used for storing prefabs in localStorage.
         * @private
         * @const {string}
         */
        this.localStoragePrefix = 'prefab_';
    }

    /**
     * Saves the state of a given entity as a named prefab in localStorage.
     * Overwrites any existing prefab with the same name.
     *
     * @param {number} entityId - The ID of the entity to save as a prefab.
     * @param {string} prefabName - The name to assign to the prefab. Must not be empty.
     * @returns {boolean} `true` if saved successfully, `false` otherwise.
     * @throws {Error} If prefabName is empty or entityId does not exist.
     */
    savePrefab(entityId, prefabName) {
        if (!prefabName || typeof prefabName !== 'string' || prefabName.trim() === '') {
            throw new Error("Prefab name cannot be empty.");
        }
        if (!this.entityManager.hasEntity(entityId)) {
            throw new Error(`Entity ${entityId} not found, cannot save as prefab.`);
        }

        logger.log(`[PrefabManager] Saving entity ${entityId} as prefab "${prefabName}"...`);
        try {
            const entityState = this.entityManager.getEntityState(entityId);
            if (!entityState) {
                 throw new Error(`Failed to get state for entity ${entityId}.`);
            }

            // Store the entity's state (excluding its original ID) under the prefab name.
            // We only need the component data for instantiation.
            const prefabData = {
                 components: entityState.components // Store only the components part
            };

            const key = this.localStoragePrefix + prefabName.trim();
            localStorage.setItem(key, JSON.stringify(prefabData));
            logger.log(`[PrefabManager] Prefab "${prefabName}" saved.`);
            return true;
        } catch (error) {
            logger.error(`[PrefabManager] Error saving prefab "${prefabName}" for entity ${entityId}:`, error);
            return false;
        }
    }

    /**
     * Creates a new entity instance from a saved prefab configuration.
     *
     * @param {string} prefabName - The name of the prefab to instantiate.
     * @returns {number | null} The ID of the newly created entity, or `null` if instantiation fails.
     */
    createEntityFromPrefab(prefabName) {
        if (!prefabName || typeof prefabName !== 'string' || prefabName.trim() === '') {
            logger.error("[PrefabManager] Prefab name cannot be empty for instantiation.");
            return null;
        }

        const key = this.localStoragePrefix + prefabName.trim();
        const storedData = localStorage.getItem(key);

        if (!storedData) {
            logger.error(`[PrefabManager] Prefab "${prefabName}" not found in localStorage.`);
            return null;
        }

        logger.log(`[PrefabManager] Instantiating prefab "${prefabName}"...`);
        try {
            const prefabData = JSON.parse(storedData);
            if (!prefabData || typeof prefabData.components !== 'object') {
                 throw new Error("Invalid prefab data format retrieved from storage.");
            }

            // Create a new entity
            const newEntityId = this.entityManager.createEntity();
            if (newEntityId === null) {
                 throw new Error("EntityManager failed to create a new entity ID.");
            }

            logger.log(`[PrefabManager] Created new entity ${newEntityId} for prefab "${prefabName}". Restoring components...`);

            // Add components from the prefab data to the new entity
            let success = true;
            for (const [componentType, componentData] of Object.entries(prefabData.components)) {
                 // Hierarchy (parent) should NOT be restored directly from prefab,
                 // instantiated prefabs become roots by default. Children ARE restored.
                 let dataToRestore = componentData;
                 if (componentType === 'transform' && componentData) {
                      // Ensure parent is null/undefined when restoring from prefab
                      dataToRestore = { ...componentData, parent: null };
                      // Children will be handled automatically if they exist in the prefab data
                 }

                 if (!this.entityManager.addComponent(newEntityId, componentType, dataToRestore)) {
                     logger.error(`[PrefabManager] Failed to add component '${componentType}' to entity ${newEntityId} from prefab "${prefabName}".`);
                     success = false;
                     // Decide whether to continue adding other components or fail completely
                     // break; // Uncomment to stop on first component failure
                 }
            }

            if (!success) {
                 // Optionally remove the partially created entity if component adding failed critically
                 logger.warn(`[PrefabManager] Entity ${newEntityId} created from prefab "${prefabName}" but component restoration had errors.`);
                 // this.entityManager.removeEntity(newEntityId); // Uncomment to delete on failure
                 // return null;
            }

             // Manually trigger events after all components are potentially added
             // Note: addComponent already triggers events, but a specific prefab event might be useful
             this.entityManager.eventEmitter?.emit('entityCreated', { id: newEntityId, source: 'prefab', prefabName: prefabName });


            logger.log(`[PrefabManager] Instantiated prefab "${prefabName}" as entity ${newEntityId}.`);
            return newEntityId;

        } catch (error) {
            logger.error(`[PrefabManager] Error instantiating prefab "${prefabName}":`, error);
            return null;
        }
    }

    /**
     * Retrieves a list of names for all prefabs currently stored in localStorage.
     *
     * @returns {string[]} An array of saved prefab names.
     * @method listPrefabs
     * @memberof PrefabManager
     * @instance
     */
    listPrefabs() {
        const prefabNames = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.localStoragePrefix)) {
                prefabNames.push(key.substring(this.localStoragePrefix.length));
            }
        }
        return prefabNames.sort(); // Return sorted names
    }

    /**
     * Deletes a saved prefab from localStorage.
     *
     * @param {string} prefabName - The name of the prefab to delete.
     * @returns {boolean} `true` if the prefab was found and deleted, `false` otherwise.
     */
    deletePrefab(prefabName) {
        if (!prefabName || typeof prefabName !== 'string' || prefabName.trim() === '') {
            logger.error("[PrefabManager] Prefab name cannot be empty for deletion.");
            return false;
        }
        const key = this.localStoragePrefix + prefabName.trim();
        if (localStorage.getItem(key) !== null) {
            localStorage.removeItem(key);
            logger.log(`[PrefabManager] Deleted prefab "${prefabName}".`);
            return true;
        } else {
            logger.warn(`[PrefabManager] Prefab "${prefabName}" not found for deletion.`);
            return false;
        }
    }

} // End PrefabManager Class