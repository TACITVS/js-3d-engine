// src/tests/asset/asset-manager.test.js
// Unit tests for the AssetManager class (Browser/Mocha/Chai)

// Imports relative to test-runner.html
import '../../../test/setup.js';
import { AssetManager } from '../../asset/asset-manager.js';
import { EventEmitter } from '../../utils/event-emitter.js';

// Use globally exposed 'describe', 'it', 'expect', 'beforeEach', 'afterEach', 'chai'
const { expect } = window;

// --- Test Suite ---
describe('AssetManager (Browser)', () => {
    /** @type {EventEmitter} */
    let emitter;
    /** @type {AssetManager} */
    let assetManager;

    beforeEach(() => {
        emitter = new EventEmitter();
        assetManager = new AssetManager(emitter);
    });

    afterEach(() => {
        assetManager.clear(); // Clear cache after each test
        emitter.offAll();    // Clear listeners
    });

    it('should initialize correctly', () => {
        expect(assetManager).to.exist;
        expect(assetManager.assets).to.be.instanceOf(Map);
        expect(assetManager.assets.size).to.equal(0);
        expect(assetManager.loadingPromises.size).to.equal(0);
        expect(assetManager.eventEmitter).to.equal(emitter);
        // Check if default loaders are registered (optional)
        // expect(assetManager.assetTypes.has('png')).to.be.true;
        // expect(assetManager.assetTypes.has('glb')).to.be.true;
        // expect(assetManager.assetTypes.has('json')).to.be.true;
    });

    it('should return cached asset if already loaded', async () => {
        const path = '/mock/asset.png';
        const mockAsset = { type: 'mockTexture' };
        assetManager.assets.set('mock/asset.png', mockAsset); // Pre-populate cache

        const asset = await assetManager.load(path);
        expect(asset).to.equal(mockAsset);
        expect(assetManager.loadingPromises.size).to.equal(0); // Should not have created a promise
    });

    it('should return existing promise if asset is currently loading', async () => {
        const path = '/mock/loading.png';
        let resolveFn;
        const fakePromise = new Promise(resolve => { resolveFn = resolve; });
        assetManager.loadingPromises.set('mock/loading.png', fakePromise); // Simulate loading

        const promise1 = assetManager.load(path);
        const promise2 = assetManager.load(path);

        // Both calls should use the same underlying loading promise
        expect(assetManager.loadingPromises.get('mock/loading.png')).to.equal(fakePromise);
        expect(assetManager.loadingPromises.size).to.equal(1); // Still only one promise

        // Resolve the original promise and check results
        const mockAsset = { loaded: true };
        resolveFn(mockAsset); // Manually resolve the fake promise

        const result1 = await promise1;
        const result2 = await promise2;
        expect(result1).to.equal(mockAsset);
        expect(result2).to.equal(mockAsset);
    });

    it('should reject if path is invalid', async () => {
        try {
            await assetManager.load('');
            expect.fail('Should have rejected for empty path');
        } catch (error) {
            expect(error).to.be.instanceOf(Error);
            expect(error.message).to.contain('non-empty string');
        }
        try {
            await assetManager.load(null);
            expect.fail('Should have rejected for null path');
        } catch (error) {
            expect(error).to.be.instanceOf(Error);
            expect(error.message).to.contain('non-empty string');
        }
    });

    it('should reject for unsupported file types', async () => {
         const path = 'myAsset.unsupported';
         let errorEvent = null;
         emitter.on('assetLoadError', (data) => errorEvent = data);

        try {
            await assetManager.load(path);
            expect.fail('Should have rejected for unsupported type');
        } catch (error) {
            expect(error).to.be.instanceOf(Error);
            expect(error.message).to.contain('Unsupported file type');
            expect(errorEvent).to.deep.equal({ path, error: 'Unsupported file type: unsupported' });
        }
    });

    it('should get loaded asset', () => {
        const path = '/mock/asset.png';
        const mockAsset = { type: 'mockTexture' };
        assetManager.assets.set('mock/asset.png', mockAsset);

        expect(assetManager.get(path)).to.equal(mockAsset);
    });

    it('should return undefined for unloaded asset', () => {
        expect(assetManager.get('/mock/nonexistent.png')).to.be.undefined;
    });

     it('should check if asset is loaded', () => {
        const path = '/mock/asset.png';
        const mockAsset = { type: 'mockTexture' };
        expect(assetManager.isLoaded(path)).to.be.false;
        assetManager.assets.set('mock/asset.png', mockAsset);
        expect(assetManager.isLoaded(path)).to.be.true;
    });

     it('should unload an asset', () => {
        const path = '/mock/asset.png';
        const mockAsset = { type: 'mockTexture', disposed: false, dispose: () => { mockAsset.disposed = true; } };
        assetManager.assets.set('mock/asset.png', mockAsset);
        expect(assetManager.isLoaded(path)).to.be.true;

        const result = assetManager.unload(path);
        expect(result).to.be.true;
        expect(assetManager.isLoaded(path)).to.be.false;
        expect(assetManager.get(path)).to.be.undefined;
        expect(mockAsset.disposed).to.be.true; // Check if dispose was called (if implemented)
    });

     it('should return false when unloading non-existent asset', () => {
        const result = assetManager.unload('/mock/nonexistent.png');
        expect(result).to.be.false;
     });

      it('should clear all assets', () => {
        const path1 = '/mock/asset1.png';
        const path2 = '/mock/asset2.json';
        const mockAsset1 = { type: 'mockTexture', disposed: false, dispose: () => { mockAsset1.disposed = true; } };
        const mockAsset2 = { type: 'mockJson' }; // No dispose method
        assetManager.assets.set('mock/asset1.png', mockAsset1);
        assetManager.assets.set('mock/asset2.json', mockAsset2);
        assetManager.loadingPromises.set('loading.glb', Promise.resolve());

        expect(assetManager.assets.size).to.equal(2);
        expect(assetManager.loadingPromises.size).to.equal(1);

        assetManager.clear();

        expect(assetManager.assets.size).to.equal(0);
        expect(assetManager.loadingPromises.size).to.equal(0);
        expect(mockAsset1.disposed).to.be.true;
    });

    // --- Tests for Actual Loading (Require specific assets & server setup) ---
    // These tests will likely FAIL unless you:
    // 1. Create corresponding dummy asset files (e.g., a tiny valid PNG, a simple JSON, a basic GLB)
    // 2. Place them in paths accessible to your test server (e.g., '/test-assets/...')
    // 3. Adjust the paths used in the tests below.
    // Alternatively, these could be mocked more extensively.

    // describe('Asset Loading (Requires Server & Assets)', () => {
    //     const TEST_ASSETS_BASE = './test-assets/'; // Example base path

    //     it('should load a texture file (.png)', async () => {
    //         const path = TEST_ASSETS_BASE + 'test.png'; // Needs actual test.png
    //         let startEvent = null;
    //         let progressEvent = null;
    //         let completeEvent = null;
    //         emitter.on('assetLoadStart', (data) => startEvent = data);
    //         emitter.on('assetLoadProgress', (data) => progressEvent = data);
    //         emitter.on('assetLoadComplete', (data) => completeEvent = data);

    //         try {
    //             const texture = await assetManager.load(path);
    //             expect(texture).to.exist;
    //             // Check if it resembles a THREE.Texture (difficult without importing THREE here)
    //             expect(texture.isTexture).to.be.true;
    //             expect(assetManager.isLoaded(path)).to.be.true;
    //             expect(assetManager.get(path)).to.equal(texture);
    //             expect(startEvent).to.deep.equal({ path });
    //             // Progress event is hard to test reliably without knowing file size/network speed
    //             expect(progressEvent).to.exist;
    //             expect(completeEvent).to.deep.equal({ path, asset: texture });
    //         } catch (error) {
    //             // This will fail if test.png doesn't exist or server isn't running
    //             console.error("Texture load test failed (Ensure server is running and test-assets/test.png exists):", error);
    //             // expect.fail(`Loading texture failed: ${error.message}`); // Uncomment to make test fail explicitly
    //         }
    //     }).timeout(5000); // Increase timeout for network requests

    //     it('should load a JSON file', async () => {
    //         const path = TEST_ASSETS_BASE + 'test.json'; // Needs actual test.json (e.g., {"data": "test"})
    //         let completeEvent = null;
    //         emitter.on('assetLoadComplete', (data) => completeEvent = data);

    //         try {
    //             const jsonData = await assetManager.load(path);
    //             expect(jsonData).to.be.an('object');
    //             expect(jsonData.data).to.equal('test'); // Check content
    //             expect(assetManager.isLoaded(path)).to.be.true;
    //             expect(completeEvent?.asset).to.deep.equal(jsonData);
    //         } catch (error) {
    //              console.error("JSON load test failed (Ensure server is running and test-assets/test.json exists):", error);
    //             // expect.fail(`Loading JSON failed: ${error.message}`);
    //         }
    //     }).timeout(5000);

    //     it('should load a GLB file', async () => {
    //         const path = TEST_ASSETS_BASE + 'test.glb'; // Needs actual test.glb (e.g., simple cube)
    //         let completeEvent = null;
    //         emitter.on('assetLoadComplete', (data) => completeEvent = data);
    //         try {
    //             const gltfData = await assetManager.load(path);
    //             expect(gltfData).to.be.an('object');
    //             expect(gltfData.scene).to.exist; // Check for scene object
    //             expect(gltfData.scene.isScene).to.be.true; // Basic check
    //             expect(assetManager.isLoaded(path)).to.be.true;
    //             expect(completeEvent?.asset).to.equal(gltfData);
    //         } catch (error) {
    //              console.error("GLB load test failed (Ensure server is running and test-assets/test.glb exists):", error);
    //             // expect.fail(`Loading GLB failed: ${error.message}`);
    //         }
    //     }).timeout(10000); // GLB might take longer
    // });

});