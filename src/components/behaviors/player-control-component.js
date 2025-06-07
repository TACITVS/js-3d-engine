// src/components/behaviors/player-control-component.js
// @version 1.0.0 - Initial implementation

import { Component } from '../../ecs/component.js';
import { engineConfig } from '../../engine-config.js'; // For potential future defaults

/**
 * Marks an entity as player-controllable via input (e.g., WASD).
 * Can hold properties related to control sensitivity, speed, force, etc.
 *
 * @class PlayerControlComponent
 * @extends Component
 */
export class PlayerControlComponent extends Component {
    /**
     * Creates an instance of PlayerControlComponent.
     * @param {object} [data={}] - Initialization data.
     * @param {number} [data.moveForce=15.0] - The magnitude of the force/impulse applied for movement.
     * @param {number} [data.maxSpeed=8.0] - An optional maximum speed limit (implementation dependent on the control system).
     * @param {boolean} [data.useForce=true] - Whether to apply forces (true) or directly set velocity (false). System dependent.
     */
    constructor(data = {}) {
        super();
        // Example properties - the control system will interpret these
        this.moveForce = data.moveForce ?? 15.0;
        this.maxSpeed = data.maxSpeed ?? 8.0;
        this.useForce = data.useForce ?? true; // Default to applying force
    }

    /** @override */
    serialize() {
        return {
            moveForce: this.moveForce,
            maxSpeed: this.maxSpeed,
            useForce: this.useForce,
        };
    }
}