# Stranger in the Galaxy — Open Questions

**Purpose:** Capture unresolved design decisions for future conversation sessions. Nothing here is decided unless marked ✅ elsewhere in the docs.

**How to use:** Pick a section, talk through it, then move answers into [`VISION.md`](VISION.md) (or [`GDD.md`](GDD.md) for prototype scope) and strike through or delete resolved items here.

**North star:** [`VISION.md`](VISION.md) — *Stranger in the Galaxy*. Multiplayer / Crewline ideas are extensions, not the campaign spine.

---

## Session guide (suggested order)

1. **Identity & tone** — comedy vs grit balance (presentation layers are locked — see Resolved)
2. **Act structure & onboarding** — how hard Acts 1–3 play
3. **Bot companion** — autonomy vs player agency
4. **Station & economy** — restoration gates, supply/demand depth
5. **Failure & persistence** — death, debt, station loss
6. **Endgame two-front war** — pacing into corporate + pirate conflict
7. **Multiplayer modes** — when relative to campaign
8. **Prototype path** — Phase 1 narrative stub vs Phase 2 ship interior next

---

## 1. Identity & tone

| # | Question | Why it matters |
|---|----------|----------------|
| 1.1 | **Tone mix:** how much comedy (bot, hangar chaos) vs grit (debt, betrayal, abandonment)? | Audio, UI, death penalties, how funny failure is |
| 1.2 | **Working title lock-in:** *Stranger in the Galaxy* forever, or rename later? Repo stays *Hyperdrift* for now? | Branding, repo, player expectations — **partial:** title wordmark + live Jennings backdrop ship *Stranger*; logo PNG is concept only; repo/folder still Hyperdrift |
| 1.3 | **Target audience:** cozy builders, hardcore sandbox sim fans, story RPG players, or blend? | Difficulty, session length, onboarding |

---

## 1b. Narrative presentation (remaining detail)

Presentation model is locked in [`VISION.md`](VISION.md) (hybrid portraits + ambient; unified 2.5D interiors). Open polish questions:

| # | Question | Why it matters |
|---|----------|----------------|
| 1b.1 | **Portrait art pipeline** — hand-drawn plates, procedural canvas busts, or photo-bashed? | Production cost |
| 1b.2 | **Choice density** — rare branch moments, or frequent small choices? | Script scope |
| 1b.3 | **Ambient bark language** — text bubbles, subtitle strip, audio-only later? | UI clutter in hangar |
| 1b.4 | **Player face in portraits** — shown, silhouetted, or off-screen listener? | Identity fantasy |

---

## 2. Act structure & onboarding

| # | Question | Why it matters |
|---|----------|----------------|
| 2.1 | **Act 1 length** — hours of dock work before crew offer, or compressed tutorial arc? | Retention vs teaching depth |
| 2.2 | **Act 2 crew life** — how long before betrayal? Multiple missions or one voyage? | Emotional investment in being exploited |
| 2.3 | **Act 3 solitude** — how long alone before the bot light appears? | Loneliness beat vs frustration |
| 2.4 | **Can players skip / accelerate acts** on replay? | Accessibility, second playthrough |
| 2.5 | **How scripted vs systemic** is the betrayal / abandonment? | Narrative control vs sandbox freedom |

---

## 3. Bot companion

| # | Question | Why it matters |
|---|----------|----------------|
| 3.1 | **Autonomy ceiling** — what can the bot never do without the player? | Keeps player the protagonist |
| 3.2 | **Personality upgrade model** — unlock tree, story beats, or emergent from jobs? | Companion fantasy |
| 3.3 | **Bot death / damage** — can he be destroyed permanently? | Emotional stakes |
| 3.4 | **Station automation vs bot** — same system or distinct layers? | UI complexity |
| 3.5 | **Ship role handoffs** — latency / skill of bot vs human Crewline seats | Combat readability |

---

## 4. Station restoration & living economy

| # | Question | Why it matters |
|---|----------|----------------|
| 4.1 | **First hangar online gate** — minimum systems before first customer? | Early loop pacing |
| 4.2 | **Economy depth at MVP** — simple buy/sell margins, or full supply/demand simulation? | Scope |
| 4.3 | **Faction relationships** — how many factions in first system? | Diplomacy surface |
| 4.4 | **Hiring / wages** — fair-pay fantasy vs management min-max? | Theme alignment |
| 4.5 | **Idle / companion app** — same save as campaign, or soft-asynchronous? | Architecture |

---

## 5. Ships, fleet, combat

