/**
 * ScannerSystem — the scanner *model* (the `Scanner` class is the renderer).
 *
 * Each update it gathers contacts (station, ambient ships, optional asteroids),
 * computes distance/bearing, assigns a stable id + IFF/type, and range-gates
 * them into states:
 *   - visual : within the viewport's visible world radius → collapses to a dot
 *              on the scanner's inner border (not a band pip)
 *   - in     : inside scan range, plotted in the band by distance
 *   - edge   : near the outer scan range → ghosted
 *   - (out)  : beyond range → dropped
 *
 * Detection is tier-gated: `effectiveTier = min(scannerMk, scannerPips)` over a
 * data-driven tier table (see SCANNER.TIERS). Blip refresh is radar-stepped:
 * a contact's plotted position only snaps to truth as the sweep passes its
 * bearing (retro ping feel); higher tiers sweep faster.
 *
 * The model computes each contact's on-screen position from the passed ring
 * geometry, so the renderer just draws and selection hit-tests precomputed
 * points.
 */

import { SCANNER, IFF } from '../core/Constants.js';

const TWO_PI = Math.PI * 2;

/** Civilian behaviour → readable contact label. */
const BEHAVIOR_LABEL = {
  police: 'Patrol',
  mine: 'Miner',
  survey: 'Survey',
  deepSurvey: 'Survey',
  freight: 'Freighter',
  shuttle: 'Shuttle',
  cruise: 'Cruiser',
  recon: 'Scout',
  flyby: 'Drone',
  race: 'Racer',
  deepCruise: 'Hauler',
};

export class ScannerSystem {
  constructor() {
    /** Installed scanner mark (scaffold: from a future sensor item). */
    this.scannerMk = 3;
    this.sweepAngle = 0;
    this._prevSweep = 0;
    /** @type {string|null} */
    this.selectedId = null;
    /** @type {Array<object>} */
    this.contacts = [];
    /** id → last displayed {r, bearing} (radar-stepped refresh). */
    this._display = new Map();
    /** Ring geometry signature; a change forces a blip snap (view hand-off). */
    this._geoKey = '';
    /** Live model summary for the renderer/panels. */
    this.tier = 0;
    this.range = 0;
    this.on = false;
    this.rings = 0;
    this.includeAsteroids = SCANNER.INCLUDE_ASTEROIDS;
    /** Dev range multiplier (SCANNER drawer slider). */
    this.rangeScale = 1;
  }

  effectiveTier(scannerPips) {
    const t = Math.min(this.scannerMk, scannerPips | 0);
    return Math.max(0, Math.min(SCANNER.TIERS.length - 1, t));
  }

  sweepSpeed() {
    return SCANNER.SWEEP_BASE + SCANNER.SWEEP_TIER_MULT * Math.max(0, this.tier - 1);
  }

