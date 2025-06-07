// src/components/renderable-component.js
// @version 1.2.1 - Updated to use engineConfig for core defaults.
// @previous 1.2.0 - Added 'Model' type for loaded assets

import { Component } from '../ecs/component.js';
// --- MODIFIED IMPORT ---
import { engineConfig } from '../engine-config.js';
// --- END MODIFICATION ---

/**
 * Defines the visual representation of an entity.
 * Can represent primitive shapes (Cube, Sphere, Ground) or a loaded model asset.
 * Uses engineConfig for default values.
 *
 * @class RenderableComponent
 * @extends Component
 */
export class RenderableComponent extends Component {
    /**
     * Creates an instance of RenderableComponent.
     * @param {object} [data={}] - Initialization data.
     * @param {'Cube'|'Sphere'|'Ground'|'Model'} [data.type='Cube'] - The type of object to render. Defaults to engineConfig value or 'Cube'. 'Model' indicates using `assetPath`.
     * @param {number} [data.color] - The color (hex) for primitive shapes. Defaults to engineConfig value.
     * @param {boolean} [data.visible] - Whether the object is initially visible. Defaults to engineConfig value.
     * @param {boolean} [data.castShadow] - Whether the object casts shadows. Defaults to engineConfig value.
     * @param {boolean} [data.receiveShadow] - Whether the object receives shadows. Defaults to engineConfig value.
     * @param {string|null} [data.assetPath=null] - Path to the asset file (e.g., .gltf, .glb) if `type` is 'Model'.
     * @param {number} [data.roughness] - Material roughness (0-1). Defaults to engineConfig value.
     * @param {number} [data.metalness] - Material metalness (0-1). Defaults to engineConfig value.
     */
    constructor(data = {}) {
        super();
        /**
         * Type of object to render ('Cube', 'Sphere', 'Ground', 'Model').
         * @type {'Cube'|'Sphere'|'Ground'|'Model'}
         */
        // --- MODIFIED DEFAULTS ---
        this.type = data.type || engineConfig.renderable.type || 'Cube';

        /** Color for primitive shapes (hex number). */
        this.color = data.color ?? engineConfig.renderable.color;
        /** Visibility state. */
        this.visible = data.visible !== undefined ? data.visible : engineConfig.renderable.visible;
        /** Casts shadows. */
        this.castShadow = data.castShadow !== undefined ? data.castShadow : engineConfig.renderable.castShadow;
        /** Receives shadows. */
        this.receiveShadow = data.receiveShadow !== undefined ? data.receiveShadow : engineConfig.renderable.receiveShadow;

        /** Path to the asset file, used when type is 'Model'. */
        this.assetPath = data.assetPath || null;

        /** Material roughness (0-1). */
        this.roughness = data.roughness ?? engineConfig.renderable.roughness;
        /** Material metalness (0-1). */
        this.metalness = data.metalness ?? engineConfig.renderable.metalness;
        // --- END MODIFICATION ---

        /**
         * Runtime reference to the THREE.Object3D instance created by the renderer system.
         * This property should NOT be serialized.
         * @type {THREE.Object3D | null}
         */
        this.rendererObject = null;
    }

    /** @override */
    onRemove() {
        this.rendererObject = null;
    }

    /**
     * Serializes the component's persistent state.
     * Excludes the runtime 'rendererObject'.
     * @returns {object} Serializable state data.
     * @override
     */
    serialize() {
        return {
            type: this.type,
            color: this.color,
            visible: this.visible,
            castShadow: this.castShadow,
            receiveShadow: this.receiveShadow,
            assetPath: this.assetPath,
            roughness: this.roughness,
            metalness: this.metalness,
            // DO NOT include this.rendererObject
        };
    }
}