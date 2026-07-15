# Changelog

All notable changes to Hyperdrift are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/). Project uses pre-1.0 prototype versioning.

## [Unreleased]

### Incomplete — session wrap 2026-07-15
User-requested work that did **not** finish this session (agents aborted mid-pass). Pick up next:

- **UltraLight engines too big** — `ItemDraw.drawGenericEngine` still uses fixed ellipse size and ignores `classScale`, so tiny UltraLight hulls get Standard-sized engines (“condom” silhouette). Scale generic engines with class/swap group (UltraLight first; don’t regress Light/Standard/Heavy if they already look right).
- **Thrusters still too small** — cups are at `SHIP.THRUSTER_CUP_SCALE = 1.5` (+ plumes 1.15); user asked for another substantial bump and can barely see them.
- **Hardpoint positions vs scaled hull** — after class `scale` ups (e.g. Generalist ~1.55), mounts may still sit on pre-scale geometry. Audit `SectionGeometry` / `SectionCatalog` / `ShipHardpoints` / plume mounts so cups sit flush on the current hull.
- **Hangar visitors still feel small** — `HANGAR.VISITOR_PEER_MK_CHANCE` (peer pad-Mk) landed so same-group neighbors often share the player’s Mk, but sizing may still need a further visual pass so peers read ~player size (UltraLights stay smaller).
- **Ambient NPC mining** — miners show a mining-laser cue only; no asteroid HP drain yet.
- Blueprint **per-hardpoint item category** swap (variant cycler exists; theme/Mk/category still locked to socket defaults) — see PROJECT Dev Blueprint follow-ups.

### Planned
- Home Base: B2 player-request job queue (sell, repair, buy/load, upgrade)
- Ship Upgrade UI (grows out of Dev Blueprint mode)
- Unique silhouette polish per catalog variant
- Hand-art polish for hero variants (bell-quality)
- Hangar room / set-dressing editor (designer places props, 8-dir rotate, linger/gossip; Done saves layout file) — see `PROJECT.md`
- Asteroid fragmentation on destroy
- Fuel system for afterburner
- Radar minimap in corner panel
- Audio
- Resource drops (guns vs mining laser yield tradeoff)
- Precision power-pip allocation for laser / scanner

---

## [0.1.154] — 2026-07-15

### Fixed
- **Ambient space traffic** near Jennings Station was effectively empty: spawns were slow/probabilistic with no initial seed and no guaranteed police, so Quick Launch / hangar exit often showed a barren station. Flight now seeds a police pack + a few off-screen near-station ships, and `_maintainPolice` keeps at least `AMBIENT.MIN_POLICE` (3) on station patrol
- Ambient ships no longer **pop in or out** of view: spawn and despawn are gated to outside the circular play viewport (+ `VISIBLE_MARGIN`). Age expiry while on-screen extends life and steers the ship off-camera before cull; flybys enter from the view rim and only despawn after exiting

### Changed
- `AmbientTrafficSystem.update` takes camera `{ x, y, viewRadius }` from `GameEngine` (world-space viewport radius = `viewportRadius / effectiveZoom`)
- Police removed from random near-spawn weights (they come from maintain/seed only); near spawn accept rate and intervals tuned slightly for visible sparse traffic

---

## [0.1.153] — 2026-07-15

### Fixed
- Thruster plumes on the player ship (flight, Blueprint sandbox, hangar-docked view) drew *after* the hull/thruster-cup housing, so flames floated visibly on top of the deck instead of appearing to emerge from the nozzle bore. `Renderer._drawShipBody` now draws plumes first, then the hull + thruster cups/engine bell on top — the housing occludes the flame's base, matching the already-correct order used by `HangarVisitorShips.drawVisitorShip` for hangar neighbor/ambient traffic ships. Thruster physics linkage (`ship.thrusters`) unaffected

---

## [0.1.152] — 2026-07-15

### Fixed
- Elevator shaft + descent now read as the same tilted 2.5D shaft instead of a flat vertical drop: the well's depth rings, wall guide lines, and the descending pad/ship all sample one shared depth curve (`HangarBay._shaftDepthAt`) — south drift capped within the pad radius (was overshooting the hole edge), matching Y-squash as it sinks, and a darkening wash that merges the cab into the well's own shadow gradient as it descends

---

## [0.1.151] — 2026-07-15

### Added
- Hangar Dev panel **REROLL B1** / **REROLL B3** buttons — full reset of that neighbor pad (purges staging freight, floor drops, mechanic/forklift claims, and the old checklist) and instantly docks a fresh modular visitor (new seed/class/theme, locked at create) already seated — no slow arrival animation or empty pad wait. Uses `HangarBay.rerollSidePadVisitor(bayIndex)`

---

## [0.1.150] — 2026-07-15

### Added
- **Ambient space traffic** around Jennings Station: sparse modular ships with distance density falloff (a few near the hangar; rare deep; police may pack). Full catalog role coverage — patrol, flyby, race, mine, police scan (incl. player), shuttle/freight/cruise, science survey, heavy deep cruise — with hard caps + lifetime/distance cull (`AmbientTrafficSystem.js`)
- Hangar B1/B3 visitors use locked modular `ShipDefinition` + `ShipRenderer` (legacy silhouette draws retired)

### Fixed
- Hangar visitors no longer strobe through themes/colors: `shipDef` is locked at spawn/`equipPadVisitor`; propulsion and draw paths never re-roll `generateVisitor`; `paletteForSection` always resolves a valid colorway for the section theme

---

## [0.1.149] — 2026-07-15

### Added
- Blueprint **Mount roster** is now interactive: each hardpoint gets its own **Variant** (a/b/c) cycler, independent of that hardpoint's owning section variant — pick a different shape/morph per thruster, gun, turret, laser, or engine mount without changing the section's cosmetics. Item theme + Mk stay locked to the current mount (or the section default) so the livery still reads coherently; empty sockets show `— empty —` with disabled controls
- `BlueprintSandbox.cycleHardpointVariant(def, key, dir)` + `mountRosterEntries(def)` — per-hardpoint item lookup/override, reusing the existing catalog + attach-rule checks (`canAttachItem`)

