/**
 * Sparse ambient space traffic around Jennings Station.
 * Modular ships only; locked defs at spawn; hard caps + off-screen cull.
 *
 * Density north star: a few ships near the hangar (police always pack),
 * almost never deep out — but not zero.
 *
 * Spawn / despawn rule: never pop in or out of the player's visible circle
 * or their max radar horizon. Ships only instantiate outside
 * max(camera viewport, furthest scan range) + margin, and only cull past
 * that same bubble. Age expiry while inside extends life / steers out.
 */

import { STATION, AMBIENT, SHIP, radarMaxRange } from '../core/Constants.js';
import { generateShip, generateVisitor } from '../ships/ShipGenerator.js';
import { SHIP_CLASSES } from '../ships/ShipClasses.js';
import { drawVisitorShip, makeVisitorThrusters } from './HangarVisitorShips.js';
import { corridorSpawnFactor } from './TransitCorridor.js';
import { emitMountExhaust, hasActivePropulsion } from '../ships/PlumeDraw.js';
import {
  clearThrusters,
  cruiseTo,
  holdSpeed,
  brake,
  thrustAlongNose,
  followWaypointRing,
  polygonWaypoints,
  nearestWaypointIndex,
  holdRacetrackCorners,
  initHoldLeg,
  ensureBody,
} from './NpcPilot.js';

let _nextId = 1;
let _nextGroup = 1;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(dx, dy) {
  return Math.atan2(dy, dx);
}

/** Station-relative orbit ring [min,max] — authored at SCALE=1, multiplied by STATION.SCALE. */
function stationRing(lo, hi) {
  return [lo * STATION.SCALE, hi * STATION.SCALE];
}

/** Visible police pack orbit (station edge + 2× runway ± spread). */
function policeOrbitRing() {
  const r = AMBIENT.POLICE_ORBIT_R;
  const spread = AMBIENT.POLICE_ORBIT_SPREAD || r * 0.08;
  return [Math.max(STATION.RADIUS * 1.15, r - spread), r + spread];
}

/**
 * Role → behaviour archetypes for every catalog class (+ police theme overlay).
 * Patrol/police rings are station-scaled so they sit outside the larger hull.
 * @type {Record<string, { behavior: string, groupMin?: number, groupMax?: number, ring?: [number, number], deep?: boolean, police?: boolean }>}
 */
export const ROLE_BEHAVIOR = {
  // UltraLight
  drone: { behavior: 'flyby', groupMin: 2, groupMax: 3 },
  scout: { behavior: 'recon', groupMin: 1, groupMax: 1 },
  racer: { behavior: 'race', groupMin: 2, groupMax: 3 },
  // Station security — police hex uses AMBIENT.POLICE_ORBIT_R (see policeOrbitRing)
  lightFighter: {
    behavior: 'police',
    groupMin: 1,
    groupMax: 1,
    police: true,
  },
  // Light
  fighter: {
    behavior: 'police',
    groupMin: 1,
    groupMax: 1,
    police: true,
  },
  transport: { behavior: 'shuttle', groupMin: 1, groupMax: 1 },
  // Standard
  miner: { behavior: 'mine', groupMin: 1, groupMax: 1 },
  generalist: { behavior: 'cruise', groupMin: 1, groupMax: 1 },
  science: { behavior: 'survey', groupMin: 1, groupMax: 1 },
  hauler: { behavior: 'freight', groupMin: 1, groupMax: 1 },
  standardFighter: {
    behavior: 'police',
    groupMin: 1,
    groupMax: 1,
    police: true,
  },
  standardTransport: { behavior: 'shuttle', groupMin: 1, groupMax: 1 },
  // Heavy — deep-space rare cruise-by (heavyFighter also used as police capital)
  heavyMiner: { behavior: 'deepCruise', groupMin: 1, groupMax: 1, deep: true },
  heavyGeneralist: { behavior: 'deepCruise', groupMin: 1, groupMax: 1, deep: true },
  heavyScience: { behavior: 'deepSurvey', groupMin: 1, groupMax: 1, deep: true },
  heavyHauler: { behavior: 'deepCruise', groupMin: 1, groupMax: 1, deep: true },
  heavyFighter: {
    behavior: 'police',
    groupMin: 1,
    groupMax: 1,
    police: true,
  },
  heavyTransport: { behavior: 'deepCruise', groupMin: 1, groupMax: 1, deep: true },
  // maintainPolice seed role
  police: {
    behavior: 'police',
    groupMin: 1,
    groupMax: 1,
    police: true,
  },
};

// Police pack is only from _maintainPolice — never random near/seed spawns
const NEAR_SPAWN_WEIGHTS = [
  { classId: 'drone', w: 1.4 },
  { classId: 'racer', w: 1.2 },
  { classId: 'scout', w: 1.0 },
  { classId: 'miner', w: 1.1 },
  { classId: 'hauler', w: 0.9 },
  { classId: 'generalist', w: 0.8 },
  { classId: 'science', w: 0.7 },
  { classId: 'transport', w: 0.7 },
  { classId: 'standardTransport', w: 0.5 },
];

const DEEP_SPAWN_WEIGHTS = [
  { classId: 'heavyGeneralist', w: 1.2 },
  { classId: 'heavyHauler', w: 1.0 },
  { classId: 'heavyTransport', w: 0.8 },
  { classId: 'heavyMiner', w: 0.7 },
  { classId: 'heavyScience', w: 0.6 },
  // heavyFighter reserved for station police pack (not deep cruise)
  { classId: 'hauler', w: 0.25 },
  { classId: 'generalist', w: 0.15 },
];

const SEED_NEAR_WEIGHTS = [
  { classId: 'hauler', w: 1.2 },
  { classId: 'miner', w: 1.0 },
  { classId: 'transport', w: 0.9 },
  { classId: 'generalist', w: 0.8 },
  { classId: 'scout', w: 0.7 },
  { classId: 'drone', w: 0.6 },
];

function pickWeighted(table) {
  let sum = 0;
  for (const row of table) sum += row.w;
  let r = Math.random() * sum;
  for (const row of table) {
    r -= row.w;
    if (r <= 0) return row.classId;
  }
  return table[table.length - 1].classId;
}

/**
 * Density at distance d from station center.
 * High near hangar, exponential falloff, tiny floor in deep space.
 */
export function densityAtDistance(d) {
  const near = AMBIENT.NEAR_RADIUS;
  const mid = AMBIENT.MID_RADIUS;
  if (d <= near) return 1;
  if (d <= mid) {
    const t = (d - near) / (mid - near);
    return Math.exp(-AMBIENT.FALLOFF_K * t);
  }
  const t = (d - mid) / Math.max(1, AMBIENT.DEEP_RADIUS - mid);
  return AMBIENT.DEEP_FLOOR * Math.exp(-AMBIENT.DEEP_FALLOFF * t);
}

export class AmbientTrafficSystem {
  constructor() {
    /** @type {object[]} */
    this.ships = [];
    this._spawnCooldown = 1.5;
    this._eventCooldown = 4;
    /** Gap between hangar-requested bay approaches (matches visitor cadence) */
    this._bayApproachCooldown = 2;
    /** @type {{ x: number, y: number, viewRadius: number }|null} */
    this._view = null;
    /** Mouth transit mutex — one bayApproach/Ingress/Egress at a time */
    this._mouthBusyId = null;
  }

