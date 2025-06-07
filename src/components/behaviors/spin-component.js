// src/components/behaviors/spin-component.js
// @version 1.0.1 - Updated to use engineConfig for core defaults.
// @previous 1.0.0 - Initial version

import { Component } from '../../ecs/component.js';
// --- ADDED IMPORT ---
import { engineConfig } from '../../engine-config.js';
// --- END ADDED IMPORT ---

/**
 * Component that makes an entity continuously rotate.
 * Uses engineConfig for default speed.
 */
export class SpinComponent extends Component {
    /**
     * @param {object} data - Component data.
     * @param {number[]} [data.speed] - Rotation speed in degrees per second for X, Y, Z axes. Defaults to engineConfig value.
     */
    constructor(data = {}) {
        super();
        // --- MODIFIED DEFAULT ---
        // Speed of rotation in degrees per second for each axis [x, y, z]
        this.speed = data.speed ? [...data.speed] : [...(engineConfig.spin.speed || [0, 90, 0])]; // Use default from engineConfig
        // --- END MODIFICATION ---
    }

    /**
     * Serializes the component state.
     * @returns {object} Serialized data.
     */
    serialize() {
        return {
            speed: [...this.speed] // Return a copy of the array
        };
    }
}