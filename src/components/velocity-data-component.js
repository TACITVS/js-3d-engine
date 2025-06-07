// src/components/velocity-data-component.js
import { Component } from '../ecs/component.js';

export class VelocityDataComponent extends Component {
    constructor(data = {}) {
         super();
        this.x = data.x ?? 0;
        this.y = data.y ?? 0;
        this.z = data.z ?? 0;
        this.processed = data.processed || false; // Runtime state flag
    }

    // Override serialize to exclude runtime 'processed' flag
    serialize() {
        return {
            x: this.x,
            y: this.y,
            z: this.z
        };
    }
}