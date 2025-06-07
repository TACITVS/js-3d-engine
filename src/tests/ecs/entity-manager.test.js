// src/tests/ecs/entity-manager.test.js
// Unit tests for the EntityManager class (Browser/Mocha/Chai)

// Imports relative to the test-runner.html location
import '../../../test/setup.js';
import { ComponentRegistry } from '../../ecs/component-registry.js';
import { EntityManager } from '../../ecs/entity-manager.js';
import { EventEmitter } from '../../utils/event-emitter.js';
import { Component } from '../../ecs/component.js';

// Use globally exposed 'describe', 'it', 'expect', 'beforeEach' from Mocha/Chai
// loaded in test-runner.html

// --- Mock Components ---
class PositionComponent extends Component {
    constructor(data = {}) { super(); this.x = data.x ?? 0; this.y = data.y ?? 0; }
    serialize() { return { x: this.x, y: this.y }; }
}
class VelocityComponent extends Component {
    constructor(data = {}) { super(); this.vx = data.vx ?? 0; this.vy = data.vy ?? 0; }
    serialize() { return { vx: this.vx, vy: this.vy }; }
}
class TagComponent extends Component {
    constructor(data = {}) { super(); this.tags = new Set(data.tags || []); }
    serialize() { return { tags: Array.from(this.tags) }; }
}

