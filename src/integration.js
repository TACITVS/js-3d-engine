// @version 2.0.22 - Updated to use engineConfig for physics defaults.
// @previous 2.0.21 - Refactored Physics System into a Class, moved class to systems/physics/
// src/integration.js - Integrations using async system registration

import * as logger from './utils/logger.js';
import * as THREE from 'three'; // Keep THREE import if needed elsewhere in this file eventually
// --- MODIFIED IMPORT ---
import { engineConfig } from './engine-config.js';
// --- END MODIFICATION ---
import { RapierPhysicsSystem } from './systems/physics/rapier-physics-system.js'; // <-- IMPORT SYSTEM

// RapierPhysicsSystem Class Definition REMOVED from here

// RAPIER PHYSICS INTEGRATION SETUP FUNCTION
export const setupRapier = async (engine) => {
    logger.log("Integration v2.0.22: setupRapier started.");
    let RAPIER_INSTANCE;
    try {
        logger.log("[Integration] Attempting to import Rapier...");
        RAPIER_INSTANCE = await import('@dimforge/rapier3d-compat');
        logger.log("[Integration] Rapier module imported.");
        if (!RAPIER_INSTANCE || typeof RAPIER_INSTANCE.init !== 'function') {
             throw new Error("Imported RAPIER object is invalid or missing 'init' function.");
        }
        logger.log("[Integration] Attempting RAPIER.init()...");
        await RAPIER_INSTANCE.init();
        logger.log("[Integration] RAPIER.init() completed.");
    } catch (e) {
        logger.error("[Integration] CRITICAL ERROR during Rapier import or init:", e);
        return null; // Indicate failure
    }

    // Validate RAPIER instance after init
    if (!RAPIER_INSTANCE || typeof RAPIER_INSTANCE.World !== 'function') {
        logger.error("[Integration] CRITICAL: RAPIER object invalid or missing World constructor after initialization.");
        return null;
    }
    logger.log("[Integration] RAPIER object seems valid.");

    // Ensure the PhysicsComponent is registered before trying to use it
    if (!engine.componentRegistry.has('physics')) {
        logger.error("[Integration] CRITICAL: PhysicsComponent not found in registry. Ensure it's registered in core.js.");
        return null;
    } else {
        logger.log("[Integration] Verified PhysicsComponent is registered.");
    }

    // Create World
    // --- MODIFIED DEFAULT ---
    const gravity = engineConfig.physics.gravity;
    // --- END MODIFICATION ---
    let worldInstance;
    try {
        worldInstance = new RAPIER_INSTANCE.World(gravity);
        logger.log(`Integration: Rapier world created with gravity: ${JSON.stringify(gravity)}.`);
    } catch (worldError) {
        logger.error("[Integration] CRITICAL: Failed to create RAPIER.World:", worldError);
        return null;
    }

    // Create and Register Physics System Instance
    try {
        // Pass the necessary dependencies to the constructor
        const physicsSystemInstance = new RapierPhysicsSystem(engine, RAPIER_INSTANCE, worldInstance);
        logger.log("[Integration] Registering physics system instance...");
        // Register the instance with the engine's system manager
        await engine.registerSystem('physics', physicsSystemInstance);
        logger.log("Integration v2.0.22: Rapier physics system registered successfully.");
        logger.log("Integration v2.0.22: setupRapier complete.");
        // Return the RAPIER instance and world for potential external use (optional)
        return { RAPIER: RAPIER_INSTANCE, world: worldInstance };
    } catch (systemRegError) {
        logger.error("[Integration] CRITICAL: Failed to create or register RapierPhysicsSystem:", systemRegError);
        return null;
    }
}; // End setupRapier


// --- setupIntegrations function ---
// This function orchestrates the setup of different integrations.
// Currently, it only sets up Rapier physics.
export const setupIntegrations = async (engine) => {
    logger.log("--- Starting setupIntegrations (v2.0.22) ---");

    // Setup Rapier Physics
    let rapierData = await setupRapier(engine);
    if (!rapierData) {
        logger.error("setupIntegrations: setupRapier failed, physics integration skipped.");
        // Decide if this is critical. If physics is essential, maybe throw an error?
        // For now, just return null for the rapier part.
        return { rapier: null };
    }

    // Potential future integrations could be added here
    // e.g., let audioData = await setupAudio(engine);

    logger.log("--- Finished setupIntegrations ---");
    // Return references to the integration results if needed elsewhere
    return { rapier: rapierData };
};