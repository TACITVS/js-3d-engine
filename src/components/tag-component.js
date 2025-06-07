// src/components/tag-component.js (SIMPLIFIED TEST VERSION)
import { Component } from '../ecs/component.js';

console.log("[TagComponent Module] Loading..."); // Add log

export class TagComponent extends Component {
    constructor(data = {}) {
        super();
        this.tags = data.tags || ['test_tag']; // Minimal valid data
        console.log("[TagComponent] Constructed instance with tags:", this.tags);
    }
    // No other methods needed for this test
    serialize() {
        return { tags: [...this.tags] };
    }
}

console.log("[TagComponent Module] Loaded OK."); // Add log