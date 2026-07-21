/**
 * PoiSystem — the Points-of-Interest address book + waypoint tracker model.
 *
 * POIs register via four discovery sources (proximity / mission / manual /
 * purchase). Each POI carries an IFF color and two independent toggles: show on
 * the POI ring (bearing-only dots, no sweep) and show on the sector map. One
 * POI can be selected → its details fill the Destination panel.
 *
 * Bearing to a POI works at any distance (find your way back to Jennings from
 * thousands of km out); range is informational.
 */

import { STATION, POI, IFF } from '../core/Constants.js';

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
    this._seed();
  }

  _seedJenningsOnly() {
    this.register(
      {
        x: STATION.WORLD_X,
        y: STATION.WORLD_Y,
        name: 'Jennings Station',
        iff: 'blue',
        discovered: true,
        onRing: true,
        onMap: true,
      },
      POI.SOURCE.PROXIMITY
    );
  }

  _seed() {
    this._seedJenningsOnly();
    // Scaffold POIs discovered by proximity as you explore.
    const S = STATION.SCALE;
    this.register(
      { x: 3200 * S, y: -1400 * S, name: 'Derelict Freighter', iff: 'yellow' },
      POI.SOURCE.PROXIMITY
    );
    this.register(
      { x: -2600 * S, y: 2200 * S, name: 'Nav Beacon Kesta', iff: 'blue' },
      POI.SOURCE.PROXIMITY
    );
    this.register(
      { x: 800 * S, y: 3600 * S, name: 'Ore Field Marker', iff: 'green' },
      POI.SOURCE.PROXIMITY
    );
  }

  /**
   * @param {{x:number,y:number,name:string,iff?:string,discovered?:boolean,onRing?:boolean,onMap?:boolean}} p
   * @param {string} source
   */
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
    };
    if (!id) _nextId = Math.max(_nextId, parseInt(poi.id.replace(/\D/g, ''), 10) + 1 || _nextId);
    this.list.push(poi);
    return poi;
  }

  /** Drop a manual map pin (POI book + sector map). */
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

  /** @deprecated use addManualPin */
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
      if (p.source !== POI.SOURCE.MANUAL) continue;
      const label = p.defaultName || p.name;
      const m = String(label).match(/^Pin #(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
  }

  isUserPin(poi) {
    return poi && poi.source === POI.SOURCE.MANUAL && poi.name !== 'Jennings Station';
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

  update({ ship, onDiscover }) {
    if (!ship) return;
    const px = ship.position.x;
    const py = ship.position.y;
    let discoveredNew = false;
    for (const poi of this.list) {
      if (poi.discovered) continue;
      if (Math.hypot(poi.x - px, poi.y - py) <= POI.DISCOVER_RANGE) {
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

  /** Bearing (world radians) from ship to a POI. */
  bearing(ship, poi) {
    return Math.atan2(poi.y - ship.position.y, poi.x - ship.position.x);
  }

  range(ship, poi) {
    return Math.hypot(poi.x - ship.position.x, poi.y - ship.position.y);
  }

  deletePoi(id) {
    const p = this.list.find((q) => q.id === id);
    if (!p || p.name === 'Jennings Station') return false;
    if (p.locked) return false;
    if (this.selectedId === id) this.selectedId = null;
    this.list = this.list.filter((q) => q.id !== id);
    return true;
  }

  exportForSave() {
    return this.list.map((p) => ({
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

  /** Merge saved POIs; always keep Jennings at home. */
  hydrateFromSave(savedPois) {
    if (!savedPois?.length) return;
    const jennings = savedPois.find((p) => p.name === 'Jennings Station') || savedPois[0];
    this.list = [];
    this.selectedId = null;
    let maxId = 1;
    for (const raw of savedPois) {
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
        id
      );
    }
    setPoiIdCounter(maxId);
    if (!this.list.some((p) => p.name === 'Jennings Station')) {
      this._seedJenningsOnly();
    }
  }
}
