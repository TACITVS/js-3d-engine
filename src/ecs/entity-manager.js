// src/ecs/entity-manager.js
// @version 1.5.2 - Pass 'source' property in componentAdded/entityUpdated events.
// @previous 1.5.1 - Fixed ReferenceError in event emission within addComponent.

import * as logger from '../utils/logger.js';
import { TransformComponent } from '../components/transform-component.js';
import { Component } from './component.js';
import { ComponentRegistry } from './component-registry.js';
import { EventEmitter } from '../utils/event-emitter.js';

/**
 * Manages entities and their associated components within the ECS architecture.
 * Responsible for creating, deleting, and querying entities, adding/removing components,
 * managing entity hierarchy (parent-child relationships), and handling scene
 * serialization/deserialization.
 *
 * @class EntityManager
 */
export class EntityManager {
    /**
     * Creates an EntityManager instance.
     * @param {ComponentRegistry} componentRegistry - A reference to the ComponentRegistry instance.
     * @param {EventEmitter} eventEmitter - A reference to the global EventEmitter instance.
     * @throws {Error} If componentRegistry or eventEmitter are not provided.
     */
    constructor(componentRegistry, eventEmitter) {
        if (!componentRegistry) throw new Error("EntityManager requires a ComponentRegistry instance.");
        if (!eventEmitter) throw new Error("EntityManager requires an EventEmitter instance.");

        /** @type {ComponentRegistry} @readonly */
        this.componentRegistry = componentRegistry;
        /** @type {EventEmitter} @readonly */
        this.eventEmitter = eventEmitter;
        /** @private @type {number} */
        this.nextEntityId = 1;
        /** @private @type {Set<number>} */
        this.entities = new Set();
        /** @private @type {Map<number, Map<string, Component>>} */
        this.entityComponents = new Map();
        /** @private @type {Map<string, Set<number>>} */
        this.componentEntityMap = new Map();
    }

    /**
     * Creates a new entity with a unique ID and initializes its component map.
     * @returns {number} The unique ID of the newly created entity.
     * @method createEntity
     */
    createEntity() {
        let id = this.nextEntityId;
        // Find the next available ID safely
        while (this.entities.has(id)) {
            id++;
            // Prevent potential infinite loop in extreme edge cases
            if (id > Number.MAX_SAFE_INTEGER) {
                 logger.error("[EM CreateEntity] Reached maximum safe integer for entity IDs!");
                 throw new Error("Maximum entity ID reached.");
            }
         }
        this.nextEntityId = id + 1;
        this.entities.add(id);
        this.entityComponents.set(id, new Map());
        // logger.log(`[EM] Created Entity: ${id}. Next ID: ${this.nextEntityId}`);
        return id;
    }

