/**
 * Unified modular ship draw — sections + items from catalog.
 */

import { SHIP } from '../core/Constants.js';
import {
  VIEW_ANGLED,
  angledDepthScale,
  topDownView,
  beginShipDraw,
  endShipDraw,
} from './ShipViews.js';
import { createPlayerStarter } from './ShipGenerator.js';
import { drawCatalogSection } from './SectionDraw.js';
import {
  drawCatalogHardware,
  UNDER_FACES,
} from './ItemDraw.js';
import {
  computeExplodeLayout,
  drawExplodeGuides,
  offsetSocket,
} from './ExplodeLayout.js';

function ensureDef(ship) {
  if (!ship.shipDef) {
    ship.shipDef = createPlayerStarter();
  }
  return ship.shipDef;
}

function explodeFromView(view) {
  return !!(view && view.explode);
}

function drawSectionsOrdered(ctx, def, sectionDx, roles) {
  for (const role of roles) {
    const sec = def.section(role);
    if (!sec) continue;
    const pal = def.paletteForSection(role);
    const dx = sectionDx?.[role] || 0;
    if (dx) ctx.save();
    if (dx) ctx.translate(dx, 0);
    drawCatalogSection(ctx, sec, pal);
    if (dx) ctx.restore();
  }
}

function drawTurretBloom(ctx, ship, def, itemOffset = null) {
  if (!ship.muzzleFlash || ship.muzzleFlash <= 0) return;
  const mounts = def.resolveMounts();
  const key =
    (mounts.dorsalTurret?.item && 'dorsalTurret') ||
    (mounts.dorsalTurretB?.item && 'dorsalTurretB') ||
    (mounts.ventralTurret?.item && 'ventralTurret');
  if (!key) return;
  const sock = offsetSocket(mounts[key].socket, itemOffset?.[key]);
  const localAim = ship.getTurretLocalAngle?.() ?? 0;
  const recoil = (ship.turretRecoil || 0) * SHIP.TURRET_RECOIL_DIST;
  const tipX = SHIP.TURRET_BARREL_LENGTH + SHIP.TURRET_MUZZLE_EXTRA - recoil;
  const flashAlpha = Math.min(1, ship.muzzleFlash / 0.06);

  ctx.save();
  ctx.translate(sock.x, sock.y);
  ctx.rotate(localAim);
  ctx.fillStyle = `rgba(150, 220, 255, ${flashAlpha})`;
  ctx.beginPath();
  ctx.arc(tipX + 1, 0, 5 * flashAlpha, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 240, 200, ${flashAlpha * 0.85})`;
  ctx.beginPath();
  ctx.arc(tipX + 2.5, 0, 2.5 * flashAlpha, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMiningBeam(ctx, ship, def, itemOffset = null) {
  if (!ship.miningLaserFiring) return;
  const mounts = def.resolveMounts();
  const laser = mounts.miningLaser;
  if (!laser?.socket || !laser.item) return;
  const sock = offsetSocket(laser.socket, itemOffset?.miningLaser);

  const muzzle = SHIP.MINING_LASER_MUZZLE_OFFSET;
  ctx.save();
  ctx.translate(sock.x, sock.y);
  ctx.rotate(ship.miningLaserRelAngle || 0);
  const len = ship.miningLaserBeamLength || SHIP.MINING_LASER_RANGE;
  const grad = ctx.createLinearGradient(muzzle, 0, muzzle + len, 0);
  grad.addColorStop(0, 'rgba(120, 255, 180, 0.85)');
  grad.addColorStop(0.4, 'rgba(80, 220, 140, 0.45)');
  grad.addColorStop(1, 'rgba(40, 180, 100, 0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(muzzle, 0);
  ctx.lineTo(muzzle + len, 0);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw modular ship in ship-local space (caller applies world transform).
 */
export function drawModularShip(ctx, ship, view = topDownView()) {
  const def = ensureDef(ship);
  const layout = explodeFromView(view) ? computeExplodeLayout(def) : null;
  const sectionDx = layout?.sectionDx || null;
  const itemOffset = layout?.itemOffset || null;

  beginShipDraw(view);
  ctx.save();
  try {
    if (view.mode === VIEW_ANGLED) {
      const d = angledDepthScale(view.headingIndex ?? 0);
      ctx.scale(1, d);
    }

    if (layout) drawExplodeGuides(ctx, layout);

    const roles = def.sectionRoles();
    const aftRoles = roles.filter((r) => r === 'engine' || r === 'aft');
    const midRoles = roles.filter((r) => r === 'body' || r === 'hull');
    const foreRoles = roles.filter((r) => r === 'bridge' || r === 'cockpit');

    // Underside mounts first (chin under bridge, wing guns under body), then decks, then dorsal/side/props
    drawSectionsOrdered(ctx, def, sectionDx, aftRoles);
    drawCatalogHardware(ctx, ship, def, itemOffset, { faces: UNDER_FACES });
    drawSectionsOrdered(ctx, def, sectionDx, midRoles);
    drawSectionsOrdered(ctx, def, sectionDx, foreRoles);
    drawCatalogHardware(ctx, ship, def, itemOffset, {
      excludeFaces: UNDER_FACES,
    });
    drawMiningBeam(ctx, ship, def, itemOffset);
    drawTurretBloom(ctx, ship, def, itemOffset);
  } finally {
    ctx.restore();
    endShipDraw();
  }
}

export function getShipMounts(ship) {
  return ensureDef(ship).resolveMounts();
}

export function getShipHardpointsTable(ship) {
  return ensureDef(ship).hardpointsTable();
}

export function getShipThrusterKeys(ship) {
  const def = ensureDef(ship);
  const mounts = def.resolveMounts();
  return Object.keys(mounts).filter((k) => {
    const m = mounts[k];
    return m.socket.category === 'maneuverThruster' && m.item;
  });
}
