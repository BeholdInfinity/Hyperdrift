# Hyperdrift Crewline — Open Questions

**Purpose:** Capture unresolved design decisions for future conversation sessions. Nothing here is decided unless marked ✅ elsewhere in the docs.

**How to use:** Pick a section, talk through it, then move answers into [`VISION.md`](VISION.md) (or [`GDD.md`](GDD.md) for prototype scope) and strike through or delete resolved items here.

---

## Session guide (suggested order)

A focused "iron out concerns" session could go:

1. **Identity & tone** — what does the game *feel* like?
2. **Failure & persistence** — what does losing mean?
3. **Session shape** — length, players, PvP timing
4. **Logistics loop** — the make-or-break mechanic
5. **Stations & handoffs** — when to leave your seat
6. **Science & information** — avoid the silo
7. **Progression & fairness** — snowballing, skill gap
8. **Scope & phasing** — what ships when

---

## 1. Identity & tone

| # | Question | Why it matters |
|---|----------|----------------|
| 1.1 | **Primary genre spine:** Barotrauma-logistics, Sea of Thieves-social, extraction-tension, or something else? | Every scope argument resolves differently depending on the spine |
| 1.2 | **Tone:** comedy chaos, grim survival, tense realism, or mix? | Drives audio, UI, death penalties, how funny failure is |
| 1.3 | **Working title lock-in:** Hyperdrift vs Hyperdrift Crewline vs other? | Branding, repo name, player expectations |
| 1.4 | **Target audience:** hardcore crew sim fans, casual co-op friends, extraction PvP crowd? | Difficulty, session length, onboarding |
| 1.5 | **Elevator pitch (one sentence)** — yours, not Copilot's mashup? | Keeps future features aligned |

---

## 2. Failure, loss & persistence

| # | Question | Why it matters |
|---|----------|----------------|
| 2.1 | **What happens when the ship is destroyed?** Lose run loot only? Lose ship permanently? Insurance/repair meta? | Core extraction loop; emotional weight of "ship is the character" |
| 2.2 | **What happens when a player dies mid-run?** Respawn on ship? Dead until extract? Permadeath for avatar? | Crew size, risk during logistics |
| 2.3 | **Extract failure vs death** — distinct outcomes or same? | Clarity of win/lose states |
| 2.4 | **Between-run persistence:** keep ship upgrades, cargo, reputation across sessions? | Live-service vs roguelike run |
| 2.5 | **How punishing should loot loss be?** Full wipe like Tarkov, partial like Sea of Thieves, mostly safe? | Player anxiety vs story generation |

---

## 3. Session shape

| # | Question | Why it matters |
|---|----------|----------------|
| 3.1 | **Target session length?** 30 / 60 / 90 minutes? | MVP scope, pacing, crisis budget |
| 3.2 | **Target player count?** 2–4? Up to 6? Solo viable for how much content? | Station design, idle risk |
| 3.3 | **Lobby / matchmaking model?** Drop-in crew, pre-formed party, open crew slots on a ship? | Social design |
| 3.4 | **When does PvP enter development?** After PvE MVP? Optional servers? Always-on? | Roadmap ordering |
| 3.5 | **Mission structure:** one objective per run, branching, sandbox roam, contract board? | Pilot role depth |

---

## 4. Logistics loop (make-or-break)

| # | Question | Why it matters |
|---|----------|----------------|
| 4.1 | **Is physical carrying fun for 30–60 minutes?** (Prototype gate — not yet tested) | Entire game lives or dies here |
| 4.2 | **Carry capacity:** one item at a time, stack, cart, conveyor automation later? | Busywork vs depth |
| 4.3 | **Processing times:** instant at machine, timed, skill-based minigame? | Pacing during quiet moments |
| 4.4 | **How many parallel production chains in MVP?** Fuel + ammo only, or more? | MVP scope |
| 4.5 | **Automation progression:** can ships eventually belt/automate, or always manual? | Horizontal progression, expert ships |
| 4.6 | **Priority conflicts:** explicit queue/orders system, or emergent shouting? | UI vs voice comms meta |
| 4.7 | **Corrosive gas clouds** — damage over time, instant hurt, repair required after? | Pilot skill expression |

---

## 5. Stations & handoffs

| # | Question | Why it matters |
|---|----------|----------------|
| 5.1 | **Seat transition:** instant swap, walk-to-seat time cost, lockout cooldown? | "Leave gunner to repair" tradeoff |
| 5.2 | **Can one player hold two stations** (e.g. pilot + science on small ship)? | Solo/small crew |
| 5.3 | **Unmanned station behavior:** turret auto-idle, drift, penalties? | Cost of leaving seat |
| 5.4 | **Captain vs Pilot:** same seat or separate authority role? | Dictator risk |
| 5.5 | **Minimum crew to operate:** can one person wing it between stations in PvE? | Solo design |
| 5.6 | **AI/automatons:** how much less efficient than humans? Replaceable? Cost? | Small crew, offline ships |

