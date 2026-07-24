/**
 * PoiSystem — POI address book + waypoint tracker.
 *
 * Authored sites come from sectorLayout v2 via SectorBootstrap.
 * worldPosition(poi, t) resolves orbital + surface sites each frame.
 */

import { POI, IFF } from '../core/Constants.js';
import { siteWorldPosition, getSiteById } from './SectorLayout.js';

let _nextId = 1;

export function setPoiIdCounter(n) {
  _nextId = Math.max(1, n | 0);
}

export class PoiSystem {
  constructor() {
    /** @type {Array<object>} */
    this.list = [];
    /** @type {string|null} */
    this.selectedId = null;
    /** @type {Map<string, object>} */
    this._siteById = new Map();
  }

  bootstrapFromLayout(layout) {
    this.list = [];
    this.selectedId = null;
    this._siteById.clear();
    for (const site of layout.sites ?? []) {
      const pos = siteWorldPosition(site, 0, layout);
      const poi = this.register(
        {
          x: pos.x,
          y: pos.y,
          name: site.name,
          defaultName: site.name,
          iff: site.iff ?? 'blue',
          discovered: site.id === 'site.jennings',
          onRing: site.id === 'site.jennings',
          onMap: site.id === 'site.jennings',
          siteId: site.id,
          kind: site.kind,
          motion: site.motion,
          orbit: site.orbit ? { ...site.orbit } : undefined,
          surfaceAngle: site.surfaceAngle,
          placeId: site.placeId,
        },
        site.id === 'site.jennings' ? POI.SOURCE.PROXIMITY : POI.SOURCE.MANUAL,
        site.id,
      );
      this._siteById.set(site.id, poi);
    }
  }

  /** Live world xy for authored sites; static for manual pins. */
  worldPosition(poi, gameTime = 0) {
    if (!poi) return { x: 0, y: 0 };
    if (poi.siteId) {
      const site = getSiteById(poi.siteId);
      if (site) return siteWorldPosition(site, gameTime);
    }
    return { x: poi.x ?? 0, y: poi.y ?? 0 };
  }

  syncPositions(gameTime = 0) {
    for (const poi of this.list) {
      if (!poi.siteId) continue;
      const pos = this.worldPosition(poi, gameTime);
      poi.x = pos.x;
      poi.y = pos.y;
    }
  }

  getBySiteId(siteId) {
    return this._siteById.get(siteId) ?? null;
  }

  register(p, source = POI.SOURCE.MANUAL, id = null) {
    const defaultName = (p.defaultName ?? p.name) || 'Waypoint';
    const poi = {
      id: id || `poi${_nextId++}`,
      x: p.x,
      y: p.y,
      name: p.name || defaultName,
      defaultName,
      iff: p.iff || 'yellow',
      source,
      discovered: !!p.discovered,
      onRing: p.onRing != null ? p.onRing : !!p.discovered,
      onMap: p.onMap != null ? p.onMap : !!p.discovered,
      locked: !!p.locked,
      siteId: p.siteId ?? null,
      kind: p.kind,
      motion: p.motion,
      orbit: p.orbit,
      surfaceAngle: p.surfaceAngle,
      placeId: p.placeId,
    };
    if (!id) _nextId = Math.max(_nextId, parseInt(String(poi.id).replace(/\D/g, ''), 10) + 1 || _nextId);
    this.list.push(poi);
    return poi;
  }

  addManualPin(x, y) {
    const num = this._nextPinNumber();
    const defaultName = `Pin #${num}`;
    return this.register(
      {
        x,
        y,
        name: defaultName,
        defaultName,
        iff: 'yellow',
        discovered: true,
        onRing: true,
        onMap: true,
        locked: false,
      },
      POI.SOURCE.MANUAL,
    );
  }

  addManualWaypoint(x, y, name = 'Marker') {
    if (name && name !== 'Marker') {
      const poi = this.addManualPin(x, y);
      this.setPoiName(poi.id, name);
      return poi;
    }
    return this.addManualPin(x, y);
  }

