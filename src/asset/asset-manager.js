// src/asset/asset-manager.js
// @version 1.6.0 - Added listLoadedAssets(), improved error handling context, refined unload.
// @previous 1.5.0 - Made base asset path configurable via constructor options.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { engineConfig } from '../engine-config.js'; // Import engine config for default path

// We might need DRACOLoader if models are Draco compressed
// import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Manages loading and caching of game assets relative to a configurable base path.
 * Emits events for loading progress and completion/errors.
 *
 * @class AssetManager
 */
export class AssetManager {
    /**
     * Creates an AssetManager instance.
     * @param {import('../utils/event-emitter.js').EventEmitter} eventEmitter - Reference to the global event emitter.
     * @param {object} [options={}] - Configuration options.
     * @param {string} [options.basePath] - The base path for assets, relative to index.html. Defaults to engineConfig.assetManager.basePath.
     */
    constructor(eventEmitter, options = {}) {
        if (!eventEmitter) throw new Error("AssetManager requires an EventEmitter instance.");

        /** @type {import('../utils/event-emitter.js').EventEmitter} */
        this.eventEmitter = eventEmitter;
        /** @private @type {Map<string, any>} */
        this.assets = new Map(); // Stores assets keyed by RELATIVE path
        /** @private @type {Map<string, Promise<any>>} */
        this.loadingPromises = new Map(); // Tracks promises keyed by RELATIVE path

        /**
         * Base path for loading assets. Ensure it has leading/trailing slashes.
         * @type {string}
         * @public
         */
        this.baseAssetPath = options.basePath ?? engineConfig.assetManager.basePath;
        // Ensure base path format consistency (leading/trailing slashes)
        if (!this.baseAssetPath.startsWith('/')) { this.baseAssetPath = '/' + this.baseAssetPath; }
        if (!this.baseAssetPath.endsWith('/')) { this.baseAssetPath = this.baseAssetPath + '/'; }
        console.log(`[AssetManager] Initialized with base path: ${this.baseAssetPath}`);

        // Initialize loaders
        /** @private */
        this.textureLoader = new THREE.TextureLoader();
        /** @private */
        this.fileLoader = new THREE.FileLoader();
        this.fileLoader.setResponseType('json');
        /** @private */
        this.gltfLoader = new GLTFLoader();
        /** @private */
        this.audioLoader = new THREE.AudioLoader();

        // Optional: Setup DracoLoader
        // const dracoLoader = new DRACOLoader();
        // dracoLoader.setDecoderPath( '/path/to/draco/gltf/' ); // Path to Draco decoder libs
        // this.gltfLoader.setDRACOLoader( dracoLoader );
    }