### Changed
- Hardpoint variant picks persist through section theme/Mk/color edits and **Apply to ship** (survive `cloneShipDef`); **Random** and **Reset to default** still hand out a fresh definition, so they clear per-hardpoint overrides back to catalog defaults as expected

---

## [0.1.148] — 2026-07-15

### Changed
- Blueprint **2.5D angled** mode: toned down the North-facing over-elongation reported against the flat 2D silhouette — `angledDepthScale` squash range narrowed from 0.68–0.88 to 0.85–0.95 (North/South now ~0.90, was ~0.78), and `extrudeAngled` deck-lift height roughly halved (`h * 0.85` → `h * 0.45`, floor `2.0` → `1.2`px). Side-wall peek is still visible, just subtler; **2D top-down** unchanged

---

## [0.1.147] — 2026-07-15

### Changed
- Maneuvering thruster cups **~50% larger** (`SHIP.THRUSTER_CUP_SCALE = 1.5`, applied uniformly so Mk1/Mk2/Mk3 stay proportionally consistent) — was reading too small since the flush-nozzle redesign
- Maneuvering thruster plumes bumped **~15%** (`SHIP.THRUSTER_PLUME_SCALE = 1.15`) to match the larger cups without overpowering the main engine flame

---

## [0.1.146] — 2026-07-15

### Changed
- Blueprint **2.5D angled** mode: heading-aware hull **side peeks** (deck lifts toward screen-up; visible side-wall quads). **2D top-down** stays flat — no side geometry or extrusion

---

## [0.1.145] — 2026-07-15

### Changed
- Blueprint sandbox defaults to **2D top-down** view on open and on **Reset to default** (was 2.5D angled)

---

## [0.1.144] — 2026-07-15

### Changed
- Blueprint background: drafting grid now continues faintly **inside** the pad Mk discs (wider spacing, lower alpha) instead of stopping at the outermost ring, so the field reads as one continuous sheet; Mk rings redraw on top and stay the dominant read
- Blueprint easter egg: zoomed-out view peeks a faint **Mk4** pad circumference + subtle label near the play-circle rim (decorative only; Mk1–3 gameplay radii unchanged)

---

## [0.1.143] — 2026-07-15

### Changed
- Blueprint **Reset to default** button restores Generalist Mid Mk2 starter plus default camera (2.5D, heading N, live/explode/spin off)

---

## [0.1.142] — 2026-07-15

### Changed
- Blueprint HUD layout is **viewport-aligned** to the play circle (docks hug circle left/right; title above; inspector matches circle width below) — resizes from measured gutters; compact/narrow modes when resolution is tight

---

## [0.1.141] — 2026-07-15

### Changed
- Pad sizing: **Mk1** radius 30→**22** (UltraLight/Light scales tuned to fit); **Mk3** 76→**80**
- Standard / starter bell **fill Mk2** — Generalist scale **1.55** (bell draw now applies `class.scale`); other Mk2/Mk3 class scales raised to match; `SHIP_EXTENT` updated for hangar clearance

---

## [0.1.140] — 2026-07-15

### Changed
- Ship hull/hardware visuals: softer drop shadows, clearer side-wall face shading, thinner trim strokes (~0.45–0.7); depth from fills/bevels instead of chunky outlines; theme skins refined (weld beads, elite razor bloom); thrusters/guns/turrets match
- Blueprint background: drafting grid + radial construction lines extend **outside** the pad Mk rings (pads stay clear in the center)

---

## [0.1.139] — 2026-07-15

### Added
- Blueprint **Live controls** toggle (hangar-style WASD/QE/Space/weapons + thruster FX; ship stays locked at origin; yaw allowed). Auto-spin disables while live is on.

### Fixed
- Blueprint heading readout tracks live yaw; rotate ⟲/⟳ steps from the current 16-way compass snap

---

## [0.1.138] — 2026-07-15

### Changed
- Blueprint background: concentric **pad Mk rings** (Mk1/Mk2/Mk3) under the ship instead of the angled deck grid; Mk2 matches hangar B2 pad radius; current group’s pad is highlighted

---

## [0.1.137] — 2026-07-15

### Changed
- Theme skins are richer: each theme carries a finish profile (seams, rivets, welds, grit/soot, sheen/gloss, stripe + mark style) plus secondary colorways (stripe/glow/dirt); `ThemeSkin` paints them onto every section. Industrial hazard tape, military stencil, police lightbar stripe, poor patches, mid badge, upper/elite chrome pin-stripe. Extra colorways: Scrap Green, Arctic Silver

---

## [0.1.136] — 2026-07-15

### Changed
- Blueprint HUD redesign: chrome lives in the black outside the sacred viewport circle (left/right docks); selection inspector glued under the circle with full debug dump (Copy); click a section card to inspect; mount roster on the right; circle raised/sized for a usable inspector band

---

## [0.1.135] — 2026-07-15

### Changed
- Maneuver thrusters redrawn as short flush nozzles (straight housing + rimmed bore) — no flared cup / claw silhouette

---

## [0.1.134] — 2026-07-15

### Changed
- Hardpoints sit on section hull edges (shared `SectionGeometry` + matching `class.scale` on draw and mounts); Heavy/Light/UltraLight footprints redesigned so mounts no longer float
- Maneuver thruster cups much smaller overall; cup size scales with socket **Mk** (and light morph); shorter blue plumes to match

---

## [0.1.133] — 2026-07-14

### Changed
- Weapon mount faces: bridge guns are **chin/underside**; **dorsal turrets** body-centerline only; **wing** guns underside; **side** guns on the flanks (draw order matches)

---

## [0.1.132] — 2026-07-14

