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

**Current loop:** title → ENTER HANGAR (or QUICK LAUNCH) → fly near Jennings Station → dock to return. Hangar B2 **LAUNCH** runs danger/evac/doors → 8-thruster lift → main-engine exit into space. Dock landing keeps entry heading, yaws nose-south, retro-brakes, settles, then the pad turns 180° to face north.

---

## Home Base (hangar)

The hangar bay is the prototype seed of **Home Base**: the place you start a new game from, and the hub between missions for future extraction / rogue-lite loops (outfit, stash cargo, depart, return).

| Now | Not yet |
|-----|---------|
| Full-frame docked bay (B1 · B2 · B3; player on B2); lived-in industrial set dressing; three-column pad status boards; danger-lane floor lights | Persistent inventory / loadout across sessions |
| Live thrusters / engine / weapons (translation locked until launch) | Mission board, shop UI, between-run meta |
| 3×6 cargo grid (2 cols/bay: left=in, right=out), manned crane, bulkheads; forklift hub south wall | Player-request job queue for **B2 only** (see below) |
| Fixed station crew (4 forklifts + 6 bay mechs + crane); checklist-driven logistics | |
| Distinct upgrade parts + hold cargo; destructible | |
| B2 **LAUNCH** / dock landing (lift burst, pad turntable, doors, thrust) | |
| B1–B3 captain service checklist; pilot door lights + status tickers; B1/B3 exit + elevator; B2 rerolls; empty-bay cargo sweep; elevator shafts | |
| Jennings Station overworld exterior + approach dock | |

Entered from the title screen (**ENTER HANGAR**). **QUICK LAUNCH** skips straight to space near the station.

### Cargo hardpoints (3×6)

Each bay owns **two columns** flanking its pad: **left = inbound (load)**, **right = outbound (unload)**.

| Row | Role | Pipeline |
|-----|------|----------|
| **North** | Ship mounts / upgrades | Install from top-left; removed mounts to top-right |
| **Mid** | Hold cargo | Buy/load via mid-left; sell/unload via mid-right |
| **South** | Storage I/O | Forklift drops inbound on south-left; picks outbound from south-right |

Vertical flow (example upgrade install): forklift → south-left → crane → top-left → mechanic installs; old mount → top-right → crane → south-right → forklift off-screen (sim vanish today; later crew stash/sell).

Each hardpoint holds up to **4** items in a 2×2 slot grid. Hold cargo is rectangular; ship mounts use distinct silhouettes. Actors skip full destinations, linger on blocked jobs until space opens, and prioritize clearing blockages they can help with.

### Station crew (fixed roster)

**11 crew always loaded** while in hangar: `forklift1–4`, `B1Mechanic1/2`, `B2Mechanic1/2`, `B3Mechanic1/2`, plus the crane operator.

- **Mechanics** — bay-scoped: only their bay’s checklist / reclaim / clear work. Always on stage (no stair hatches). When idle, linger near their bay computer (multiple stand points) or in the wings / gossip groups; bias shifts from near-bay to far linger with time since their last bay task (~60s). Path around service boards via dual wall-hug corridors; **walk freely over dock pads** (boards stay solid). At mid/north piles they use **four slot approach lanes** (west/east per 2×2 quadrant), step into the slot, and hand off cargo smoothly.
- **Forklifts** — any bay. Idle at the **forklift hub** (south wall center; apron is half the bottom-wall width with truck-sized stalls in logic only — painted as one dashed-yellow lot matching the roadway borders, with faded parking stencils). Drivers claim the closest empty unassigned stall before pathing home and release it when they leave for work. Leaving a stall, they take a short diagonal (~1 truck length) onto the east–west roadway, then proceed to the job. **Inbound** and **outbound** south pads both allow multiple trucks at once (per checklist unit / per 2×2 quadrant). Exit the screen only to fake offscreen cargo pop-in / pop-out: **left bulkhead** for ship-bound inbound, **right bulkhead** for ship-origin outbound. If the drop pad is busy they queue at the destination, not the hub. Each pile’s 2×2 slots use **four approach lanes** (west/east standoff per row); trucks lower forks, creep into the slot, then raise with smooth cargo pickup. The driver returns.
- **Crane** — parks top-left on the gantry when idle; aims hoist over each 2×2 pile slot; ground aim shadow shows drop point under the trolley. Job picks keep priority tiers (floor reclaim → unblock → at-cap → normal); within a tier, nearer pickups win unless higher-weight work justifies a modest detour. Checklist inbound freight (`serviceKey`) only shelves on the matching inbound pad — never the outbound uninstall / sell side.

