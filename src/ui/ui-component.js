import * as logger from '../utils/logger.js';
// src/ui/ui-component.js
// @version 1.1.0 - Added documentation comments guiding towards engine/event-based interaction

/**
 * Abstract base class for all Editor UI panel components (e.g., Toolbar, Inspector).
 * Provides common structure for initialization and destruction within the DOM.
 *
 * Subclasses are responsible for creating their specific DOM structure (`_createElement`)
 * and setting up necessary event listeners (`_setupEventListeners`).
 *
 * @class UIComponent
 */
export class UIComponent {
    /**
     * Creates an instance of UIComponent.
     * @param {import('../core.js').Engine} editor - A reference to the main Engine (or Editor) instance.
     * Used to access engine subsystems like EntityManager, EventEmitter, CommandManager.
     * @throws {Error} If an editor instance is not provided.
     */
    constructor(editor) {
        if (!editor) throw new Error('UIComponent requires an editor instance.');

        /**
         * Reference to the main Engine instance.
         * Provides access to engine subsystems. Subclasses should use this
         * to interact with the engine state (e.g., get component data, execute commands)
         * rather than manipulating renderer or physics objects directly.
         * @type {import('../core.js').Engine}
         * @protected
         */
        this.editor = editor;

        /**
         * The root HTMLElement for this UI component.
         * Created by the `_createElement` method and appended to the container
         * during `initialize`.
         * @type {HTMLElement | null}
         * @public
         */
        this.element = null;
    }

    /**
     * Initializes the UI component.
     * Calls the subclass's `_createElement` to build the DOM structure, appends it
     * to the provided container, and then calls `_setupEventListeners`.
     * Ensures the component is added to the DOM before listeners are attached.
     *
     * @param {HTMLElement} container - The parent DOM element to append this component's element to.
     * @throws {Error} If container is not a valid HTMLElement.
     * @throws {Error} If subclass does not implement `_createElement`.
     * @public
     */
    initialize(container) {
        if (!(container instanceof HTMLElement)) {
            throw new Error(`UIComponent ${this.constructor.name}: Initialization requires a valid container HTMLElement.`);
        }
        if (typeof this._createElement !== 'function') {
            throw new Error(`UIComponent ${this.constructor.name}: Subclass must implement _createElement().`);
        }

        // Create the element using the subclass implementation
        this.element = this._createElement();

        if (this.element instanceof HTMLElement) {
            // Append the created element to the DOM container
            try {
                container.appendChild(this.element);
            } catch (error) {
                 logger.error(`UIComponent ${this.constructor.name}: Error appending element to container:`, error);
                 this.element = null; // Nullify element if append failed
                 return; // Stop initialization
            }

            // Setup event listeners (internal and external) after element is in DOM
            if (typeof this._setupEventListeners === 'function') {
                try {
                    this._setupEventListeners();
                } catch (error) {
                    logger.error(`UIComponent ${this.constructor.name}: Error setting up event listeners:`, error);
                }
            }
        } else {
            logger.error(`UIComponent ${this.constructor.name}: _createElement() did not return a valid HTMLElement.`);
            this.element = null; // Ensure element is null if creation failed
        }
    }

    /**
     * Abstract method intended to be overridden by subclasses.
     * Should create and return the root HTMLElement for the specific UI component.
     *
     * @returns {HTMLElement | null} The root HTMLElement for this component, or null if creation fails.
     * @protected
     * @abstract
     */
    _createElement() {
        // This method MUST be implemented by subclasses (e.g., Toolbar, Inspector).
        logger.error(`UIComponent ${this.constructor.name}: _createElement() is not implemented.`);
        return null;
    }

    /**
     * Optional method intended to be overridden by subclasses.
     * Should set up any necessary event listeners. This includes:
     * - Internal listeners (e.g., button clicks within the component's element).
     * - External listeners (e.g., subscribing to events from `this.editor.eventEmitter`).
     *
     * Subclasses should ideally use `this.editor.eventEmitter` to listen for engine state
     * changes (like entity selection, component updates) and update their internal display
     * accordingly, rather than directly querying systems frequently.
     * @protected
     * @virtual
     */
    _setupEventListeners() {
        // Subclasses can override this to attach event listeners.
        // Example: this.editor.eventEmitter.on('entitySelected', this._handleSelection.bind(this));
        // Example: this.element.querySelector('button')?.addEventListener('click', this._handleButtonClick.bind(this));
    }

    /**
     * Cleans up the UI component.
     * Removes the component's root element from the DOM and should ideally
     * remove any event listeners set up in `_setupEventListeners` to prevent memory leaks.
     * Subclasses should override this to perform specific listener removal if necessary,
     * calling `super.destroy()` at the end.
     * @public
     * @virtual
     */
    destroy() {
        // Subclasses should implement removal of specific listeners added in _setupEventListeners.
        // Example: this.editor.eventEmitter.off('entitySelected', this._handleSelection);
        // Example: this.element.querySelector('button')?.removeEventListener('click', this._handleButtonClick);

        // Remove the root element from the DOM
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null; // Clear reference
        this.editor = null; // Clear reference to editor
        // logger.log(`UIComponent ${this.constructor.name}: Destroyed.`);
    }
}