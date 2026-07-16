# Hyperdrift — Project Handoff

Browser-based 2D spaceflight prototype. Top-down semi-Newtonian physics, procedural infinite universe, HTML5 Canvas. **No build step** — ES modules served over HTTP.

> **Not the game design doc.** See [`GDD.md`](GDD.md) for prototype mechanics. See [`VISION.md`](VISION.md) for long-term vision (*Stranger in the Galaxy*). See [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) for unresolved decisions. This file is for developers and AI agents resuming work.

## Run

**Easiest:** double-click [`start-game.bat`](start-game.bat) in the project folder. It starts a local server, **waits until the page is actually ready**, then opens your browser.

Uses `start-game.ps1` under the hood so Python is found reliably when launched from Explorer (not only from a dev terminal). Serves via `dev-server.py` with **no-cache** headers (plain `http.server` can leave browsers stuck on old JS modules). Title screen bottom-left shows **vX.Y.Z · Last edit:** from `/build-info.json` (version in `src/version.js`, newest project file mtime), plus an underlined **Changelog** link that opens `CHANGELOG.md` newest-first.

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
    Ship.js, ShipController.js, ShipHardpoints.js (legacy mount fallback; starter matches)
    Projectile.js, Asteroid.js, Particle.js, Entity.js, EntityManager.js
  ships/
    ShipClasses.js, Themes.js, ThemeSkin.js, SectionCatalog.js, ItemCatalog.js
    ShipAttach.js,     ShipDefinition.js, ShipGenerator.js, ShipViews.js, ShipRenderer.js, PlumeDraw.js
    data/visualTuning.js, data/mountLayouts.js   Dev bake targets
    index.js              Modular ship public API
  dev/
    DevTools.js, DevSave.js, DevOverlay.js, BlueprintAuthoring.js, HangarLayoutEditor.js
  world/
    hangar-layout.js      Flavor props / linger / gossip (Dev bake target)
    Starfield.js          7 parallax star layers (screen-fixed size, tiled when zoomed out)
    NebulaField.js        3 depth layers + ambient procedural nebulae
    SpeedStreaks.js       Velocity-opposed foreground streaks (screen-space)
    HangarBay.js          Home Base hangar (fixed crew, boards, door tickers, logistics)
    HangarVisitorShips.js Modular hangar visitors (generateVisitor + ShipRenderer; locked shipDef)
    AmbientTrafficSystem.js Near-station traffic + always-on cops; off-screen spawn/despawn
    Station.js            Jennings Station overworld exterior + dock zones
  utils/
    MathUtils.js, SeededRandom.js