### Changed
- **Heavy** is a size tier mirroring Standard classes (Miner / Generalist / Science / Hauler / Fighter / Transport) — removed single Mega/Heavy class
- Standard gains **Fighter** (tank) and **Transport** (people-mover); Light keeps Fighter + Personal Transport
- Hardpoint budgets by group (UltraLight Mk1 lean; Light Mk2; Standard ≤Mk3 / 8 thrusters; Heavy Mk4–5 / 2 engines / 16 thrusters)
- **Mk5** catalog tier; cargo vs **seats** capacity (Hauler = freight, Transport = seats; UltraLight seats = 0)
- Parametric silhouettes for all classes via section/item draw registries; Heavy Transport Elite = yacht dress, civMid = cruise

---

## [0.1.131] — 2026-07-14

### Changed
- Blueprint UI: pick Group/Class, then a **card per section** with its own Theme / Color / Mk / Variant
- Camera readout shows **Mode** (2D · top-down vs 2.5D · angled) and **Heading** compass (N, N-NE, NE, …)

---

## [0.1.130] — 2026-07-14

### Added
- Blueprint **Exploded view** — separates sections and hardpoint items; faded dotted lines link mating faces and sockets to pulled-out parts

---

## [0.1.129] — 2026-07-14

### Changed
- Blueprint **Theme**, **Mk**, **Variant**, and **Color** are all per **Section** (pick section, then cycle that section’s cosmetics / catalog cell)

---

## [0.1.128] — 2026-07-14

### Changed
- Blueprint **Color** is per **Section** (pick section, then cycle that section’s colorway); thruster cups + plumes tint from the owning section’s palette

---

## [0.1.127] — 2026-07-14

### Changed
- Ship swap groups: **UltraLight** (Drone / Scout / Racer / Light Fighter), Light, Standard, **Heavy** (was Mega)
- Pad docking is exclusive by group — UltraLight+Light → Mk1 · Standard → Mk2 · Heavy → Mk3 (Jennings B1/B3 = Mk1, B2 = Mk2)
- Blueprint UI: top-level **Group**, then **Class** (filtered), then theme / color / Mk / variant

---

## [0.1.126] — 2026-07-14

### Fixed
- Blueprint sandbox zoom uses a dedicated range (up to ~22×) so the ship can fill the play circle (was stuck at flight max 2×)

---

## [0.1.125] — 2026-07-14

### Added
- **Dev Blueprint mode** — instant modular ship sandbox (class / theme / colorway / Mk / variant; 2D or 2.5D + rotate / auto-spin). Entry: title **BLUEPRINT (DEV)** when Dev Mode is on, and hangar Dev panel **BLUEPRINT**. Apply copies the build onto the player ship (or next hangar/flight if opened from title)

---

## [0.1.124] — 2026-07-14

### Fixed
- Staging races: if the crane gets a pile→pile crate first, the helping mechanic abandons that ferry; if a mechanic already has it (or is mid-handoff), the crane abandons that move and re-picks

---

## [0.1.123] — 2026-07-14

### Changed
- Crane trolley XY travel is a bit faster so staging prefers the crane when he is free
- Idle bay mechanics ferry their own bay’s staging piles (same rules as the crane) only while the crane is busy; they skip piles he is already working

---

## [0.1.122] — 2026-07-14

### Changed
- Mechanics walk to the **target hardpoint** for install/uninstall and weld there (sparks at the mount), instead of a random hull station

---

## [0.1.121] — 2026-07-14

### Fixed
- **REROLL SERVICES** fully resets B2: starter ship loadout, clears all pad staging piles + floor drops, dumps in-transit forklift/crane/mechanic freight for that bay, parks crew, and replaces the checklist (old tasks removed — not left pending)

---

## [0.1.120] — 2026-07-14

### Added
- Hangar Dev panel sim clock: **SLOW** (0.5×) · **PAUSE** · **PLAY** (1×) · **FAST** (2×) · **FAST2X** (4×) — scales real update delta so crew/logistics actually run faster or slower

---

## [0.1.119] — 2026-07-14

### Changed
- Service board shows a single **Install** row with pips again; each pip still maps to a specific hardpoint + catalog item in the sim (strip/install/forklift unchanged)

---

## [0.1.118] — 2026-07-14

### Fixed
- Docked hangar ship no longer yaws on the pad: Q/E thruster plumes still play, but heading stays locked to the turntable

---

## [0.1.117] — 2026-07-14

### Fixed
- Hangar **REROLL SERVICES** button shows again (Dev Mode on): UI sync ran before hangar mode was set, so the button stayed hidden

---

## [0.1.116] — 2026-07-14

### Changed
- Captain **Install** tasks each bind an exact hardpoint + catalog item (forklift brings that part; mechanic strips only that hardpoint if occupied). Board still shows one **Install** row with pips
- Ambient forklift upgrade freight pulls only from the player-equipable ItemCatalog (no legacy random UPGRADE_KINDS)

---

## [0.1.115] — 2026-07-14

### Fixed
- Mining laser beam / hitscan now start at the **muzzle tip** (past the bridge), not the under-chin hardpoint pivot

---

## [0.1.114] — 2026-07-14

### Fixed
- Hangar mechanics no longer weld-loop without removing parts: `stripCategory` is kept across trip reassignment, strip-before-install is prioritized, and strip recovers the category from staged inbound freight when the hint was lost

---

## [0.1.113] — 2026-07-14

### Changed
- Starter mining laser hardpoint sits **under the bridge**; bridge draws on top so the canopy reads clearly and only the barrel tip pokes past the nose (empty chin socket when unequipped)

---

## [0.1.112] — 2026-07-14

### Fixed
- Stripped starter hull no longer shows a mounted engine: orange housing/bell is the **mainEngine item**; aft section is an empty bay socket until installed

---

## [0.1.111] — 2026-07-14

### Fixed
- Starter bell hull 2.5D no longer skews as if viewed from starboard; bevel is symmetric (centroid inset). Engine housing recentered on the aft centerline. Removed hangar Y-squash that exaggerated the tilt

---

## [0.1.110] — 2026-07-14

### Added
- Settings: **Dev Mode** toggle (default on); hangar **Reroll Services** button (bottom-left) when Dev Mode is on — restores starter loadout + new captain checklist