| # | Question | Why it matters |
|---|----------|----------------|
| 5.1 | **First player-built ship** — fixed starter blueprint from salvage, or freeform scrap build? | Act 3 identity |
| 5.2 | **Fleet command** — real-time orders, away-mission reports, or abstracted returns? | Magnate fantasy |
| 5.3 | **Combat role of the player late-game** — still flies, or mostly commands? | Fantasy continuity |
| 5.4 | **Modular catalog from prototype** — keep swap groups / Mk as campaign ship rules? | Continuity with Hyperdrift sandbox |

---

## 6. Failure, loss & persistence

| # | Question | Why it matters |
|---|----------|----------------|
| 6.1 | **Ship destroyed** — insurance, rebuild from station, soft fail? | Attachment to "your ship" |
| 6.2 | **Station under attack / bankrupt** — lose the home, partial damage, raid cycles? | Endgame tension |
| 6.3 | **Player death** — respawn, hospital debt, permadeath ironman? | RPG stakes |
| 6.4 | **Debt / credits wipe** after Act 2 betrayal — always full wipe, or residual? | Narrative beat clarity |

---

## 7. Endgame (corporate + pirate)

| # | Question | Why it matters |
|---|----------|----------------|
| 7.1 | **Victory conditions** — destroy both, buy out corp, reform system law, multiple endings? | Closure design |
| 7.2 | **When pressure starts** — reputation threshold, story flag, or player-triggered? | Pacing |
| 7.3 | **Can the player ally with one enemy against the other?** | Diplomacy depth |
| 7.4 | **Post-endgame sandbox?** | Longevity |

---

## 8. Multiplayer modes (Crewline)

Former *Hyperdrift Crewline* north-star questions — still relevant for **Combat Ship Chaos** and related co-op modes. Not campaign blockers.

### 8a. Session shape

| # | Question | Why it matters |
|---|----------|----------------|
| 8.1 | **Target session length?** 30 / 60 / 90 minutes? | Mode MVP scope |
| 8.2 | **Target player count?** 2–4? Up to 6? | Station design |
| 8.3 | **When relative to campaign?** After solo MVP? Parallel vertical slice? | Roadmap |
| 8.4 | **PvP in ship chaos mode?** Never, optional, or later? | Scope |

### 8b. Logistics & stations

| # | Question | Why it matters |
|---|----------|----------------|
| 8.5 | **Is physical carrying fun for 30–60 minutes?** (Prototype gate) | Mode lives or dies here |
| 8.6 | **Carry capacity / automation progression** | Busywork vs depth |
| 8.7 | **Seat transition cost** (walk vs instant) | Leave-seat tradeoffs |
| 8.8 | **Unmanned station behavior** | Cost of leaving seat |
| 8.9 | **Science role** — keep in multiplayer mode? Campaign equivalent? | Role count |

### 8c. Hangar chaos & idle companion

| # | Question | Why it matters |
|---|----------|----------------|
| 8.10 | **Hangar chaos win condition** — survival timer, score, shared campaign currency? | Mode identity |
| 8.11 | **Idle oversight permissions** — what can phone client never do? | Exploit / engagement |

---

## 9. Prototype & technical path

| # | Question | Why it matters |
|---|----------|----------------|
| 9.1 | **Next coding milestone:** Phase 1 narrative stub or Phase 2 ship interior first? | Roadmap (phases locked in VISION) |
| 9.2 | **Networking stack** when multiplayer modes start | Technical foundation |
| 9.3 | **Keep vanilla JS / no build step** into campaign scale, or adopt tooling later? | Dev velocity |
| 9.4 | **Browser-first forever, or native client later?** | Platform |
| 9.5 | **Interior walker** — share hangar pan/zoom camera, or character-follow camera? | Feel of on-foot play |

---

## 10. Non-goals (explicit cuts)

| # | Question | Why it matters |
|---|----------|----------------|
| 10.1 | **Explicit non-goals** — e.g. full MMO, extraction-only PvPvE as main game, twitch arena | Prevents scope creep |
| 10.2 | **Mobile / console** — ever, or PC/browser only? | Input design |
| 10.3 | **Monetization model** (if any) | Design constraints |

---

## 11. Ship component Mk variants (prototype stub)

Hangar pad status boards still show display Mk stubs; modular catalog now defines real Mk1–4 on sections/items.

| # | Question | Why it matters |
|---|----------|----------------|
| 11.2 detail | Exact combat/logistics numbers per Mk | Balance pass still open |
| 11.4 detail | Shop vs hangar install timing UX | Upgrade UI not built |

