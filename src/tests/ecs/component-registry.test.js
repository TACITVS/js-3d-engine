// src/tests/ecs/component-registry.test.js
// Unit tests for the ComponentRegistry class (Browser/Mocha/Chai)

// Imports relative to the test-runner.html location
import { ComponentRegistry } from '../../ecs/component-registry.js';
import { Component } from '../../ecs/component.js';

// Use globally exposed 'describe', 'it', 'expect', 'beforeEach' from Mocha/Chai
// loaded in test-runner.html

// --- Mock Components ---
class MockComponent extends Component {
    constructor(data = {}) { super(); this.value = data.value || 0; }
    serialize() { return { value: this.value }; }
}
class AnotherMockComponent extends Component {
    constructor(data = {}) { super(); this.name = data.name || 'default'; }
    serialize() { return { name: this.name }; }
}
function NotAClass() {}

// --- Test Suite ---
describe('ComponentRegistry (Browser)', () => {
    /** @type {ComponentRegistry} */
    let registry;

    beforeEach(() => {
        registry = new ComponentRegistry();
    });

    it('should initialize with an empty map', () => {
        expect(registry.componentTypes).to.be.instanceOf(Map);
        expect(registry.componentTypes.size).to.equal(0);
        expect(registry.getComponentTypeNames()).to.deep.equal([]);
    });

    it('should register a valid component constructor', () => {
        registry.register('mock', MockComponent);
        expect(registry.has('mock')).to.be.true;
        expect(registry.get('mock')).to.equal(MockComponent);
        expect(registry.getComponentTypeNames()).to.deep.equal(['mock']);
    });

    it('should allow registering multiple components', () => {
        registry.register('mock1', MockComponent);
        registry.register('mock2', AnotherMockComponent);
        expect(registry.has('mock1')).to.be.true;
        expect(registry.has('mock2')).to.be.true;
        expect(registry.get('mock1')).to.equal(MockComponent);
        expect(registry.get('mock2')).to.equal(AnotherMockComponent);
        expect(registry.getComponentTypeNames()).to.have.lengthOf(2);
        expect(registry.getComponentTypeNames()).to.include('mock1');
        expect(registry.getComponentTypeNames()).to.include('mock2');
    });

    it('should overwrite an existing registration with a warning (check console)', () => {
        registry.register('mock', MockComponent);
        expect(registry.get('mock')).to.equal(MockComponent);
        registry.register('mock', AnotherMockComponent); // Overwrite
        expect(registry.has('mock')).to.be.true;
        expect(registry.get('mock')).to.equal(AnotherMockComponent);
        expect(registry.getComponentTypeNames()).to.deep.equal(['mock']);
    });

    it('should unregister a component type', () => {
        registry.register('mock', MockComponent);
        expect(registry.has('mock')).to.be.true;
        const result = registry.unregister('mock');
        expect(result).to.equal(registry);
        expect(registry.has('mock')).to.be.false;
        expect(registry.get('mock')).to.be.undefined;
        expect(registry.getComponentTypeNames()).to.deep.equal([]);
    });

    it('should do nothing when unregistering a non-existent type', () => {
        registry.register('mock1', MockComponent);
        const result = registry.unregister('nonExistent');
        expect(result).to.equal(registry);
        expect(registry.has('mock1')).to.be.true;
        expect(registry.getComponentTypeNames()).to.deep.equal(['mock1']);
    });

    it('should return undefined when getting a non-existent type', () => {
        expect(registry.get('nonExistent')).to.be.undefined;
    });

    it('should return false when checking for a non-existent type', () => {
        expect(registry.has('nonExistent')).to.be.false;
    });

    it('should not register non-function constructors', () => {
        registry.register('invalidValue', null);
        registry.register('invalidValue2', {});
        expect(registry.has('invalidValue')).to.be.false;
        expect(registry.has('invalidValue2')).to.be.false;
        expect(registry.getComponentTypeNames()).to.deep.equal([]);
    });

     it('should register plain functions but might warn (check console)', () => {
         registry.register('notAClass', NotAClass);
         expect(registry.has('notAClass')).to.be.true;
         expect(registry.get('notAClass')).to.equal(NotAClass);
     });

});