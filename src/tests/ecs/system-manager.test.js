// src/tests/ecs/system-manager.test.js
// Unit tests for the SystemManager class (Browser/Mocha/Chai)

// Imports relative to test-runner.html
import '../../../test/setup.js';
import { SystemManager } from '../../ecs/system-manager.js';
import { EntityManager } from '../../ecs/entity-manager.js';
import { ComponentRegistry } from '../../ecs/component-registry.js';
import { EventEmitter } from '../../utils/event-emitter.js';

// Use globally exposed 'describe', 'it', 'expect', 'beforeEach', 'afterEach'
// Also using async/await for system registration tests

// --- Mock Engine (Partial) ---
const createMockEngine = (entityManager, eventEmitter) => {
    return {
        entityManager: entityManager,
        eventEmitter: eventEmitter,
        getSystem: (name) => systemManager?.get(name), // Allow systems to get other systems
    };
};

// --- Mock Systems ---
class MockSystemA {
    constructor() { this.priority = 10; this.initialized = false; this.updated = false; this.cleaned = false; this.name = 'A'; }
    async initialize(em, emitter, engine) { this.initialized = true; }
    update(time) { this.updated = true; this.lastTime = time; }
    cleanup() { this.cleaned = true; }
}
class MockSystemB {
    constructor() { this.priority = 5; this.initialized = false; this.updated = false; this.name = 'B'; } // Lower priority
    async initialize(em, emitter, engine) { this.initialized = true; }
    update(time) { this.updated = true; this.lastTime = time; }
}
class MockSystemC {
    constructor() { this.priority = 10; this.initialized = false; this.updated = false; this.active = false; this.name = 'C'; } // Initially inactive
    async initialize(em, emitter, engine) { this.initialized = true; }
    update(time) { this.updated = true; } // Should not run if inactive
}
class FailingInitSystem {
    constructor() { this.priority = 1; }
    async initialize(em, emitter, engine) { throw new Error("Initialization Failed"); }
    update(time) { /* should not run */ }
}
class FailingUpdateSystem {
    constructor() { this.priority = 1; }
    async initialize(em, emitter, engine) {}
    update(time) { throw new Error("Update Failed"); }
}

// --- Global systemManager for mockEngine access ---
let systemManager;

