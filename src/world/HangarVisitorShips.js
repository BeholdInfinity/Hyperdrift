/**
 * Placeholder visitor ships for hangar neighbor pads.
 * Drawn ship-local with +X = nose (same as player); caller rotates to face.
 * Silhouettes are rough stand-ins — refine later.
 * Thruster mounts match the cups drawn on each silhouette.
 */

/** @typedef {'scout'|'interceptor'|'patrol'|'gunship'|'freighter'|'tanker'|'hauler'} VisitorId */

/**
 * @typedef {{ x: number, y: number, angle: number, key?: string }} VisitorMount
 */

/**
 * @type {Record<VisitorId, { id: VisitorId, role: string, scale: number, hull: string, trim: string, accent: string, armed: boolean }>}
 */
export const VISITOR_CATALOG = {
  scout: {
    id: 'scout',
    role: 'scout',
    scale: 0.55,
    hull: '#2a3a48',
    trim: '#6a90a8',
    accent: '#7ec8a0',
    armed: true,
  },
  interceptor: {
    id: 'interceptor',
    role: 'combat',
    scale: 0.75,
    hull: '#3a2a2a',
    trim: '#a87868',
    accent: '#e09050',
    armed: true,
  },
  patrol: {
    id: 'patrol',
    role: 'patrol',
    scale: 0.95,
    hull: '#243848',
    trim: '#5a8ab0',
    accent: '#64b4ff',
    armed: true,
  },
  gunship: {
    id: 'gunship',
    role: 'combat',
    scale: 1.15,
    hull: '#2a2830',
    trim: '#8a7080',
    accent: '#c06050',
    armed: true,
  },
  freighter: {
    id: 'freighter',
    role: 'cargo',
    scale: 1.35,
    hull: '#3a4038',
    trim: '#8a9078',
    accent: '#c9a020',
    armed: false,
  },
  tanker: {
    id: 'tanker',
    role: 'cargo',
    scale: 1.45,
    hull: '#2a3840',
    trim: '#6a8890',
    accent: '#50a0a8',
    armed: false,
  },
  hauler: {
    id: 'hauler',
    role: 'cargo',
    scale: 1.25,
    hull: '#38342a',
    trim: '#908060',
    accent: '#d0a060',
    armed: false,
  },
};

/**
 * Propulsion hardpoints in ship-local space (pre catalog.scale), +X = nose.
 * Layouts mirror the thruster cups / engine bells drawn below.
 * @type {Record<VisitorId, { mainEngine: VisitorMount, thrusters: VisitorMount[] }>}
 */
