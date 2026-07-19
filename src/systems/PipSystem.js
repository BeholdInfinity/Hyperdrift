/**
 * Global power-pip pool. Systems (scanner, science, engine, weapons, shield)
 * draw pips as distinct channels from one shared pool. Precision mode frees
 * extra pips (per GDD), raising the pool ceiling while active.
 *
 * The scanner tier reads `get('scanner')`; the Contact Details science package
 * reads `get('science')` — independent channels that never throttle each other.
 */

import { PIPS } from '../core/Constants.js';

export class PipSystem {
  constructor() {
    this.basePool = PIPS.BASE_POOL;
    this.precisionBonus = PIPS.PRECISION_BONUS;
    this.precision = false;
    /** @type {Record<string, number>} */
    this.alloc = { ...PIPS.DEFAULTS };
    for (const ch of PIPS.CHANNELS) {
      if (this.alloc[ch] == null) this.alloc[ch] = 0;
    }
  }

  /** Total pips available right now (base + precision bonus while active). */
  pool() {
    return this.basePool + (this.precision ? this.precisionBonus : 0);
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

  setPrecision(active) {
    this.precision = !!active;
  }

  /** Add a pip to a channel if the pool and per-channel cap allow it. */
  add(channel) {
    if (!PIPS.CHANNELS.includes(channel)) return false;
    if (this.free() <= 0) return false;
    if ((this.alloc[channel] || 0) >= PIPS.MAX_PER_CHANNEL) return false;
    this.alloc[channel] = (this.alloc[channel] || 0) + 1;
    return true;
  }

  /** Remove a pip from a channel. */
  remove(channel) {
    if (!PIPS.CHANNELS.includes(channel)) return false;
    if ((this.alloc[channel] || 0) <= 0) return false;
    this.alloc[channel] -= 1;
    return true;
  }
}