    /**
     * Removes an entity and all its components, handling hierarchy and component cleanup.
     * @param {number} entityId - The ID of the entity to remove.
     * @returns {boolean} `true` if removed successfully, `false` otherwise.
     * @method removeEntity
     */
    removeEntity(entityId) {
        // --- Validation ---
        if (typeof entityId !== 'number' || !isFinite(entityId)) {
            logger.warn(`[EM RemoveEntity] Invalid entity ID type provided: ${entityId}. Removal aborted.`);
            return false;
        }

        if (!this.hasEntity(entityId)) {
             // logger.warn(`[EM RemoveEntity] Attempted to remove non-existent entity: ${entityId}`);
             return false;
        }

        // logger.log(`[EM] Attempting removal of Entity: ${entityId}`); // Keep commented unless debugging removal

        try {
            // Hierarchy cleanup: Remove self from parent, recursively remove children
            const transform = this.getComponent(entityId, 'transform');
            if (transform) {
                 // Detach from parent
                 const parentId = transform.parent;
                 if (parentId !== null) {
                      // Pass source for hierarchy change during removal
                      if (!this.setParent(entityId, null, 'removeEntityCleanup')) {
                           logger.warn(`[EM Remove ${entityId}] setParent(null) failed during removal. Parent link might be inconsistent.`);
                      }
                 }

                 // Recursively remove children FIRST
                 const childrenIds = Array.from(transform.children);
                 for (const childId of childrenIds) {
                     try {
                          if (this.hasEntity(childId)) {
                               if (!this.removeEntity(childId)) { // Recursive call
                                    logger.warn(`[EM Remove ${entityId}] Recursive removal of child ${childId} returned false.`);
                               }
                          }
                     } catch (childError) {
                         logger.error(`[EM Remove ${entityId}] CRITICAL ERROR removing child entity ${childId}:`, childError);
                     }
                 }
                 transform.children.clear();
                 transform.parent = null;
            }

            // Component cleanup: Call onRemove and remove from tracking maps
            const components = this.entityComponents.get(entityId);
            if (components) {
                const componentTypes = Array.from(components.keys());
                for (const type of componentTypes) {
                    const component = components.get(type);
                    try {
                        component?.onRemove?.();
                    } catch(e) {
                        logger.error(`[EM Remove ${entityId}] Error in onRemove() for component '${type}':`, e);
                    }
                    this._removeComponentFromEntityMap(entityId, type);
                }
            }

            // Final removal from core maps
            this.entityComponents.delete(entityId);
            this.entities.delete(entityId);

            // logger.log(`[EM] Successfully removed Entity: ${entityId}`); // Keep commented unless debugging removal
            this.eventEmitter?.emit('entityRemoved', { id: entityId });
            return true;

        } catch (error) {
            logger.error(`[EM] CRITICAL ERROR during removeEntity(${entityId}):`, error);
            logger.warn(`[EM Remove ${entityId}] Attempting forceful cleanup after error...`);
            this.entityComponents.delete(entityId);
            this.entities.delete(entityId);
            this._cleanupEntityFromComponentMap(entityId);
            return false;
        }
    }

    /**
     * Checks if an entity with the given ID exists.
     * @param {number} entityId - The ID to check.
     * @returns {boolean} True if the entity exists.
     * @method hasEntity
     */
    hasEntity(entityId) {
        return typeof entityId === 'number' && isFinite(entityId) && this.entities.has(entityId);
    }

    /**
     * Adds or updates a component for a given entity.
     * @param {number} entityId - The ID of the entity.
     * @param {string} componentType - The registered name of the component type.
     * @param {object} [data={}] - Data to initialize or update the component. Can include internal `source` property.
     * @returns {Component | null} The component instance, or `null` on failure.
     * @method addComponent
     */
    addComponent(entityId, componentType, data = {}) {
        // --- Validation ---
        if (typeof entityId !== 'number' || !isFinite(entityId)) {
            logger.error(`[EM AddComponent] Invalid entity ID type: ${entityId}.`);
            return null;
        }
        if (typeof componentType !== 'string' || componentType.trim() === '') {
             logger.error(`[EM AddComponent ${entityId}] Invalid component type: '${componentType}'. Must be non-empty string.`);
             return null;
        }
        if (typeof data !== 'object' || data === null) {
             logger.warn(`[EM AddComponent ${entityId}] Invalid data provided for component '${componentType}'. Expected object, got:`, data, `. Using empty object.`);
             data = {};
        }

        if (!this.hasEntity(entityId)) { logger.error(`[EM AddComponent ${entityId}] Cannot add component '${componentType}' to non-existent entity.`); return null; }
        const ComponentConstructor = this.componentRegistry.get(componentType);
        if (!ComponentConstructor) { logger.error(`[EM AddComponent ${entityId}] Component type '${componentType}' not registered.`); return null; }

        let component = this.getComponent(entityId, componentType);
        const isNewComponent = !component;
        let requiresHierarchyUpdate = false;
        let targetParent = undefined;

        // Extract source and clean data
        const source = data.source || 'unknown'; // Default source if not provided
        const componentData = { ...data };
        delete componentData.source; // Remove internal source property before passing to constructor/update

        try {
            if (isNewComponent) {
                // Pass cleaned data without 'source'
                component = new ComponentConstructor(componentData);
                if (!(component instanceof Component)) {
                    logger.error(`[EM AddComponent ${entityId}] Constructor for '${componentType}' did not return an instance of Component.`);
                    return null;
                }
                this.entityComponents.get(entityId)?.set(componentType, component);
                this._addComponentToEntityMap(entityId, componentType);
                component.onAdd?.(entityId);
            } else {
                // Update existing component using cleaned data
                for (const key in componentData) {
                    if (componentType === 'transform' && key === 'parent') {
                         targetParent = componentData[key];
                         requiresHierarchyUpdate = true;
                         continue;
                    }
                    if (componentType === 'transform' && key === 'children') {
                         logger.warn(`[EM AddComponent ${entityId}] Attempted to set 'children' property directly on TransformComponent via data. Use setParent.`);
                         continue;
                    }

                    if (Object.prototype.hasOwnProperty.call(componentData, key)) {
                         if (Object.prototype.hasOwnProperty.call(component, key)) {
                              const oldValue = component[key];
                              const newValue = componentData[key];
                             if (Array.isArray(newValue)) {
                                  // Deep compare arrays? Simple stringify for now.
                                  if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                                       component[key] = [...newValue]; // Create copy
                                  }
                             } else if (oldValue !== newValue) {
                                 component[key] = newValue;
                             }
                         } else {
                              logger.warn(`[EM AddComponent ${entityId}] Property '${key}' does not exist on component instance '${componentType}'. Update skipped.`);
                         }
                    }
                }
                 component.onUpdate?.(componentData); // Pass cleaned data
            }
        } catch (e) {
            logger.error(`[EM AddComponent ${entityId}] Error constructing or updating component '${componentType}':`, e);
            if (isNewComponent && component) {
                this.entityComponents.get(entityId)?.delete(componentType);
                this._removeComponentFromEntityMap(entityId, componentType);
            }
            return null;
        }

