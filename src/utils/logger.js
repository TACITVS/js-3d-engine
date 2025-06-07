let DEBUG = false;

if (typeof globalThis !== 'undefined') {
  if (typeof globalThis.DEBUG !== 'undefined') {
    DEBUG = !!globalThis.DEBUG;
  }
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.has('debug')) {
      const val = params.get('debug');
      DEBUG = val !== 'false' && val !== '0';
      globalThis.DEBUG = DEBUG;
    }
  }
}

export function setDebug(value) {
  DEBUG = !!value;
  if (typeof globalThis !== 'undefined') {
    globalThis.DEBUG = DEBUG;
  }
}

export function getDebug() {
  return DEBUG;
}

export function log(...args) {
  if (DEBUG) console.log(...args);
}

export function warn(...args) {
  if (DEBUG) console.warn(...args);
}

export function error(...args) {
  if (DEBUG) console.error(...args);
}
