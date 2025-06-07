// src/editor/command-manager.js
// @version 1.3.0 - Added ReparentEntityCommand.
// @previous 1.2.1 - Removed redundant sceneImported emit from LoadSceneCommand

import { EventEmitter } from '../utils/event-emitter.js';

// --- Helper function for file download ---
function downloadFile(content, fileName, contentType) { /* ... unchanged ... */ const a = document.createElement("a"); const file = new Blob([content], { type: contentType }); a.href = URL.createObjectURL(file); a.download = fileName; a.click(); URL.revokeObjectURL(a.href); }

/** @class Command */
export class Command { /* ... unchanged ... */ constructor(name = 'Unnamed Command') { this.name = name; this.isUndoable = true; } execute() { throw new Error(`Command "${this.name}" does not implement execute().`); } undo() { if (this.isUndoable) throw new Error(`Command "${this.name}" does not implement undo().`); else console.warn(`Attempted to undo non-undoable command: "${this.name}"`); } }

/** @class CommandManager */
export class CommandManager extends EventEmitter { /* ... unchanged ... */ constructor() { super(); this.undoStack = []; this.redoStack = []; this.maxStackSize = 100; this.isExecuting = false; } execute(command) { if (!(command instanceof Command)) { console.error("CommandManager: Attempted to execute non-command object:", command); return; } if (this.isExecuting) { console.warn(`CommandManager: Skipping execute for "${command.name}" while another command is executing.`); return; } console.log(`CommandManager: Executing "${command.name}"...`); this.isExecuting = true; try { command.execute(); if (command.isUndoable) { this.undoStack.push(command); this.redoStack = []; if (this.undoStack.length > this.maxStackSize) { this.undoStack.shift(); } } else { if(this.redoStack.length > 0) { console.log(`CommandManager: Non-undoable command "${command.name}" cleared redo stack.`); this.redoStack = []; } } this.emit('change'); console.log(`CommandManager: Executed "${command.name}" successfully.`); } catch (error) { console.error(`CommandManager: Error executing command "${command.name}":`, error); } finally { this.isExecuting = false; } } undo() { if (this.isExecuting || this.undoStack.length === 0) return; const command = this.undoStack.pop(); if (!command.isUndoable) { console.error(`CommandManager: Found non-undoable command "${command.name}" on undo stack! Skipping.`); this.emit('change'); return; } console.log(`CommandManager: Undoing "${command.name}"...`); this.isExecuting = true; try { command.undo(); this.redoStack.push(command); this.emit('change'); console.log(`CommandManager: Undone "${command.name}" successfully.`); } catch (error) { console.error(`CommandManager: Error undoing command "${command.name}":`, error); this.undoStack.push(command); this.emit('change'); } finally { this.isExecuting = false; } } redo() { if (this.isExecuting || this.redoStack.length === 0) return; const command = this.redoStack.pop(); if (!command.isUndoable) { console.error(`CommandManager: Found non-undoable command "${command.name}" on redo stack! Skipping.`); this.emit('change'); return; } console.log(`CommandManager: Redoing "${command.name}"...`); this.isExecuting = true; try { command.execute(); this.undoStack.push(command); this.emit('change'); console.log(`CommandManager: Redone "${command.name}" successfully.`); } catch (error) { console.error(`CommandManager: Error redoing command "${command.name}":`, error); this.redoStack.push(command); this.emit('change'); } finally { this.isExecuting = false; } } clear() { this.undoStack = []; this.redoStack = []; this.emit('change'); console.log("CommandManager: Cleared history."); } canUndo() { return this.undoStack.length > 0 && !this.isExecuting; } canRedo() { return this.redoStack.length > 0 && !this.isExecuting; } }