    /**
     * Loads an asset from the given path (expected to be relative to baseAssetPath).
     * Handles caching and concurrent requests.
     * Emits 'assetLoadStart', 'assetLoadProgress', 'assetLoadComplete', 'assetLoadError'.
     *
     * @param {string} relativePath - The path to the asset file, relative to baseAssetPath (e.g., 'models/player.glb', 'textures/diffuse.png').
     * @returns {Promise<any>} A promise that resolves with the loaded asset data.
     */
    async load(relativePath) {
        if (!relativePath || typeof relativePath !== 'string') {
             return Promise.reject(new Error("Asset path must be a non-empty string."));
        }
        // Clean path: remove leading/trailing slashes to ensure consistent key usage
        const cleanedRelativePath = relativePath.trim().replace(/^\/+|\/+$/g, '');
        if (!cleanedRelativePath) {
             return Promise.reject(new Error("Asset path cannot be empty after trimming."));
        }

        if (this.assets.has(cleanedRelativePath)) {
            return Promise.resolve(this.assets.get(cleanedRelativePath));
        }
        if (this.loadingPromises.has(cleanedRelativePath)) {
            return this.loadingPromises.get(cleanedRelativePath);
        }

        // Construct full path using the configurable base path
        const fullPath = this.baseAssetPath + cleanedRelativePath;

        console.log(`[AssetManager] Loading asset: '${cleanedRelativePath}' (Full path: '${fullPath}')`);
        this.eventEmitter.emit('assetLoadStart', { path: cleanedRelativePath });

        const extension = cleanedRelativePath.split('.').pop()?.toLowerCase();
        let loadPromise;

        // --- Helper to format error messages ---
        const formatError = (baseMsg, error, path) => {
            let details = 'Unknown error';
            if (error instanceof Error) {
                details = error.message;
            } else if (typeof error === 'string') {
                details = error;
            } else if (error?.target?.src) {
                details = `Network error loading ${error.target.src}`;
            } else if (error?.message) {
                details = error.message;
            }
            return new Error(`${baseMsg} '${path}': ${details}`);
        };
        // --- End Helper ---

        switch (extension) {
            case 'jpg': case 'jpeg': case 'png': case 'gif': case 'bmp': case 'webp':
                loadPromise = new Promise((resolve, reject) => {
                    this.textureLoader.load(fullPath,
                        (texture) => { resolve(texture); },
                        (xhr) => { this.eventEmitter.emit('assetLoadProgress', { path: cleanedRelativePath, loaded: xhr.loaded, total: xhr.total, progress: xhr.total > 0 ? xhr.loaded / xhr.total : 0 }); },
                        (error) => { reject(formatError('Failed to load texture', error, cleanedRelativePath)); }
                    );
                });
                break;

            case 'json':
                this.fileLoader.setResponseType('json'); // Ensure correct type
                loadPromise = new Promise((resolve, reject) => {
                    this.fileLoader.load(fullPath,
                        (jsonData) => { resolve(jsonData); },
                        (xhr) => { this.eventEmitter.emit('assetLoadProgress', { path: cleanedRelativePath, loaded: xhr.loaded, total: xhr.total, progress: xhr.total > 0 ? xhr.loaded / xhr.total : 0 }); },
                        (error) => { reject(formatError('Failed to load JSON', error, cleanedRelativePath)); }
                    );
                });
                break;

            case 'gltf': case 'glb':
                loadPromise = new Promise((resolve, reject) => {
                    this.gltfLoader.load(fullPath,
                        (gltfData) => { resolve(gltfData); },
                        (xhr) => { const progress = (xhr.total > 0) ? xhr.loaded / xhr.total : 0; this.eventEmitter.emit('assetLoadProgress', { path: cleanedRelativePath, loaded: xhr.loaded, total: xhr.total, progress }); },
                        (error) => { reject(formatError('Failed to load GLTF/GLB', error, cleanedRelativePath)); }
                    );
                });
                break;

            case 'mp3': case 'ogg': case 'wav': case 'aac': case 'flac': // Add common audio types
                 loadPromise = new Promise((resolve, reject) => {
                      this.audioLoader.load(fullPath,
                           (audioBuffer) => { resolve(audioBuffer); }, // Resolves with an AudioBuffer
                           (xhr) => { this.eventEmitter.emit('assetLoadProgress', { path: cleanedRelativePath, loaded: xhr.loaded, total: xhr.total, progress: xhr.total > 0 ? xhr.loaded / xhr.total : 0 }); },
                           (error) => { reject(formatError('Failed to load audio', error, cleanedRelativePath)); }
                      );
                 });
                 break;

            default:
                console.warn(`[AssetManager] Unsupported file extension '.${extension}' for path: ${cleanedRelativePath}.`);
                const unsupportedError = new Error(`Unsupported file type: ${extension}`);
                this.eventEmitter.emit('assetLoadError', { path: cleanedRelativePath, error: unsupportedError.message });
                loadPromise = Promise.reject(unsupportedError);
                break;
        }

        // Store promise using the cleaned relative path
        if (loadPromise instanceof Promise) {
             this.loadingPromises.set(cleanedRelativePath, loadPromise);

             loadPromise.then(assetData => {
                 console.log(`[AssetManager] Successfully loaded: ${cleanedRelativePath}`);
                 this.assets.set(cleanedRelativePath, assetData); // Cache using cleaned relative path
                 this.eventEmitter.emit('assetLoadComplete', { path: cleanedRelativePath, asset: assetData });
             }).catch(error => {
                 // Emit the formatted error message
                 this.eventEmitter.emit('assetLoadError', { path: cleanedRelativePath, error: error.message || 'Unknown loading error' });
                 // Error should have already been logged by the promise constructor's reject call or formatError
             }).finally(() => {
                 this.loadingPromises.delete(cleanedRelativePath);
             });

             return loadPromise;
        } else {
             // This case should ideally not happen if the switch covers all promise creation paths
             return Promise.reject(new Error(`Could not create load promise for type: ${extension}`));
        }
    }

    /**
     * Retrieves a previously loaded asset from the cache using its relative path.
     * @param {string} relativePath - The relative path of the asset to retrieve (e.g., 'models/player.glb').
     * @returns {any | undefined} The cached asset data, or `undefined`.
     */
    get(relativePath) {
        // Clean path for lookup consistency
        const cleanedRelativePath = relativePath?.trim().replace(/^\/+|\/+$/g, '');
        return cleanedRelativePath ? this.assets.get(cleanedRelativePath) : undefined;
    }

    /**
     * Checks if an asset is currently loaded using its relative path.
     * @param {string} relativePath - The relative path of the asset to check.
     * @returns {boolean} `true` if the asset is loaded.
     */
    isLoaded(relativePath) {
        // Clean path for lookup consistency
        const cleanedRelativePath = relativePath?.trim().replace(/^\/+|\/+$/g, '');
        return cleanedRelativePath ? this.assets.has(cleanedRelativePath) : false;
    }

    /**
     * Returns an array of relative paths for all currently loaded assets.
     * @returns {string[]} An array of asset paths.
     */
    listLoadedAssets() {
        return Array.from(this.assets.keys());
    }

