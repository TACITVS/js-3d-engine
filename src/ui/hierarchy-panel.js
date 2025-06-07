// src/ui/hierarchy-panel.js
// @version 1.3.0 - Added drag-and-drop reparenting.
// @previous 1.2.0 - Refactored, added JSDoc comments, kept diagnostic logs

import { UIComponent } from './ui-component.js';
// --- MODIFICATION: Import the new command ---
import { ReparentEntityCommand } from '../editor/command-manager.js';
// --- END MODIFICATION ---

/**
 * UI Panel component that displays the scene's entity hierarchy in a tree view,
 * allows entity selection by clicking, drag-and-drop reparenting,
 * and provides basic prefab operations.
 * Uses event delegation for item clicks and drag events.
 *
 * @class HierarchyPanel
 * @extends UIComponent
 */
export class HierarchyPanel extends UIComponent {
    /**
     * Creates an instance of HierarchyPanel.
     * @param {import('../core.js').Engine} editor - Reference to the main Engine instance.
     */
    constructor(editor) {
        super(editor);
        this.listContainer = null;
        this.buttonContainer = null;
        this.createPrefabButton = null;
        this.instantiatePrefabButton = null;
        this._tempWindowClickListener = null;

        // --- MODIFICATION: Add properties for drag state ---
        /** @private {number|null} ID of the entity being dragged */
        this.draggedEntityId = null;
        /** @private {Element|null} The element currently being dragged over */
        this.dragOverElement = null;
        // --- END MODIFICATION ---


        // Bind methods to ensure 'this' context is correct
        this._renderHierarchy = this._renderHierarchy.bind(this);
        this._onEntitySelected = this._onEntitySelected.bind(this);
        this._handleCreatePrefab = this._handleCreatePrefab.bind(this);
        this._handleInstantiatePrefab = this._handleInstantiatePrefab.bind(this);
        this._handleListContainerClick = this._handleListContainerClick.bind(this);

        // --- MODIFICATION: Bind new drag handlers ---
        this._handleDragStart = this._handleDragStart.bind(this);
        this._handleDragOver = this._handleDragOver.bind(this);
        this._handleDragLeave = this._handleDragLeave.bind(this);
        this._handleDrop = this._handleDrop.bind(this);
        this._handleDragEnd = this._handleDragEnd.bind(this);
        // --- END MODIFICATION ---
    }

    /**
     * Creates the main panel element, list container, and button container.
     * @returns {HTMLElement} The main panel div element.
     * @protected
     * @override
     */
    _createElement() {
        /* ... (Element creation mostly unchanged) ... */
        const panelDiv = document.createElement('div');
        panelDiv.className = 'editor-hierarchy-panel editor-ui-panel';

        const header = document.createElement('h3');
        header.textContent = 'Hierarchy';
        header.style.cssText = 'margin:0 0 10px 0; padding-bottom:5px; border-bottom:1px solid #555; font-size:1em;';

        this.listContainer = document.createElement('ul');
        this.listContainer.className = 'hierarchy-list hierarchy-root';
        // --- MODIFICATION: Add style for drop target on root ---
        this.listContainer.style.cssText = `
            list-style:none; padding:0; margin:0;
            max-height: 300px; overflow-y: auto; border: 1px solid #444;
            padding: 5px; margin-bottom: 10px; min-height: 50px; /* Ensure root has some drop area */
        `;
        // --- END MODIFICATION ---

        this.buttonContainer = document.createElement('div');
        /* ... (Button setup unchanged) ... */
        this.buttonContainer.className = 'hierarchy-buttons';
        this.buttonContainer.style.cssText = 'display: flex; justify-content: space-around; padding-top: 5px; border-top: 1px solid #555;';
        this.createPrefabButton = document.createElement('button'); this.createPrefabButton.textContent = 'Create Prefab'; this.createPrefabButton.title = 'Save selected entity as a prefab'; this.createPrefabButton.onclick = this._handleCreatePrefab; this.createPrefabButton.style.fontSize = '0.9em'; this.createPrefabButton.disabled = true;
        this.instantiatePrefabButton = document.createElement('button'); this.instantiatePrefabButton.textContent = 'Instantiate'; this.instantiatePrefabButton.title = 'Create new entity from saved prefab'; this.instantiatePrefabButton.onclick = this._handleInstantiatePrefab; this.instantiatePrefabButton.style.fontSize = '0.9em';
        this.buttonContainer.append(this.createPrefabButton, this.instantiatePrefabButton);

        panelDiv.append(header, this.listContainer, this.buttonContainer);
        return panelDiv;
    }