// --- Concrete Command Implementations ---
/** @class CreateEntityCommand */
export class CreateEntityCommand extends Command { /* ... unchanged ... */ constructor(engine, entityType, options = {}) { super(`Create ${entityType}`); this.engine = engine; this.entityType = entityType; this.options = options; this.createdEntityId = null; this.isUndoable = true; } execute() { if (this.createdEntityId !== null) { if (this.engine.hasEntity(this.createdEntityId)) { this.engine.selectEntity(this.createdEntityId); } else { console.error(`[CreateEntity Redo] Entity ${this.createdEntityId} not found. Re-creating.`); this.createdEntityId = this.engine.createEntity(this.entityType, this.options); if (this.createdEntityId === null) throw new Error(`CreateEntityCommand: Failed to re-create.`); this.engine.selectEntity(this.createdEntityId); } return; } console.log(`[CreateEntity Execute] Creating new ${this.entityType}`); this.createdEntityId = this.engine.createEntity(this.entityType, this.options); if (this.createdEntityId === null) throw new Error(`CreateEntityCommand: Engine failed to create.`); this.engine.selectEntity(this.createdEntityId); console.log(`[CreateEntity Execute] Created and selected ${this.createdEntityId}`); } undo() { if (this.createdEntityId !== null) { console.log(`[CreateEntity Undo] Removing ${this.createdEntityId}`); const success = this.engine.removeEntity(this.createdEntityId); if (!success) console.error(`CreateEntityCommand: Failed to remove ${this.createdEntityId}.`); } else { console.warn(`CreateEntityCommand: Cannot undo - no ID recorded.`); } } }
/** @class DeleteEntityCommand */
export class DeleteEntityCommand extends Command { /* ... unchanged ... */ constructor(engine, entityId) { super(`Delete Entity ${entityId}`); if (entityId === null || entityId === undefined) throw new Error("DeleteEntityCommand requires a valid entity ID."); this.engine = engine; this.entityId = entityId; this.entityState = null; this.previousSelectionId = null; this.isUndoable = true; } execute() { if (!this.engine.hasEntity(this.entityId)) { console.warn(`DeleteEntityCommand: Entity ${this.entityId} not found. Skipping.`); if (this.engine.getSelectedEntity() === this.entityId) this.engine.selectEntity(null); return; } if (this.entityState === null) { console.log(`[DeleteEntity Execute] Storing state for ${this.entityId}`); const em = this.engine.getEntityManager(); if (!em) throw new Error("DeleteEntityCommand: EntityManager missing."); this.entityState = em.getEntityState(this.entityId); this.previousSelectionId = this.engine.getSelectedEntity(); if (!this.entityState) throw new Error(`DeleteEntityCommand: Could not get state for ${this.entityId}.`); } else { console.log(`[DeleteEntity Redo] Re-deleting ${this.entityId}`); } const success = this.engine.removeEntity(this.entityId); if (!success) throw new Error(`DeleteEntityCommand: Failed to remove ${this.entityId}.`); console.log(`[DeleteEntity Execute/Redo] Removed ${this.entityId}`); } undo() { if (!this.entityState) { console.error(`DeleteEntityCommand: Cannot undo ${this.entityId}, no state saved.`); return; } if (this.engine.hasEntity(this.entityId)) { console.warn(`DeleteEntityCommand: Entity ${this.entityId} already exists during undo.`); this.engine.selectEntity(this.entityId); return; } console.log(`[DeleteEntity Undo] Restoring ${this.entityId}`); const em = this.engine.getEntityManager(); if (!em) { console.error("DeleteEntityCommand: EntityManager missing for restore."); return; } const success = em.restoreEntityState(this.entityState); if (success) { console.log(`[DeleteEntity Undo] Restored ${this.entityId}.`); this.engine.selectEntity(this.entityId); this.engine.getEventEmitter().emit('entityRestored', { id: this.entityId, state: this.entityState }); } else { console.error(`[DeleteEntity Undo] Failed to restore ${this.entityId}.`); if (this.previousSelectionId !== null && this.previousSelectionId !== this.entityId) this.engine.selectEntity(this.previousSelectionId); else this.engine.selectEntity(null); } } }
/** @class UpdateComponentCommand */
export class UpdateComponentCommand extends Command { /* ... unchanged ... */ constructor(engine, entityId, componentType, properties) { const propNames = Object.keys(properties).join(', '); super(`Update ${componentType} (${propNames}) on Entity ${entityId}`); if (entityId === null || entityId === undefined) throw new Error("UpdateComponentCommand requires ID."); if (!componentType) throw new Error("UpdateComponentCommand requires type."); if (!properties || Object.keys(properties).length === 0) throw new Error("UpdateComponentCommand requires properties."); this.engine = engine; this.entityId = entityId; this.componentType = componentType; this.properties = typeof structuredClone === 'function' ? structuredClone(properties) : JSON.parse(JSON.stringify(properties)); this.isUndoable = true; } _applyProperties(valuesToApply) { if (!this.engine.hasEntity(this.entityId)) { console.error(`UpdateComponentCommand: Entity ${this.entityId} not found.`); return false; } const comp = this.engine.getComponent(this.entityId, this.componentType); if (!comp) { console.error(`UpdateComponentCommand: Component ${this.componentType} not found on ${this.entityId}.`); return false; } try { const updatedComp = this.engine.addComponent(this.entityId, this.componentType, valuesToApply); return !!updatedComp; } catch(error) { console.error(`UpdateComponentCommand: Error applying properties for ${this.componentType} on ${this.entityId}:`, error); return false; } } execute() { console.log(`[UpdateComp Execute/Redo] Applying new values for ${this.componentType} on ${this.entityId}`); const newValues = {}; for (const p in this.properties) newValues[p] = this.properties[p].newValue; if (!this._applyProperties(newValues)) throw new Error(`UpdateComponentCommand: Failed to apply new values.`); } undo() { console.log(`[UpdateComp Undo] Applying old values for ${this.componentType} on ${this.entityId}`); const oldValues = {}; for (const p in this.properties) oldValues[p] = this.properties[p].oldValue; if (!this._applyProperties(oldValues)) console.error(`UpdateComponentCommand: Failed to apply old values (undo).`); } }
/** @class SaveSceneCommand */
export class SaveSceneCommand extends Command { /* ... unchanged ... */ constructor(engine, filename = 'scene.json') { super('Save Scene'); this.engine = engine; this.filename = filename; this.isUndoable = false; } execute() { const entityManager = this.engine.getEntityManager(); if (!entityManager) throw new Error("SaveSceneCommand: EntityManager not available."); try { console.log(`SaveSceneCommand: Serializing scene to ${this.filename}...`); const sceneData = entityManager.serialize(); downloadFile(sceneData, this.filename, 'application/json'); console.log(`SaveSceneCommand: Triggered download for ${this.filename}.`); } catch (error) { console.error("SaveSceneCommand: Error serializing or saving scene:", error); alert(`Error saving scene: ${error.message || error}`); throw error; } } }
/** @class LoadSceneCommand */
export class LoadSceneCommand extends Command { /* ... unchanged ... */ constructor(engine, sceneData, sourceName = 'Unknown Source') { super(`Load Scene from ${sourceName}`); if (!sceneData) { throw new Error("LoadSceneCommand requires sceneData."); } this.engine = engine; this.sceneData = sceneData; this.isUndoable = false; } execute() { const entityManager = this.engine.getEntityManager(); const commandManager = this.engine.getCommandManager(); if (!entityManager || !commandManager) { throw new Error("LoadSceneCommand: Deps missing."); } let dataToLoad; if (typeof this.sceneData === 'string') { try { dataToLoad = JSON.parse(this.sceneData); } catch (e) { console.error("LoadSceneCommand: Failed to parse scene data string:", e); alert(`Error loading scene: Invalid JSON.`); throw new Error(`Invalid JSON data.`); } } else if (typeof this.sceneData === 'object' && this.sceneData !== null) { dataToLoad = this.sceneData; } else { throw new Error(`Invalid sceneData format.`); } try { console.log("LoadSceneCommand: Clearing current scene and command history."); this.engine.selectEntity(null); entityManager.clear(); commandManager.clear(); console.log("LoadSceneCommand: Deserializing scene data..."); const success = entityManager.deserialize(dataToLoad); if (!success) { throw new Error("EntityManager failed to deserialize scene data."); } console.log("LoadSceneCommand: Scene loaded successfully."); } catch (error) { console.error("LoadSceneCommand: Error deserializing scene:", error); alert(`Error loading scene: ${error.message || error}. Check console.`); entityManager.clear(); commandManager.clear(); throw error; } } }

