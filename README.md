# JS 3D Engine

This repository contains a simple 3D engine and accompanying unit tests.

## Running the engine

The HTML entry point (`index.html`) loads ES modules and additional assets
using relative paths. Most modern browsers block these requests when an HTML
file is opened directly from disk (e.g. via the `file://` protocol), resulting
in a blank page or script errors. To run the editor and examples you should
serve the repository through a local web server instead of double‑clicking the
file.

Any simple HTTP server will work. For example:

```bash
npx http-server
```

or

```bash
python -m http.server
```

Once the server is running, open `http://localhost:8080` (or the port reported
by your server) in your browser to load the engine.

## Running the tests

Install dependencies using `npm install` and then execute:

```bash
npm test
```

The tests run in a Node environment using Mocha with jsdom providing a browser-like DOM.

## Breakout Example
Detailed notes on the Breakout scene files and game systems can be found in [`src/games/breakout/README.md`](src/games/breakout/README.md).
