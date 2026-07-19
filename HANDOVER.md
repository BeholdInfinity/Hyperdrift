# Handover — Scanner → Pilot Cockpit HUD (session 2026-07-19)

Status of the Scanner → Pilot Cockpit HUD roadmap. The near-term vertical slice
shipped in **v0.1.283** and runs without errors. This doc lists what is **not
finished or not fully correct** so tomorrow's session can pick up cleanly.

Plan of record: `.cursor/plans/scanner_subsystem_roadmap_fe068679.plan.md`
(do **not** edit the plan file). All 14 plan to-dos are marked complete, but
several were only partially implemented or scaffolded-in-name — see below.

## Design change made this session

- **Blip encoding is now: color = IFF, shape = contact type** (we intentionally
  dropped the plan's "IFF is color AND shape" accessibility rule). Ship contacts
  (patrol/civilian/etc.) all share the ship silhouette and differ only by IFF
  color. The plan's "Decisions locked → Accessibility" bullet is now stale and
  should be reconciled if/when the plan is revised.

## Not finished / not fully correct

### High-value quick wins (do these first)
1. **Thickened inner border (visual-collapse geometry).** Plan wants the sensor
   ring's inner border thickened inward to match the outer POI rim, with visual
   contacts riding that thicker border. Currently visual dots sit on the thin
   `viewportRadius` edge; the border was never thickened.
   - Touch: `src/systems/Scanner.js` (`_drawBand`), maybe `src/systems/Renderer.js`.
2. **In-world highlight of the selected contact.** Selecting a contact highlights
   its scanner blip only. The actual ship rendered in the viewport is NOT
   highlighted, and the highlight should hand off between blip ↔ in-world ship as
   the contact crosses visual range.
   - Touch: `src/core/GameEngine.js` render path + `AmbientTrafficSystem.render`
     (need a way to draw a highlight ring around `selectedId`'s in-world ship).
3. **Selected-POI distance in the viewport.** Contact distance prints against the
   ring edge inside the viewport; a selected POI's distance only shows in the
   Destination panel. Plan wants POI distance drawn in-viewport too.
   - Touch: `src/systems/Scanner.js` `_drawSelection` (add a POI variant) or a new
     pass in `GameEngine._renderScanner`.
4. **Tier-based icon shrink.** Blips shrink with distance only. Plan also wants
   icons to shrink per tier so more range bands fit.
   - Touch: `src/systems/ScannerSystem.js` (fold a tier factor into `c.size`).

### Scaffolds that are API-only or stubs
5. **Highlight-sync API (pilot/science/weapons).** Not scaffolded. Selection is
   local (`ScannerSystem.selectedId`); there's no broadcast/subscribe hook for
   future officer/multiplayer screens.
6. **Comms panel is a visual stub.** HAIL/DOCK/TRADE/END buttons are no-ops; no
   call/receive/deny/hang-up logic. (Plan tags comms as future, so low priority.)
   - Touch: `src/systems/CockpitPanels.js` `_comms`.
7. **POI discovery channels.** Only **proximity** auto-fires. `mission`, `manual`,
   and `purchase` exist as `PoiSystem` API (`register(..., source)`,
   `addManualWaypoint`) but nothing triggers them in-game (e.g. no manual
   waypoint-drop control bound to input).
   - Touch: `src/world/PoiSystem.js` + a UI/input trigger.
8. **Dev SCANNER "bake to constants" + fake-contacts toggle.** The dev drawer has
   live sliders/toggles (asteroid blips, Mk, range) and a readout, but no
   bake/export-to-`Constants.js` button and no placeholder-contact spawner.
   - Touch: `index.html` (dev-drawer SCANNER section), `src/main.js`, `src/dev/DevTools.js`.

### Cosmetic / lower priority
9. **Ship Status is a list, not a schematic.** Plan preferred a small ship-schematic
   damage map. `ship.status` is a stub shape (systems list, fuel, fires[],
   weapons) with placeholder values; nothing writes real damage/fuel/ammo yet.
   - Touch: `src/systems/CockpitPanels.js` `_shipStatus`, `GameEngine._ensureShipStatus`.
10. **Sector map doesn't emphasize the selected contact** (selected POI is
    highlighted; contacts are plain dots).
    - Touch: `src/systems/CockpitPanels.js` `_sectorMap`.
11. **No "objects"/debris contact type** — only asteroids fill the non-AI object
    slot (asteroids are off by default; dev toggle on).
12. **Station selection shows no top-down render** (station has no `shipDef`) —
    expected; add a station glyph if desired.

## Verification caveats

Browser validation was partially blocked by background-tab rAF throttling and a
capture viewport narrower than the 1920×1080 canvas. Confirmed working: all six
panels render, corner readouts, scanner ring + indicators, POI ring dot, contacts
list with IFF colors, DESTINATION tab switch → POI Book (Jennings + R/M toggles),
SECTOR MAP fog reveal + trail + ship marker, POWER pip channels (pool 6/6). Not
yet exercised live end-to-end: clicking an in-world/band blip to select (ship kept
leaving range), pip +/- add-remove, comms target population, and the fire/alert
overlay (needs `ship.status.fires` populated).

**Tomorrow: do a focused manual pass** — hover near Jennings at low speed, select a
band blip + a POI-rim dot, add/remove pips, and temporarily push a fake fire into
`ship.status.fires` to verify the alert banner.

## New files this session

- `src/systems/ScannerSystem.js` — scanner model (contacts, tiers, selection)
- `src/systems/PipSystem.js` — global power-pip pool
- `src/systems/CockpitPanels.js` — live content for the 6 screens + alert overlay
- `src/world/PoiSystem.js` — POI address book + waypoint tracker
- `src/world/SectorMap.js` — dual-level fog-of-war grid + scan trail
- (edited) `src/systems/Scanner.js`, `src/systems/CockpitFrame.js`,
  `src/systems/Renderer.js`, `src/systems/InputSystem.js`,
  `src/core/GameEngine.js`, `src/core/Constants.js`, `index.html`, `src/main.js`

## Run

`python dev-server.py 8080` → http://localhost:8080 → QUICK LAUNCH.
Backtick (`` ` ``) opens the Dev drawer; the SCANNER section tunes range/Mk/asteroids.
