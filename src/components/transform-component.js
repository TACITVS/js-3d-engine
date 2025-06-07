// src/components/transform-component.js
// @version 1.1.0 - Added parent/children for hierarchy

import { Component } from '../ecs/component.js';

export class TransformComponent extends Component {
    constructor(data = {}) {
        super();
        this.position = data.position ? [...data.position] : [0, 0, 0];
        this.rotation = data.rotation ? [...data.rotation] : [0, 0, 0]; // Assuming Euler angles (XYZ order)
        this.scale = data.scale ? [...data.scale] : [1, 1, 1];

        // --- Hierarchy Properties ---
        /** @type {number | null} The entity ID of the parent. Null if root. */
        this.parent = data.parent !== undefined ? data.parent : null;
        /** @type {Set<number>} A set of entity IDs of the direct children. Managed by EntityManager. */
        this.children = new Set(data.children || []); // Store as a Set for efficient add/delete

        // Note: World matrix calculation will need to consider the parent transform.
        // This is typically handled by a dedicated TransformSystem or within the RenderSystem.
        // For now, we just store the relationship.
    }

    // --- Position ---
    setPosition(x, y, z) { if (Array.isArray(x)) { this.position = x.slice(0, 3); } else if (x !== undefined && y !== undefined && z !== undefined) { this.position = [x, y, z]; } return this; }
    getPosition() { return [...this.position]; }

    // --- Rotation ---
    setRotation(x, y, z) { if (Array.isArray(x)) { this.rotation = x.slice(0, 3); } else if (x !== undefined && y !== undefined && z !== undefined) { this.rotation = [x, y, z]; } return this; }
    getRotation() { return [...this.rotation]; }

    // --- Scale ---
    setScale(x, y, z) { if (Array.isArray(x)) { this.scale = x.slice(0, 3); } else if (x !== undefined && y === undefined && z === undefined) { this.scale = [x, x, x]; } else if (x !== undefined && y !== undefined && z !== undefined) { this.scale = [x, y, z]; } return this; }
    getScale() { return [...this.scale]; }

    // --- Hierarchy Getters/Setters (Managed Primarily by EntityManager) ---
    getParent() { return this.parent; }

    // Internal method, prefer using EntityManager.setParent
    _setParent(parentId) { // <<< METHOD DEFINITION IS HERE <<<
        this.parent = parentId;
    }

    getChildren() { return new Set(this.children); } // Return a copy
    // Internal method, prefer using EntityManager helpers
    _addChild(childId) { this.children.add(childId); }
    // Internal method, prefer using EntityManager helpers
    _removeChild(childId) { this.children.delete(childId); }

    // --- Serialization ---
    serialize() {
        return {
            position: [...this.position],
            rotation: [...this.rotation],
            scale: [...this.scale],
            parent: this.parent // Serialize parent relationship
        };
    }

    onRemove() { this.parent = null; this.children.clear(); }
}