  _nextPinNumber() {
    let max = 0;
    for (const p of this.list) {
      if (p.source !== POI.SOURCE.MANUAL || p.siteId) continue;
      const label = p.defaultName || p.name;
      const m = String(label).match(/^Pin #(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
  }

  isUserPin(poi) {
    return poi && poi.source === POI.SOURCE.MANUAL && !poi.siteId;
  }

  isPoiRenamed(poi) {
    if (!poi) return false;
    const def = poi.defaultName || poi.name;
    return String(poi.name).trim() !== String(def).trim();
  }

  setPoiName(id, name) {
    const p = this.list.find((q) => q.id === id);
    if (!p || !this.isUserPin(p)) return;
    const trimmed = String(name ?? '').trim();
    const def = p.defaultName || `Pin #?`;
    p.name = !trimmed || trimmed === def ? def : trimmed;
  }

  togglePoiLock(id) {
    const p = this.list.find((q) => q.id === id);
    if (p && this.isUserPin(p)) p.locked = !p.locked;
  }

  update({ ship, gameTime = 0, onDiscover }) {
    if (!ship) return;
    const px = ship.position.x;
    const py = ship.position.y;
    let discoveredNew = false;
    for (const poi of this.list) {
      if (poi.discovered) continue;
      const pos = this.worldPosition(poi, gameTime);
      if (Math.hypot(pos.x - px, pos.y - py) <= POI.DISCOVER_RANGE) {
        poi.discovered = true;
        poi.onRing = true;
        poi.onMap = true;
        discoveredNew = true;
      }
    }
    if (discoveredNew && typeof onDiscover === 'function') onDiscover();
  }

  discovered() {
    return this.list.filter((p) => p.discovered);
  }

  ringPois() {
    return this.list.filter((p) => p.discovered && p.onRing);
  }

  mapPois() {
    return this.list.filter((p) => p.discovered && p.onMap);
  }

  getSelected() {
    if (!this.selectedId) return null;
    return this.list.find((p) => p.id === this.selectedId) || null;
  }

  select(id) {
    this.selectedId = id;
  }

  clearSelection() {
    this.selectedId = null;
  }

  toggleRing(id) {
    const p = this.list.find((q) => q.id === id);
    if (p) p.onRing = !p.onRing;
  }

  toggleMap(id) {
    const p = this.list.find((q) => q.id === id);
    if (p) p.onMap = !p.onMap;
  }

  color(poi) {
    return IFF[poi.iff] || IFF.yellow;
  }

  bearing(ship, poi, gameTime = 0) {
    const pos = this.worldPosition(poi, gameTime);
    return Math.atan2(pos.y - ship.position.y, pos.x - ship.position.x);
  }

  range(ship, poi, gameTime = 0) {
    const pos = this.worldPosition(poi, gameTime);
    return Math.hypot(pos.x - ship.position.x, pos.y - ship.position.y);
  }

  deletePoi(id) {
    const p = this.list.find((q) => q.id === id);
    if (!p || p.siteId === 'site.jennings') return false;
    if (p.locked) return false;
    if (this.selectedId === id) this.selectedId = null;
    this.list = this.list.filter((q) => q.id !== id);
    return true;
  }

  previewDeleteAllUnlocked() {
    const toRemove = this.list.filter((p) => this.isUserPin(p) && !p.locked);
    const renamedUnlocked = toRemove.filter((p) => this.isPoiRenamed(p));
    return { toRemove, renamedUnlocked };
  }

  deleteAllUnlocked() {
    const { toRemove } = this.previewDeleteAllUnlocked();
    const ids = new Set(toRemove.map((p) => p.id));
    if (this.selectedId && ids.has(this.selectedId)) this.selectedId = null;
    this.list = this.list.filter((p) => !ids.has(p.id));
    return toRemove.length;
  }

  exportForSave() {
    return this.list
      .filter((p) => !p.siteId)
      .map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        name: p.name,
        iff: p.iff,
        source: p.source,
        discovered: p.discovered,
        onRing: p.onRing,
        onMap: p.onMap,
        locked: !!p.locked,
        defaultName: p.defaultName,
      }));
  }

  hydrateFromSave(savedPois) {
    if (!savedPois?.length) return;
    const authored = this.list.filter((p) => p.siteId);
    this.list = [...authored];
    this.selectedId = null;
    let maxId = 1;
    for (const raw of savedPois) {
      if (raw.siteId || String(raw.id || '').startsWith('site.')) continue;
      const id = raw.id || `poi${maxId++}`;
      const num = parseInt(String(id).replace(/\D/g, ''), 10);
      if (num >= maxId) maxId = num + 1;
      this.register(
        {
          x: raw.x,
          y: raw.y,
          name: raw.name,
          defaultName: raw.defaultName || raw.name,
          iff: raw.iff,
          discovered: raw.discovered,
          onRing: raw.onRing,
          onMap: raw.onMap,
          locked: !!raw.locked,
        },
        raw.source || POI.SOURCE.MANUAL,
        id,
      );
    }
    setPoiIdCounter(maxId);
  }
}
