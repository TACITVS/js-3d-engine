import * as logger from '../../../utils/logger.js';
// games/breakout/systems/game-ui-system.js
// NOTE: Moved from src/systems/game/ - Part of Engine/Game Separation step.
// @version 1.0.1 - Updated import paths.

// No direct config dependency here, relies on other systems calling its update methods.

export class GameUISystem {
    constructor() {
        this.priority = 200; // Run late
        this.active = true; // Should be activated/deactivated by game logic/mode manager
        this._name = 'gameUI'; // Keep name consistent for now

        this.engine = null;
        this.container = null; // The main editor/game container

        // UI Elements
        this.uiRoot = null;
        this.scoreElement = null;
        this.livesElement = null;
        this.messageElement = null;
        this.bricksElement = null; // To show remaining bricks

        this.isVisible = false;
    }

    async initialize(entityManager, eventEmitter, engine) {
        this.engine = engine;
        // Assumes engine instance has 'container' property pointing to main DOM container
        this.container = engine.container;

        if (!this.container) {
            logger.error("[Breakout] GameUISystem: Container not found on engine instance!");
            this.active = false; // Cannot function without container
            return;
        }

        this._createUIElements();
        this.hide(); // Hidden by default, game state system should show/hide

        logger.log("[Breakout] GameUISystem Initialized");
    }

    _createUIElements() {
        // Create root container for UI overlay
        this.uiRoot = document.createElement('div');
        this.uiRoot.id = 'game-ui-overlay';
        Object.assign(this.uiRoot.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none', // Allow clicks to pass through to the canvas
            color: 'white',
            fontFamily: '"Press Start 2P", monospace', // Breakout style font
            textTransform: 'uppercase',
            zIndex: '300', // Ensure it's above other UI like hierarchy/inspector
            display: 'none', // Hidden initially
            opacity: '0', // Start fully transparent
            visibility: 'hidden',
            transition: 'opacity 0.3s ease-in-out, visibility 0.3s ease-in-out',
        });

        // Score Display
        this.scoreElement = document.createElement('div');
        this.scoreElement.id = 'game-score';
        Object.assign(this.scoreElement.style, {
            position: 'absolute',
            top: '15px',
            left: '15px',
            fontSize: '20px', // Adjusted size
            textShadow: '2px 2px 0px rgba(0,0,0,0.7)'
        });
        this.scoreElement.textContent = 'Score: 0';
        this.uiRoot.appendChild(this.scoreElement);

        // Lives Display
        this.livesElement = document.createElement('div');
        this.livesElement.id = 'game-lives';
        Object.assign(this.livesElement.style, {
            position: 'absolute',
            top: '15px',
            right: '15px',
            fontSize: '20px', // Adjusted size
            textShadow: '2px 2px 0px rgba(0,0,0,0.7)'
        });
        this.livesElement.textContent = 'Lives: 3';
        this.uiRoot.appendChild(this.livesElement);

         // Bricks Remaining Display
        this.bricksElement = document.createElement('div');
        this.bricksElement.id = 'game-bricks';
        Object.assign(this.bricksElement.style, {
            position: 'absolute',
            top: '45px', // Below score/lives
            left: '15px',
            fontSize: '14px', // Adjusted size
            textShadow: '1px 1px 0px rgba(0,0,0,0.7)',
            color: '#dddddd'
        });
        this.bricksElement.textContent = 'Bricks: 0';
        this.uiRoot.appendChild(this.bricksElement);


        // Message Display (e.g., "Press Space to Launch", "Game Over")
        this.messageElement = document.createElement('div');
        this.messageElement.id = 'game-message';
        Object.assign(this.messageElement.style, {
            position: 'absolute',
            top: '45%', // Adjusted position slightly
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '28px', // Adjusted size
            fontWeight: 'bold',
            textShadow: '3px 3px 0px rgba(0,0,0,0.7)',
            textAlign: 'center',
            display: 'none', // Hidden initially
            lineHeight: '1.4',
            width: '80%', // Ensure text wraps
            whiteSpace: 'pre-wrap' // Allow line breaks (\n)
        });
        this.uiRoot.appendChild(this.messageElement);

        // Append the UI overlay to the main container
        this.container.appendChild(this.uiRoot);
    }

    // --- Public methods to update UI ---

    updateScore(score) {
        if (this.scoreElement) {
            this.scoreElement.textContent = `Score: ${score}`;
        }
    }

    updateLives(lives) {
        if (this.livesElement) {
            this.livesElement.textContent = `Lives: ${lives}`;
        }
    }

     updateBrickCount(count) {
        if (this.bricksElement) {
            this.bricksElement.textContent = `Bricks: ${count}`;
        }
    }


    updateGameState(state) {
        if (!this.messageElement) return;

        switch (state) {
            case 'WAITING_TO_LAUNCH':
                this.messageElement.textContent = 'Press SPACE to Launch';
                this.messageElement.style.display = 'block';
                break;
            case 'PLAYING':
                this.messageElement.style.display = 'none';
                break;
            case 'GAME_OVER':
                this.messageElement.textContent = 'GAME OVER\n(Press SPACE to Restart)';
                this.messageElement.style.display = 'block';
                break;
             case 'LEVEL_COMPLETE':
                this.messageElement.textContent = 'LEVEL COMPLETE!\n(Press SPACE to Restart)';
                this.messageElement.style.display = 'block';
                break;
            default:
                this.messageElement.style.display = 'none';
        }
    }

    // --- System methods ---

    show() {
        if (this.uiRoot) {
            this.uiRoot.style.visibility = 'visible';
            this.uiRoot.style.opacity = '1';
            this.isVisible = true;
            logger.log("[Breakout] GameUISystem Shown");
        }
    }

    hide() {
        if (this.uiRoot) {
            this.uiRoot.style.opacity = '0';
            this.uiRoot.style.visibility = 'hidden';
            this.isVisible = false;
             logger.log("[Breakout] GameUISystem Hidden");
        }
    }

    update(time) {
        // This system doesn't need per-frame updates unless doing animations, etc.
        // UI updates are driven by other systems calling its public methods.
    }

    cleanup() {
        if (this.uiRoot && this.uiRoot.parentNode) {
            this.uiRoot.parentNode.removeChild(this.uiRoot);
        }
        this.uiRoot = null;
        this.scoreElement = null;
        this.livesElement = null;
        this.messageElement = null;
        this.bricksElement = null;
        this.container = null;
        this.engine = null;
        this.isVisible = false;
        logger.log("[Breakout] GameUISystem Cleaned Up");
    }
}