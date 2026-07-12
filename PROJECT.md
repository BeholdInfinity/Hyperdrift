# Hyperdrift — Project Handoff

Browser-based 2D spaceflight prototype. Top-down semi-Newtonian physics, procedural infinite universe, HTML5 Canvas. **No build step** — ES modules served over HTTP.

> **Not the game design doc.** See [`GDD.md`](GDD.md) for prototype mechanics. See [`VISION.md`](VISION.md) for long-term vision (*Hyperdrift Crewline*). See [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) for unresolved decisions. This file is for developers and AI agents resuming work.

## Run

**Easiest:** double-click [`start-game.bat`](start-game.bat) in the project folder. It starts a local server, **waits until the page is actually ready**, then opens your browser.

Uses `start-game.ps1` under the hood so Python is found reliably when launched from Explorer (not only from a dev terminal). Serves via `dev-server.py` with **no-cache** headers (plain `http.server` can leave browsers stuck on old JS modules). Title screen bottom-left shows **vX.Y.Z · Last edit:** from `/build-info.json` (version in `src/version.js`, newest project file mtime).

**Manual:**

```powershell
cd hyperdrift
python dev-server.py 8080
```

(Or `python -m http.server 8080` — but prefer `dev-server.py`, which disables browser caching of JS modules so code edits show up on refresh.)

Open http://localhost:8080 → click **LAUNCH**.

**Stop the server:** close the black command window, press **Ctrl+C** in it, or double-click [`stop-game.bat`](stop-game.bat).

Note: `start-game.bat` waits for the server to respond before opening the browser. If port 8080 has a stuck process, it clears only **unresponsive** listeners.

## Tech stack

- Vanilla JavaScript (ES6+ modules)
- HTML5 Canvas + CSS
- No npm dependencies

## Repository layout

```
index.html, styles.css, dev-server.py, start-game.bat / .ps1, stop-game.bat
src/
  main.js                 Entry point, UI wiring
  version.js              Prototype semver (title stamp + build-info)
  core/
    GameEngine.js         Main loop, title/play modes, system orchestration
    Constants.js          Physics, camera, ship, world tuning
  systems/
    InputSystem.js        Keyboard, mouse, wheel, fullscreen, ESC pause
    PhysicsSystem.js      Forces, braking, rotation
    CameraSystem.js       Offset, zoom (manual + speed-based)
    Renderer.js           Circular viewport, multi-section ship, thrusters, entities
    WeaponSystem.js       Dorsal turret + mining laser, collisions, impacts
    AsteroidSystem.js     Chunk load/unload
    ProceduralGeneration.js  Seeded asteroids + nebulae
  entities/
    Ship.js, ShipController.js, ShipHardpoints.js (turret/laser/engine/8 thrusters)
    Projectile.js, Asteroid.js, Particle.js, Entity.js, EntityManager.js
  world/
    Starfield.js          7 parallax star layers (screen-fixed size, tiled when zoomed out)
    NebulaField.js        3 depth layers + ambient procedural nebulae
    SpeedStreaks.js       Velocity-opposed foreground streaks (screen-space)
    HangarBay.js          Home Base hangar (fixed crew, boards, door tickers, logistics)
    HangarVisitorShips.js Neighbor-pad ship silhouettes (+ ambient traffic draws)
    Station.js            Jennings Station overworld exterior + dock zones
  utils/
    MathUtils.js, SeededRandom.js
```

## Architecture principles

- **Modular systems** wired by `GameEngine` — extend via new systems/entities, not monolith edits
- **Chunk-based world** — deterministic seeds, load radius 3, unload radius 5 (`WORLD` in Constants)
- **Thruster visuals driven by physics** — eight blue maneuvering thrusters + orange main engine; mounts from `ShipHardpoints.js`; exhaust is ship-local; camera pose must match post-physics ship
- **Plume flow** (`Renderer._computePlumeFlow`) — leading cue/wash + crosswind lean from relative wind (`−velocity`) so plumes read AoA and speed; trailing stretch; ship-local particles
- **Modes** — `title` (drifting backdrop), `playing` (flight), `hangar` (Jennings Station / Home Base), `controls` (ship-only settings sandbox)
- **Future-ready** for multiple ships, AI, trading, mining, missions, Home Base launch/extract, networking, save/load

## Current implementation status