### Fixed
- Upgrade install no longer soft-fails forever on categories with no sockets / Mk too high (was snapping freight back to UP·IN)
- Mechanics no longer strip every hardpoint — only one matching-category part when a staged install needs a free socket

---

## [0.1.109] — 2026-07-14

### Changed
- Hangar upgrade logistics use **ItemCatalog** parts: forklift freight carries catalog ids; mechanics **unequip** a hardpoint (part visibly gone) before **install** onto an empty matching socket; install blocked until strip frees a slot

---

## [0.1.108] — 2026-07-14

### Changed
- Starter ship now draws as **3 separate section meshes** (engine → body → bridge) plus **11 hardpoint items** (engine bell, 8 thruster cups, mining laser, dorsal turret)
- Stronger 2.5D extrusion (real side-wall quads between footprint and deck); hangar uses screen-Y foreshortening so thickness reads clearly

---

## [0.1.107] — 2026-07-14

### Changed
- Starter Generalist Mid Mk2 `a` redrawn as industrial 2.5D (extruded plates, canopy depth, worn scuffs/rivets, layered engine bell + thruster cups + turret) — same bell silhouette, higher fidelity

---

## [0.1.106] — 2026-07-14

### Added
- Modular ship system (`src/ships/`): classes, swap groups, themes/color-ways/wear, full section + item catalog ID matrix (parametric), attach rules, generator, 16-angle view helpers, shared renderer
- Player ship is Generalist · Civilian Middle · Mk2 · variant `a` bill of materials (bell silhouette from catalog parts — rebuildable later in Upgrade UI)
- Docs: modular taxonomy in GDD / VISION / PROJECT; OPEN_QUESTIONS §12 resolved for Mk / swap groups / Mega no-dock

### Changed
- Flight / hangar player draw goes through `ShipRenderer` (starter retains bell parity); mounts resolve from `ship.shipDef`

---

## [0.1.105] — 2026-07-14

### Changed
- Bullet / shell freight redrawn to match the ammo-can concept sheets: open metal cans with upright lids, rivets, handles, latches, foam inserts
- Bullets: brown 7.62 can with two belt-linked tip-up rows; Shells: olive 40mm can with 3×2 fat artillery rounds

---

## [0.1.104] — 2026-07-14

### Changed
- Shell crates redrawn as olive military ammo boxes with short fat tip-up artillery rounds (no more noodle strokes)
- Upgrade freight is distinct sci-fi ship parts again: laser cannon, ball turret, armor plate, thruster nozzle, main engine, sensor dish

---

## [0.1.103] — 2026-07-14

### Changed
- Hangar freight redrawn as worn industrial 2.5D with 8-direction facing (matches forklift / mechanic carry)
- Service cargo looks like the real request: open-top fuel-cell crates, belt-ammo boxes, large-shell crates
- Load / unload uses six generic container color schemes; install / uninstall parts are complex non-distinct housings
- Checklist spawn labels: `BULLETS` / `SHELLS` (was shared `AMMO`)

---

## [0.1.102] — 2026-07-14

### Fixed
- Forklift cargo rides the drawn fork tips during turnarounds (8-dir visHeading) instead of snapping with logic facing ±1

---

## [0.1.101] — 2026-07-14

### Changed
- Crane operator head pass: distinct dark facemask (separate from helmet) with 8-direction look toward the current task destination
- Cab levers rewired to real work — XY travel, hoist up/down, claw open/close — with clearer throws and console labels

---

## [0.1.100] — 2026-07-14

### Changed
- Overhead crane + manned cab redrawn in the worn industrial 2.5D station look (bridge girder, end trucks, trolley, cables, claw)
- Crane operator suit fixed to crane-crew theme; helmet/visor tracks the current job target (pickup / dropoff / deck aim)
- Claw fingertip tip math unchanged so cargo lift/lower alignment stays believable

---

## [0.1.99] — 2026-07-14

### Changed
- Hangar props rebuilt again for clearer 2.5D read (inset tops, far/near faces, labels)
- Bay danger lanes / door flight paths kept clear — only apron-flank workbenches + small bay terminals per bay
- Wing lore dressing: stores racks, umbilical spools, weld screens, O₂ racks, shift boards, break crates (asymmetric)
- Forklift yard props at hub ends (charger, tire rack, cones, parts crate) — off the road and outside stalls

---

## [0.1.98] — 2026-07-14

### Changed
- Hangar floor props rebuilt from scratch as 2.5D industrial set dressing (workbenches, bay terminals, parts racks, drum stacks, suit lockers, pallets, diagnostic carts, fuel farms)
- Removed old flat shelves/desks/hose reels/door lockers and mirrored filler
- Each bay has purposeful linger props (workbench + terminal); wings get asymmetric hangout / parts / gear spots; gossip waypoints retargeted

---

## [0.1.97] — 2026-07-14

### Changed
- Hangar floor set dressing redrawn (worn 2.5D variants for shelves, desks, toolbenches, barrels, fuel tanks, hose reels, lockers, crate stacks)
- Shop floor layout de-mirrored; each bay now has its own toolbench + narrow monitor pedestal (full desks stay in the wings only)
- Mechanic linger / gossip stand points updated to match the new prop placements

---

## [0.1.96] — 2026-07-14

### Changed
- Mechanics redrawn as worn industrial 2.5D deck crew (helmet, visor, O2 pack, boots, torch/pad) with 8-direction visual heading
- Three bay suit themes — both mechanics on a bay share one: B1 rust/hazard amber, B2 station teal, B3 olive utility

---

## [0.1.95] — 2026-07-14

### Fixed
- Forklift 2.5D draw order: far tires / ROPS posts / mast-vs-cab sort by screen Y so distant wheels no longer paint over the cabin (all 8 headings)

---

## [0.1.94] — 2026-07-14

### Changed
- Forklifts redrawn as worn industrial 2.5D station trucks (counterweight, ROPS cage, mast, beacon) with 8-direction visual heading — job facing / fork tip math unchanged

---

## [0.1.93] — 2026-07-13

### Added
- Title screen Changelog link (underlined, same font as the build stamp) opens an opaque newest-first reader of `CHANGELOG.md` over the live starfield (title UI hidden while open)

