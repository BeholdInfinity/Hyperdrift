/**
 * Unified modular ship draw — sections + items from catalog.
 */

import { SHIP } from '../core/Constants.js';
import {
  VIEW_ANGLED,
  angledDepthScale,
  angledPlumeMidLift,
  topDownView,
  beginShipDraw,
  endShipDraw,
  beginSilhouette,
  endSilhouette,
  setExtrudePhase,
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
import { drawMountPlumes } from './PlumeDraw.js';

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
 * Flat IFF/own-ship silhouette: section footprints only (fill + stroke), no
 * hardware, plumes, windows, or theme skin. Used by scanner blips / SCAN own-ship.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} shipOrDef ship with shipDef, or a ShipDefinition
 * @param {{ fillStyle?: string, strokeStyle?: string }} [opts]
 */
export function drawShipSilhouette(ctx, shipOrDef, opts = {}) {
  const fill = opts.fillStyle || '#6a7a8a';
  const stroke = opts.strokeStyle || '#3a4858';
  const ship =
    shipOrDef && shipOrDef.shipDef
      ? shipOrDef
      : shipOrDef && typeof shipOrDef.sections === 'function'
        ? { shipDef: shipOrDef }
        : shipOrDef;
  const def = ensureDef(ship);
  beginShipDraw(topDownView());
  beginSilhouette(fill, stroke);
  ctx.save();
  try {
    const roles = def.sectionRoles();
    const aftRoles = roles.filter((r) => r === 'engine' || r === 'aft');
    const midRoles = roles.filter((r) => r === 'body' || r === 'hull');
    const foreRoles = roles.filter((r) => r === 'bridge' || r === 'cockpit');
    drawSectionsOrdered(ctx, def, null, aftRoles);
    drawSectionsOrdered(ctx, def, null, midRoles);
    drawSectionsOrdered(ctx, def, null, foreRoles);
  } finally {
    ctx.restore();
    endSilhouette();
    endShipDraw();
  }
}

/**
 * Draw modular ship in ship-local space (caller applies world transform).
 * Propulsion plumes are mount-driven (equipped mainEngine / maneuverThruster
 * items only). Top-down: under the flat hull. Angled 2.5D: mid-height
 * (after side walls, before raised deck); cups/bells paint over the root.
 */
export function drawModularShip(ctx, ship, view = topDownView()) {
  const def = ensureDef(ship);
  const layout = explodeFromView(view) ? computeExplodeLayout(def) : null;
  const sectionDx = layout?.sectionDx || null;
  const itemOffset = layout?.itemOffset || null;
  const angled = view.mode === VIEW_ANGLED;

  beginShipDraw(view);
  ctx.save();
  try {
    if (angled) {
      const d = angledDepthScale(view.headingIndex ?? 0);
      ctx.scale(1, d);
    }

    if (layout) drawExplodeGuides(ctx, layout);

    const roles = def.sectionRoles();
    const aftRoles = roles.filter((r) => r === 'engine' || r === 'aft');
    const midRoles = roles.filter((r) => r === 'body' || r === 'hull');
    const foreRoles = roles.filter((r) => r === 'bridge' || r === 'cockpit');

    const drawHullSections = () => {
      drawSectionsOrdered(ctx, def, sectionDx, aftRoles);
      drawSectionsOrdered(ctx, def, sectionDx, midRoles);
      drawSectionsOrdered(ctx, def, sectionDx, foreRoles);
    };

    if (angled) {
      // Base + side walls → mid-height plumes → raised decks → dorsal/prop hardware
      setExtrudePhase('base');
      drawHullSections();
      setExtrudePhase('all');
      drawCatalogHardware(ctx, ship, def, itemOffset, { faces: UNDER_FACES });
      if (ship.thrusters) {
        const mid = angledPlumeMidLift(view.headingIndex ?? 0);
        ctx.save();
        ctx.translate(mid.x, mid.y);
        drawMountPlumes(ctx, ship, itemOffset);
        ctx.restore();
      }
      setExtrudePhase('deck');
      drawHullSections();
      setExtrudePhase('all');
      drawCatalogHardware(ctx, ship, def, itemOffset, {
        excludeFaces: UNDER_FACES,
      });
    } else {
      // Flat silhouette: plumes under the entire hull fill
      if (ship.thrusters) drawMountPlumes(ctx, ship, itemOffset);
      drawSectionsOrdered(ctx, def, sectionDx, aftRoles);
      drawCatalogHardware(ctx, ship, def, itemOffset, { faces: UNDER_FACES });
      drawSectionsOrdered(ctx, def, sectionDx, midRoles);
      drawSectionsOrdered(ctx, def, sectionDx, foreRoles);
      drawCatalogHardware(ctx, ship, def, itemOffset, {
        excludeFaces: UNDER_FACES,
      });
    }

    drawMiningBeam(ctx, ship, def, itemOffset);
    drawTurretBloom(ctx, ship, def, itemOffset);
  } finally {
    setExtrudePhase('all');
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
