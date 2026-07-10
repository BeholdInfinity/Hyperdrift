# Hyperdrift — Game Design Document

**Living document.** Update when mechanics, scope, or priorities change. For repo layout and dev handoff, see [`PROJECT.md`](PROJECT.md).

| Field | Value |
|-------|-------|
| Title | Hyperdrift |
| Genre | Top-down 2D spaceflight / exploration |
| Platform | Web browser |
| Status | Prototype v0.1 |

---

## Vision

Hyperdrift is a browser-based spaceflight game set in a vast procedural universe. The player pilots a single spacecraft through asteroid fields, nebula regions, and open void, mastering inertia-based flight while exploring an effectively infinite cosmos. The first prototype prioritizes a **polished flight model** and **convincing depth** in the environment over feature breadth.

**Pillars:** responsive inertia flight · readable thruster feedback · layered parallax depth · expandable modular architecture.

---

## Core loop (target)

1. Launch into procedural space
2. Navigate using thrust and inertia
3. Engage hazards (asteroids) and explore regions (nebulae, fields)
4. Fight with mounted weapons
5. *(Future)* mine, trade, complete missions, upgrade ship

**Current loop:** fly → shoot asteroids → explore procedurally generated regions.

---

## Flight model

### Physics — semi-Newtonian

- Velocity persists; no automatic drag
- Maximum linear and rotational speed caps
- Counter-thrust required to stop
- Acceleration tuned for realism **and** fun

### Orientation

- Ship rotates smoothly toward **mouse cursor**
- Cursor always visible (no pointer lock)

### Translation

| Input | Thrusters | Effect |
|-------|-----------|--------|
| W | Aft/rear | Accelerate forward (along nose) |
| S | Forward/nose | Accelerate backward |
| A | Starboard (right side) | Accelerate left |
| D | Port (left side) | Accelerate right |
| Space | Main engine (aft) | Strongest forward thrust |
| Shift | Afterburner | Extra main-engine thrust + larger plume |
| Ctrl | Space brakes | Auto-select thrusters (+ retro-burn when aligned) to kill velocity |

All thrust sources must have **matching visual plumes and particles**.

### Rotation (RCS)

When turning toward cursor, opposing maneuvering thrusters fire in pairs to show torque (clockwise and counter-clockwise sets).

---

## Camera

- **Lead offset:** ship drifts from center opposite velocity; stronger at higher speed
- **Manual zoom:** scroll wheel (clamped range)
- **Speed zoom:** automatic zoom-out at high speed, blended with manual zoom
- **Viewport:** circular play area; corners reserved for HUD

---

## Combat

### Starter weapon — energy cannon

- Forward-firing, bound to left mouse (hold to fire)
- Projectile visuals: bolt trail, muzzle flash, impact burst
- Asteroids have HP and destroy with effect (fragmentation deferred)

---

## Environment

### Starfield

Five parallax layers from extremely distant to very near — independent density, size, brightness, twinkle.

### Nebulae

Three depth layers (far / mid / near) plus chunk-placed and ambient procedural clouds. Soft aurora-like color, slow drift.

### Asteroids

- Sparse clusters (common) and dense fields (occasional)
- Procedural placement per chunk, deterministic seed
- Distant chunks unloaded

### Speed streaks

Foreground particles moving **opposite** ship velocity — length, brightness, and speed scale with player speed. Visible even in sparse space.

---

## UI

| Region | Purpose | Status |
|--------|---------|--------|
| Top-left | Radar | Placeholder |
| Top-right | Systems (+ fullscreen) | Partial |
| Bottom-left | Weapons | Placeholder |
| Bottom-right | Navigation | Placeholder |
| Center HUD | Speed, position, zoom | Done |
| Pause (ESC) | Resume, fullscreen, settings*, main menu* | Partial |

\* Placeholder buttons — not yet functional.

---

## Technical requirements

- Runs entirely in browser; no required external libs
- Fullscreen API support with UI toggle
- Block context menu in gameplay where appropriate
- Modular code: Engine, Renderer, Physics, Input, Camera, Entities, Weapons, Procedural Gen, Asteroids

---

## Future systems (designed for, not built)

- [ ] Multiple ships
- [ ] AI enemies
- [ ] Trading economy
- [ ] Mining
- [ ] Missions / quests
- [ ] Equipment upgrades
- [ ] Fuel and resource management
- [ ] Asteroid fragmentation
- [ ] Networking / multiplayer
- [ ] Save / load
- [ ] Audio (engines, weapons, ambience)
- [ ] Minimap / radar implementation
- [ ] Settings menu (bindings, audio, graphics)
- [ ] Main menu return flow

---

## Design goals checklist

- [x] Flight model feels inertial but controllable
- [x] Every thruster type visible when active
- [x] Depth conveyed through parallax layers
- [x] Speed readable via streaks + camera zoom
- [x] Pause without losing session
- [ ] Economy / progression loop
- [ ] Combat variety beyond single cannon
- [ ] Meaningful navigation UI

---

## Changelog reference

See [`CHANGELOG.md`](CHANGELOG.md) for dated implementation history.