  reset() {
    this.ships = [];
    this._spawnCooldown = 0.8;
    this._eventCooldown = 3;
    this._bayApproachCooldown = 1.5;
    this._view = null;
    this._mouthBusyId = null;
  }

  countNonPolice() {
    return this.ships.filter((s) => !s.isPolice).length;
  }

  countPolice() {
    return this.ships.filter((s) => s.isPolice).length;
  }

  /**
   * Dev drawer breakdown of loaded ambient AI ships.
   * @returns {{
   *   total: number,
   *   customers: number,
   *   police: number,
   *   miners: number,
   *   flyby: number,
   *   freight: number,
   *   survey: number,
   *   deep: number,
   *   leaving: number,
   *   other: number,
   * }}
   */
  getTrafficStats() {
    const stats = {
      total: this.ships.length,
      customers: 0,
      police: 0,
      miners: 0,
      flyby: 0,
      freight: 0,
      survey: 0,
      deep: 0,
      leaving: 0,
      other: 0,
    };
    for (const s of this.ships) {
      if (
        this._isCustomerState(s.state) ||
        s.state === 'bayEgress'
      ) {
        stats.customers++;
        continue;
      }
      if (s.pendingCull || s.state === 'leave') {
        stats.leaving++;
        continue;
      }
      if (s.isPolice || s.behavior === 'police') {
        stats.police++;
        continue;
      }
      switch (s.behavior) {
        case 'mine':
          stats.miners++;
          break;
        case 'flyby':
        case 'race':
          stats.flyby++;
          break;
        case 'shuttle':
        case 'freight':
        case 'cruise':
        case 'recon':
          stats.freight++;
          break;
        case 'survey':
        case 'deepSurvey':
          stats.survey++;
          break;
        case 'deepCruise':
          stats.deep++;
          break;
        default:
          stats.other++;
          break;
      }
    }
    return stats;
  }

  /**
   * Circular play viewport in world units (center + radius), plus margin, and
   * the player-centered radar horizon used for spawn/despawn gating.
   * @param {{ x?: number, y?: number, viewRadius?: number }|null|undefined} camera
   * @param {number} px
   * @param {number} py
   */
  _resolveView(camera, px, py) {
    const cx = camera?.x ?? px;
    const cy = camera?.y ?? py;
    const baseR = camera?.viewRadius ?? 520;
    const viewRadius = baseR + AMBIENT.VISIBLE_MARGIN;
    const scanHorizon =
      radarMaxRange() + (AMBIENT.SCAN_HORIZON_MARGIN ?? 1200);
    this._view = {
      x: cx,
      y: cy,
      viewRadius,
      px,
      py,
      scanHorizon,
    };
    return this._view;
  }

  /** True if world point is inside the player's visible circle (+ margin). */
  _isVisible(x, y, view = this._view) {
    if (!view) return false;
    return dist(x, y, view.x, view.y) <= view.viewRadius;
  }

  /**
   * Camera view or max radar reach from the player — spawn/despawn bubble.
   * Keeping traffic outside this prevents radar pop-in/out.
   */
  _isInPresenceBubble(x, y, view = this._view) {
    if (!view) return false;
    if (this._isVisible(x, y, view)) return true;
    const hx = view.px ?? view.x;
    const hy = view.py ?? view.y;
    const horizon = view.scanHorizon ?? view.viewRadius;
    return dist(x, y, hx, hy) <= horizon;
  }

  /** Pose bag for Station occlusion / ingress helpers. */
  asStationPose(ship) {
    if (!ship) return null;
    return {
      id: ship.id,
      position: { x: ship.x, y: ship.y },
      angle: ship.angle,
      velocity: { x: ship.vx || 0, y: ship.vy || 0 },
      shipDef: ship.shipDef,
      exitBurn: !!ship.exitBurn,
    };
  }

  /** True while a ship is a hangar customer (inbound → hold → approach → ingress). */
  _isCustomerState(state) {
    return (
      state === 'bayInbound' ||
      state === 'bayApproach' ||
      state === 'bayIngress' ||
      state === 'bayHold'
    );
  }

  /** Runway staging point north of the approach lights for a lane. */
  _customerStagePoint(station, lane) {
    return {
      x: station.laneCenterWorldX(lane),
      y: station.furthestApproachLightY() - AMBIENT.CUSTOMER_STAGE_NORTH,
    };
  }

  /**
   * Space→hangar customer: spawn far out on a ring around the station (any
   * bearing), then fly inbound to north runway staging before final approach.
   * @param {import('./Station.js').Station} station
   * @param {number} lane
   * @param {{ x: number, y: number, viewRadius: number }|null} view
   * @param {number} px
   * @param {number} py
   * @param {{ runwayLocal?: boolean }} [opts] runwayLocal = title vignette seed on the corridor
   */
  spawnBayApproach(station, lane, view, px, py, opts = {}) {
    if (!station) return null;
    if (this.ships.length >= AMBIENT.MAX_SHIPS) return null;
    const bi = ((lane | 0) + 3) % 3;
    if (
      this.ships.some(
        (s) => this._isCustomerState(s.state) && s.targetLane === bi
      )
    ) {
      return null;
    }

    const stage = this._customerStagePoint(station, bi);
    let x;
    let y;
    let heading;
    let state;
    let spd;

    if (opts.runwayLocal) {
      // Title / vignette: start on the north corridor so the approach is visible
      y = stage.y - (80 + Math.random() * 160);
      x = stage.x + (Math.random() - 0.5) * 40;
      heading = Math.PI / 2;
      state = 'bayApproach';
      spd = Math.min(STATION.DOCK_MAX_SPEED * 0.85, 95);
    } else {
      // Full ring around the station — customers arrive from every direction
      let ang = Math.random() * Math.PI * 2;
      let r =
        AMBIENT.CUSTOMER_SPAWN_R_MIN +
        Math.random() * (AMBIENT.CUSTOMER_SPAWN_R_MAX - AMBIENT.CUSTOMER_SPAWN_R_MIN);
      x = station.x + Math.cos(ang) * r;
      y = station.y + Math.sin(ang) * r;
      // Prefer off-screen; push further out along the same bearing if needed
      for (let i = 0; i < 8; i++) {
        const tooClosePlayer = dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE;
        const onScreen = view && this._isVisible(x, y, view);
        if (!tooClosePlayer && !onScreen) break;
        r += 280 + Math.random() * 220;
        if (tooClosePlayer) ang = Math.random() * Math.PI * 2;
        x = station.x + Math.cos(ang) * r;
        y = station.y + Math.sin(ang) * r;
      }
      heading = angleTo(stage.x - x, stage.y - y);
      state = 'bayInbound';
      spd = AMBIENT.CUSTOMER_INBOUND_SPEED * (0.85 + Math.random() * 0.25);
    }

    const classId = pickWeighted([
      { classId: 'hauler', w: 1.4 },
      { classId: 'transport', w: 1.1 },
      { classId: 'standardTransport', w: 0.8 },
      { classId: 'generalist', w: 0.9 },
    ]);
    const role = ROLE_BEHAVIOR[classId] || ROLE_BEHAVIOR.hauler;
    const ship = this._makeShip(classId, role, x, y, heading, _nextGroup++, false);
    if (!ship) return null;
    ship.behavior = 'freight';
    ship.state = state;
    ship.stateT = 0;
    ship.targetLane = bi;
    ship.cruiseSpd = spd;
    ship.maxAge =
      state === 'bayInbound' ? 140 + Math.random() * 80 : 80 + Math.random() * 40;
    ship.vx = Math.cos(heading) * spd;
    ship.vy = Math.sin(heading) * spd;
    ship.velocity.x = ship.vx;
    ship.velocity.y = ship.vy;
    ensureBody(ship);
    clearThrusters(ship);
    // Mouth mutex only for final runway approach — not the long inbound leg
    if (state === 'bayApproach') this._mouthBusyId = ship.id;
    this.ships.push(ship);
    return ship;
  }