    /**
     * Sets up event listeners for engine events and the delegated listeners
     * for the hierarchy list container (click, drag events).
     * @protected
     * @override
     */
    _setupEventListeners() {
        if (!this.editor?.eventEmitter) {
            console.error("HierarchyPanel: Cannot setup listeners - EventEmitter missing.");
            return;
        }
        const emitter = this.editor.eventEmitter;

        // Engine event listeners
        emitter.on('entityCreated', this._renderHierarchy);
        emitter.on('entityRemoved', this._renderHierarchy);
        // Listen for component updates, especially parent changes in TransformComponent
        emitter.on('componentAdded', this._handleComponentChange); // Refresh on relevant component changes
        emitter.on('componentRemoved', this._handleComponentChange);
        emitter.on('entityUpdated', this._handleEntityUpdate); // More specific update
        emitter.on('sceneImported', this._renderHierarchy);
        emitter.on('entitySelected', this._onEntitySelected);

        // Delegated listeners on the list container
        if (this.listContainer) {
            this.listContainer.addEventListener('click', this._handleListContainerClick);
            // --- MODIFICATION: Add drag listeners ---
            this.listContainer.addEventListener('dragstart', this._handleDragStart);
            this.listContainer.addEventListener('dragover', this._handleDragOver);
            this.listContainer.addEventListener('dragleave', this._handleDragLeave);
            this.listContainer.addEventListener('drop', this._handleDrop);
            this.listContainer.addEventListener('dragend', this._handleDragEnd); // Cleanup visuals
            // --- END MODIFICATION ---
        } else { console.error("HierarchyPanel: listContainer not found during setupEventListeners."); }

        // Remove temporary listener if it exists
        if (this._tempWindowClickListener) {
            window.removeEventListener('click', this._tempWindowClickListener, true);
            this._tempWindowClickListener = null;
        }

        // Initial render and state update
        this._renderHierarchy();
        this._updateButtonStates(this.editor.getSelectedEntity());
    }

    // --- NEW: Specific handlers for component changes affecting hierarchy ---
    _handleComponentChange = ({ entityId, componentType }) => {
        // Re-render if transform is added/removed, affecting hierarchy structure potentially
        if (componentType === 'transform') {
            this._renderHierarchy();
        }
    }
    _handleEntityUpdate = ({ id, componentType, source }) => {
        // Re-render only if transform component changed and source is not drag/drop itself
        // Or if relevant components for display info (renderable, light, camera) change
         const isHierarchyChange = componentType === 'transform' && source !== 'hierarchyDrop';
         const isDisplayChange = ['renderable', 'light', 'camera'].includes(componentType);

         if (isHierarchyChange || isDisplayChange) {
              // TODO: Implement more granular update instead of full re-render if performance becomes an issue
              this._renderHierarchy();
         }
    }
    // --- END NEW HANDLERS ---

    _handleListContainerClick(event) { /* ... (unchanged) ... */ const itemElement = event.target.closest('.hierarchy-item'); if (!itemElement) return; const toggleElement = event.target.closest('.hierarchy-toggle'); if (toggleElement) { this._handleToggleClick(itemElement, toggleElement); } else { if (itemElement.dataset.entityId) { const entityIdStr = itemElement.dataset.entityId; const entityId = parseInt(entityIdStr, 10); if (!isNaN(entityId)) { this.editor.selectEntity(entityId); } else { console.warn(`[HierarchyPanel._handleListContainerClick] Invalid entity ID found: ${entityIdStr}`); } } else { console.warn("[HierarchyPanel._handleListContainerClick] Clicked item missing valid data-entity-id."); } } }
    _handleToggleClick(itemElement, toggleElement) { /* ... (unchanged) ... */ const sublist = itemElement.querySelector(':scope > ul.hierarchy-subtree'); if (sublist) { const isExpanded = itemElement.classList.toggle('expanded'); sublist.style.display = isExpanded ? 'block' : 'none'; toggleElement.textContent = isExpanded ? '▼' : '▶'; } }
    _onEntitySelected({ id }) { /* ... (unchanged) ... */ if (!this.listContainer) return; this.listContainer.querySelectorAll('.hierarchy-item.selected').forEach(el => { el.classList.remove('selected'); }); if (id !== null) { const selectedItem = this.listContainer.querySelector(`.hierarchy-item[data-entity-id="${id}"]`); if (selectedItem) selectedItem.classList.add('selected'); } this._updateButtonStates(id); }
    _updateButtonStates(selectedId) { /* ... (unchanged) ... */ if (this.createPrefabButton) { this.createPrefabButton.disabled = (selectedId === null); } if(this.instantiatePrefabButton) { this.instantiatePrefabButton.disabled = false; } }

