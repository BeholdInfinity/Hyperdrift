/**
 * SectorMap — dual-level fog-of-war model for the zoomed-out sector view.
 *
 * Fog levels per cell:
 *   0 unseen  — never scanned this outing (only registered POIs show through)
 *   1 stale   — scanned earlier but now out of range (last-known, not updated)
 *   2 in-range— inside the live radar range right now (full reveal)
 *
 * Also records a downsampled scan trail (where the ship has flown). Contact
 * blips are drawn by CockpitPanels from `RadarSystem` last-ping positions
 * (same sweep-gated paints as the radar), not live world coords.
 */

const CELL = 1500;

/** Sum segment lengths along a downsampled trail (world units). */
export function trailDistance(trail) {
  if (!trail || trail.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < trail.length; i++) {
    d += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
  }
  return d;
}

export class SectorMap {
  constructor() {
    /** Ever-revealed cell keys → { cx, cy } (stale once out of range). */
    this.revealed = new Map();
    /** Downsampled ship path (world points). */
    this.trail = [];
    this._lastTrail = null;
    /** Live in-range cell keys (rebuilt each update). */
    this._inRange = new Set();
    this.cellSize = CELL;
  }

  reset() {
    this.revealed.clear();
    this.trail.length = 0;
    this._lastTrail = null;
    this._inRange.clear();
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  update({ ship, scanRange }) {
    if (!ship) return;
    const px = ship.position.x;
    const py = ship.position.y;

    // Trail sampling (every ~600 world units).
    if (!this._lastTrail || Math.hypot(px - this._lastTrail.x, py - this._lastTrail.y) > 600) {
      this.trail.push({ x: px, y: py });
      this._lastTrail = { x: px, y: py };
      if (this.trail.length > 400) this.trail.shift();
    }

    this._inRange.clear();
    if (!scanRange) return;
    const r = scanRange;
    const c0x = Math.floor((px - r) / CELL);
    const c1x = Math.floor((px + r) / CELL);
    const c0y = Math.floor((py - r) / CELL);
    const c1y = Math.floor((py + r) / CELL);
    const r2 = r * r;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        const wx = (cx + 0.5) * CELL;
        const wy = (cy + 0.5) * CELL;
        if ((wx - px) ** 2 + (wy - py) ** 2 <= r2) {
          const k = this._key(cx, cy);
          this._inRange.add(k);
          if (!this.revealed.has(k)) this.revealed.set(k, { cx, cy });
        }
      }
    }
  }

  /** 0 unseen, 1 stale, 2 in-range. */
  cellLevel(cx, cy) {
    const k = this._key(cx, cy);
    if (this._inRange.has(k)) return 2;
    if (this.revealed.has(k)) return 1;
    return 0;
  }

  isInRange(cx, cy) {
    return this._inRange.has(this._key(cx, cy));
  }
}
