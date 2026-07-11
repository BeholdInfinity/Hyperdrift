# Hyperdrift — Game Design Document (Prototype)

**Living document for the current browser prototype.** Update when mechanics, scope, or priorities change for *what we're building now*.

| Doc | Scope |
|-----|-------|
| **[`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md)** | Unresolved design decisions — for conversation sessions |
| **[`VISION.md`](VISION.md)** | Long-term north star — *Hyperdrift Crewline* (multiplayer crew game) |
| **This file (`GDD.md`)** | Prototype v0.1.26 — solo flight, procedural space |
| **[`PROJECT.md`](PROJECT.md)** | Dev handoff — architecture, run, status |

| Field | Value |
|-------|-------|
| Title | Hyperdrift *(prototype)* / Hyperdrift Crewline *(working title, see VISION.md)* |
| Genre | Top-down 2D spaceflight / exploration |
| Platform | Web browser |
| Status | Prototype v0.1.26 |

---

## Vision (prototype scope)

Hyperdrift is a browser-based spaceflight game set in a vast procedural universe. The player pilots a single spacecraft through asteroid fields, nebula regions, and open void, mastering inertia-based flight while exploring an effectively infinite cosmos. The first prototype prioritizes a **polished flight model** and **convincing depth** in the environment over feature breadth.

This prototype is **Layer 1** of the long-term *Hyperdrift Crewline* vision — see [`VISION.md`](VISION.md).

**Pillars (prototype):** responsive inertia flight · readable thruster feedback · layered parallax depth · expandable modular architecture.

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

- Ship yaw is **keyboard** (`Q` / `E`), not mouse
- Cursor always visible (no pointer lock)
- Mouse aims weapons only while the pointer is **inside the circular viewport**

### Translation

Eight blue **maneuvering thrusters** (two per cardinal face, offset for torque) plus one orange **main engine**.

Ship silhouette is a filled multi-section hull (narrower bridge, main body, **wider aft** engineering) with visible thruster cups, a shared engine bell, a **dorsal 360° combat turret** at the hull pivot `(0,0)`, and a fore **mining laser** — all positions come from one `HARDPOINTS` table (`src/entities/ShipHardpoints.js`).

| Input | Thrusters / engine | Effect |
|-------|-------------------|--------|
| W | Both aft thrusters | Accelerate forward (along nose) |
| S | Both nose thrusters | Accelerate backward |
| A | Both starboard thrusters | Accelerate left |
| D | Both port thrusters | Accelerate right |
| Q / E | Yaw couples | Rotate hull CCW / CW |
| Space | Main engine (aft) | Strongest forward thrust (orange plume) |
| Shift | Afterburner | Extra main-engine thrust — disabled in Precision |
| Alt | Space brakes | Soft brake via thruster face pairs; main-engine retro-burn when nose faces into velocity. During play, Alt and Alt+QWEASD/Space are `preventDefault`’d so browser menus / address-bar chords are less likely to steal focus |
| Caps Lock | Precision desire | See Precision mode below |

**Double-tap then hold** on **Q W E A S D** boosts that axis:

- Outside Precision: WASD → above-cruise maneuver burst; Q/E → combat-fast yaw
- Inside Precision: those keys → near-default cruise authority (not full combat boost)

Plume colors: **blue** = thrusters, **orange** = main engine (including afterburner and retro-burn). Intensity scales length/width with power (translation stronger than yaw).

**Leading-side flatten / plume flow:** not vacuum plume-impingement (outward nozzles on a convex hull do not hit the body). It exists for **2D readability** and a light **motion cue**:

- **Cue** — slight shorten/widen when a nozzle is on the leading hemisphere of velocity (scales with speed) so travel direction reads in the plumes
- **Wash** — stronger clamp on **particles** when exhaust fires into the flow, scaled by **angle of attack** (glancing into-flow = milder; head-on = strongest) so spray does not stream under the silhouette; **cones** stay milder so thrust remains obvious
- **Lean** — all nozzles, all AoA: plume tip bends with relative wind (`−velocity`) so sideways burns curve “aft” and glancing burns read direction; trailing burns get a slight **length** boost
- Mild spin contribution when a nozzle fights hard yaw

Exhaust **particles** live in ship-local space so they move and rotate with the hull (no long world-space trails when turning at speed).

### Rotation (RCS)

Yaw uses two **4-thruster** couples from the same eight nozzles:

- Counter-clockwise: nosePort, portAft, aftStarboard, starboardFore
- Clockwise: noseStarboard, starboardAft, aftPort, portFore

`Q` / `E` light the matching group. Killing spin shows a short **opposite-group burst** (semi-Newtonian — not a full equal reverse burn).

### Precision mode (Caps Lock)

Caps Lock is **desire** (OS LED via `getModifierState`) — browsers cannot clear Caps from script.

| Caps | Speed | State | Flight |
|------|-------|-------|--------|
| Off | any | Off | Full authority; afterburner OK |
| On | at/above engage gate | **Standby** | Full authority (mid-fight Caps is harmless) |
| On | under engage gate | **Active** | Thrust/yaw scaled; afterburner **off**; main engine **warm-up** before thrust |

- Engage when desired **and** under the speed gate; once active, stays until Caps off
- While active, that same speed is a **hard velocity cap** (cannot accelerate past it)
- Caps off exits immediately; Caps on while too fast to engage → **standby** until you slow down
- HUD: `PRECISION` / `PRECISION STANDBY`
- **Future:** Precision frees power pips for laser / scanner (not built — mode only scales flight now)

---

## Camera

- **Lead offset:** ship drifts from center opposite velocity; stronger at higher speed
- **Manual zoom:** scroll wheel (clamped range)
- **Speed zoom:** automatic zoom-out at high speed, blended with manual zoom
- **Viewport:** circular play area; corners reserved for HUD
- **Pose sync:** camera must track the ship **after** physics each frame so ship-local exhaust stays on hardpoints under lead offset
- **Weapon gate:** turret aim/fire and mining laser only while pointer is inside the play circle; flight inputs work everywhere

---

## Combat

### Dorsal combat turret (LMB)

- 360° mount at hull center; mouse aims in **world space** with limited **slew rate** (gyro — holds space aim when pointer leaves the circle; slews back on re-entry)
- Hold LMB to fire energy bolts (max **3 shots/sec**); barrel recoils; muzzle bloom
- Concentric-ring base + grey sleeve + black barrel/muzzle (sketch-inspired)

### Mining laser (RMB)

- Nose mount; aim clamped to a **limited forward arc** with slew; ship-relative (yaws with hull when pointer leaves circle)
- Hold RMB while pointer in viewport: continuous beam along **clamped** aim even if mouse is past the arc
- Damages asteroids over time (beam DPS)

### Future weapon roles (not built)

- **Guns** destroy faster but yield **fewer** resource drops
- **Mining lasers** destroy slower but yield **more** resources
- Loot / drop-rate code deferred

Asteroids have HP and destroy with effect (fragmentation deferred).
---

## Environment

### Starfield

Five → seven parallax layers from extremely distant to very near — independent density, size, brightness, twinkle. Star draw size is screen-fixed so camera zoom does not swell stars.

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
| Title screen | Fullscreen live starfield + nebula (same vibrancy as play); soft edge vignette; UI fades in with backdrop | Done |
| View Ship (title) | Temporary docked hangar (full-frame); B1/B2/B3; 3×4 cargo; bridge crane; stairs + bulkhead doors; forklift/mechanic logistics; destructible crates | Done (temporary) |
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

## Future systems

Prototype backlog (near-term) and long-term crew-game systems are tracked separately:

- **Prototype next steps** — see checklist below and [`PROJECT.md`](PROJECT.md)
- **Crewline vision** — roles, logistics, PvPvE, MVP criteria — see [`VISION.md`](VISION.md)

### Prototype backlog (not built)

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
- [x] Plumes originate from shared hardpoints (aligned with hull hardware)
- [x] Depth conveyed through parallax layers
- [x] Speed readable via streaks + camera zoom
- [x] Pause without losing session
- [ ] Economy / progression loop
- [x] Combat variety: dorsal turret + mining laser (loot roles deferred)
- [ ] Meaningful navigation UI

---

## Changelog reference

See [`CHANGELOG.md`](CHANGELOG.md) for dated implementation history.
