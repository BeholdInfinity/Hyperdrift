import { FLS, SHIP } from '../core/Constants.js';

/**
 * Forward-looking scanner (FLS) — passive cone scan from the ship nose.
 *
 * Held via Mouse 4 (forward); all contact types in cone+range scan together
 * using shared ContactOcclusion visibility; per-type scan durations; session
 * scan database keyed by radar contact id (cleared when the contact dies).
 */
export class ForwardScanSystem {
  constructor() {
    /** @type {Map<string, { scanPct: number, maxScanPct: number, fullyScanned: boolean, type: string }>} */
    this._scanDb = new Map();
    /** @type {Array<object>} contacts actively scanning this frame (for visuals) */
    this.activeContacts = [];
    this.active = false;
    this._clock = 0;
  }

  _scanDuration(type) {
    return FLS.SCAN_DURATION[type] ?? FLS.SCAN_DURATION.default ?? 5;
  }

  _tierRange(tier) {
    const row = FLS.TIERS[Math.max(0, Math.min(FLS.TIERS.length - 1, tier))];
    return row?.range ?? 0;
  }

  /**
   * @param {number} deltaTime
   * @param {object} ctx { ship, contacts, occlusion, input, pipSystem, radarSystem, scanView, gameTime }
   */
  update(deltaTime, ctx) {
    this._clock += deltaTime;
    this.activeContacts = [];
    this.active = false;

    const { ship, contacts, occlusion, input, pipSystem, radarSystem, scanView } = ctx;
    if (!ship || !contacts?.length) return;
    if (scanView === 'scan') return; // SHIP view only
    if (!input?.isMouse4Held?.()) return;

    const tier = Math.min(ship.scannerMk ?? 5, pipSystem?.get?.('scanner') ?? 0);
    const range = this._tierRange(tier);
    if (range <= 0) return;

    this.active = true;

    const origin = ship.getMiningLaserOrigin?.() ?? {
      x: ship.position.x,
      y: ship.position.y,
    };
    const bore = ship.getMiningLaserWorldAngle?.() ?? ship.angle;
    const halfArc = SHIP.MINING_LASER_ARC ?? 0.61;

    // Prune scan DB for dead/gone contacts (same hygiene as selection).
    const byId = new Map(contacts.map((c) => [c.id, c]));
    for (const id of this._scanDb.keys()) {
      const c = byId.get(id);
      if (!c || !this._refLive(c)) this._scanDb.delete(id);
    }

    // Collect in-cone candidates, near → far.
    const inCone = [];
    for (const c of contacts) {
      const pos = this._contactPos(c);
      if (!pos) continue;
      const ddx = pos.x - origin.x;
      const ddy = pos.y - origin.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > range || dist < 1e-3) continue;
      let dA = Math.atan2(ddy, ddx) - bore;
      while (dA > Math.PI) dA -= 2 * Math.PI;
      while (dA < -Math.PI) dA += 2 * Math.PI;
      if (Math.abs(dA) > halfArc) continue;
      inCone.push({ c, cx: pos.x, cy: pos.y, dist });
    }
    if (!inCone.length) return;
    inCone.sort((a, b) => a.dist - b.dist);

    // Auto-select closest in-cone contact.
    const closest = inCone[0].c;
    if (closest && radarSystem) {
      radarSystem.select(closest.id);
    }

    // Accumulate scan progress. Reuse the visibility already computed by
    // RadarSystem this frame (shared occlusion — no recompute).
    for (const { c, cx, cy, dist } of inCone) {
      const target = {
        id: c.id,
        type: c.type,
        ref: c.ref,
        x: cx,
        y: cy,
      };
      const visibility =
        c.visibility ??
        (occlusion
          ? occlusion.computeVisibility(origin, target, this._rawFromContacts(contacts), {
              sensorRange: range,
            })
          : 1);
      if (visibility <= 0) continue;

      const dur = this._scanDuration(c.type);
      const maxScanPct = visibility * 100;
      let state = this._scanDb.get(c.id);
      if (!state || state.type !== c.type) {
        state = { scanPct: 0, maxScanPct, fullyScanned: false, type: c.type };
        this._scanDb.set(c.id, state);
      }
      state.maxScanPct = maxScanPct;
      if (!state.fullyScanned) {
        state.scanPct = Math.min(
          maxScanPct,
          state.scanPct + (deltaTime / dur) * visibility * 100
        );
        if (state.scanPct >= 100 && maxScanPct >= 100) state.fullyScanned = true;
      }

      this.activeContacts.push({
        contact: c,
        dist,
        visibility,
        scanPct: state.scanPct,
        maxScanPct,
        fullyScanned: state.fullyScanned,
      });
    }
  }

  /** Resolve a radar contact's live world position across all contact shapes. */
  _contactPos(c) {
    if (!c) return null;
    const ref = c.ref;
    const x = ref?.position?.x ?? ref?.x ?? c.x ?? c.wx;
    const y = ref?.position?.y ?? ref?.y ?? c.y ?? c.wy;
    if (x == null || y == null) return null;
    return { x, y };
  }

  /** Mirror RadarSystem._contactRefLive for scan-DB pruning. */
  _refLive(c) {
    const ref = c?.ref;
    if (!ref) return c?.type === 'station' || c?.id === 'station';
    if (c.type === 'asteroid' || c.type === 'ore') return ref.active !== false;
    if (ref.combatDestroyed) return false;
    return true;
  }

  /** Raw contact-like list for occlusion consumers (world x/y at top level). */
  _rawFromContacts(contacts) {
    const out = [];
    for (const c of contacts) {
      const pos = this._contactPos(c);
      if (!pos) continue;
      out.push({ id: c.id, type: c.type, ref: c.ref, x: pos.x, y: pos.y, angle: c.heading ?? c.ref?.angle ?? 0 });
    }
    return out;
  }

  /** @returns {{ scanPct: number, maxScanPct: number, fullyScanned: boolean } | null} */
  scanState(contactId) {
    return this._scanDb.get(contactId) || null;
  }

  clearContact(contactId) {
    this._scanDb.delete(contactId);
  }

  /** Clock driving scan-line sweep visuals. */
  get clock() {
    return this._clock;
  }
}
