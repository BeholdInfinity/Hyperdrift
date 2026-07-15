# Hyperdrift — Project Handoff

Browser-based 2D spaceflight prototype. Top-down semi-Newtonian physics, procedural infinite universe, HTML5 Canvas. **No build step** — ES modules served over HTTP.

> **Not the game design doc.** See [`GDD.md`](GDD.md) for prototype mechanics. See [`VISION.md`](VISION.md) for long-term vision (*Hyperdrift Crewline*). See [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) for unresolved decisions. This file is for developers and AI agents resuming work.

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
    ShipAttach.js, ShipDefinition.js, ShipGenerator.js, ShipViews.js, ShipRenderer.js
    index.js              Modular ship public API
  world/
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
- **Thruster visuals driven by physics** — eight blue maneuvering thrusters + orange main engine; mounts from modular `ship.shipDef` (starter = bell BOM); exhaust is ship-local; camera pose must match post-physics ship
- **Plume flow** (`Renderer._computePlumeFlow`) — leading cue/wash + crosswind lean from relative wind (`−velocity`) so plumes read AoA and speed; trailing stretch; ship-local particles
- **Modular ships** — `src/ships/`: swap groups, full section/item ID matrix (parametric), `createPlayerStarter()`, shared `ShipRenderer` (top-down + 16 angled views)
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
| Multi-section modular ship (Generalist Mid Mk2 starter = bell BOM from catalog) | Done (hull-aligned hardpoints + Mk-scaled flush thrusters; theme finish skins + 2.5D extrude polish) |
| Ship-local exhaust particles; camera tracks post-physics pose | Done |
| Dorsal 360° combat turret (LMB, 3/s) + nose mining laser (RMB) | Done |
| Circular viewport + corner UI placeholders | Done |
| Title screen (ENTER HANGAR / QUICK LAUNCH / SETTINGS; version stamp) | Done |
| Home Base hangar (Jennings Station; B1–B3; launch + land sequences) | Bay + launch/land; modular B1/B3 visitors; Dev REROLL B1/B3; 2.5D elevator shaft; title B2 elevator raise |
| Jennings Station overworld exterior + dock prompt | Done |
| Ambient space traffic (modular; cops always near station; off-screen spawn/despawn) | Done (v0.1.150–154); further tuning OK |
| Settings controls sandbox (ship-only viewport) | Done |
| Dev Blueprint mode (modular ship sandbox; Dev Mode) | Done (2D default; 2.5D side peeks; pad Mk + Mk4 tease; hardpoint variant picker; Upgrade UI later) |
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
- `HANGAR.ZOOM_*` / `PLAYER_PAD_X` / `PAD_R` — Home Base hangar camera + B2 dock (pad disc r=38)
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

### Incomplete from 2026-07-15 session (do these first)
- **UltraLight engines** — `drawGenericEngine` ignores `classScale`; engines dwarf UltraLight hulls
- **Thruster cup size** — bump past `THRUSTER_CUP_SCALE` 1.5 (still hard to see)
- **Hardpoint / plume mounts** — re-align to post-scale hull geometry (`SectionGeometry` + legacy `ShipHardpoints`)
- **Hangar visitor size polish** — peer-Mk spawn exists; verify same-group visitors ≈ player size
- Ambient miner asteroid damage (visual cue only today)

### Shipped recently (context)
- Modular catalog + Dev Blueprint (2D default, 2.5D side peeks, pads, reset, hardpoint **variant** picker)
- Hangar modular visitors (no theme strobe); Dev **REROLL B1/B3**; elevator shaft shares 2.5D depth curve
- Ambient traffic near Jennings: seeded cops always on station, sparse peers, off-screen spawn/despawn
- Plumes draw under hull (player path)

