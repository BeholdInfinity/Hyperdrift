# Hyperdrift — Project Handoff

Browser-based 2D spaceflight prototype. Top-down semi-Newtonian physics, procedural infinite universe, HTML5 Canvas. **No build step** — ES modules served over HTTP.

> **Not the game design doc.** See [`GDD.md`](GDD.md) for prototype mechanics. See [`VISION.md`](VISION.md) for long-term vision (*Hyperdrift Crewline*). See [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) for unresolved decisions. This file is for developers and AI agents resuming work.

## Run

```powershell
cd hyperdrift
python -m http.server 8080
```

Open http://localhost:8080 → click **LAUNCH**.

## Tech stack

- Vanilla JavaScript (ES6+ modules)
- HTML5 Canvas + CSS
- No npm dependencies

## Repository layout

```
index.html, styles.css
src/
  main.js                 Entry point, UI wiring
  core/
    GameEngine.js         Main loop, system orchestration, pause
    Constants.js          Physics, camera, ship tuning
  systems/
    InputSystem.js        Keyboard, mouse, wheel, fullscreen, ESC pause
    PhysicsSystem.js      Forces, braking, rotation
    CameraSystem.js       Offset, zoom (manual + speed-based)
    Renderer.js           Circular viewport, ship, thrusters, entities
    WeaponSystem.js       Energy cannon, collisions, impacts
    AsteroidSystem.js     Chunk load/unload
    ProceduralGeneration.js  Seeded asteroids + nebulae
  entities/
    Ship.js, ShipController.js, Projectile.js, Asteroid.js
    Particle.js, Entity.js, EntityManager.js
  world/
    Starfield.js          5 parallax star layers
    NebulaField.js        3 depth layers + ambient procedural nebulae
    SpeedStreaks.js       Velocity-opposed foreground streaks
  utils/
    MathUtils.js, SeededRandom.js
```

## Architecture principles

- **Modular systems** wired by `GameEngine` — extend via new systems/entities, not monolith edits
- **Chunk-based world** — deterministic seeds, load radius 2, unload radius 4 (`WORLD` in Constants)
- **Thruster visuals driven by physics** — `ship.thrusters` state mirrors applied forces
- **Future-ready** for multiple ships, AI, trading, mining, missions, networking, save/load

## Current implementation status

| Area | Status |
|------|--------|
| Semi-Newtonian flight (WASD, main engine, afterburner, brakes) | Done |
| Mouse aim + visible cursor (no pointer lock) | Done |
| RCS rotation thruster visuals | Done |
| Energy cannon (hold fire) | Done |
| Circular viewport + corner UI placeholders | Done |
| Procedural asteroids + nebulae | Done |
| 5-layer starfield, 3-layer nebulae | Done |
| Speed streaks (velocity-opposed) | Done |
| Camera lead offset + scroll zoom + speed zoom | Done |
| Fullscreen button + pause menu (ESC) | Done |
| Sound, fuel, fragmentation, minimap, settings | Not started |

## Key tuning (`src/core/Constants.js`)

- `PHYSICS.MAX_SPEED` — 900
- `CAMERA.ZOOM_MIN/MAX` — 0.4 / 2.0
- `WORLD.CHUNK_SIZE` — 2000

## Controls

| Input | Action |
|-------|--------|
| WASD | Maneuvering thrusters (aft/nose/port/starboard) |
| Space | Main engine |
| Shift | Afterburner |
| Ctrl | Smart space brakes |
| Mouse | Aim + fire |
| Scroll | Zoom |
| ESC | Pause / resume |
| Fullscreen btn | Enter/exit fullscreen (Systems panel or pause menu) |

## Conventions for contributors

- Match existing module style: one class/export per file, relative `.js` imports
- Keep diffs minimal; don't add dependencies without discussion
- Update `CHANGELOG.md` for user-visible changes
- Update `GDD.md` when design intent changes; update this file when architecture or handoff facts change

## Known gaps / next steps

- Settings and Return to Main Menu are UI placeholders
- Asteroids destroy but don't fragment into smaller pieces yet
- No fuel consumption on afterburner
- Corner panels (Radar, Weapons, Navigation) are empty shells

## Resuming in a new chat

```
Continue Hyperdrift. Read PROJECT.md. For design work, also read VISION.md and OPEN_QUESTIONS.md.
```