    _renderHierarchy() {
        // console.log("[HierarchyPanel] Rendering hierarchy..."); // Reduce logging noise
        if (!this.listContainer || !this.editor?.entityManager) { return; }
        const em = this.editor.entityManager;
        const selectedIdBeforeRender = this.editor.getSelectedEntity();
        // --- MODIFICATION: Preserve expansion state ---
        const expansionState = this._getExpansionState();
        // --- END MODIFICATION ---
        this.listContainer.innerHTML = '';
        const rootEntities = em.getRootEntities();
        if (rootEntities.length === 0) {
            this.listContainer.innerHTML = '<li style="font-style: italic; color: #aaa; font-size: 0.9em; padding: 5px 8px;">Scene is empty.</li>';
        } else {
            rootEntities.sort((a, b) => a - b).forEach(entityId => {
                this._renderEntityItem(entityId, this.listContainer, 0, expansionState);
            });
        }
        this._onEntitySelected({ id: selectedIdBeforeRender }); // Re-apply selection highlight
        this._updateButtonStates(selectedIdBeforeRender);
    }

    // --- MODIFICATION: Add expansionState parameter ---
    _renderEntityItem(entityId, parentListElement, level, expansionState) {
        if (!this.editor?.entityManager?.hasEntity(entityId)) return;
        const em = this.editor.entityManager;

        const item = document.createElement('li');
        item.className = 'hierarchy-item';
        item.dataset.entityId = entityId;
        // --- MODIFICATION: Make item draggable ---
        item.draggable = true;
        // --- END MODIFICATION ---

        const itemContent = document.createElement('div');
        itemContent.style.display = 'flex';
        itemContent.style.alignItems = 'center';
        itemContent.style.paddingLeft = `${level * 15}px`; // Use padding for indentation

        const childrenIds = Array.from(em.getChildren(entityId));
        const hasChildren = childrenIds.length > 0;
        const isExpanded = expansionState[entityId] || false; // Get expansion state

        const toggle = document.createElement('span');
        toggle.className = 'hierarchy-toggle';
        toggle.style.cssText = 'width:1em; display:inline-block; text-align:center; margin-right:4px; user-select: none; flex-shrink: 0;';
        if (hasChildren) {
            toggle.textContent = isExpanded ? '▼' : '▶'; // Set based on saved state
            toggle.style.cursor = 'pointer';
        } else {
            toggle.innerHTML = '&nbsp;'; // Use non-breaking space for alignment
            toggle.style.cursor = 'default';
        }
        itemContent.appendChild(toggle);

        const { entityType, entityIcon } = this._getEntityDisplayInfo(entityId);
        item.title = `${entityType} ${entityId}`; // Tooltip

        const iconSpan = document.createElement('span');
        iconSpan.className = 'hierarchy-icon';
        iconSpan.textContent = entityIcon;
        iconSpan.style.marginRight = '6px';
        itemContent.appendChild(iconSpan);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'hierarchy-label';
        labelSpan.textContent = `${entityType} ${entityId}`;
        labelSpan.style.cssText = 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; flex-grow:1;';
        itemContent.appendChild(labelSpan);

        item.appendChild(itemContent);
        parentListElement.appendChild(item);

        // --- MODIFICATION: Create/show subtree based on expansionState ---
        if (hasChildren) {
            const subList = document.createElement('ul');
            subList.className = 'hierarchy-subtree';
            subList.style.cssText = 'list-style:none; padding:0; margin:0;';
            subList.style.display = isExpanded ? 'block' : 'none'; // Set initial display state
            item.appendChild(subList);
            if (isExpanded) item.classList.add('expanded'); // Add class if needed for styling

            childrenIds.sort((a, b) => a - b).forEach(childId => {
                 if (em.hasEntity(childId)) {
                      this._renderEntityItem(childId, subList, level + 1, expansionState);
                 } else { console.warn(`HierarchyPanel: Child ${childId} of ${entityId} not found during render.`); }
            });
        }
        // --- END MODIFICATION ---
    }
    // --- END MODIFICATION ---


