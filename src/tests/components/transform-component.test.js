// src/tests/components/transform-component.test.js
// Unit tests for the TransformComponent class (Browser/Mocha/Chai)

// Imports relative to test-runner.html
import '../../../test/setup.js';
import { TransformComponent } from '../../components/transform-component.js';
import { Component } from '../../ecs/component.js';

// Use globally exposed 'describe', 'it', 'expect', 'beforeEach'
const { expect } = window;

// --- Test Suite ---
describe('TransformComponent (Browser)', () => {
    /** @type {TransformComponent} */
    let transform;

    beforeEach(() => {
        // Create with default values
        transform = new TransformComponent();
    });

    it('should initialize with default values', () => {
        expect(transform).to.be.instanceOf(Component);
        expect(transform).to.be.instanceOf(TransformComponent);
        expect(transform.position).to.deep.equal([0, 0, 0]);
        expect(transform.rotation).to.deep.equal([0, 0, 0]); // Euler angles
        expect(transform.scale).to.deep.equal([1, 1, 1]);
        expect(transform.parent).to.be.null;
        expect(transform.children).to.be.instanceOf(Set);
        expect(transform.children.size).to.equal(0);
    });

    it('should initialize with provided data', () => {
        const data = {
            position: [1, 2, 3],
            rotation: [10, 20, 30],
            scale: [2, 0.5, 1],
            // Note: parent/children are not directly settable via constructor data
        };
        transform = new TransformComponent(data);
        expect(transform.position).to.deep.equal([1, 2, 3]);
        expect(transform.rotation).to.deep.equal([10, 20, 30]);
        expect(transform.scale).to.deep.equal([2, 0.5, 1]);
        expect(transform.parent).to.be.null;
        expect(transform.children.size).to.equal(0);
    });

    // --- Getters ---
    it('should get position', () => {
        transform.position = [5, 6, 7];
        expect(transform.getPosition()).to.deep.equal([5, 6, 7]);
    });

    it('should get rotation', () => {
        transform.rotation = [45, 90, -45];
        expect(transform.getRotation()).to.deep.equal([45, 90, -45]);
    });

    it('should get scale', () => {
        transform.scale = [1, 2, 3];
        expect(transform.getScale()).to.deep.equal([1, 2, 3]);
    });

    // --- Setters (Internal/Protected - Tested indirectly via EntityManager usually) ---
    // Test internal methods carefully or rely on EntityManager tests for hierarchy
    it('should add a child ID using internal _addChild', () => {
        transform._addChild(10);
        expect(transform.children.has(10)).to.be.true;
        expect(transform.children.size).to.equal(1);
        transform._addChild(10); // Adding same child should have no effect
        expect(transform.children.size).to.equal(1);
        transform._addChild(20);
        expect(transform.children.has(20)).to.be.true;
        expect(transform.children.size).to.equal(2);
    });

    it('should remove a child ID using internal _removeChild', () => {
        transform._addChild(10);
        transform._addChild(20);
        expect(transform.children.size).to.equal(2);

        transform._removeChild(10);
        expect(transform.children.has(10)).to.be.false;
        expect(transform.children.size).to.equal(1);
        transform._removeChild(30); // Removing non-existent child should have no effect
        expect(transform.children.size).to.equal(1);
        transform._removeChild(20);
        expect(transform.children.has(20)).to.be.false;
        expect(transform.children.size).to.equal(0);
    });

     it('should set parent ID using internal _setParent', () => {
         expect(transform.parent).to.be.null;
         transform._setParent(5);
         expect(transform.parent).to.equal(5);
         transform._setParent(null);
         expect(transform.parent).to.be.null;
     });

    // --- Serialization ---
    it('should serialize its state correctly', () => {
        transform.position = [1, 2, 3];
        transform.rotation = [10, 0, -10];
        transform.scale = [1, 1, 5];
        transform._setParent(100); // Set parent internally
        transform._addChild(200); // Add child internally

        const serialized = transform.serialize();

        // Check serialized properties
        expect(serialized).to.deep.equal({
            position: [1, 2, 3],
            rotation: [10, 0, -10],
            scale: [1, 1, 5],
            parent: 100, // Parent ID should be serialized
            // children set is NOT serialized directly by TransformComponent's serialize
        });

        // Ensure original component is unchanged
        expect(transform.position).to.deep.equal([1, 2, 3]);
        expect(transform.parent).to.equal(100);
        expect(transform.children.has(200)).to.be.true;
    });

    it('should serialize default state correctly', () => {
        const serialized = transform.serialize();
        expect(serialized).to.deep.equal({
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            parent: null,
        });
    });

});