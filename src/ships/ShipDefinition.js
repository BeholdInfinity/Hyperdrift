/**
 * Runtime composed ship definition — sections + equipped items + resolved mounts.
 */

import { getShipClass, cargoCapacityFor, seatCapacityFor } from './ShipClasses.js';
import { getSection } from './SectionCatalog.js';
import { getItem } from './ItemCatalog.js';
import { resolvePalette } from './Themes.js';
import { BELL_FEET, ULTRA_FEET, sectionScale } from './SectionGeometry.js';

/**
 * @typedef {{
 *   classId: string,
 *   colorwayBySection?: Record<string, string>,
 *   defaultColorway: string,
 *   sectionIds: Record<string, string>,
 *   equipment: Record<string, string>,
 *   seatsOccupied?: number,
 *   seatsReserved?: number,
 * }} ShipLoadout
 */

export class ShipDefinition {
  /**
   * @param {ShipLoadout} loadout
   */
  constructor(loadout) {
    this.classId = loadout.classId;
    this.defaultColorway = loadout.defaultColorway;
    this.colorwayBySection = loadout.colorwayBySection || {};
    /** role → section id */
    this.sectionIds = { ...loadout.sectionIds };
    /** hardpoint key → item id */
    this.equipment = { ...loadout.equipment };
    this.seatsOccupied = Math.max(0, loadout.seatsOccupied | 0);
    this.seatsReserved = Math.max(0, loadout.seatsReserved | 0);
    this._mountCache = null;
  }

  get classDef() {
    return getShipClass(this.classId);
  }

  get swapGroup() {
    return this.classDef?.swapGroup ?? null;
  }

  get scale() {
    return this.classDef?.scale ?? 1;
  }

  get canDockHomeBase() {
    return this.classDef?.canDockHomeBase !== false;
  }

  /** Hold section for cargo/seats: body → aft → hull */
  holdSection() {
    return (
      this.section('body') ||
      this.section('aft') ||
      this.section('hull') ||
      null
    );
  }

  holdMk() {
    return this.holdSection()?.mk ?? 2;
  }

  cargoCapacity() {
    return cargoCapacityFor(this.classDef, this.holdMk());
  }

  seatCapacity() {
    return seatCapacityFor(this.classDef, this.holdMk());
  }

  seatsFree() {
    const cap = this.seatCapacity();
    return Math.max(0, cap - this.seatsOccupied - this.seatsReserved);
  }

  canBoard(n = 1) {
    return n > 0 && this.seatsFree() >= n;
  }

  board(n = 1) {
    if (!this.canBoard(n)) return false;
    this.seatsOccupied += n;
    return true;
  }

  debark(n = 1) {
    const take = Math.min(Math.max(0, n | 0), this.seatsOccupied);
    this.seatsOccupied -= take;
    return take;
  }

  section(role) {
    const id = this.sectionIds[role];
    return id ? getSection(id) : null;
  }

  sections() {
    return Object.keys(this.sectionIds)
      .map((role) => this.section(role))
      .filter(Boolean);
  }

  itemOn(key) {
    const id = this.equipment[key];
    return id ? getItem(id) : null;
  }

  resolveMounts() {
    if (this._mountCache) return this._mountCache;
    /** @type {Record<string, { socket: object, item: object|null, sectionRole: string }>} */
    const mounts = {};
    for (const sec of this.sections()) {
      for (const hp of sec.hardpoints) {
        const item = this.itemOn(hp.key) || null;
        mounts[hp.key] = { socket: hp, item, sectionRole: sec.role };
      }
    }
    this._mountCache = mounts;
    return mounts;
  }

  invalidateMounts() {
    this._mountCache = null;
  }

  setEquipment(key, itemIdOrNull) {
    if (itemIdOrNull == null) delete this.equipment[key];
    else this.equipment[key] = itemIdOrNull;
    this.invalidateMounts();
  }