    // --- NEW: Helper to get current expansion state before re-render ---
    _getExpansionState() {
        const state = {};
        this.listContainer?.querySelectorAll('.hierarchy-item.expanded').forEach(item => {
            const id = item.dataset.entityId;
            if (id) state[id] = true;
        });
        return state;
    }
    // --- END NEW ---


    _getEntityDisplayInfo(entityId) { /* ... unchanged ... */ let entityType = 'Entity'; let entityIcon = '❔'; if (!this.editor) return { entityType, entityIcon }; const rend = this.editor.getComponent(entityId, 'renderable'); const light = this.editor.getComponent(entityId, 'light'); const cam = this.editor.getComponent(entityId, 'camera'); if (rend) { entityType = rend.type || 'Mesh'; if(rend.type === 'Model') entityIcon = '📦'; else if (rend.type === 'Cube') entityIcon = '🧊'; else if (rend.type === 'Sphere') entityIcon = '⚪'; else if (rend.type === 'Ground') entityIcon = '➖'; else entityIcon = '🧊'; } else if (light) { entityType = light.type ? `${light.type} Light` : 'Light'; entityIcon = '💡'; } else if (cam) { entityType = cam.type ? `${cam.type} Camera` : 'Camera'; entityIcon = '📷'; } return { entityType, entityIcon }; }
    _handleCreatePrefab() { /* ... unchanged ... */ const selectedId = this.editor?.getSelectedEntity(); if (selectedId === null || !this.editor?.prefabManager) { alert("Please select an entity in the hierarchy first."); return; } const prefabName = prompt("Enter a name for the prefab:", `Prefab_${selectedId}`); if (prefabName && prefabName.trim() !== "") { try { this.editor.prefabManager.savePrefab(selectedId, prefabName.trim()); alert(`Prefab "${prefabName.trim()}" saved successfully!`); } catch (error) { console.error("Error saving prefab:", error); alert(`Failed to save prefab: ${error.message}`); } } else if (prefabName !== null) { alert("Prefab name cannot be empty."); } }
    _handleInstantiatePrefab() { /* ... unchanged ... */ if (!this.editor?.prefabManager) return; const savedPrefabs = this.editor.prefabManager.listPrefabs(); let promptMessage = "Enter the name of the prefab to instantiate:"; if (savedPrefabs && savedPrefabs.length > 0) { promptMessage += `\nAvailable: ${savedPrefabs.join(', ')}`; } else { alert("No saved prefabs found."); return; } const prefabName = prompt(promptMessage); if (prefabName && prefabName.trim() !== "") { try { const newEntityId = this.editor.prefabManager.createEntityFromPrefab(prefabName.trim()); if (newEntityId !== null) { this.editor.selectEntity(newEntityId); } else { alert(`Could not instantiate prefab "${prefabName.trim()}". Check console.`); } } catch (error) { console.error("Error instantiating prefab:", error); alert(`Failed to instantiate prefab: ${error.message}`); } } else if (prefabName !== null) { alert("Prefab name cannot be empty."); } }


    // --- NEW: Drag and Drop Handlers ---
    _handleDragStart(event) {
        const itemElement = event.target.closest('.hierarchy-item');
        if (!itemElement || !itemElement.dataset.entityId) {
            event.preventDefault(); // Don't allow dragging invalid items
            return;
        }

        this.draggedEntityId = parseInt(itemElement.dataset.entityId, 10);
        if (isNaN(this.draggedEntityId)) {
            event.preventDefault();
            this.draggedEntityId = null;
            return;
        }

        // Store data and set effect
        event.dataTransfer.setData('text/plain', this.draggedEntityId.toString());
        event.dataTransfer.effectAllowed = 'move';
        itemElement.classList.add('dragging'); // Visual feedback
        console.log(`[Hierarchy DnD] Drag Start: Entity ${this.draggedEntityId}`);
    }

    _handleDragOver(event) {
        event.preventDefault(); // Necessary to allow dropping
        event.dataTransfer.dropEffect = 'move';

        const targetElement = event.target.closest('.hierarchy-item, .hierarchy-root'); // Allow drop on items or root
        if (!targetElement) {
             this._clearDragOverStyles();
             return;
        }

        // Avoid adding style repeatedly to the same element
        if (this.dragOverElement !== targetElement) {
            this._clearDragOverStyles(); // Clear previous target
            this.dragOverElement = targetElement;
            this.dragOverElement.classList.add('drag-over'); // Add style to current target
        }
    }

