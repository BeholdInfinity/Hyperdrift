/**
 * NavRoute — ephemeral multi-stop flight route (distinct from POI Book pins).
 */

import { NAV } from '../core/Constants.js';

let _nextId = 1;

export function setNavRouteIdCounter(n) {
  _nextId = Math.max(1, n | 0);
}

export class NavRoute {
  constructor() {
    /** @type {Array<object>} */
    this.stops = [];
    this._genericCounter = 0;
  }

  /** @param {import('../core/GameEngine.js').GameEngine} engine */
  addStop(spec, engine) {
    if (this.stops.length >= NAV.MAX_STOPS) return null;
    const id = spec.id || `nav${_nextId++}`;
    if (!spec.id) _nextId = Math.max(_nextId, parseInt(String(id).replace(/\D/g, ''), 10) + 1 || _nextId);

    let stop;
    if (spec.kind === 'poi' && spec.poiId && engine?.poiSystem) {
      const poi = engine.poiSystem.list.find((p) => p.id === spec.poiId);
      if (!poi) return null;
      stop = {
        id,
        kind: 'poi',
        poiId: spec.poiId,
        label: spec.label || poi.name,
        x: poi.x,
        y: poi.y,
      };
    } else {
      const n = ++this._genericCounter;
      stop = {
        id,
        kind: 'world',
        poiId: null,
        label: spec.label || `Stop #${n}`,
        x: spec.x,
        y: spec.y,
      };
    }
    this.stops.push(stop);
    return stop;
  }

  removeStop(id) {
    const i = this.stops.findIndex((s) => s.id === id);
    if (i < 0) return false;
    this.stops.splice(i, 1);
    return true;
  }

  moveStop(id, newIndex) {
    const i = this.stops.findIndex((s) => s.id === id);
    if (i < 0) return false;
    const clamped = Math.max(0, Math.min(newIndex, this.stops.length - 1));
    const [item] = this.stops.splice(i, 1);
    this.stops.splice(clamped, 0, item);
    return true;
  }

  clearAll() {
    this.stops = [];
  }

  activeStop() {
    return this.stops[0] || null;
  }

  remainingCount() {
    return this.stops.length;
  }

  /** Refresh coords; demote orphaned POI refs to generic world stops. */
  resolvePosition(engine) {
    if (!engine?.poiSystem) return;
    for (const stop of this.stops) {
      if (stop.kind !== 'poi' || !stop.poiId) continue;
      const poi = engine.poiSystem.list.find((p) => p.id === stop.poiId);
      if (!poi) {
        stop.kind = 'world';
        stop.poiId = null;
        stop.label = `Stop #${++this._genericCounter}`;
        continue;
      }
      stop.x = poi.x;
      stop.y = poi.y;
      stop.label = poi.name;
    }
  }

  /** @param {import('../core/GameEngine.js').GameEngine} engine */
  stopColor(engine, stop) {
    if (stop?.kind === 'poi' && stop.poiId && engine?.poiSystem) {
      const poi = engine.poiSystem.list.find((p) => p.id === stop.poiId);
      if (poi) return engine.poiSystem.color(poi);
    }
    return NAV.GENERIC_STOP_COLOR;
  }

  rangeBearing(ship, stop) {
    if (!ship || !stop) return { range: 0, bearing: 0 };
    const dx = stop.x - ship.position.x;
    const dy = stop.y - ship.position.y;
    return {
      range: Math.hypot(dx, dy),
      bearing: Math.atan2(dy, dx),
    };
  }

  checkArrival(ship, radius, engine) {
    if (!ship || !this.stops.length) return false;
    this.resolvePosition(engine);
    const head = this.stops[0];
    const d = Math.hypot(head.x - ship.position.x, head.y - ship.position.y);
    if (d > radius) return false;
    this.stops.shift();
    return true;
  }

  /** Map marker hit-test hook (sector map tooltips). */
  getMapMarkers(engine) {
    this.resolvePosition(engine);
    return this.stops.map((stop, i) => ({
      id: stop.id,
      x: stop.x,
      y: stop.y,
      name: stop.label,
      kind: 'navStop',
      index: i + 1,
      active: i === 0,
      hitRadius: i === 0 ? 12 : 10,
    }));
  }

  exportForSave() {
    return {
      stops: this.stops.map((s) => ({
        id: s.id,
        kind: s.kind,
        poiId: s.poiId,
        label: s.label,
        x: s.x,
        y: s.y,
      })),
      genericCounter: this._genericCounter,
      nextId: _nextId,
    };
  }

  hydrateFromSave(data) {
    if (!data?.stops?.length) {
      this.stops = [];
      if (data?.genericCounter != null) this._genericCounter = data.genericCounter | 0;
      if (data?.nextId != null) setNavRouteIdCounter(data.nextId);
      return;
    }
    this.stops = data.stops.map((raw) => ({
      id: raw.id || `nav${_nextId++}`,
      kind: raw.kind === 'poi' ? 'poi' : 'world',
      poiId: raw.poiId || null,
      label: raw.label || 'Stop',
      x: raw.x,
      y: raw.y,
    }));
    if (data.genericCounter != null) this._genericCounter = data.genericCounter | 0;
    if (data.nextId != null) setNavRouteIdCounter(data.nextId);
    else {
      let maxId = 1;
      for (const s of this.stops) {
        const n = parseInt(String(s.id).replace(/\D/g, ''), 10);
        if (n >= maxId) maxId = n + 1;
      }
      setNavRouteIdCounter(maxId);
    }
  }
}
