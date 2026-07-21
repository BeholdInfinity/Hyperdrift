/**
 * ScannerSystem — the scanner *model* (the `Scanner` class is the renderer).
 *
 * Each update it gathers contacts (station, ambient ships, optional asteroids),
 * computes distance/bearing, assigns a stable id + IFF/type, and range-gates
 * them into states:
 *   - visual : within the viewport's visible world radius → collapses to a dot
 *              on the scanner's inner border (not a band pip) — PORT only
 *   - in     : inside scan range, plotted by piecewise pip range map
 *   - edge   : near the outer scan range → ghosted
 *   - (out)  : beyond range → dropped
 *
 * Detection is tier-gated: `effectiveTier = min(scannerMk, scannerPips)`.
 * Blip refresh is radar-stepped for band contacts (`in` / `edge`): they paint
 * when any sweep arm crosses their true bearing, clear when an arm revisits an
 * empty painted bearing, and fade with age between pings. **Visual-range**
 * contacts (inner-ring dots, PORT only) track live every frame — no sweep wait.
 * Arms scale with tier up to `SWEEP_ARM_MAX` (3); pips 4–5 raise sweep speed.
 *
 * Full SCAN wheel zoom steps `plotZoom` (1…tier); PORT ring uses the same
 * plot zoom so VIEW toggles keep the local range. Detection still uses full
 * sensor tier.
 *
 * Plot radius uses a piecewise pip map (near space gets more display radius).
 */

import { SCANNER } from '../core/Constants.js';

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

function shortestArc(a, b) {
  let d = ((b - a) % TWO_PI + TWO_PI) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  return Math.abs(d);
}

/** CONTACTS chip bucket: station | other (asteroids) | ship (everything else). */
export function contactFilterBucket(type) {
  if (type === 'station') return 'station';
  if (type === 'asteroid') return 'other';
  return 'ship';
}

export class ScannerSystem {
  constructor() {
    /** Installed scanner mark (scaffold; Mk5 unlocks full 5-pip / 5-arm table). */
    this.scannerMk = 5;
    this.sweepAngle = 0;
    this._prevSweep = 0;
    this._time = 0;
    /** @type {string|null} */
    this.selectedId = null;
    /** @type {Array<object>} */
    this.contacts = [];
    /** id → last painted { r, worldBearing, worldAngle, pingAt } */
    this._display = new Map();
    /** Ring geometry signature; a change forces a blip drop (view hand-off). */
    this._geoKey = '';
    /** Live model summary for the renderer/panels. */
    this.tier = 0;
    /** Full-SCAN display pip count (1…tier); detection still uses `tier`. */
    this.plotZoom = 0;
    /** Prior sensor tier — used to snap plot zoom out when pips are added. */
    this._prevTier = 0;
    /** Active plot pip count after clamp (mirrors rings on the scope). */
    this.plotTier = 0;
    /** Outer world range of the current plot zoom (≤ `range`). */
    this.plotRange = 0;
    this.range = 0;
    /** World range at each sensor pip tier 1..n. */
    this._tierRanges = [];
    /** World ranges used for the piecewise plot map (≤ sensor). */
    this._plotRanges = [];
    /** Display fracs (0–1) for range divider rings. */
    this.rangeBreaks = [];
    /** Full-SCAN ring labels: `{ frac, dist }` including outer edge at frac 1. */
    this.rangeRingMarks = [];
    this.on = false;
    this.rings = 0;
    this.includeAsteroids = SCANNER.INCLUDE_ASTEROIDS;
    /** Dev range multiplier (SCANNER drawer slider). */
    this.rangeScale = 1;
    /**
     * CONTACTS panel chips — also gates scanner blips / pick / selection.
     * Keys: ship, station, other.
     */
    this.contactFilters = { ship: true, station: true, other: true };
  }

  /** Whether a contact passes the CONTACTS panel type filters. */
  passesContactFilter(c) {
    if (!c) return false;
    const f = this.contactFilters;
    return !!f[contactFilterBucket(c.type)];
  }

  effectiveTier(scannerPips) {
    const t = Math.min(this.scannerMk, scannerPips | 0);
    return Math.max(0, Math.min(SCANNER.TIERS.length - 1, t));
  }

