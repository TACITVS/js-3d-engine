// src/components/tag-component.js (SIMPLIFIED TEST VERSION)
import * as logger from '../utils/logger.js';
import { Component } from '../ecs/component.js';

logger.log("[TagComponent Module] Loading..."); // Add log

export class TagComponent extends Component {
    constructor(data = {}) {
        super();
        this.tags = data.tags || ['test_tag']; // Minimal valid data
        logger.log("[TagComponent] Constructed instance with tags:", this.tags);
    }
    // No other methods needed for this test
    serialize() {
        return { tags: [...this.tags] };
    }
}

logger.log("[TagComponent Module] Loaded OK."); // Add log
