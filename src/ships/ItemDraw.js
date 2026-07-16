/**
 * Hardpoint item draw — category × morph, with bell.* using StarterBellDraw.
 * Thin strokes + extrude depth; thrusters stay flush nozzles.
 */

import { SHIP } from '../core/Constants.js';
import {
  drawStarterMainEngine,
  drawStarterThrusterCup,
  drawStarterMiningLaser,
  drawStarterLaserSocket,
  drawStarterSmallTurret,
  extrude,
  shade,
  palCols,
} from './StarterBellDraw.js';

function drawGun(ctx, socket, morph = 0, pal = null) {
  const s = 1 + morph * 0.2;
  const x = socket.x;
  const y = socket.y ?? 0;
  const face = socket.face || 'chin';
  const trim = pal?.colors?.trim || '#8ab0c8';
  const metal = pal?.colors?.metal || '#1a2430';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(socket.angle || 0);
  if (face === 'chin' || face === 'wing' || face === 'ventral') {
    ctx.globalAlpha = 0.92;
  }
  const len = face === 'side' ? 4.2 * s : 5 * s;
  const housing = [
    [-2 * s, -1.45 * s],
    [len - 0.4 * s, -1.05 * s],
    [len - 0.4 * s, 1.05 * s],
    [-2 * s, 1.45 * s],
  ];
  const lift = face === 'side' ? 2 : -6;
  extrude(ctx, housing, 1.6 * s, palCols(shade(metal, lift), trim));
  // Muzzle recess
  ctx.fillStyle = '#060a10';
  ctx.beginPath();
  ctx.arc(len + 0.15 * s, 0, 0.85 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(trim, face === 'side' ? 8 : -5);
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawScienceArray(ctx, socket, morph = 0, pal = null) {
  const s = 1 + morph * 0.15;
  const accent = pal?.colors?.accent || '#70c0e0';
  const metal = pal?.colors?.metal || '#1a2830';
  const trim = pal?.colors?.trim || accent;
  ctx.save();
  ctx.translate(socket.x, socket.y ?? 0);
  const dish = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    dish.push([Math.cos(a) * 3.2 * s, Math.sin(a) * 3.2 * s]);
  }
  extrude(ctx, dish, 1.8 * s, palCols(metal, trim));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, 1.55 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = shade(accent, -30);
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(0, 0, 0.7 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawCannonTurret(ctx, ship, socket, pal = null) {
  const trim = pal?.colors?.trim || '#c08050';
  const metal = pal?.colors?.metal || '#1a2030';
  const ox = socket.x;
  const oy = socket.y;
  const localAim = ship.getTurretLocalAngle?.() ?? 0;
  ctx.save();
  ctx.translate(ox, oy);
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    ring.push([Math.cos(a) * 5.4, Math.sin(a) * 5.4]);
  }
  extrude(ctx, ring, 2.6, palCols(metal, trim));
  ctx.rotate(localAim);
  const barrel = [
    [0.4, -2.0],
    [9.6, -1.7],
    [9.6, 1.7],
    [0.4, 2.0],
  ];
  extrude(ctx, barrel, 1.8, palCols(shade(metal, 8), trim));
  ctx.fillStyle = '#080a0e';
  ctx.beginPath();
  ctx.arc(10.1, 0, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(trim, 10);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
}

function drawGenericEngine(ctx, socket, morph = 0, pal = null, classScale = 1) {
  const scaleMul = Math.max(0.15, (classScale || 1) * (SHIP.GENERIC_ENGINE_CLASS_SCALE ?? 1));
  const s = (1 + morph * 0.25) * scaleMul;
  const x = socket.x;
  const y = socket.y ?? 0;
  const accent = pal?.colors?.accent || '#e09050';
  const trim = pal?.colors?.trim || '#8a7060';
  const metal = pal?.colors?.metal || '#1a2430';
  const flange = [
    [x + 3.2 * s, y - 5 * s],
    [x + 0.8 * s, y - 5.8 * s],
    [x + 0.8 * s, y + 5.8 * s],
    [x + 3.2 * s, y + 5 * s],
  ];
  extrude(ctx, flange, 2.2, palCols(metal, trim));
  ctx.fillStyle = shade(metal, -10);
  ctx.beginPath();
  ctx.ellipse(x + 1 * s, y, 3 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(metal, 16);
  ctx.lineWidth = 0.55;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.ellipse(x + 1 * s, y, 2.7 * s, 4.55 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.ellipse(x + 1 * s, y, 3 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ship
 * @param {object} def ShipDefinition
 * @param {Record<string, {dx:number,dy:number}>|null} itemOffset
 * @param {{ faces?: string[]|null, excludeFaces?: string[]|null }} [opts]
 */
export function drawCatalogHardware(ctx, ship, def, itemOffset = null, opts = {}) {
  const mounts = def.resolveMounts();
  const faceFilter = opts.faces || null;
  const exclude = opts.excludeFaces || null;

  for (const [key, m] of Object.entries(mounts)) {
    if (!m?.socket) continue;
    const face = m.socket.face || defaultFaceForCategory(m.socket.category);
    if (faceFilter && !faceFilter.includes(face)) continue;
    if (exclude && exclude.includes(face)) continue;

    const off = itemOffset?.[key];
    const sock = off
      ? { ...m.socket, x: m.socket.x + off.dx, y: m.socket.y + off.dy, face }
      : { ...m.socket, face };
    const pal = def.paletteForMount(key);
    const gk = m.item?.geometryKey || '';
    const cat = m.socket.category;
    const morph = m.item?.morph || 0;

    if (cat === 'mainEngine') {
      if (!m.item) continue;
      if (gk.startsWith('bell.')) {
        drawStarterMainEngine(ctx, sock, morph, pal);
      } else {
        drawGenericEngine(ctx, sock, morph, pal, def.scale ?? 1);
      }
      continue;
    }

    if (cat === 'maneuverThruster') {
      if (!m.item) continue;
      const trim = pal.colors?.trim || '#6aa0c8';
      drawStarterThrusterCup(ctx, sock, trim, morph);
      continue;
    }

    if (cat === 'forwardLaser') {
      if (m.item) {
        if (gk.startsWith('bell.') || key === 'miningLaser') {
          drawStarterMiningLaser(ctx, sock, ship.miningLaserRelAngle || 0);
        } else {
          drawGun(ctx, sock, morph, pal);
        }
      } else if (key === 'miningLaser') {
        drawStarterLaserSocket(ctx, sock);
      }
      continue;
    }

    if (cat === 'forwardGun') {
      if (m.item) drawGun(ctx, sock, morph, pal);
      continue;
    }

    if (cat === 'scienceArray') {
      if (m.item) drawScienceArray(ctx, sock, morph, pal);
      continue;
    }

    if (cat === 'cannonTurret') {
      if (m.item) drawCannonTurret(ctx, ship, sock, pal);
      continue;
    }

    if (cat === 'smallTurret') {
      if (m.item) {
        drawStarterSmallTurret(
          ctx,
          ship,
          sock,
          pal.colors?.trim || '#5a8ab0'
        );
      }
    }
  }
}

function defaultFaceForCategory(cat) {
  if (cat === 'smallTurret' || cat === 'cannonTurret') return 'dorsal';
  if (cat === 'forwardLaser' || cat === 'forwardGun') return 'chin';
  if (cat === 'scienceArray') return 'dorsal';
  if (cat === 'mainEngine' || cat === 'maneuverThruster') return 'prop';
  return 'prop';
}

/** Underside mounts — draw under hull decks. */
export const UNDER_FACES = ['chin', 'ventral', 'wing'];
