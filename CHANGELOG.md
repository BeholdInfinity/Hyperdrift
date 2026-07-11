# Changelog

All notable changes to Hyperdrift are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/). Project uses pre-1.0 prototype versioning.

## [Unreleased]

### Planned
- Asteroid fragmentation on destroy
- Fuel system for afterburner
- Radar minimap in corner panel
- Settings and main-menu flows
- Audio
- Resource drops (guns vs mining laser yield tradeoff)
- Precision power-pip allocation for laser / scanner

---

## [0.1.20] — 2026-07-11

### Changed
- Hangar viewports widened to match bay-door width; live title-space chunk drawn into each glass (fixes black windows)
- Crate stacks: up to 5 random slots (far sides + between-pad lanes); crane picks random pickup/dropoff piles each job

---

## [0.1.19] — 2026-07-11

### Changed
- Hangar bay doors closed by default; title-space peeks through small bordered viewports above each door
- Bay order **B1 · B2 · B3** (left→right); player docks on **B2** (center); visitors on B1/B3
- Overhead gantry crane ferries crates between left/right piles (travel, lower, grab, raise, cross, drop)

---

## [0.1.18] — 2026-07-11

### Changed
- Hangar bay doors show the live title-screen starfield/nebula chunk (same drifting space, no extra load)
- Three bay doors aligned with pads B2 / B1 / B3; side pads shifted outward to match
- Overhead gantry crane: short cable with claw (no longer hangs through pads)
- Visitor ships now have thruster cups + orange engine bells; combat/patrol/scout types carry visible weapons

---

## [0.1.17] — 2026-07-11

### Changed
- Player ship spawns facing **north** (screen-up) in flight and hangar
- Hangar dock pads simplified to flat matte discs (no clamp chevrons) so hull reads clear of the pad
- Hangar oriented with a **bay door to space** north of the player pad; zoom-out shows left/right neighbor pads
- Hangar default zoom widened so door + neighbor pads are visible on entry

### Added
- Neighbor hangar pads randomly empty or occupied by placeholder visitor ships (scout, interceptor, patrol, gunship, freighter, tanker, hauler)

---

## [0.1.16] — 2026-07-11

### Added
- Temporary **View Ship** hangar from the title screen: docked inspection bay with live thrusters, engine, yaw, turret, and mining laser (ship translation locked)
- Hangar backdrop (deck plates, clamps, crates, windows, overhead crane/lights) plus mechanics and forklifts that flinch/flee when thrusters, engine, or weapons fire
- Hangar scroll zoom range (~2.6 ceiling → ~14 hull-fill); ESC or Back returns to title

---

## [0.1.15] — 2026-07-11

### Added
- Dorsal 360° combat turret at hull center (mouse aim, LMB, 3 shots/sec, recoil + muzzle bloom)
- Nose mining laser with limited forward arc (RMB continuous beam)
- Q/E keyboard yaw; double-tap-hold burst on QWEASD
- Caps Lock Precision mode: speed-gated engage, standby when too fast, no afterburner, main-engine warm-up
- Weapon aim/fire only while pointer is inside the play circle (turret gyro vs laser hull-relative lock)

### Changed
- Mouse no longer rotates the ship; flight and combat controls separated
- Controls hint + HUD Precision / Standby readout
- Yaw rates slowed (cruise + fast); translation unchanged
- Turret and mining laser **slew** toward the pointer (no snap on viewport re-entry)
- While Precision is active, engage speed is a **velocity cap** (not a drop-to-standby threshold)

### Fixed
- Ctrl+QWEASD (and Ctrl+Space) no longer trigger browser chords during play (e.g. Ctrl+E search, Ctrl+W close tab)

### Changed
- Space brakes rebound from **Ctrl** to **Alt** (Ctrl+W cannot be blocked in Chromium; Alt is safer with WASD)

---

## [0.1.14] — 2026-07-10

### Changed
- Leading-side flatten retuned: mild velocity **cue** on cones for motion readability; stronger **spray wash** on particles to stop under-hull streaming (not treated as vacuum hull impingement)
- Wash curve tracks angle of attack more clearly (glancing into-flow / edge-of-retro milder than head-on)
- Plume **crosswind lean** on all nozzles (relative wind `−velocity`); trailing plumes slightly longer; cones use a soft curve tip — flames read both AoA and speed

---

## [0.1.13] — 2026-07-10