  hardpointsTable() {
    const mounts = this.resolveMounts();
    /** @type {Record<string, { x: number, y: number, angle: number }>} */
    const table = {};
    for (const [key, m] of Object.entries(mounts)) {
      table[key] = {
        x: m.socket.x,
        y: m.socket.y,
        angle: m.socket.angle,
      };
    }
    return table;
  }

  /**
   * Ship-local extents along ±X (nose = +X, aft = −X) from section footprints.
   * Used for dock/ingress contact — not hard-coded tip offsets.
   * @returns {{ forward: number, aft: number }}
   */
  hullExtents() {
    let forward = 0;
    let aft = 0;
    const classScale = this.scale;
    for (const sec of this.sections()) {
      let feet = null;
      if (sec.geometryKey === 'bell') {
        feet = BELL_FEET[sec.role];
      } else if (sec.role === 'hull' || this.swapGroup === 'ultraLight') {
        feet = ULTRA_FEET[this.classId] || ULTRA_FEET.lightFighter;
      }
      if (!feet) continue;
      const s =
        sec.geometryKey === 'bell'
          ? classScale || 1
          : sectionScale(classScale, sec.morph || 0);
      for (const [x] of feet) {
        const sx = x * s;
        if (sx > forward) forward = sx;
        if (-sx > aft) aft = -sx;
      }
    }
    if (forward < 1 && aft < 1) {
      for (const m of Object.values(this.hardpointsTable())) {
        const x = m.x || 0;
        if (x > forward) forward = x;
        if (-x > aft) aft = -x;
      }
    }
    return {
      forward: forward > 1 ? forward : 22,
      aft: aft > 1 ? aft : 20,
    };
  }

  /** Ship-local +X distance to the nose tip of the silhouette. */
  forwardExtent() {
    return this.hullExtents().forward;
  }

  /** Ship-local −X distance to the aft tip of the silhouette. */
  aftExtent() {
    return this.hullExtents().aft;
  }

  thrusterKeys() {
    return Object.keys(this.resolveMounts()).filter((k) => {
      const m = this.resolveMounts()[k];
      return m.socket.category === 'maneuverThruster';
    });
  }

  mainEngineKeys() {
    return Object.keys(this.resolveMounts()).filter((k) => {
      const m = this.resolveMounts()[k];
      return m.socket.category === 'mainEngine' && m.item;
    });
  }

  paletteForSection(role) {
    const sec = this.section(role);
    const theme = sec?.theme || 'civMid';
    const cw =
      this.colorwayBySection[role] ||
      this.defaultColorway ||
      'stationBlue';
    // resolvePalette always returns a real colorway for the section theme —
    // never null colors (avoids canvas fillStyle bleed / theme strobing).
    return resolvePalette(theme, cw, sec?.mk ?? 2);
  }

  paletteForMount(hardpointKey) {
    const m = this.resolveMounts()[hardpointKey];
    const role = m?.sectionRole;
    if (role) return this.paletteForSection(role);
    return this.primaryPalette();
  }

  setColorwayForSection(role, colorwayId) {
    if (!role) return;
    this.colorwayBySection = { ...this.colorwayBySection, [role]: colorwayId };
  }

  setSection(role, sectionId) {
    if (!role || !sectionId) return;
    if (!getSection(sectionId)) return;
    this.sectionIds = { ...this.sectionIds, [role]: sectionId };
    this.invalidateMounts();
    const cap = this.seatCapacity();
    if (this.seatsOccupied + this.seatsReserved > cap) {
      this.seatsReserved = Math.min(
        this.seatsReserved,
        Math.max(0, cap - this.seatsOccupied)
      );
      this.seatsOccupied = Math.min(this.seatsOccupied, cap);
    }
  }

  sectionRoles() {
    const roles = Object.keys(this.sectionIds);
    const order = ['bridge', 'cockpit', 'body', 'hull', 'aft', 'engine'];
    return roles.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  primaryPalette() {
    const roles = this.sectionRoles();
    const prefer = roles.includes('body')
      ? 'body'
      : roles.includes('hull')
        ? 'hull'
        : roles[0];
    return this.paletteForSection(prefer);
  }
}
