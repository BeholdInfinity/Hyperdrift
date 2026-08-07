import { FLS } from '../core/Constants.js';
import { SIZE_TIERS } from './AsteroidCatalog.js';
import { pingPong01, seekBeamAngles } from './ScanVisual.js';

/** Rock size metric used for FLS duration (radius + capacity weight). */
function asteroidScanSize(radius, capacity) {
  const r = radius ?? 18;
  const cap = capacity ?? 0;
  return Math.max(1, r + cap * 6);
}

/** Min/max asteroidScanSize across every SIZE_TIERS row (proc + hero). */
function asteroidScanSizeBounds() {
  let minS = Infinity;
  let maxS = 0;
  for (const t of SIZE_TIERS) {
    minS = Math.min(minS, asteroidScanSize(t.radiusMin, t.capacityMin ?? 0));
    maxS = Math.max(maxS, asteroidScanSize(t.radiusMax, t.capacityMax ?? 0));
  }
  if (!(minS < maxS)) return { min: 6, max: 236 };
  return { min: minS, max: maxS };
}

const ASTEROID_SIZE_BOUNDS = asteroidScanSizeBounds();

/**
 * Forward-looking scanner (FLS) — passive cone scan from the ship nose.
 *
 * Modes (M4 held):
 *   SEEK    — six desynced beams fan ±HALF_ARC looking for work
 *   ACQUIRE — beams lerp from seek fans onto the focus target
 *   SCAN    — hangar-style rasters + beams on the focus target
 *   RELEASE — beams lerp back out to seek after full scan / lost target
 *
 * Fully scanned contacts are ignored for focus / progress; session scan DB
 * still retains their cargo unlock state.
 */
export class ForwardScanSystem {
  constructor() {
    /** @type {Map<string, { scanPct: number, maxScanPct: number, fullyScanned: boolean, type: string }>} */
    this._scanDb = new Map();
    /** @type {Array<object>} contacts actively scanning this frame (for visuals) */
    this.activeContacts = [];
    this.active = false;
    this._clock = 0;
    this.sweepRel = 0;
    this.origin = null;
    this.range = 0;
    this.bore = 0;

    /** @type {'seek'|'acquire'|'scan'|'release'} */
    this.mode = 'seek';
    /** Focus contact id while acquiring/scanning/releasing. */
    this.focusId = null;
    /** Live focus snapshot for render (world pos + ref). */
    this.focus = null;
    /** 0..1 blend for acquire (seek→scan) or release (scan→seek). */
    this.modeBlend = 0;
    /** Frozen seek-beam world angles at acquire/release start (length 6). */
    this.blendSeekAngles = null;
    this._modeT = 0;
  }

  _scanCharacteristicSize(c) {
    const ref = c?.ref;
    if (c?.type === 'asteroid') {
      const r = ref?.radius ?? 18;
      const cap =
        ref?.capacityMax ??
        (typeof ref?.activeModules === 'function'
          ? ref.activeModules()?.length
          : ref?.modules?.length) ??
        0;
      return asteroidScanSize(r, cap);
    }
    if (c?.type === 'ore') return Math.max(3, (ref?.radius || 5) + 2);
    if (c?.type === 'station' || c?.id === 'station') {
      return Math.max(40, (ref?.radius ?? 160) * 0.5);
    }
    const ext = ref?.shipDef?.hullExtents?.();
    const fwd = ext?.forward ?? ref?.shipDef?.forwardExtent?.() ?? 22;
    const aft = ext?.aft ?? ref?.shipDef?.aftExtent?.() ?? 20;
    return Math.max(8, (fwd + aft) * 0.5);
  }

  /** Asteroids: 1s…15s across SIZE_TIERS. Others: base × linear size scale. */
  _scanDuration(c) {
    const type = typeof c === 'string' ? c : c?.type;
    if (type === 'asteroid' && c && typeof c !== 'string') {
      const size = this._scanCharacteristicSize(c);
      const { min: s0, max: s1 } = ASTEROID_SIZE_BOUNDS;
      const t = Math.max(0, Math.min(1, (size - s0) / Math.max(1e-6, s1 - s0)));
      const sec = FLS.ASTEROID_SCAN_SEC ?? { min: 1, max: 15 };
      return sec.min + t * (sec.max - sec.min);
    }
    const base = FLS.SCAN_DURATION[type] ?? FLS.SCAN_DURATION.default ?? 5;
    if (!c || typeof c === 'string') return base;
    const size = this._scanCharacteristicSize(c);
    const refSize = FLS.SIZE_REF[type] ?? FLS.SIZE_REF.default ?? 24;
    const raw = size / Math.max(1, refSize);
    const lo = FLS.SIZE_SCALE_MIN ?? 0.35;
    const hi = FLS.SIZE_SCALE_MAX ?? 3.0;
    const scale = Math.max(lo, Math.min(hi, raw));
    return base * scale;
  }

