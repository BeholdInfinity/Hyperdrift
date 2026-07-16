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

/**
 * Draw a visitor (or ambient) modular ship in local space (+X = nose).
 * Requires a locked shipDef — never rolls cosmetics in the draw path.
 * Hangar passes an angled view so side peeks track pad yaw; ambient/flight
 * omit it and stay top-down.
 * Propulsion plumes use the same mount-driven path as the player ship
 * (`drawModularShip` → `drawMountPlumes`).
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

  drawModularShip(ctx, shipLike, view || topDownView());
}
