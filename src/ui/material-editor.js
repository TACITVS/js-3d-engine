// src/ui/material-editor.js
// @version 1.1.2 - Added debugging for selectedEntityId

import { UIComponent } from './ui-component.js';
import { UpdateComponentCommand } from '../editor/command-manager.js';

export class MaterialEditor extends UIComponent {
    constructor(editor) {
        super(editor);
        this.selectedEntityId = null;
        this.selectedThreeObject = null;
        this.selectedMaterial = null;
        this.colorInput = null;
        this.roughnessInput = null;
        this.metalnessInput = null;
        this.noMaterialMessage = null;
        this.propertiesContainer = null;
        this.changeTracker = { active: false, propertyName: null, oldValue: null };
        this._handleEntitySelected = this._handleEntitySelected.bind(this);
        this._handleColorInput = this._handleColorInput.bind(this);
        this._handleRoughnessInput = this._handleRoughnessInput.bind(this);
        this._handleMetalnessInput = this._handleMetalnessInput.bind(this);
        this._handleColorCommit = this._handleColorCommit.bind(this);
        this._handleRangeCommit = this._handleRangeCommit.bind(this);
    }

    /** @protected */
    _createElement() {
        const panel = document.createElement('div');
        panel.className = 'editor-material-panel';
        Object.assign(panel.style, { position: 'absolute', top: 'calc(50% + 5px)', left: '10px', width: '260px', height: 'calc(50% - 15px)', padding: '10px', overflowY: 'auto', boxSizing: 'border-box' });
        const header = document.createElement('h3'); header.textContent = 'Material'; header.style.cssText = 'margin:0 0 10px 0; padding-bottom:5px; border-bottom:1px solid #555; font-size:1em;'; panel.appendChild(header);
        this.noMaterialMessage = document.createElement('div'); this.noMaterialMessage.textContent = 'Select mesh with material'; this.noMaterialMessage.style.cssText = 'font-style:italic; color:#aaa; margin-top:10px; font-size: 0.9em;'; panel.appendChild(this.noMaterialMessage);
        this.propertiesContainer = document.createElement('div'); this.propertiesContainer.style.display = 'none'; panel.appendChild(this.propertiesContainer);
        this._addMaterialProperties();
        return panel;
    }

    /** @private */
     _addMaterialProperties() {
        this.propertiesContainer.innerHTML = ''; const colorRow = this._createInputRow('Color', 'color'); this.colorInput = colorRow.querySelector('input'); this.propertiesContainer.appendChild(colorRow); const roughnessRow = this._createInputRow('Roughness', 'range'); this.roughnessInput = roughnessRow.querySelector('input'); Object.assign(this.roughnessInput, { min: '0', max: '1', step: '0.01', value: '0.5' }); this.propertiesContainer.appendChild(roughnessRow); const metalnessRow = this._createInputRow('Metalness', 'range'); this.metalnessInput = metalnessRow.querySelector('input'); Object.assign(this.metalnessInput, { min: '0', max: '1', step: '0.01', value: '0.1' }); this.propertiesContainer.appendChild(metalnessRow);
    }

