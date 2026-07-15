/**
 * Hangar neighbor-pad visitors — modular ship defs + ShipRenderer.
 * Legacy role ids (scout/interceptor/…) map to classes via VISITOR_ROLE_TO_CLASS.
 */

import { SHIP } from '../core/Constants.js';
import { padAcceptsClass } from '../ships/ShipClasses.js';
import {
  generateVisitor,
  VISITOR_ROLE_TO_CLASS,
} from '../ships/ShipGenerator.js';
import {
  drawModularShip,
  getShipHardpointsTable,
  getShipThrusterKeys,
} from '../ships/ShipRenderer.js';
import { hexToRgba } from '../ships/Themes.js';
import { topDownView } from '../ships/ShipViews.js';
/** @typedef {import('../ships/ShipViews.js').ShipView} ShipView */

/** @typedef {'scout'|'interceptor'|'patrol'|'gunship'|'freighter'|'tanker'|'hauler'|'cruiser'|'warden'} VisitorId */

/**
 * Hangar role metadata (service bias / cargo display). Visuals come from shipDef.
 * `cruiser`/`warden` are Standard-group peers (roughly player-sized) — only
 * rolled onto a side pad when it lands the player's own pad-Mk tier.
 * @type {Record<VisitorId, { id: VisitorId, role: string, cargoMk: number, armed: boolean }>}
 */
export const VISITOR_CATALOG = {
  scout: { id: 'scout', role: 'scout', cargoMk: 0, armed: true },
  interceptor: { id: 'interceptor', role: 'combat', cargoMk: 2, armed: true },
  patrol: { id: 'patrol', role: 'patrol', cargoMk: 3, armed: true },
  gunship: { id: 'gunship', role: 'combat', cargoMk: 4, armed: true },
  freighter: { id: 'freighter', role: 'cargo', cargoMk: 7, armed: false },
  tanker: { id: 'tanker', role: 'cargo', cargoMk: 9, armed: false },
  hauler: { id: 'hauler', role: 'cargo', cargoMk: 5, armed: false },
  cruiser: { id: 'cruiser', role: 'patrol', cargoMk: 5, armed: true },
  warden: { id: 'warden', role: 'combat', cargoMk: 3, armed: true },
};

const VISITOR_IDS = /** @type {VisitorId[]} */ (Object.keys(VISITOR_CATALOG));

/**
 * @param {number|null} [padMk]
 * @returns {VisitorId}
 */
export function pickVisitorId(padMk = null) {
  let pool = VISITOR_IDS;
  if (padMk != null) {
    pool = VISITOR_IDS.filter((id) =>
      padAcceptsClass(padMk, VISITOR_ROLE_TO_CLASS[id] || 'fighter')
    );
    if (!pool.length) pool = VISITOR_IDS;
  }
  return pool[(Math.random() * pool.length) | 0];
}

export function getVisitorSpec(id) {
  return VISITOR_CATALOG[id] || VISITOR_CATALOG.patrol;
}

/**
 * Build a modular definition for a hangar visitor role.
 * @param {VisitorId|string} visitorId
 * @param {() => number} [rng]
 */
export function createVisitorShipDef(visitorId, rng = Math.random) {
  const classId =
    VISITOR_ROLE_TO_CLASS[visitorId] ||
    (visitorId === 'player' ? 'generalist' : 'fighter');
  return generateVisitor(classId, rng);
}

/**
 * Empty thruster state from a modular definition.
 * @param {import('../ships/ShipDefinition.js').ShipDefinition|null} def
 */
export function makeVisitorThrusters(def) {
  /** @type {Record<string, number|boolean>} */
  const t = { mainEngine: 0, afterburner: 0, retroBurn: 0 };
  // Never roll a new ship here — string ids used to call createVisitorShipDef
  // every fire tick and that path must stay dead.
  if (!def || typeof def !== 'object' || !def.resolveMounts) {
    for (const k of [
      'nosePort',
      'noseStarboard',
      'aftPort',
      'aftStarboard',
      'portFore',
      'portAft',
      'starboardFore',
      'starboardAft',
    ]) {
      t[k] = 0;
    }
    return t;
  }
  const ship = { shipDef: def };
  for (const k of getShipThrusterKeys(ship)) t[k] = 0;
  return t;
}

/**
 * Propulsion mounts from a locked shipDef only — never regenerates cosmetics.
 * @param {import('../ships/ShipDefinition.js').ShipDefinition|null} def
 */
export function getVisitorPropulsion(def) {
  if (!def || typeof def !== 'object' || !def.resolveMounts) {
    return {
      mainEngine: { x: -16, y: 0, angle: Math.PI },
      thrusters: [],
    };
  }
  const ship = { shipDef: def };
  const table = getShipHardpointsTable(ship);
  const thrusterKeys = getShipThrusterKeys(ship);
  const engKey =
    typeof def.mainEngineKeys === 'function'
      ? def.mainEngineKeys()[0]
      : 'mainEngine';
  const eng = table[engKey] || table.mainEngine || { x: -16, y: 0, angle: Math.PI };
  return {
    mainEngine: { x: eng.x, y: eng.y, angle: eng.angle },
    thrusters: thrusterKeys.map((key) => {
      const hp = table[key];
      return { key, x: hp.x, y: hp.y, angle: hp.angle };
    }),
  };
}

