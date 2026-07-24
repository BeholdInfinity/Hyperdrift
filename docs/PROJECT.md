# Hyperdrift — Project Handoff

Browser-based 2D spaceflight prototype. Top-down semi-Newtonian physics, procedural infinite universe, HTML5 Canvas. **No build step** — ES modules served over HTTP.

> **Not the game design doc.** See [`GDD.md`](GDD.md) for prototype mechanics. See [`VISION.md`](VISION.md) for long-term vision (*Stranger in the Galaxy*). See [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) for unresolved decisions. This file is for developers and AI agents resuming work.

## Run

**Easiest:** double-click [`StartStopGame/start-game.bat`](../StartStopGame/start-game.bat). It starts a local server, **waits until the page is actually ready**, then opens your browser.

Uses `StartStopGame/start-game.ps1` under the hood so Python is found reliably when launched from Explorer (not only from a dev terminal); the script serves from the repo root (one level up from `StartStopGame/`). When Windows Terminal is present, the `.bat` launchers call `wt.exe` by full path (it's often not on PATH) and route into one shared window named `hyperdrift` with named tabs (**Hyperdrift Server** / **Hyperdrift Stop**) instead of a new window each time; they fall back to the classic console if Windows Terminal is missing. Stop logic lives in `StartStopGame/stop-game.ps1`. Serves via `dev-server.py` with **no-cache** headers (plain `http.server` can leave browsers stuck on old JS modules). Title runs the live Jennings Station space sim as a bokeh-blurred backdrop with a *Stranger in the Galaxy* wordmark + showcase ship overlay (`src/ui/TitleScreen.js`; logo PNG is concept art). Bottom-left shows **vX.Y.Z · Last edit:** from `/build-info.json` (version in `src/version.js`, newest project file mtime), plus an underlined **Changelog** link that opens `CHANGELOG.md` newest-first.

**Manual:**

```powershell
cd hyperdrift
python dev-server.py 8080
```

(Or `python -m http.server 8080` — but prefer `dev-server.py`, which disables browser caching of JS modules so code edits show up on refresh.)

Open http://localhost:8080 → click **LAUNCH**.

**Stop the server:** close the black command window, press **Ctrl+C** in it, or double-click [`StartStopGame/stop-game.bat`](../StartStopGame/stop-game.bat).

Note: `start-game.bat` waits for the server to respond before opening the browser. If port 8080 has a stuck process, it clears only **unresponsive** listeners.

## Tech stack

- Vanilla JavaScript (ES6+ modules)
- HTML5 Canvas + CSS
- No npm dependencies

## Repository layout

```
index.html, styles.css, dev-server.py
README.md                 Top-level entry point + doc map
docs/                     Handoff docs: PROJECT.md, CHANGELOG.md, GDD.md, VISION.md, OPEN_QUESTIONS.md
StartStopGame/            Launchers: start-game.bat/.ps1, stop-game.bat/.ps1 (shared wt tabs; serve from repo root)
assets/branding/          Brand exports (logo PNG concept; title uses live sim + wordmark)
InspirationImages/        Reference art (logo concept, hero shots)
src/
  loadErrorOverlay.js Boot failure UI (module import / GameEngine init; copy-friendly error panel)
  main.js                 Entry point, UI wiring
  version.js              Prototype semver (title stamp + build-info)
  textures/
    strangerBronzePlate.js  Procedural STRANGER bronze plate paint (title letter windows)
  ui/
    TitleScreen.js        Title wordmark + 2.5D starter ship
    title-layout.js       Bakeable title framing (camera / type / ship / menu / bokeh)
    TitleLayoutRuntime.js Live apply + reset helpers for Title Layout Dev panel
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
    RadarSystem.js          Radar model: contacts, sweep-gated paints, piecewise pip range + SCAN plot-zoom, age fade, selection
    RadarDisplay.js         Radar ring/scope renderer (silhouettes, IFF, sweep, nose/tail, chevrons)
    ViewportTelemetry.js  Viewport speed + contact/POI/nav distance labels (collision-aware layout)
    CockpitFrame.js       Cached 16:9 steel/copper HUD chrome + POI rim dots + corners (TL ZOOM · TR TELEMETRY · BL MODES · BR STATUS)
    CockpitPanels.js      Live content for the 6 cockpit screens + CONTACTS filters + PIPS/LOADOUTS + status alert overlay
    TelemetryCorner.js    TELEMETRY + ZOOM corner readouts (nav + viewport/radar scale)
    SectorMapView.js      Sector map pan/zoom/follow + screen↔world mapping
    SectorMapPanel.js     LIVE / TRAVEL LOG map draw + travel log UI
    PipSystem.js          Global power-pip pool (set/clear/apply loadout, generator cap)
    PipLoadouts.js        Saved pip presets (max 12, active link, lock/rename)
    PipLoadoutPanel.js    POWER LOADOUTS tab (apply, hover diff, delete modal)
  entities/
    Ship.js, ShipController.js, ShipHardpoints.js (legacy mount fallback; starter matches)
    Projectile.js, Asteroid.js, Particle.js, Entity.js, EntityManager.js
  ships/
    ShipClasses.js, Themes.js, ThemeSkin.js, SectionCatalog.js, ItemCatalog.js
    ShipAttach.js,     ShipDefinition.js, ShipGenerator.js, ShipViews.js, ShipRenderer.js, PlumeDraw.js
    data/visualTuning.js, data/mountLayouts.js   Dev bake targets
    index.js              Modular ship public API
  dev/
    DevTools.js, DevSave.js, DevOverlay.js, DevPanelDrag.js, BlueprintAuthoring.js, HangarLayoutEditor.js, DevSectorEditor.js
  world/
    hangar-layout.js      Flavor props / linger / gossip (Dev bake target)
    place/                Place → Area → Feature registry (stations, ships, outposts, vessels)
    Starfield.js          7 parallax star layers (screen-fixed size, tiled when zoomed out)
    NebulaField.js        3 depth layers + ambient procedural nebulae
    SpeedStreaks.js       Velocity-opposed foreground streaks (screen-space)
    HangarBay.js          Thin barrel → hangar/ (import path unchanged)
    hangar/               Hangar sim modules (split from monolith HangarBay)
      constants.js        BAY, ROW_Y, tuning, zoom exports
      layout.js           Pad centers, sidePadX, pile grid, module init
      cargoCatalog.js     Cargo/hold/service helpers
      helpers.js          rand, pick, thrusterActivity, etc.
      HangarBay.js        Core class + update() orchestrator
      HangarRender.js     render* / _draw* prototype mixin
      CraneSim.js         Crane sim prototype mixin
      ForkliftAI.js       Forklift AI prototype mixin
      MechanicAI.js       Mechanic + weld FX prototype mixin
      VisitorTraffic.js   Visitor traffic + service prototype mixin
      CrewShared.js       Shared crew movement/heading helpers
    ServiceBoard.js       Pad status board service checklist (row layout, scroll, column draw)
    HangarVisitorShips.js Modular hangar visitors (generateVisitor + ShipRenderer; locked shipDef)
    AmbientTrafficSystem.js Near-station traffic + always-on cops; off-screen spawn/despawn
    NpcPilot.js           Shared Newtonian thruster pilot (holds, police hex, ambient burns)
    Station.js            Jennings Station overworld exterior + dock zones
    PoiSystem.js          POI address book + discovery (4 sources)
    NavRoute.js           Ephemeral multi-stop nav route queue
    NavPersistence.js     localStorage POI Book + Travel Log + Pip Loadouts + Nav Route (v3)
    SectorMap.js          Expedition fog-of-war + trail sampling
    TravelLog.js          Archived expedition trails (rename, lock, map overlays)
    SectorLayout.js       Ring sampling + composition for proc gen
    data/sectorLayout.js  Baked planet + rings + fixed POIs (Dev save target)
  utils/
    MathUtils.js, SeededRandom.js
```

## Architecture principles

- **Modular systems** wired by `GameEngine` — extend via new systems/entities, not monolith edits
- **Place → Area → Feature** — top-level hosts are Places (`station` | `capitalShip` | `outpost` | `vessel`), not “the hangar” singleton. Hangars are `areaType: 'hangar'` with bay Features; shops/bars/farms/decks are stub area types. Stable string IDs; look shells inherit place → area → feature (condition, tech, theme). See `src/world/place/`.
- **Chunk-based world** — deterministic seeds, load radius 3, unload radius 5 (`WORLD` in Constants)
- **Hangar sim LOD (space)** — Quick Launch and hangar→space both keep the hangar live; ticks by distance to the **closest human pilot** (`STATION.HANGAR_LOD_FULL_DIST` → full, lerp to `HANGAR_LOD_PAUSE_DIST` → pause). NPCs do not wake it. Hangar mode always full-rate. In space, empty-bay door fills request ambient runway approaches so mouth land/leave cadence matches hangar-side traffic. Multiplayer: extend `_humanPilotPositions()`.
- **Thruster visuals driven by modular mounts** — equipped `mainEngine` / `maneuverThruster` items only (`PlumeDraw.js`); same path for player, hangar visitors, and ambient traffic; intensity from physics thruster bag
- **Plume flow** (`computePlumeFlow`) — leading cue/wash + crosswind lean from relative wind (`−velocity`); trailing stretch; ship-local particles on the player, world-space on visitors/ambient
- **Modular ships** — `src/ships/`: swap groups, full section/item ID matrix (parametric), `createPlayerStarter()`, shared `ShipRenderer` (top-down + 16 angled views)
- **Mk2+ vessel interiors** — Place graph + simBindings (hull/fuel/ammo); enter when player-manned (space/hangar/unseat); crew ticks logistics in background; interior hull heal clamps to scar ceiling; exterior pad restore clears scars. Walker TBD (`shipInterior` mode).
- **Modes** — `title` (bokeh Jennings vignette + wordmark/ship), `playing` (flight), `hangar` (active Place hangar), `controls` (ship-only settings sandbox), `blueprint`
- **Future modes (vision)** — `shipInterior` / `derelict` (shared 2.5D walker), `dialogue` (portrait overlay); see [`VISION.md`](VISION.md) Presentation Layers
- **Future-ready** for multiple ships, AI, trading, mining, missions, Home Base launch/extract, narrative runtime, networking, save/load

## Current implementation status

| Area | Status |
|------|--------|
| Semi-Newtonian flight (WASD, Q/E yaw, main engine, afterburner, brakes) | Done |
| Double-tap-hold burst on QWEASD; Caps Lock Precision (instant; 33%/66% authority) | Done |
| Space brakes snap to rest below velocity threshold; retro-burn when nose-into-velocity | Done |
| Mouse aims weapons inside viewport circle (cursor always visible); turret/laser slew | Done |
| 8 blue maneuver thrusters + orange main engine (hardpoint-driven plumes) | Done |
| Plume flow: leading flatten + crosswind lean (AoA/speed readable in flames) | Done |
| Multi-section modular ship (Generalist Mid Mk2 starter = bell BOM from catalog) | Done (hull-aligned hardpoints + Mk-scaled flush thrusters; theme finish skins + 2.5D extrude polish) |
| Ship-local exhaust particles; camera tracks post-physics pose | Done |
| Dorsal 360° combat turret (LMB, 3/s) + nose mining laser (RMB) | Done |
| Circular viewport + corner UI placeholders | Done |
| Title screen (bokeh-blurred Jennings sim + *Stranger* wordmark/ship; ENTER HANGAR / QUICK LAUNCH / SETTINGS / BLUEPRINT; version stamp) | Done |
| Home Base hangar (Jennings Station; B1–B3; launch + land sequences) | Place-hydrated kit; random player bay; free-look pan; modular visitors; Dev Bay Options + **Place** composer; 2.5D elevator; title elevator raise; **ships draw in angled 2.5D** |
| Place → Area → Feature registry (stations / capital / outpost / vessel) | Groundwork (v0.1.232); hangar first; other rooms stubbed; vessel interior contract + Dev tests |
| Jennings Station overworld exterior + dock prompt (4× scale via `STATION.SCALE`) | Done |
| Ambient space traffic (modular; police pack near station; thruster `NpcPilot`; police hex + racetrack hold) | Done (v0.1.275) |
| Settings controls sandbox (ship-only viewport) | Done |
| Blueprint (player Upgrade UI + Dev Author) | Done — always available; Dev Mode adds mount drag / tuning Save |
| Dev Mode drawer + hangar layout editor + bake-back | Done (v0.1.159); Bay Options panel (v0.1.160); bay unit spacing drag (v0.1.173); unified prop categories (v0.1.174); **Title Layout** panel (v0.1.243) |
| Procedural asteroids + nebulae | Done |
| 7-layer starfield, 3-layer nebulae | Done |
| Speed streaks (velocity-opposed, screen-space) | Done |
| Camera lead offset + scroll zoom + speed zoom | Done |
| Fullscreen button + pause menu (ESC; resume / settings / main menu) | Done |
| Sound, fuel, fragmentation, minimap | Minimap done (Sector Map + SCAN); sound/fuel/fragmentation not started |

## Key tuning (`src/core/Constants.js`)

- `PHYSICS.MAX_SPEED` — 900
- `PHYSICS.MAX_ROTATION_SPEED` — 2.6 (cruise yaw); `YAW_FAST_MULT` — 1.65
- `PHYSICS.PRECISION_THRUST_MULT` / `PRECISION_BURST_MULT` — 0.33 / 0.66 (Precision single / double-tap)
- `SHIP.TURRET_SLEW_RATE` / `MINING_LASER_SLEW_RATE` — 5.5 / 4.5
- `SHIP.SPAWN_ANGLE` — north (−π/2)
- `HANGAR.ZOOM_*` / `SIDE_PAD_X` / `PAD_R` — Home Base hangar camera + pad layout (pad disc r=38); player bay via `hangarPadX(i)`
- `PAD_MK_RADIUS` — Mk1/Mk2/Mk3 pad discs (Mk2 = hangar; Blueprint background rings)
- `CAMERA.ZOOM_MIN/MAX` — 0.1 / 2.0 (HUD label decoupled via `CameraSystem.displayZoom()`: internal `ZOOM_LABEL_ZERO`=0.1 shows as 0x, 1x=1x, 2x=2x)
- `BLUEPRINT.ZOOM_MIN/MAX` — 1.2 / 22 (dev ship sandbox)
- `WORLD.CHUNK_SIZE` — 2000
- `WORLD.LOAD_RADIUS` / `UNLOAD_RADIUS` — 3 / 5

## Controls

| Input | Action |
|-------|--------|
| WASD | Maneuvering thrusters (double-tap hold = burst; Precision 33% / 66%) |
| Q / E | Yaw (double-tap hold = fast / Precision 33% / 66%) |
| Space | Main engine (scaled to 33% in Precision) |
| Shift | Afterburner (allowed in Precision; scaled to 33%) |
| Alt | Smart space brakes (Alt+QWEASD blocked from browser menu chords while playing) |
| Caps Lock | Precision toggle (instant; fine-control flight) |
| R | ORIENT toggle — SHIP-up (head-up, default) ↔ NORTH-up |
| V | VIEW toggle — SHIP viewport (default) ↔ full radar SCAN scope |
| LMB | Fire dorsal turret (pointer in circle; slews to aim) |
| RMB | Mining laser (pointer in circle; slews within arc) |
| Scroll | Zoom |
| ESC | Pause / resume |
| Fullscreen btn | Enter/exit fullscreen (Systems panel or pause menu) |

## Conventions for contributors

- Match existing module style: one class/export per file, relative `.js` imports
- Keep diffs minimal; don't add dependencies without discussion
- **In-game UI over browser chrome** — player-facing confirms, renames, and text entry use **canvas HUD modals** on the relevant cockpit panel (copper frame, typed input via `InputSystem.modalTextCapture`, OK/CANCEL). Avoid `window.prompt` / `alert` / `confirm` in gameplay; title/pause DOM menus are the exception. **Boot failures** (module import / `GameEngine` init before the title loop runs) use `src/loadErrorOverlay.js`: a DOM error card + short `alert`, with **Copy error** for pasting into bug reports.
- Update `CHANGELOG.md` for user-visible changes
- Update `GDD.md` when design intent changes; update this file when architecture or handoff facts change
- On **commit and push**, the agent checks whether handoff docs need a sync and asks before including those updates (see `.cursor/rules/hyperdrift.mdc`)

## Known gaps / next steps

### Polish / follow-ups
- **Thruster cup size** — tune via Blueprint Author sliders / `visualTuning.js` (still subjective)
- **Hardpoint / plume mounts** — author in Blueprint + Dev Mode; bake to `mountLayouts.js`
- **Hangar visitor size polish** — peer-Mk spawn exists; verify same-group visitors ≈ player size
- Ambient miner asteroid damage (visual cue only today)

### Radar / Cockpit HUD follow-ups (post v0.1.284)
v0.1.283–284 shipped the radar/cockpit core (sector map, Travel Log, nav route queue, pip loadouts, MODES/ORIENT/VIEW, full SCAN scope, sweep paints, selection lock FX, visual-range viewport brackets). Remaining polish:
- **Thicken sensor-ring inner border** so visual contacts ride a thicker border matching the outer POI rim (today dots sit on the thin `viewportRadius` edge) — `src/systems/RadarDisplay.js` `_drawBand`, maybe `src/systems/Renderer.js`
- **Tier-based icon shrink** — blips shrink with distance only; also shrink per tier so more range bands fit — `src/systems/RadarSystem.js` (fold tier factor into `c.size`)
- ~~**Selected-POI distance in the viewport**~~ — shipped: `ViewportTelemetry.js` (POI + nav stop + contact ranges; visual contacts beside hull brackets)

Scaffolds that are API-only / stubs:
- **Highlight-sync API** (pilot/science/weapons) — not built; selection is local (`RadarSystem.selectedId`), no broadcast/subscribe hook for future officer/multiplayer screens
- **Comms panel** — HAIL/DOCK/TRADE/END buttons are no-ops (no call/receive/deny/hang-up); plan tags comms future, low priority — `src/systems/CockpitPanels.js` `_comms`
- **POI discovery channels** — proximity + **Shift+click** manual waypoints on Sector Map; `mission` / `purchase` still API-only
- **Dev RADAR drawer** — Mk / range / asteroid toggles + **Generator** slider (1–12 live test) + **Save generator default** bakes `PIPS.DEFAULT_GENERATOR_PIPS` to `Constants.js` via `/dev/save`. Fake-contacts spawner still not built — `index.html`, `src/main.js`

Cosmetic / lower priority:
- **Compass rose** — deferred; numeric HDG/CRS + 16-point cardinals in **TELEMETRY** corner; visual compass TBD on viewport radar rings or Sector Map
- **Ship Status is a list, not a schematic** — plan preferred a small ship-schematic damage map; `ship.status` is a stub (systems list, fuel, fires[], weapons) with placeholder values; nothing writes real damage/fuel/ammo yet — corner screen `_shipStatusCorner`, `GameEngine._ensureShipStatus`
- **Sector map doesn't emphasize the selected contact** — partial: map halos added; in-world highlight still open
- **No "objects"/debris contact type** — only asteroids fill the non-AI object slot (off by default; dev toggle on)
- **Station selection shows no top-down render** (station has no `shipDef`) — expected; add a station glyph if desired

**Not yet exercised live end-to-end:** clicking an in-world/band blip to select (ship kept leaving range), comms target population, and the fire/alert overlay (needs `ship.status.fires` populated). Recommended manual pass: hover near Jennings at low speed, select a band blip + a POI-rim dot, exercise pip loadouts (save/apply/partial apply via dev Generator at 3), and temporarily push a fake fire into `ship.status.fires` to verify the alert banner. Plan of record: `.cursor/plans/scanner_subsystem_roadmap_fe068679.plan.md` (do **not** edit the plan file).

### Shipped recently (context)
- **v0.1.285** TELEMETRY/ZOOM corner readouts; viewport target distances (contact / nav / POI); cockpit HUD layout + spill fixes; sector map footer + bearing format polish
- **v0.1.284** Nav route queue; pip loadouts + PIPS/STATUS rework; MODES corner (PREC/ORIENT/VIEW); scanner sweep paints + full SCAN + Mk5 tiers; sector map / Travel Log drawers; boot error overlay; WT shared launch tabs
- **v0.1.283** Scanner subsystem model + six live cockpit panels + POI ring + pip pool scaffold
- **v0.1.267** Title wordmark: locked pose; STRANGER bronze plate windows + smile arch; GALAXY nebula windows
- **v0.1.266** Mech travel facing: smooth turn-then-walk (no moonwalk / instant snaps)
- **v0.1.265** Bay mechs diversify job types; double-team only when one type left
- **v0.1.264** Welder stand-off: torch tip on hull/mount (not the grip)
- **v0.1.263** Nebula LO soft plate + baked sprites (kills woven dither)
- **v0.1.262** Unified nebula paint (title/hangar/space); sparse recipe kills dither weave
- **v0.1.261** Hangar door/window spacefield weave fix (peephole zoom sparsify)
- **v0.1.260** Title Layout wordmark+ship Offset Y (`markOffsetY`)
- **v0.1.259** Dev pop-out panel positions save/restore with Title/Hangar Save
- **v0.1.258** Title Blur > 0 keeps station (full-res capture → LO blur)
- **v0.1.257** Title/zoom-out woven grid: sparse starfield + nebula (less dither mesh)
- **v0.1.256** Title Blur 0 = sharp full-res; starfield zoom-out weave fix; bloom removed
- **v0.1.255** Title DoF: fix LO pixel-weave; blur/bloom independent of bokeh
- **v0.1.254** Dev pop-out panels draggable by title bar
- **v0.1.253** Title Layout Look X/Y range ±5000
- **v0.1.252** Dev drawer mode-scoped; Title Layout Blur/Bloom/Bokeh sliders
- **v0.1.251** Title bg-sim: gentler XY sine bob
- **v0.1.250** Title Layout zoom slider centered on 0.12 (0.02–0.22)
- **v0.1.249** Title bg-sim: gentler zoom bob; center at saved zoom 0.12
- **v0.1.248** Title DoF: restored LO dual-pass blur + bloom
- **v0.1.247** Title DoF: LO upsample only (no CSS blur/bloom)
- **v0.1.246** Title DoF: LO-res blur + upscale (fixes ~15 FPS title vs hangar)
- **v0.1.245** Top-right real FPS counter (rAF average; ignores sim-speed clamps)
- **v0.1.244** Title: remove showcase-ship flyaway cinematic; ENTER HANGAR / QUICK LAUNCH enter immediately
- **v0.1.243** Dev Title Layout panel — camera/type/ship/menu/bokeh sliders; Save → `title-layout.js`; Reset to last save
- **v0.1.242** Title: bokeh DoF backdrop; centerpiece afterburner takeoff on hangar/quick launch; GALAXY twinkles; softer STRANGER sweep
- **v0.1.241** Title wordmark: 2.5D default ship behind type (no swoosh); live Jennings sim backdrop unchanged
- **v0.1.240** Title: live Jennings space sim backdrop + wordmark/shooting-star overlay (camera bob + runway framing)
- **v0.1.239** Title badge fidelity iteration (brushed steel + copper STRANGER, denser station/nebula/swoosh toward PNG)
- **v0.1.238** Title badge fidelity: PNG screenspace anchor, steel STRANGER, denser station, opaque badge plate
- **v0.1.237** Title: procedural Canvas *Stranger* badge (PNG reference only)
- **v0.1.236** Reverted first procedural title attempt
- **v0.1.234** Title industrial/pulp plate menus (pause/changelog match)
- **v0.1.233** Bay weld VFX: tip-aimed sparks; under-hull glow; over-layer plating wash on 2.5D ship bands
- **v0.1.232** Place→Area→Feature groundwork; hangar from Place kit; vessel interior contract; crane-gated turrets; Dev Place panel
- **v0.1.231** South high-speed approach no longer occludes under hangar roof
- **v0.1.230** Launch lift keeps 8-thruster hover burst through pad rise
- **v0.1.229** Direct-load skips hold cargo when ship bay is full
- **v0.1.228** Idle mechs direct-load fuel/ammo/cargo from south (skip mid-stage)
- **v0.1.227** Each Hull pip heals 18–22% ship health
- **v0.1.226** Hull % tracks multi-spot weld animations (pauses between spots)
- **v0.1.225** All hangar job claims are per item / pile quadrant
- **v0.1.224** Both bay mechs load/unload in parallel (per-crate claims)
- **v0.1.223** Load cargo fetches tagged crates again (ambient CRATE no longer blocks staging)
- **v0.1.222** Visitor exit waits for green service board (after final scan), then short dwell
- **v0.1.221** Final departure scan laser speed matches intro scan
- **v0.1.220** Service pip timing (claim→blue, walk-away→green); load/unload dust FX
- **v0.1.219** Crew poster on north wall (post-occlusion); left of B1 on tile line
- **v0.1.218** Load/unload mechs no longer play welding sparks
- **v0.1.217** Crew poster relocated west of B1 door (was invisible on side wall)
- **v0.1.216** Service board cargo cells match 2.5D crate colors/textures (top-down lids)
- **v0.1.215** Hangar `decor` / `wallPoster` — engine-drawn crew poster on B1 west wall
- **v0.1.214** Quick Launch live hangar + space door fills as runway approaches (mouth traffic cadence)
- **v0.1.213** ~1s completion scan before service board goes green
- **v0.1.212** Door ticker status lines all-caps
- **v0.1.211** Door tickers: empty/disabled/ingress/egress/elevator + Scanning / Please select services
- **v0.1.210** Smaller bay warning lights; spin glow follows lit sector
- **v0.1.209** Fix invisible hull during space→hangar land cinematic
- **v0.1.208** Abandon runway reservation restores pad; no board scan on launch/hijack exit
- **v0.1.207** Fix instant hangar land settle after runway reservation prep
- **v0.1.206** Hangar LAUNCH button tracks selected pad bay door
- **v0.1.205** Hangar sim LOD in space (full→slow→pause by distance to nearest human)
- **v0.1.204** Reserved lane lights pulse green; hangar approach animation runs during runway reservation
- **v0.1.203** Safe-speed runway approach in a pad lane reserves that bay (red for others)
- **v0.1.202** Bay lights: yellow spin on elevator; floating mid + outer runway beacon rows (ships pass under)
- **v0.1.268** Thruster `NpcPilot`; station hold = north racetrack; police hex legs; open-bay retarget
- **v0.1.201** Station-full “Engage holding pattern” AI hold → auto-land; cancel on movement input
- **v0.1.200** Pad status lights + choose-your-bay; hangar↔space hull carry-over; ambient mouth traffic; door apron pavement
- **v0.1.199** Board corner scanners stay mounted on empty / elevator pads
- **v0.1.198** Captain pip gaps by type (0.2–0.6s change / 0.1–0.2s same)
- **v0.1.197** Cargo reveal ~1s; ship scan holds ~0.5s after cargo
- **v0.1.196** Board corner scanners + green ship scan VFX before/during stats+cargo reveal
- **v0.1.195** Service board staged reveal (stats→cargo→captain pips); 1×1 cargo slots; unload-before-load
- **v0.1.194** Landing: hold player services until full settle
- **v0.1.193** Occlusion stays on while under tape even if you rotate
- **v0.1.192** Exit burn until outer approach lights
- **v0.1.191** Occlusion: station-closest edge; exit stays under until tip clears
- **v0.1.190** Hangar roof depth doubled (N→S)
- **v0.1.189** Fix slow-approach entrance occlusion (apron zone + hull-edge overlap)
- **v0.1.188** Entrance cheeks + hangar roof; tape/roof occlusion gated by safe speed
- **v0.1.187** Caution paint on station rim; apron north-only; hull filled south; triggers retargeted
- **v0.1.186** Exit handoff nests under bay-mouth occlusion; station over ship while emerging
- **v0.1.185** Station space exterior 4× (`STATION.SCALE`) — dock/lights/triggers + ambient rings
- **v0.1.184** Match NE/NW arms; reverse auto-ingress (aft-first)
- **v0.1.183** Station NE/NW arms (no due-north over bay mouth)
- **v0.1.182** Ingress uses leading hull edge; remove north station arm on caution tape
- **v0.1.181** Safe ingress depth-flip (station over ship; black floor under) + edge past stripes before auto-dock
- **v0.1.180** Station approach lights + nose-to-stripes auto-ingress
- **v0.1.179** Seq zoom: player scroll cancels cinematic zoom for that enter/exit
- **v0.1.178** Seq cam keeps scroll zoom; hangar→space exit emerges from bay mouth with burn
- **v0.1.177** Hangar seq camera lock + northbound station-mouth space handoff with momentum
- **v0.1.176** Launch/land sequences own ship pose (Dev flight sync no longer cancels door exit)
- **v0.1.175** Plume depth: under 2D hull; mid-height on angled 2.5D (sides → plumes → deck)
- **v0.1.174** Hangar props unified (`category` themes; yard folded into `props[]`); prop stencil labels removed
- **v0.1.173** Hangar editor bay-unit spacing (symmetric B1/B3 drag; `sidePadX`)
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
- Ambient traffic near Jennings; plumes under 2D hull / mid-height on 2.5D

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
- Comms panel HAIL/DOCK/TRADE still no-ops (other cockpit panels live)
- Settings beyond controls sandbox (audio/graphics bindings)

## Dev Mode + Blueprint + Hangar editor

**Dev Mode** (Settings toggle, default on): floating **DEV** drawer (` key), **scoped by game mode** — title: **Title Layout** only (camera / wordmark / ship / buttons / DoF blur·bokeh; Save → `src/ui/title-layout.js`); hangar: sim / inspect / overlays / edit layout / Bay Options / Place / vessel; flight: sim / inspect / overlays / vessel; blueprint & controls: sim / inspect / overlays (+ Blueprint Author in BP HUD). Bake via `POST /dev/save` (allowlisted paths) or clipboard Export.

**Data files (machine-editable):**
- `src/ships/data/visualTuning.js` — cup / plume / generic engine class scale
- `src/ships/data/mountLayouts.js` — unit-space bell + ultra mounts
- `src/world/hangar-layout.js` — flavor props (`category`: desk/shelf/storage/tool/yard/decor/anchor), linger, gossip, `sidePadX` bay spacing; `decor` = engine-drawn wall art (`wallPoster`)

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

**Status:** Flavor MVP shipped (v0.1.159); bay unit spacing (v0.1.173); unified categorized props (v0.1.174); `decor` wall art / crew poster (v0.1.215). Structural sim (doors, pads, piles, crane, danger lanes) is code-owned but follows `sidePadX`.

**Entry:** Dev drawer → **Edit layout** (hangar only). Freezes crew; palette add / delete / copy / 8-dir rotate; linger bay multi-select + face arrow/slack; gossip capacity; **Bays** layer — drag B1/B3 grips (or nudge) to move whole bay units left/right with B2-centered symmetry; **Save layout**.

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