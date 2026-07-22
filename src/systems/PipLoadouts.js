/**
 * Saved pip allocation presets (persisted via NavPersistence v2).
 */

import { PIPS } from '../core/Constants.js';

function normalizeAlloc(raw) {
  const out = {};
  for (const ch of PIPS.CHANNELS) {
    out[ch] = Math.max(0, Math.min(PIPS.MAX_PER_CHANNEL, raw?.[ch] | 0));
  }
  return out;
}

export class PipLoadouts {
  constructor() {
    /** @type {Array<object>} */
    this.entries = [];
    this._nextId = 1;
    /** @type {string|null} */
    this.activeId = null;
  }

  get active() {
    if (!this.activeId) return null;
    return this.entries.find((e) => e.id === this.activeId) || null;
  }

  defaultTitle(entry) {
    return entry.defaultName || `Loadout #${entry.number ?? '?'}`;
  }

  title(entry) {
    const custom = entry.customName != null ? String(entry.customName).trim() : '';
    if (custom) return custom;
    return this.defaultTitle(entry);
  }

  isRenamed(entry) {
    const custom = entry.customName != null ? String(entry.customName).trim() : '';
    return custom.length > 0;
  }

  find(id) {
    return this.entries.find((e) => e.id === id) || null;
  }

  atCapacity() {
    return this.entries.length >= (PIPS.MAX_LOADOUTS || 12);
  }

  saveNew(pipSystem) {
    if (this.atCapacity()) return null;
    const n = this._nextId++;
    const entry = {
      id: `ld${n}`,
      number: n,
      defaultName: `Loadout #${n}`,
      customName: null,
      locked: false,
      alloc: normalizeAlloc(pipSystem.snapshotAlloc()),
      savedAt: Date.now(),
    };
    this.entries.unshift(entry);
    this.activeId = entry.id;
    return entry;
  }

  updateActive(pipSystem) {
    const entry = this.active;
    if (!entry || entry.locked) return false;
    entry.alloc = normalizeAlloc(pipSystem.snapshotAlloc());
    entry.savedAt = Date.now();
    return true;
  }

  clearActiveLink() {
    this.activeId = null;
  }

  setCustomName(id, name) {
    const e = this.find(id);
    if (!e || name == null) return;
    const trimmed = String(name).trim();
    if (!trimmed || trimmed === this.defaultTitle(e)) {
      e.customName = null;
    } else {
      e.customName = trimmed;
    }
  }

  toggleLock(id) {
    const e = this.find(id);
    if (e) e.locked = !e.locked;
  }

  deleteEntry(id) {
    const e = this.find(id);
    if (!e || e.locked) return false;
    this.entries = this.entries.filter((x) => x.id !== id);
    if (this.activeId === id) this.activeId = null;
    return true;
  }

  previewDeleteAllUnlocked() {
    const toRemove = this.entries.filter((e) => !e.locked);
    const renamedUnlocked = toRemove.filter((e) => this.isRenamed(e));
    return { toRemove, renamedUnlocked };
  }

  deleteAllUnlocked() {
    const { toRemove } = this.previewDeleteAllUnlocked();
    const ids = new Set(toRemove.map((e) => e.id));
    this.entries = this.entries.filter((e) => !ids.has(e.id));
    if (this.activeId && ids.has(this.activeId)) this.activeId = null;
    return toRemove.length;
  }

  /** Seed first loadout from defaults when migrating empty saves. */
  seedDefaultIfEmpty() {
    if (this.entries.length) return null;
    const alloc = normalizeAlloc(PIPS.DEFAULTS);
    const entry = {
      id: 'ld1',
      number: 1,
      defaultName: 'Loadout #1',
      customName: null,
      locked: false,
      alloc,
      savedAt: Date.now(),
    };
    this.entries.push(entry);
    this._nextId = Math.max(this._nextId, 2);
    return entry;
  }

  toJSON() {
    return {
      nextId: this._nextId,
      activeId: this.activeId,
      entries: this.entries.map((e) => ({
        ...e,
        alloc: { ...e.alloc },
      })),
    };
  }

  fromJSON(data) {
    this.entries = [];
    this.activeId = null;
    if (!data) return;
    this._nextId = data.nextId || 1;
    this.activeId = data.activeId || null;
    for (const raw of data.entries || []) {
      this.entries.push({
        id: raw.id,
        number:
          raw.number ??
          (parseInt(String(raw.id).replace(/\D/g, ''), 10) || 0),
        defaultName: raw.defaultName || `Loadout #${raw.number ?? '?'}`,
        customName: raw.customName ?? null,
        locked: !!raw.locked,
        alloc: normalizeAlloc(raw.alloc),
        savedAt: raw.savedAt ?? Date.now(),
      });
    }
    if (this.activeId && !this.find(this.activeId)) this.activeId = null;
  }
}