  /**
   * Drain hangar `wantSpaceArrival` lanes into far-ring customer spawns.
   * Mouth busy does not block spawning — only one customer per lane.
   */
  _fulfillHangarArrivalRequests(station, hangarBay, px, py, view) {
    if (this._bayApproachCooldown > 0) return;
    const requested = hangarBay.getSpaceArrivalRequestLanes?.() || [];
    const open = requested.filter(
      (i) =>
        station.padAvailable?.(i) &&
        !this.ships.some(
          (s) => this._isCustomerState(s.state) && s.targetLane === i
        )
    );
    if (!open.length) return;
    const lane = open[(Math.random() * open.length) | 0];
    const ship = this.spawnBayApproach(station, lane, view, px, py);
    if (!ship) return;
    this._bayApproachCooldown =
      AMBIENT.BAY_APPROACH_SPAWN_MIN +
      Math.random() * (AMBIENT.BAY_APPROACH_SPAWN_MAX - AMBIENT.BAY_APPROACH_SPAWN_MIN);
  }

  /**
   * Hangar→space: visitor hull continues as nearby ambient with exit burn.
   * @param {import('./Station.js').Station} station
   * @param {{ shipDef: object, bayIndex: number }} egress
   */
  spawnBayEgress(station, egress) {
    if (!station || !egress?.shipDef) return null;
    if (this.ships.length >= AMBIENT.MAX_SHIPS) return null;
    const spawn = station.getExitSpawn(egress.bayIndex ?? 1);
    const thrusters = makeVisitorThrusters(egress.shipDef);
    const ship = {
      id: _nextId++,
      groupId: _nextGroup++,
      classId: 'hauler',
      behavior: 'freight',
      isPolice: false,
      shipDef: egress.shipDef,
      thrusters,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      vx: Math.cos(spawn.angle) * 200,
      vy: Math.sin(spawn.angle) * 200,
      angularVelocity: 0,
      age: 0,
      maxAge: 45 + Math.random() * 40,
      pendingCull: false,
      state: 'bayEgress',
      stateT: 0,
      targetLane: egress.bayIndex ?? 1,
      exitBurn: true,
      orbitAngle: 0,
      orbitR: 0,
      patrolLeg: 0,
      patrolPhase: 0,
      patrolR: 0,
      holdLeg: 0,
      holdReverse: false,
      cruiseSpd: 200,
      targetAsteroid: null,
      scanTarget: null,
      miningLaserFiring: false,
      miningLaserRelAngle: 0,
      miningLaserBeamLength: 0,
      muzzleFlash: 0,
      getTurretLocalAngle: () => 0,
      velocity: { x: 0, y: 0 },
    };
    ship.velocity.x = ship.vx;
    ship.velocity.y = ship.vy;
    ensureBody(ship);
    clearThrusters(ship);
    ship.thrusters.mainEngine = 1;
    this._mouthBusyId = ship.id;
    this.ships.push(ship);
    // Keep arrive/leave mouth events spaced like hangar visitor cadence
    this._bayApproachCooldown = Math.max(
      this._bayApproachCooldown,
      AMBIENT.BAY_APPROACH_SPAWN_MIN * 0.65
    );
    return ship;
  }

  /**
   * @param {number} dt
   * @param {{
   *   player: object,
   *   station: object,
   *   hangarBay?: object|null,
   *   asteroids: object[],
   *   camera?: { x: number, y: number, viewRadius: number },
   * }} ctx
   */
  update(dt, ctx) {
    const player = ctx.player;
    const station = ctx.station;
    const hangarBay = ctx.hangarBay || null;
    this._gameTime = ctx.gameTime ?? 0;
    this._gameTime = ctx.gameTime ?? 0;
    const sx = station?.x ?? STATION.WORLD_X;
    const sy = station?.y ?? STATION.WORLD_Y;
    const px = player?.position?.x ?? sx;
    const py = player?.position?.y ?? sy;
    const asteroids = ctx.asteroids || [];
    const view = this._resolveView(ctx.camera, px, py);

    // First frame after reset: seed cops + a few near-station ships (all off-screen)
    if (this.ships.length === 0 && this._spawnCooldown <= 0.85) {
      this._seedStationBubble(sx, sy, px, py, view);
    }

    this._maintainPolice(sx, sy, px, py, view);

    // Hangar departures → nearby space actors (re-queue if spawn fails)
    if (hangarBay?.drainSpaceEgress && station) {
      for (const eg of hangarBay.drainSpaceEgress()) {
        const ship = this.spawnBayEgress(station, eg);
        if (!ship && eg?.shipDef) {
          if (!hangarBay.pendingSpaceEgress) hangarBay.pendingSpaceEgress = [];
          hangarBay.pendingSpaceEgress.push(eg);
        }
      }
    }

    this._spawnCooldown -= dt;
    this._eventCooldown -= dt;
    this._bayApproachCooldown -= dt;

    if (this._spawnCooldown <= 0 && this.ships.length < AMBIENT.MAX_SHIPS) {
      this._trySpawn(sx, sy, px, py, view);
      this._spawnCooldown =
        AMBIENT.SPAWN_INTERVAL_MIN +
        Math.random() * (AMBIENT.SPAWN_INTERVAL_MAX - AMBIENT.SPAWN_INTERVAL_MIN);
    }

    // Clear mouth mutex if owner gone
    if (
      this._mouthBusyId != null &&
      !this.ships.some((s) => s.id === this._mouthBusyId)
    ) {
      this._mouthBusyId = null;
    }

    // Hangar empty-bay door fills → visible runway approaches (space view)
    if (hangarBay && station) {
      this._fulfillHangarArrivalRequests(station, hangarBay, px, py, view);
    }

    for (const ship of this.ships) {
      ship.age += dt;
      ship.stateT += dt;
      // Age expired while in camera view or scan horizon → mark leave, do not cull yet
      if (
        ship.age > ship.maxAge &&
        !ship.pendingCull &&
        ship.state !== 'bayInbound' &&
        ship.state !== 'bayApproach' &&
        ship.state !== 'bayIngress' &&
        ship.state !== 'bayEgress' &&
        ship.state !== 'bayHold'
      ) {
        if (this._isInPresenceBubble(ship.x, ship.y, view)) {
          ship.pendingCull = true;
          ship.state = 'leave';
          ship.stateT = 0;
          this._steerOffCamera(ship, view);
        }
      }
      this._tickShip(ship, dt, {
        sx,
        sy,
        px,
        py,
        player,
        asteroids,
        peers: this.ships,
        view,
        station,
        hangarBay,
      });
      // Keep velocity bag in sync for mount plume flow + exhaust
      if (ship.velocity) {
        ship.velocity.x = ship.vx;
        ship.velocity.y = ship.vy;
      }
    }

    this.ships = this.ships.filter((s) => !this._shouldCull(s, px, py, sx, sy, view));

    // Mount-driven exhaust — ship-local attach (same glue-to-nozzle rules as player)
    const particles = ctx.particles;
    if (particles) {
      for (const ship of this.ships) {
        if (!hasActivePropulsion(ship)) continue;
        const pose = this.asStationPose(ship);
        const underStation = !!(station && station.shouldOccludeShip?.(pose));
        emitMountExhaust(ship, particles, {
          attachId: `a${ship.id}`,
          underStation,
        });
      }
    }
  }