```

## Architecture principles

- **Modular systems** wired by `GameEngine` — extend via new systems/entities, not monolith edits
- **Chunk-based world** — deterministic seeds, load radius 3, unload radius 5 (`WORLD` in Constants)
- **Thruster visuals driven by modular mounts** — equipped `mainEngine` / `maneuverThruster` items only (`PlumeDraw.js`); same path for player, hangar visitors, and ambient traffic; intensity from physics thruster bag
- **Plume flow** (`computePlumeFlow`) — leading cue/wash + crosswind lean from relative wind (`−velocity`); trailing stretch; ship-local particles on the player, world-space on visitors/ambient
- **Modular ships** — `src/ships/`: swap groups, full section/item ID matrix (parametric), `createPlayerStarter()`, shared `ShipRenderer` (top-down + 16 angled views)
- **Modes** — `title` (drifting backdrop), `playing` (flight), `hangar` (Jennings Station / Home Base), `controls` (ship-only settings sandbox), `blueprint`
- **Future modes (vision)** — `shipInterior` / `derelict` (shared 2.5D walker), `dialogue` (portrait overlay); see [`VISION.md`](VISION.md) Presentation Layers
- **Future-ready** for multiple ships, AI, trading, mining, missions, Home Base launch/extract, narrative runtime, networking, save/load

## Current implementation status

| Area | Status |
|------|--------|
| Semi-Newtonian flight (WASD, Q/E yaw, main engine, afterburner, brakes) | Done |
| Double-tap-hold burst on QWEASD; Caps Lock Precision (engage gate + active speed cap) | Done |
| Space brakes snap to rest below velocity threshold; retro-burn when nose-into-velocity | Done |
| Mouse aims weapons inside viewport circle (cursor always visible); turret/laser slew | Done |
| 8 blue maneuver thrusters + orange main engine (hardpoint-driven plumes) | Done |
| Plume flow: leading flatten + crosswind lean (AoA/speed readable in flames) | Done |
| Multi-section modular ship (Generalist Mid Mk2 starter = bell BOM from catalog) | Done (hull-aligned hardpoints + Mk-scaled flush thrusters; theme finish skins + 2.5D extrude polish) |
| Ship-local exhaust particles; camera tracks post-physics pose | Done |
| Dorsal 360° combat turret (LMB, 3/s) + nose mining laser (RMB) | Done |
| Circular viewport + corner UI placeholders | Done |
| Title screen (ENTER HANGAR / QUICK LAUNCH / SETTINGS; version stamp) | Done |
| Home Base hangar (Jennings Station; B1–B3; launch + land sequences) | Random player bay; free-look pan camera; modular visitors on the other two; Dev Bay Options; 2.5D elevator shaft; title elevator raise; **ships draw in angled 2.5D** |
| Jennings Station overworld exterior + dock prompt | Done |
| Ambient space traffic (modular; cops always near station; off-screen spawn/despawn) | Done (v0.1.150–154); further tuning OK |
| Settings controls sandbox (ship-only viewport) | Done |
| Blueprint (player Upgrade UI + Dev Author) | Done — always available; Dev Mode adds mount drag / tuning Save |
| Dev Mode drawer + hangar layout editor + bake-back | Done (v0.1.159); Bay Options panel (v0.1.160) |
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
- `HANGAR.ZOOM_*` / `SIDE_PAD_X` / `PAD_R` — Home Base hangar camera + pad layout (pad disc r=38); player bay via `hangarPadX(i)`
- `PAD_MK_RADIUS` — Mk1/Mk2/Mk3 pad discs (Mk2 = hangar; Blueprint background rings)
- `CAMERA.ZOOM_MIN/MAX` — 0.4 / 2.0
- `BLUEPRINT.ZOOM_MIN/MAX` — 1.2 / 22 (dev ship sandbox)
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

### Polish / follow-ups
- **Thruster cup size** — tune via Blueprint Author sliders / `visualTuning.js` (still subjective)
- **Hardpoint / plume mounts** — author in Blueprint + Dev Mode; bake to `mountLayouts.js`
- **Hangar visitor size polish** — peer-Mk spawn exists; verify same-group visitors ≈ player size
- Ambient miner asteroid damage (visual cue only today)

### Shipped recently (context)
- **v0.1.172** Mount-driven thruster/engine FX parity (player = visitor = ambient)
- **v0.1.171** Elevator pad 180° turn on descent only (rise keeps heading)
- **v0.1.170** Elevator fade-to-black feathered (no hard veil circle)
- **v0.1.169** Elevator pad+ship fade-to-black (not transparent)
- **v0.1.168** Elevator ships fade with the pad (no mid-shaft pop)
- **v0.1.167** Hangar weapon deck-glow at muzzle tip (not player pad); smaller wash
- **v0.1.166** Hangar select control: turret aim, visitor weapons, visitor exhaust not on player
- **v0.1.165** Pad active highlight = Dev control target; removed EMPTY + cyan outline
- **v0.1.164** Hangar LMB pan + fire together again (deselect to stop shooting)
- **v0.1.163** Visitor thruster isolation; player weapons
- **v0.1.162** Hangar ship select/control (player + visitors); full player Door/Elev Dev scenes
- **v0.1.161** Hangar free-look pan camera; random player bay (B1–B3); player ops no longer hardcoded to B2
- **v0.1.160** Dev Bay Options side menu (replaces hangar REROLL/ELEV strip); per-bay offline flag
- **v0.1.159** Dev Mode drawer, Blueprint player+Author, hangar layout editor, gossip circle, linger bay/facing, `/dev/save` bake-back
- Modular catalog + Blueprint (2D default, 2.5D side peeks, pads, reset, hardpoint **variant** picker)
- Hangar modular visitors; elevator shaft 2.5D; hangar ships angled 2.5D
- Ambient traffic near Jennings; plumes under hull

### Longer-term
- **Stranger subsystems** (not started) — narrative runtime (portraits + ambient barks), shared 2.5D interior explorer (`shipInterior` then `derelict`), station economy, bot companion — phased in [`VISION.md`](VISION.md)
- Unique art polish per Class×Section×Theme×Mk×variant (matrix is parametric templates today)
- Ship Upgrade UI economy / gated install (grows on player Blueprint — see [Dev blueprint mode](#dev-blueprint-mode))
- Home Base: B2 player-request job queue still future; interim B2 uses the same captain checklist as B1/B3 — see `GDD.md`
- **Hangar mount install choreography** — weld-detach → crane removes old turret → crane places new from staging → weld-seat (see `GDD.md` cargo hardpoints); today’s strip/install is interim
- Hangar layout editor follow-ups (undo/redo, snap) — MVP shipped; see [Hangar room editor](#hangar-room-editor)
- Mega-capable hangar bays → **Heavy** group needs **Mk3** pads (none at Jennings yet; Heavy twins are space-only)
- Hand-art polish for select hero variants (parametric silhouettes cover all classes now)
- Asteroids destroy but don't fragment into smaller pieces yet
- No fuel consumption on afterburner
- Corner panels (Radar, Weapons, Navigation) are empty shells
- Settings beyond controls sandbox (audio/graphics bindings)

## Dev Mode + Blueprint + Hangar editor

**Dev Mode** (Settings toggle, default on): floating **DEV** drawer (` key) — sim speed, inspect, overlays, hangar-edit entry, **Bay Options** side menu (multi-bay Service/Door/Elev/Pad/Empty·Occupy/On·Off/Reset). Bake via `POST /dev/save` (allowlisted paths) or clipboard Export.

