/**
 * Global power-pip pool. Systems draw pips as distinct channels from one shared pool.
 *
 * Radar (360° sweep) reads `get('radar')`; Forward Looking Scanner reads `get('scanner')`.
 */

import { PIPS } from '../core/Constants.js';

export class PipSystem {
  constructor() {
    /** @type {Record<string, number>} */
    this.alloc = { ...PIPS.DEFAULTS };
    for (const ch of PIPS.CHANNELS) {
      if (this.alloc[ch] == null) this.alloc[ch] = 0;
    }
    /** Live generator output (fuel cells); capped by BASE_POOL. */
    this._fuelCellPips = PIPS.DEFAULT_GENERATOR_PIPS ?? PIPS.BASE_POOL;
  }

  /** Effective pip pool from generator fuel cells. */
  effectivePool() {
    return Math.min(PIPS.BASE_POOL, this._fuelCellPips | 0);
  }

  /** Total pips available right now. */
  pool() {
    return this.effectivePool();
  }

  setFuelCellPips(n) {
    this._fuelCellPips = Math.max(0, Math.min(PIPS.BASE_POOL, n | 0));
    this.enforcePoolCap();
  }

  used() {
    let n = 0;
    for (const ch of PIPS.CHANNELS) n += this.alloc[ch] || 0;
    return n;
  }

  free() {
    return Math.max(0, this.pool() - this.used());
  }

  get(channel) {
    return this.alloc[channel] || 0;
  }

  /** Snapshot of current allocation keyed by channel. */
  snapshotAlloc() {
    const out = {};
    for (const ch of PIPS.CHANNELS) out[ch] = this.get(ch);
    return out;
  }

  /**
   * Set channel to target count. Clamps to pool and per-channel cap on increase.
   * @returns {number} resulting count
   */
  set(channel, targetCount) {
    if (!PIPS.CHANNELS.includes(channel)) return this.get(channel);
    const cap = PIPS.MAX_PER_CHANNEL;
    let target = Math.max(0, Math.min(cap, targetCount | 0));
    const current = this.get(channel);
    if (target > current) {
      target = Math.min(target, current + this.free());
    }
    this.alloc[channel] = target;
    return target;
  }

  clear(channel) {
    return this.set(channel, 0);
  }

  clearAll() {
    for (const ch of PIPS.CHANNELS) this.alloc[ch] = 0;
  }

  add(channel) {
    const n = this.get(channel);
    if (n >= PIPS.MAX_PER_CHANNEL) return false;
    return this.set(channel, n + 1) > n;
  }

  remove(channel) {
    const n = this.get(channel);
    if (n <= 0) return false;
    this.set(channel, n - 1);
    return true;
  }

  /**
   * Per-slot diff for hover preview.
   * @returns {'keep'|'add'|'remove'|'empty'}[]
   */
  diffSlots(channel, targetCount) {
    const current = this.get(channel);
    const target = Math.max(0, Math.min(PIPS.MAX_PER_CHANNEL, targetCount | 0));
    const slots = [];
    for (let k = 0; k < PIPS.MAX_PER_CHANNEL; k++) {
      const was = k < current;
      const will = k < target;
      if (was && will) slots.push('keep');
      else if (!was && will) slots.push('add');
      else if (was && !will) slots.push('remove');
      else slots.push('empty');
    }
    return slots;
  }

  /**
   * Apply a loadout in two phases: strip excess, then round-robin add.
   * @returns {{ partial: boolean, shortBy: number, missed: Record<string, number> }}
   */
  applyLoadout(targetAlloc) {
    for (const ch of PIPS.CHANNELS) {
      const target = Math.max(0, Math.min(PIPS.MAX_PER_CHANNEL, targetAlloc[ch] | 0));
      if (this.get(ch) > target) this.set(ch, target);
    }

    let guard = 0;
    while (this.free() > 0 && guard++ < 256) {
      let progressed = false;
      for (const ch of PIPS.CHANNELS) {
        const target = Math.max(0, Math.min(PIPS.MAX_PER_CHANNEL, targetAlloc[ch] | 0));
        if (this.get(ch) < target && this.add(ch)) {
          progressed = true;
          if (this.free() <= 0) break;
        }
      }
      if (!progressed) break;
    }

    const missed = {};
    let shortBy = 0;
    for (const ch of PIPS.CHANNELS) {
      const target = Math.max(0, Math.min(PIPS.MAX_PER_CHANNEL, targetAlloc[ch] | 0));
      const gap = Math.max(0, target - this.get(ch));
      if (gap > 0) {
        missed[ch] = gap;
        shortBy += gap;
      }
    }
    return { partial: shortBy > 0, shortBy, missed };
  }

  /** Drop pips when generator output falls below allocation (highest count first). */
  enforcePoolCap() {
    let guard = 0;
    while (this.used() > this.pool() && guard++ < 256) {
      const order = [...PIPS.CHANNELS].sort((a, b) => {
        const da = this.get(a);
        const db = this.get(b);
        if (db !== da) return db - da;
        return PIPS.CHANNELS.indexOf(a) - PIPS.CHANNELS.indexOf(b);
      });
      let stripped = false;
      for (const ch of order) {
        if (this.get(ch) > 0) {
          this.remove(ch);
          stripped = true;
          break;
        }
      }
      if (!stripped) break;
    }
  }
}