    /**
     * Removes an asset from the cache (using relative path) and attempts to dispose resources.
     * @param {string} relativePath - The relative path of the asset to unload.
     * @returns {boolean} `true` if the asset was found and removed, `false` otherwise.
     */
    unload(relativePath) {
        // Clean path for lookup consistency
         const cleanedRelativePath = relativePath?.trim().replace(/^\/+|\/+$/g, '');
         if (!cleanedRelativePath) return false;

        if (this.assets.has(cleanedRelativePath)) {
            const asset = this.assets.get(cleanedRelativePath);
            console.log(`[AssetManager] Unloading asset '${cleanedRelativePath}'...`);

            // --- Refined Disposal Logic ---
            try {
                if (asset instanceof THREE.Texture) {
                    // Check if dispose method exists (standard for Texture)
                    if (typeof asset.dispose === 'function') {
                         asset.dispose();
                         console.log(` - Disposed THREE.Texture.`);
                    } else {
                         console.warn(` - Asset '${cleanedRelativePath}' is Texture but missing dispose() method?`);
                    }
                } else if (asset?.scene instanceof THREE.Scene) { // Check for GLTF result structure more robustly
                    asset.scene.traverse((object) => {
                        if (object.isMesh) {
                            // Dispose geometry if it exists and has dispose
                            if (object.geometry && typeof object.geometry.dispose === 'function') {
                                object.geometry.dispose();
                            }
                            // Dispose material(s) using helper
                            if (object.material) {
                                if (Array.isArray(object.material)) {
                                    object.material.forEach(material => this._disposeMaterial(material));
                                } else {
                                    this._disposeMaterial(object.material);
                                }
                            }
                        }
                    });
                    // TODO: Consider disposing animations, skeletons etc. if applicable
                    console.log(` - Disposed resources within GLTF scene.`);
                } else if (asset?.isMaterial) { // Check if it's a Material instance
                    this._disposeMaterial(asset);
                    console.log(` - Disposed THREE.Material.`);
                } else if (asset?.isBufferGeometry) { // Check if it's a BufferGeometry instance
                     if (typeof asset.dispose === 'function') {
                          asset.dispose();
                          console.log(` - Disposed THREE.BufferGeometry.`);
                     } else {
                          console.warn(` - Asset '${cleanedRelativePath}' is BufferGeometry but missing dispose() method?`);
                     }
                } else if (asset instanceof AudioBuffer) {
                     console.log(` - Asset '${cleanedRelativePath}' is an AudioBuffer (no standard dispose method).`);
                     // AudioBuffers are typically managed by the AudioContext.
                } else if (typeof asset?.dispose === 'function') {
                     // Catch-all for other disposable Three.js objects
                     asset.dispose();
                     console.log(` - Disposed unknown asset type with dispose() method.`);
                } else {
                     console.log(` - Asset '${cleanedRelativePath}' type does not require standard disposal (e.g., JSON).`);
                }
            } catch (e) {
                // Catch errors specifically during the disposal process
                console.error(`[AssetManager] Error during disposal of asset '${cleanedRelativePath}':`, e);
            }
            // --- End Refined Disposal Logic ---

            const deleted = this.assets.delete(cleanedRelativePath);
            if(deleted) console.log(`[AssetManager] Asset '${cleanedRelativePath}' removed from cache.`);
            return deleted;
        }
        return false;
    }

    /** @private Helper to dispose of a THREE.Material and its textures. */
    _disposeMaterial(material) {
         if (!material) return;
         // Check if material has already been disposed (basic check)
         if (material.userData?.disposed) return;

         // Dispose textures associated with the material
         for (const key of Object.keys(material)) {
             const value = material[key];
             // Only dispose textures managed by Three.js (has a dispose method)
             if (value instanceof THREE.Texture && typeof value.dispose === 'function') {
                 value.dispose();
             }
         }
         // Dispose the material itself if possible
         if (typeof material.dispose === 'function') {
              material.dispose();
              material.userData.disposed = true; // Mark as disposed
         } else {
              console.warn(` - Material type ${material.type} lacks a dispose() method.`);
         }
    }

    /** Clears the entire asset cache. */
    clear() {
        console.log("[AssetManager] Clearing asset cache...");
        // Cancel any ongoing loads? Difficult without AbortController integration in loaders.
        this.loadingPromises.clear(); // Clear pending promises map

        const paths = this.listLoadedAssets(); // Use the new method
        paths.forEach(path => this.unload(path)); // Use unload which handles disposal

        // Final check and clear just in case unload missed something
        if (this.assets.size > 0) {
             console.warn(`[AssetManager] Cache clear might be incomplete (${this.assets.size} items remain). Forcibly clearing.`);
             // We don't iterate and dispose again here, as `unload` should have handled it.
             // If items remain, it might indicate an issue in `unload` or disposal logic.
             this.assets.clear();
        }
        console.log("[AssetManager] Asset cache cleared.");
    }
}