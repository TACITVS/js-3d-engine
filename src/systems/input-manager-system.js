// src/systems/input-manager-system.js
// @version 1.0.1 - Uncommented debug logs in key handlers.
// @previous 1.0.0 - Initial implementation

/**
 * Manages raw input events and provides a queryable state for actions and axes.
 * This system listens directly to browser events and abstracts them for other systems.
 *
 * @class InputManagerSystem
 */
export class InputManagerSystem {
    constructor() {
        this.priority = 5; // Run very early
        this.active = true; // Always active to capture input
        this._name = 'inputManager';

        /** @private @type {Map<string, boolean>} Stores the current down/pressed state of keys/buttons */
        this.keyStates = new Map();
        /** @private @type {Set<string>} Stores keys/buttons pressed *this* frame */
        this.keysDownThisFrame = new Set();
        /** @private @type {Set<string>} Stores keys/buttons released *this* frame */
        this.keysUpThisFrame = new Set();

        // --- Mouse State ---
        /** @private @type {{x:number, y:number}} Current mouse position */
        this.mousePosition = { x: 0, y: 0 };
        /** @private @type {{x:number, y:number}} Movement delta since last frame */
        this.mouseDelta = { x: 0, y: 0 };
        /** @private @type {Map<number, boolean>} Mouse button down state */
        this.mouseButtons = new Map();

        // Bind event handlers
        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handleKeyUp = this._handleKeyUp.bind(this);
        this._handleMouseMove = this._handleMouseMove.bind(this);
        this._handleMouseDown = this._handleMouseDown.bind(this);
        this._handleMouseUp = this._handleMouseUp.bind(this);

        this._initialized = false;
    }

    /**
     * Initializes the system and attaches low-level event listeners.
     * @param {import('../ecs/entity-manager.js').EntityManager} entityManager - Unused
     * @param {import('../utils/event-emitter.js').EventEmitter} eventEmitter - Unused
     * @param {import('../core.js').Engine} engine - Unused (can use window directly for now)
     */
    async initialize(entityManager, eventEmitter, engine) {
        if (this._initialized) return;

        console.log("[InputManagerSystem] Initializing and attaching listeners...");
        // Use window for global input listening. Consider targeting engine container later if needed.
        window.addEventListener('keydown', this._handleKeyDown, { capture: true }); // Use capture to potentially intercept events
        window.addEventListener('keyup', this._handleKeyUp, { capture: true });
        window.addEventListener('mousemove', this._handleMouseMove);
        window.addEventListener('mousedown', this._handleMouseDown);
        window.addEventListener('mouseup', this._handleMouseUp);

        this._initialized = true;
        console.log("[InputManagerSystem] Initialized.");
    }

