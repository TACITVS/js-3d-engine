// src/games/breakout/breakout-config.js
// Configuration specific to the Breakout game.

export const breakoutConfig = {
    // --- Component Defaults ---
    paddle: {
        speed: 18.0, // Default horizontal speed
    },
    ball: {
        baseSpeed: 10.0, // Initial launch speed / target speed magnitude
    },
    brick: {
        scoreValue: 10, // Default points per brick
        // Colors/scores based on row could be defined here later if needed
        // e.g., rowColors: [0xff0000, 0xffa500, 0xffff00, 0x00ff00, 0x0000ff],
        // e.g., rowScores: [50, 40, 30, 20, 10]
    },
    score: {
        initialScore: 0,
        initialLives: 3,
    },
    boundary: {
        // Default type for boundaries - not strictly necessary as it's usually set per-instance
        // defaultType: 'wall',
    },

    // --- System Settings ---
    playArea: {
        width: 12.0,           // Used by InputSystem for clamping paddle position
        fallBoundaryY: -5.0,   // Used by BreakoutGameSystem for detecting lost ball
    },

    // --- Physics Defaults (Overrides for specific Breakout entities if needed) ---
    // Example: If paddle friction should be different from engine default
    // physics: {
    //    paddleFriction: 0.1,
    //    ballRestitution: 1.0,
    // },
};