---

## Resolved (move answers here when decided)

| # | Question | Decision | Date |
|---|----------|----------|------|
| — | Long-term north star | ***Stranger in the Galaxy*** — space-life RPG / station builder / economic sandbox | 2026-07-16 |
| — | Elevator pitch | Stardew × X4 × Space Haven × Star Citizen living-world; betrayed dock worker → system’s top trade hub | 2026-07-16 |
| — | Hyperdrift Crewline as whole-game vision | **No** — folded under multiplayer extensions (Combat Ship Chaos + related modes) | 2026-07-16 |
| — | Near-term development focus | Keep *Hyperdrift* prototype as **engine / feel sandbox**; no narrative reshape yet | 2026-07-16 |
| — | Progression fantasy | Worker → Crewman → Victim → Survivor → Shipbuilder → Station Founder → Magnate / Armada | 2026-07-16 |
| — | Act-based onboarding | Act 1 dock labor → Act 2 crew ops → betrayal → Act 3 alone rebuild → bot → station growth | 2026-07-16 |
| 1.4 | Camera / presentation long-term | **Layered:** Space top-down 2D; Hangar / ship interior / derelict all **unified 2.5D**; story = portrait dialogue; ambient = in-world barks | 2026-07-16 |
| — | Narrative hybrid | Flow-breaking chatter stays in-world; emotional / branching beats lift to portraits | 2026-07-16 |
| — | Derelict explore camera | **Same 2.5D** as hangar/ship (not side-view platformer); loneliness via set dressing / systems | 2026-07-16 |
| — | Interior architecture | Shared interior exploration core; ship vs derelict = layout packs + mood | 2026-07-16 |
| — | Sandbox build order | Narrative stub → ship interior slice → derelict slice → bind loops → economy/fleet/MP | 2026-07-16 |
| — | Roles are fixed classes at lobby (Crewline mode) | **No** — unseated = logistics; seated = station role; swap on the fly | 2026-07-10 |
| — | Pilot scoops by flying over resources (Crewline mode) | **Yes** — gunner grapples what pilot missed | 2026-07-10 |
| — | Fuel from gas clouds; avoid corrosive clouds (Crewline mode) | **Yes** (details TBD) | 2026-07-10 |
| 11.1 | Which components get real Mk tiers? | **Sections + hardpoint items**. Hangar board hull/fuel/ammo labels remain stubs until wired to loadout. | 2026-07-14 |
| 11.2 | What does each Mk change? | **Socket authority + stub stats**. Full balance TBD. Item Mk ≤ socket Mk. | 2026-07-14 |
| 11.3 | Player cargo bay ceiling | **Keep** 3×3 (Mk.5) for Standard; Mega/large visitors higher; Scout often 0. | 2026-07-14 |
| 11.4 | When do Mk upgrades happen? | Hangar **install jobs** + future Upgrade UI; not mid-flight. | 2026-07-14 |
| — | Cross-class part mixing? | **Swap groups** — Scout prebuilt; Light / Standard / Mega each internal. Theme/Mk/color-way may mix. | 2026-07-14 |
| — | Mega at Home Base? | **No** on current pads; space spawn only until larger hangars. | 2026-07-14 |

---

## 9. Prototype sector map & harvesting (direction set — details TBD)

**Direction (2026-07):** Play space becomes a **planet + asteroid rings** layout authored in `src/world/data/sectorLayout.js`. Sector Map shows planet/rings; proc gen weights asteroids by ring **composition** tags (`iron`, `ice`, `silicate`, `carbonaceous`, `rare`, …). Mining/harvest loop still prototype — `Asteroid.composition` is scaffold only.

| # | Question | Why it matters |
|---|----------|----------------|
| 9.1 | Move Jennings off world origin to an authored orbit slot? | Saved POI coords, approach vectors, sector map center |
| 9.2 | Water-from-ice: cargo unit, consumable, or station commodity first? | Ties ice-rich outer rings to gameplay |
| 9.3 | Full **Dev sector editor** (ring handles, POI drag, composition sliders) vs drawer-only? | Content authoring throughput |

---

## Notes

- Strongest campaign hook: **labor-first fantasy** + station as proof of belonging
- Strongest multiplayer hook (retained): **ship / hangar as factory under pressure**
- Presentation locked: unified 2.5D interiors + hybrid narrative — see [`VISION.md`](VISION.md) Presentation Layers
- Current browser prototype validates **flight + hangar sandbox** — see [`GDD.md`](GDD.md)

---

*Last updated: 2026-07-16*
