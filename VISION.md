# Hyperdrift Crewline — Long-Term Vision

**Working title.** The north-star document for where this project is heading over months or years.

| | |
|---|---|
| **Current prototype** | Solo top-down flight — see [`GDD.md`](GDD.md) |
| **This document** | Multiplayer crew-based spaceship game — long-term design |
| **Dev handoff** | [`PROJECT.md`](PROJECT.md) |

> *"Barotrauma meets Order Up meets Sea of Thieves meets extraction shooters — in a spaceship."*

---

## Vision Statement

Create a multiplayer crew-based spaceship game where winning is less about individual mechanical skill and more about **communication, coordination, prioritization, and crisis management**.

The fantasy is not being a lone space hero.

The fantasy is being one member of a barely functional spaceship crew desperately keeping a ship alive while navigating hostile space, gathering resources, completing missions, and escaping with the loot.

- Every victory should feel earned.
- Every defeat should produce a story.
- Every player should constantly make tradeoffs between their primary responsibilities and the current needs of the ship.

---

## Two Layers, One Game

| Layer | Mode | What happens |
|-------|------|----------------|
| **Outside the ship** | PvPvE | Exploration, combat, resource fields, extraction, hostile players and environment |
| **Inside the ship** | Co-op | Logistics, repairs, station operation, crisis management — the crew keeps the factory running under fire |

The ship is effectively a **multiplayer factory** that must keep functioning during combat and extraction. That combination — not "spaceship crew" alone — is the distinctive hook.

---

## Role Model: Stations, Not Classes

**Critical design rule (author intent):**

> There are no fixed class assignments at lobby. **Roles are defined by where you are.**

| State | What you are | What you do |
|-------|--------------|-------------|
| **Unseated (on foot inside ship)** | Logistics crew | Move fuel cells, ore, ingots, ammo; repair hull/systems; fight fires; respond to crises — *every player in this state is doing "engineer work"* |
| **Seated at Pilot station** | Pilot / Captain | Semi-Newtonian navigation, scooping, mission focus, crew comms |
| **Seated at Gunner station** | Gunner | Turret aim/fire, manual reload, grapple salvage the pilot missed |
| **Seated at Science station** | Science Officer | Sensors, pip management, data-device decoding, map/sensor upgrades |

**Any player can sit at any empty station.** Gunners can leave turrets to haul ammo or patch a breach. The pilot's chair can go empty while someone else covers science. Roles change on the fly when the crew decides — or when panic demands it.

Design implication: the challenge is not "balance four classes" but **balance four stations plus the always-available logistics layer**, and make leaving a station feel like a meaningful tradeoff (turret unmanned, sensors dark, no pilot scooping).

---

## Core Pillars

### 1. The Ship Is The Character

Players are not the heroes individually. **The ship is.** The crew working together is.

The ship should feel: alive · fragile · valuable · customizable · difficult to master.

Players become emotionally attached to their vessel. **Losing the ship should matter.**

### 2. Every Action Has A Human In The Loop

No magic resource generation. No instant reloading. No invisible logistics.

Whenever possible: **someone has to do the work** — and usually someone has to **carry it there**.

### 3. Controlled Chaos

Chaos must create **decisions**, not helplessness. *"We can save this."* — not *"Nothing matters."*

**Good chaos:** fuel shortage, empty ammo belt, hull breach, sensor failure, incoming enemy.

**Bad chaos:** all five at once, every fight.

**Crisis budget (target):** one major disaster + one minor disaster at a time — not six simultaneous fires.

### 4. Crew Cooperation First

Serious engagements should require multiple humans coordinating. Small crews or solo players can survive quieter periods — hauling, refining, repairing between fights — with the fear of being caught vulnerable away from the bridge.

Automatons may assist later but are less efficient than humans.

Typical comms:

- *"Need ammo in port turret."*
- *"Fuel line is empty."*
- *"Science, what's on sensors?"*
- *"I'm leaving gunner — breach in mid deck."*
- *"Someone get to the bridge."*

