# Changelog

All notable changes to Hyperdrift are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/). Project uses pre-1.0 prototype versioning.

## [Unreleased]

### Changed
- Cursor rule: on **commit and push**, check whether handoff docs need a sync and ask before including those updates

### Planned
- Asteroid fragmentation on destroy
- Fuel system for afterburner
- Radar minimap in corner panel
- Settings and main-menu flows
- Audio

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