  _tierRange(tier) {
    const row = FLS.TIERS[Math.max(0, Math.min(FLS.TIERS.length - 1, tier))];
    return row?.range ?? 0;
  }

  _updateSweep() {
    const half = FLS.HALF_ARC ?? Math.PI / 4;
    const hz = FLS.SWEEP_HZ ?? 0.6;
    const u = pingPong01(this._clock * hz * 2);
    this.sweepRel = (u * 2 - 1) * half;
  }

  _resetMode() {
    this.mode = 'seek';
    this.focusId = null;
    this.focus = null;
    this.modeBlend = 0;
    this.blendSeekAngles = null;
    this._modeT = 0;
  }

  _isFullyScanned(contactId) {
    return !!this._scanDb.get(contactId)?.fullyScanned;
  }

  _beginAcquire(entry, bore) {
    this.mode = 'acquire';
    this.focusId = entry.c.id;
    this.focus = {
      contact: entry.c,
      x: entry.cx,
      y: entry.cy,
      dist: entry.dist,
      bearingRel: entry.bearingRel,
    };
    this._modeT = 0;
    this.modeBlend = 0;
    this.blendSeekAngles = seekBeamAngles(bore, FLS.HALF_ARC ?? Math.PI / 4, this._clock);
  }

  _beginRelease(bore) {
    if (this.mode === 'seek' || this.mode === 'release') return;
    this.mode = 'release';
    this._modeT = 0;
    this.modeBlend = 0;
    // Snapshot current seek fan so we lerp from target back to a coherent fan.
    this.blendSeekAngles = seekBeamAngles(bore, FLS.HALF_ARC ?? Math.PI / 4, this._clock);
  }