---

## 6. Combat & exterior

| # | Question | Why it matters |
|---|----------|----------------|
| 6.1 | **Gunner reload model:** per-shot manual, magazine, belt feed from logistics only? | Links Layer 2 ↔ 3 |
| 6.2 | **Grapple vs pilot scoop:** exclusive lists of what each can collect? | Role overlap |
| 6.3 | **Enemy types in MVP:** drones, ships, environmental only? | PvE scope |
| 6.4 | **Boarding:** in vision later — melee inside ship, or abstracted? | Huge scope multiplier |
| 6.5 | **Ship weapons:** fixed turrets only, or pilot-facing guns too? | Station count |

---

## 7. Science & information

| # | Question | Why it matters |
|---|----------|----------------|
| 7.1 | **What are "pips"?** Power routing, CPU, skill points, literal UI pips? | Science ↔ engineer overlap |
| 7.2 | **Decoding minigame style:** puzzle, rhythm, hacking, pattern match? | Silo risk |
| 7.3 | **How often must science produce crew-usable intel?** Every minute? On demand? | Idle vs overload |
| 7.4 | **Sensor fog-of-war:** shared tactical screen — identical for all stations or role-filtered? | Information asymmetry |
| 7.5 | **Science offline:** if station empty, sensors freeze, degrade, or autopilot? | Unmanned station rules |

---

## 8. Progression & fairness

| # | Question | Why it matters |
|---|----------|----------------|
| 8.1 | **Horizontal upgrade examples** — list 5 you'd ship first | Progression design |
| 8.2 | **Beginner vs expert ships:** same hull different automation, or different hull classes? | Skill gap mitigation |
| 8.3 | **Snowball controls:** matchmaking by gear, extract zones, diminishing returns? | PvPvE health |
| 8.4 | **Meta progression outside runs** — account level, blueprint unlocks, purely cosmetic? | Retention vs purity |

---

## 9. Visuals & UX

| # | Question | Why it matters |
|---|----------|----------------|
| 9.1 | **Interior 2.5D art scope:** full ship at MVP or abstracted "logistics map" first? | Art pipeline, timeline |
| 9.2 | **Exterior view:** stay top-down 2D (current prototype) or 2.5D/3D later? | Engine choice |
| 9.3 | **Tactical screen at stations:** picture-in-picture, full overlay, switchable? | UI layout |
| 9.4 | **Browser-first forever, or native client later** for multiplayer? | Networking architecture |
| 9.5 | **Voice comms:** in-game proximity, party only, rely on Discord? | Social design |

---

## 10. Prototype & technical path

| # | Question | Why it matters |
|---|----------|----------------|
| 10.1 | **Next prototype milestone after flight:** one logistics chain solo, or local 2-player first? | Roadmap |
| 10.2 | **Networking stack** when ready: WebRTC, dedicated server, third-party? | Technical foundation |
| 10.3 | **Single-ship focus** for years, or multiple hulls early? | Content scope |
| 10.4 | **Keep vanilla JS / no build step** for Crewline, or adopt tooling when multiplayer lands? | Dev velocity vs scale |

---

## 11. Non-goals (explicit cuts)

Deciding what you **won't** do is as valuable as what you will.

| # | Question | Why it matters |
|---|----------|----------------|
| 11.1 | **Explicit non-goals list** — what are you ruling out? (e.g. MMO scale, twitch shooter, single-player campaign) | Prevents scope creep |
| 11.2 | **Mobile / console** — ever, or PC/browser only? | Input design |
| 11.3 | **Pay-to-win, battle pass, cosmetics-only monetization** — any model in mind? | Design constraints |

---

## Resolved (move answers here when decided)

| # | Question | Decision | Date |
|---|----------|----------|------|
| — | Roles are fixed classes at lobby | **No** — unseated = logistics for all; seated = station role; swap on the fly | 2026-07-10 |
| — | Pilot scoops by flying over resources | **Yes** — gunner grapples what pilot missed | 2026-07-10 |
| — | Fuel from gas clouds; avoid corrosive clouds | **Yes** (details TBD) | 2026-07-10 |

---

## Notes from design review (for conversation)

- Copilot's comps: *Void Crew*, *Pulsar*, *Barotrauma*, *Sea of Thieves*, *Lovers in a Dangerous Spacetime* — none combine **full carry logistics + extraction + PvPvE + fluid stations**
- Strongest original hook: **ship as multiplayer factory under fire**
- Prototype gate: logistics fun > combat polish > PvP
- Current browser prototype validates **flight only** — see [`GDD.md`](GDD.md)

---

*Last updated: 2026-07-10*
