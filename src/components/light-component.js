// src/components/light-component.js
// @version 1.1.1 - Updated to use engineConfig for core defaults.
// @previous 1.1.0 - Exclude rendererLight from serialization

import * as logger from '../utils/logger.js';
import { Component } from '../ecs/component.js';
// --- MODIFIED IMPORT ---
import { engineConfig } from '../engine-config.js';
// --- END MODIFICATION ---

export class LightComponent extends Component {
    constructor(data = {}) {
        super();
        // --- MODIFIED DEFAULTS ---
        // Use defaults from engineConfig if not provided
        this.type = data.type || engineConfig.light.type;
        this.color = data.color ?? engineConfig.light.color;

        // Determine intensity default based on type from engineConfig
        let defaultIntensity;
        switch (this.type) {
             case 'ambient': defaultIntensity = engineConfig.light.ambientIntensity; break;
             case 'directional': defaultIntensity = engineConfig.light.directionalIntensity; break;
             default: defaultIntensity = engineConfig.light.intensity; break;
        }
        this.intensity = data.intensity ?? defaultIntensity;

        // Point light specific (use defaults if not point?) - okay for now
        this.distance = data.distance ?? engineConfig.light.distance; // Use ?? for 0 being valid
        this.decay = data.decay ?? engineConfig.light.decay;          // Use ?? for 0 being valid

        // Shadow property
        this.castShadow = data.castShadow ?? engineConfig.light.castShadow; // Use ??
        // --- END MODIFICATION ---

        /** @type {THREE.Light | null} Runtime reference to the renderer light object */
        this.rendererLight = null; // Initialize as null
    }

    /**
     * Lifecycle hook called before component removal.
     * Clear the runtime reference.
     */
    onRemove() {
        // Renderer system handles actual disposal
        this.rendererLight = null;
        // logger.log("LightComponent removed, rendererLight reference cleared.");
    }

    /**
     * Serializes the component's persistent state.
     * Explicitly excludes the runtime 'rendererLight'.
     * @returns {object} Serializable state data.
     */
    serialize() {
        // Return only the properties needed to reconstruct the component
        return {
            type: this.type,
            color: this.color,
            intensity: this.intensity,
            distance: this.distance,
            decay: this.decay,
            castShadow: this.castShadow,
            // DO NOT include this.rendererLight
        };
    }
}