// src/games/breakout/components/breakout-components.js
// @version 1.1.0 - Updated to use breakout-config.js
// @previous - Original version using src/config.js

import { Component } from '../../ecs/component.js';
// --- MODIFIED IMPORT ---
import { breakoutConfig } from './breakout-config.js'; // <-- Import breakout config
// --- END MODIFICATION ---

/**
 * Marker component for the player's paddle.
 */
export class PaddleComponent extends Component {
    constructor(data = {}) {
        super();
        // --- MODIFIED DEFAULT ---
        this.speed = data.speed ?? breakoutConfig.paddle.speed; // <-- Use breakoutConfig
        // --- END MODIFICATION ---
    }
    serialize() { return { speed: this.speed }; }
}

/**
 * Marker component for the ball.
 */
export class BallComponent extends Component {
    constructor(data = {}) {
        super();
        // --- MODIFIED DEFAULTS ---
        this.baseSpeed = data.baseSpeed ?? breakoutConfig.ball.baseSpeed; // <-- Use breakoutConfig
        this.isLaunched = data.isLaunched ?? false;
        // --- END MODIFICATION ---
    }
    serialize() { return { baseSpeed: this.baseSpeed, isLaunched: this.isLaunched }; }
}

/**
 * Marker component for destructible bricks.
 */
export class BrickComponent extends Component {
    constructor(data = {}) {
        super();
        // --- MODIFIED DEFAULT ---
        // Use config default, but expect scene/color mapping to override
        this.scoreValue = data.scoreValue ?? breakoutConfig.brick.scoreValue; // <-- Use breakoutConfig
        // --- END MODIFICATION ---
    }
    serialize() { return { scoreValue: this.scoreValue }; }
}

/**
 * Component to hold game score and lives.
 */
export class ScoreComponent extends Component {
    constructor(data = {}) {
        super();
        // --- MODIFIED DEFAULTS ---
        this.score = data.score ?? breakoutConfig.score.initialScore; // <-- Use breakoutConfig
        this.lives = data.lives ?? breakoutConfig.score.initialLives; // <-- Use breakoutConfig
        // --- END MODIFICATION ---
    }
    serialize() { return { score: this.score, lives: this.lives }; }
}

/**
 * Marker component for game boundaries (walls, floor).
 */
export class BoundaryComponent extends Component {
     constructor(data = {}) {
        super();
        // Type doesn't have an obvious single default in config, keep as is
        this.type = data.type ?? 'wall'; // 'wall', 'floor', 'ceiling'
    }
    serialize() { return { type: this.type }; }
}