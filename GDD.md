# Hyperdrift — Game Design Document (Prototype)

**Living document for the current browser prototype.** Update when mechanics, scope, or priorities change for *what we're building now*.

| Doc | Scope |
|-----|-------|
| **[`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md)** | Unresolved design decisions — for conversation sessions |
| **[`VISION.md`](VISION.md)** | Long-term north star — *Hyperdrift Crewline* (multiplayer crew game) |
| **This file (`GDD.md`)** | Prototype v0.1.150 — solo flight + modular ships, procedural space |
| **[`PROJECT.md`](PROJECT.md)** | Dev handoff — architecture, run, status |

| Field | Value |
|-------|-------|
| Title | Hyperdrift *(prototype)* / Hyperdrift Crewline *(working title, see VISION.md)* |
| Genre | Top-down 2D spaceflight / exploration |
| Platform | Web browser |
| Status | Prototype v0.1.150 |

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
| Full-frame docked bay (B1 · B2 · B3; player on B2); 2.5D industrial set dressing (bay apron tools/terminals only; asymmetric wing lore props; forklift-yard gear at hub ends); three-column pad status boards; danger-lane floor lights | Persistent inventory / loadout across sessions |
| Live thrusters / engine / weapons (position + heading locked to pad until launch) | Mission board, shop UI, between-run meta |
| 3×6 cargo grid (2 cols/bay: left=in, right=out), manned crane, bulkheads; forklift hub south wall | Player-request job queue for **B2 only** (see below) |
| Fixed station crew (4 forklifts + 6 bay mechs + crane); checklist-driven logistics | |
| Distinct upgrade parts from ItemCatalog; install/uninstall mutates ship hardpoint loadout (strip before install) | Player Ship Upgrade UI (economy / gated install) — Dev **Blueprint** sandbox is the prototype surface |
| B2 **LAUNCH** / dock landing (lift burst, pad turntable, doors, thrust) | |
| B1–B3 captain service checklist; pilot door lights + status tickers; B1/B3 exit + elevator; B2 rerolls; empty-bay cargo sweep; elevator shafts | |
| Jennings Station overworld exterior + approach dock | Hangar **room / set-dressing editor** (designer places props, 8-dir rotate, linger/gossip; Done saves layout) — see `PROJECT.md` |

Entered from the title screen (**ENTER HANGAR**). **QUICK LAUNCH** skips straight to space near the station.

### Cargo hardpoints (3×6)

Each bay owns **two columns** flanking its pad: **left = inbound (load)**, **right = outbound (unload)**.

| Row | Role | Pipeline |
|-----|------|----------|
| **North** | Ship mounts / upgrades | Install from top-left; removed mounts to top-right |
| **Mid** | Hold cargo | Buy/load via mid-left; sell/unload via mid-right |
| **South** | Storage I/O | Forklift drops inbound on south-left; picks outbound from south-right |

Vertical flow (example upgrade install): forklift → south-left → crane → top-left → mechanic installs; old mount → top-right → crane → south-right → forklift off-screen (sim vanish today; later crew stash/sell).

Each hardpoint holds up to **4** items in a 2×2 slot grid. Freight is drawn as worn industrial **2.5D** with **8-direction** facing (follows forklift / mechanic carry; rests on piles). Service crates match the request: open-top **fuel cells**, brown **7.62 belt-ammo cans** (linked tip-up rows), olive **40mm shell cans** (3×2 fat rounds); load/unload uses **six** generic container color schemes; install/uninstall are distinct sci-fi ship parts (laser, turret, armor, thruster, engine, sensor dish). Actors skip full destinations, linger on blocked jobs until space opens, and prioritize clearing blockages they can help with.

### Station crew (fixed roster)

**11 crew always loaded** while in hangar: `forklift1–4`, `B1Mechanic1/2`, `B2Mechanic1/2`, `B3Mechanic1/2`, plus the crane operator.

- **Mechanics** — bay-scoped: only their bay’s checklist / reclaim / clear work. Always on stage (no stair hatches). When idle **and the crane is busy elsewhere**, they may ferry their bay’s staging piles (same S↔N/M / misshelf / outbound rules as the crane), but never other bays. When idle with no staging help needed, linger near their bay computer (multiple stand points) or in the wings / gossip groups; bias shifts from near-bay to far linger with time since their last bay task (~60s). Path around service boards via dual wall-hug corridors; **walk freely over dock pads** (boards stay solid). At mid/north piles they use **four slot approach lanes** (west/east per 2×2 quadrant), step into the slot, and hand off cargo smoothly. Draw: worn industrial 2.5D welders / loaders with **8-direction visual heading**; **one suit color theme per bay** shared by that bay’s two mechs (B1 rust/hazard, B2 teal, B3 olive) — pathing and hand/cargo math still use facing ±1 only.
- **Forklifts** — any bay. Idle at the **forklift hub** (south wall center; apron is half the bottom-wall width with truck-sized stalls in logic only — painted as one dashed-yellow lot matching the roadway borders, with faded parking stencils). Drivers claim the closest empty unassigned stall before pathing home and release it when they leave for work. Leaving a stall, they take a short diagonal (~1 truck length) onto the east–west roadway, then proceed to the job. **Inbound** and **outbound** south pads both allow multiple trucks at once (per checklist unit / per 2×2 quadrant). Exit the screen only to fake offscreen cargo pop-in / pop-out: **left bulkhead** for ship-bound inbound, **right bulkhead** for ship-origin outbound. If the drop pad is busy they queue at the destination, not the hub. Each pile’s 2×2 slots use **four approach lanes** (west/east standoff per row); trucks lower forks, creep into the slot, then raise with smooth cargo pickup. The driver returns. Draw: worn industrial 2.5D station trucks with **8-direction visual heading** (smoothed from movement; snaps to job L/R facing during pile work) — pathing / approach math still use facing ±1; carried crates sit on the drawn fork tips so turnarounds don’t snap cargo.
- **Crane** — parks top-left on the gantry when idle; aims hoist over each 2×2 pile slot; ground aim shadow shows drop point under the trolley. Job picks keep priority tiers (floor reclaim → unblock → at-cap → normal); within a tier, nearer pickups win unless higher-weight work justifies a modest detour. Checklist inbound freight (`serviceKey`) only shelves on the matching inbound pad — never the outbound uninstall / sell side. XY trolley travel is tuned faster than bay-mechanic hand-carries so the crane remains the preferred staging mover when free; idle mechs only help while he is mid-job. If a mech already has the crate (or mid-handoff) for the same pile→pile move, the crane abandons that job; if the crane is lowering/raising on that pickup (or already carrying it), the mech abandons that assist. Draw: worn industrial 2.5D bridge / trolley / claw; manned cab with fixed crane-crew suit; operator helmet + distinct facemask looks in **8 directions** at the current task destination (pickup → dropoff → deck aim); three cab levers animate to XY travel, hoist up/down, and claw open/close — claw fingertip positions unchanged for cargo lift/lower.

### Pilot readouts (door strip) vs crew board

- **Bay service display** (crew): three-column pad status board south of each pad (fixed northern lip; taller face grows into the apron). Left: ship stats with display-only Mk labels. Middle: cargo hold grid by ship size (or `NO CARGO BAY`). Right: service checklist + header light; footer shows bay id. Checklist lists each job type once (`Hull` / `Fuel` / `Bullet` / `Shells` / `Install` / `Load` / `Unload`) with a fixed label column (width locked to `Install:`) so unit circles left-align across rows — up to 5 pips per row; 6+ units wrap onto another row with the same label. Each **Install** pip is a distinct backend request (target hardpoint + catalog item); the board still shows a single Install row. Forklift brings that part; mechanics strip only that hardpoint if occupied before installing. Circle colors: green done, blue in progress/assigned, yellow ready, grey gated. When every pip on a row is green, a checkmark appears in the left gutter. Header light off / yellow / green / flash red for bay service mood.
- **Door beacons + door-header ticker** (pilot / player): same rules on B1–B3 (player is the pilot on B2). Off (empty + pad rest) → amber steady (work not done) → green blink (work done, doors closed) → red flash (door moving) → green steady (doors open). Amber flash when elevator / pad turn / pad not seated. Ticker sits above the door / below the window / between door lights; shows 1–2 activity lines (`SHIP ARRIVING`, `CLEAR TO DEPART`, `REPAIRING HULL`, …).

### Bay activity: captain checklists (B1–B3) vs player-request (future B2)

**Neighbor pads (B1 / B3)** — on hangar entry (title Home Base or map landing), the sim **fast-forwards ~60s of side-bay traffic** before the first frame; **B2 stays fresh** (no pre-rolled checklist or staged freight). **Title Home Base** raises the player ship from the B2 elevator on first frame (stored below during warmup); **map landing** still uses the door approach. Visitors run a **captain service checklist**, not random leave timers. On door land, raise-for-service, or spawn-occupied, the ship rolls need meters (fuel / hull / bullets / shells / cargo space). Red meters (&lt;40%) **always** request work; yellow uses curved probability (`need^2.2`); green skips. Deficit depth scales unit count (1–3 for fuel/hull/ammo; cargo load/unload up to 8 from hold fill): multiple units per type (`Hull` / `Fuel` / `Bullet` / `Shells` / `Load` / `Unload` / `Install`), each filling a chunk until the meter (or hold) is topped up. The board lists each type once with left-aligned unit circles (column locked to `Install:`; max 5 pips per row — overflow repeats the label). Upgrades stay light (0–2). Light visitor-type bias (combat → ammo/hull; freighters → cargo). Deck crew (forklift → south-in → crane → mid/upgrade → mechanic) only stage what that list still needs; repair and unload can run in parallel with staging. If the player destroys staged service freight, that need is re-ordered and the visit continues until the checklist is done. After a short settle beat and post-service dwell, exit is **door depart or elevator descend** (same roll). An empty checklist is allowed only as an **elevator transfer** (no door leave with zero work). Empty bays wait longer before the next event; an elevator raise is either **immediate leave** or **ascend and stay for service**. The under-deck elevator still uses steadier warning lights, crew clear, and a round shaft whose **inner opening matches the pad radius** (hatched rim; 2.5D well; pad+ship clipped to the opening). Door landings still use pad turntables (empty pads face south; land nose-south; pad turns north). Elevator raises arrive nose-north. After depart, the pad turns south again. Departing ships exit the door then are **occluded by the north wall** except through the windows and open door apertures (player B2 launch/land uses the same layering). **Empty bays hold no cargo**; after a leave, station crew sweep every hardpoint (including inbound) until the bay is bare.

**Bay danger lanes** — the lit floor rectangle (door → danger closer, pad-width) is the hot zone during arrive/depart/elevator ops. Mechanics inside scramble to the nearest safe floor, drop cargo / abort welds on arrive or depart (not elevator), then after a short random beat resume or reclaim their dropped crate. They path **around** hot lanes toward other destinations (preferring the goal’s side of the service boards) and cut through again when the bay goes safe if that’s shorter. If they dropped cargo still inside a hot bay, they wait at the edge until they can re-enter for it. Pathing past service displays hugs board edges with dual parallel lanes (not a single robotic track). Mechanic idle fluff stays in north/side wing areas and does not cross the forklift road. Forklifts ignore bay ops danger (apron is south of the lights); they only flinch briefly when shot.

**Player pad (B2)** — interim: uses the **same captain checklist** as B1/B3 (need meters + red floors + multi-unit requests). Completing the list does **not** launch the ship — the player still owns exit timing. After a short post-service dwell, B2 waits **10–60s** then re-rolls a new checklist. Real player-request queue (sell / repair / buy / upgrade) remains future Home Base work.

**Dev panel reroll buttons** (Dev Mode): **REROLL SERVICES** re-checklists B2 only. **REROLL B1** / **REROLL B3** go further — full reset of that neighbor pad (staging freight, floor drops, mechanic/forklift claims, old checklist all dumped) and an **instant** fresh visitor dock (new seed/class/theme, no arrival animation or empty-pad wait) so designers can preview modular-ship variety on demand.

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

Ship silhouette is a **modular composition**: sections + hardpoint items from `src/ships/` (catalog IDs). The default player ship is **Generalist · Civilian Middle · Mk2 · variant `a`**, assembled from real catalog rows so a future Upgrade UI can rebuild it. Visually it keeps the filled multi-section **bell** hull (narrower bridge, main body, wider aft) with thruster cups, engine bell, dorsal turret, and mining laser. Mount poses resolve from the ship definition (starter matches legacy `ShipHardpoints.js`).

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

## Modular ships (prototype)

Code: `src/ships/` — catalogs, attach rules, generator, shared `ShipRenderer`.

### Swap groups

| Group | Classes | Pad Mk | Sections | Swapping |
|-------|---------|--------|----------|----------|
| **UltraLight** | Drone, Scout, Racer, Light Fighter | **Mk1** | 1 (hull) | No seats. 1 Mk1 engine + 2 Mk1 thrusters; Light Fighter only adds **1** Mk1 gun. Drone/Scout prebuilt. |
| **Light** | Fighter, Personal Transport | **Mk1** | 2 | Up to Mk2 engine + 4 Mk2 thrusters; Fighter has **2** Mk2 guns. Transport = small people shuttle (~2–4 seats). |
| **Standard** | Miner, Generalist, Science, Hauler, Fighter, Transport | **Mk2** | 3 | Up to Mk3; 1 engine; ≤8 thrusters; turret bank + optional forward guns. Fighter = tank; **Hauler** = freight; **Transport** = seats. |
| **Heavy** | Same labels as Standard (capital) | **Mk3** | 3 XL | Mk4–**Mk5**; **2** engines; **16** thrusters. Heavy Hauler = most cargo; Heavy Transport = most seats (Elite yacht / Mid cruise dress). No Jennings Mk3 bay yet. |

Pad docking is **exclusive** by group: UltraLight + Light only on Mk1 pads; Standard only on Mk2; Heavy only on Mk3. Jennings today: B1/B3 = Mk1, B2 (player) = Mk2 (disc radius `HANGAR.PAD_R` = 38). Blueprint shows Mk1/Mk2/Mk3 reference rings under the ship (Mk2 matches hangar; Mk1/Mk3 scaled from group model sizes).

**Cargo vs seats:** freight spots vs rideable seats, scaled by group/class/body Mk. UltraLight seats = 0. Ferry missions future; capacity + occupancy API now.

### Themes, Mk, variants

- Themes: Industrial, Military, Police, Civilian Poor / Middle / Upper, Elite — each with color-ways, a **wear dial**, and a **finish profile** (seams, grit, soot, sheen, stripe/mark style). Skins paint onto section meshes via `ThemeSkin.js` (Elite clean/glossy; Industrial hazard + welds; Police lightbar; Poor patches; etc.). **2D top-down** hulls are flat fills + thin trim (no side walls). **2.5D angled** uses shared `extrude` with heading-aware screen-up deck lift and side-wall peeks + thin trim (~0.45–0.7).
- Mk1–**Mk5** on sections and items; item Mk ≤ socket Mk (socket Mk capped by swap group).
- Theme / color-way / Mk / variant may **mix** on one ship (player free; random rare). In **Blueprint**, Theme, Color, Mk, and Variant are all **per section** (pick a section, then cycle that role’s catalog cell + paint; thrusters match their section by default).
- Exactly **3** shape variants (`a`/`b`/`c`) per Class+Section+Theme+Mk (and per item cell).
- **Per-hardpoint variant** (Blueprint **Mount roster**): each individual hardpoint (thruster, gun, turret, laser, engine, …) can cycle its own item's shape variant (a/b/c) independently of the owning section's variant — theme/Mk stay locked to the mount's current item so cosmetics still read coherently. Overrides survive section edits and **Apply to ship**; **Random** / **Reset** hand out a fresh loadout and clear them.

### Starter bill of materials

- Sections: `sec.generalist.{bridge,body,engine}.civMid.mk2.a`
- Items: Standard-group civMid Mk2 `a` main engine, maneuver thruster (×8), mining laser, small turret
- Rebuildable later from the same catalog ids

### Views

- Flight: top-down
- Hangar / inspection: 16 angled headings (22.5°) via `ShipViews.js` (parametric Y foreshorten + heading-aware side peeks; unique art polish later)
- **Dev Blueprint** (Dev Mode): side docks outside the play circle; click a section to inspect; under-circle selection dump (ids, geometryKey, hardpoint xy/face/items); Mode (2D/2.5D) + compass Heading (live); Exploded view; rotate / auto-spin; **Live controls** (hangar thruster/weapon FX, no flight) — see `PROJECT.md`

Parametric silhouettes cover all classes; Generalist `a` keeps bell HQ draw with shared extrude + ThemeSkin. Hardpoints share unit footprints with section draw (`SectionGeometry` + `class.scale`) so mounts sit on hull edges. Thruster cups are flush Mk-scaled nozzles. Hand-art hero polish deferred.

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

### Ambient traffic

Sparse NPC ships in open space (modular catalog defs). Density falls off with distance from Jennings Station: a few ships near the hangar, deep space almost empty but not zero. **Police are always present** around the station (minimum pack maintained). Behaviours by class (patrol, flyby, race, mine, scan, shuttle/freight, heavy deep cruise). **Spawn and despawn only off-screen** (outside the circular play viewport + margin) so ships never pop in or out of view; age expiry while visible steers them off-camera first. Hard caps + off-screen cull keep performance stable.

---

## UI

| Region | Purpose | Status |
|--------|---------|--------|
| Title screen | Fullscreen live starfield + nebula; ENTER HANGAR / QUICK LAUNCH / SETTINGS; build stamp + Changelog reader; soft vignette | Done |
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