### Pilot readouts (door strip) vs crew board

- **Bay service display** (crew): three-column pad status board south of each pad (fixed northern lip; taller face grows into the apron). Left: ship stats with display-only Mk labels. Middle: cargo hold grid by ship size (or `NO CARGO BAY`). Right: service checklist + header light; footer shows bay id. Checklist lists each job type once (`Hull` / `Fuel` / `Bullet` / `Shells` / `Install` / `Load` / `Unload`) with a fixed label column (width locked to `Install:`) so unit circles left-align across rows — up to 5 pips per row; 6+ units wrap onto another row with the same label. Circle colors: green done, blue in progress/assigned, yellow ready, grey gated. When every pip on a row is green, a checkmark appears in the left gutter. Header light off / yellow / green / flash red for bay service mood.
- **Door beacons + door-header ticker** (pilot / player): same rules on B1–B3 (player is the pilot on B2). Off (empty + pad rest) → amber steady (work not done) → green blink (work done, doors closed) → red flash (door moving) → green steady (doors open). Amber flash when elevator / pad turn / pad not seated. Ticker sits above the door / below the window / between door lights; shows 1–2 activity lines (`SHIP ARRIVING`, `CLEAR TO DEPART`, `REPAIRING HULL`, …).

### Bay activity: captain checklists (B1–B3) vs player-request (future B2)

**Neighbor pads (B1 / B3)** — on hangar entry (title Home Base or map landing), the sim **fast-forwards ~60s of side-bay traffic** before the first frame; **B2 stays fresh** (no pre-rolled checklist or staged freight). **Title Home Base** raises the player ship from the B2 elevator on first frame (stored below during warmup); **map landing** still uses the door approach. Visitors run a **captain service checklist**, not random leave timers. On door land, raise-for-service, or spawn-occupied, the ship rolls need meters (fuel / hull / bullets / shells / cargo space). Red meters (&lt;40%) **always** request work; yellow uses curved probability (`need^2.2`); green skips. Deficit depth scales unit count (1–3 for fuel/hull/ammo; cargo load/unload up to 8 from hold fill): multiple units per type (`Hull` / `Fuel` / `Bullet` / `Shells` / `Load` / `Unload` / `Install`), each filling a chunk until the meter (or hold) is topped up. The board lists each type once with left-aligned unit circles (column locked to `Install:`; max 5 pips per row — overflow repeats the label). Upgrades stay light (0–2). Light visitor-type bias (combat → ammo/hull; freighters → cargo). Deck crew (forklift → south-in → crane → mid/upgrade → mechanic) only stage what that list still needs; repair and unload can run in parallel with staging. If the player destroys staged service freight, that need is re-ordered and the visit continues until the checklist is done. After a short settle beat and post-service dwell, exit is **door depart or elevator descend** (same roll). An empty checklist is allowed only as an **elevator transfer** (no door leave with zero work). Empty bays wait longer before the next event; an elevator raise is either **immediate leave** or **ascend and stay for service**. The under-deck elevator still uses steadier warning lights, crew clear, and a round shaft whose **inner opening matches the pad radius** (hatched rim; 2.5D well; pad+ship clipped to the opening). Door landings still use pad turntables (empty pads face south; land nose-south; pad turns north). Elevator raises arrive nose-north. After depart, the pad turns south again. Departing ships exit the door then are **occluded by the north wall** except through the windows and open door apertures (player B2 launch/land uses the same layering). **Empty bays hold no cargo**; after a leave, station crew sweep every hardpoint (including inbound) until the bay is bare.