// --- Test Suite ---
describe('SystemManager (Browser)', () => {
    /** @type {EntityManager} */
    let entityManager;
    /** @type {EventEmitter} */
    let eventEmitter;
    /** @type {object} */
    let mockEngine;

    beforeEach(() => {
        const registry = new ComponentRegistry();
        eventEmitter = new EventEmitter();
        entityManager = new EntityManager(registry, eventEmitter);
        mockEngine = createMockEngine(entityManager, eventEmitter);
        // Assign to global for mockEngine access
        systemManager = new SystemManager(entityManager, eventEmitter, mockEngine);
        mockEngine.systemManager = systemManager; // Add back-reference if needed
    });

    afterEach(() => {
        systemManager = null; // Clean up global ref
    });

    it('should initialize correctly', () => {
        expect(systemManager.systems).to.be.instanceOf(Map);
        expect(systemManager.systems.size).to.equal(0);
        expect(systemManager.executionOrder).to.be.an('array').with.lengthOf(0);
    });

    it('should register and initialize a system', async () => {
        const systemA = new MockSystemA();
        await systemManager.register('sysA', systemA);

        expect(systemManager.systems.has('sysA')).to.be.true;
        expect(systemManager.get('sysA')).to.equal(systemA);
        expect(systemManager.systemStates.get('sysA')?.isInitialized).to.be.true;
        expect(systemA.initialized).to.be.true;
        expect(systemManager.executionOrder).to.deep.equal(['sysA']);
    });

    it('should register multiple systems and sort by priority', async () => {
        const systemA = new MockSystemA(); // priority 10
        const systemB = new MockSystemB(); // priority 5
        await systemManager.register('sysA', systemA);
        await systemManager.register('sysB', systemB);

        expect(systemManager.systems.size).to.equal(2);
        expect(systemManager.executionOrder).to.deep.equal(['sysB', 'sysA']); // B should run before A
    });

    it('should handle system initialization failure', async () => {
        const failingSystem = new FailingInitSystem();
        try {
            await systemManager.register('failInit', failingSystem);
            expect.fail("Registration should have thrown an error");
        } catch (error) {
            expect(error).to.be.instanceOf(Error);
            expect(error.message).to.equal("Initialization Failed");
            expect(systemManager.systems.has('failInit')).to.be.false;
            expect(systemManager.systemStates.has('failInit')).to.be.false;
            expect(systemManager.executionOrder).to.deep.equal([]);
        }
    });

    it('should unregister a system and call its cleanup', async () => {
        const systemA = new MockSystemA();
        await systemManager.register('sysA', systemA);
        expect(systemManager.systems.has('sysA')).to.be.true;

        systemManager.unregister('sysA');

        expect(systemManager.systems.has('sysA')).to.be.false;
        expect(systemManager.systemStates.has('sysA')).to.be.false;
        expect(systemManager.executionOrder).to.deep.equal([]);
        expect(systemA.cleaned).to.be.true;
    });

    it('should update active and initialized systems in order', async () => {
        const systemA = new MockSystemA(); // prio 10
        const systemB = new MockSystemB(); // prio 5
        const systemC = new MockSystemC(); // prio 10, inactive
        await systemManager.register('sysA', systemA);
        await systemManager.register('sysB', systemB);
        await systemManager.register('sysC', systemC); // Registered but inactive

        // Execution order depends on stable sort, might be B, A, C or B, C, A
        expect(systemManager.executionOrder).to.include('sysB').and.to.include('sysA').and.to.include('sysC');
        expect(systemManager.executionOrder.indexOf('sysB')).to.be.lessThan(systemManager.executionOrder.indexOf('sysA'));


        const time = { deltaTime: 0.1, elapsed: 1.0, gameTimeScale: 1, lastFrameTime: 0 };
        systemManager.update(time);

        expect(systemB.updated).to.be.true;
        expect(systemA.updated).to.be.true;
        expect(systemC.updated).to.be.false; // C should not update
        expect(systemB.lastTime).to.equal(time);
        expect(systemA.lastTime).to.equal(time);
    });

     it('should allow changing system active state', async () => {
        const systemA = new MockSystemA();
        const systemC = new MockSystemC(); // Initially inactive
        await systemManager.register('sysA', systemA);
        await systemManager.register('sysC', systemC);

        const time = { deltaTime: 0.1, elapsed: 1.0, gameTimeScale: 1, lastFrameTime: 0 };
        systemManager.update(time);
        expect(systemA.updated).to.be.true;
        expect(systemC.updated).to.be.false; // C inactive

        systemA.updated = false; // Reset flag
        systemManager.setSystemActive('sysC', true); // Activate C
        expect(systemManager.isSystemActive('sysC')).to.be.true;

        systemManager.update(time);
        expect(systemA.updated).to.be.true;
        expect(systemC.updated).to.be.true; // C should now update

        systemA.updated = false; systemC.updated = false; // Reset flags
        systemManager.setSystemActive('sysA', false); // Deactivate A
         expect(systemManager.isSystemActive('sysA')).to.be.false;

        systemManager.update(time);
        expect(systemA.updated).to.be.false; // A inactive
        expect(systemC.updated).to.be.true; // C still active
     });

     it('should throw error from update loop if system update fails', async () => {
         const systemA = new MockSystemA();
         const failingSystem = new FailingUpdateSystem(); // Priority 1
         await systemManager.register('sysA', systemA); // Priority 10
         await systemManager.register('failUpdate', failingSystem);

         expect(systemManager.executionOrder[0]).to.equal('failUpdate'); // Ensure fail runs first

         const time = { deltaTime: 0.1, elapsed: 1.0, gameTimeScale: 1, lastFrameTime: 0 };

         expect(() => systemManager.update(time)).to.throw("Update Failed");
         expect(systemA.updated).to.be.false; // sysA shouldn't run
     });

     it('should allow changing system priority', async () => {
         const systemA = new MockSystemA(); // prio 10
         const systemB = new MockSystemB(); // prio 5
         await systemManager.register('sysA', systemA);
         await systemManager.register('sysB', systemB);
         expect(systemManager.executionOrder).to.deep.equal(['sysB', 'sysA']);

         systemManager.setPriority('sysB', 20); // Make B run after A
         expect(systemManager.executionOrder).to.deep.equal(['sysA', 'sysB']);
     });

     it('should cleanup all systems', async () => {
        const systemA = new MockSystemA();
        const systemB = new MockSystemB(); // Doesn't have cleanup
        await systemManager.register('sysA', systemA);
        await systemManager.register('sysB', systemB);

        systemManager.cleanupAll();

        expect(systemManager.systems.size).to.equal(0);
        expect(systemManager.systemStates.size).to.equal(0);
        expect(systemManager.executionOrder).to.deep.equal([]);
        expect(systemA.cleaned).to.be.true;
     });

});