### Longer-term
- Unique art polish per Class×Section×Theme×Mk×variant (matrix is parametric templates today)
- Ship Upgrade UI (grows out of Dev Blueprint mode — see [Dev blueprint mode](#dev-blueprint-mode))
- Home Base: B2 player-request job queue still future; interim B2 uses the same captain checklist as B1/B3 — see `GDD.md`
- **Hangar room / set-dressing editor** — see [Hangar room editor (planned)](#hangar-room-editor-planned)
- Mega-capable hangar bays → **Heavy** group needs **Mk3** pads (none at Jennings yet; Heavy twins are space-only)
- Hand-art polish for select hero variants (parametric silhouettes cover all classes now)
- Asteroids destroy but don't fragment into smaller pieces yet
- No fuel consumption on afterburner
- Corner panels (Radar, Weapons, Navigation) are empty shells
- Settings beyond controls sandbox (audio/graphics bindings)

## Dev blueprint mode

**Status:** Live controls + pad rings + drafting field + HUD docks + per-hardpoint variant picker (v0.1.149) — Dev Mode only; seeds the future player Ship Upgrade UI.

**Entry:** Title **BLUEPRINT (DEV)** (visible when Dev Mode on) · Hangar Dev panel **BLUEPRINT**.

**Layout:** The play **circle is sacred** — chrome is **viewport-aligned** to it (not the screen edges). Left/right docks hug the circle; title sits above; selection inspector matches circle width below. Dock width / inspector height come from measured black gutters and reflow (wide → compact → narrow) as resolution changes.

**Hierarchy:** **Group** → **Class**, then a **card per section** (click to select / inspect; Theme / Color / Mk / Variant each). Group/Class rebuild the ship; section cosmetics swap that role’s catalog cell in place. Camera: **Mode** (2D / 2.5D) and **Heading** (compass, tracks live yaw). **Exploded view**; rotate / auto-spin; **Live controls** (hangar-style thruster/weapon anims, no flight translation; auto-spin off while live). **Apply to ship** writes the definition onto the live player (hangar) or the next hangar/flight session (from title).

**Mount roster (right dock):** every resolved hardpoint (`ShipDefinition.resolveMounts()`) gets a row with its key, category/face, Mk, and a **Variant** (a/b/c) cycler — `BlueprintSandbox.cycleHardpointVariant(def, key, dir)` swaps just that hardpoint's mounted item to the next/prev catalog variant (same category/swapGroup, item's current theme + Mk) via `ItemCatalog.listItems` + `ShipAttach.canAttachItem`, independent of the owning section's Theme/Color/Mk/Variant. Empty optional sockets (e.g. unequipped chin laser) show disabled controls. Overrides live in `def.equipment` so they survive section edits and **Apply to ship** (`cloneShipDef`); **Random** / **Reset to default** build a fresh `ShipDefinition` and naturally clear them.

**Pad Mk:** shown in status / inspector; docking rules live on swap groups (UltraLight+Light → Mk1, Standard → Mk2, Heavy → Mk3). Viewport background: concentric pad rings (`PAD_MK_RADIUS` Mk1=22 / Mk2=`HANGAR.PAD_R` 38 / Mk3=80; current group emphasized) with a drafting grid + radial construction lines **outside** the outermost pad. Class `scale` sized so ships fill their pad (starter bell applies scale).

### Follow-ups
- Per-hardpoint **item category** swap (today: variant only — item theme/Mk still follow the section/mount default; category stays fixed to the socket)
- True unique art per angled heading (today: parametric Y foreshorten + heading-aware side peeks on the same mesh)
- Player-facing Upgrade UI (economy, checklist install) built on this surface
- Optional export / copy definition IDs

## Hangar room editor (planned)

**Intent:** Give the designer full hands-on control of the little details that make the hangar feel lived-in — prop placement, rotation, linger stands, gossip spots — without asking an agent to nudge coordinates in chat.

**Division of labor (explicit):**
- **With AI:** bay / logistics *function* (jobs, pathing, checklist, crane/fork/mech behavior) and *look* of characters / major assets (draw passes, themes, silhouettes).
- **Human in editor:** set dressing density, asymmetry, prop facing, linger and hangout points — the micro-composition that reads as a real workplace.

Props and linger data are already mostly declarative (`HANGAR_PROPS`, `FORKLIFT_YARD_PROPS`, gossip waypoints in `HangarBay.js`). An editor is UI + save/load on top of that, not a new simulation.

### Recommended MVP
- Enter hangar **edit mode** (sandbox-style; pause or freeze crew jobs while editing)
- **Select / drag** existing prop kinds; **rotate** in 8-dir facing (same octants as draw)
- **Palette place / delete** for current prop kinds (workbench, terminal, racks, yard gear, etc.)
- Edit **linger stand points** and **gossip waypoints** as visible markers (drag, add, remove, capacity if shown)
- **Done** saves layout for the next hangar load — prefer writing `src/world/hangar-layout.json` (or similar) via a small `dev-server.py` POST endpoint so refresh + git both work; `localStorage` only as a fallback, not the primary path
- Soft guards: tint / block drops on forklift road, bay danger lanes, and pad flight paths (warn, don’t silently allow bad placement)

### Recommended follow-ups (after MVP)
- Undo / redo, snap-to-grid, multi-select
- “Copy as JS constants” backup if JSON load is disabled
- Layer toggles (deck props / yard / linger / gossip / structural ghost)
- Do **not** move structural sim geometry in v1 (pads, pile hardpoints, crane rails, door paths) — those stay code-owned until pathing is ready for authored overrides

### Out of scope for first editor
- Full spritesheet art pipeline
- Editing ship silhouettes or flight FX
- Multi-user / cloud layout sync

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