  /**
   * @param {number} dt
   * @param {{
   *   ship: object, station: object, ambientTraffic: object, asteroids?: object[],
   *   camera: object, scannerPips: number,
   *   centerX: number, centerY: number, innerR: number, outerR: number, band: number,
   * }} ctx
   */
  update(dt, ctx) {
    const { ship, station, ambientTraffic, camera } = ctx;
    if (!ship) {
      this.contacts = [];
      this.on = false;
      return;
    }

    this.tier = this.effectiveTier(ctx.scannerPips);
    this.on = this.tier > 0;
    const tierRow = SCANNER.TIERS[this.tier] || SCANNER.TIERS[0];
    this.rings = tierRow.rings;
    this.range =
      SCANNER.RANGE *
      tierRow.range *
      this.rangeScale;

    // Advance sweep (stepped refresh reads the arc crossed this frame).
    this._prevSweep = this.sweepAngle;
    if (this.on) this.sweepAngle = (this.sweepAngle + this.sweepSpeed() * dt) % TWO_PI;

    if (!this.on) {
      this.contacts = [];
      return;
    }

    const rot = camera?.rotation || 0;
    const zoom = camera?.effectiveZoom || 1;
    // Full-scope (SCAN) view plots every contact by range across the whole
    // disc, so nothing collapses to a "visual" dot on the inner border.
    const visualR = ctx.fullScope ? -1 : ctx.innerR / zoom;
    const px = ship.position.x;
    const py = ship.position.y;

    const raw = [];
    if (station) {
      raw.push({
        id: 'station',
        ref: station,
        x: station.x,
        y: station.y,
        vx: 0,
        vy: 0,
        angle: 0,
        type: 'station',
        iff: 'blue',
        name: 'Jennings Station',
      });
    }
    for (const a of ambientTraffic?.ships || []) {
      const patrol = a.isPolice || a.behavior === 'police';
      raw.push({
        id: `a${a.id}`,
        ref: a,
        x: a.x,
        y: a.y,
        vx: a.vx || 0,
        vy: a.vy || 0,
        angle: a.angle,
        type: patrol ? 'patrol' : 'civilian',
        iff: patrol ? 'blue' : 'yellow',
        name: patrol ? 'Patrol' : BEHAVIOR_LABEL[a.behavior] || 'Contact',
        className: a.shipDef?.classId || a.classId || null,
      });
    }
    if (this.includeAsteroids && ctx.asteroids) {
      for (const ast of ctx.asteroids) {
        if (!ast.active) continue;
        raw.push({
          id: `ast${ast.id}`,
          ref: ast,
          x: ast.position.x,
          y: ast.position.y,
          vx: ast.velocity?.x || 0,
          vy: ast.velocity?.y || 0,
          angle: ast.angle || 0,
          type: 'asteroid',
          iff: 'object',
          name: 'Asteroid',
        });
      }
    }

    const pad = ctx.plotPad ?? 0.28;
    const innerPlot = ctx.innerR + ctx.band * pad;
    const outerPlot = ctx.outerR - ctx.band * pad;

    // When the ring geometry changes (PORT thin ring ↔ full SCAN scope), the
    // cached radar-stepped positions belong to the old layout. Drop them so
    // every blip snaps to its correct spot for the new view immediately,
    // instead of lingering at the old coordinates until the next sweep ping.
    const geoKey = `${ctx.fullScope ? 1 : 0}:${Math.round(ctx.innerR)}:${Math.round(ctx.outerR)}`;
    if (geoKey !== this._geoKey) {
      this._display.clear();
      this._geoKey = geoKey;
    }
    const edgeStart = this.range * (1 - SCANNER.EDGE_MARGIN);
    // Blip size scales with the (thin) ring band; the full-scope band is the
    // whole radius, so pin it to a readable fixed size there.
    const maxSize = ctx.fullScope ? 12 : Math.max(4, ctx.band * 0.26);

    const out = [];
    for (const c of raw) {
      const dx = c.x - px;
      const dy = c.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-3) continue;
      // World bearing is cached rotation-free; camera rotation is applied live
      // at plot time so blips track view rotation (ship-lock mode) immediately
      // instead of lagging until the next sweep ping.
      const worldBearing = Math.atan2(dy, dx);
      const screenBearing = worldBearing + rot;

      let state;
      if (dist <= visualR) state = 'visual';
      else if (dist > this.range) continue;
      else if (dist >= edgeStart) state = 'edge';
      else state = 'in';

      // Radar-stepped refresh: snap the displayed position to truth only when
      // the sweep arc has crossed the contact's bearing since last frame.
      const prev = this._display.get(c.id);
      const refresh = state === 'visual' || !prev || this._sweepCrossed(screenBearing);
      const t = Math.min(1, dist / (this.range || 1));
      const wantR = state === 'visual' ? ctx.innerR : innerPlot + (outerPlot - innerPlot) * t;
      let dispR = wantR;
      let dispWorldBearing = worldBearing;
      if (!refresh && prev) {
        dispR = prev.r;
        dispWorldBearing = prev.worldBearing;
      }
      this._display.set(c.id, { r: dispR, worldBearing: dispWorldBearing });

      const dispBearing = dispWorldBearing + rot;
      c.dist = dist;
      c.bearing = dispBearing;
      c.trueBearing = screenBearing;
      c.state = state;
      c.plotR = dispR;
      c.screenX = ctx.centerX + Math.cos(dispBearing) * dispR;
      c.screenY = ctx.centerY + Math.sin(dispBearing) * dispR;
      // Farther contacts render smaller; visual dots are small pips.
      c.size = state === 'visual' ? maxSize * 0.42 : maxSize * (1 - 0.5 * t);
      // Closing speed (negative = approaching).
      const rvx = c.vx - (ship.velocity?.x || 0);
      const rvy = c.vy - (ship.velocity?.y || 0);
      c.closing = (rvx * dx + rvy * dy) / (dist || 1);
      out.push(c);
    }

    out.sort((a, b) => a.dist - b.dist);
    if (out.length > SCANNER.MAX_CONTACTS) out.length = SCANNER.MAX_CONTACTS;
    this.contacts = out;

    // Drop display memory for contacts no longer present.
    const alive = new Set(out.map((c) => c.id));
    for (const id of this._display.keys()) {
      if (!alive.has(id)) this._display.delete(id);
    }
    // Clear a stale selection.
    if (this.selectedId && !alive.has(this.selectedId)) this.selectedId = null;
  }

  _sweepCrossed(bearing) {
    let a = this._prevSweep;
    let b = this.sweepAngle;
    let t = ((bearing % TWO_PI) + TWO_PI) % TWO_PI;
    a = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    b = ((b % TWO_PI) + TWO_PI) % TWO_PI;
    if (a <= b) return t >= a && t <= b;
    return t >= a || t <= b; // wrapped past 0
  }

  getSelected() {
    if (!this.selectedId) return null;
    return this.contacts.find((c) => c.id === this.selectedId) || null;
  }

  select(id) {
    this.selectedId = id;
  }

  clearSelection() {
    this.selectedId = null;
  }

  /**
   * Select the nearest contact blip to a screen point (within maxPx), else
   * clear. Returns the selected contact or null.
   */
  selectNearestScreen(sx, sy, maxPx) {
    let best = null;
    let bestD = maxPx;
    for (const c of this.contacts) {
      const d = Math.hypot(c.screenX - sx, c.screenY - sy);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    this.selectedId = best ? best.id : null;
    return best;
  }
}
