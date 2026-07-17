/**
 * Sparse ambient space traffic around Jennings Station.
 * Modular ships only; locked defs at spawn; hard caps + off-screen cull.
 *
 * Density north star: a few ships near the hangar (police always pack),
 * almost never deep out — but not zero.
 *
 * Spawn / despawn rule: never pop in or out of the player's visible circle.
 * Ships only instantiate outside the camera viewport (+ margin), and only
 * cull when off-screen. Age expiry while visible extends life / steers out.
 */

import { STATION, AMBIENT, SHIP } from '../core/Constants.js';
import { generateShip, generateVisitor } from '../ships/ShipGenerator.js';
import { SHIP_CLASSES } from '../ships/ShipClasses.js';
import { drawVisitorShip, makeVisitorThrusters } from './HangarVisitorShips.js';
import { getShipThrusterKeys } from '../ships/ShipRenderer.js';
import { emitMountExhaust, hasActivePropulsion } from '../ships/PlumeDraw.js';

let _nextId = 1;
let _nextGroup = 1;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(dx, dy) {
  return Math.atan2(dy, dx);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function clearThrusters(ship) {
  if (!ship.thrusters) return;
  for (const k of Object.keys(ship.thrusters)) {
    if (k === 'retroBurn') ship.thrusters[k] = false;
    else ship.thrusters[k] = 0;
  }
}

function setCruiseThrust(ship, power = 0.55) {
  clearThrusters(ship);
  ship.thrusters.mainEngine = power;
  const keys = getShipThrusterKeys(ship);
  for (const k of keys) {
    if (k.startsWith('aft')) ship.thrusters[k] = power * 0.35;
  }
}

/** Station-relative orbit ring [min,max] — authored at SCALE=1, multiplied by STATION.SCALE. */
function stationRing(lo, hi) {
  return [lo * STATION.SCALE, hi * STATION.SCALE];
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
  lightFighter: { behavior: 'patrol', groupMin: 2, groupMax: 3, ring: stationRing(700, 1400) },
  // Light
  fighter: { behavior: 'patrol', groupMin: 2, groupMax: 3, ring: stationRing(800, 1600) },
  transport: { behavior: 'shuttle', groupMin: 1, groupMax: 1 },
  // Standard
  miner: { behavior: 'mine', groupMin: 1, groupMax: 1 },
  generalist: { behavior: 'cruise', groupMin: 1, groupMax: 1 },
  science: { behavior: 'survey', groupMin: 1, groupMax: 1 },
  hauler: { behavior: 'freight', groupMin: 1, groupMax: 1 },
  standardFighter: {
    behavior: 'patrol',
    groupMin: 2,
    groupMax: 2,
    ring: stationRing(1100, 1900),
  },
  standardTransport: { behavior: 'shuttle', groupMin: 1, groupMax: 1 },
  // Heavy — deep-space rare cruise-by
  heavyMiner: { behavior: 'deepCruise', groupMin: 1, groupMax: 1, deep: true },
  heavyGeneralist: { behavior: 'deepCruise', groupMin: 1, groupMax: 1, deep: true },
  heavyScience: { behavior: 'deepSurvey', groupMin: 1, groupMax: 1, deep: true },
  heavyHauler: { behavior: 'deepCruise', groupMin: 1, groupMax: 1, deep: true },
  heavyFighter: { behavior: 'deepPatrol', groupMin: 1, groupMax: 1, deep: true },
  heavyTransport: { behavior: 'deepCruise', groupMin: 1, groupMax: 1, deep: true },
  // Police is a theme overlay on light/standard fighters
  police: {
    behavior: 'police',
    groupMin: 2,
    groupMax: 4,
    ring: stationRing(600, 1500),
    police: true,
  },
};

const NEAR_SPAWN_WEIGHTS = [
  { classId: 'lightFighter', w: 2.2 },
  { classId: 'fighter', w: 2.0 },
  { classId: 'drone', w: 1.4 },
  { classId: 'racer', w: 1.2 },
  { classId: 'scout', w: 1.0 },
  { classId: 'miner', w: 1.1 },
  { classId: 'hauler', w: 0.9 },
  { classId: 'generalist', w: 0.8 },
  { classId: 'science', w: 0.7 },
  { classId: 'transport', w: 0.7 },
  { classId: 'standardTransport', w: 0.5 },
  { classId: 'standardFighter', w: 0.6 },
  // Police come from maintainPolice / seed — not random near spawns
];

const DEEP_SPAWN_WEIGHTS = [
  { classId: 'heavyGeneralist', w: 1.2 },
  { classId: 'heavyHauler', w: 1.0 },
  { classId: 'heavyTransport', w: 0.8 },
  { classId: 'heavyMiner', w: 0.7 },
  { classId: 'heavyScience', w: 0.6 },
  { classId: 'heavyFighter', w: 0.5 },
  { classId: 'hauler', w: 0.25 },
  { classId: 'generalist', w: 0.15 },
];

const SEED_NEAR_WEIGHTS = [
  { classId: 'fighter', w: 2.0 },
  { classId: 'lightFighter', w: 1.6 },
  { classId: 'hauler', w: 1.2 },
  { classId: 'miner', w: 1.0 },
  { classId: 'transport', w: 0.9 },
  { classId: 'generalist', w: 0.8 },
  { classId: 'scout', w: 0.7 },
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
   * Circular play viewport in world units (center + radius), plus margin.
   * @param {{ x?: number, y?: number, viewRadius?: number }|null|undefined} camera
   * @param {number} px
   * @param {number} py
   */
  _resolveView(camera, px, py) {
    const cx = camera?.x ?? px;
    const cy = camera?.y ?? py;
    const baseR = camera?.viewRadius ?? 520;
    const r = baseR + AMBIENT.VISIBLE_MARGIN;
    this._view = { x: cx, y: cy, viewRadius: r };
    return this._view;
  }

  /** True if world point is inside the player's visible circle (+ margin). */
  _isVisible(x, y, view = this._view) {
    if (!view) return false;
    return dist(x, y, view.x, view.y) <= view.viewRadius;
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

  /**
   * Space→hangar: spawn a freighter on the approach corridor for a requested bay.
   * May be on-screen — mouth traffic is meant to be seen while near the station.
   * @param {import('./Station.js').Station} station
   * @param {number} lane
   * @param {{ x: number, y: number, viewRadius: number }|null} view
   * @param {number} px
   * @param {number} py
   */
  spawnBayApproach(station, lane, view, px, py) {
    if (!station) return null;
    if (this.ships.length >= AMBIENT.MAX_SHIPS) return null;
    if (this._mouthBusyId != null) return null;
    const bi = ((lane | 0) + 3) % 3;
    if (
      this.ships.some(
        (s) =>
          (s.state === 'bayApproach' ||
            s.state === 'bayIngress' ||
            s.state === 'bayHold') &&
          s.targetLane === bi
      )
    ) {
      return null;
    }

    const tx = station.laneCenterWorldX(bi);
    const approachY = station.furthestApproachLightY();
    // Prefer further north so the ship flies the runway; nudge if on top of player
    let y = approachY - (380 + Math.random() * 320);
    let x = tx + (Math.random() - 0.5) * 36;
    if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE * 0.85) {
      y = Math.min(y, py) - AMBIENT.PLAYER_CLEARANCE;
    }
    // If still inside view and player is south of approach, push further north
    if (view && this._isVisible(x, y, view) && py > approachY - 80) {
      y = view.y - view.viewRadius - 80;
    }

    const classId = pickWeighted([
      { classId: 'hauler', w: 1.4 },
      { classId: 'transport', w: 1.1 },
      { classId: 'standardTransport', w: 0.8 },
      { classId: 'generalist', w: 0.9 },
    ]);
    const role = ROLE_BEHAVIOR[classId] || ROLE_BEHAVIOR.hauler;
    const heading = Math.PI / 2; // nose south toward the bay mouth
    const ship = this._makeShip(classId, role, x, y, heading, _nextGroup++, false);
    if (!ship) return null;
    ship.behavior = 'freight';
    ship.state = 'bayApproach';
    ship.stateT = 0;
    ship.targetLane = bi;
    ship.maxAge = 80 + Math.random() * 40;
    const spd = Math.min(STATION.DOCK_MAX_SPEED * 0.85, 95);
    ship.vx = Math.cos(heading) * spd;
    ship.vy = Math.sin(heading) * spd;
    ship.velocity.x = ship.vx;
    ship.velocity.y = ship.vy;
    setCruiseThrust(ship, 0.4);
    this._mouthBusyId = ship.id;
    this.ships.push(ship);
    return ship;
  }

  /**
   * Drain hangar `wantSpaceArrival` lanes into visible runway approaches.
   */
  _fulfillHangarArrivalRequests(station, hangarBay, px, py, view) {
    if (this._bayApproachCooldown > 0) return;
    if (this._mouthBusyId != null) return;
    const requested = hangarBay.getSpaceArrivalRequestLanes?.() || [];
    const open = requested.filter((i) => station.padAvailable?.(i));
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
    setCruiseThrust(ship, 1);
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

    // Hangar departures → nearby space actors
    if (hangarBay?.drainSpaceEgress && station) {
      for (const eg of hangarBay.drainSpaceEgress()) {
        this.spawnBayEgress(station, eg);
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
      // Age expired while visible → mark leave, do not cull yet
      if (
        ship.age > ship.maxAge &&
        !ship.pendingCull &&
        ship.state !== 'bayApproach' &&
        ship.state !== 'bayIngress' &&
        ship.state !== 'bayEgress'
      ) {
        if (this._isVisible(ship.x, ship.y, view)) {
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

    // Mount-driven exhaust particles (world-space — same fidelity as player)
    const particles = ctx.particles;
    if (particles) {
      for (const ship of this.ships) {
        if (!hasActivePropulsion(ship)) continue;
        emitMountExhaust(ship, particles, { worldSpace: true });
      }
    }
  }

  /** Guarantee MIN_POLICE around the station; spawns only off-screen. */
  _maintainPolice(sx, sy, px, py, view) {
    let need = AMBIENT.MIN_POLICE - this.countPolice();
    if (need <= 0) return;
    if (this.ships.length >= AMBIENT.MAX_SHIPS) return;

    const role = ROLE_BEHAVIOR.police;
    const groupId = _nextGroup++;
    let placed = 0;
    for (let attempt = 0; attempt < 24 && placed < need; attempt++) {
      const pos = this._pickOffscreenNearStation(
        sx,
        sy,
        px,
        py,
        view,
        role.ring || stationRing(600, 1500)
      );
      if (!pos) continue;
      const heading = pos.orbitAng + Math.PI / 2;
      const ship = this._makeShip('police', role, pos.x, pos.y, heading, groupId, true);
      if (!ship) continue;
      ship.orbitAngle = pos.orbitAng;
      ship.orbitR = pos.r;
      this.ships.push(ship);
      placed++;
      if (this.ships.length >= AMBIENT.MAX_SHIPS) break;
    }
  }

  /** One-shot near-station population so flight isn't empty. */
  _seedStationBubble(sx, sy, px, py, view) {
    this._maintainPolice(sx, sy, px, py, view);

    let toAdd = AMBIENT.SEED_NEAR_TRAFFIC;
    for (let attempt = 0; attempt < 20 && toAdd > 0; attempt++) {
      if (this.ships.length >= AMBIENT.MAX_SHIPS) break;
      if (this.countNonPolice() >= AMBIENT.MAX_NEAR_NON_POLICE) break;
      const classId = pickWeighted(SEED_NEAR_WEIGHTS);
      const role = ROLE_BEHAVIOR[classId] || ROLE_BEHAVIOR.generalist;
      const ring = role.ring || [AMBIENT.NEAR_RADIUS * 0.75, AMBIENT.MID_RADIUS * 0.55];
      const pos = this._pickOffscreenNearStation(sx, sy, px, py, view, ring);
      if (!pos) continue;
      const heading = pos.orbitAng + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      const ship = this._makeShip(classId, role, pos.x, pos.y, heading, _nextGroup++, false);
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
      if (this._isVisible(x, y, view)) continue;
      if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      return { x, y, r, orbitAng };
    }
    // Fallback: place just outside the visible rim, biased toward station ring
    if (!view) return null;
    const escapeAng = Math.random() * Math.PI * 2;
    const r = Math.max(view.viewRadius + 40, (r0 + r1) * 0.5);
    const x = view.x + Math.cos(escapeAng) * r;
    const y = view.y + Math.sin(escapeAng) * r;
    if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE * 0.6) return null;
    return { x, y, r: dist(x, y, sx, sy), orbitAng: Math.atan2(y - sy, x - sx) };
  }

  /**
   * Off-screen spawn for flybys: outside view rim, heading across/toward station.
   */
  _pickOffscreenFlyby(sx, sy, px, py, view) {
    if (!view) return null;
    for (let i = 0; i < 16; i++) {
      const edgeAng = Math.random() * Math.PI * 2;
      const r = view.viewRadius + 60 + Math.random() * 180;
      const x = view.x + Math.cos(edgeAng) * r;
      const y = view.y + Math.sin(edgeAng) * r;
      if (this._isVisible(x, y, view)) continue;
      if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      // Aim roughly across the view / past the station so they enter then exit
      const toward = angleTo(sx - x, sy - y) + (Math.random() - 0.5) * 0.7;
      return { x, y, heading: toward };
    }
    return null;
  }

  _steerOffCamera(ship, view) {
    if (!view) return;
    const a = angleTo(ship.x - view.x, ship.y - view.y);
    ship.angle = a;
    const spd = Math.max(180, this._cruiseSpeed(ship.behavior));
    ship.vx = Math.cos(a) * spd;
    ship.vy = Math.sin(a) * spd;
    setCruiseThrust(ship, 0.85);
  }

  _trySpawn(sx, sy, px, py, view) {
    const preferDeep = Math.random() < AMBIENT.DEEP_SPAWN_CHANCE;
    const table = preferDeep ? DEEP_SPAWN_WEIGHTS : NEAR_SPAWN_WEIGHTS;
    const classId = pickWeighted(table);
    const role = ROLE_BEHAVIOR[classId] || ROLE_BEHAVIOR.generalist;

    if (this.countNonPolice() >= AMBIENT.MAX_NEAR_NON_POLICE && !role.deep) {
      return;
    }

    // Flyby / race: enter from off-screen edge
    if (role.behavior === 'flyby' || role.behavior === 'race') {
      const edge = this._pickOffscreenFlyby(sx, sy, px, py, view);
      if (!edge) return;
      const dens = densityAtDistance(dist(edge.x, edge.y, sx, sy));
      if (Math.random() > dens * AMBIENT.NEAR_ACCEPT) return;
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
        if (this._isVisible(gx, gy, view)) continue;
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
    if (Math.random() > dens * (role.deep ? AMBIENT.DEEP_ACCEPT : AMBIENT.NEAR_ACCEPT)) {
      return;
    }

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

    const n =
      role.groupMin != null
        ? role.groupMin +
          ((Math.random() * ((role.groupMax || role.groupMin) - role.groupMin + 1)) | 0)
        : 1;

    const groupId = _nextGroup++;
    const leadHeading = pos.orbitAng + Math.PI / 2 + (Math.random() - 0.5) * 0.8;

    for (let i = 0; i < n; i++) {
      if (this.ships.length >= AMBIENT.MAX_SHIPS) break;
      const ox = (i - (n - 1) / 2) * 42;
      const oy = i * 28;
      const cos = Math.cos(leadHeading);
      const sin = Math.sin(leadHeading);
      const gx = pos.x + ox * cos - oy * sin;
      const gy = pos.y + ox * sin + oy * cos;
      if (this._isVisible(gx, gy, view)) continue;
      if (dist(gx, gy, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      const ship = this._makeShip(classId, role, gx, gy, leadHeading, groupId, false);
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
      if (this._isVisible(x, y, view)) continue;
      if (dist(x, y, px, py) < AMBIENT.PLAYER_CLEARANCE) continue;
      return { x, y, r: spawnR, orbitAng: ang };
    }
    return null;
  }

  _makeShip(classId, role, x, y, heading, groupId, isPolice) {
    let shipDef;
    if (isPolice) {
      const fighterId = Math.random() < 0.55 ? 'fighter' : 'lightFighter';
      shipDef = generateShip({
        classId: fighterId,
        theme: 'police',
        rng: Math.random,
      });
    } else if (role.deep) {
      shipDef = generateVisitor(classId);
    } else {
      shipDef = generateVisitor(classId in SHIP_CLASSES ? classId : 'generalist');
    }

    const thrusters = makeVisitorThrusters(shipDef);
    const speed = this._cruiseSpeed(role.behavior);
    const vx = Math.cos(heading) * speed;
    const vy = Math.sin(heading) * speed;

    const ship = {
      id: _nextId++,
      groupId,
      classId: isPolice ? 'police' : classId,
      behavior: role.behavior,
      isPolice: !!isPolice,
      shipDef,
      thrusters,
      x,
      y,
      angle: heading,
      vx,
      vy,
      angularVelocity: 0,
      age: 0,
      maxAge: this._lifetime(role.behavior),
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
    };
    setCruiseThrust(ship, 0.5);
    return ship;
  }

  _cruiseSpeed(behavior) {
    switch (behavior) {
      case 'flyby':
        return 520 + Math.random() * 180;
      case 'race':
        return 580 + Math.random() * 220;
      case 'patrol':
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
      case 'deepPatrol':
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
      case 'patrol':
        return 55 + Math.random() * 40;
      case 'deepCruise':
      case 'deepSurvey':
      case 'deepPatrol':
        return 70 + Math.random() * 50;
      default:
        return 40 + Math.random() * 35;
    }
  }

  _tickShip(ship, dt, env) {
    const { sx, sy, player, asteroids, peers, view, station, hangarBay } = env;
    ship.velocity.x = ship.vx;
    ship.velocity.y = ship.vy;

    if (
      ship.state === 'bayApproach' ||
      ship.state === 'bayIngress' ||
      ship.state === 'bayEgress' ||
      ship.state === 'bayHold'
    ) {
      this._tickBayMouth(ship, dt, station, hangarBay);
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      ship.velocity.x = ship.vx;
      ship.velocity.y = ship.vy;
      return;
    }

    if (ship.pendingCull || ship.state === 'leave') {
      if (view && this._isVisible(ship.x, ship.y, view)) {
        this._steerOffCamera(ship, view);
      } else {
        setCruiseThrust(ship, 0.8);
      }
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      ship.velocity.x = ship.vx;
      ship.velocity.y = ship.vy;
      return;
    }

    switch (ship.behavior) {
      case 'patrol':
      case 'police':
        this._tickPatrol(ship, dt, sx, sy, player, peers);
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
      case 'deepPatrol':
        this._tickDeep(ship, dt);
        break;
      default:
        this._tickLane(ship, dt, sx, sy);
        break;
    }

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    ship.velocity.x = ship.vx;
    ship.velocity.y = ship.vy;
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
      ship.thrusters.mainEngine = 1;
      ship.exitBurn = true;
      const nose = -Math.PI / 2;
      ship.angle = lerpAngle(ship.angle, nose, Math.min(1, 3 * dt));
      const burnSpd = 210;
      ship.vx = Math.cos(ship.angle) * burnSpd;
      ship.vy = Math.sin(ship.angle) * burnSpd;
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
        ship.angle = out;
        setCruiseThrust(ship, 0.75);
      }
      return;
    }

    if (ship.state === 'bayHold') {
      const greens = [];
      for (let i = 0; i < 3; i++) {
        if (station.padAvailable?.(i) && !hangarBay?.isPlayerBay?.(i)) {
          greens.push(i);
        }
      }
      const holdY = station.furthestApproachLightY() - 80;
      const tx = station.x + Math.sin(ship.stateT * 0.4) * 40;
      const desired = angleTo(tx - ship.x, holdY - ship.y);
      ship.angle = lerpAngle(ship.angle, desired, Math.min(1, 2 * dt));
      ship.vx = Math.cos(ship.angle) * 55;
      ship.vy = Math.sin(ship.angle) * 55;
      setCruiseThrust(ship, 0.25);
      if (greens.length) {
        ship.targetLane = greens[0];
        ship.state = 'bayApproach';
        ship.stateT = 0;
      }
      return;
    }

    const lane = ship.targetLane ?? 1;
    // Own runway reservation still counts as available for this hull
    if (!station.padAvailable?.(lane, pose) && ship.state !== 'bayIngress') {
      ship.state = 'bayHold';
      ship.stateT = 0;
      return;
    }

    const tx = station.laneCenterWorldX(lane);

    if (ship.state === 'bayApproach') {
      const noseIn = Math.PI / 2;
      const near =
        dist(ship.x, ship.y, tx, station.stripeWorldY()) <
        STATION.DOCK_RADIUS * 0.85;
      const aim = near
        ? noseIn
        : angleTo(tx - ship.x, station.furthestApproachLightY() + 60 - ship.y);
      ship.angle = lerpAngle(ship.angle, aim, Math.min(1, 2.2 * dt));
      const approachSpd = Math.min(STATION.DOCK_MAX_SPEED * 0.85, 95);
      ship.vx = Math.cos(ship.angle) * approachSpd;
      ship.vy = Math.sin(ship.angle) * approachSpd;
      setCruiseThrust(ship, 0.4);
      if (station.shouldAutoIngress(pose, approachSpd)) {
        ship.state = 'bayIngress';
        ship.stateT = 0;
      }
      return;
    }

    // bayIngress
    const noseIn = Math.PI / 2;
    ship.angle = lerpAngle(ship.angle, noseIn, Math.min(1, 3 * dt));
    ship.vx = (tx - ship.x) * 1.2;
    ship.vy = 70;
    setCruiseThrust(ship, 0.35);
    const underRoof = ship.y > station.stripeWorldY() + STATION.EXIT_NEST;
    if (underRoof || ship.stateT > 6) {
      const ok = hangarBay?.acceptSpaceArrival?.(lane, ship.shipDef, 'hauler');
      if (this._mouthBusyId === ship.id) this._mouthBusyId = null;
      if (ok) {
        ship.pendingCull = true;
        ship.state = 'leave';
      } else {
        ship.state = 'bayHold';
        ship.stateT = 0;
        ship.y = station.furthestApproachLightY() - 40;
        ship.vy = 0;
      }
    }
  }

  _tickPatrol(ship, dt, sx, sy, player, peers) {
    const ring = ROLE_BEHAVIOR[ship.classId]?.ring || stationRing(800, 1500);
    const targetR = (ring[0] + ring[1]) * 0.5;
    ship.orbitAngle += (ship.isPolice ? 0.18 : 0.12) * dt;
    const tx = sx + Math.cos(ship.orbitAngle) * targetR;
    const ty = sy + Math.sin(ship.orbitAngle) * targetR;
    const desired = angleTo(tx - ship.x, ty - ship.y);
    ship.angle = lerpAngle(ship.angle, desired, Math.min(1, 2.2 * dt));
    const spd = this._cruiseSpeed(ship.behavior) * 0.85;
    ship.vx = Math.cos(ship.angle) * spd;
    ship.vy = Math.sin(ship.angle) * spd;
    setCruiseThrust(ship, 0.45);

    if (ship.isPolice) {
      this._tickPoliceScan(ship, dt, player, peers);
    }
  }

  _tickPoliceScan(ship, dt, player, peers) {
    if (ship.state === 'scan') {
      ship.vx *= 0.92;
      ship.vy *= 0.92;
      clearThrusters(ship);
      ship.miningLaserFiring = true;
      ship.miningLaserBeamLength = 90;
      if (ship.scanTarget) {
        const tx =
          ship.scanTarget === 'player' ? player.position.x : ship.scanTarget.x;
        const ty =
          ship.scanTarget === 'player' ? player.position.y : ship.scanTarget.y;
        const a = angleTo(tx - ship.x, ty - ship.y);
        ship.angle = lerpAngle(ship.angle, a, Math.min(1, 3 * dt));
        ship.miningLaserRelAngle = 0;
      }
      if (ship.stateT > 2.4 + Math.random() * 0.8) {
        ship.state = 'patrol';
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

  _tickFlyby(ship) {
    setCruiseThrust(ship, ship.behavior === 'race' ? 1.1 : 0.85);
  }

  _tickMine(ship, dt, asteroids, sx, sy) {
    if (ship.state === 'leave') {
      setCruiseThrust(ship, 0.7);
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
      const a = angleTo(ax - ship.x, ay - ship.y);
      ship.angle = lerpAngle(ship.angle, a, Math.min(1, 2 * dt));
      const spd = 110;
      ship.vx = Math.cos(ship.angle) * spd;
      ship.vy = Math.sin(ship.angle) * spd;
      setCruiseThrust(ship, 0.5);
      ship.miningLaserFiring = false;
      if (d < orbitR + 40) {
        ship.state = 'mine';
        ship.stateT = 0;
        ship.orbitAngle = Math.atan2(ship.y - ay, ship.x - ax);
      }
    } else if (ship.state === 'mine') {
      ship.orbitAngle += 0.55 * dt;
      const tx = ax + Math.cos(ship.orbitAngle) * orbitR;
      const ty = ay + Math.sin(ship.orbitAngle) * orbitR;
      const a = angleTo(tx - ship.x, ty - ship.y);
      ship.angle = lerpAngle(ship.angle, a, Math.min(1, 2.5 * dt));
      ship.vx = Math.cos(ship.angle) * 55;
      ship.vy = Math.sin(ship.angle) * 55;
      clearThrusters(ship);
      ship.thrusters.mainEngine = 0.25;
      ship.miningLaserFiring = true;
      ship.miningLaserRelAngle = angleTo(ax - ship.x, ay - ship.y) - ship.angle;
      ship.miningLaserBeamLength = Math.min(SHIP.MINING_LASER_RANGE, d);
      if (ship.stateT > 8 + Math.random() * 6) {
        ship.state = 'leave';
        ship.pendingCull = true;
        ship.stateT = 0;
        ship.miningLaserFiring = false;
        const out = angleTo(ship.x - sx, ship.y - sy);
        ship.angle = out;
        const spd = 200;
        ship.vx = Math.cos(out) * spd;
        ship.vy = Math.sin(out) * spd;
        setCruiseThrust(ship, 0.75);
      }
    }
  }

  _tickSurvey(ship, dt, asteroids) {
    if (ship.stateT < 6) {
      this._tickFlyby(ship);
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
      ship.angle = lerpAngle(ship.angle, a, Math.min(1, 2 * dt));
      ship.vx *= 0.95;
      ship.vy *= 0.95;
      ship.miningLaserFiring = ship.stateT % 4 < 1.5;
      ship.miningLaserBeamLength = 70;
    } else {
      setCruiseThrust(ship, 0.4);
    }
  }

  _tickLane(ship, dt, sx, sy) {
    const tang = angleTo(ship.x - sx, ship.y - sy) + Math.PI / 2;
    ship.angle = lerpAngle(ship.angle, tang, Math.min(1, 1.2 * dt));
    const spd = this._cruiseSpeed(ship.behavior);
    ship.vx = Math.cos(ship.angle) * spd;
    ship.vy = Math.sin(ship.angle) * spd;
    setCruiseThrust(ship, 0.5);
  }

  _tickDeep(ship, dt) {
    setCruiseThrust(ship, 0.55);
    ship.angle += Math.sin(ship.age * 0.15) * 0.05 * dt;
    const spd = Math.hypot(ship.vx, ship.vy) || this._cruiseSpeed(ship.behavior);
    ship.vx = Math.cos(ship.angle) * spd;
    ship.vy = Math.sin(ship.angle) * spd;
  }

  /**
   * Cull only when off-screen. Age / distance alone never removes a visible ship.
   */
  _shouldCull(ship, px, py, sx, sy, view) {
    const visible = this._isVisible(ship.x, ship.y, view);
    if (visible) return false;

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
