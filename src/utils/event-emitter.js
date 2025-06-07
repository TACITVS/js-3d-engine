import * as logger from './logger.js';
// src/utils/event-emitter.js - Simple event emitter implementation

export class EventEmitter {
    constructor() {
        this.listeners = new Map(); // event name -> array of listeners
        this.onceListeners = new Map(); // event name -> Set of one-time listeners
    }
    
    // Add event listener
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        
        this.listeners.get(event).push(callback);
        
        // Return unsubscribe function
        return () => {
            this.off(event, callback);
        };
    }
    
    // Add one-time event listener
    once(event, callback) {
        // Create a wrapper function that removes itself after execution
        const onceWrapper = (...args) => {
            // Remove this listener
            this.off(event, onceWrapper);
            
            // Call the original callback
            callback(...args);
        };
        
        // Store a reference to the original callback
        onceWrapper.originalCallback = callback;
        
        // Add the wrapper as a listener
        this.on(event, onceWrapper);
        
        // Track as a once listener
        if (!this.onceListeners.has(event)) {
            this.onceListeners.set(event, new Set());
        }
        
        this.onceListeners.get(event).add(onceWrapper);
        
        // Return unsubscribe function
        return () => {
            this.off(event, onceWrapper);
        };
    }
    
    // Remove event listener
    off(event, callback) {
        const eventListeners = this.listeners.get(event);
        
        if (!eventListeners) {
            return;
        }
        
        const index = eventListeners.indexOf(callback);
        
        if (index !== -1) {
            eventListeners.splice(index, 1);
        } else {
            // Check if this is trying to remove a once listener by original callback
            const onceListeners = this.onceListeners.get(event);
            
            if (onceListeners) {
                for (const onceWrapper of onceListeners) {
                    if (onceWrapper.originalCallback === callback) {
                        // Remove from normal listeners
                        const index = eventListeners.indexOf(onceWrapper);
                        if (index !== -1) {
                            eventListeners.splice(index, 1);
                        }
                        
                        // Remove from once listeners
                        onceListeners.delete(onceWrapper);
                        break;
                    }
                }
            }
        }
    }
    
    // Remove all listeners for an event
    offAll(event) {
        if (event) {
            // Remove listeners for specific event
            this.listeners.delete(event);
            this.onceListeners.delete(event);
        } else {
            // Remove all listeners for all events
            this.listeners.clear();
            this.onceListeners.clear();
        }
    }
    
    // Emit an event
    emit(event, data) {
        const eventListeners = this.listeners.get(event);
        
        if (!eventListeners) {
            return;
        }
        
        // Create a copy of the listeners array to avoid issues
        // if listeners are added/removed during emission
        const listeners = [...eventListeners];
        
        for (const listener of listeners) {
            try {
                listener(data);
            } catch (error) {
                logger.error(`Error in event listener for ${event}:`, error);
            }
        }
    }
    
    // Get number of listeners for an event
    listenerCount(event) {
        const eventListeners = this.listeners.get(event);
        return eventListeners ? eventListeners.length : 0;
    }
    
    // Get all event names
    eventNames() {
        return Array.from(this.listeners.keys());
    }
}