  /**
   * @param {number} deltaTime
   * @param {object} ctx { ship, contacts, occlusion, input, pipSystem, radarSystem, scanView, gameTime }
   */
  update(deltaTime, ctx) {
    this._clock += deltaTime;
    this.activeContacts = [];
    this.active = false;
    this.origin = null;
    this.range = 0;

    const { ship, contacts, occlusion, input, pipSystem, radarSystem, scanView } = ctx;
    if (!ship) {
      this._resetMode();
      return;
    }
    if (scanView === 'scan') {
      this._resetMode();
      return;
    }
    if (!input?.isMouse4Held?.()) {
      this._resetMode();
      return;
    }

    const tier = Math.min(ship.scannerMk ?? 5, pipSystem?.get?.('scanner') ?? 0);
    const range = this._tierRange(tier);
    if (range <= 0) {
      this._resetMode();
      return;
    }

    this.active = true;
    this._updateSweep();

    const origin = {
      x: ship.position?.x ?? ship.x ?? 0,
      y: ship.position?.y ?? ship.y ?? 0,
    };
    const bore = ship.angle ?? 0;
    this.origin = origin;
    this.range = range;
    this.bore = bore;

    const halfArc = FLS.HALF_ARC ?? Math.PI / 4;
    const list = contacts || [];

    // Prune scan DB for dead/gone contacts.
    const byId = new Map(list.map((c) => [c.id, c]));
    for (const id of this._scanDb.keys()) {
      const c = byId.get(id);
      if (!c || !this._refLive(c)) this._scanDb.delete(id);
    }

    // Eligible = in cone, visible later, and not fully scanned.
    const inCone = [];
    for (const c of list) {
      if (this._isFullyScanned(c.id)) continue;
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
      inCone.push({ c, cx: pos.x, cy: pos.y, dist, bearingRel: dA });
    }
    inCone.sort((a, b) => a.dist - b.dist);

    // Update / resolve focus for acquire/scan/release.
    let focusEntry = null;
    if (this.focusId) {
      focusEntry = inCone.find((e) => e.c.id === this.focusId) || null;
      if (!focusEntry) {
        // Target left cone or became fully scanned / gone — release or seek.
        if (this.mode === 'scan' || this.mode === 'acquire') {
          this._beginRelease(bore);
        } else if (this.mode === 'release') {
          // keep releasing with last focus snapshot
        } else {
          this._resetMode();
        }
      } else {
        this.focus = {
          contact: focusEntry.c,
          x: focusEntry.cx,
          y: focusEntry.cy,
          dist: focusEntry.dist,
          bearingRel: focusEntry.bearingRel,
        };
      }
    }

    // Mode transitions.
    if (this.mode === 'seek') {
      if (inCone.length) {
        this._beginAcquire(inCone[0], bore);
        focusEntry = inCone[0];
      }
    } else if (this.mode === 'acquire') {
      const dur = FLS.ACQUIRE_SEC ?? 0.4;
      this._modeT += deltaTime;
      this.modeBlend = Math.min(1, this._modeT / Math.max(0.05, dur));
      if (this.modeBlend >= 1) {
        this.mode = 'scan';
        this.modeBlend = 1;
      }
      if (!focusEntry) {
        this._beginRelease(bore);
      }
    } else if (this.mode === 'scan') {
      this.modeBlend = 1;
      if (!focusEntry) this._beginRelease(bore);
    } else if (this.mode === 'release') {
      const dur = FLS.RELEASE_SEC ?? 0.35;
      this._modeT += deltaTime;
      this.modeBlend = Math.min(1, this._modeT / Math.max(0.05, dur));
      if (this.modeBlend >= 1) {
        this._resetMode();
        // Immediately pick next unscanned target if still holding.
        if (inCone.length) this._beginAcquire(inCone[0], bore);
      }
    }

    // Auto-select focus (or closest eligible while seeking).
    const selectId =
      this.focusId ||
      (this.mode === 'seek' && inCone[0] ? inCone[0].c.id : null);
    if (selectId && radarSystem) radarSystem.select(selectId);

    // Accumulate progress only on the focus target during acquire/scan.
    if ((this.mode === 'acquire' || this.mode === 'scan') && focusEntry) {
      const { c, cx, cy, dist, bearingRel } = focusEntry;
      const target = { id: c.id, type: c.type, ref: c.ref, x: cx, y: cy };
      const visibility =
        c.visibility ??
        (occlusion
          ? occlusion.computeVisibility(origin, target, this._rawFromContacts(list), {
              sensorRange: range,
            })
          : 1);
      if (visibility > 0) {
        const dur = this._scanDuration(c);
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
          if (state.scanPct >= 100 && maxScanPct >= 100) {
            state.fullyScanned = true;
            this._beginRelease(bore);
          }
        }

        this.activeContacts.push({
          contact: c,
          dist,
          bearingRel,
          visibility,
          scanPct: state.scanPct,
          maxScanPct,
          fullyScanned: state.fullyScanned,
          x: cx,
          y: cy,
        });
      } else if (this.mode === 'scan' || this.mode === 'acquire') {
        // Occluded — release and resume seek.
        this._beginRelease(bore);
      }
    }
  }

  /** True if CONTACT panel should animate rasters for this contact. */
  isActivelyScanning(contactId) {
    if (!this.active) return false;
    if (this.mode !== 'acquire' && this.mode !== 'scan') return false;
    return this.focusId === contactId;
  }

  _contactPos(c) {
    if (!c) return null;
    const ref = c.ref;
    const x = ref?.position?.x ?? ref?.x ?? c.x ?? c.wx;
    const y = ref?.position?.y ?? ref?.y ?? c.y ?? c.wy;
    if (x == null || y == null) return null;
    return { x, y };
  }

  _refLive(c) {
    const ref = c?.ref;
    if (!ref) return c?.type === 'station' || c?.id === 'station';
    if (c.type === 'asteroid' || c.type === 'ore') return ref.active !== false;
    if (ref.combatDestroyed) return false;
    return true;
  }

  _rawFromContacts(contacts) {
    const out = [];
    for (const c of contacts) {
      const pos = this._contactPos(c);
      if (!pos) continue;
      out.push({
        id: c.id,
        type: c.type,
        ref: c.ref,
        x: pos.x,
        y: pos.y,
        angle: c.heading ?? c.ref?.angle ?? 0,
      });
    }
    return out;
  }

  scanState(contactId) {
    return this._scanDb.get(contactId) || null;
  }

  clearContact(contactId) {
    this._scanDb.delete(contactId);
  }

  get clock() {
    return this._clock;
  }

  get sweepWorldAngle() {
    return this.bore + this.sweepRel;
  }
}