**Bay danger lanes** — the lit floor rectangle (door → danger closer, pad-width) is the hot zone during arrive/depart/elevator ops. Mechanics inside scramble to the nearest safe floor, drop cargo / abort welds on arrive or depart (not elevator), then after a short random beat resume or reclaim their dropped crate. They path **around** hot lanes toward other destinations (preferring the goal’s side of the service boards) and cut through again when the bay goes safe if that’s shorter. If they dropped cargo still inside a hot bay, they wait at the edge until they can re-enter for it. Pathing past service displays hugs board edges with dual parallel lanes (not a single robotic track). Mechanic idle fluff stays in north/side wing areas and does not cross the forklift road. Forklifts ignore bay ops danger (apron is south of the lights); they only flinch briefly when shot.

**Player pad (B2)** — interim: uses the **same captain checklist** as B1/B3 (need meters + red floors + multi-unit requests). Completing the list does **not** launch the ship — the player still owns exit timing. After a short post-service dwell, B2 waits **10–60s** then re-rolls a new checklist. Real player-request queue (sell / repair / buy / upgrade) remains future Home Base work.

| Player action (examples) | What it will trigger on B2 (future) |
|--------------------------|-------------------------|
| Land after a mission and **sell** onboard cargo | Unload crew / crane → cargo leaves the ship |
| Request **hull repairs** | Welder walks up and works the hull |
| Purchase / install an **upgrade** (weapon, hull armor, etc.) | Cargo brings the part **and** welder installs it |
| Buy **ammo** or trade goods for other ports | Cargo logic **loads** the ship |

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
| Title screen | Fullscreen live starfield + nebula; ENTER HANGAR / QUICK LAUNCH / SETTINGS; soft vignette | Done |
| Home Base hangar (Jennings Station) | Docked bay + B2 launch/land; industrial set; danger lights; B1–B3 captain checklists | Done (B2 request queue later) |
| Jennings Station (overworld) | Industrial exterior; approach + Enter to dock | Done |
| Settings / controls | Ship-only sandbox viewport with live bindings | Done |
| Top-left | Radar | Placeholder |
| Top-right | Systems (+ fullscreen) | Partial |
| Bottom-left | Weapons | Placeholder |
| Bottom-right | Navigation | Placeholder |
| Center HUD | Speed, position, zoom | Done |
| Pause (ESC) | Resume, fullscreen, settings, main menu | Done |

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
- [x] Home Base: launch from hangar into a run
- [x] Home Base: extract / return to hangar
- [ ] Home Base: persistent cargo / loadout between runs
- [ ] Home Base: B2 player-request job queue (sell/unload, repair, buy/load, upgrade = cargo + weld)
- [x] Home Base: B1–B3 captain service checklist (B2 interim reroll; B1/B3 door/elevator traffic + empty-bay sweep)
- [x] Home Base: fixed crew roster, bay service boards, pilot door lights/tickers, forklift hub
- [ ] Equipment upgrades
- [ ] Fuel and resource management
- [ ] Asteroid fragmentation
- [ ] Networking / multiplayer
- [ ] Save / load
- [ ] Audio (engines, weapons, ambience)
- [ ] Minimap / radar implementation
- [x] Settings menu (controls sandbox; audio/graphics later)
- [x] Main menu return flow

---

## Design goals checklist

- [x] Flight model feels inertial but controllable
- [x] Every thruster type visible when active
- [x] Plumes originate from shared hardpoints (aligned with hull hardware)
- [x] Depth conveyed through parallax layers
- [x] Speed readable via streaks + camera zoom
- [x] Pause without losing session
- [ ] Economy / progression loop
- [x] Home Base as start-of-run and between-mission hub
- [x] Combat variety: dorsal turret + mining laser (loot roles deferred)
- [ ] Meaningful navigation UI

---

## Changelog reference

See [`CHANGELOG.md`](CHANGELOG.md) for dated implementation history.