    /** @private Handles raw keydown events */
    _handleKeyDown(event) {
        const key = event.key.toLowerCase(); // Normalize key identifier
        const code = event.code.toLowerCase(); // Use code for layout independence if needed

        // Prevent registering repeat events for held keys
        if (!this.keyStates.get(key)) {
            this.keysDownThisFrame.add(key);
            // --- MODIFICATION: Uncommented Debug Log ---
            console.log(`[InputManager] KeyDown Registered: ${key} (Code: ${code})`);
            // --- END MODIFICATION ---
        }
        this.keyStates.set(key, true);

        // Optional: Prevent default browser behavior for certain keys (e.g., spacebar scrolling)
        // Example for arrow keys and WASD
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
             event.preventDefault();
        }
    }

    /** @private Handles raw keyup events */
    _handleKeyUp(event) {
        const key = event.key.toLowerCase();
        const code = event.code.toLowerCase();

        if (this.keyStates.get(key)) {
            this.keysUpThisFrame.add(key);
            // --- MODIFICATION: Uncommented Debug Log ---
             console.log(`[InputManager] KeyUp Registered: ${key} (Code: ${code})`);
            // --- END MODIFICATION ---
        }
        this.keyStates.set(key, false);
    }

    // --- Mouse Handlers ---
    /** @private */
    _handleMouseMove(event) {
        const newX = event.clientX;
        const newY = event.clientY;
        this.mouseDelta.x += newX - this.mousePosition.x;
        this.mouseDelta.y += newY - this.mousePosition.y;
        this.mousePosition.x = newX;
        this.mousePosition.y = newY;
    }

    /** @private */
    _handleMouseDown(event) {
        const button = event.button;
        if (!this.mouseButtons.get(button)) {
            this.keysDownThisFrame.add(`mouse${button}`);
        }
        this.mouseButtons.set(button, true);
    }

    /** @private */
    _handleMouseUp(event) {
        const button = event.button;
        if (this.mouseButtons.get(button)) {
            this.keysUpThisFrame.add(`mouse${button}`);
        }
        this.mouseButtons.set(button, false);
    }

    /**
     * Clears the per-frame state (keys pressed/released this frame).
     * Should be called at the beginning or end of the engine update loop.
     * Running at the end means checks reflect state *during* the current frame.
     */
    postUpdate(time) { // Using postUpdate ensures checks reflect the frame just processed
        this.keysDownThisFrame.clear();
        this.keysUpThisFrame.clear();
        this.mouseDelta = { x: 0, y: 0 }; // Reset mouse delta
    }

    // --- Public Query Methods ---

    /**
     * Checks if a specific key is currently held down.
     * @param {string} keyIdentifier - The key identifier (e.g., 'a', 'arrowleft', ' ', 'shift'). Case-insensitive.
     * @returns {boolean} True if the key is currently pressed.
     */
    isKeyDown(keyIdentifier) {
        return this.keyStates.get(keyIdentifier.toLowerCase()) ?? false;
    }

    /**
     * Checks if a specific key was pressed down during the current frame.
     * @param {string} keyIdentifier - The key identifier. Case-insensitive.
     * @returns {boolean} True if the key was pressed down this frame.
     */
    wasKeyPressed(keyIdentifier) {
        return this.keysDownThisFrame.has(keyIdentifier.toLowerCase());
    }

    /**
     * Checks if a specific key was released during the current frame.
     * @param {string} keyIdentifier - The key identifier. Case-insensitive.
     * @returns {boolean} True if the key was released this frame.
     */
    wasKeyReleased(keyIdentifier) {
        return this.keysUpThisFrame.has(keyIdentifier.toLowerCase());
    }

    /** Returns current mouse position. */
    getMousePosition() {
        return { x: this.mousePosition.x, y: this.mousePosition.y };
    }

    /** Returns accumulated mouse movement since last frame. */
    getMouseDelta() {
        return { x: this.mouseDelta.x, y: this.mouseDelta.y };
    }

    /** Checks if a mouse button is currently held down. */
    isMouseButtonDown(buttonIndex) {
        return this.mouseButtons.get(buttonIndex) ?? false;
    }

    /** Checks if a mouse button was pressed during this frame. */
    wasMouseButtonPressed(buttonIndex) {
        return this.keysDownThisFrame.has(`mouse${buttonIndex}`);
    }

    /** Checks if a mouse button was released during this frame. */
    wasMouseButtonReleased(buttonIndex) {
        return this.keysUpThisFrame.has(`mouse${buttonIndex}`);
    }

    // --- TODO: Add methods for actions (mapping keys to actions) ---
    // isActionPressed(actionName) { /* Map actionName to key(s) and check isKeyDown */ }
    // wasActionJustPressed(actionName) { /* Map actionName to key(s) and check wasKeyPressed */ }
    // getAxisValue(axisName) { /* Map axisName to keys (e.g., WASD) and return value (-1, 0, 1) */ }

    /**
     * Cleans up event listeners.
     */
    cleanup() {
        if (!this._initialized) return;
        console.log("[InputManagerSystem] Cleaning up listeners...");
        window.removeEventListener('keydown', this._handleKeyDown, { capture: true });
        window.removeEventListener('keyup', this._handleKeyUp, { capture: true });
        window.removeEventListener('mousemove', this._handleMouseMove);
        window.removeEventListener('mousedown', this._handleMouseDown);
        window.removeEventListener('mouseup', this._handleMouseUp);
        this.keyStates.clear();
        this.keysDownThisFrame.clear();
        this.keysUpThisFrame.clear();
        this._initialized = false;
        console.log("[InputManagerSystem] Cleaned Up.");
    }
}