---

## [0.1.92] — 2026-07-13

### Fixed
- Crane never drops checklist inbound freight (install / load) onto outbound uninstall pads — waits or retargets inbound instead

---

## [0.1.91] — 2026-07-13

### Fixed
- Mechanic outbound drops keep their claimed 2×2 quadrant — no more pop into another slot (or vanishing when the reserved slot was the only free one)

---

## [0.1.90] — 2026-07-13

### Changed
- Crane job picks keep priority tiers, but among peers prefer the nearer pickup — higher-weight work can still win a modest detour

---

## [0.1.89] — 2026-07-13

### Fixed
- Forklifts no longer leave a stall before seated, or bounce home on touching the roadway — hub jobs wait for a real park settle, and in-flight inbound fetches only abort if the visit/item/pad is actually dead

---

## [0.1.88] — 2026-07-13

### Fixed
- Outbound staging: multiple forklifts can clear different quadrants of the same south-out pad in parallel (per-slot claims, matching inbound)

---

## [0.1.87] — 2026-07-13

### Changed
- Forklift parking dashed border omits the north edge where it already meets the roadway paint

---

## [0.1.86] — 2026-07-13

### Changed
- Forklift parking outline uses the same dashed yellow paint as the roadway borders

---

## [0.1.85] — 2026-07-13

### Changed
- Forklift parking apron: no per-stall outlines; full area bordered in the same dashed yellow paint as the roadway, with faded industrial parking stencils

---

## [0.1.84] — 2026-07-13

### Fixed
- Forklift hub restored south of the roadway; fuel hoses coiled by their tanks instead of crossing the road

---

## [0.1.83] — 2026-07-13

### Changed
- Forklifts leaving a stall merge onto the roadway in ~1 truck length (short diagonal), then drive to their destination

---

## [0.1.82] — 2026-07-13

### Changed
- Removed spare parked forklifts — hub keeps extra empty stalls; only the four working trucks remain

---

## [0.1.81] — 2026-07-13

### Changed
- Spare parked forklifts draw with an empty cab (no driver)

---

## [0.1.80] — 2026-07-13

### Changed
- Forklift hub widened to half the south wall (centered) with truck-sized stalls; drivers claim the closest empty spot before pathing home; two spare empty trucks sit parked on the apron

---

## [0.1.79] — 2026-07-12

### Fixed
- Forklift inbound fetches no longer abort at the left bulkhead when multi-unit same-type checklist rows (Fuel×N, Bullet/Shells AMMO, etc.) falsely shared one crate — each unit keeps its own serviceKey, and claimed staging stays open until the crate actually spawns

---

## [0.1.78] — 2026-07-12

### Fixed
- Crane dropoffs keep their locked slot — no longer reassigned to another quadrant on release

---

## [0.1.77] — 2026-07-12

### Fixed
- Forklifts claim a drop slot at job start (reserved until deposit) so approach lanes stay stable — no mid-path slot flips / moonwalks
- Drop-off crates lerp from forks onto the slot again instead of popping into place

---

## [0.1.76] — 2026-07-12

### Fixed
- Forklifts overshoot ~1.5 lengths past a wrong-side slot approach, then turn in — no more moonwalk into the opposite quadrant

---

## [0.1.75] — 2026-07-12

### Fixed
- Forklifts stage checklist inbound in parallel (one truck per pending item, not one per bay)

---

## [0.1.74] — 2026-07-12

### Changed
- Service checklist: labels shifted left for 5 pips; 6+ units of one type wrap to another labeled row; cargo load/unload can request up to 8 units

---

## [0.1.73] — 2026-07-12

### Changed
- Service checklist labels (`Hull` / `Fuel` / `Bullet` / `Shells` / `Install` / `Load` / `Unload`); circles left-align to a fixed column locked to the widest label

---

## [0.1.72] — 2026-07-12

### Changed
- Service checklist: one row per job type with status circles for each unit; checkmark when all units for that type are done

---

## [0.1.71] — 2026-07-12

### Changed
- Captain service requests: red meters always queue work; yellow uses curved chance; green skips
- Deficit depth scales units (1–3) for fuel, hull, bullets, shells, load, and unload — checklist shows multiple rows; each unit fills a chunk
- Ammo split into separate `BULLETS` / `SHELLS` checklist lines (shared AMMO crate art)
- Upgrades capped at 0–2; light visitor-type bias (combat → ammo/hull, freighters → cargo)

---

## [0.1.70] — 2026-07-12

### Fixed
- Forklifts no longer flip/moonwalk on approach: facing follows dominant travel (not tiny X corrections), and slot-facing locks only from the correct side of the lane

---

## [0.1.69] — 2026-07-12

### Fixed
- Forklifts no longer stall at drop-off: carried crates can deposit even when inbound soft-cap blocks new fetches; failed deposits requeue instead of eating cargo; full-pile queues no longer hold exclusive claims

---

## [0.1.68] — 2026-07-12

### Changed
- Telescoping bay doors: outer panel retracts too; nest tucks into the jamb so the mouth opens as wide as a full slide while staying in-bay

---

## [0.1.67] — 2026-07-12

### Changed
- Bay doors use three-segment telescoping leaves per side — panels nest at each bay's jamb instead of sliding into neighboring bays

---

## [0.1.66] — 2026-07-12

### Fixed
- Bay door arrivals on **B1/B3 only**: danger warn/clear, animated door open, green lights, then the visitor ship flies in (B2 player map landing unchanged)

---

## [0.1.65] — 2026-07-12

### Changed
- Hangar default zoom frames B2 with the service board bottom at the viewport rim (computed from viewport size)
- Door landing stays wide through approach/brake, then zooms in during pad settle; title elevator entry starts fully zoomed in and zooms out after the pad seats at deck level

### Fixed
- Elevator entrance zoom-out no longer runs during the rise — only after the pad reaches its top position

---

## [0.1.64] — 2026-07-12

### Added
- Title **Home Base** entry raises the player ship from the B2 elevator (B2 stays unsimmed during warmup; map landing unchanged)

