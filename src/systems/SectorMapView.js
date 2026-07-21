/**
 * Sector map panel — pan/zoom/follow state and screen↔world mapping.
 */

import { createTravelLogTableState } from '../world/TravelLogTable.js';

export const MAP_BASE_SPAN = 70000;
export const MAP_ZOOM_MIN = 0.25;
export const MAP_ZOOM_MAX = 8;

export class SectorMapView {
  constructor() {
    this.panCenter = { x: 0, y: 0 };
    this.followShip = true;
    this.zoom = 1;
    /** @type {{ x: number, y: number } | null} */
    this.hoverWorld = null;
    /** Screen rect of map canvas body (set each frame). */
    this.mapBody = null;
    this.tabs = { sector: 0 };
    /** @type {null | { phase: 'deleteOne'|'deleteAll', entryId?: string, names?: string[] }} */
    this.modal = null;
    /** @type {null | { entryId: string, x: number, y: number }} */
    this.travelLogMenu = null;
    /** @type {null | { kind: 'map', worldX: number, worldY: number, x: number, y: number } | { kind: 'poi', poiId: string, x: number, y: number }} */
    this.sectorMapMenu = null;
    this.travelLogTable = createTravelLogTableState();
    this._drag = null;
    this.suppressClick = false;
  }

  syncFollow(ship) {
    if (this.followShip && ship?.position) {
      this.panCenter.x = ship.position.x;
      this.panCenter.y = ship.position.y;
    }
  }

  recenter(ship) {
    if (ship?.position) {
      this.panCenter.x = ship.position.x;
      this.panCenter.y = ship.position.y;
    }
    this.followShip = true;
  }

  worldSpan(boxW, boxH) {
    return MAP_BASE_SPAN / this.zoom;
  }

  scaleForBox(boxW, boxH) {
    const span = this.worldSpan(boxW, boxH);
    return Math.min(boxW, boxH) / span;
  }

  worldToScreen(wx, wy, box) {
    const scale = this.scaleForBox(box.w, box.h);
    const ccx = box.x + box.w / 2;
    const ccy = box.y + box.h / 2;
    return {
      x: ccx + (wx - this.panCenter.x) * scale,
      y: ccy + (wy - this.panCenter.y) * scale,
    };
  }

  screenToWorld(sx, sy, box) {
    const scale = this.scaleForBox(box.w, box.h);
    const ccx = box.x + box.w / 2;
    const ccy = box.y + box.h / 2;
    return {
      x: this.panCenter.x + (sx - ccx) / scale,
      y: this.panCenter.y + (sy - ccy) / scale,
    };
  }

  stepZoom(delta) {
    if (!delta) return;
    const step = 0.12;
    this.zoom = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, this.zoom * (1 + Math.sign(delta) * step)));
  }

  containsTravelLogList(sx, sy) {
    const b = this.travelLogListBox;
    if (!b) return false;
    return sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h;
  }

  containsMapPoint(sx, sy) {
    const b = this.mapBody;
    if (!b) return false;
    return sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h;
  }

  beginPointer(sx, sy) {
    this._drag = { sx, sy, moved: false, panStart: { ...this.panCenter } };
  }

  movePointer(sx, sy, box) {
    const d = this._drag;
    if (!d || !box) return;
    if (Math.hypot(sx - d.sx, sy - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    const scale = this.scaleForBox(box.w, box.h);
    this.panCenter.x = d.panStart.x - (sx - d.sx) / scale;
    this.panCenter.y = d.panStart.y - (sy - d.sy) / scale;
    this.followShip = false;
  }

  endPointer() {
    const d = this._drag;
    this._drag = null;
    this.suppressClick = !!(d && d.moved);
    return d;
  }

  pointerDragging() {
    return this._drag?.moved;
  }
}