    _handleDragLeave(event) {
         // Only clear if leaving the element we styled
        if (event.target === this.dragOverElement) {
             this._clearDragOverStyles();
        }
    }

    _handleDrop(event) {
        event.preventDefault(); // Prevent default drop behavior (like opening link)
        this._clearDragOverStyles(); // Clear visual feedback

        if (this.draggedEntityId === null) return;

        const targetElement = event.target.closest('.hierarchy-item, .hierarchy-root');
        let newParentId = null; // Default to root

        if (targetElement && targetElement.classList.contains('hierarchy-item')) {
            newParentId = parseInt(targetElement.dataset.entityId, 10);
            if (isNaN(newParentId)) newParentId = null; // Fallback to root if ID invalid
        }

        console.log(`[Hierarchy DnD] Drop: Dragged ${this.draggedEntityId} onto target parent ${newParentId}`);

        // --- Validation ---
        if (this.draggedEntityId === newParentId) {
            console.warn("[Hierarchy DnD] Cannot parent entity to itself.");
            return;
        }
        // Circular dependency check is handled by EntityManager.setParent

        // --- Execute Command ---
        if (this.editor?.commandManager) {
            const cmd = new ReparentEntityCommand(this.editor, this.draggedEntityId, newParentId);
            this.editor.commandManager.execute(cmd);
            // The hierarchy should re-render automatically due to entityUpdated event from setParent
        } else {
            console.error("[Hierarchy DnD] CommandManager not available.");
        }

        this.draggedEntityId = null; // Reset drag state
    }

    _handleDragEnd(event) {
        // Cleanup visual styles regardless of drop success
        this.listContainer?.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        this._clearDragOverStyles();
        this.draggedEntityId = null;
        console.log("[Hierarchy DnD] Drag End");
    }

    _clearDragOverStyles() {
        if (this.dragOverElement) {
            this.dragOverElement.classList.remove('drag-over');
            this.dragOverElement = null;
        }
    }
    // --- END NEW: Drag and Drop Handlers ---


    /** @override */
    destroy() {
        // Remove the delegated listeners
        if (this.listContainer) {
            this.listContainer.removeEventListener('click', this._handleListContainerClick);
            // --- MODIFICATION: Remove drag listeners ---
            this.listContainer.removeEventListener('dragstart', this._handleDragStart);
            this.listContainer.removeEventListener('dragover', this._handleDragOver);
            this.listContainer.removeEventListener('dragleave', this._handleDragLeave);
            this.listContainer.removeEventListener('drop', this._handleDrop);
            this.listContainer.removeEventListener('dragend', this._handleDragEnd);
            // --- END MODIFICATION ---
        }
        // Remove engine listeners
        if (this.editor?.eventEmitter) {
             const emitter = this.editor.eventEmitter;
             emitter.off('entityCreated', this._renderHierarchy);
             emitter.off('entityRemoved', this._renderHierarchy);
             emitter.off('componentAdded', this._handleComponentChange);
             emitter.off('componentRemoved', this._handleComponentChange);
             emitter.off('entityUpdated', this._handleEntityUpdate);
             emitter.off('sceneImported', this._renderHierarchy);
             emitter.off('entitySelected', this._onEntitySelected);
        }
        // Clean up button handlers
        if (this.createPrefabButton) this.createPrefabButton.onclick = null;
        if (this.instantiatePrefabButton) this.instantiatePrefabButton.onclick = null;
        // Clear references
        this.listContainer = null; this.buttonContainer = null;
        this.createPrefabButton = null; this.instantiatePrefabButton = null;
        this.draggedEntityId = null; this.dragOverElement = null; // Clear drag state
        super.destroy();
    }
}

// --- CSS for Drag/Drop (Consider moving to main CSS file) ---
const styleId = 'hierarchy-drag-drop-styles';
if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .hierarchy-item.dragging {
            opacity: 0.5;
            border: 1px dashed #aaa;
        }
        .hierarchy-item.drag-over > div,
        .hierarchy-root.drag-over { /* Style root UL too */
            background-color: rgba(100, 150, 255, 0.3) !important; /* Use !important carefully */
            outline: 1px dashed #77aaff;
        }
    `;
    document.head.appendChild(style);
}
// --- END CSS ---