### Fixed
- B2 elevator raise no longer plays the 8-thruster landing-lower burst (reserved for door landing only)

---

## [0.1.63] — 2026-07-12

### Added
- Hangar headless warmup (~60s sim, B1/B3 visitor/logistics traffic) runs before the first frame; B2 stays fresh for title entry and map landing

---

## [0.1.62] — 2026-07-12

### Fixed
- Forklift creep aligns fork tines under cargo (not truck body center over the slot)
- Crane locks onto a specific pile slot for pickup — trolley, aim shadow, and removal all match (no more SW aim / SE grab)
- Mechanics step in with hands/cargo center over the slot, not body center over it
- Forklifts keep fork-forward facing during pile work (travel direction no longer flips forks behind the driver on drop-off)
- Forklifts drive forward to the approach, then turn into the slot on final approach (no moonwalk)
- Crane aim/hoist shadows merged into one soft deck blob that grows as the arm lowers (raised baseline kept clearly visible)

### Added
- Mechanics use four slot approach lanes (two west / two east) at mid/north piles with smooth pickup and drop handoff

---

## [0.1.61] — 2026-07-12

### Fixed
- Forklifts no longer empty-trip the bulkheads: fetch claims + only leave when inbound cargo can spawn
- Carrying forklifts queue at the destination pile instead of parking at the hub
- Mechanics clear service-board faces (wider bypass, gate-first dodge) instead of clipping edges
- Hot-zone skirts prefer the goal side of the boards (less south-then-north turnaround)
- Crane hoist aims at the exact 2×2 pile slot for pick and drop; hook stops at fingertip height so cargo does not snap on pickup
- Mechanics walk across dock pads instead of soft-repelling around them

### Changed
- Mechanic corridors use uid-stable dual lanes per gap (less identical robotic paths)
- Bay-computer linger has multiple stand points with occupancy (less stacking)
- Forklift inbound pop-in uses the left bulkhead; outbound haul-off uses the right

### Added
- Crane predictive ground aim shadow under the trolley (where the arm would land if dropped)
- Forklifts use four slot approach lanes (two west / two east), lower forks, creep forward, and raise with smooth cargo transfer

---

## [0.1.60] — 2026-07-12

### Added
- Pad status boards: three-column layout (ship stats, cargo grid, service) + bay footer
- Size-scaled cargo hold Mk ladder (0×0 … 5×5); visitor type maps Mk; player caps at 3×3
- Display-only component Mk labels (hull/fuel/bullets/shells randomized 1–3)

### Fixed
- Crane returns to top-left gantry park when idle (no more one-frame crawl / jam camping)
- Pilot door tickers only marquee when a line is too wide to fit

### Changed
- Service work animates board meters live (hull/fuel/ammo → 100%; cargo grid add/remove on load/unload)
- Bay hardpoint piles use stable 2×2 item slots (no visual reshuffle when crates move)

---

## [0.1.59] — 2026-07-12

### Fixed
- Pilot door tickers sit above bay doors (below windows, between door lights)
- Crane / mechanic dumps no longer park fuel·ammo on UP pads or upgrades on CG pads
- Misshelved UP/CG freight is high-priority crane work (unsticks install loops)
- Mechanic idle fluff stays north of the forklift road (wing linger only)
- Service displays occlude mechs walking on their north side (2.5D draw order)

### Changed
- Blast-wall visual removed — service display boards use that exact footprint
- Crane revalidates dropoff family after pickup and refuses mismatched shelves

---

## [0.1.58] — 2026-07-12

### Added
- Fixed hangar crew roster (11): `forklift1–4`, `B1–B3Mechanic1/2`, crane — always on stage
- Per-bay service boards on taller blast shields (checklist rows + header light)
- Pilot-facing door beacons + door-header status tickers (unified B1–B3 light schema)
- Forklift hub (south wall center); wing shelves/desks/toolbenches; gossip/piddle idle for mechanics

### Changed
- Mechanics are bay-scoped (own checklist only); stair hatches removed
- Forklifts serve any bay; idle at hub; leave screen only for fake cargo pop in/out
- Crane parks top-left when idle
- Mechanic idle biases near-bay vs wing linger from time since last bay task

---

## [0.1.57] — 2026-07-12

### Changed
- B2 uses the same captain service checklist as B1/B3; completing it does not launch — after dwell, wait 10–60s then re-roll a new list (player still owns exit)

---

## [0.1.56] — 2026-07-12

