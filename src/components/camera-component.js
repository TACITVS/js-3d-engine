// src/components/camera-component.js
// @version 1.1.1 - Updated to use engineConfig for core defaults.
// @previous 1.1.0 - Exclude rendererCamera and runtime properties from serialization

import { Component } from '../ecs/component.js';
// --- MODIFIED IMPORT ---
import { engineConfig } from '../engine-config.js';
// --- END MODIFICATION ---

export class CameraComponent extends Component {
    constructor(data = {}) {
        super();
        // --- MODIFIED DEFAULTS ---
        // Use defaults from engineConfig if not provided
        this.type = data.type || engineConfig.camera.type; // 'perspective' or 'orthographic'

        // Perspective specific
        this.fov = data.fov ?? engineConfig.camera.fov; // Vertical field of view in degrees

        // Orthographic specific
        this.orthoSize = data.orthoSize ?? engineConfig.camera.orthoSize; // Half-height of the view area

        // Common properties
        // Aspect ratio is determined by viewport size at runtime, not serialized.
        const defaultAspect = (typeof window !== 'undefined' && window.innerHeight > 0)
            ? window.innerWidth / window.innerHeight
            : 16 / 9;
        this.aspect = data.aspect ?? defaultAspect; // Store current aspect, but don't serialize

        this.near = data.near ?? engineConfig.camera.near; // Near clipping plane
        this.far = data.far ?? engineConfig.camera.far;   // Far clipping plane
        this.isActive = data.isActive ?? engineConfig.camera.initialActive; // Should this camera be used?
        // --- END MODIFICATION ---

        /** @type {THREE.Camera | null} Runtime reference */
        this.rendererCamera = null;
    }

    onRemove() {
        // Renderer system handles disposal
        this.rendererCamera = null;
    }

    /**
     * Serializes the component's persistent state.
     * Excludes runtime 'rendererCamera' and derived 'aspect'.
     * @returns {object} Serializable state data.
     */
    serialize() {
        // Only include properties needed to reconstruct the camera settings
        const persistentData = {
            type: this.type,
            near: this.near,
            far: this.far,
            isActive: this.isActive,
            // Include FOV only for perspective cameras
            ...(this.type === 'perspective' && { fov: this.fov }),
            // Include orthoSize only for orthographic cameras
            ...(this.type === 'orthographic' && { orthoSize: this.orthoSize }),
            // DO NOT include this.rendererCamera
            // DO NOT include this.aspect
        };
        return persistentData;
    }
}