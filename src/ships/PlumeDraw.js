/**
 * Thruster / main-engine plumes + exhaust particles — driven by equipped
 * modular mounts (socket pose + palette), not by ship identity.
 */

import { SHIP } from '../core/Constants.js';
import { HARDPOINTS } from '../entities/ShipHardpoints.js';
import { hexToRgba } from './Themes.js';
import { offsetSocket } from './ExplodeLayout.js';

const DEFAULT_BLUE = 'rgba(100, 180, 255, 0.7)';
const DEFAULT_BLUE_FADE = 'rgba(40, 90, 160, 0)';
const DEFAULT_ORANGE = 'rgba(255, 160, 70, 0.9)';
const DEFAULT_ORANGE_AB = 'rgba(255, 200, 100, 0.95)';
const DEFAULT_ORANGE_FADE = 'rgba(180, 80, 30, 0)';

function smoothstep(edge0, edge1, t) {
  const x = Math.max(0, Math.min(1, (t - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

/** Normalize ship-like objects (player Ship, hangar pad puppet, ambient). */
export function shipMotion(ship) {
  const position = ship.position
    ? { x: ship.position.x, y: ship.position.y }
    : { x: ship.x || 0, y: ship.y || 0 };
  const velocity = ship.velocity
    ? { x: ship.velocity.x, y: ship.velocity.y }
    : { x: ship.vx || 0, y: ship.vy || 0 };
  return {
    position,
    velocity,
    angle: ship.angle ?? SHIP.SPAWN_ANGLE,
    angularVelocity: ship.angularVelocity || 0,
  };
}

/**
 * Plume flow vs ship motion — readability + motion cue, not vacuum physics.
 */
export function computePlumeFlow(exhaustDirX, exhaustDirY, ship, localOx, localOy) {
  const { velocity, angle, angularVelocity } = shipMotion(ship);
  const speed = Math.hypot(velocity.x, velocity.y);
  let cue = 0;
  let wash = 0;
  let lean = 0;
  let lengthMul = 1;
  let spin = 0;

  if (speed > 8) {
    const inv = 1 / speed;
    const align = (exhaustDirX * velocity.x + exhaustDirY * velocity.y) * inv;
    const speedT = smoothstep(15, 380, speed);
    const lead = Math.max(0, align);
    cue = lead * speedT * 0.32;
    wash = smoothstep(0.4, 0.98, align) * speedT;

    const wx = -velocity.x;
    const wy = -velocity.y;
    const parallel = (wx * exhaustDirX + wy * exhaustDirY) * inv;
    const perpX = wx * inv - parallel * exhaustDirX;
    const perpY = wy * inv - parallel * exhaustDirY;
    const side = perpX * (-exhaustDirY) + perpY * exhaustDirX;
    lean = Math.max(-1, Math.min(1, side)) * speedT * 0.85;

    const trail = Math.max(0, parallel);
    lengthMul = 1 + 0.22 * trail * speedT;
  }

  const omega = angularVelocity;
  if (Math.abs(omega) > 0.45) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rx = localOx * cos - localOy * sin;
    const ry = localOx * sin + localOy * cos;
    const tx = -omega * ry;
    const ty = omega * rx;
    const tLen = Math.hypot(tx, ty);
    if (tLen > 8) {
      const tAlign = (exhaustDirX * tx + exhaustDirY * ty) / tLen;
      const spinT = smoothstep(0.45, 3.2, Math.abs(omega));
      spin = smoothstep(0.15, 0.9, tAlign) * spinT * 0.55;

      const tInv = 1 / tLen;
      const twx = -tx;
      const twy = -ty;
      const tPar = (twx * exhaustDirX + twy * exhaustDirY) * tInv;
      const tPerpX = twx * tInv - tPar * exhaustDirX;
      const tPerpY = twy * tInv - tPar * exhaustDirY;
      const tSide = tPerpX * (-exhaustDirY) + tPerpY * exhaustDirX;
      lean += Math.max(-1, Math.min(1, tSide)) * spinT * 0.25;
    }
  }

  lean = Math.max(-1.15, Math.min(1.15, lean));
  const cone = Math.max(0, Math.min(1, cue * 0.55 + wash * 0.5 + spin * 0.35));
  const spray = Math.max(0, Math.min(1, cue * 0.2 + wash * 0.9 + spin));
  return { cone, spray, lean, lengthMul };
}

export function drawPlume(
  ctx,
  x,
  y,
  exhaustAngle,
  intensity,
  len,
  color,
  width = 2,
  fadeRgba = 'rgba(50, 100, 150, 0)',
  lean = 0
) {
  if (!intensity || intensity <= 0) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(exhaustAngle);
  ctx.globalAlpha = 0.5 + Math.min(intensity, 1.5) * 0.35;

  const plumeLen = len * Math.min(intensity, 1.5);
  const tipY = Math.max(-1.1, Math.min(1.1, lean)) * plumeLen * 0.52;
  const midX = plumeLen * 0.42;
  const midY = tipY * 0.28;

  const grad = ctx.createLinearGradient(0, 0, plumeLen, tipY * 0.35);
  grad.addColorStop(0, color);
  grad.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.3)'));
  grad.addColorStop(1, fadeRgba);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -width);
  ctx.quadraticCurveTo(midX, midY - width * 0.25, plumeLen, tipY);
  ctx.quadraticCurveTo(midX, midY + width * 0.25, 0, width);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Equipped propulsion mounts that can emit plumes.
 * @returns {{ key: string, category: string, socket: object }[]}
 */
export function listPropulsionMounts(ship, itemOffset = null) {
  const def = ship?.shipDef;
  if (!def?.resolveMounts) return [];
  const mounts = def.resolveMounts();
  const out = [];
  for (const [key, m] of Object.entries(mounts)) {
    if (!m?.socket || !m.item) continue;
    const cat = m.socket.category;
    if (cat !== 'mainEngine' && cat !== 'maneuverThruster') continue;
    const sock = offsetSocket(m.socket, itemOffset?.[key]);
    out.push({ key, category: cat, socket: sock });
  }
  return out;
}

function engineIntensity(thrusters) {
  if (!thrusters) return 0;
  if (thrusters.mainEngine > 0) return thrusters.mainEngine;
  if (thrusters.retroBurn) return 0.5;
  return 0;
}

/**
 * Draw plumes for every equipped mainEngine / maneuverThruster mount.
 * Call before hull/cups so nozzles paint over the flame root.
 */
export function drawMountPlumes(ctx, ship, itemOffset = null) {
  const t = ship?.thrusters;
  if (!t) return;
  const def = ship.shipDef;
  if (!def) return;

  const { angle } = shipMotion(ship);
  const mounts = listPropulsionMounts(ship, itemOffset);
  if (!mounts.length) {
    // Legacy fallback when def has no propulsion mounts resolved
    const table = def.hardpointsTable?.() || HARDPOINTS;
    const eng = table.mainEngine || HARDPOINTS.mainEngine;
    const power = engineIntensity(t);
    if (power > 0.02 && eng) {
      drawEnginePlumeAt(ctx, ship, 'mainEngine', eng, power, t.afterburner > 0);
    }
    return;
  }

  const engPower = engineIntensity(t);
  const isAfterburner = t.afterburner > 0;

  for (const m of mounts) {
    if (m.category === 'mainEngine') {
      if (engPower <= 0.02) continue;
      drawEnginePlumeAt(ctx, ship, m.key, m.socket, engPower, isAfterburner);
      continue;
    }
    const intensity = t[m.key] || 0;
    if (intensity <= 0.02) continue;
    drawThrusterPlumeAt(ctx, ship, m.key, m.socket, intensity);
  }
}

function drawEnginePlumeAt(ctx, ship, key, sock, intensity, isAfterburner) {
  const def = ship.shipDef;
  const { angle } = shipMotion(ship);
  const dirX = Math.cos(angle + sock.angle);
  const dirY = Math.sin(angle + sock.angle);
  const flow = computePlumeFlow(dirX, dirY, ship, sock.x, sock.y);

  let len = isAfterburner ? 54 : 30;
  let width = isAfterburner ? 3.75 : 6.75;
  len *= flow.lengthMul * (1 - 0.48 * flow.cone);
  width *= 1 + 0.65 * flow.cone;

  const pal = def?.paletteForMount?.(key);
  const accent = pal?.colors?.accent || pal?.colors?.trim;
  const color = accent
    ? hexToRgba(accent, isAfterburner ? 0.95 : 0.9)
    : isAfterburner
      ? DEFAULT_ORANGE_AB
      : DEFAULT_ORANGE;
  const fade = accent ? hexToRgba(accent, 0) : DEFAULT_ORANGE_FADE;

  drawPlume(ctx, sock.x, sock.y, sock.angle, intensity, len, color, width, fade, flow.lean);
}

function drawThrusterPlumeAt(ctx, ship, key, sock, intensity) {
  const def = ship.shipDef;
  const { angle } = shipMotion(ship);
  const dirX = Math.cos(angle + sock.angle);
  const dirY = Math.sin(angle + sock.angle);
  const flow = computePlumeFlow(dirX, dirY, ship, sock.x, sock.y);

  let len = (8 + intensity * 3.5) * SHIP.THRUSTER_PLUME_SCALE;
  let width = (1.15 + intensity * 0.9) * SHIP.THRUSTER_PLUME_SCALE;
  len *= flow.lengthMul * (1 - 0.48 * flow.cone);
  width *= 1 + 0.7 * flow.cone;

  const pal = def?.paletteForMount?.(key);
  const trim = pal?.colors?.trim || pal?.colors?.accent;
  const color = trim ? hexToRgba(trim, 0.7) : DEFAULT_BLUE;
  const fade = trim ? hexToRgba(trim, 0) : DEFAULT_BLUE_FADE;

  drawPlume(ctx, sock.x, sock.y, sock.angle, intensity, len, color, width, fade, flow.lean);
}

/**
 * Emit exhaust particles from equipped propulsion mounts.
 * @param {{ worldSpace?: boolean }} [opts]
 */
export function emitMountExhaust(ship, particleSystem, opts = {}) {
  const t = ship?.thrusters;
  if (!t || !particleSystem) return;
  const def = ship.shipDef;
  if (!def) return;

  const { angle, position } = shipMotion(ship);
  // Ensure emitExhaustWorld can read a position bag without clobbering Vec2
  if (!ship.position) {
    ship.position = { x: position.x, y: position.y };
  } else {
    ship.position.x = position.x;
    ship.position.y = position.y;
  }
  if (ship.angle == null) ship.angle = angle;

  const emit = opts.worldSpace
    ? (lx, ly, ang, intensity, color, spread, flowOpts) =>
        particleSystem.emitExhaustWorld(
          ship,
          lx,
          ly,
          ang,
          intensity,
          color,
          spread,
          flowOpts
        )
    : (lx, ly, ang, intensity, color, spread, flowOpts) =>
        particleSystem.emitExhaustLocal(
          lx,
          ly,
          ang,
          intensity,
          color,
          spread,
          flowOpts
        );

  const mounts = listPropulsionMounts(ship);
  const engPower = engineIntensity(t);
  const isAfterburner = t.afterburner > 0;

  if (!mounts.length) {
    const table = def.hardpointsTable?.() || HARDPOINTS;
    const eng = table.mainEngine || HARDPOINTS.mainEngine;
    if (engPower > 0.02 && eng) {
      emitEngineParticles(ship, emit, 'mainEngine', eng, engPower, isAfterburner);
    }
    return;
  }

  for (const m of mounts) {
    if (m.category === 'mainEngine') {
      if (engPower <= 0.02) continue;
      emitEngineParticles(ship, emit, m.key, m.socket, engPower, isAfterburner);
      continue;
    }
    const intensity = t[m.key] || 0;
    if (intensity <= 0.02) continue;
    emitThrusterMountParticles(ship, emit, m.key, m.socket, intensity);
  }
}

function emitEngineParticles(ship, emit, key, sock, intensity, isAfterburner) {
  const def = ship.shipDef;
  const { angle } = shipMotion(ship);
  const dirX = Math.cos(angle + sock.angle);
  const dirY = Math.sin(angle + sock.angle);
  const flow = computePlumeFlow(dirX, dirY, ship, sock.x, sock.y);
  const pal = def?.paletteForMount?.(key);
  const accent = pal?.colors?.accent || pal?.colors?.trim;
  const color = accent
    ? hexToRgba(accent, isAfterburner ? 0.85 : 0.7)
    : isAfterburner
      ? 'rgba(255, 200, 100, 0.85)'
      : 'rgba(255, 150, 70, 0.7)';

  emit(
    sock.x,
    sock.y,
    sock.angle,
    intensity * (isAfterburner ? 1.4 : 1) * (1 - 0.22 * flow.spray),
    color,
    isAfterburner ? 0.28 : 0.4 + 0.42 * flow.spray,
    {
      speedScale: flow.lengthMul * (1 - 0.78 * flow.spray),
      lifeScale: flow.lengthMul * (1 - 0.68 * flow.spray),
      leanAngle: flow.lean * 0.55,
    }
  );
}

function emitThrusterMountParticles(ship, emit, key, sock, intensity) {
  const def = ship.shipDef;
  const { angle } = shipMotion(ship);
  const dirX = Math.cos(angle + sock.angle);
  const dirY = Math.sin(angle + sock.angle);
  const flow = computePlumeFlow(dirX, dirY, ship, sock.x, sock.y);
  const pal = def?.paletteForMount?.(key);
  const trim = pal?.colors?.trim || pal?.colors?.accent;
  const color = trim ? hexToRgba(trim, 0.55) : 'rgba(100, 180, 255, 0.55)';

  emit(
    sock.x,
    sock.y,
    sock.angle,
    intensity * 0.55 * (1 - 0.18 * flow.spray),
    color,
    0.4 + 0.45 * flow.spray,
    {
      speedScale: flow.lengthMul * (1 - 0.8 * flow.spray),
      lifeScale: flow.lengthMul * (1 - 0.7 * flow.spray),
      leanAngle: flow.lean * 0.55,
    }
  );
}

/** True if any equipped propulsion mount is currently lit. */
export function hasActivePropulsion(ship) {
  const t = ship?.thrusters;
  if (!t) return false;
  if (engineIntensity(t) > 0.02) return true;
  for (const m of listPropulsionMounts(ship)) {
    if (m.category === 'maneuverThruster' && (t[m.key] || 0) > 0.02) return true;
  }
  return false;
}