| Area | Status |
|------|--------|
| Semi-Newtonian flight (WASD, Q/E yaw, main engine, afterburner, brakes) | Done |
| Double-tap-hold burst on QWEASD; Caps Lock Precision (engage gate + active speed cap) | Done |
| Space brakes snap to rest below velocity threshold; retro-burn when nose-into-velocity | Done |
| Mouse aims weapons inside viewport circle (cursor always visible); turret/laser slew | Done |
| 8 blue maneuver thrusters + orange main engine (hardpoint-driven plumes) | Done |
| Plume flow: leading flatten + crosswind lean (AoA/speed readable in flames) | Done |
| Multi-section filled ship silhouette (`ShipHardpoints.js`) | Done |
| Ship-local exhaust particles; camera tracks post-physics pose | Done |
| Dorsal 360° combat turret (LMB, 3/s) + nose mining laser (RMB) | Done |
| Circular viewport + corner UI placeholders | Done |
| Title screen (ENTER HANGAR / QUICK LAUNCH / SETTINGS; version stamp) | Done |
| Home Base hangar (Jennings Station; B1–B3; launch + land sequences) | Bay + launch/land; pad status boards (stats/cargo/service); family-safe crane |
| Jennings Station overworld exterior + dock prompt | Done |
| Settings controls sandbox (ship-only viewport) | Done |
| Procedural asteroids + nebulae | Done |
| 7-layer starfield, 3-layer nebulae | Done |
| Speed streaks (velocity-opposed, screen-space) | Done |
| Camera lead offset + scroll zoom + speed zoom | Done |
| Fullscreen button + pause menu (ESC; resume / settings / main menu) | Done |
| Sound, fuel, fragmentation, minimap | Not started |

## Key tuning (`src/core/Constants.js`)

- `PHYSICS.MAX_SPEED` — 900
- `PHYSICS.MAX_ROTATION_SPEED` — 2.6 (cruise yaw); `YAW_FAST_MULT` — 1.65
- `PHYSICS.PRECISION_ENGAGE_SPEED` — 100 (engage gate + active speed cap)
- `SHIP.TURRET_SLEW_RATE` / `MINING_LASER_SLEW_RATE` — 5.5 / 4.5
- `SHIP.SPAWN_ANGLE` — north (−π/2)
- `HANGAR.ZOOM_*` / `PLAYER_PAD_X` — Home Base hangar camera + B2 dock
- `CAMERA.ZOOM_MIN/MAX` — 0.4 / 2.0
- `WORLD.CHUNK_SIZE` — 2000
- `WORLD.LOAD_RADIUS` / `UNLOAD_RADIUS` — 3 / 5

## Controls

| Input | Action |
|-------|--------|
| WASD | Maneuvering thrusters (double-tap hold = burst) |
| Q / E | Yaw (double-tap hold = fast / Precision near-default) |
| Space | Main engine (warm-up in Precision) |
| Shift | Afterburner (disabled in Precision) |
| Alt | Smart space brakes (Alt+QWEASD blocked from browser menu chords while playing) |
| Caps Lock | Precision desire (engage when slow; active = speed-capped) |
| LMB | Fire dorsal turret (pointer in circle; slews to aim) |
| RMB | Mining laser (pointer in circle; slews within arc) |
| Scroll | Zoom |
| ESC | Pause / resume |
| Fullscreen btn | Enter/exit fullscreen (Systems panel or pause menu) |

## Conventions for contributors

- Match existing module style: one class/export per file, relative `.js` imports
- Keep diffs minimal; don't add dependencies without discussion
- Update `CHANGELOG.md` for user-visible changes
- Update `GDD.md` when design intent changes; update this file when architecture or handoff facts change
- On **commit and push**, the agent checks whether handoff docs need a sync and asks before including those updates (see `.cursor/rules/hyperdrift.mdc`)

## Known gaps / next steps

- Home Base: B2 player-request job queue still future; interim B2 uses the same captain checklist as B1/B3 (reroll 10–60s after complete; player owns launch) — see `GDD.md`
- **Ship component Mk variants** (hull, fuel, weapons, etc.): board shows random Mk 1–3 labels + size-based cargo Mk ladder only — lock real tiers / effects later (`OPEN_QUESTIONS.md` §12)
- Ship silhouette / hardpoint design pass (hangar is ready for close inspection)
- Asteroids destroy but don't fragment into smaller pieces yet
- No fuel consumption on afterburner
- Corner panels (Radar, Weapons, Navigation) are empty shells
- Settings beyond controls sandbox (audio/graphics bindings)

## Resuming in a new chat

Say something like:

```
Let's continue
```

or:

```
Continue Hyperdrift. Catch up from the docs.
```

Project rules tell the agent to read `PROJECT.md`, recent `CHANGELOG.md`, and design docs as needed before coding. For design-only sessions, also mention VISION / OPEN_QUESTIONS.

On **commit and push**, the agent checks whether handoff docs look stale and asks before updating them; then commits and pushes.