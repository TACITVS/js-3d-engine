import { JSDOM } from 'jsdom';
import chai from 'chai';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

global.HTMLElement = dom.window.HTMLElement;

global.expect = chai.expect;
window.expect = chai.expect;

if (typeof global.AudioBuffer === 'undefined') {
  global.AudioBuffer = class {};
}
window.AudioBuffer = global.AudioBuffer;

export {};
