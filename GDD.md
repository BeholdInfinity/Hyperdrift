# Hyperdrift — Game Design Document (Prototype)

**Living document for the current browser prototype.** Update when mechanics, scope, or priorities change for *what we're building now*.

| Doc | Scope |
|-----|-------|
| **[`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md)** | Unresolved design decisions — for conversation sessions |
| **[`VISION.md`](VISION.md)** | Long-term north star — *Hyperdrift Crewline* (multiplayer crew game) |
| **This file (`GDD.md`)** | Prototype v0.1.34 — solo flight, procedural space |
| **[`PROJECT.md`](PROJECT.md)** | Dev handoff — architecture, run, status |

| Field | Value |
|-------|-------|
| Title | Hyperdrift *(prototype)* / Hyperdrift Crewline *(working title, see VISION.md)* |
| Genre | Top-down 2D spaceflight / exploration |
| Platform | Web browser |
| Status | Prototype v0.1.34 |

---

## Vision (prototype scope)

Hyperdrift is a browser-based spaceflight game set in a vast procedural universe. The player pilots a single spacecraft through asteroid fields, nebula regions, and open void, mastering inertia-based flight while exploring an effectively infinite cosmos. The first prototype prioritizes a **polished flight model** and **convincing depth** in the environment over feature breadth.

This prototype is **Layer 1** of the long-term *Hyperdrift Crewline* vision — see [`VISION.md`](VISION.md).

**Pillars (prototype):** responsive inertia flight · readable thruster feedback · layered parallax depth · expandable modular architecture.

---

## Core loop (target)

1. Start (or return) at **Home Base** hangar
2. Launch into procedural space
3. Navigate using thrust and inertia
4. Engage hazards (asteroids) and explore regions (nebulae, fields)
5. Fight with mounted weapons
6. *(Future)* extract / return to Home Base between missions; mine, trade, upgrade ship

**Current loop:** title → LAUNCH into space → fly → shoot asteroids → explore. Home Base hangar exists (title → VIEW SHIP) but is not yet the launch/return path.

---

## Home Base (hangar)

The hangar bay is the prototype seed of **Home Base**: the place you start a new game from, and the hub between missions for future extraction / rogue-lite loops (outfit, stash cargo, depart, return).

| Now | Not yet |
|-----|---------|
| Full-frame docked bay (B1 · B2 · B3; player on B2); lived-in industrial set dressing; blast backsplash + danger-lane floor lights | Launch into space from the hangar |
| Live thrusters / engine / weapons (translation locked) | Extract / return from a run into the same bay |
| 3×6 cargo grid (2 cols/bay: left=in, right=out), manned crane, stairs, bulkheads | Persistent inventory / loadout across sessions |
| Forklift + mechanic logistics (ambient on all pads today) | Player-request job queue for **B2 only** (see below) |
| Distinct upgrade parts + hold cargo; destructible | Mission board, shop UI, between-run meta |

Entered today from the title screen (**VIEW SHIP**). Design intent: this mode becomes the real start-of-run and between-mission surface — not a throwaway inspection tool.

### Cargo hardpoints (3×6)

Each bay owns **two columns** flanking its pad: **left = inbound (load)**, **right = outbound (unload)**.

| Row | Role | Pipeline |
|-----|------|----------|
| **North** | Ship mounts / upgrades | Install from top-left; removed mounts to top-right |
| **Mid** | Hold cargo | Buy/load via mid-left; sell/unload via mid-right |
| **South** | Storage I/O | Forklift drops inbound on south-left; picks outbound from south-right |

Vertical flow (example upgrade install): forklift → south-left → crane → top-left → mechanic installs; old mount → top-right → crane → south-right → forklift off-screen (sim vanish today; later crew stash/sell).

Each hardpoint holds up to **4** items in a 2×2 slot grid. Hold cargo is rectangular; ship mounts use distinct silhouettes. Actors skip full destinations, linger on blocked jobs until space opens, prioritize clearing blockages they can help with, and despawn when idle.

### Bay activity: ambient vs player-request (future)

**Neighbor pads (B1 / B3)** — loading, unloading, welding/repairs, and similar work stay **simulated ambient theater**. Other ships look busy; that traffic does not consume player resources or wait on UI.

**Player pad (B2)** — the same animation vocabulary (cargo haulers, welders, crane, etc.) runs **only when the player requests it**. Requests can be queued; each item is checked off **only after its animations complete**.

| Player action (examples) | What it triggers on B2 |
|--------------------------|-------------------------|
| Land after a mission and **sell** onboard cargo | Unload crew / crane → cargo leaves the ship |
| Request **hull repairs** | Welder walks up and works the hull |
| Purchase / install an **upgrade** (weapon, hull armor, etc.) | Cargo brings the part **and** welder installs it |
| Buy **ammo** or trade goods for other ports | Cargo logic **loads** the ship |

Today’s hangar still runs ambient jobs on the player ship too; wiring B2 to a real request queue is future Home Base work.

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
| Home Base hangar (title → VIEW SHIP) | Docked Home Base bay (full-frame); B1/B2/B3; industrial set dressing + per-bay door beacons; 3×6 cargo (in/out per bay); bridge crane; stairs + bulkhead doors; forklift/mechanic logistics; upgrade + hold-cargo silhouettes. Seed for between-mission hub + new-game start | In progress (bay done; launch/return not wired) |
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
- [ ] Home Base: launch from hangar into a run
- [ ] Home Base: extract / return to hangar
- [ ] Home Base: persistent cargo / loadout between runs
- [ ] Home Base: B2 player-request job queue (sell/unload, repair, buy/load, upgrade = cargo + weld); B1/B3 stay ambient sim
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
- [ ] Home Base as start-of-run and between-mission hub
- [x] Combat variety: dorsal turret + mining laser (loot roles deferred)
- [ ] Meaningful navigation UI

---

## Changelog reference

See [`CHANGELOG.md`](CHANGELOG.md) for dated implementation history.
