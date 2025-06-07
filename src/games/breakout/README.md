# Breakout Game Notes

## Scene Files
Scene JSON such as `breakout-level-1.json` or `Scene-00.json` describe the entities that make up a level. Each file has an `entities` array. Every entry contains an `id` and a `components` object. When a scene is loaded these objects are fed directly into the engine's `EntityManager` where a matching component class is constructed for each key in the `components` block.

The Breakout systems rely on a few tags:

- `gameBall` – marks the ball entity (also has a `ball` component).
- `playerPaddle` – marks the paddle controlled by the player and includes a `paddle` component.
- `gameStateManager` – entity holding the `score` component used to track lives and score.

Other standard components such as `transform`, `renderable`, `physics` and `camera` are parsed in the same way as any other scene.

## Loading a Scene
1. Open `index.html` in a browser to launch the editor.
2. Use the **Load Scene** button in the toolbar and select one of the JSON scenes.
3. Once the scene is loaded press **▶ Play** to enter game mode. The engine switches to the `BreakoutGameSystem` and related systems via the `GameStateManager`.
4. Press **■ Stop** to return to editor mode.

## System Roles
- **BreakoutGameSystem** – main game logic handling state changes, collisions and scoring.
- **GameUISystem** – displays the score, remaining lives and in‑game messages as an overlay.
- **InputSystem** – queries the `InputManagerSystem` each frame and moves the player paddle accordingly.