// --- NEW COMMAND ---
/**
 * Command to change the parent of an entity.
 * @class ReparentEntityCommand
 */
export class ReparentEntityCommand extends Command {
    /**
     * @param {import('../core.js').Engine} engine - The engine instance.
     * @param {number} childId - The ID of the entity to reparent.
     * @param {number | null} newParentId - The ID of the new parent entity, or null to make it a root.
     */
    constructor(engine, childId, newParentId) {
        super(`Reparent Entity ${childId} to ${newParentId === null ? 'Root' : newParentId}`);
        if (childId === null || childId === undefined) throw new Error("ReparentEntityCommand requires a childId.");
        if (!engine || !engine.entityManager) throw new Error("ReparentEntityCommand requires an engine with EntityManager.");

        this.engine = engine;
        this.entityManager = engine.entityManager;
        this.childId = childId;
        this.newParentId = newParentId;
        this.oldParentId = null; // Will be fetched before execution
        this.isUndoable = true;
        this.stateCaptured = false; // Flag to ensure old parent is captured only once
    }

    execute() {
        if (!this.entityManager.hasEntity(this.childId)) {
            throw new Error(`ReparentEntityCommand: Child entity ${this.childId} not found.`);
        }
        if (this.newParentId !== null && !this.entityManager.hasEntity(this.newParentId)) {
            throw new Error(`ReparentEntityCommand: New parent entity ${this.newParentId} not found.`);
        }

        // Capture the old parent ID *only* the first time execute is called (not on redo)
        if (!this.stateCaptured) {
            const transform = this.entityManager.getComponent(this.childId, 'transform');
            if (!transform) {
                throw new Error(`ReparentEntityCommand: Child entity ${this.childId} missing TransformComponent.`);
            }
            this.oldParentId = transform.getParent(); // Get current parent
            console.log(`[Reparent Execute] Captured old parent for ${this.childId}: ${this.oldParentId}`);
            this.stateCaptured = true;
        } else {
             console.log(`[Reparent Redo] Re-applying parent ${this.newParentId} to ${this.childId}`);
        }

        // Perform the reparenting using EntityManager
        const success = this.entityManager.setParent(this.childId, this.newParentId);
        if (!success) {
            // If setParent failed (e.g., circular dependency), throw to prevent adding to undo stack
            throw new Error(`ReparentEntityCommand: EntityManager.setParent failed for child ${this.childId} and parent ${this.newParentId}.`);
        }

        console.log(`[Reparent Execute/Redo] Set parent of ${this.childId} to ${this.newParentId}.`);

        // Optional: Select the child after reparenting?
        // this.engine.selectEntity(this.childId);
    }