### Fixed
- Visitor checklist no longer stalls when staged freight is exported, duplicated, or left as `ready` orphans
- Forklifts won't re-deliver into a bay being cleared; inbound despawn restages checklist needs
- Crane keeps service cargo on its bay, sweeps non-matching south-in blockers, and won't dump tagged inbound off-station
- Unload checklist completes on pile deposit; bay clear waits for floor drops / carriers; ambient fallback weld is B2-only
- Mechanics no longer ping-pong on the blast-wall apron during bay ops (skirt stick + don't fight corridor crosses)
- Pedestrians no longer N/S bounce on cool B2: hatch rally uses corridor X; pad keep-out skipped on apron jobs (toPile/linger)
- B2 no longer endless ambient hull-welding; exit-reroute won't yank leavers back for fluff weld

---

## [0.1.55] — 2026-07-12

### Changed
- B1/B3 visitors roll ship need meters and a captain service checklist on door land / raise-for-service / spawn-occupied (never idle door-leave with empty visit)
- Empty checklist → short dwell then elevator-only transfer; after service, exit by door or elevator
- Empty-bay elevator raise: immediate leave (`raiseLaunch`) or ascend-and-stay for service (`raiseArrive`)
- Forklifts / crane / mechanics follow checklist order (parallel where safe); inbound freight only what the bay still needs
- Destroyed staged service cargo/upgrades are re-ordered until the checklist completes
- Longer empty-bay cooldown and post-service dwell

---

## [0.1.54] — 2026-07-12

### Fixed
- Mechanics no longer start welding at a danger-lane edge when skirting a hot bay (skirt waypoints no longer count as arriving at the hull)
- Elevator / ops cancel in-progress hull weld/repair; job revalidates so crew don't weld air after a ship leaves

---

## [0.1.53] — 2026-07-12

### Changed
- Mechanics path around hot danger lanes toward their destination instead of idling at the edge; when the bay clears they take the shorter straight path again
- Exception: if they dropped cargo still inside a hot bay, they wait at the edge until they can reclaim it

---

## [0.1.52] — 2026-07-12

### Changed
- Bay ops danger: mechanics scramble only from the lit danger rectangle to the nearest safe floor, then resume after a short random delay
- Arrive/depart: mechanics drop cargo / abort welds; reclaim their crate after the bay clears (crane sweeps unclaimed drops after a few seconds)
- Blast-wall pathing hugs shield edges and avoids hot danger lanes (hold at the edge instead of cutting through)
- Forklifts ignore bay ops danger; short flinch only when shot

---

## [0.1.51] — 2026-07-12

### Fixed
- Door threshold hazard paint no longer restamps over arriving ships; duplicate sill stripes removed (floor caution box is the single warning band)

---

## [0.1.50] — 2026-07-12

### Fixed
- Open bay doors show the same continuous spacefield as the viewport windows (shared chunk anchor); sealed doors keep the dark pocket

---

## [0.1.49] — 2026-07-12

### Fixed
- Hangar north-wall occlusion: ships exit through open doors and remain visible in viewport glass; solid wall covers them elsewhere
- Door restamp no longer paints an opaque pocket over departing ships; wall fill uses evenodd holes so stacked window+door apertures stay clear
- Player B2 launch/land uses the same outside→wall→inside draw order as visitors

---

## [0.1.48] — 2026-07-12

### Changed
- Pad rim: 6 yellow caution streaks are wired lights — steady on for departure, elevator, and pad turn; flash on arrival
- Elevator bay-outline danger lights stay fully lit at arrive/depart brightness (halo included) with no chase/blink

---

## [0.1.47] — 2026-07-12

### Changed
- Elevator shafts: inner opening matches pad radius exactly; hatched rim just outside; 2.5D well with depth gradient, vertical guides, and south-shifted depth rings
- Descending/ascending pad+ship are clipped to the shaft circle so the hangar occludes anything outside the opening until the pad reseats

---

## [0.1.46] — 2026-07-11

### Added
- Round 2.5D elevator shafts under hangar pads (darker deeper) for lower/raise reads
- Visitor pad turntables match B2: empty faces south; door landings settle south then turn north; elevator raises nose-north; pad turns south after depart
- Visitor thruster/engine plumes use player plume style (flow lean/cone), scaled to hull; mounts match each silhouette’s cups
- Departing visitors pass through open doors then are occluded by the north wall except viewport glass

---

## [0.1.45] — 2026-07-11

### Added
- B1/B3 ambient arrive/depart: door landings and launches with crew evac, beacons, and danger-lane chase
- Under-deck elevator alternate: steady warning lights, pad lowers south (2.5D), returns empty — or empty pad raises a ship that quickly launches
- Empty neighbor bays stay cargo-free; after a ship leaves, crane + forklifts sweep all hardpoints (including inbound) off the bay

---

## [0.1.44] — 2026-07-11

### Changed
- Landing preserves dock-entry heading from space; yaw thruster couples swing nose-south before the retro brake

### Fixed
- Landing pad brake uses nose thrusters only (no main-engine retro plume)

---

## [0.1.43] — 2026-07-11

### Changed
- Launch: after doors open, all 8 maneuver thrusters burst once while the ship lifts (scale up + ground shadow), then main-engine exit north
- Landing: enter B2 at dock-entry heading → yaw thrusters to nose-south → retro-brake over pad → 8-thruster settle (scale down, shadow fades) → pad turntable 180° to face north → doors close

---

## [0.1.42] — 2026-07-11

### Added
- Title: **ENTER HANGAR**, **QUICK LAUNCH**, **SETTINGS** (controls moved off the title card)
- Pause: **Return to Main Menu** and **Settings** wired
- Settings → controls sandbox (ship-only viewport; no world/asteroids)
- Jennings Station hangar HUD + B2 door **LAUNCH** with danger lights, crew evac, door open, main-engine exit into space
- Overworld **Jennings Station** exterior; approach + **Enter** to dock with scripted reverse landing

### Changed
- Home Base hangar is the primary new-game entry; quick launch still skips to space near the station

---

### Fixed
- Mechanic blast-wall pathing: route via nearest inter-bay corridor (not job `bay` pad), sticky near→far→hold chain, same-side lateral dodge — stops wrong-wall marches and end-to-end ping-pong

---

## [0.1.40] — 2026-07-11

### Fixed
- Mechanic blast-wall pathing: sticky near→far bypass chain so mid-crossing Y flips no longer pull crew back into the wall

---

## [0.1.39] — 2026-07-11

### Fixed
- Danger-zone lanes narrowed (half-width 72) so neighboring bay verticals no longer overlap; thinner strip strokes
- Mechanic pathing around blast walls: stable bypass side, eject if embedded in wall slab, segment-cross detection

---

## [0.1.38] — 2026-07-11

### Fixed
- Hangar blast backsplash is solid (no center gap); crew path around wall ends
- Stairs moved further south; danger-zone light lanes widened clear of cargo hardpoints

---

## [0.1.37] — 2026-07-11

### Changed
- Hangar stairs moved south of per-bay blast backsplash walls (crew walk around wall ends)
- Per-bay black/yellow danger-zone floor lights (door → former stair line + horizontal closer); yellow cells light on danger; `incoming` / `departing` chase flows on verticals; B2 auto-`danger` when player engines/thrusters fire

---

## [0.1.36] — 2026-07-11

### Changed
- Hangar bay visual pass: industrial walls/floor (panels, rivets, grime, oil stains), caution markings, fuel tanks/hoses, tool stations, barrels, drains, per-bay door warning beacons (`idle` / `warning` / `open`)
- Removed hangar overhead bay lights (floating washes and runway fixtures)

---

## [0.1.35] — 2026-07-11

### Fixed
- Hangar bay windows share one continuous space backdrop (three peeks into the same chunk, not three identical copies)

---

## [0.1.34] — 2026-07-11

### Changed
- Forklifts prioritize outbound takeOut over inbound bringIn (anti-clog)
- Empty forklifts leaving the bay peel off to grab outbound cargo instead of driving past it

---

## [0.1.33] — 2026-07-11

### Fixed
- Mechanics no longer walk up from stairs toward the ship only to turn around and despawn
- Idle crew are not spawned onto the deck; welders only appear when chosen deliberately
- Load/install jobs re-validate before walking to the hull (no empty-handed ship touch)

---

## [0.1.32] — 2026-07-11

### Fixed
- Forklifts no longer spawn cargo mid-bay after a drop — they exit to fetch the next inbound load
- Install / uninstall ship mounts play continuous weld sparks like hull repairs
- Station crew claim tasks (job+pile); claimed work is filtered out of other crew pick lists

---

## [0.1.31] — 2026-07-11

### Fixed
- Idle crew walking to despawn will reroute if new doable work appears
- Mechanics no longer strip ship mounts without a staged replacement (UP·IN); unload only when bay is exporting
- Forklifts no longer flood empty bays with inbound freight (per-bay inbound soft cap)
- Crane hard-prioritizes clearing blocked destinations, then at-capacity piles

---

## [0.1.30] — 2026-07-11

### Changed
- Hold cargo draws as rectangles only; ship-mount upgrades keep complex silhouettes
- Cargo hardpoints use a 2×2 slot grid (horizontal + vertical), max 4 items per area
- Crane / mechanics / forklifts skip full destinations and pick the next doable task
- If only blocked tasks remain, actors linger at the task start until the blockage clears
- Clearing full piles is prioritized for whoever can help (forklifts: south row only)
- With no doable or blocked work left, NPCs path to despawn

---

## [0.1.29] — 2026-07-11

### Changed
- Hangar cargo hardpoints are now **3×6** (two columns per bay: left=inbound, right=outbound)
- Rows: north=ship upgrades, mid=hold cargo, south=forklift ↔ storage I/O
- Crane / forklift / mechanic jobs follow in/out lanes (forklift south-in / south-out only)
- Mechanics also install/remove upgrades (top-row pipeline) alongside mid-row cargo trips
- Stair hatches are one per bay (between that bay’s columns)
- Ship-mount upgrades draw as distinct parts (laser, turret, armor, thruster, engine, sensor), not crates
- Hold cargo silhouettes expanded (ore, ammo crates, barrels, etc.)

### Changed (docs)
- Hangar bay reframed as **Home Base**: seed for new-game start and between-mission hub (extraction / rogue-lite). Bay exists today via title → VIEW SHIP; launch/return loop not wired yet (see `GDD.md`)
- Home Base design note: B1/B3 bay work stays ambient sim; **B2** load/unload/repair/upgrade only runs when the player requests it, with a queue that completes per finished animation (`GDD.md`)

---

## [0.1.28] — 2026-07-11

### Changed
- Hangar default zoom is **9.0** (closer hull inspection on entry)
- Hangar draw order: deck → crew → ships → crane (hulls occlude pedestrians; gantry stays overhead)
- Hangar mechanics enter/exit via stair hatches only (bulkhead doors stay forklift-only)
- Crane claw opens when empty, partially closes around cargo, and opens on drop; carried boxes hang at the fingertips
- Crane trolley has a manned cabin (operator + travel/hoist/grip levers) — no automation fiction

---

## [0.1.27] — 2026-07-11

### Fixed
- Hangar mechanics no longer vanish after reaching cargo: hull approach used `pad.y` on dock targets that had no `y`, producing NaN positions (looked like a despawn; also blocked respawns because “ghost” mechs still counted)
- Hangar mechanics no longer teleport after ship work: pad keep-out is a soft push instead of a hard snap onto the apron
- Hangar mechanics no longer jam south of stair hatches when exiting (approach↔stair waypoint band oscillated in place)
- Hangar spawn prefers a floor of 2 pedestrians before forklifts (cargo pressure was starving mechanic respawns)
- Mechanic flee no longer arms stair exit (avoids popping out on the hatch after a hazard retreat)

---

## [0.1.26] — 2026-07-11

### Fixed
- Hangar mechanics no longer despawn at stair tops or on failed box jobs (clear hatch before work; weld fallback instead of instant exit)

---

## [0.1.25] — 2026-07-11

### Fixed
- Hangar mechanics no longer despawn when fleeing thruster/weapon hazard (retreat and resume)

### Changed
- Crane bridge and trolley drawn smaller; trolley parks farther north of cargo piles

---

## [0.1.24] — 2026-07-11

### Changed
- Hangar mechanics walk straight up to the ship hull (aft for cargo; hull stations for weld)
- Crane trolley parks north of cargo; hoist drops the hook onto the pile
- New mechanic job: empty-handed hull welding with torch sparks

---

## [0.1.23] — 2026-07-11

### Changed
- Hangar mechanics walk pile ↔ assigned ship without pad keep-out twitch; multi-trip load/unload loops
- Four under-deck stair hatches (one per cargo column) between mid and south rows — primary human entry/exit
- Overhead crane rebuilt as runway + bridge + trolley + hoist with full-deck 2D travel

---

## [0.1.22] — 2026-07-11

### Changed
- Hangar cargo is real objects on a 3×4 hardpoint grid; crane/forklift/mechanic transfers move boxes between piles
- Crane + forklifts share the south row; mechanics load/unload mid-row piles ↔ docked ships
- Forklifts enter/leave via L/R interior bulkhead doors (bring-in or take-out by bay inventory pressure)
- Humans only use those doors; bulkheads occlude them except through the open doorway
- Cargo boxes are destructible by turret and mining laser

---

## [0.1.21] — 2026-07-11

### Changed
- Hangar View Ship is full-frame (no circular play clip); flight mode keeps the circle
- Hangar weapon aim works across the whole canvas

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
