/**
 * Travel Log — archived expedition trails (persistent across sessions).
 */

import { formatTripDuration } from './TravelLogTable.js';

export const TRAIL_PALETTE = [
  'rgba(230, 171, 109, 0.55)',
  'rgba(95, 224, 138, 0.5)',
  'rgba(255, 180, 100, 0.5)',
  'rgba(180, 140, 255, 0.5)',
  'rgba(255, 120, 120, 0.45)',
  'rgba(140, 200, 220, 0.5)',
];

/** Nav route reserves white — skip near-white palette slots for travel log trails. */
function trailColorIsReserved(color) {
  const m = String(color).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return false;
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 220 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
}

export function safeTrailColorIndex(entryIndex) {
  const len = TRAIL_PALETTE.length;
  for (let i = 0; i < len; i++) {
    const idx = (entryIndex + i) % len;
    if (!trailColorIsReserved(TRAIL_PALETTE[idx])) return idx;
  }
  return entryIndex % len;
}

/** @param {number} ts */
export function formatTripDate(ts) {
  const d = new Date(ts ?? Date.now());
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function parseExpeditionNumberFromLabel(label) {
  if (!label) return null;
  const m = String(label).match(/^Expedition #(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export class TravelLog {
  constructor() {
    /** @type {Array<object>} */
    this.entries = [];
    this._nextId = 1;
  }

  colorForEntry(entry) {
    const i = entry.colorIndex != null ? entry.colorIndex : 0;
    return TRAIL_PALETTE[((i % TRAIL_PALETTE.length) + TRAIL_PALETTE.length) % TRAIL_PALETTE.length];
  }

  defaultExpeditionTitle(entry) {
    const n = entry.expeditionNumber ?? '?';
    return `Expedition #${n}`;
  }

  expeditionTitle(entry) {
    const custom = entry.customName != null ? String(entry.customName).trim() : '';
    if (custom) return custom;
    return this.defaultExpeditionTitle(entry);
  }

  formatTripMeta(entry) {
    const date = formatTripDate(entry.endedAt ?? entry.startedAt);
    const km = ((entry.distanceTraveled ?? 0) / 100).toFixed(1);
    const pois = entry.poisEncountered ?? 0;
    const poiLabel = pois === 1 ? '1 POI' : `${pois} POI`;
    const dur = formatTripDuration(
      Math.max(0, (entry.endedAt ?? 0) - (entry.startedAt ?? entry.endedAt ?? 0)),
    );
    return `${date} · ${dur} · ${km} km · ${poiLabel}`;
  }

  isRenamed(entry) {
    const custom = entry.customName != null ? String(entry.customName).trim() : '';
    return custom.length > 0;
  }

  /**
   * @param {{ trail: {x:number,y:number}[], startedAt?: number, endedAt?: number, expeditionNumber?: number, distanceTraveled?: number, poisEncountered?: number }} payload
   */
  archiveExpedition(payload) {
    const n = payload.expeditionNumber ?? this._nextId;
    const entry = {
      id: `exp${this._nextId++}`,
      expeditionNumber: n,
      customName: null,
      startedAt: payload.startedAt ?? Date.now(),
      endedAt: payload.endedAt ?? Date.now(),
      trail: payload.trail ? payload.trail.map((p) => ({ x: p.x, y: p.y })) : [],
      distanceTraveled: payload.distanceTraveled ?? 0,
      poisEncountered: payload.poisEncountered ?? 0,
      locked: false,
      visibleOnMap: false,
      colorIndex: safeTrailColorIndex(this.entries.length),
    };
    this.entries.unshift(entry);
    return entry;
  }

  visibleEntries() {
    return this.entries.filter((e) => e.visibleOnMap);
  }

  toggleVisible(id) {
    const e = this.entries.find((x) => x.id === id);
    if (e) e.visibleOnMap = !e.visibleOnMap;
  }

  setCustomName(id, name) {
    const e = this.entries.find((x) => x.id === id);
    if (!e || name == null) return;
    const trimmed = String(name).trim();
    if (!trimmed || trimmed === this.defaultExpeditionTitle(e)) {
      e.customName = null;
    } else {
      e.customName = trimmed;
    }
  }

  toggleLock(id) {
    const e = this.entries.find((x) => x.id === id);
    if (e) e.locked = !e.locked;
  }

  deleteEntry(id) {
    const e = this.entries.find((x) => x.id === id);
    if (!e || e.locked) return false;
    this.entries = this.entries.filter((x) => x.id !== id);
    return true;
  }

  /** @returns {{ toRemove: object[], renamedUnlocked: object[] }} */
  previewDeleteAllUnlocked() {
    const toRemove = this.entries.filter((e) => !e.locked);
    const renamedUnlocked = toRemove.filter((e) => this.isRenamed(e));
    return { toRemove, renamedUnlocked };
  }

  deleteAllUnlocked() {
    const { toRemove } = this.previewDeleteAllUnlocked();
    const ids = new Set(toRemove.map((e) => e.id));
    this.entries = this.entries.filter((e) => !ids.has(e.id));
    return toRemove.length;
  }

  _migrateRaw(raw) {
    let expeditionNumber = raw.expeditionNumber;
    if (expeditionNumber == null) {
      expeditionNumber =
        parseExpeditionNumberFromLabel(raw.defaultLabel) ??
        parseExpeditionNumberFromLabel(raw.label) ??
        0;
    }

    let customName = raw.customName != null ? String(raw.customName).trim() || null : null;
    if (!customName && raw.label && raw.defaultLabel && raw.label !== raw.defaultLabel) {
      const titlePart = String(raw.label).split(' · ')[0].trim();
      const defaultTitle = String(raw.defaultLabel).split(' · ')[0].trim();
      if (titlePart && titlePart !== defaultTitle) customName = titlePart;
    }

    return {
      id: raw.id,
      expeditionNumber,
      customName,
      startedAt: raw.startedAt,
      endedAt: raw.endedAt,
      trail: (raw.trail || []).map((p) => ({ x: p.x, y: p.y })),
      distanceTraveled: raw.distanceTraveled ?? 0,
      poisEncountered: raw.poisEncountered ?? 0,
      locked: !!raw.locked,
      visibleOnMap: !!raw.visibleOnMap,
      colorIndex: raw.colorIndex ?? 0,
    };
  }

  toJSON() {
    return {
      nextId: this._nextId,
      entries: this.entries.map((e) => ({
        ...e,
        trail: e.trail.map((p) => ({ x: p.x, y: p.y })),
      })),
    };
  }

  fromJSON(data) {
    this.entries = [];
    if (!data) return;
    this._nextId = data.nextId || 1;
    for (const raw of data.entries || []) {
      this.entries.push(this._migrateRaw(raw));
    }
  }
}