    undo() {
        if (!this.stateCaptured) {
            console.error(`ReparentEntityCommand: Cannot undo - old parent state was not captured.`);
            return; // Or throw?
        }
        if (!this.entityManager.hasEntity(this.childId)) {
            console.warn(`ReparentEntityCommand: Child entity ${this.childId} not found during undo. Skipping.`);
            return;
        }
        if (this.oldParentId !== null && !this.entityManager.hasEntity(this.oldParentId)) {
            console.warn(`ReparentEntityCommand: Old parent entity ${this.oldParentId} not found during undo. Setting parent to root.`);
            this.oldParentId = null; // Fallback to making it root
        }

        console.log(`[Reparent Undo] Restoring parent of ${this.childId} to ${this.oldParentId}`);

        const success = this.entityManager.setParent(this.childId, this.oldParentId);
        if (!success) {
            // Attempting to undo failed, which is problematic. Log error.
            console.error(`ReparentEntityCommand: Undo failed. EntityManager.setParent failed for child ${this.childId} and old parent ${this.oldParentId}.`);
            // Re-select the child anyway?
            // this.engine.selectEntity(this.childId);
            // Do not re-throw here, as it would prevent redo.
        }
        // Optional: Select the child after undo?
        // this.engine.selectEntity(this.childId);
    }
}
// --- END NEW COMMAND ---