  /** Guarantee the fixed police pack (1 Heavy Mk5 + 2 Standard Mk2); off-screen only. */
  _maintainPolice(sx, sy, px, py, view) {
    if (this.ships.length >= AMBIENT.MAX_SHIPS) return;

    const slots = AMBIENT.POLICE_SLOTS || [];
    const have = { heavyFighter: 0, standardFighter: 0 };
    for (const s of this.ships) {
      if (!s.isPolice && s.behavior !== 'police') continue;
      const id = s.shipDef?.classId || s.classId;
      if (id === 'heavyFighter') have.heavyFighter++;
      else if (id === 'standardFighter') have.standardFighter++;
    }

    const missing = [];
    for (const slot of slots) {
      const id = slot.classId;
      if ((have[id] || 0) > 0) {
        have[id]--;
        continue;
      }
      missing.push(slot);
    }
    if (missing.length === 0) return;

    const role = ROLE_BEHAVIOR.police;
    const ring = policeOrbitRing();
    const groupId = _nextGroup++;
    let placed = 0;
    for (let attempt = 0; attempt < 28 && placed < missing.length; attempt++) {
      if (this.ships.length >= AMBIENT.MAX_SHIPS) break;
      if (this.countPolice() >= AMBIENT.MAX_POLICE) break;
      const slot = missing[placed];
      let pos = this._pickOffscreenNearStation(sx, sy, px, py, view, ring);
      // Seed fallback: place on the orbit even if the ring is partly on-screen
      if (!pos && attempt > 16) {
        const ang = Math.random() * Math.PI * 2;
        const r = ring[0] + Math.random() * (ring[1] - ring[0]);
        pos = {
          x: sx + Math.cos(ang) * r,
          y: sy + Math.sin(ang) * r,
          r,
          orbitAng: ang,
        };
      }
      if (!pos) continue;
      const heading = pos.orbitAng + Math.PI / 2;
      const ship = this._makeShip(
        slot.classId,
        role,
        pos.x,
        pos.y,
        heading,
        groupId,
        true,
        slot.mk
      );
      if (!ship) continue;
      ship.orbitAngle = pos.orbitAng;
      ship.orbitR = pos.r;
      ship.patrolR = pos.r;
      this.ships.push(ship);
      placed++;
    }
  }

  /** One-shot near-station population so flight isn't empty. */
  _seedStationBubble(sx, sy, px, py, view) {
    this._maintainPolice(sx, sy, px, py, view);

    let toAdd = AMBIENT.SEED_NEAR_TRAFFIC;
    for (let attempt = 0; attempt < 20 && toAdd > 0; attempt++) {
      if (this.ships.length >= AMBIENT.MAX_SHIPS) break;
      const classId = pickWeighted(SEED_NEAR_WEIGHTS);
      const role = ROLE_BEHAVIOR[classId] || ROLE_BEHAVIOR.generalist;
      const asPolice = !!(role.police || role.behavior === 'police');
      if (asPolice && this.countPolice() >= AMBIENT.MAX_POLICE) continue;
      if (!asPolice && this.countNonPolice() >= AMBIENT.MAX_NEAR_NON_POLICE) continue;
      const ring = role.ring || [AMBIENT.NEAR_RADIUS * 0.75, AMBIENT.MID_RADIUS * 0.55];
      const pos = this._pickOffscreenNearStation(sx, sy, px, py, view, ring);
      if (!pos) continue;
      const heading = pos.orbitAng + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      const ship = this._makeShip(classId, role, pos.x, pos.y, heading, _nextGroup++, asPolice);
      if (!ship) continue;
      ship.orbitAngle = pos.orbitAng;
      ship.orbitR = pos.r;
      this.ships.push(ship);
      toAdd--;
    }
  }