export const VISITOR_PROPULSION = {
  scout: {
    mainEngine: { x: -12, y: 0, angle: Math.PI },
    thrusters: [
      { key: 'portAft', x: -6, y: -4.5, angle: -Math.PI / 2 },
      { key: 'starboardAft', x: -6, y: 4.5, angle: Math.PI / 2 },
      { key: 'portFore', x: 6, y: -3.5, angle: -Math.PI / 2 },
      { key: 'starboardFore', x: 6, y: 3.5, angle: Math.PI / 2 },
    ],
  },
  interceptor: {
    mainEngine: { x: -14, y: 0, angle: Math.PI },
    thrusters: [
      { key: 'portAft', x: -4, y: -7.5, angle: -Math.PI / 2 },
      { key: 'starboardAft', x: -4, y: 7.5, angle: Math.PI / 2 },
      { key: 'portFore', x: 8, y: -5, angle: -Math.PI / 2 },
      { key: 'starboardFore', x: 8, y: 5, angle: Math.PI / 2 },
      { key: 'aftPort', x: -10, y: -4, angle: Math.PI },
      { key: 'aftStarboard', x: -10, y: 4, angle: Math.PI },
    ],
  },
  patrol: {
    mainEngine: { x: -16, y: 0, angle: Math.PI },
    thrusters: [
      { key: 'portAft', x: -8, y: -8.5, angle: -Math.PI / 2 },
      { key: 'starboardAft', x: -8, y: 8.5, angle: Math.PI / 2 },
      { key: 'portFore', x: 6, y: -6.5, angle: -Math.PI / 2 },
      { key: 'starboardFore', x: 6, y: 6.5, angle: Math.PI / 2 },
      { key: 'nosePort', x: 12, y: -3, angle: 0 },
      { key: 'noseStarboard', x: 12, y: 3, angle: 0 },
    ],
  },
  gunship: {
    mainEngine: { x: -18, y: 0, angle: Math.PI },
    thrusters: [
      { key: 'portAft', x: -6, y: -11.5, angle: -Math.PI / 2 },
      { key: 'starboardAft', x: -6, y: 11.5, angle: Math.PI / 2 },
      { key: 'portFore', x: 6, y: -8.5, angle: -Math.PI / 2 },
      { key: 'starboardFore', x: 6, y: 8.5, angle: Math.PI / 2 },
      { key: 'aftPort', x: -14, y: -5, angle: Math.PI },
      { key: 'aftStarboard', x: -14, y: 5, angle: Math.PI },
    ],
  },
  freighter: {
    mainEngine: { x: -20, y: 0, angle: Math.PI },
    thrusters: [
      { key: 'portAft', x: -10, y: -11, angle: -Math.PI / 2 },
      { key: 'starboardAft', x: -10, y: 11, angle: Math.PI / 2 },
      { key: 'portFore', x: 4, y: -11, angle: -Math.PI / 2 },
      { key: 'starboardFore', x: 4, y: 11, angle: Math.PI / 2 },
      { key: 'aftPort', x: -16, y: -6, angle: Math.PI },
      { key: 'aftStarboard', x: -16, y: 6, angle: Math.PI },
    ],
  },
  tanker: {
    mainEngine: { x: -22, y: 0, angle: Math.PI },
    thrusters: [
      { key: 'portAft', x: -8, y: -8, angle: -Math.PI / 2 },
      { key: 'starboardAft', x: -8, y: 8, angle: Math.PI / 2 },
      { key: 'portFore', x: 8, y: -7, angle: -Math.PI / 2 },
      { key: 'starboardFore', x: 8, y: 7, angle: Math.PI / 2 },
      { key: 'aftPort', x: -18, y: -4, angle: Math.PI },
      { key: 'aftStarboard', x: -18, y: 4, angle: Math.PI },
    ],
  },
  hauler: {
    mainEngine: { x: -20, y: 0, angle: Math.PI },
    thrusters: [
      { key: 'portAft', x: -8, y: -14.5, angle: -Math.PI / 2 },
      { key: 'starboardAft', x: -8, y: 14.5, angle: Math.PI / 2 },
      { key: 'portFore', x: 4, y: -12.5, angle: -Math.PI / 2 },
      { key: 'starboardFore', x: 4, y: 12.5, angle: Math.PI / 2 },
      { key: 'aftPort', x: -16, y: -7, angle: Math.PI },
      { key: 'aftStarboard', x: -16, y: 7, angle: Math.PI },
    ],
  },
};

const VISITOR_IDS = Object.keys(VISITOR_CATALOG);

const FACE_NORTH = -Math.PI / 2;

export function pickVisitorId() {
  return VISITOR_IDS[(Math.random() * VISITOR_IDS.length) | 0];
}

export function getVisitorSpec(id) {
  return VISITOR_CATALOG[id] || VISITOR_CATALOG.patrol;
}

export function getVisitorPropulsion(id) {
  return VISITOR_PROPULSION[id] || VISITOR_PROPULSION.patrol;
}

/** Empty thruster state for a visitor id. */
export function makeVisitorThrusters(id) {
  const prop = getVisitorPropulsion(id);
  /** @type {Record<string, number>} */
  const t = { mainEngine: 0, afterburner: 0, retroBurn: 0 };
  for (const m of prop.thrusters) t[m.key] = 0;
  return t;
}