    /** @private Helper to create a label + input row */
    _createInputRow(label, inputType) { const row = document.createElement('div'); row.className = 'property-row'; Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.9em' }); const labelElement = document.createElement('label'); labelElement.textContent = label + ':'; labelElement.style.marginRight = '8px'; row.appendChild(labelElement); const inputElement = document.createElement('input'); inputElement.type = inputType; inputElement.style.boxSizing = 'border-box'; if (inputType === 'range') inputElement.style.width = '80px'; else if (inputType === 'color') { inputElement.style.width = '60px'; inputElement.style.height = '24px'; inputElement.style.padding = '1px 2px'; } else inputElement.style.width = '70px'; row.appendChild(inputElement); return row; }

    /** @protected */
    _setupEventListeners() { if (!this.editor?.eventEmitter) { console.error("MaterialEditor: Cannot setup listeners."); return; } this.editor.eventEmitter.on('entitySelected', this._handleEntitySelected); if (this.colorInput) { this.colorInput.addEventListener('input', this._handleColorInput); this.colorInput.addEventListener('change', this._handleColorCommit); this.colorInput.addEventListener('focus', () => this._startTrackingChange('color')); } if (this.roughnessInput) { this.roughnessInput.addEventListener('input', this._handleRoughnessInput); this.roughnessInput.addEventListener('change', this._handleRangeCommit); this.roughnessInput.addEventListener('focus', () => this._startTrackingChange('roughness')); } if (this.metalnessInput) { this.metalnessInput.addEventListener('input', this._handleMetalnessInput); this.metalnessInput.addEventListener('change', this._handleRangeCommit); this.metalnessInput.addEventListener('focus', () => this._startTrackingChange('metalness')); } this._handleEntitySelected({ id: this.editor.getSelectedEntity() }); }

    /** @private */
    _handleEntitySelected({ id }) {
        if (!this.element || !this.editor) return;

        // --- DEBUG LOG ---
        console.log(`MaterialEditor: _handleEntitySelected received ID: ${id}`);
        this.selectedEntityId = id; // Update internal state
        console.log(`MaterialEditor: this.selectedEntityId is now: ${this.selectedEntityId}`);
        // --- END DEBUG ---

        this.selectedThreeObject = null; this.selectedMaterial = null; this.changeTracker.active = false;
        if (id !== null) { const rendererSystem = this.editor.getSystem('renderer'); if (rendererSystem?.entityObjects?.get) { const entry = rendererSystem.entityObjects.get(id); if (entry?.type === 'mesh' && entry.threeObject?.material && !Array.isArray(entry.threeObject.material)) { this.selectedThreeObject = entry.threeObject; this.selectedMaterial = this.selectedThreeObject.material; } } else console.warn("MaterialEditor: Renderer system or entityObjects missing."); }
        this._updateMaterialUI();
    }

    /** @private */
    _updateMaterialUI() { if (!this.propertiesContainer || !this.noMaterialMessage) return; const hasMaterial = this.selectedMaterial?.isMaterial; this.propertiesContainer.style.display = hasMaterial ? 'block' : 'none'; this.noMaterialMessage.style.display = hasMaterial ? 'none' : 'block'; if (!hasMaterial) return; try { if (this.colorInput && this.selectedMaterial.color) { const hex = `#${this.selectedMaterial.color.getHexString()}`; if (this.colorInput.value !== hex) this.colorInput.value = hex; } if (this.roughnessInput) { this.roughnessInput.disabled = this.selectedMaterial.roughness === undefined; if (!this.roughnessInput.disabled) { const v = this.selectedMaterial.roughness.toString(); if(this.roughnessInput.value !== v) this.roughnessInput.value = v; } } if (this.metalnessInput) { this.metalnessInput.disabled = this.selectedMaterial.metalness === undefined; if (!this.metalnessInput.disabled) { const v = this.selectedMaterial.metalness.toString(); if(this.metalnessInput.value !== v) this.metalnessInput.value = v; } } } catch (error) { console.error("MaterialEditor: Error updating UI:", error); this.propertiesContainer.style.display = 'none'; this.noMaterialMessage.textContent = 'Error accessing material'; this.noMaterialMessage.style.display = 'block'; } }

    _handleColorInput(e) { if (this.selectedMaterial?.color) this.selectedMaterial.color.set(e.target.value); }
    _handleRoughnessInput(e) { if (this.selectedMaterial?.roughness !== undefined) this.selectedMaterial.roughness = parseFloat(e.target.value); }
    _handleMetalnessInput(e) { if (this.selectedMaterial?.metalness !== undefined) this.selectedMaterial.metalness = parseFloat(e.target.value); }
    _startTrackingChange(propertyName) { if (!this.selectedEntityId || !this.editor) return; const component = this.editor.getComponent(this.selectedEntityId, 'renderable'); if (component?.[propertyName] !== undefined) { this.changeTracker.active = true; this.changeTracker.propertyName = propertyName; this.changeTracker.oldValue = typeof structuredClone === 'function' && typeof component[propertyName] === 'object' ? structuredClone(component[propertyName]) : JSON.parse(JSON.stringify(component[propertyName])); } else this.changeTracker.active = false; }
    _handleColorCommit(e) { this._commitChange(parseInt(e.target.value.substring(1), 16)); }
    _handleRangeCommit(e) { this._commitChange(parseFloat(e.target.value)); }

    /** @private */
    _commitChange(newValue) {
         // --- DEBUG LOG ---
         console.log(`MaterialEditor: _commitChange called for property "${this.changeTracker.propertyName}". Current this.selectedEntityId = ${this.selectedEntityId}`);
         // --- END DEBUG ---

         if (!this.changeTracker.active || this.changeTracker.propertyName === null || !this.selectedEntityId || !this.editor?.getCommandManager()) {
              console.warn(`MaterialEditor: _commitChange aborted. Tracker Active: ${this.changeTracker.active}, Property: ${this.changeTracker.propertyName}, EntityID: ${this.selectedEntityId}`);
              this.changeTracker.active = false; // Ensure tracker is reset
              return;
         }
         const propertyName = this.changeTracker.propertyName;
         const oldValue = this.changeTracker.oldValue;
         const currentEntityId = this.selectedEntityId; // Capture ID before resetting tracker

         this.changeTracker.active = false; // Reset tracker *before* potentially slow command execution

         if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
              const commandProperties = { [propertyName]: { oldValue: oldValue, newValue: newValue } };
              console.log(`MaterialEditor: Creating UpdateComponentCommand for Entity: ${currentEntityId}, Component: renderable, Properties:`, commandProperties);
              try {
                  // --- Pass the CAPTURED entity ID ---
                  const command = new UpdateComponentCommand(this.editor, currentEntityId, 'renderable', commandProperties);
                  this.editor.getCommandManager().execute(command);
                  console.log(`MaterialEditor: Executed UpdateComponentCommand for ${propertyName}.`);
              } catch (commandError) {
                   console.error("MaterialEditor: Error executing UpdateComponentCommand:", commandError);
                   // CommandManager should already log, but we add context here
              }

         } else {
              console.log(`MaterialEditor: Value for ${propertyName} did not change. Reverting live preview.`);
              // If value didn't change vs focus start, ensure live preview matches component state
              const component = this.editor.getComponent(currentEntityId, 'renderable');
              if (component && this.selectedMaterial) {
                    try {
                        if (propertyName === 'color' && this.selectedMaterial.color) this.selectedMaterial.color.set(component.color);
                        else if (propertyName === 'roughness' && this.selectedMaterial.roughness !== undefined) this.selectedMaterial.roughness = component.roughness;
                        else if (propertyName === 'metalness' && this.selectedMaterial.metalness !== undefined) this.selectedMaterial.metalness = component.metalness;
                    } catch (e) { console.warn("MaterialEditor: Error reverting preview:", e); }
              }
         }
    }

    /** @override */
    destroy() { if (this.editor?.eventEmitter) this.editor.eventEmitter.off('entitySelected', this._handleEntitySelected); if (this.colorInput) { this.colorInput.removeEventListener('input', this._handleColorInput); this.colorInput.removeEventListener('change', this._handleColorCommit); /* Note: lambda focus listeners aren't removed easily */ } if (this.roughnessInput) { this.roughnessInput.removeEventListener('input', this._handleRoughnessInput); this.roughnessInput.removeEventListener('change', this._handleRangeCommit); } if (this.metalnessInput) { this.metalnessInput.removeEventListener('input', this._handleMetalnessInput); this.metalnessInput.removeEventListener('change', this._handleRangeCommit); } this.colorInput = null; this.roughnessInput = null; this.metalnessInput = null; this.propertiesContainer = null; this.noMaterialMessage = null; this.selectedMaterial = null; this.selectedThreeObject = null; super.destroy(); }
}