# JS 3D Engine

## Purpose
A small browser-based 3D editor and engine. The repo includes an example Breakout game demonstrating the engine in action.

## Requirements
- Modern web browser
- Alternatively, serve the project via any local HTTP server

## Running the Editor
1. Open `index.html` directly in your browser, or
2. Start a simple server (e.g. `npx http-server .`) and navigate to `http://localhost:PORT/index.html`.

## Running Tests
Open `test-runner.html` in a browser to run the Mocha test suite. Future updates aim to support running the tests via Node and CI.

## Code Layout
- `src/` – core engine, editor, and utilities
- `src/games/breakout/` – example Breakout game configuration, components, and systems
- `src/tests/` – unit tests loaded by `test-runner.html`