function _smoothstep(edge0, edge1, t) {
  const x = Math.max(0, Math.min(1, (t - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

/** Same flow model as Renderer._computePlumeFlow (readability cue). */
function _computePlumeFlow(exhaustDirX, exhaustDirY, velocity, angle, angularVelocity, localOx, localOy) {
  const speed = Math.hypot(velocity.x, velocity.y);
  let cue = 0;
  let wash = 0;
  let lean = 0;
  let lengthMul = 1;

  if (speed > 8) {
    const inv = 1 / speed;
    const align = (exhaustDirX * velocity.x + exhaustDirY * velocity.y) * inv;
    const speedT = _smoothstep(15, 380, speed);
    const lead = Math.max(0, align);
    cue = lead * speedT * 0.32;
    wash = _smoothstep(0.4, 0.98, align) * speedT;

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

  const omega = angularVelocity || 0;
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
      const spinT = _smoothstep(0.45, 3.2, Math.abs(omega));
      const spin = _smoothstep(0.15, 0.9, tAlign) * spinT * 0.55;
      cue += spin * 0.35;
      wash += spin;
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
  const cone = Math.max(0, Math.min(1, cue * 0.55 + wash * 0.5));
  return { cone, lean, lengthMul };
}

function _drawPlume(ctx, x, y, exhaustAngle, intensity, len, color, width, fadeRgba, lean = 0) {
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
 * Draw visitor thruster / engine plumes (player-matched style).
 * When `inScaledContext` is true, caller already applied catalog.scale (e.g. inside
 * drawVisitorShip) — mount coords and base lengths stay unscaled.
 * @param {CanvasRenderingContext2D} ctx
 * @param {VisitorId} id
 * @param {Record<string, number>} thrusters
 * @param {{ x: number, y: number }} velocity world velocity
 * @param {number} angle world nose angle
 * @param {number} [angularVelocity]
 * @param {boolean} [inScaledContext]
 */
export function drawVisitorPlumes(
  ctx, id, thrusters, velocity, angle, angularVelocity = 0, inScaledContext = false
) {
  if (!thrusters) return;
  const spec = getVisitorSpec(id);
  const prop = getVisitorPropulsion(id);
  const sc = inScaledContext ? 1 : spec.scale;
  const t = thrusters;

  const THRUSTER_BLUE = 'rgba(100, 180, 255, 0.7)';
  const THRUSTER_FADE = 'rgba(40, 90, 160, 0)';
  const ENGINE_ORANGE = 'rgba(255, 160, 70, 0.9)';
  const ENGINE_FADE = 'rgba(180, 80, 30, 0)';

  const eng = prop.mainEngine;
  const engPower = t.mainEngine || (t.retroBurn ? 0.5 : 0);
  if (engPower > 0.02) {
    const exhaustDirX = Math.cos(angle + eng.angle);
    const exhaustDirY = Math.sin(angle + eng.angle);
    const flow = _computePlumeFlow(
      exhaustDirX, exhaustDirY, velocity, angle, angularVelocity,
      eng.x * spec.scale, eng.y * spec.scale
    );
    let len = 30 * sc;
    let width = 6.75 * sc;
    len *= flow.lengthMul * (1 - 0.48 * flow.cone);
    width *= 1 + 0.65 * flow.cone;
    _drawPlume(
      ctx, eng.x * sc, eng.y * sc, eng.angle, engPower, len, ENGINE_ORANGE, width, ENGINE_FADE, flow.lean
    );
  }

  for (const m of prop.thrusters) {
    const intensity = t[m.key] || 0;
    if (intensity <= 0.02) continue;
    const dirX = Math.cos(angle + m.angle);
    const dirY = Math.sin(angle + m.angle);
    const flow = _computePlumeFlow(
      dirX, dirY, velocity, angle, angularVelocity, m.x * spec.scale, m.y * spec.scale
    );
    let len = (15 + intensity * 6) * sc;
    let width = (2 + intensity * 1.65) * sc;
    len *= flow.lengthMul * (1 - 0.48 * flow.cone);
    width *= 1 + 0.7 * flow.cone;
    _drawPlume(
      ctx, m.x * sc, m.y * sc, m.angle, intensity, len, THRUSTER_BLUE, width, THRUSTER_FADE, flow.lean
    );
  }
}

/**
 * Draw a visitor ship centered at origin, nose along +X.
 * @param {CanvasRenderingContext2D} ctx
 * @param {VisitorId} id
 * @param {{ thrusters?: Record<string, number>, velocity?: {x:number,y:number}, angle?: number, angularVelocity?: number }} [propulsion]
 */
export function drawVisitorShip(ctx, id, propulsion = null) {
  const spec = VISITOR_CATALOG[id] || VISITOR_CATALOG.patrol;
  ctx.save();
  ctx.scale(spec.scale, spec.scale);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.1 / spec.scale;

  if (propulsion?.thrusters) {
    drawVisitorPlumes(
      ctx,
      id,
      propulsion.thrusters,
      propulsion.velocity || { x: 0, y: 0 },
      propulsion.angle ?? FACE_NORTH,
      propulsion.angularVelocity || 0,
      true
    );
  }

  switch (spec.id) {
    case 'scout':
      _drawScout(ctx, spec);
      break;
    case 'interceptor':
      _drawInterceptor(ctx, spec);
      break;
    case 'patrol':
      _drawPatrol(ctx, spec);
      break;
    case 'gunship':
      _drawGunship(ctx, spec);
      break;
    case 'freighter':
      _drawFreighter(ctx, spec);
      break;
    case 'tanker':
      _drawTanker(ctx, spec);
      break;
    case 'hauler':
      _drawHauler(ctx, spec);
      break;
    default:
      _drawPatrol(ctx, spec);
  }

  ctx.restore();
}

function _strokeFill(ctx, hull, trim) {
  ctx.fillStyle = hull;
  ctx.strokeStyle = trim;
  ctx.fill();
  ctx.stroke();
}

/** Blue maneuver thruster cup — exhaust faces `angle` (radians). */
function _thrusterCup(ctx, x, y, angle, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#0e1620';
  ctx.strokeStyle = '#6aa0c8';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -1.4 * size);
  ctx.lineTo(2.2 * size, -2 * size);
  ctx.lineTo(2.2 * size, 2 * size);
  ctx.lineTo(0, 1.4 * size);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Orange main-engine bell at aft (−X). */
function _engineBell(ctx, x, scale = 1) {
  ctx.fillStyle = '#121c24';
  ctx.strokeStyle = '#e09050';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x + 2 * scale, -4 * scale);
  ctx.lineTo(x - 1.5 * scale, -5.5 * scale);
  ctx.lineTo(x - 1.5 * scale, 5.5 * scale);
  ctx.lineTo(x + 2 * scale, 4 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0a1016';
  ctx.beginPath();
  ctx.ellipse(x - 0.5 * scale, 0, 1.1 * scale, 3.8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Nose gun / laser head. */
function _noseGun(ctx, x, color = '#7ec8a0') {
  ctx.fillStyle = '#2a4050';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, -2);
  ctx.lineTo(x + 5, -1.2);
  ctx.lineTo(x + 5, 1.2);
  ctx.lineTo(x, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0a1016';
  ctx.fillRect(x + 4.5, -0.7, 2.5, 1.4);
}

/** Dorsal turret ring + barrel. */
function _dorsalTurret(ctx, x, y, barrelAngle = 0.35) {
  ctx.fillStyle = '#3a4550';
  ctx.strokeStyle = '#8a9aa8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(barrelAngle);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(1, -0.9, 7, 1.8);
  ctx.restore();
}

function _drawScout(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(4, -4);
  ctx.lineTo(-10, -3);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-10, 3);
  ctx.lineTo(4, 4);
  ctx.closePath();
  _strokeFill(ctx, s.hull, s.trim);
  ctx.fillStyle = s.accent;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(6, -1.5);
  ctx.lineTo(6, 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  _engineBell(ctx, -12, 0.7);
  _thrusterCup(ctx, -6, -4.5, -Math.PI / 2, 0.75);
  _thrusterCup(ctx, -6, 4.5, Math.PI / 2, 0.75);
  _thrusterCup(ctx, 6, -3.5, -Math.PI / 2, 0.65);
  _thrusterCup(ctx, 6, 3.5, Math.PI / 2, 0.65);
  _noseGun(ctx, 14, s.accent);
}

function _drawInterceptor(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(6, -5);
  ctx.lineTo(-8, -7);
  ctx.lineTo(-14, -3);
  ctx.lineTo(-14, 3);
  ctx.lineTo(-8, 7);
  ctx.lineTo(6, 5);
  ctx.closePath();
  _strokeFill(ctx, s.hull, s.trim);
  // Twin wing guns
  ctx.fillStyle = '#1a1010';
  ctx.strokeStyle = s.accent;
  ctx.lineWidth = 1;
  ctx.fillRect(2, -9, 10, 2.2);
  ctx.strokeRect(2, -9, 10, 2.2);
  ctx.fillRect(2, 6.8, 10, 2.2);
  ctx.strokeRect(2, 6.8, 10, 2.2);
  _engineBell(ctx, -14, 0.85);
  _thrusterCup(ctx, -4, -7.5, -Math.PI / 2, 0.8);
  _thrusterCup(ctx, -4, 7.5, Math.PI / 2, 0.8);
  _thrusterCup(ctx, 8, -5, -Math.PI / 2, 0.7);
  _thrusterCup(ctx, 8, 5, Math.PI / 2, 0.7);
  _thrusterCup(ctx, -10, -4, Math.PI, 0.7);
  _thrusterCup(ctx, -10, 4, Math.PI, 0.7);
  _dorsalTurret(ctx, 2, 0, 0.2);
}

function _drawPatrol(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(8, -6);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-14, -5);
  ctx.lineTo(-16, 0);
  ctx.lineTo(-14, 5);
  ctx.lineTo(-6, 8);
  ctx.lineTo(8, 6);
  ctx.closePath();
  _strokeFill(ctx, s.hull, s.trim);
  ctx.fillStyle = '#1e2d3d';
  ctx.beginPath();
  ctx.moveTo(4, -3);
  ctx.lineTo(-8, -4);
  ctx.lineTo(-8, 4);
  ctx.lineTo(4, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = s.accent;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(10, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  _engineBell(ctx, -16, 1);
  _thrusterCup(ctx, -8, -8.5, -Math.PI / 2);
  _thrusterCup(ctx, -8, 8.5, Math.PI / 2);
  _thrusterCup(ctx, 6, -6.5, -Math.PI / 2, 0.85);
  _thrusterCup(ctx, 6, 6.5, Math.PI / 2, 0.85);
  _thrusterCup(ctx, 12, -3, 0, 0.75);
  _thrusterCup(ctx, 12, 3, 0, 0.75);
  _noseGun(ctx, 16, '#7eb6d8');
  _dorsalTurret(ctx, -2, 0, -0.4);
}

function _drawGunship(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(4, -8);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-18, -6);
  ctx.lineTo(-18, 6);
  ctx.lineTo(-10, 11);
  ctx.lineTo(4, 8);
  ctx.closePath();
  _strokeFill(ctx, s.hull, s.trim);
  // Side weapon pods
  ctx.fillStyle = s.hull;
  ctx.strokeStyle = s.accent;
  ctx.fillRect(-8, -14, 12, 3.5);
  ctx.strokeRect(-8, -14, 12, 3.5);
  ctx.fillRect(-8, 10.5, 12, 3.5);
  ctx.strokeRect(-8, 10.5, 12, 3.5);
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, -13.5, 8, 1.5);
  ctx.fillRect(0, 12, 8, 1.5);
  _engineBell(ctx, -18, 1.15);
  _thrusterCup(ctx, -6, -11.5, -Math.PI / 2, 1.05);
  _thrusterCup(ctx, -6, 11.5, Math.PI / 2, 1.05);
  _thrusterCup(ctx, 6, -8.5, -Math.PI / 2);
  _thrusterCup(ctx, 6, 8.5, Math.PI / 2);
  _thrusterCup(ctx, -14, -5, Math.PI, 0.9);
  _thrusterCup(ctx, -14, 5, Math.PI, 0.9);
  _dorsalTurret(ctx, -2, 0, 0.5);
  _dorsalTurret(ctx, 6, 0, -0.3);
  _noseGun(ctx, 14, s.accent);
}

function _drawFreighter(ctx, s) {
  ctx.beginPath();
  ctx.rect(-18, -10, 28, 20);
  _strokeFill(ctx, s.hull, s.trim);
  ctx.beginPath();
  ctx.moveTo(10, -5);
  ctx.lineTo(20, -3);
  ctx.lineTo(20, 3);
  ctx.lineTo(10, 5);
  ctx.closePath();
  _strokeFill(ctx, '#2a3028', s.trim);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.moveTo(-8, -10);
  ctx.lineTo(-8, 10);
  ctx.moveTo(2, -10);
  ctx.lineTo(2, 10);
  ctx.moveTo(-18, 0);
  ctx.lineTo(10, 0);
  ctx.stroke();
  ctx.fillStyle = s.accent;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(-16, -8, 4, 4);
  ctx.globalAlpha = 1;
  _engineBell(ctx, -20, 1.2);
  _thrusterCup(ctx, -10, -11, -Math.PI / 2, 1.1);
  _thrusterCup(ctx, -10, 11, Math.PI / 2, 1.1);
  _thrusterCup(ctx, 4, -11, -Math.PI / 2, 1);
  _thrusterCup(ctx, 4, 11, Math.PI / 2, 1);
  _thrusterCup(ctx, -16, -6, Math.PI, 0.9);
  _thrusterCup(ctx, -16, 6, Math.PI, 0.9);
}

function _drawTanker(ctx, s) {
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2);
  _strokeFill(ctx, s.hull, s.trim);
  ctx.beginPath();
  ctx.moveTo(18, -4);
  ctx.lineTo(24, 0);
  ctx.lineTo(18, 4);
  ctx.closePath();
  _strokeFill(ctx, '#1e2a30', s.trim);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  for (const x of [-12, -4, 4, 12]) {
    ctx.beginPath();
    ctx.ellipse(x, 0, 2, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = s.accent;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(-6, -2, 8, 4);
  ctx.globalAlpha = 1;
  _engineBell(ctx, -22, 1.15);
  _thrusterCup(ctx, -8, -8, -Math.PI / 2, 1);
  _thrusterCup(ctx, -8, 8, Math.PI / 2, 1);
  _thrusterCup(ctx, 8, -7, -Math.PI / 2, 0.9);
  _thrusterCup(ctx, 8, 7, Math.PI / 2, 0.9);
  _thrusterCup(ctx, -18, -4, Math.PI, 0.85);
  _thrusterCup(ctx, -18, 4, Math.PI, 0.85);
}

function _drawHauler(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(6, -12);
  ctx.lineTo(-16, -14);
  ctx.lineTo(-20, -6);
  ctx.lineTo(-20, 6);
  ctx.lineTo(-16, 14);
  ctx.lineTo(6, 12);
  ctx.closePath();
  _strokeFill(ctx, s.hull, s.trim);
  ctx.fillStyle = '#4a4030';
  ctx.strokeStyle = s.accent;
  ctx.fillRect(-12, -8, 10, 6);
  ctx.strokeRect(-12, -8, 10, 6);
  ctx.fillRect(-12, 2, 10, 6);
  ctx.strokeRect(-12, 2, 10, 6);
  ctx.fillStyle = '#2a2820';
  ctx.fillRect(2, -4, 8, 8);
  _engineBell(ctx, -20, 1.15);
  _thrusterCup(ctx, -8, -14.5, -Math.PI / 2, 1.1);
  _thrusterCup(ctx, -8, 14.5, Math.PI / 2, 1.1);
  _thrusterCup(ctx, 4, -12.5, -Math.PI / 2, 1);
  _thrusterCup(ctx, 4, 12.5, Math.PI / 2, 1);
  _thrusterCup(ctx, -16, -7, Math.PI, 0.95);
  _thrusterCup(ctx, -16, 7, Math.PI, 0.95);
}
