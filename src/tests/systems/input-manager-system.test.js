// src/tests/systems/input-manager-system.test.js
// Unit tests for InputManagerSystem mouse functionality

import '../../../test/setup.js';
import { InputManagerSystem } from '../../systems/input-manager-system.js';

describe('InputManagerSystem Mouse Support', () => {
    let ims;

    beforeEach(async () => {
        ims = new InputManagerSystem();
        await ims.initialize(null, null, null);
    });

    afterEach(() => {
        ims.cleanup();
    });

    it('tracks mouse position and delta', () => {
        const evt1 = new window.MouseEvent('mousemove', { clientX: 10, clientY: 20 });
        window.dispatchEvent(evt1);
        expect(ims.getMousePosition()).to.deep.equal({ x: 10, y: 20 });
        expect(ims.getMouseDelta()).to.deep.equal({ x: 10, y: 20 });

        const evt2 = new window.MouseEvent('mousemove', { clientX: 15, clientY: 25 });
        window.dispatchEvent(evt2);
        expect(ims.getMousePosition()).to.deep.equal({ x: 15, y: 25 });
        expect(ims.getMouseDelta()).to.deep.equal({ x: 15, y: 25 });

        ims.postUpdate({});
        expect(ims.getMouseDelta()).to.deep.equal({ x: 0, y: 0 });
    });

    it('tracks mouse button states', () => {
        const downEvt = new window.MouseEvent('mousedown', { button: 0 });
        window.dispatchEvent(downEvt);
        expect(ims.isMouseButtonDown(0)).to.be.true;
        expect(ims.wasMouseButtonPressed(0)).to.be.true;

        const upEvt = new window.MouseEvent('mouseup', { button: 0 });
        window.dispatchEvent(upEvt);
        expect(ims.isMouseButtonDown(0)).to.be.false;
        expect(ims.wasMouseButtonReleased(0)).to.be.true;

        ims.postUpdate({});
        expect(ims.wasMouseButtonPressed(0)).to.be.false;
        expect(ims.wasMouseButtonReleased(0)).to.be.false;
    });
});
