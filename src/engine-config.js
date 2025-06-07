// src/engine-config.js
// Central configuration for CORE ENGINE default values and constants.
// Game-specific configurations should be in separate files.
// @version 1.1.0 - Added assetManager.basePath configuration.

export const engineConfig = {
    // --- Asset Manager Defaults ---
    assetManager: {
        basePath: '/src/asset/', // Default base path for assets (relative to index.html)
    },

    // --- Rendering Defaults ---
    renderer: {
        backgroundColor: 0x1e1e1e,
        gridHelperColorCenter: 0x888888,
        gridHelperColorGrid: 0x444444,
        gridHelperSize: 10,
        gridHelperDivisions: 10,
        axesHelperSize: 2,
    },

    // --- Core Component Defaults ---
    camera: {
        type: 'perspective',
        fov: 45,
        // aspect is derived at runtime
        orthoSize: 5,
        near: 0.1,
        far: 1000,
        initialActive: false, // Default for newly created cameras
        defaultEditorPosition: [8, 6, 8],
        defaultEditorRotation: [-30, 45, 0],
    },
    light: {
        type: 'directional', // default type
        color: 0xffffff,
        intensity: 1.0,
        distance: 0, // for point light (0 = infinite)
        decay: 2,    // for point light (physically correct)
        castShadow: false,
        ambientIntensity: 0.6, // Specific default for ambient
        directionalIntensity: 0.8, // Specific default for directional
    },
    renderable: {
        type: 'Cube', // Default primitive type
        color: 0xcccccc,
        visible: true,
        castShadow: true,
        receiveShadow: true,
        roughness: 0.6,
        metalness: 0.1,
        defaultGroundColor: 0x555555,
        defaultGroundRoughness: 0.8,
    },
    transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
    },
    physics: {
        // Default values for PhysicsComponent data if creating directly
        bodyType: 'static',
        density: 1.0,
        restitution: 0.5,
        friction: 0.5,
        colliderType: 'cuboid',
        colliderSize: [1.0, 1.0, 1.0], // Default local collider size (scaled by transform)
        linearDamping: 0.1,
        angularDamping: 0.1,
        ccdEnabled: false,
        isSensor: false,
        // -- Engine-Level Physics Settings --
        gravity: { x: 0, y: -9.81, z: 0 }, // Used by Rapier system setup
        // Note: Game-specific physics material defaults (like ball/paddle restitution)
        // should be moved to game-specific config.
    },
    // --- Behavior Component Defaults ---
    spin: {
        speed: [0, 90, 0], // Default Y-axis spin
    },
    // --- Other Core Component Defaults ---
    velocityData: {
        x: 0,
        y: 0,
        z: 0,
    },
    tag: {
         // No specific defaults needed here, usually set per-entity
    },


    // --- Editor Defaults ---
    commandManager: {
        maxStackSize: 100,
    },
    statusBar: {
        clearLoadingTimeoutMs: 3000,
    },
    persistence: {
        localStorageKey: '3dEditorState_v1.3', // Key for saving editor layout/prefs
    },
};