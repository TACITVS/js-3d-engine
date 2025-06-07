import * as logger from '../../utils/logger.js';
// src/systems/behaviors/spin-system.js
// @version 1.2.0 - Added check for PhysicsComponent; only spin dynamic bodies or non-physics entities.
// @previous 1.1.0 - Added guard clauses for component data structure.

export class SpinSystem {
    constructor() {
        this.priority = 60; // Example priority, adjust as needed
        this.active = true;
        this._name = 'spin'; // System name

        // Dependencies (retrieved via engine instance in initialize/update)
        this.entityManager = null;
        this.engine = null;
    }

    /**
     * Initializes the system, getting references from the engine.
     * @param {import('../../ecs/entity-manager.js').EntityManager} entityManager
     * @param {import('../../utils/event-emitter.js').EventEmitter} eventEmitter - Unused here but part of standard signature
     * @param {import('../../core.js').Engine} engine
     */
    initialize(entityManager, eventEmitter, engine) {
        this.entityManager = entityManager;
        this.engine = engine; // Store engine reference
        logger.log("SpinSystem Initialized");
    }

    /**
     * Updates all entities with SpinComponent and TransformComponent.
     * Only applies spin if the entity has no PhysicsComponent or if its bodyType is 'dynamic'.
     * @param {object} time - Global time object { deltaTime, elapsed, ... }
     */
    update(time) {
        // Initial checks for system state
        if (!this.active || !this.entityManager || !this.engine || !time || typeof time.deltaTime !== 'number' || !isFinite(time.deltaTime)) {
             if (!time || typeof time.deltaTime !== 'number' || !isFinite(time.deltaTime)) {
                  logger.warn("SpinSystem: Invalid time object provided to update.", time);
             }
            return;
        }

        // Query for entities with Spin and Transform
        const entities = this.entityManager.getEntitiesWithComponents(['spin', 'transform']);
        if (!entities || entities.length === 0) {
            return; // No entities to process
        }

        entities.forEach(entityId => {
            const spin = this.entityManager.getComponent(entityId, 'spin');
            const transform = this.entityManager.getComponent(entityId, 'transform');
            const physics = this.entityManager.getComponent(entityId, 'physics'); // Get physics component

            // --- GUARD CLAUSES ---
            if (!spin || !transform) {
                 logger.warn(`SpinSystem: Missing spin or transform component for entity ${entityId} unexpectedly.`);
                 return; // Skip this entity
            }
            if (!Array.isArray(spin.speed) || spin.speed.length !== 3 || !spin.speed.every(s => typeof s === 'number' && isFinite(s))) {
                logger.warn(`SpinSystem: Invalid spin.speed data for entity ${entityId}:`, spin.speed);
                return; // Skip this entity
            }
            if (!Array.isArray(transform.rotation) || transform.rotation.length !== 3 || !transform.rotation.every(r => typeof r === 'number' && isFinite(r))) {
                 logger.warn(`SpinSystem: Invalid transform.rotation data for entity ${entityId}:`, transform.rotation);
                return; // Skip this entity
            }

            // --- MODIFICATION: Check Physics State ---
            // Only apply spin if there's NO physics component OR if the body type is 'dynamic'.
            // Static and Kinematic bodies should not be spun by this system.
            const canSpin = !physics || physics.bodyType === 'dynamic';

            if (!canSpin) {
                // logger.log(`[SpinSystem] Skipping spin for entity ${entityId} due to non-dynamic physics bodyType: ${physics?.bodyType}`); // Optional log
                return; // Skip applying spin to static/kinematic bodies
            }
            // --- END MODIFICATION ---


            // Calculate rotation change based on deltaTime
            const deltaRotationX = spin.speed[0] * time.deltaTime;
            const deltaRotationY = spin.speed[1] * time.deltaTime;
            const deltaRotationZ = spin.speed[2] * time.deltaTime;

            // Apply rotation change to current rotation
            const newRotation = [
                (transform.rotation[0] + deltaRotationX),
                (transform.rotation[1] + deltaRotationY),
                (transform.rotation[2] + deltaRotationZ)
                // Note: We might want to wrap angles later (e.g., to keep within 0-360)
            ];

            // Use engine's addComponent to update, ensuring events are fired
            // This will still emit 'entityUpdated' event, but now only for spinnable entities
            this.engine.addComponent(entityId, 'transform', {
                rotation: newRotation,
                source: 'spinSystem' // Identify the source of the update
            });
        });
    }

    /**
     * Cleans up system resources.
     */
    cleanup() {
        logger.log("Cleaning up SpinSystem...");
        this.entityManager = null;
        this.engine = null;
        logger.log("SpinSystem Cleaned Up.");
    }
}