**Data files (machine-editable):**
- `src/ships/data/visualTuning.js` — cup / plume / generic engine class scale
- `src/ships/data/mountLayouts.js` — unit-space bell + ultra mounts
- `src/world/hangar-layout.js` — flavor props, linger (bays/face/slack), gossip, yard props

## Dev blueprint mode

**Status:** Player Upgrade UI (always) + Dev Author panel when Dev Mode on (v0.1.159).

**Entry:** Title **BLUEPRINT** · Hangar **BLUEPRINT** (not Dev-gated).

**Player:** Group/Class, section Theme/Color/Mk/Variant, mount roster variant cycler, view/live controls, **Apply to ship**.

**Dev Author (same view):** drag hardpoints, scroll-rotate selected, tuning sliders, **Save mounts/tuning** to repo.

**Layout:** The play **circle is sacred** — chrome is **viewport-aligned** to it. Left/right docks hug the circle; inspector below.

**Pad Mk:** UltraLight+Light → Mk1, Standard → Mk2, Heavy → Mk3. Background pad rings + drafting field.

### Follow-ups
- Per-hardpoint **item category** swap (today: variant only)
- Economy / gated install fantasy on this surface
- True unique art per angled heading

## Hangar room editor

**Status:** Flavor MVP shipped (v0.1.159). Structural sim (doors, pads, piles, crane, danger lanes) stays code-owned.

**Entry:** Dev drawer → **Edit layout** (hangar only). Freezes crew; palette add / delete / copy / 8-dir rotate; linger bay multi-select + face arrow/slack; gossip capacity; **Save layout**.

### Follow-ups
- Undo / redo, snap-to-grid, multi-select
- Stronger warn/block on road / danger / door corridor

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