### Changed
- Thruster and engine plumes ~50% larger (cones and exhaust particles)
- Handoff docs (`PROJECT.md`, `GDD.md`, Cursor rules) synced to hardpoint ship, ship-local exhaust, and post-physics camera tracking

---

## [0.1.12] — 2026-07-10

### Fixed
- Camera now tracks post-physics ship pose so ship-local exhaust no longer appears ahead of the hull at high speed (was using a one-frame-stale position under camera lead)

### Changed
- Ship silhouette: wider aft engineering bay / sponsons for clearer fore–aft read

---

## [0.1.11] — 2026-07-10

### Changed
- Ship silhouette: filled multi-section hull (bridge, body, engineering) with visible thruster cups, engine bell, and nose gun
- Single `HARDPOINTS` table drives gun, main engine/afterburner, and all 8 thruster plume origins

---

## [0.1.10] — 2026-07-10

### Fixed
- Exhaust particles are ship-local (move/rotate with the hull) so high-speed turns no longer leave long world-space “tentacle” trails

---

## [0.1.9] — 2026-07-10

### Changed
- Thruster visuals: 8 blue maneuvering thrusters (face pairs for translation; 4-thruster yaw couples with opposite-group stop burst)
- Main engine / afterburner / retro-burn: orange family; afterburner longer, brighter, slightly narrower
- Leading-side plume flatten so exhaust into velocity stays on that hull face instead of streaming under the ship

---

## [0.1.8] — 2026-07-10

### Fixed
- Space brakes: main-engine retro-burn only when nose faces into velocity (was inverted); nose/aft maneuver brake thrusters match force direction

---

## [0.1.7] — 2026-07-10

### Fixed
- Strafe thruster plumes (A/D and brake laterals) drawn on the correct hull side — port/starboard were visually swapped

---

## [0.1.6] — 2026-07-10

### Fixed
- Space brakes now fully stop the ship instead of coasting forever just under the velocity threshold (HUD stuck around SPD 4 with POS still drifting)

---

## [0.1.5] — 2026-07-10

### Added
- Title screen: live fullscreen starfield + nebula with slow camera drift; launch continues from that view
- Title-screen build stamp (bottom-left): version + last-edit datetime from `/build-info.json`
- `src/version.js` — prototype version source of truth
- Local `dev-server.py` (used by `start-game.bat`) with no-cache headers and build-info endpoint
- `VISION.md` — long-term *Hyperdrift Crewline* design
- `OPEN_QUESTIONS.md` — unresolved design decisions

### Changed
- Starfield: 7 denser parallax layers; screen-fixed star size (no zoom swell); brief blink twinkle
- Speed streaks: subtler screen-space particles that fill the viewport at any zoom
- Title UI + backdrop fade in together; light vignette so backdrop matches in-game vibrancy
- Chunk load/unload radii 3 / 5
- `VISION.md` revised with author's original intent (fluid stations, carry chains, scoop vs grapple)

### Fixed
- Starfield hard edge at max zoom-out (tile repeats fill the view)
- Nebula edge color pop-in (ambient generation margin covers full glow before enter)

---

## [0.1.1] — 2026-07-09

### Changed
- Project renamed from **Space Drift** to **Hyperdrift**
- Added `PROJECT.md`, `GDD.md`, `CHANGELOG.md`, and Cursor rules for session handoff

### Fixed
- Removed pointer lock; mouse cursor always visible
- WASD thruster mapping and visuals aligned (aft/nose/port/starboard)
- RCS rotation thruster pairs now visible when turning
- Speed streaks move consistently opposite velocity vector
- Pause overlay no longer trapped inside hidden start-screen overlay

### Added
- Mouse wheel zoom with speed-based dynamic zoom-out
- Fullscreen button in Systems panel and pause menu
- ESC pause menu (resume, fullscreen, placeholder settings/main menu)
- Five-layer starfield and three-layer nebula depth
- Procedural ambient nebulae for sparse regions
- HUD zoom readout

---

## [0.1.0] — 2026-07-09

### Added
- Initial prototype: semi-Newtonian top-down spaceflight
- WASD maneuvering, main engine, afterburner, smart brakes
- Mouse aim and energy cannon
- Circular viewport with corner UI placeholders
- Procedural chunk-based universe (asteroids, nebulae)
- Parallax starfield, nebula clouds, speed streaks
- Modular architecture: GameEngine, systems, entities, world modules