/** Assign modular shipDef + thrusters onto a hangar pad for a visitor id. Locked until clear. */
export function equipPadVisitor(pad, visitorId, rng = Math.random) {
  pad.visitorId = visitorId;
  pad.shipDef = createVisitorShipDef(visitorId, rng);
  pad.thrusters = makeVisitorThrusters(pad.shipDef);
  return pad;
}

/** Clear visitor visual/sim payload from a pad. */
export function clearPadVisitor(pad) {
  pad.visitorId = null;
  pad.shipDef = null;
  pad.thrusters = null;
}

function _smoothstep(edge0, edge1, t) {
  const x = Math.max(0, Math.min(1, (t - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function _computePlumeFlow(
  exhaustDirX,
  exhaustDirY,
  velocity,
  angle,
  angularVelocity,
  localOx,
  localOy
) {
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
 * Draw modular thruster / engine plumes from shipDef mounts.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ship — { shipDef, thrusters, velocity, angle, angularVelocity }
 */
export function drawVisitorPlumes(ctx, ship) {
  const def = ship.shipDef;
  if (!def || !ship.thrusters) return;
  const t = ship.thrusters;
  const angle = ship.angle ?? SHIP.SPAWN_ANGLE;
  const velocity = ship.velocity || { x: 0, y: 0 };
  const angularVelocity = ship.angularVelocity || 0;
  const table = getShipHardpointsTable(ship);
  const mounts = def.resolveMounts?.() || {};

  const defaultBlue = 'rgba(100, 180, 255, 0.7)';
  const defaultBlueFade = 'rgba(40, 90, 160, 0)';
  const defaultOrange = 'rgba(255, 160, 70, 0.9)';
  const defaultOrangeFade = 'rgba(180, 80, 30, 0)';

  const engKeys =
    typeof def.mainEngineKeys === 'function'
      ? def.mainEngineKeys()
      : mounts.mainEngine?.item
        ? ['mainEngine']
        : [];
  for (const engKey of engKeys) {
    const engHp = table[engKey];
    if (!engHp) continue;
    if (mounts[engKey] && !mounts[engKey].item) continue;
    const engPower = t.mainEngine || (t.retroBurn ? 0.5 : 0);
    if (engPower <= 0.02) continue;
    const exhaustDirX = Math.cos(angle + engHp.angle);
    const exhaustDirY = Math.sin(angle + engHp.angle);
    const flow = _computePlumeFlow(
      exhaustDirX,
      exhaustDirY,
      velocity,
      angle,
      angularVelocity,
      engHp.x,
      engHp.y
    );
    let len = 30;
    let width = 6.75;
    len *= flow.lengthMul * (1 - 0.48 * flow.cone);
    width *= 1 + 0.65 * flow.cone;
    const pal = def.paletteForMount?.(engKey);
    const accent = pal?.colors?.accent || pal?.colors?.trim;
    _drawPlume(
      ctx,
      engHp.x,
      engHp.y,
      engHp.angle,
      engPower,
      len,
      accent ? hexToRgba(accent, 0.9) : defaultOrange,
      width,
      accent ? hexToRgba(accent, 0) : defaultOrangeFade,
      flow.lean
    );
  }

  for (const key of getShipThrusterKeys(ship)) {
    const intensity = t[key] || 0;
    if (intensity <= 0.02) continue;
    const m = table[key];
    if (!m) continue;
    const dirX = Math.cos(angle + m.angle);
    const dirY = Math.sin(angle + m.angle);
    const flow = _computePlumeFlow(
      dirX,
      dirY,
      velocity,
      angle,
      angularVelocity,
      m.x,
      m.y
    );
    let len = (8 + intensity * 3.5) * SHIP.THRUSTER_PLUME_SCALE;
    let width = (1.15 + intensity * 0.9) * SHIP.THRUSTER_PLUME_SCALE;
    len *= flow.lengthMul * (1 - 0.48 * flow.cone);
    width *= 1 + 0.7 * flow.cone;
    const pal = def.paletteForMount?.(key);
    const trim = pal?.colors?.trim || pal?.colors?.accent;
    _drawPlume(
      ctx,
      m.x,
      m.y,
      m.angle,
      intensity,
      len,
      trim ? hexToRgba(trim, 0.7) : defaultBlue,
      width,
      trim ? hexToRgba(trim, 0) : defaultBlueFade,
      flow.lean
    );
  }
}

/**
 * Draw a visitor (or ambient) modular ship in local space (+X = nose).
 * Requires a locked shipDef — never rolls cosmetics in the draw path.
 * Hangar passes an angled view so side peeks track pad yaw; ambient/flight
 * omit it and stay top-down.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ship — { shipDef, thrusters?, velocity?, angle?, … }
 * @param {{ thrusters?: object, velocity?: {x:number,y:number}, angle?: number, angularVelocity?: number }} [propulsion]
 * @param {ShipView} [view]
 */
export function drawVisitorShip(ctx, ship, propulsion = null, view = null) {
  if (!ship || typeof ship === 'string' || !ship.shipDef) return;

  const shipLike = propulsion
    ? {
        ...ship,
        thrusters: propulsion.thrusters ?? ship.thrusters,
        velocity: propulsion.velocity ?? ship.velocity ?? { x: 0, y: 0 },
        angle: propulsion.angle ?? ship.angle ?? SHIP.SPAWN_ANGLE,
        angularVelocity: propulsion.angularVelocity ?? ship.angularVelocity ?? 0,
      }
    : ship;

  if (shipLike.thrusters) {
    drawVisitorPlumes(ctx, shipLike);
  }
  drawModularShip(ctx, shipLike, view || topDownView());
}