  sweepSpeed() {
    const base = SCANNER.SWEEP_SPEED ?? SCANNER.SWEEP_BASE ?? 0.95;
    const armMax = SCANNER.SWEEP_ARM_MAX ?? 3;
    const extra = Math.max(0, (this.tier | 0) - armMax);
    const per = SCANNER.SWEEP_SPEED_PER_EXTRA_PIP ?? 0.4;
    return base + extra * per;
  }

  /** Sweep arms: 1…SWEEP_ARM_MAX (further pips boost speed instead). */
  sweepArmCount() {
    const armMax = SCANNER.SWEEP_ARM_MAX ?? 3;
    return Math.max(1, Math.min(armMax, this.tier | 0));
  }

  /**
   * Full-SCAN mouse-wheel zoom: one pip-ring per notch.
   * Positive delta = zoom in (fewer rings / closer outer range).
   */
  stepPlotZoom(wheelDelta) {
    if (!wheelDelta) return;
    const maxZ = Math.max(1, this.tier | 0);
    let z = this.plotZoom | 0;
    if (z < 1 || z > maxZ) z = maxZ;
    z = Math.max(1, Math.min(maxZ, z - Math.sign(wheelDelta)));
    this.plotZoom = z;
  }

  /** World range at a given tier index (respects rangeScale). */
  tierWorldRange(tierIndex) {
    const row = SCANNER.TIERS[tierIndex] || SCANNER.TIERS[0];
    return (row.range || 0) * this.rangeScale;
  }

  /**
   * Piecewise map: world dist → display fraction 0..1 for the active plot zoom.
   * Breaks at 1−0.5^k for each extra pip beyond the first.
   */
  distToPlotFrac(dist) {
    const ranges = this._plotRanges.length ? this._plotRanges : this._tierRanges;
    if (!ranges.length) return 0;
    const n = ranges.length;
    if (dist <= ranges[0]) {
      const r0 = ranges[0] || 1;
      return Math.min(1, dist / r0) * (n === 1 ? 1 : 0.5);
    }
    // Display breaks: after R1 at 0.5, then 0.75, 0.875, …, 1
    let prevR = ranges[0];
    let prevF = 0.5;
    for (let i = 1; i < n; i++) {
      const nextF = i === n - 1 ? 1 : 1 - Math.pow(0.5, i + 1);
      const nextR = ranges[i];
      if (dist <= nextR || i === n - 1) {
        const spanR = Math.max(1e-6, nextR - prevR);
        const t = Math.min(1, Math.max(0, (dist - prevR) / spanR));
        return prevF + (nextF - prevF) * t;
      }
      prevR = nextR;
      prevF = nextF;
    }
    return 1;
  }