  /**
   * Sample a station-ring point that is off-screen and clear of the player.
   * @returns {{ x: number, y: number, r: number, orbitAng: number }|null}
   */
  _pickOffscreenNearStation(sx, sy, px, py, view, ring) {
    const r0 = ring[0];
    const r1 = ring[1];
    for (let i = 0; i < 18; i++) {
      const r = r0 + Math.random() * Math.max(1, r1 - r0);
      const orbitAng = Math.random() * Math.PI * 2;
      const x = sx + Math.cos(orbitAng) * r;
      const y = sy + Math.sin(orbitAng) * r;
      // Prefer past camera + past max scan from the player (radar pop prevention).
      if (this._isInPresenceBubble(x, y, view)) continue;
      if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      return { x, y, r, orbitAng };
    }
    // Fallback for police / station pack when the player is inside the near bubble:
    // off-camera only (may still be inside radar range).
    for (let i = 0; i < 12; i++) {
      const r = r0 + Math.random() * Math.max(1, r1 - r0);
      const orbitAng = Math.random() * Math.PI * 2;
      const x = sx + Math.cos(orbitAng) * r;
      const y = sy + Math.sin(orbitAng) * r;
      if (this._isVisible(x, y, view)) continue;
      if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      return { x, y, r, orbitAng };
    }
    if (!view) return null;
    const escapeAng = Math.random() * Math.PI * 2;
    const horizon = view.scanHorizon || view.viewRadius;
    const r = Math.max(horizon + 40, (r0 + r1) * 0.5);
    const x = (view.px ?? view.x) + Math.cos(escapeAng) * r;
    const y = (view.py ?? view.y) + Math.sin(escapeAng) * r;
    if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE * 0.6) return null;
    return { x, y, r: dist(x, y, sx, sy), orbitAng: Math.atan2(y - sy, x - sx) };
  }

  /**
   * Off-screen spawn for flybys: outside view rim AND past max scan from player.
   */
  _pickOffscreenFlyby(sx, sy, px, py, view) {
    if (!view) return null;
    const horizon = view.scanHorizon || view.viewRadius;
    for (let i = 0; i < 16; i++) {
      const edgeAng = Math.random() * Math.PI * 2;
      const r = horizon + 60 + Math.random() * 180;
      const x = (view.px ?? view.x) + Math.cos(edgeAng) * r;
      const y = (view.py ?? view.y) + Math.sin(edgeAng) * r;
      if (this._isInPresenceBubble(x, y, view)) continue;
      if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      const toward = angleTo(sx - x, sy - y) + (Math.random() - 0.5) * 0.7;
      return { x, y, heading: toward };
    }
    return null;
  }

  _steerOffCamera(ship, view) {
    if (!view) {
      holdSpeed(ship, this._cruiseSpeed(ship.behavior), 1 / 60);
      return;
    }
    const hx = view.px ?? view.x;
    const hy = view.py ?? view.y;
    const a = angleTo(ship.x - hx, ship.y - hy);
    const outR = Math.max(view.viewRadius, view.scanHorizon || 0) + 400;
    const spd = Math.max(180, this._cruiseSpeed(ship.behavior));
    const tx = hx + Math.cos(a) * outR;
    const ty = hy + Math.sin(a) * outR;
    ship._leaveTarget = { x: tx, y: ty, spd };
  }

  _trySpawn(sx, sy, px, py, view) {
    const preferDeep = Math.random() < AMBIENT.DEEP_SPAWN_CHANCE;
    const table = preferDeep ? DEEP_SPAWN_WEIGHTS : NEAR_SPAWN_WEIGHTS;
    const classId = pickWeighted(table);
    const role = ROLE_BEHAVIOR[classId] || ROLE_BEHAVIOR.generalist;
    const asPolice = !!(role.police || role.behavior === 'police');

    if (asPolice && this.countPolice() >= AMBIENT.MAX_POLICE) return;
    if (!asPolice && !role.deep && this.countNonPolice() >= AMBIENT.MAX_NEAR_NON_POLICE) {
      return;
    }

    // Flyby / race: enter from off-screen edge
    if (role.behavior === 'flyby' || role.behavior === 'race') {
      const edge = this._pickOffscreenFlyby(sx, sy, px, py, view);
      if (!edge) return;
      const dens = densityAtDistance(dist(edge.x, edge.y, sx, sy));
      const corridorMult = corridorSpawnFactor(edge.x, edge.y, this._gameTime ?? 0);
      if (Math.random() > (dens * AMBIENT.NEAR_ACCEPT) / corridorMult) return;
      const n =
        role.groupMin != null
          ? role.groupMin +
            ((Math.random() * ((role.groupMax || role.groupMin) - role.groupMin + 1)) | 0)
          : 1;
      const groupId = _nextGroup++;
      for (let i = 0; i < n; i++) {
        if (this.ships.length >= AMBIENT.MAX_SHIPS) break;
        const ox = (i - (n - 1) / 2) * 42;
        const oy = i * 28;
        const cos = Math.cos(edge.heading);
        const sin = Math.sin(edge.heading);
        const gx = edge.x + ox * cos - oy * sin;
        const gy = edge.y + ox * sin + oy * cos;
        if (this._isInPresenceBubble(gx, gy, view)) continue;
        const ship = this._makeShip(classId, role, gx, gy, edge.heading, groupId, false);
        if (ship) this.ships.push(ship);
      }
      return;
    }

    let spawnR;
    if (role.deep) {
      spawnR =
        AMBIENT.DEEP_SPAWN_MIN +
        Math.random() * (AMBIENT.DEEP_SPAWN_MAX - AMBIENT.DEEP_SPAWN_MIN);
    } else {
      const ring = role.ring || [AMBIENT.NEAR_RADIUS * 0.7, AMBIENT.MID_RADIUS * 0.85];
      spawnR = ring[0] + Math.random() * (ring[1] - ring[0]);
    }

    const dens = densityAtDistance(spawnR);
    const accept = role.deep ? AMBIENT.DEEP_ACCEPT : AMBIENT.NEAR_ACCEPT;

    const pos = role.deep
      ? this._pickOffscreenDeep(sx, sy, px, py, view, spawnR)
      : this._pickOffscreenNearStation(
          sx,
          sy,
          px,
          py,
          view,
          role.ring || [spawnR * 0.9, spawnR * 1.1]
        );
    if (!pos) return;
    const corridorMult = corridorSpawnFactor(pos.x, pos.y, this._gameTime ?? 0);
    if (Math.random() > (dens * accept) / corridorMult) return;

    const n =
      role.groupMin != null
        ? role.groupMin +
          ((Math.random() * ((role.groupMax || role.groupMin) - role.groupMin + 1)) | 0)
        : 1;

    const groupId = _nextGroup++;
    const leadHeading = pos.orbitAng + Math.PI / 2 + (Math.random() - 0.5) * 0.8;

    for (let i = 0; i < n; i++) {
      if (this.ships.length >= AMBIENT.MAX_SHIPS) break;
      if (asPolice && this.countPolice() >= AMBIENT.MAX_POLICE) break;
      const ox = (i - (n - 1) / 2) * 42;
      const oy = i * 28;
      const cos = Math.cos(leadHeading);
      const sin = Math.sin(leadHeading);
      const gx = pos.x + ox * cos - oy * sin;
      const gy = pos.y + ox * sin + oy * cos;
      if (this._isInPresenceBubble(gx, gy, view)) continue;
      if (dist(gx, gy, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      const ship = this._makeShip(classId, role, gx, gy, leadHeading, groupId, asPolice);
      if (ship) {
        ship.orbitAngle = pos.orbitAng;
        ship.orbitR = pos.r;
        this.ships.push(ship);
      }
    }
  }

  _pickOffscreenDeep(sx, sy, px, py, view, spawnR) {
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const x = sx + Math.cos(ang) * spawnR;
      const y = sy + Math.sin(ang) * spawnR;
      if (this._isInPresenceBubble(x, y, view)) continue;
      if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      return { x, y, r: spawnR, orbitAng: ang };
    }
    return null;
  }

  _makeShip(classId, role, x, y, heading, groupId, isPolice, mk = null) {
    const asPolice = !!(isPolice || role?.police || role?.behavior === 'police');
    const policeHulls = ['heavyFighter', 'standardFighter', 'fighter', 'lightFighter'];
    let shipDef;
    let ringClassId = classId;
    if (asPolice) {
      const hullId = policeHulls.includes(classId)
        ? classId
        : 'standardFighter';
      ringClassId = hullId;
      const hullMk =
        mk != null
          ? mk
          : hullId === 'heavyFighter'
            ? 5
            : hullId === 'standardFighter'
              ? 2
              : 1;
      shipDef = generateShip({
        classId: hullId,
        theme: 'police',
        mk: hullMk,
        rng: Math.random,
      });
    } else if (role.deep) {
      shipDef = generateVisitor(classId);
    } else {
      shipDef = generateVisitor(classId in SHIP_CLASSES ? classId : 'generalist');
    }

    const behavior = asPolice ? 'police' : role.behavior;
    const thrusters = makeVisitorThrusters(shipDef);
    const speed = this._cruiseSpeed(behavior);
    const vx = Math.cos(heading) * speed;
    const vy = Math.sin(heading) * speed;

    const ship = {
      id: _nextId++,
      groupId,
      classId: ringClassId,
      behavior,
      isPolice: asPolice,
      shipDef,
      thrusters,
      x,
      y,
      angle: heading,
      vx,
      vy,
      angularVelocity: 0,
      age: 0,
      maxAge: this._lifetime(behavior),
      pendingCull: false,
      state: 'enter',
      stateT: 0,
      orbitAngle: Math.atan2(y - STATION.WORLD_Y, x - STATION.WORLD_X),
      orbitR: dist(x, y, STATION.WORLD_X, STATION.WORLD_Y),
      targetAsteroid: null,
      scanTarget: null,
      miningLaserFiring: false,
      miningLaserRelAngle: 0,
      miningLaserBeamLength: SHIP.MINING_LASER_RANGE * 0.55,
      muzzleFlash: 0,
      getTurretLocalAngle: () => 0,
      velocity: { x: vx, y: vy },
      patrolLeg: 0,
      patrolPhase: Math.atan2(y - STATION.WORLD_Y, x - STATION.WORLD_X),
      patrolR: dist(x, y, STATION.WORLD_X, STATION.WORLD_Y),
      holdLeg: 0,
      holdReverse: false,
      cruiseSpd: speed,
    };
    ensureBody(ship);
    clearThrusters(ship);
    return ship;
  }

  _cruiseSpeed(behavior) {
    switch (behavior) {
      case 'flyby':
        return 520 + Math.random() * 180;
      case 'race':
        return 580 + Math.random() * 220;
      case 'police':
        return 140 + Math.random() * 60;
      case 'mine':
      case 'survey':
        return 90 + Math.random() * 40;
      case 'shuttle':
      case 'freight':
      case 'cruise':
        return 120 + Math.random() * 50;
      case 'recon':
        return 160 + Math.random() * 40;
      case 'deepCruise':
      case 'deepSurvey':
        return 100 + Math.random() * 45;
      default:
        return 130;
    }
  }

  _lifetime(behavior) {
    switch (behavior) {
      case 'flyby':
      case 'race':
        return 12 + Math.random() * 8;
      case 'mine':
        return 45 + Math.random() * 30;
      case 'police':
        // Long tours — maintainPolice replaces when they finally leave
        return 90 + Math.random() * 60;
      case 'deepCruise':
      case 'deepSurvey':
        return 70 + Math.random() * 50;
      default:
        return 40 + Math.random() * 35;
    }
  }

  _tickShip(ship, dt, env) {
    const { sx, sy, player, asteroids, peers, view, station, hangarBay } = env;
    ensureBody(ship);

    if (
      ship.state === 'bayInbound' ||
      ship.state === 'bayApproach' ||
      ship.state === 'bayIngress' ||
      ship.state === 'bayEgress' ||
      ship.state === 'bayHold'
    ) {
      this._tickBayMouth(ship, dt, station, hangarBay);
      return;
    }

    if (ship.pendingCull || ship.state === 'leave') {
      if (view && this._isInPresenceBubble(ship.x, ship.y, view)) {
        if (!ship._leaveTarget) this._steerOffCamera(ship, view);
        const t = ship._leaveTarget;
        if (t) {
          cruiseTo(ship, t.x, t.y, t.spd, dt, {
            arrivalR: 80,
            brakeForArrival: false,
            speedBand: AMBIENT.COAST_SPEED_BAND,
            headingTol: AMBIENT.COAST_HEADING_TOL,
          });
        } else {
          holdSpeed(ship, Math.max(180, this._cruiseSpeed(ship.behavior)), dt);
        }
      } else {
        holdSpeed(ship, Math.max(180, this._cruiseSpeed(ship.behavior)), dt, {
          faceAngle: ship.angle,
        });
      }
      return;
    }

    switch (ship.behavior) {
      case 'police':
        this._tickPolice(ship, dt, sx, sy, player, peers);
        break;
      case 'flyby':
      case 'race':
        this._tickFlyby(ship, dt);
        break;
      case 'mine':
        this._tickMine(ship, dt, asteroids, sx, sy);
        break;
      case 'survey':
      case 'deepSurvey':
        this._tickSurvey(ship, dt, asteroids);
        break;
      case 'shuttle':
      case 'freight':
      case 'cruise':
      case 'recon':
        this._tickLane(ship, dt, sx, sy);
        this._maybeBeginBayApproach(ship, station, hangarBay);
        break;
      case 'deepCruise':
        this._tickDeep(ship, dt);
        break;
      default:
        this._tickLane(ship, dt, sx, sy);
        break;
    }
  }

  /** Green pads ambient freighters may land on (never the player bay). */
  _openVisitorLanes(station, hangarBay, pose) {
    const greens = [];
    for (let i = 0; i < 3; i++) {
      if (hangarBay?.isPlayerBay?.(i)) continue;
      if (station.padAvailable?.(i, pose)) greens.push(i);
    }
    return greens;
  }

  _nearestOpenLane(ship, station, greens) {
    let best = greens[0];
    let bestD = Infinity;
    for (const g of greens) {
      const d = Math.abs(ship.x - station.laneCenterWorldX(g));
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }

  _enterBayHold(ship, station) {
    ship.state = 'bayHold';
    ship.stateT = 0;
    const corners = holdRacetrackCorners(station, AMBIENT);
    initHoldLeg(ship, corners);
    if (this._mouthBusyId === ship.id) this._mouthBusyId = null;
  }

  _maybeBeginBayApproach(ship, station, hangarBay) {
    if (!station || !hangarBay) return;
    if (this._mouthBusyId != null) return;
    if (ship.stateT < 8) return;
    // Hangar drives mouth cadence via wantSpaceArrival; freighters only
    // divert onto those requested lanes (backup if a dedicated spawn was delayed).
    const requested = hangarBay.getSpaceArrivalRequestLanes?.() || [];
    if (!requested.length) return;
    if (Math.random() > 0.01) return;
    const open = requested.filter((i) => station.padAvailable?.(i));
    if (!open.length) return;
    ship.targetLane = open[(Math.random() * open.length) | 0];
    ship.state = 'bayApproach';
    ship.stateT = 0;
    this._mouthBusyId = ship.id;
    this._bayApproachCooldown = Math.max(
      this._bayApproachCooldown,
      AMBIENT.BAY_APPROACH_SPAWN_MIN * 0.5
    );
  }

  _tickBayMouth(ship, dt, station, hangarBay) {
    if (!station) {
      ship.state = 'leave';
      return;
    }
    const pose = this.asStationPose(ship);

    if (ship.state === 'bayEgress') {
      ship.exitBurn = true;
      const nose = -Math.PI / 2;
      const burnSpd = 210;
      thrustAlongNose(ship, 1, dt, { faceAngle: nose, yawMult: 1.35 });
      // Keep exit burn readable even while still yawing
      ship.thrusters.mainEngine = Math.max(ship.thrusters.mainEngine || 0, 1);
      if (
        station.isExitBurnFinished(pose) ||
        ship.stateT > STATION.EXIT_BURN_MAX_SEC
      ) {
        ship.exitBurn = false;
        ship.state = 'leave';
        ship.stateT = 0;
        ship.pendingCull = true;
        if (this._mouthBusyId === ship.id) this._mouthBusyId = null;
        const out = angleTo(ship.x - station.x, ship.y - station.y);
        ship._leaveTarget = {
          x: ship.x + Math.cos(out) * 800,
          y: ship.y + Math.sin(out) * 800,
          spd: burnSpd,
        };
      }
      return;
    }

    if (ship.state === 'bayInbound') {
      const lane = ship.targetLane ?? 1;
      const stage = this._customerStagePoint(station, lane);
      const spd = ship.cruiseSpd || AMBIENT.CUSTOMER_INBOUND_SPEED;
      cruiseTo(ship, stage.x, stage.y, spd, dt, {
        arrivalR: AMBIENT.CUSTOMER_STAGE_ARRIVAL_R,
        brakeForArrival: false,
        speedBand: AMBIENT.COAST_SPEED_BAND,
        headingTol: AMBIENT.COAST_HEADING_TOL,
        yawMult: 1.05,
      });
      const d = dist(ship.x, ship.y, stage.x, stage.y);
      if (d < AMBIENT.CUSTOMER_STAGE_ARRIVAL_R * 1.25) {
        const greens = this._openVisitorLanes(station, hangarBay, pose);
        const mouthFree =
          this._mouthBusyId == null || this._mouthBusyId === ship.id;
        if (!station.padAvailable?.(lane, pose) && !greens.length) {
          this._enterBayHold(ship, station);
          return;
        }
        if (mouthFree) {
          if (!station.padAvailable?.(lane, pose) && greens.length) {
            ship.targetLane = this._nearestOpenLane(ship, station, greens);
          }
          ship.state = 'bayApproach';
          ship.stateT = 0;
          ship.cruiseSpd = Math.min(STATION.DOCK_MAX_SPEED * 0.85, 95);
          this._mouthBusyId = ship.id;
        }
        // else keep loitering toward staging until mouth frees
      }
      return;
    }

    if (ship.state === 'bayHold') {
      const greens = this._openVisitorLanes(station, hangarBay, pose);
      const mouthFree =
        this._mouthBusyId == null || this._mouthBusyId === ship.id;
      if (greens.length && mouthFree) {
        ship.targetLane = this._nearestOpenLane(ship, station, greens);
        ship.state = 'bayApproach';
        ship.stateT = 0;
        this._mouthBusyId = ship.id;
        return;
      }
      const corners = holdRacetrackCorners(station, AMBIENT);
      if (ship.holdLeg == null) initHoldLeg(ship, corners);
      followWaypointRing(ship, corners, AMBIENT.HOLD_CRUISE_SPEED, dt, {
        legKey: 'holdLeg',
        reverse: !!ship.holdReverse,
        arrivalR: AMBIENT.HOLD_ARRIVAL_R,
        speedBand: AMBIENT.COAST_SPEED_BAND,
        headingTol: AMBIENT.COAST_HEADING_TOL,
      });
      return;
    }

    const greens = this._openVisitorLanes(station, hangarBay, pose);
    let lane = ship.targetLane ?? 1;

    // Never hold on the runway when another pad is open — retarget
    if (ship.state !== 'bayIngress' && !station.padAvailable?.(lane, pose)) {
      if (greens.length) {
        ship.targetLane = this._nearestOpenLane(ship, station, greens);
        lane = ship.targetLane;
        ship.state = 'bayApproach';
      } else {
        this._enterBayHold(ship, station);
        this._tickBayMouth(ship, dt, station, hangarBay);
        return;
      }
    }

    const tx = station.laneCenterWorldX(lane);
    const approachSpd = Math.min(STATION.DOCK_MAX_SPEED * 0.85, 95);
    const frameOpts = { frameVx: station.vx ?? 0, frameVy: station.vy ?? 0 };

    if (ship.state === 'bayApproach') {
      // Aim past the caution paint into the mouth — do NOT park at the outer
      // lights (arrival brake there left ships stuck north of the runway).
      const targetY = station.stripeWorldY() + STATION.EXIT_NEST + 50;
      const inCorridor = ship.y >= station.furthestApproachLightY() - 30;
      const spdTarget = inCorridor
        ? Math.max(50, approachSpd * 0.65)
        : approachSpd;
      cruiseTo(ship, tx, targetY, spdTarget, dt, {
        arrivalR: 55,
        brakeForArrival: false,
        yawMult: inCorridor ? 1.35 : 1.1,
        speedBand: AMBIENT.COAST_SPEED_BAND,
        headingTol: inCorridor ? 0.4 : AMBIENT.COAST_HEADING_TOL,
        ...frameOpts,
      });
      const poseNow = this.asStationPose(ship);
      if (station.shouldAutoIngress(poseNow)) {
        ship.state = 'bayIngress';
        ship.stateT = 0;
      } else if (ship.stateT > 55) {
        // Failsafe: abandon a stuck approach so the mouth mutex frees
        this._enterBayHold(ship, station);
      }
      return;
    }

    // bayIngress — keep flying south under the roof until hangar accepts
    const ingressY = station.stripeWorldY() + STATION.EXIT_NEST + 80;
    cruiseTo(ship, tx, ingressY, 70, dt, {
      arrivalR: 40,
      yawMult: 1.4,
      brakeForArrival: false,
      headingTol: 0.45,
      ...frameOpts,
    });
    const underRoof = ship.y > station.stripeWorldY() + STATION.EXIT_NEST;
    if (underRoof || ship.stateT > 8) {
      const ok = hangarBay?.acceptSpaceArrival?.(lane, ship.shipDef, 'hauler');
      if (this._mouthBusyId === ship.id) this._mouthBusyId = null;
      if (ok) {
        ship.pendingCull = true;
        ship.state = 'leave';
      } else if (greens.length) {
        ship.targetLane = this._nearestOpenLane(ship, station, greens);
        ship.state = 'bayApproach';
        ship.stateT = 0;
        this._mouthBusyId = ship.id;
      } else {
        this._enterBayHold(ship, station);
      }
    }
  }

  _tickPolice(ship, dt, sx, sy, player, peers) {
    if (ship.state === 'scan') {
      this._tickPoliceScan(ship, dt, player, peers);
      return;
    }

    const ring = policeOrbitRing();
    const targetR =
      ship.patrolR ||
      ring[0] + Math.random() * Math.max(8, ring[1] - ring[0]);
    ship.patrolR = Math.max(ring[0], Math.min(ring[1], targetR));
    if (ship.patrolPhase == null) {
      ship.patrolPhase = Math.atan2(ship.y - sy, ship.x - sx);
    }
    const corners = polygonWaypoints(
      sx,
      sy,
      ship.patrolR,
      AMBIENT.POLICE_HEX_SIDES,
      ship.patrolPhase
    );
    if (ship.patrolLeg == null || ship.patrolLeg < 0) {
      ship.patrolLeg = nearestWaypointIndex(corners, ship.x, ship.y);
    }
    const spd = (ship.cruiseSpd || this._cruiseSpeed(ship.behavior)) * 0.85;
    followWaypointRing(ship, corners, spd, dt, {
      legKey: 'patrolLeg',
      arrivalR: AMBIENT.POLICE_ARRIVAL_R,
      speedBand: AMBIENT.COAST_SPEED_BAND,
      headingTol: AMBIENT.COAST_HEADING_TOL,
      brakeForArrival: true,
    });

    this._tickPoliceScan(ship, dt, player, peers);
  }

  _tickPoliceScan(ship, dt, player, peers) {
    if (ship.state === 'scan') {
      let face = ship.angle;
      if (ship.scanTarget) {
        const tx =
          ship.scanTarget === 'player' ? player.position.x : ship.scanTarget.x;
        const ty =
          ship.scanTarget === 'player' ? player.position.y : ship.scanTarget.y;
        face = angleTo(tx - ship.x, ty - ship.y);
        ship.miningLaserRelAngle = 0;
      }
      brake(ship, dt, { faceAngle: face, yawMult: 1.25, stopSpeed: 25 });
      ship.miningLaserFiring = true;
      ship.miningLaserBeamLength = 90;
      if (ship.stateT > 2.4 + Math.random() * 0.8) {
        ship.state = 'idle';
        ship.stateT = 0;
        ship.scanTarget = null;
        ship.miningLaserFiring = false;
        ship._scanCooldown = 14 + Math.random() * 18;
      }
      return;
    }

    ship.miningLaserFiring = false;
    ship._scanCooldown = (ship._scanCooldown || 8) - dt;
    if (ship._scanCooldown > 0) return;

    let target = null;
    let kind = null;
    if (
      player &&
      dist(ship.x, ship.y, player.position.x, player.position.y) < AMBIENT.SCAN_RANGE
    ) {
      target = 'player';
      kind = 'player';
    } else {
      const others = peers.filter(
        (p) =>
          p !== ship && !p.isPolice && dist(ship.x, ship.y, p.x, p.y) < AMBIENT.SCAN_RANGE
      );
      if (others.length) {
        target = others[(Math.random() * others.length) | 0];
        kind = 'peer';
      }
    }
    if (!target) {
      ship._scanCooldown = 6 + Math.random() * 8;
      return;
    }
    ship.state = 'scan';
    ship.stateT = 0;
    ship.scanTarget = kind === 'player' ? 'player' : target;
    ship._scanCooldown = 20;
  }

  _tickFlyby(ship, dt) {
    const spd = ship.cruiseSpd || this._cruiseSpeed(ship.behavior);
    // Straight flight: boost to cruise once, then pure coast
    holdSpeed(ship, spd, dt);
  }

  _tickMine(ship, dt, asteroids, sx, sy) {
    if (ship.state === 'leave') {
      holdSpeed(ship, 200, dt, { faceAngle: ship.angle });
      ship.miningLaserFiring = false;
      return;
    }

    if (!ship.targetAsteroid || !ship.targetAsteroid.active) {
      let best = null;
      let bestD = Infinity;
      for (const a of asteroids) {
        if (!a.active) continue;
        const d = dist(ship.x, ship.y, a.position.x, a.position.y);
        if (d < bestD && d < 2200) {
          bestD = d;
          best = a;
        }
      }
      ship.targetAsteroid = best;
      ship.state = best ? 'approach' : 'wander';
      ship.stateT = 0;
      ship.mineLeg = 0;
    }

    if (ship.state === 'wander' || !ship.targetAsteroid) {
      this._tickLane(ship, dt, sx, sy);
      if (ship.stateT > 18) {
        ship.state = 'leave';
        ship.pendingCull = true;
      }
      return;
    }

    const ax = ship.targetAsteroid.position.x;
    const ay = ship.targetAsteroid.position.y;
    const d = dist(ship.x, ship.y, ax, ay);
    const orbitR = (ship.targetAsteroid.radius || 40) + 70;

    if (ship.state === 'approach') {
      ship.miningLaserFiring = false;
      const result = cruiseTo(ship, ax, ay, 110, dt, {
        arrivalR: orbitR + 20,
        brakeForArrival: true,
        speedBand: AMBIENT.COAST_SPEED_BAND,
        headingTol: AMBIENT.COAST_HEADING_TOL,
      });
      if (result.arrived || d < orbitR + 40) {
        ship.state = 'mine';
        ship.stateT = 0;
        ship.minePhase = Math.atan2(ship.y - ay, ship.x - ax);
        ship.mineLeg = 0;
      }
    } else if (ship.state === 'mine') {
      const corners = polygonWaypoints(ax, ay, orbitR, 8, ship.minePhase || 0);
      followWaypointRing(ship, corners, 55, dt, {
        legKey: 'mineLeg',
        arrivalR: 40,
        speedBand: AMBIENT.COAST_SPEED_BAND,
        headingTol: AMBIENT.COAST_HEADING_TOL,
      });
      ship.miningLaserFiring = true;
      ship.miningLaserRelAngle = angleTo(ax - ship.x, ay - ship.y) - ship.angle;
      ship.miningLaserBeamLength = Math.min(SHIP.MINING_LASER_RANGE, d);
      if (ship.stateT > 8 + Math.random() * 6) {
        ship.state = 'leave';
        ship.pendingCull = true;
        ship.stateT = 0;
        ship.miningLaserFiring = false;
        const out = angleTo(ship.x - sx, ship.y - sy);
        ship._leaveTarget = {
          x: ship.x + Math.cos(out) * 900,
          y: ship.y + Math.sin(out) * 900,
          spd: 200,
        };
      }
    }
  }

  _tickSurvey(ship, dt, asteroids) {
    if (ship.stateT < 6) {
      this._tickFlyby(ship, dt);
      return;
    }
    let nearest = null;
    let best = Infinity;
    for (const a of asteroids) {
      if (!a.active) continue;
      const d = dist(ship.x, ship.y, a.position.x, a.position.y);
      if (d < best) {
        best = d;
        nearest = a;
      }
    }
    if (nearest && best < 400) {
      const a = angleTo(nearest.position.x - ship.x, nearest.position.y - ship.y);
      brake(ship, dt, { faceAngle: a, yawMult: 1.1, stopSpeed: 35 });
      ship.miningLaserFiring = ship.stateT % 4 < 1.5;
      ship.miningLaserBeamLength = 70;
    } else {
      holdSpeed(ship, this._cruiseSpeed(ship.behavior) * 0.7, dt, {
        faceAngle: ship.angle,
      });
      ship.miningLaserFiring = false;
    }
  }

  _tickLane(ship, dt, sx, sy) {
    const r =
      ship.patrolR ||
      dist(ship.x, ship.y, sx, sy) ||
      AMBIENT.NEAR_RADIUS * 0.9;
    ship.patrolR = r;
    if (ship.patrolPhase == null) {
      ship.patrolPhase = Math.atan2(ship.y - sy, ship.x - sx);
    }
    const corners = polygonWaypoints(
      sx,
      sy,
      r,
      AMBIENT.LANE_HEX_SIDES,
      ship.patrolPhase
    );
    if (ship.patrolLeg == null) {
      ship.patrolLeg = nearestWaypointIndex(corners, ship.x, ship.y);
    }
    const spd = ship.cruiseSpd || this._cruiseSpeed(ship.behavior);
    followWaypointRing(ship, corners, spd, dt, {
      legKey: 'patrolLeg',
      arrivalR: AMBIENT.LANE_ARRIVAL_R,
      speedBand: AMBIENT.COAST_SPEED_BAND,
      headingTol: AMBIENT.COAST_HEADING_TOL,
    });
  }

  _tickDeep(ship, dt) {
    // Mostly coast; rare thruster course tweak (not continuous drift)
    const spd =
      ship.cruiseSpd ||
      Math.hypot(ship.vx, ship.vy) ||
      this._cruiseSpeed(ship.behavior);
    if (ship.deepHeading == null) ship.deepHeading = ship.angle;
    ship._deepTweak = (ship._deepTweak || 0) - dt;
    if (ship._deepTweak <= 0) {
      ship._deepTweak = 8 + Math.random() * 14;
      ship.deepHeading += (Math.random() - 0.5) * 0.55;
    }
    holdSpeed(ship, spd, dt, { faceAngle: ship.deepHeading, yawMult: 0.6 });
  }

  /**
   * Cull only past the presence bubble (off-camera AND past max scan from player).
   * Age / distance alone never removes a ship still on radar or on screen.
   */
  _shouldCull(ship, px, py, sx, sy, view) {
    if (this._isInPresenceBubble(ship.x, ship.y, view)) return false;

    if (ship.age > ship.maxAge || ship.pendingCull) return true;

    const dPlayer = dist(ship.x, ship.y, px, py);
    const dStation = dist(ship.x, ship.y, sx, sy);
    if (dPlayer > AMBIENT.CULL_DIST && dStation > AMBIENT.CULL_DIST) return true;

    if (
      (ship.behavior === 'flyby' || ship.behavior === 'race') &&
      ship.age > 4 &&
      dStation > AMBIENT.FLYBY_RADIUS * 1.6 &&
      dPlayer > AMBIENT.CULL_DIST * 0.55
    ) {
      return true;
    }

    if (ship.state === 'leave' && ship.stateT > 10) return true;
    return false;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx — world-space (camera already applied)
   * @param {{ only?: object[] }} [opts] if `only` set, draw that subset
   */
  render(ctx, opts = {}) {
    const list = opts.only || this.ships;
    for (const ship of list) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);
      drawVisitorShip(ctx, ship);
      ctx.restore();
    }
  }
}
