# Changelog

All notable changes to Hyperdrift are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/). Project uses pre-1.0 prototype versioning.

## [Unreleased]

### Added
- `VISION.md` — long-term *Hyperdrift Crewline* design (multiplayer crew, logistics, extraction)
- `OPEN_QUESTIONS.md` — unresolved design decisions for future conversation sessions

### Changed
- `VISION.md` revised with author's original intent (fluid stations, carry chains, per-station views, scoop vs grapple)

### Planned
- Asteroid fragmentation on destroy
- Fuel system for afterburner
- Radar minimap in corner panel
- Settings and main-menu flows
- Audio

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
