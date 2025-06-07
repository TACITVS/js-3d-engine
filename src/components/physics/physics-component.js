// src/components/physics/physics-component.js
// @version 1.0.1 - Updated to use engineConfig for core defaults.
// @previous 1.0.0 - Moved from core.js

import { Component } from '../../ecs/component.js';
// --- MODIFIED IMPORT ---
import { engineConfig } from '../../engine-config.js';
// --- END MODIFICATION ---

export class PhysicsComponent extends Component {
    constructor(data = {}) {
        super();
        // --- MODIFIED DEFAULTS ---
        this.bodyType = data.bodyType ?? engineConfig.physics.bodyType;
        this.density = data.density ?? engineConfig.physics.density;
        this.restitution = data.restitution ?? engineConfig.physics.restitution;
        this.friction = data.friction ?? engineConfig.physics.friction;
        this.colliderType = data.colliderType ?? engineConfig.physics.colliderType;
        // Ensure colliderSize is always an array, default based on engineConfig or fallback
        this.colliderSize = Array.isArray(data.colliderSize) ? [...data.colliderSize] : (engineConfig.physics.colliderSize ? [...engineConfig.physics.colliderSize] : [0.5, 0.5, 0.5]);
        this.linearDamping = data.linearDamping ?? engineConfig.physics.linearDamping;
        this.angularDamping = data.angularDamping ?? engineConfig.physics.angularDamping;
        this.ccdEnabled = data.ccdEnabled ?? engineConfig.physics.ccdEnabled;
        this.isSensor = data.isSensor ?? engineConfig.physics.isSensor;
        // --- END MODIFICATION ---
    }

    serialize() {
        return {
            bodyType: this.bodyType,
            density: this.density,
            restitution: this.restitution,
            friction: this.friction,
            colliderType: this.colliderType,
            colliderSize: [...this.colliderSize], // Ensure array copy
            linearDamping: this.linearDamping,
            angularDamping: this.angularDamping,
            ccdEnabled: this.ccdEnabled,
            isSensor: this.isSensor,
        };
    }
}