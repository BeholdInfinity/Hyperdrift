/**
 * Dev-only mount authoring inside Blueprint — drag/rotate unit mounts, apply to sandbox ship.
 */

import { DevTools } from './DevTools.js';
import { BELL_MOUNTS, ULTRA_MOUNTS } from '../ships/data/mountLayouts.js';
import { sectionScale } from '../ships/SectionGeometry.js';
import { Settings } from '../core/Settings.js';

/**
 * @param {import('../ships/ShipDefinition.js').ShipDefinition} def
 */
export function applyUnitMountsToShipDef(def) {
  if (!def) return;
  const classId = def.classId;
  const scale = def.scale ?? 1;
  const isUltra = !!ULTRA_MOUNTS[classId];

  for (const sec of def.sections()) {
    if (!sec?.hardpoints) continue;
    const morph = sec.variant === 'a' && classId === 'generalist' ? 0 : sec.morph || 0;
    const s = sectionScale(scale, morph);
    let unitList = null;
    if (classId === 'generalist' && BELL_MOUNTS[sec.role]) {
      unitList = BELL_MOUNTS[sec.role];
    } else if (isUltra && sec.role === 'hull') {
      unitList = ULTRA_MOUNTS[classId];
    }
    if (!unitList) continue;
    for (const hp of sec.hardpoints) {
      const u = unitList.find((m) => m.key === hp.key);
      if (!u) continue;
      hp.x = u.x * s;
      hp.y = u.y * s;
      hp.angle = u.angle;
    }
  }
  def.invalidateMounts();
}

/**
 * Find unit-space mount for a hardpoint key on the current blueprint ship.
 * @param {import('../ships/ShipDefinition.js').ShipDefinition} def
 * @param {string} key
 */
export function findUnitMount(def, key) {
  if (!def) return null;
  const classId = def.classId;
  if (classId === 'generalist') {
    for (const role of Object.keys(BELL_MOUNTS)) {
      const m = BELL_MOUNTS[role].find((x) => x.key === key);
      if (m) return { layout: 'bell', roleOrClass: role, mount: m };
    }
  }
  if (ULTRA_MOUNTS[classId]) {
    const m = ULTRA_MOUNTS[classId].find((x) => x.key === key);
    if (m) return { layout: 'ultra', roleOrClass: classId, mount: m };
  }
  return null;
}

/**
 * Pick nearest hardpoint in ship-local space.
 * @param {import('../ships/ShipDefinition.js').ShipDefinition} def
 * @param {number} localX
 * @param {number} localY
 * @param {number} [maxDist]
 */
export function pickHardpoint(def, localX, localY, maxDist = 14) {
  const table = def?.hardpointsTable?.() || {};
  let best = null;
  let bestD = maxDist;
  for (const [key, hp] of Object.entries(table)) {
    const d = Math.hypot(hp.x - localX, hp.y - localY);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}

/**
 * @param {object} engine GameEngine
 * @param {number} worldX
 * @param {number} worldY
 */
export function screenWorldToShipLocal(engine, worldX, worldY) {
  const ship = engine._sandboxShip || engine.ship;
  if (!ship) return null;
  const sx = ship.position?.x ?? ship.x ?? 0;
  const sy = ship.position?.y ?? ship.y ?? 0;
  const dx = worldX - sx;
  const dy = worldY - sy;
  const c = Math.cos(-ship.angle);
  const s = Math.sin(-ship.angle);
  return { x: dx * c - dy * s, y: dx * s + dy * c, ship };
}

export class BlueprintAuthoringController {
  constructor() {
    this.dragging = null;
    this.enabled = false;
  }

  syncEnabled() {
    this.enabled = Settings.isDevMode();
    return this.enabled;
  }

  /**
   * @param {object} engine
   * @param {number} worldX
   * @param {number} worldY
   */
  onPointerDown(engine, worldX, worldY) {
    if (!this.syncEnabled() || engine.mode !== 'blueprint') return false;
    const def = engine.getBlueprint?.()?.shipDef || engine._sandboxShip?.shipDef;
    if (!def) return false;
    const local = screenWorldToShipLocal(engine, worldX, worldY);
    if (!local) return false;
    const key = pickHardpoint(def, local.x, local.y, 16);
    if (!key) {
      DevTools.selectedMount = null;
      return false;
    }
    const found = findUnitMount(def, key);
    if (!found) return false;
    DevTools.selectedMount = {
      key,
      layout: found.layout,
      roleOrClass: found.roleOrClass,
    };
    const role = found.layout === 'bell' ? found.roleOrClass : 'hull';
    const sec = def.section?.(role);
    const morph =
      sec?.variant === 'a' && def.classId === 'generalist' ? 0 : sec?.morph || 0;
    this.dragging = {
      key,
      layout: found.layout,
      roleOrClass: found.roleOrClass,
      scale: sectionScale(def.scale || 1, morph) || 1,
    };
    return true;
  }

  onPointerMove(engine, worldX, worldY) {
    if (!this.dragging) return false;
    const def = engine.getBlueprint?.()?.shipDef || engine._sandboxShip?.shipDef;
    if (!def) return false;
    const local = screenWorldToShipLocal(engine, worldX, worldY);
    if (!local) return false;
    const s = this.dragging.scale || 1;
    const unitX = local.x / s;
    const unitY = local.y / s;
    DevTools.patchMount(this.dragging.layout, this.dragging.roleOrClass, this.dragging.key, {
      x: Math.round(unitX * 100) / 100,
      y: Math.round(unitY * 100) / 100,
    });
    applyUnitMountsToShipDef(def);
    return true;
  }

  onPointerUp() {
    const was = !!this.dragging;
    this.dragging = null;
    return was;
  }

  /**
   * Rotate selected mount by delta radians.
   * @param {object} engine
   * @param {number} dAngle
   */
  rotateSelected(engine, dAngle) {
    if (!this.syncEnabled()) return false;
    const sel = DevTools.selectedMount;
    if (!sel) return false;
    const found = findUnitMount(
      engine.getBlueprint?.()?.shipDef || engine._sandboxShip?.shipDef,
      sel.key
    );
    if (!found) return false;
    const next = (found.mount.angle || 0) + dAngle;
    DevTools.patchMount(sel.layout, sel.roleOrClass, sel.key, { angle: next });
    const def = engine.getBlueprint?.()?.shipDef || engine._sandboxShip?.shipDef;
    applyUnitMountsToShipDef(def);
    return true;
  }
}

export const blueprintAuthoring = new BlueprintAuthoringController();