  /**
   * Rebuild sensor ranges + plot rings.
   * @param {number} plotTier how many pip rings fill the scope (≤ sensor tier)
   */
  _rebuildRangeBreaks(plotTier) {
    const n = this.tier;
    this._tierRanges = [];
    for (let k = 1; k <= n; k++) {
      this._tierRanges.push(this.tierWorldRange(k));
    }
    this.range = this._tierRanges.length
      ? this._tierRanges[this._tierRanges.length - 1]
      : 0;

    const requested = plotTier | 0;
    const p = n <= 0 ? 0 : Math.max(1, Math.min(n, requested > 0 ? requested : n));
    this.plotTier = p;
    this._plotRanges = this._tierRanges.slice(0, p);
    this.plotRange = this._plotRanges.length
      ? this._plotRanges[this._plotRanges.length - 1]
      : 0;

    this.rangeBreaks = [];
    this.rangeRingMarks = [];
    // Interior dividers at 0.5, 0.75, … for plot tiers 2+
    for (let k = 1; k < p; k++) {
      const frac = 1 - Math.pow(0.5, k);
      this.rangeBreaks.push(frac);
      this.rangeRingMarks.push({ frac, dist: this._plotRanges[k - 1] });
    }
    if (p >= 1) {
      this.rangeRingMarks.push({ frac: 1, dist: this._plotRanges[p - 1] });
    }
    this.rings = this.rangeBreaks.length;
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
    this._time += dt;
    if (!ship) {
      this.contacts = [];
      this.on = false;
      return;
    }

    this.tier = this.effectiveTier(ctx.scannerPips);
    this.on = this.tier > 0;
    // PORT always plots full sensor reach; SCAN uses wheel plotZoom (1…tier).
    // Adding scanner pips snaps plot zoom out to the new max ring; removing
    // pips only clamps if the current zoom is past the new max.
    if (this.tier <= 0) {
      this.plotZoom = 0;
    } else if (this.tier > this._prevTier) {
      this.plotZoom = this.tier;
    } else if (this.plotZoom < 1) {
      this.plotZoom = this.tier;
    } else if (this.plotZoom > this.tier) {
      this.plotZoom = this.tier;
    }
    this._prevTier = this.tier;
    // Shared plot zoom for PORT ring and full SCAN (wheel only steps it in SCAN).
    this._rebuildRangeBreaks(this.plotZoom);

    this._prevSweep = this.sweepAngle;
    if (this.on) this.sweepAngle = (this.sweepAngle + this.sweepSpeed() * dt) % TWO_PI;

    if (!this.on) {
      this.contacts = [];
      this._display.clear();
      return;
    }

    const rot = camera?.rotation || 0;
    const zoom = camera?.effectiveZoom || 1;
    const visualR = ctx.fullScope ? -1 : ctx.innerR / zoom;
    const px = ship.position.x;
    const py = ship.position.y;
    const plotMax = this.plotRange || this.range;

    // Temporary test gate: asteroids only within R1.
    const asteroidMaxR = this.tierWorldRange(
      Math.min(SCANNER.ASTEROID_RANGE_TIER || 1, this.tier)
    );

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
        priority: 0,
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
        priority: 0,
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
          priority: 1,
        });
      }
    }

    const pad = ctx.plotPad ?? 0.28;
    const innerPlot = ctx.innerR + ctx.band * pad;
    const outerPlot = ctx.outerR - ctx.band * pad;

    // PORT ↔ SCAN / plot-zoom / resize: keep paints — remap into new geometry.
    const geoKey = `${ctx.fullScope ? 1 : 0}:${Math.round(ctx.innerR)}:${Math.round(ctx.outerR)}:${this.plotTier}`;
    if (geoKey !== this._geoKey) {
      for (const prev of this._display.values()) {
        const d = prev.dist ?? 0;
        let state = prev.state || 'in';
        if (ctx.fullScope) {
          if (state === 'visual') state = 'in';
        } else if (d <= visualR) {
          state = 'visual';
        }
        if (d > plotMax) state = 'edge';
        const frac = Math.min(1, this.distToPlotFrac(d));
        prev.r = state === 'visual' ? ctx.innerR : innerPlot + (outerPlot - innerPlot) * frac;
        prev.state = state;
        const maxSz = ctx.fullScope ? 12 : Math.max(4, ctx.band * 0.26);
        prev.size =
          state === 'visual'
            ? maxSz * 0.42
            : maxSz * (1 - 0.5 * Math.min(1, d / (this.range || 1)));
      }
      this._geoKey = geoKey;
    }
    // Edge ghosting uses the *plot* outer range so zoomed-in scopes still
    // fade contacts near the visible rim (farther sensor paints pin to rim).
    const edgeStart = plotMax * (1 - SCANNER.EDGE_MARGIN);
    const maxSize = ctx.fullScope ? 12 : Math.max(4, ctx.band * 0.26);
    const fadePeriod = TWO_PI / Math.max(1e-3, this.sweepSpeed());
    const bearingEps = SCANNER.BLIP_BEARING_EPS ?? 0.04;
    const fadeFloor = SCANNER.BLIP_FADE_FLOOR ?? 0.22;

    const candidates = [];
    /** Contacts present and in-range this frame (may still be waiting for first paint). */
    const liveIds = new Set();

    for (const c of raw) {
      const dx = c.x - px;
      const dy = c.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-3) continue;

      if (c.type === 'asteroid' && dist > asteroidMaxR) continue;
      if (dist > this.range) continue;

      liveIds.add(c.id);

      const worldBearing = Math.atan2(dy, dx);
      const screenBearing = worldBearing + rot;
      const worldAngle = c.angle || 0;

      let state;
      if (dist <= visualR) state = 'visual';
      else if (dist > plotMax || dist >= edgeStart) state = 'edge';
      else state = 'in';

      const frac = Math.min(1, this.distToPlotFrac(dist));
      const wantR = state === 'visual' ? ctx.innerR : innerPlot + (outerPlot - innerPlot) * frac;
      const prev = this._display.get(c.id);
      const crossedTruth = this._sweepCrossed(screenBearing);
      const crossedDisp =
        prev != null && this._sweepCrossed(prev.worldBearing + rot);

      let paint = false;
      let clear = false;

      if (state === 'visual') {
        // In viewing distance (inner ring): live track — no sweep gate.
        paint = true;
      } else if (prev && prev.state === 'visual') {
        // Just left view range — seed the radar-stepped paint at current truth.
        paint = true;
      } else if (!prev) {
        // First acquire — only when the arm crosses the contact.
        if (crossedTruth) paint = true;
      } else if (crossedDisp) {
        const moved =
          shortestArc(prev.worldBearing, worldBearing) > bearingEps ||
          Math.abs(prev.r - wantR) > 2;
        if (moved && !crossedTruth) clear = true;
        else paint = true;
      } else if (crossedTruth) {
        paint = true;
      }

      if (clear) {
        this._display.delete(c.id);
        continue;
      }

      let dispR;
      let dispWorldBearing;
      let dispWorldAngle;
      let pingAt;

      if (paint) {
        dispR = wantR;
        dispWorldBearing = worldBearing;
        dispWorldAngle = worldAngle;
        pingAt = this._time;
        this._display.set(c.id, {
          r: dispR,
          worldBearing: dispWorldBearing,
          worldAngle: dispWorldAngle,
          pingAt,
          type: c.type,
          iff: c.iff,
          name: c.name,
          priority: c.priority,
          className: c.className || null,
          ref: c.ref,
          dist,
          // Last radar-stepped world position (Sector Map + stale hold).
          wx: c.x,
          wy: c.y,
          size:
            state === 'visual' ? maxSize * 0.42 : maxSize * (1 - 0.5 * Math.min(1, dist / (this.range || 1))),
          state,
        });
      } else if (prev) {
        dispR = prev.r;
        dispWorldBearing = prev.worldBearing;
        dispWorldAngle = prev.worldAngle;
        pingAt = prev.pingAt;
        // Refresh identity metadata while held (position stays stale).
        prev.type = c.type;
        prev.iff = c.iff;
        prev.name = c.name;
        prev.priority = c.priority;
        prev.className = c.className || null;
        prev.ref = c.ref;
        prev.dist = dist;
        prev.state = state;
      } else {
        continue; // not yet painted — wait for sweep
      }

      const held = this._display.get(c.id);
      const age = Math.max(0, this._time - pingAt);
      const ageT = Math.min(1, age / fadePeriod);
      const ageAlpha = 1 - (1 - fadeFloor) * ageT;
      // Visual-range dots stay full strength (live); band blips age between pings.
      const alpha =
        state === 'visual' ? 1 : Math.min(ageAlpha, state === 'edge' ? 0.5 : 1);

      const dispBearing = dispWorldBearing + rot;
      const tWorld = Math.min(1, dist / (this.range || 1));

      c.dist = dist;
      c.bearing = dispBearing;
      c.trueBearing = screenBearing;
      c.heading = dispWorldAngle + rot;
      c.state = state;
      c.plotR = dispR;
      c.screenX = ctx.centerX + Math.cos(dispBearing) * dispR;
      c.screenY = ctx.centerY + Math.sin(dispBearing) * dispR;
      c.size = state === 'visual' ? maxSize * 0.42 : maxSize * (1 - 0.5 * tWorld);
      c.alpha = alpha;
      c.age = age;
      // Last radar ping world pos (Sector Map); falls back to live if missing.
      c.scanX = held?.wx ?? c.x;
      c.scanY = held?.wy ?? c.y;
      const rvx = c.vx - (ship.velocity?.x || 0);
      const rvy = c.vy - (ship.velocity?.y || 0);
      c.closing = (rvx * dx + rvy * dy) / (dist || 1);
      candidates.push(c);
    }

    // Ghost paints: contact left range / despawned — keep the blip until the
    // sweep arm clears its last painted bearing (no instant pop-off).
    for (const [id, prev] of [...this._display.entries()]) {
      if (liveIds.has(id)) continue;
      const dispScreen = prev.worldBearing + rot;
      if (this._sweepCrossed(dispScreen)) {
        this._display.delete(id);
        if (this.selectedId === id) this.selectedId = null;
        continue;
      }
      const age = Math.max(0, this._time - prev.pingAt);
      const ageT = Math.min(1, age / fadePeriod);
      const ageAlpha = 1 - (1 - fadeFloor) * ageT;
      const dispBearing = dispScreen;
      candidates.push({
        id,
        ref: prev.ref,
        type: prev.type,
        iff: prev.iff,
        name: prev.name,
        priority: prev.priority ?? 0,
        className: prev.className || null,
        dist: prev.dist ?? this.range,
        bearing: dispBearing,
        trueBearing: dispBearing,
        heading: prev.worldAngle + rot,
        state: prev.state || 'in',
        plotR: prev.r,
        screenX: ctx.centerX + Math.cos(dispBearing) * prev.r,
        screenY: ctx.centerY + Math.sin(dispBearing) * prev.r,
        size: prev.size ?? maxSize * 0.5,
        alpha: ageAlpha,
        age,
        closing: 0,
        ghost: true,
        vx: 0,
        vy: 0,
        x: prev.wx ?? 0,
        y: prev.wy ?? 0,
        scanX: prev.wx ?? 0,
        scanY: prev.wy ?? 0,
        angle: prev.worldAngle,
      });
    }

    // Priority truncate: ships/station first, then asteroids — never let rocks
    // evict higher-priority contacts. Prefer live paints over ghosts when tied.
    candidates.sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.ghost ? 1 : 0) - (b.ghost ? 1 : 0) ||
        a.dist - b.dist
    );
    const primary = candidates.filter((c) => c.priority === 0);
    const rocks = candidates.filter((c) => c.priority !== 0);
    const out = [];
    const kept = new Set();
    for (const c of primary) {
      if (out.length >= SCANNER.MAX_CONTACTS) break;
      out.push(c);
      kept.add(c.id);
    }
    for (const c of rocks) {
      if (out.length >= SCANNER.MAX_CONTACTS) break;
      out.push(c);
      kept.add(c.id);
    }
    out.sort((a, b) => a.dist - b.dist);
    this.contacts = out;

    // Drop display only for paints that lost their slot (cap) and are not live —
    // never wipe a live wait-for-sweep or a ghost still awaiting arm clear.
    for (const id of [...this._display.keys()]) {
      if (kept.has(id) || liveIds.has(id)) continue;
      // Ghost not kept due to cap: still retain until sweep clear (handled next frames).
      // If it wasn't even emitted as ghost (shouldn't happen), leave it.
    }
    if (this.selectedId && !kept.has(this.selectedId) && !this._display.has(this.selectedId)) {
      this.selectedId = null;
    }
  }

  _sweepCrossed(bearing) {
    const n = this.sweepArmCount();
    const step = TWO_PI / n;
    for (let i = 0; i < n; i++) {
      if (this._arcCrossed(bearing, this._prevSweep + i * step, this.sweepAngle + i * step)) {
        return true;
      }
    }
    return false;
  }

  _arcCrossed(bearing, prevA, nextA) {
    let a = ((prevA % TWO_PI) + TWO_PI) % TWO_PI;
    let b = ((nextA % TWO_PI) + TWO_PI) % TWO_PI;
    let t = ((bearing % TWO_PI) + TWO_PI) % TWO_PI;
    if (a <= b) return t >= a && t <= b;
    return t >= a || t <= b;
  }

  getSelected() {
    if (!this.selectedId) return null;
    const c = this.contacts.find((x) => x.id === this.selectedId) || null;
    if (c && !this.passesContactFilter(c)) {
      this.selectedId = null;
      return null;
    }
    return c;
  }

  select(id) {
    this.selectedId = id;
  }

  clearSelection() {
    this.selectedId = null;
  }

  /**
   * Select the nearest visible (filter-passing) contact blip to a screen point
   * (within maxPx), else clear. Returns the selected contact or null.
   */
  selectNearestScreen(sx, sy, maxPx) {
    let best = null;
    let bestD = maxPx;
    for (const c of this.contacts) {
      if (!this.passesContactFilter(c)) continue;
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