### 5. Stories Over Winning

Victory matters. **Stories matter more.** See [Success Criteria](#success-criteria).

---

## Game Structure

### High-Level Loop

1. Launch mission
2. Explore space (PvPvE)
3. Gather resources (pilot scoop + interior processing)
4. Complete objectives
5. Fight AI and/or players
6. Upgrade ship
7. Extract successfully
8. Keep acquired loot

---

## Gameplay Layers

### Layer 1: Space Flight (Pilot station)

- Semi-Newtonian navigation — asteroids, enemies, positioning
- **Scooping:** fly directly over materials, fuel, upgrades to collect instantly (no grapple needed)
- **Fuel:** only from correct gas clouds; avoid corrosive clouds
- Mission progress and extraction calls
- Primary communication hub for the crew
- While seated: mostly navigates via the **dominant top-down tactical screen** on the bridge, plus ship status (pips, energy, ammo, science, upgrade levels)

Good pilots create opportunities. Bad pilots create disasters.

### Layer 2: Internal Logistics (Unseated — everyone)

The heart of the game. A **chaos-management** loop (Order Up / Overcooked energy): physical hauling under time pressure, not abstract menus.

| Loop | Pipeline |
|------|----------|
| **Fuel** | Scooped liquid → Fuel Processor → **Fuel Cell (carried)** → Engine input (or other sinks) |
| **Ammunition** | Raw material → input belt/container → **carried to** Ingot Forge → **carried to** Ammo Fabricator → **carried to** correct ammo conveyor → Gunner turret feed |
| **Repair** | Damage → diagnose → repair → restore function |

The internal network should feel like a **miniature factory operating under fire**.

**Prototype-this-first question (from design review):**

> Is moving objects along these chains fun for 30–60 minutes — or merely realistic?

If yes, build outward. If no, redesign before adding combat and PvP.

### Layer 3: Combat (Gunner station)

- Request ammo, **manually reload** turrets, aim and shoot
- **Grappling hook** to reel in items the pilot did not scoop
- Point defence, threat prioritization, ammo type selection (future)
- View: WW2 bomber turret — outside glass, partial interior (see teammates, local breaches, station screen)

Gunners can **leave the turret** to join logistics when the ship is on fire. That tradeoff is intentional.

### Layer 4: Information (Science station)

Whoever sits at Science:

- Operates sensors and **manages pips**
- Decodes recovered **data-devices** via minigame → science points → map and sensor upgrades
- Produces intel the crew acts on (hidden fields, threats, routes, weaknesses)

Science must not be an isolated corner minigame. Output should constantly answer: *"Science, what do you see?"*

View: seated at a large board of panels and switches; also has access to the shared tactical screen.

---

## Shared UI: Tactical Screen at Every Station

Each station includes a **top-down tactical display** showing the exterior, expanding outward as sensors improve. Seated players operate their primary interface but share the same strategic picture (with sensor-limited range).

Only **unseated** players see the ship interior in **2.5D** — corridors, machines, breaches, carry paths. That's the logistics play space.

---

## Visual Philosophy

### Outside (tactical)

Top-down. Readable. Information-first. Whole crew can reason about positioning.

### Inside (logistics)

2.5D interior. Corridors and travel time matter. Station placement matters. Veterans know the carry routes instinctively.

### Per-station views (seated)

| Station | Primary view |
|---------|----------------|
| Pilot | Bridge — dominant 2D tactical screen + status outputs (pips, energy, ammo, science) |
| Gunner | Turret glass (external aim) + peripheral interior + tactical screen + local breach visibility |
| Science | Panel board + minigames + tactical screen |

---

## PvPvE Philosophy

Players are dangerous. The environment is dangerous. Greed is dangerous.

Most matches should force decisions: fight, hide, salvage, extract, pursue, escape. Survival often means **avoiding** fights, not winning them.

---

## Progression Philosophy

Avoid vertical power creep (+100% DPS, god-tier hull).

Prefer **horizontal progression**: ammo types, sensors, mining vs combat vs stealth builds. Veterans gain **options**, not automatic wins.

Consider **ship complexity tiers**: beginner hulls more automated (lower ceiling); expert hulls more manual (higher ceiling) — so skill gap doesn't hard-lock new crews.

---

## Design Risks & Mitigations

| Risk | Symptom | Mitigation |
|------|---------|------------|
| **Logistics dominance** | *"Whoever hauls carries the game"* | Logistics is everyone's default unseated job; seated roles add unique value; crisis creates leave-seat moments |
| **Idle stations** | Gunner on TikTok for 5 minutes | Secondary duties, grapple salvage, manufacturing, point defence; pilot has harvesting/stealth/routing |
| **Science silo** | Science plays alone in a corner | Decoding and sensors feed crew decisions in real time |
| **Captain dictator** | One player decides everything | Distributed authority — pilot navigates, seated gunner owns loadout, science owns research path, crew votes extraction |
| **Busywork** | Warehouse simulator | Hauling creates **prioritization** (*fuel vs ammo vs repair*), not infinite boxes |
| **Snowballing** | Winners unstoppable | Horizontal upgrades, extraction uncertainty |
| **Information overload** | Twelve urgent things | Crisis budget; MVP cuts scope to fuel + ammo + repair + basic fight |
| **Skill gap** | Expert crews 3× faster | Optional automation on simpler ships |

---

## Recommended MVP (Crewline)

Build only:

**Stations:** Pilot · Gunner · Science · Unseated logistics (all players)

**Systems:** Fuel chain · Ammo chain · Repairs · Basic upgrades · Basic PvE combat

**Player count:** 2–4 (assumed)

**Exclude initially:** PvP · boarding · advanced crafting · massive progression · full interior art pass

**Questions to answer:**

1. *Is the internal logistics loop fun for 30–60 minutes?*
2. *Is leaving your station to help feel like a meaningful tradeoff?*
3. *Does science output change crew decisions in real time?*

If yes → expand. If no → redesign before complexity.

---

## Success Criteria

- Players constantly communicating
- Every **station** and the logistics layer matter
- Ship barely survives
- Crew argues about priorities
- Extraction feels tense
- Defeat creates stories; victory feels earned

**Ideal reaction:**

> *"Everything was on fire, we were out of ammo, one engine was dead, someone jumped off gunner to feed the forge, science found a shortcut through the rocks, and somehow we made it out."*

**That is the game.**

---

## Open Questions (not decided)

- **Tone:** comedy chaos vs grim survival vs both?
- **Ship death:** lose run only, lose ship permanently, insurance?
- **Session length target:** 45 min? 90 min?
- **When PvP enters:** after PvE MVP proves fun?
- **Automatons:** how inefficient vs a human hauler?
- **Primary genre spine:** Barotrauma-logistics vs Sea of Thieves-social vs extraction-tension?

---

## Relationship to Current Prototype

The browser prototype (`GDD.md`) validates **Layer 1 flight feel** in isolation: semi-Newtonian movement, procedural space, readable thrusters. It does not yet test logistics, stations, or multiplayer.

The prototype hangar is the early seed of **Home Base** — where a run starts and where the crew returns between missions (outfit, stash, depart, extract). That maps to the extraction / between-run persistence questions in [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) (§2). Launch-from-hangar and return are not wired yet. Neighbor-pad busywork stays ambient sim; player-pad load/unload/repair/upgrade is intended to run only on explicit requests (queued, animation-gated) — see [`GDD.md`](GDD.md) Home Base.

Path forward: nail flight → grow Home Base into the real start/return surface → prototype one logistics chain on foot → add second player and station handoffs → PvE pressure → only then PvP and full interior.

See [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) for unresolved decisions. See [`CHANGELOG.md`](CHANGELOG.md) for what has actually shipped.