// --- Test Suite ---
describe('EntityManager (Browser)', () => {
    /** @type {ComponentRegistry} */
    let registry;
    /** @type {EventEmitter} */
    let emitter;
    /** @type {EntityManager} */
    let entityManager;

    // Setup before each test
    beforeEach(() => {
        registry = new ComponentRegistry();
        emitter = new EventEmitter(); // Need a real emitter for deserialize event
        entityManager = new EntityManager(registry, emitter);

        // Register mock components
        registry.register('position', PositionComponent);
        registry.register('velocity', VelocityComponent);
        registry.register('tag', TagComponent);
    });

    // -- Entity Management ---
    it('should create entities with unique IDs', () => {
        const id1 = entityManager.createEntity();
        const id2 = entityManager.createEntity();
        const id3 = entityManager.createEntity();
        expect(id1).to.be.a('number');
        expect(id2).to.be.a('number').and.not.equal(id1);
        expect(id3).to.be.a('number').and.not.equal(id2);
        expect(entityManager.entities.size).to.equal(3);
        expect(entityManager.hasEntity(id1)).to.be.true;
    });

    it('should remove an entity and its components', () => {
        const id = entityManager.createEntity();
        entityManager.addComponent(id, 'position', { x: 10 });
        entityManager.addComponent(id, 'velocity', { vx: 1 });
        expect(entityManager.hasEntity(id)).to.be.true;
        expect(entityManager.hasComponent(id, 'position')).to.be.true;
        expect(entityManager.getEntitiesWithComponent('position')).to.include(id);

        const removed = entityManager.removeEntity(id);
        expect(removed).to.be.true;
        expect(entityManager.hasEntity(id)).to.be.false;
        expect(entityManager.hasComponent(id, 'position')).to.be.false;
        expect(entityManager.getComponent(id, 'position')).to.be.null;
        expect(entityManager.entityComponents.has(id)).to.be.false; // Internal check
        expect(entityManager.getEntitiesWithComponent('position')).to.not.include(id);
        expect(entityManager.getEntitiesWithComponent('velocity')).to.not.include(id);
    });

     it('should return false when removing a non-existent entity', () => {
        const removed = entityManager.removeEntity(999);
        expect(removed).to.be.false;
    });

    // -- Component Management ---
    it('should add a new component to an entity', () => {
        const id = entityManager.createEntity();
        const posComp = entityManager.addComponent(id, 'position', { x: 5, y: -5 });

        expect(posComp).to.be.instanceOf(PositionComponent);
        expect(posComp.x).to.equal(5);
        expect(posComp.y).to.equal(-5);
        expect(entityManager.hasComponent(id, 'position')).to.be.true;
        expect(entityManager.getComponent(id, 'position')).to.equal(posComp);
        expect(entityManager.getEntitiesWithComponent('position')).to.deep.equal([id]);
    });

    it('should update an existing component instance when adding with same type', () => {
        const id = entityManager.createEntity();
        const comp1 = entityManager.addComponent(id, 'position', { x: 1 });
        expect(comp1.x).to.equal(1);

        const comp2 = entityManager.addComponent(id, 'position', { x: 100, y: 50 });
        expect(comp2).to.equal(comp1); // Should return the same instance
        expect(comp1.x).to.equal(100); // Value should be updated
        expect(comp1.y).to.equal(50); // New property added
        expect(entityManager.getComponent(id, 'position').x).to.equal(100);
        expect(entityManager.entityComponents.get(id)?.size).to.equal(1); // Still only one component
        expect(entityManager.getEntitiesWithComponent('position')).to.deep.equal([id]); // Still only one entity listed
    });

    it('should return null when adding component to non-existent entity', () => {
        const comp = entityManager.addComponent(999, 'position', { x: 1 });
        expect(comp).to.be.null;
    });

    it('should return null when adding an unregistered component type', () => {
        const id = entityManager.createEntity();
        const comp = entityManager.addComponent(id, 'unregisteredType', { x: 1 });
        expect(comp).to.be.null;
        expect(entityManager.hasComponent(id, 'unregisteredType')).to.be.false;
    });

    it('should remove a component from an entity', () => {
        const id = entityManager.createEntity();
        entityManager.addComponent(id, 'position', { x: 1 });
        entityManager.addComponent(id, 'velocity', { vx: 1 });
        expect(entityManager.hasComponent(id, 'position')).to.be.true;
        expect(entityManager.getEntitiesWithComponent('position')).to.include(id);

        const removed = entityManager.removeComponent(id, 'position');
        expect(removed).to.be.true;
        expect(entityManager.hasComponent(id, 'position')).to.be.false;
        expect(entityManager.getComponent(id, 'position')).to.be.null;
        expect(entityManager.getEntitiesWithComponent('position')).to.not.include(id);
        expect(entityManager.hasComponent(id, 'velocity')).to.be.true; // Other component remains
    });

    it('should return false when removing non-existent component', () => {
        const id = entityManager.createEntity();
        const removed = entityManager.removeComponent(id, 'nonExistent');
        expect(removed).to.be.false;
    });

    it('should return false when removing component from non-existent entity', () => {
        const removed = entityManager.removeComponent(999, 'position');
        expect(removed).to.be.false;
    });

    it('should get all components for an entity', () => {
         const id = entityManager.createEntity();
         const pos = entityManager.addComponent(id, 'position');
         const vel = entityManager.addComponent(id, 'velocity');
         const tag = entityManager.addComponent(id, 'tag');

         const components = entityManager.getComponents(id);
         expect(components).to.be.an('array').with.lengthOf(3);
         expect(components).to.include(pos);
         expect(components).to.include(vel);
         expect(components).to.include(tag);
    });

     it('should return empty array when getting components for non-existent entity', () => {
         expect(entityManager.getComponents(999)).to.deep.equal([]);
     });

    // -- Querying ---
    it('should get entities with a single component', () => {
        const id1 = entityManager.createEntity(); entityManager.addComponent(id1, 'position');
        const id2 = entityManager.createEntity(); entityManager.addComponent(id2, 'velocity');
        const id3 = entityManager.createEntity(); entityManager.addComponent(id3, 'position'); entityManager.addComponent(id3, 'velocity');

        expect(entityManager.getEntitiesWithComponent('position')).to.have.members([id1, id3]);
        expect(entityManager.getEntitiesWithComponent('velocity')).to.have.members([id2, id3]);
        expect(entityManager.getEntitiesWithComponent('tag')).to.deep.equal([]);
    });

     it('should get entities with multiple components', () => {
        const id1 = entityManager.createEntity(); entityManager.addComponent(id1, 'position');
        const id2 = entityManager.createEntity(); entityManager.addComponent(id2, 'velocity');
        const id3 = entityManager.createEntity(); entityManager.addComponent(id3, 'position'); entityManager.addComponent(id3, 'velocity');
        const id4 = entityManager.createEntity(); entityManager.addComponent(id4, 'position'); entityManager.addComponent(id4, 'tag');

        expect(entityManager.getEntitiesWithComponents(['position', 'velocity'])).to.deep.equal([id3]);
        expect(entityManager.getEntitiesWithComponents(['position'])).to.have.members([id1, id3, id4]);
        expect(entityManager.getEntitiesWithComponents(['tag', 'position'])).to.deep.equal([id4]);
        expect(entityManager.getEntitiesWithComponents(['velocity', 'tag'])).to.deep.equal([]);
        expect(entityManager.getEntitiesWithComponents([])).to.have.members([id1, id2, id3, id4]); // Empty array returns all
        expect(entityManager.getEntitiesWithComponents(['nonExistent'])).to.deep.equal([]);
    });

    // -- Serialization / Deserialization (Basic Tests) ---
    it('should serialize the scene state', () => {
        const id1 = entityManager.createEntity();
        entityManager.addComponent(id1, 'position', { x: 1, y: 2 });
        entityManager.addComponent(id1, 'tag', { tags: ['player'] });
        const id2 = entityManager.createEntity();
        entityManager.addComponent(id2, 'velocity', { vx: 10 });

        const jsonString = entityManager.serialize(false); // No pretty print
        const sceneData = JSON.parse(jsonString);

        expect(sceneData).to.be.an('object');
        expect(sceneData.entities).to.be.an('array').with.lengthOf(2);
        const entity1Data = sceneData.entities.find(e => e.id === id1);
        const entity2Data = sceneData.entities.find(e => e.id === id2);
        expect(entity1Data).to.exist;
        expect(entity1Data.components).to.have.all.keys('position', 'tag');
        expect(entity1Data.components.position).to.deep.equal({ x: 1, y: 2 });
        expect(entity1Data.components.tag).to.deep.equal({ tags: ['player'] });
        expect(entity2Data).to.exist;
        expect(entity2Data.components).to.have.all.keys('velocity');
        expect(entity2Data.components.velocity).to.deep.equal({ vx: 10, vy: 0 });
    });

    it('should deserialize the scene state', () => {
        const sceneData = {
            entities: [
                { id: 5, components: { position: { x: 10, y: 20 } } },
                { id: 6, components: { velocity: { vx: -1 }, position: {x: 1, y: 1} } }
            ]
        };
        let sceneImportedCalled = false;
        emitter.on('sceneImported', () => { sceneImportedCalled = true; });
        const success = entityManager.deserialize(sceneData);
        expect(success).to.be.true;
        expect(entityManager.entities.size).to.equal(2);
        expect(entityManager.hasEntity(5)).to.be.true;
        expect(entityManager.hasEntity(6)).to.be.true;
        expect(entityManager.hasComponent(5, 'position')).to.be.true;
        expect(entityManager.getComponent(5, 'position').x).to.equal(10);
        expect(entityManager.hasComponent(5, 'velocity')).to.be.false;
        expect(entityManager.hasComponent(6, 'position')).to.be.true;
        expect(entityManager.hasComponent(6, 'velocity')).to.be.true;
        expect(entityManager.getComponent(6, 'velocity').vx).to.equal(-1);
        expect(entityManager.nextEntityId).to.equal(7);
        expect(sceneImportedCalled).to.be.true;
    });

     it('should clear all entities', () => {
        entityManager.createEntity();
        entityManager.createEntity();
        entityManager.addComponent(1, 'position');
        expect(entityManager.entities.size).to.equal(2);
        expect(entityManager.getEntitiesWithComponent('position')).to.have.lengthOf(1);
        entityManager.clear();
        expect(entityManager.entities.size).to.equal(0);
        expect(entityManager.entityComponents.size).to.equal(0);
        expect(entityManager.componentEntityMap.size).to.equal(0);
        expect(entityManager.nextEntityId).to.equal(1);
    });
});