        // Handle explicit parent setting
        if (componentType === 'transform' && requiresHierarchyUpdate && component.parent !== targetParent) {
             try {
                 // Pass source for hierarchy change
                 if (!this.setParent(entityId, targetParent, source)) {
                     logger.warn(`[EM AddComponent ${entityId}] setParent failed for target parent ${targetParent}.`);
                 }
             } catch (setParentError) {
                 logger.error(`[EM AddComponent ${entityId}] Error calling setParent:`, setParentError);
             }
        }

        // Pass the original source to events
        this.eventEmitter?.emit('componentAdded', { entityId, componentType: componentType, component: component, isNew: isNewComponent, source: source });
        // Pass cleaned data + source to entityUpdated
        this.eventEmitter?.emit('entityUpdated', { id: entityId, componentType: componentType, properties: componentData, removed: false, source: source });

        return component;
    }

    /**
     * Removes a component from an entity.
     * @param {number} entityId - The ID of the entity.
     * @param {string} componentType - The type name of the component to remove.
     * @returns {boolean} `true` if removed successfully, `false` otherwise.
     * @method removeComponent
     */
    removeComponent(entityId, componentType) {
        // --- Validation ---
        if (typeof entityId !== 'number' || !isFinite(entityId)) {
            logger.warn(`[EM RemoveComponent] Invalid entity ID type: ${entityId}.`);
            return false;
        }
        if (typeof componentType !== 'string' || componentType.trim() === '') {
             logger.warn(`[EM RemoveComponent ${entityId}] Invalid component type: '${componentType}'.`);
             return false;
        }

        if (!this.hasEntity(entityId)) { logger.warn(`[EM RemoveComponent ${entityId}] Entity not found.`); return false; }
        const components = this.entityComponents.get(entityId);
        if (!components?.has(componentType)) {
            // logger.log(`[EM RemoveComponent ${entityId}] Component '${componentType}' not found on entity.`);
            return false;
        }

        const component = components.get(componentType);

        try {
            // Special handling for TransformComponent removal
            if (componentType === 'transform' && component) {
                const childrenIds = Array.from(component.children || []);
                childrenIds.forEach(childId => {
                    if (this.hasEntity(childId)) {
                         // Pass source for hierarchy change during removal
                         if (!this.setParent(childId, null, 'removeComponentCleanup')) {
                              logger.warn(`[EM RemoveComponent ${entityId}] Failed to set child ${childId} parent to null.`);
                         }
                    }
                });
                const currentParentId = component.parent;
                if (currentParentId !== null) {
                    const oldParentTransform = this.getComponent(currentParentId, 'transform');
                    oldParentTransform?._removeChild(entityId);
                }
            }
            component?.onRemove?.();
        } catch(e) {
            logger.error(`[EM RemoveComponent ${entityId}] Error during onRemove/hierarchy cleanup for '${componentType}':`, e);
        }

        // Remove component from maps
        components.delete(componentType);
        this._removeComponentFromEntityMap(entityId, componentType);

        // Emit events AFTER successful removal
        this.eventEmitter?.emit('componentRemoved', { entityId, componentType: componentType });
        this.eventEmitter?.emit('entityUpdated', { id: entityId, componentType: componentType, removed: true, source: 'removeComponent' });

        return true;
    }

    // ... (getComponent, hasComponent, getComponents, getEntitiesWithComponent, getEntitiesWithComponents unchanged) ...
    getComponent(entityId, componentType) { return this.hasEntity(entityId) ? this.entityComponents.get(entityId)?.get(componentType) || null : null; }
    hasComponent(entityId, componentType) { return this.hasEntity(entityId) ? this.entityComponents.get(entityId)?.has(componentType) ?? false : false; }
    getComponents(entityId) { if (!this.hasEntity(entityId)) return []; const map = this.entityComponents.get(entityId); return map ? Array.from(map.values()) : []; }
    getEntitiesWithComponent(componentType) { if (typeof componentType !== 'string' || componentType.trim() === '') { logger.warn(`[EM GetEntitiesWithComponent] Invalid component type: '${componentType}'.`); return []; } return Array.from(this.componentEntityMap.get(componentType) || []); }
    getEntitiesWithComponents(componentTypes) { if (!Array.isArray(componentTypes)) { logger.warn("[EM GetEntitiesWithComponents] Input must be an array of component type strings."); return []; } if (componentTypes.length === 0) return Array.from(this.entities); if (!componentTypes.every(type => typeof type === 'string' && type.trim() !== '')) { logger.warn("[EM GetEntitiesWithComponents] Input array contains invalid component type strings."); return []; } let smallestSet = null; let smallestSize = Infinity; for (const type of componentTypes) { const set = this.componentEntityMap.get(type); if (!set || set.size === 0) return []; if (set.size < smallestSize) { smallestSize = set.size; smallestSet = set; } } return smallestSet ? Array.from(smallestSet).filter(id => componentTypes.every(type => this.hasComponent(id, type))) : []; }


    /**
     * Sets the parent of an entity, updating transform hierarchy.
     * @param {number} entityId - The child entity ID.
     * @param {number | null} newParentId - The new parent ID, or `null` to make root.
     * @param {string} [source='setParent'] - Source identifier for the change event.
     * @returns {boolean} True if successful.
     * @method setParent
     */
    setParent(entityId, newParentId, source = 'setParent') { // Added source parameter
        // --- Validation ---
        if (typeof entityId !== 'number' || !isFinite(entityId)) { logger.error(`[EM SetParent ${entityId}] Invalid child entity ID type.`); return false; }
        if (newParentId !== null && (typeof newParentId !== 'number' || !isFinite(newParentId))) { logger.error(`[EM SetParent ${entityId}] Invalid parent entity ID type: ${newParentId}. Must be number or null.`); return false; }
        if (!this.hasEntity(entityId)) { logger.error(`[EM SetParent ${entityId}] Child entity not found.`); return false; }
        if (newParentId !== null && !this.hasEntity(newParentId)) { logger.error(`[EM SetParent ${entityId}] Parent entity ${newParentId} not found.`); return false; }
        if (entityId === newParentId) { logger.error(`[EM SetParent ${entityId}] Entity cannot parent itself.`); return false; }

        const childTransform = this.getComponent(entityId, 'transform');
        if (!childTransform) { logger.error(`[EM SetParent ${entityId}] Child entity is missing TransformComponent.`); return false; }
        const newParentTransform = (newParentId !== null) ? this.getComponent(newParentId, 'transform') : null;
        if (newParentId !== null && !newParentTransform) { logger.error(`[EM SetParent ${entityId}] New parent ${newParentId} is missing TransformComponent.`); return false; }

        if (childTransform.parent === newParentId) { return true; } // Already parented

        // Check for Circular Dependency
        let ancestorId = newParentId;
        while (ancestorId !== null) {
            if (ancestorId === entityId) { logger.error(`[EM SetParent ${entityId}] Circular dependency detected - cannot make ${entityId} a child of ${newParentId}.`); return false; }
            const ancestorTransform = this.getComponent(ancestorId, 'transform');
            if (!ancestorTransform) {
                 logger.error(`[EM SetParent ${entityId}] Circular dependency check failed: Ancestor ${ancestorId} missing TransformComponent.`);
                 return false;
            }
            ancestorId = ancestorTransform.parent;
        }

        // Update Old Parent
        const oldParentId = childTransform.parent;
        if (oldParentId !== null && oldParentId !== newParentId) {
             const oldParentTransform = this.getComponent(oldParentId, 'transform');
             if (oldParentTransform) { oldParentTransform._removeChild(entityId); }
             else { logger.warn(`[EM SetParent ${entityId}] Old parent ${oldParentId} missing TransformComponent during detachment.`); }
        }

        // Update New Parent
        if (newParentId !== null) { newParentTransform._addChild(entityId); }

        // Update Child
        childTransform._setParent(newParentId);

        // Emit events
        this.eventEmitter?.emit('entityHierarchyChanged', { entityId: entityId, newParentId: newParentId, oldParentId: oldParentId, source: source });
        // Pass source to entityUpdated event
        this.eventEmitter?.emit('entityUpdated', { id: entityId, componentType: 'transform', properties: { parent: newParentId }, removed: false, source: source });

        return true;
    }

    // ... (getChildren, getRootEntities, _add/_remove ComponentToEntityMap, getEntityState, serialize unchanged) ...
    getChildren(entityId) { return this.hasEntity(entityId) ? new Set(this.getComponent(entityId, 'transform')?.children || []) : new Set(); }
    getRootEntities() { const roots = []; for (const id of this.entities) { const transform = this.getComponent(id, 'transform'); if (!transform || transform.parent === null) { roots.push(id); } } return roots; }
    _addComponentToEntityMap(entityId, componentType) { let set = this.componentEntityMap.get(componentType); if (!set) { set = new Set(); this.componentEntityMap.set(componentType, set); } set.add(entityId); }
    _removeComponentFromEntityMap(entityId, componentType) { this.componentEntityMap.get(componentType)?.delete(entityId); }
    _cleanupEntityFromComponentMap(entityId) { for (const set of this.componentEntityMap.values()) { set.delete(entityId); } }
    getEntityState(entityId) { if (!this.hasEntity(entityId)) return null; const state = { id: entityId, components: {} }; const map = this.entityComponents.get(entityId); if (!map) { logger.warn(`[EM getEntityState ${entityId}] Entity exists but has no component map!`); return state; } for (const [type, comp] of map.entries()) { if (!comp) { logger.warn(`[EM getEntityState ${entityId}] Found null/undefined component instance for type '${type}'. Skipping.`); continue; } if (typeof comp.serialize === 'function') { try { const serializedData = comp.serialize(); if (typeof serializedData !== 'object' || serializedData === null) { logger.error(`[EM getEntityState ${entityId}] Component '${type}' serialize() returned non-object or null:`, serializedData, `. Storing empty object.`); state.components[type] = {}; } else { state.components[type] = serializedData; } } catch (e) { logger.error(`[EM getEntityState ${entityId}] Error calling serialize() on component '${type}':`, e); state.components[type] = {}; } } else { logger.warn(`[EM getEntityState ${entityId}] Component type "${type}" missing .serialize(). Skipping.`); } } return state; }
    serialize(prettyPrint = true) { try { const data = { entities: [] }; const ids = Array.from(this.entities).sort((a, b) => a - b); for (const id of ids) { const state = this.getEntityState(id); if (state) data.entities.push(state); } return JSON.stringify(data, null, prettyPrint ? 2 : undefined); } catch (error) { logger.error("[EM Serialize Error] Failed to serialize scene:", error); return null; } }


    /**
     * Deserializes scene data, replacing the current scene.
     * @param {string | object} jsonOrObject - The scene data.
     * @returns {boolean} `true` if deserialization completed without critical errors.
     * @method deserialize
     */
    deserialize(jsonOrObject) {
        let data; let success = true;
        let parsedData = null;
        try {
            parsedData = typeof jsonOrObject === 'string' ? JSON.parse(jsonOrObject) : jsonOrObject;
        } catch (parseError) {
             logger.error("[EM Deserialize Error] Failed to parse input JSON:", parseError);
             this.clear(); return false;
        }
        if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.entities)) {
             logger.error("[EM Deserialize Error] Invalid scene format: 'entities' array not found or invalid.", parsedData);
             this.clear(); return false;
        }
        data = parsedData;

        logger.log("[EM] Deserializing scene...");
        this.clear();

        let highestId = 0; let restoredCount = 0; let failedCount = 0;
        const restoredEntityIds = new Set();

        for (const entityData of data.entities) {
             if (!entityData || typeof entityData.id !== 'number') {
                 logger.warn("[EM Restore Entity] Skipping invalid entity data format (missing or invalid ID):", entityData);
                 failedCount++; continue;
             }
             const id = entityData.id;
             try {
                 const restoredBase = this._restoreSingleEntityBase(id, entityData);
                 if (restoredBase) {
                     const componentsRestored = this._restoreEntityComponents(id, entityData.components || {});
                     if(componentsRestored) {
                        highestId = Math.max(highestId, id);
                        restoredEntityIds.add(id);
                        restoredCount++;
                     } else {
                          logger.warn(`[EM Deserialize Entity ${id}] Component restoration failed. Entity might be incomplete.`);
                          failedCount++; success = false;
                     }
                 } else { failedCount++; }
             } catch (e) {
                 logger.error(`[EM Deserialize Error] restoring entity data (ID: ${id}):`, e);
                 failedCount++;
                 if (this.hasEntity(id)) this.removeEntity(id);
             }
        } // End Pass 1 Loop

        logger.log(`[EM Deserialize Pass 1] ${restoredCount}/${data.entities.length} entities restored (${failedCount} failed).`);
        if (failedCount > 0) success = false;

        // --- Hierarchy Rebuild (Pass 2) ---
        logger.log("[EM] Deserialize Pass 2: Rebuilding hierarchy...");
        let hierarchyErrors = 0;
        for (const entityId of restoredEntityIds) {
             const entityData = data.entities.find(e => e.id === entityId);
             if (!entityData) continue;
             try {
                 const transformData = entityData.components?.transform;
                 if (transformData && Object.prototype.hasOwnProperty.call(transformData, 'parent')) {
                      const targetParentId = transformData.parent;
                      if (targetParentId !== null && typeof targetParentId !== 'number') {
                          logger.warn(`[EM Hierarchy ${entityId}] Invalid parent ID type '${typeof targetParentId}'. Setting parent to null.`);
                          this.setParent(entityId, null, 'deserialize'); hierarchyErrors++; // Pass source
                      } else if (targetParentId !== null && !restoredEntityIds.has(targetParentId)) {
                          logger.warn(`[EM Hierarchy ${entityId}] Target parent ${targetParentId} was not successfully restored. Setting parent to null.`);
                          this.setParent(entityId, null, 'deserialize'); hierarchyErrors++; // Pass source
                      } else {
                          if (!this.setParent(entityId, targetParentId, 'deserialize')) { // Pass source
                              logger.warn(`[EM Hierarchy ${entityId}] setParent call failed for parent ${targetParentId}.`);
                              hierarchyErrors++;
                          }
                      }
                 }
             } catch (e) {
                 logger.error(`[EM Hierarchy ${entityId}] Error rebuilding hierarchy:`, e);
                 hierarchyErrors++;
                 try { if(this.hasComponent(entityId, 'transform')) this.setParent(entityId, null, 'deserializeError'); } catch {} // Pass source
             }
        } // End hierarchy loop

        if(hierarchyErrors > 0) { logger.warn(`[EM Deserialize Pass 2] Encountered ${hierarchyErrors} hierarchy errors.`); success = false; }
        else { logger.log("[EM Deserialize Pass 2] Hierarchy rebuild complete."); }

        // Adjust nextEntityId safely
        this.nextEntityId = highestId + 1;
        while (this.entities.has(this.nextEntityId)) { this.nextEntityId++; if (this.nextEntityId > Number.MAX_SAFE_INTEGER) break; }
        if (this.nextEntityId < 1) this.nextEntityId = 1;

        this.eventEmitter?.emit('sceneImported');
        logger.log(`[EM] Deserialization finished. ${this.entities.size} entities loaded. Next ID: ${this.nextEntityId}. Success: ${success}`);
        return success;
    }

    /**
     * @private Helper to create the base entity structure during deserialization.
     * @param {number} id - The entity ID from the scene data.
     * @param {object} entityData - Raw data object for the entity.
     * @returns {boolean} True if base structure created/cleared successfully.
     */
    _restoreSingleEntityBase(id, entityData) {
        try {
            if (this.hasEntity(id)) {
                logger.warn(`[EM Restore Base ${id}] Entity already exists. Clearing its components before restoring.`);
                const map = this.entityComponents.get(id);
                if(map){ const types = Array.from(map.keys()); types.forEach(type => this.removeComponent(id, type)); }
                 this.entityComponents.set(id, new Map());
            } else {
                this.entities.add(id);
                this.entityComponents.set(id, new Map());
                 if (id >= this.nextEntityId) { this.nextEntityId = id + 1; }
            }
             return true;
        } catch (error) {
            logger.error(`[EM Restore Base ${id}] Error creating base structure:`, error);
            this.entities.delete(id); this.entityComponents.delete(id);
            return false;
        }
    }

     /**
      * @private Helper to restore components for a single entity during deserialization.
      * @param {number} id - The entity ID.
      * @param {object} componentsData - The components object from entityData.
      * @returns {boolean} True if all components restored without critical errors.
      */
     _restoreEntityComponents(id, componentsData) {
         if (typeof componentsData !== 'object' || componentsData === null) {
              logger.warn(`[EM Restore Components ${id}] Missing or invalid 'components' object.`);
             return true;
         }
         let componentErrors = 0;
         for (const [type, data] of Object.entries(componentsData)) {
             if (data === null || typeof data !== 'object') { logger.warn(`[EM Restore Components ${id}] Invalid data for '${type}'. Skipping.`, data); componentErrors++; continue; }
             if (!this.componentRegistry.has(type)) { logger.warn(`[EM Restore Components ${id}] Component type '${type}' not registered. Skipping.`); componentErrors++; continue; }
             // Pass source for component addition during deserialization
             const compData = { ...( (type === 'transform') ? { ...data, parent: undefined, children: undefined } : data ), source: 'deserialize' };
             const addedComponent = this.addComponent(id, type, compData);
             if (addedComponent === null) { componentErrors++; }
         }
         if (componentErrors > 0) { logger.warn(`[EM Restore Components ${id}] Restored with ${componentErrors} component errors.`); return false; }
         return true;
     }

    /** Clears all entities and components. */
    clear() {
         logger.log(`[EM] Clearing all entities (${this.entities.size})...`);
         const entityIds = Array.from(this.entities); // Clone IDs
         entityIds.forEach(id => { if (!this.removeEntity(id)) { logger.warn(`[EM Clear] removeEntity(${id}) returned false.`); } });
         this.entities.clear(); this.entityComponents.clear(); this.componentEntityMap.clear();
         this.nextEntityId = 1;
         logger.log("[EM] EntityManager cleared.");
         this.eventEmitter?.emit('sceneCleared');
     }
}
