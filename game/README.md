# 🎮 Sea Invaders — Game Engine

A framework-free JavaScript game engine on HTML5 Canvas 2D, written as ES modules.

## Structure

```
game/
├── game.js                 Main entry: re-exports everything below, plus createGame()
├── core/
│   ├── game-engine.js      GameEngine base class: game loop, update and draw logic
│   ├── game-constants.js   Gameplay constants, scoring tables, mobile detection
│   └── game-config.js      Default configuration for game modes
├── modes/
│   └── regular-game.js     RegularGame (extends GameEngine): boosts, sessions, score saving
├── systems/
│   ├── physics.js          Collision detection
│   ├── rendering.js        Shadow helpers
│   └── utils.js            Safe timers
└── features/
    └── easter-eggs.js      Toasty, Sailor and other easter eggs
```

## How the web client uses it

`components/game/GameCanvas.tsx` waits for the global scripts loaded by `public/game-loader.js`
(preload and sound managers, the boss system, boosts, performance tools, game-session manager),
then imports the engine and starts a game:

```js
const { RegularGame } = await import("@/game/game.js");

const game = new RegularGame({
  canvasId: canvas.id,
  onScoreUpdate,
  onLivesUpdate,
  onLevelUpdate,
  onGameOver,
});

await game.init();
game.start();
```

## Global dependencies

The engine expects these on `window` before `init()` runs:

- `preloadManager` — preloaded images and sounds
- `soundManager` — audio
- `BossSystemV2` (`boss-system/`) — boss logic and rendering
- `BoostManager` (`boosts/`) — power-ups
- `PerformanceOptimizer`, `PerformanceMonitor` — optional performance tooling
- `gameSessionManager`, `authManager` — optional server-side sessions and score submission

## Notes

- `init()` awaits `requestAnimationFrame` while it rescales sprites, so it only completes in a visible tab.
- A server-side session starts only for an authenticated player, and scores are submitted only
  within such a session; guests can play, but their scores are not saved.
