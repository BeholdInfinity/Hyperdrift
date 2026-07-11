/**
 * Home Base hangar: docked bay, logistics, and reacting NPCs.
 * Seed for new-game start + between-mission hub. Player on B2 (center).
 * +Y = south, −Y = north (bay doors to space).
 *
 * Cargo hardpoints: 3×4 grid. Forklifts use the south row; crane has full-deck
 * bridge travel. Mechanics ferry mid-row piles ↔ assigned ships via stairs.
 */

import { HANGAR, SHIP } from '../core/Constants.js';
import { SHIP_EXTENT } from '../entities/ShipHardpoints.js';
import { drawVisitorShip, pickVisitorId } from './HangarVisitorShips.js';

const BAY = {
  HALF_W: 340,
  HALF_H: 200,
  PAD_R: 38,
  SIDE_PAD_X: HANGAR.SIDE_PAD_X,
  DOOR_HALF: 52,
  DOOR_H: 42,
  VIEWPORT_W: 96,
  VIEWPORT_H: 22,
  /** South apron — forklift corridor */
  PATH_Y: 148,
  BULK_DOOR_HALF: 32,
  BULK_THICK: 16,
  RUNWAY_INSET: 26,
};

const ROW = { N: 0, M: 1, S: 2 };
const COL_X = [
  -BAY.SIDE_PAD_X - 120,
  -BAY.SIDE_PAD_X / 2,
  BAY.SIDE_PAD_X / 2,
  BAY.SIDE_PAD_X + 120,
];
/** North (doors), mid (docks), south (forklift share) */
const ROW_Y = [-78, 8, 118];
/** Under-deck stair hatches — one per column, between mid and south cargo rows */
const STAIR_Y = (ROW_Y[1] + ROW_Y[2]) / 2;
const STAIRS = COL_X.map((x, col) => ({ x, y: STAIR_Y, col }));

const BRIDGE_Y_MIN = -BAY.HALF_H + 55;
const BRIDGE_Y_MAX = BAY.HALF_H - 36;
const RUNWAY_X = [-BAY.HALF_W + BAY.RUNWAY_INSET, BAY.HALF_W - BAY.RUNWAY_INSET];
const HOIST_RAISED = 0;
const HOIST_MAX = 42;
/** Trolley parks this far north of the pile; hoist drops south to the cargo */
const TROLLEY_NORTH = 52;
/** Claw: 1 = open empty, ~0.35 = gripped around cargo */
const CLAW_OPEN = 1;
const CLAW_GRIP = 0.35;
const CLAW_PALM = 5;
const CLAW_FINGER = 11;

const CARGO_MIN = 10;
const CARGO_MAX = 26;
const PILE_CAP = 5;

const CARGO_KINDS = [
  { label: 'CRATE', w: 10, h: 8, color: '#6a5a3a', hp: 30 },
  { label: 'CRATE', w: 10, h: 8, color: '#3a7a4a', hp: 30 },
  { label: 'BARREL', w: 7, h: 7, color: '#4a6a4a', hp: 25 },
  { label: 'PANEL', w: 12, h: 5, color: '#5a7088', hp: 20 },
  { label: 'COIL', w: 8, h: 8, color: '#8a6a40', hp: 28 },
  { label: 'ANTENNA', w: 4, h: 14, color: '#708898', hp: 18 },
  { label: 'TANK', w: 9, h: 9, color: '#3a5a6a', hp: 35 },
  { label: 'AMMO', w: 8, h: 6, color: '#8a5050', hp: 22 },
  { label: 'INGOT', w: 9, h: 5, color: '#8a8a70', hp: 40 },
];

let _cargoSeq = 1;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function padCenters() {
  return [-BAY.SIDE_PAD_X, 0, BAY.SIDE_PAD_X];
}

function bayLabels() {
  return ['B1', 'B2', 'B3'];
}

function thrusterActivity(ship) {
  if (!ship?.thrusters) return { maneuver: 0, engine: 0 };
  const t = ship.thrusters;
  let maneuver = 0;
  for (const k of [
    'aftPort', 'aftStarboard', 'nosePort', 'noseStarboard',
    'portFore', 'portAft', 'starboardFore', 'starboardAft',
  ]) {
    maneuver = Math.max(maneuver, t[k] || 0);
  }
  const engine = Math.max(t.mainEngine || 0, t.afterburner || 0);
  return { maneuver, engine };
}

function rollSidePad(x, bayId) {
  const occupied = Math.random() < 0.7;
  return {
    x,
    bayId,
    visitorId: occupied ? pickVisitorId() : null,
  };
}

function makeCargo(kind = null) {
  const k = kind ? { ...kind } : { ...pick(CARGO_KINDS) };
  return {
    id: _cargoSeq++,
    label: k.label,
    w: k.w,
    h: k.h,
    color: k.color,
    hp: k.hp,
    maxHp: k.hp,
  };
}

function pileId(row, col) {
  return `r${row}c${col}`;
}

/** Build 3×4 hardpoint grid. */
function buildPileHardpoints() {
  const piles = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      piles.push({
        id: pileId(row, col),
        row,
        col,
        x: COL_X[col],
        y: ROW_Y[row],
        items: [],
      });
    }
  }
  return piles;
}

export class HangarBay {
  constructor() {
    this.time = 0;
    this.npcs = [];
    this._spawnTimer = 0.5;
    this._sparkle = [];
    this._debris = [];
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    this.sidePads = [];
    this.piles = [];
    this._shipPos = { x: 0, y: 0 };
    this._shipAngle = SHIP.SPAWN_ANGLE;
    this.crane = null;
    this._pressure = 0; // <0 need more cargo, >0 need less
  }

  reset() {
    this.time = 0;
    this.npcs = [];
    this._spawnTimer = 0.4;
    this._sparkle = [];
    this._debris = [];
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    this.sidePads = [
      rollSidePad(-BAY.SIDE_PAD_X, 'B1'),
      rollSidePad(BAY.SIDE_PAD_X, 'B3'),
    ];
    this.piles = buildPileHardpoints();
    this._seedCargo();
    this._resetCrane();
    this._spawnMechanic();
    this._spawnMechanic();
    this._spawnForklift(Math.random() < 0.5 ? -1 : 1);
  }

  _seedCargo() {
    const target = 12 + ((Math.random() * 8) | 0);
    let n = 0;
    const order = [...this.piles].sort(() => Math.random() - 0.5);
    for (const pile of order) {
      if (n >= target) break;
      const count = 1 + ((Math.random() * 3) | 0);
      for (let i = 0; i < count && n < target; i++) {
        pile.items.push(makeCargo());
        n++;
      }
    }
  }

  _pileById(id) {
    return this.piles.find((p) => p.id === id) || null;
  }

  _pilesInRow(row) {
    return this.piles.filter((p) => p.row === row);
  }

  _cargoCount() {
    let n = 0;
    for (const p of this.piles) n += p.items.length;
    for (const npc of this.npcs) {
      if (npc.cargo) n++;
    }
    if (this.crane?.carried) n++;
    return n;
  }

  _updatePressure() {
    const n = this._cargoCount();
    if (n < CARGO_MIN) this._pressure = -1;
    else if (n > CARGO_MAX) this._pressure = 1;
    else this._pressure = 0;
  }

  _pickCraneJob() {
    const withCargo = this.piles.filter((p) => p.items.length > 0);
    const withRoom = this.piles.filter((p) => p.items.length < PILE_CAP);
    if (!withCargo.length) {
      const a = pick(this.piles);
      return { pickup: a, dropoff: a };
    }

    let pickup = pick(withCargo);
    let dropoff = null;

    if (this._pressure > 0) {
      // Move toward south edge cols for forklift export
      const exporters = withRoom.filter(
        (p) => p.row === ROW.S && (p.col === 0 || p.col === 3) && p.id !== pickup.id
      );
      dropoff = exporters.length
        ? pick(exporters)
        : pick(withRoom.filter((p) => p.id !== pickup.id));
    } else if (this._pressure < 0) {
      // Spread inland / mid when short
      const interiors = withRoom.filter(
        (p) => (p.row === ROW.M || p.row === ROW.N) && p.id !== pickup.id
      );
      dropoff = interiors.length
        ? pick(interiors)
        : pick(withRoom.filter((p) => p.id !== pickup.id));
    } else {
      dropoff = pick(withRoom.filter((p) => p.id !== pickup.id));
    }

    if (!dropoff) dropoff = pickup;
    return { pickup, dropoff };
  }

  _resetCrane() {
    const job = this._pickCraneJob();
    this.crane = {
      trolleyX: job.pickup.x,
      bridgeY: job.pickup.y - TROLLEY_NORTH,
      hoist: HOIST_RAISED,
      hookTargetY: null,
      carried: null,
      claw: CLAW_OPEN,
      levers: { travel: 0, hoist: 0, grip: 0 },
      operator: {
        suit: pick(['#3a6a8a', '#5a6a4a', '#6a5a48', '#4a5a6a']),
        helmet: pick(['#c8d0d8', '#b0a890', '#d0c8b8']),
      },
      phase: 'travelPickup',
      pickup: job.pickup,
      dropoff: job.dropoff,
      pause: 0.5,
      _prevTX: job.pickup.x,
      _prevBY: job.pickup.y - TROLLEY_NORTH,
      _prevHoist: HOIST_RAISED,
    };
  }

  /**
   * @param {number} deltaTime
   * @param {object} ship
   * @param {{ firedTurret?: boolean, laserOn?: boolean }} weapons
   */
  update(deltaTime, ship, weapons = {}) {
    this.time += deltaTime;

    if (ship?.position) {
      this._shipPos.x = ship.position.x;
      this._shipPos.y = ship.position.y;
    }

    const act = thrusterActivity(ship);
    const weaponPulse =
      (weapons.firedTurret ? 1 : 0) + (weapons.laserOn ? 0.55 : 0);
    this._hazard.maneuver = act.maneuver;
    this._hazard.engine = act.engine;
    this._hazard.weapons = Math.max(
      this._hazard.weapons * Math.exp(-deltaTime * 3.5),
      weaponPulse
    );
    this._shipAngle = ship?.angle ?? SHIP.SPAWN_ANGLE;

    this._updatePressure();
    this._updateCrane(deltaTime);

    this._spawnTimer -= deltaTime;
    if (this._spawnTimer <= 0 && this.npcs.length < 6) {
      const forks = this.npcs.filter((n) => n.kind === 'forklift').length;
      const mechs = this.npcs.filter((n) => n.kind === 'mechanic').length;
      // Mechanics first: cargo pressure used to starve pedestrians by always
      // preferring forklifts whenever forks < 2 and pressure ≠ 0.
      if (mechs < 2) {
        this._spawnMechanic();
      } else if (forks < 2 && (this._pressure !== 0 || Math.random() < 0.4)) {
        this._spawnForklift(Math.random() < 0.5 ? -1 : 1);
      } else if (mechs < 3) {
        this._spawnMechanic();
      } else if (forks < 2) {
        this._spawnForklift(Math.random() < 0.5 ? -1 : 1);
      }
      this._spawnTimer = mechs < 2 ? rand(0.8, 1.6) : rand(1.6, 3.5);
    }

    const hazardLevel =
      this._hazard.maneuver * 0.55 +
      this._hazard.engine * 1.1 +
      this._hazard.weapons * 1.35;

    for (const npc of this.npcs) {
      if (npc.kind === 'mechanic') this._updateMechanic(npc, deltaTime, hazardLevel);
      else this._updateForklift(npc, deltaTime, hazardLevel);
    }
    this.npcs = this.npcs.filter((n) => n.alive);

    if (act.engine > 0.2 && Math.random() < act.engine * 0.4) {
      const a = this._shipAngle + Math.PI;
      this._sparkle.push({
        x: this._shipPos.x + Math.cos(a) * rand(14, 24) + rand(-6, 6),
        y: this._shipPos.y + Math.sin(a) * rand(14, 24) + rand(-6, 6),
        life: rand(0.25, 0.55),
        max: 0.55,
        r: rand(1, 2.5),
      });
    }
    for (const s of this._sparkle) s.life -= deltaTime;
    this._sparkle = this._sparkle.filter((s) => s.life > 0);
    for (const d of this._debris) {
      d.life -= deltaTime;
      d.x += d.vx * deltaTime;
      d.y += d.vy * deltaTime;
    }
    this._debris = this._debris.filter((d) => d.life > 0);
  }

  /**
   * Turret bolts + mining laser vs real cargo (piles, carriers, crane).
   * @returns {{ hits: number }}
   */
  applyWeaponHits(ship, projectiles, deltaTime) {
    let hits = 0;
    const targets = this._cargoHitTargets();

    for (const proj of projectiles) {
      if (!proj.active) continue;
      for (const t of targets) {
        const dx = proj.position.x - t.x;
        const dy = proj.position.y - t.y;
        const r = Math.max(t.cargo.w, t.cargo.h) * 0.55 + proj.radius;
        if (dx * dx + dy * dy < r * r) {
          if (this._damageCargo(t, proj.damage)) hits++;
          proj.destroy();
          break;
        }
      }
    }

    if (ship?.miningLaserFiring) {
      const origin = ship.getMiningLaserOrigin();
      const angle = ship.getMiningLaserWorldAngle();
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const range = SHIP.MINING_LASER_RANGE;
      const dmg = SHIP.MINING_LASER_DPS * deltaTime;
      let closest = null;
      let closestDist = range;

      for (const t of this._cargoHitTargets()) {
        const hit = this._rayCircle(
          origin.x, origin.y, dx, dy, range,
          t.x, t.y, Math.max(t.cargo.w, t.cargo.h) * 0.55
        );
        if (hit !== null && hit < closestDist) {
          closestDist = hit;
          closest = t;
        }
      }
      if (closest) {
        ship.miningLaserBeamLength = Math.min(
          ship.miningLaserBeamLength ?? range,
          closestDist
        );
        if (this._damageCargo(closest, dmg)) hits++;
      }
    }

    return { hits };
  }

  _cargoHitTargets() {
    const out = [];
    for (const pile of this.piles) {
      pile.items.forEach((cargo, i) => {
        const pos = this._itemWorldPos(pile, i);
        out.push({ cargo, pile, index: i, x: pos.x, y: pos.y, kind: 'pile' });
      });
    }
    if (this.crane?.carried) {
      const hook = this._craneCargoDrawPos();
      out.push({
        cargo: this.crane.carried,
        x: hook.x,
        y: hook.y,
        kind: 'crane',
      });
    }
    for (const npc of this.npcs) {
      if (!npc.cargo) continue;
      out.push({
        cargo: npc.cargo,
        npc,
        x: npc.x + (npc.facing > 0 ? 12 : -12),
        y: npc.y - 6,
        kind: 'npc',
      });
    }
    return out;
  }

  _itemWorldPos(pile, index) {
    return {
      x: pile.x - 8 + (index % 2) * 3,
      y: pile.y + 6 - index * 7,
    };
  }

  _damageCargo(target, amount) {
    target.cargo.hp -= amount;
    if (target.cargo.hp > 0) return false;

    const x = target.x;
    const y = target.y;
    this._burstCargo(x, y, target.cargo.color);

    if (target.kind === 'pile' && target.pile) {
      const idx = target.pile.items.indexOf(target.cargo);
      if (idx >= 0) target.pile.items.splice(idx, 1);
    } else if (target.kind === 'crane' && this.crane) {
      this.crane.carried = null;
      this.crane.phase = 'raiseDropoff';
      this.crane.pause = 0.2;
    } else if (target.kind === 'npc' && target.npc) {
      target.npc.cargo = null;
      if (target.npc.kind === 'forklift' && target.npc.job === 'takeOut') {
        target.npc.job = 'leave';
        target.npc.state = 'toDoor';
      }
    }
    return true;
  }

  _burstCargo(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(20, 90);
      this._debris.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.3, 0.7),
        max: 0.7,
        r: rand(1, 3),
        color,
      });
    }
  }

  _rayCircle(ox, oy, dx, dy, maxDist, cx, cy, radius) {
    const fx = ox - cx;
    const fy = oy - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    const t1 = (-b - sqrt) / (2 * a);
    const t2 = (-b + sqrt) / (2 * a);
    let t = Infinity;
    if (t1 >= 0) t = Math.min(t, t1);
    if (t2 >= 0) t = Math.min(t, t2);
    if (t === Infinity || t > maxDist) return null;
    return t;
  }

  _clampBridgeY(y) {
    return Math.max(BRIDGE_Y_MIN, Math.min(BRIDGE_Y_MAX, y));
  }

  _clampTrolleyX(x) {
    return Math.max(RUNWAY_X[0] + 8, Math.min(RUNWAY_X[1] - 8, x));
  }

  _moveCraneXY(c, tx, ty, speed, dt) {
    const dx = tx - c.trolleyX;
    const dy = ty - c.bridgeY;
    const dist = Math.hypot(dx, dy);
    if (dist < 2.5) {
      c.trolleyX = tx;
      c.bridgeY = ty;
      return true;
    }
    const step = speed * dt;
    if (step >= dist) {
      c.trolleyX = tx;
      c.bridgeY = ty;
      return true;
    }
    c.trolleyX += (dx / dist) * step;
    c.bridgeY += (dy / dist) * step;
    return false;
  }

  _craneParkXY(pile) {
    return {
      x: this._clampTrolleyX(pile.x),
      y: this._clampBridgeY(pile.y - TROLLEY_NORTH),
    };
  }

  /** World position of the hoist hook (south of trolley toward the pile). */
  _craneHookPos() {
    const c = this.crane;
    if (!c) return { x: 0, y: 0 };
    const raisedY = c.bridgeY + 5;
    const targetY = c.hookTargetY ?? raisedY;
    const t = Math.min(1, Math.max(0, c.hoist / HOIST_MAX));
    return {
      x: c.trolleyX,
      y: raisedY + (targetY - raisedY) * t,
    };
  }

  /** Top-center of a carried box (top edge just above fingertip line). */
  _craneCargoDrawPos() {
    const hook = this._craneHookPos();
    const box = this.crane?.carried;
    if (!box) return { ...hook, top: hook.y + CLAW_FINGER - 1 };
    const top = hook.y + CLAW_FINGER - 1;
    return {
      x: hook.x,
      y: top + box.h / 2,
      top,
    };
  }

  _updateCraneClaw(dt) {
    const c = this.crane;
    if (!c) return;
    // Open while empty; partial close while holding cargo (including lower-to-drop)
    const target = c.carried ? CLAW_GRIP : CLAW_OPEN;
    const rate = c.carried ? 10 : 7;
    c.claw += (target - (c.claw ?? CLAW_OPEN)) * Math.min(1, dt * rate);
  }

  /** Cab levers track travel / hoist / grip so the bay reads as manned, not automated. */
  _updateCraneLevers(dt) {
    const c = this.crane;
    if (!c) return;
    if (!c.levers) c.levers = { travel: 0, hoist: 0, grip: 0 };

    const dx = c.trolleyX - (c._prevTX ?? c.trolleyX);
    const dy = c.bridgeY - (c._prevBY ?? c.bridgeY);
    const dh = c.hoist - (c._prevHoist ?? c.hoist);
    c._prevTX = c.trolleyX;
    c._prevBY = c.bridgeY;
    c._prevHoist = c.hoist;

    let travelT = 0;
    let hoistT = 0;
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      travelT = Math.max(-1, Math.min(1, (dx + dy) * 0.35));
    } else if (
      c.phase === 'travelPickup' ||
      c.phase === 'travelDropoff'
    ) {
      travelT = Math.sin(this.time * 6) * 0.08;
    }
    if (Math.abs(dh) > 0.05) {
      hoistT = Math.max(-1, Math.min(1, dh * 0.12));
    } else if (c.phase === 'lowerPickup' || c.phase === 'lowerDropoff') {
      hoistT = 0.85;
    } else if (c.phase === 'raisePickup' || c.phase === 'raiseDropoff') {
      hoistT = -0.85;
    }

    const gripT = 1 - (c.claw ?? CLAW_OPEN);
    const k = Math.min(1, dt * 9);
    c.levers.travel += (travelT - c.levers.travel) * k;
    c.levers.hoist += (hoistT - c.levers.hoist) * k;
    c.levers.grip += (gripT - c.levers.grip) * k;
  }

  _updateCrane(dt) {
    const c = this.crane;
    if (!c) return;
    const moveSpeed = 88;
    const hoistSpeed = 50;
    const near = (a, b, eps = 2.5) => Math.abs(a - b) < eps;

    this._updateCraneClaw(dt);
    this._updateCraneLevers(dt);

    if (c.pause > 0) {
      c.pause -= dt;
      return;
    }

    c.pickup = this._pileById(c.pickup.id) || c.pickup;
    c.dropoff = this._pileById(c.dropoff.id) || c.dropoff;

    switch (c.phase) {
      case 'travelPickup': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hoist = HOIST_RAISED;
        c.hookTargetY = null;
        const t = this._craneParkXY(c.pickup);
        if (this._moveCraneXY(c, t.x, t.y, moveSpeed, dt)) {
          c.hookTargetY = c.pickup.y;
          c.phase = 'lowerPickup';
        }
        break;
      }
      case 'lowerPickup': {
        c.hookTargetY = c.pickup.y;
        c.hoist = Math.min(c.hoist + hoistSpeed * dt, HOIST_MAX);
        if (near(c.hoist, HOIST_MAX, 2)) {
          c.hoist = HOIST_MAX;
          if (c.pickup.items.length > 0) {
            c.carried = c.pickup.items.pop();
            c.pause = 0.28;
            c.phase = 'raisePickup';
          } else {
            const job = this._pickCraneJob();
            c.pickup = job.pickup;
            c.dropoff = job.dropoff;
            c.phase = 'raiseDropoff';
            c.pause = 0.15;
          }
        }
        break;
      }
      case 'raisePickup': {
        c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
        if (near(c.hoist, HOIST_RAISED, 2)) {
          c.hoist = HOIST_RAISED;
          c.hookTargetY = null;
          c.phase = 'travelDropoff';
        }
        break;
      }
      case 'travelDropoff': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hookTargetY = null;
        const t = this._craneParkXY(c.dropoff);
        if (this._moveCraneXY(c, t.x, t.y, moveSpeed, dt)) {
          c.hookTargetY = c.dropoff.y;
          c.phase = 'lowerDropoff';
        }
        break;
      }
      case 'lowerDropoff': {
        c.hookTargetY = c.dropoff.y;
        c.hoist = Math.min(c.hoist + hoistSpeed * dt, HOIST_MAX);
        if (near(c.hoist, HOIST_MAX, 2)) {
          c.hoist = HOIST_MAX;
          if (c.carried && c.dropoff.items.length < PILE_CAP) {
            c.dropoff.items.push(c.carried);
            c.carried = null;
          } else if (c.carried) {
            const room = this.piles.find(
              (p) => p.id !== c.dropoff.id && p.items.length < PILE_CAP
            );
            if (room) {
              c.dropoff = room;
              c.phase = 'raisePickup';
              c.pause = 0.12;
              break;
            }
            if (c.pickup.items.length < PILE_CAP) {
              c.pickup.items.push(c.carried);
              c.carried = null;
            }
          }
          c.pause = 0.3;
          c.phase = 'raiseDropoff';
        }
        break;
      }
      case 'raiseDropoff': {
        c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
        if (near(c.hoist, HOIST_RAISED, 2)) {
          c.hoist = HOIST_RAISED;
          c.hookTargetY = null;
          const job = this._pickCraneJob();
          c.pickup = job.pickup;
          c.dropoff = job.dropoff;
          c.pause = 0.4;
          c.phase = 'travelPickup';
        }
        break;
      }
      default:
        c.phase = 'travelPickup';
    }
  }

  _assignMechanicRoute(npc) {
    const pads = this._dockTargets();
    if (!pads.length) return false;
    npc.targetPad = pick(pads);
    const r = Math.random();
    if (r < 0.3) npc.job = 'weld';
    else if (r < 0.65) npc.job = 'loadShip';
    else npc.job = 'unloadShip';
    npc.tripsLeft = npc.job === 'weld'
      ? 2 + ((Math.random() * 2) | 0)
      : 2 + ((Math.random() * 3) | 0);
    npc.hullTarget = null;

    if (npc.job === 'weld') {
      npc.targetPile = null;
      return true;
    }

    const nearby = this._nearbyMidPiles(npc.targetPad.x);
    if (npc.job === 'loadShip') {
      npc.targetPile = nearby.find((p) => p.items.length > 0) || nearby[0] || null;
      if (!npc.targetPile || !npc.targetPile.items.length) {
        npc.job = 'unloadShip';
      }
    }
    if (npc.job === 'unloadShip') {
      npc.targetPile =
        nearby.find((p) => p.items.length < PILE_CAP) || nearby[0] || null;
    }
    return !!(npc.targetPad && npc.targetPile);
  }

  _nearbyMidPiles(padX) {
    return this._pilesInRow(ROW.M)
      .slice()
      .sort((a, b) => Math.abs(a.x - padX) - Math.abs(b.x - padX));
  }

  /** Stairs only — bulkhead doors are forklift logistics. */
  _spawnMechanic() {
    const stair = pick(STAIRS);
    const side = Math.random() < 0.5 ? -1 : 1;

    const npc = {
      kind: 'mechanic',
      alive: true,
      x: stair.x,
      y: stair.y,
      vx: 0,
      facing: stair.x < 0 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
      state: 'emerge',
      stateT: 0.55,
      side,
      entry: 'stairs',
      exit: 'stairs',
      stair,
      exitStair: stair,
      cargo: null,
      targetPile: null,
      targetPad: null,
      job: 'loadShip',
      tripsLeft: 2,
      emergeT: 0,
      exitArmed: false,
      suit: pick(['#3a6a8a', '#4a7a6a', '#6a5a4a', '#5a5a7a']),
      helmet: pick(['#c8d0d8', '#a8b8c8', '#d0c8b0']),
    };

    if (!this._assignMechanicRoute(npc)) {
      // Always keep a weld fallback so spawns don't silently vanish
      const pads = this._dockTargets();
      if (!pads.length) return;
      npc.job = 'weld';
      npc.targetPad = pads[0];
      npc.targetPile = null;
      npc.tripsLeft = 2;
      npc.hullTarget = null;
    }
    npc.exitStair = this._nearestStair(npc.targetPad.x);
    this.npcs.push(npc);
  }

  _nearestStair(x) {
    return STAIRS.slice().sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  }

  _spawnForklift(side = 1) {
    const doorX = side < 0 ? -BAY.HALF_W : BAY.HALF_W;
    let job = 'bringIn';
    if (this._pressure > 0) job = 'takeOut';
    else if (this._pressure < 0) job = 'bringIn';
    else job = Math.random() < 0.5 ? 'bringIn' : 'takeOut';

    this.npcs.push({
      kind: 'forklift',
      alive: true,
      x: doorX + side * 50,
      y: BAY.PATH_Y + rand(-6, 6),
      vx: 0,
      facing: -side,
      phase: Math.random() * Math.PI * 2,
      state: 'enter',
      stateT: 0,
      side,
      job,
      cargo: job === 'bringIn' ? makeCargo() : null,
      targetPile: null,
      body: pick(['#c87830', '#b86028', '#d08840']),
    });
  }

  _doorX(side) {
    return side < 0 ? -BAY.HALF_W : BAY.HALF_W;
  }

  _insideX(side) {
    return side < 0 ? -BAY.HALF_W + 28 : BAY.HALF_W - 28;
  }

  _moveToward(npc, tx, ty, speed, dt) {
    const dx = tx - npc.x;
    const dy = ty - npc.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      npc.x = tx;
      npc.y = ty;
      return true;
    }
    const step = speed * dt;
    if (step >= dist) {
      npc.x = tx;
      npc.y = ty;
      return true;
    }
    npc.x += (dx / dist) * step;
    npc.y += (dy / dist) * step;
    npc.facing = Math.sign(dx) || npc.facing;
    return false;
  }

  _pickSouthPileForFork(wantCargo) {
    const south = this._pilesInRow(ROW.S);
    if (wantCargo) {
      const full = south.filter((p) => p.items.length > 0);
      // Prefer edge cols when exporting
      if (this._pressure > 0) {
        const edge = full.filter((p) => p.col === 0 || p.col === 3);
        if (edge.length) return pick(edge);
      }
      return full.length ? pick(full) : null;
    }
    const room = south.filter((p) => p.items.length < PILE_CAP);
    if (this._pressure < 0) {
      const mid = room.filter((p) => p.col === 1 || p.col === 2);
      if (mid.length) return pick(mid);
    }
    // Prefer near entry side
    return room.length ? pick(room) : null;
  }

  _pickMidPile(wantCargo) {
    const mid = this._pilesInRow(ROW.M);
    if (wantCargo) {
      const full = mid.filter((p) => p.items.length > 0);
      return full.length ? pick(full) : null;
    }
    const room = mid.filter((p) => p.items.length < PILE_CAP);
    return room.length ? pick(room) : null;
  }

  _dockTargets() {
    const pads = [{ x: 0, y: 0, bayId: 'B2', occupied: true }];
    for (const p of this.sidePads) {
      pads.push({ x: p.x, y: 0, bayId: p.bayId, occupied: !!p.visitorId });
    }
    return pads.filter((p) => p.occupied);
  }

  _updateForklift(npc, dt, hazard) {
    npc.phase += dt * 8;
    npc.stateT -= dt;

    if (npc.state === 'flinch') {
      npc.x += Math.sin(npc.phase * 2) * 10 * dt;
      if (npc.stateT <= 0) npc.state = npc.resumeState || 'toPile';
      return;
    }
    if (npc.state === 'flee') {
      const doorX = this._doorX(npc.side);
      if (this._moveToward(npc, doorX + npc.side * 60, BAY.PATH_Y, 70, dt)) {
        npc.alive = false;
      }
      return;
    }

    // Hazard near player pad
    if (
      (npc.state === 'toPile' || npc.state === 'work') &&
      hazard > 0.4 &&
      Math.hypot(npc.x - this._shipPos.x, npc.y - this._shipPos.y) < 90 &&
      Math.random() < hazard * 0.06
    ) {
      npc.resumeState = npc.state;
      npc.state = hazard > 0.95 ? 'flee' : 'flinch';
      npc.stateT = hazard > 0.95 ? rand(0.8, 1.3) : rand(0.3, 0.55);
      return;
    }

    switch (npc.state) {
      case 'enter': {
        const ix = this._insideX(npc.side);
        if (this._moveToward(npc, ix, BAY.PATH_Y, 40, dt)) {
          npc.targetPile = this._pickSouthPileForFork(npc.job === 'takeOut');
          if (!npc.targetPile) {
            // Can't do job — leave
            if (npc.job === 'bringIn' && npc.cargo) {
              // Still try any room
              npc.targetPile = this._pickSouthPileForFork(false);
            }
            if (!npc.targetPile) {
              npc.state = 'toDoor';
              break;
            }
          }
          npc.state = 'toPile';
        }
        break;
      }
      case 'toPile': {
        const p = npc.targetPile;
        if (!p) {
          npc.state = 'toDoor';
          break;
        }
        const tx = p.x;
        const ty = Math.max(p.y + 22, BAY.PATH_Y - 10);
        if (this._moveToward(npc, tx, ty, 38, dt)) {
          npc.state = 'work';
          npc.stateT = 0.55;
        }
        break;
      }
      case 'work': {
        if (npc.stateT > 0) break;
        const p = this._pileById(npc.targetPile?.id);
        if (npc.job === 'bringIn' && npc.cargo && p && p.items.length < PILE_CAP) {
          p.items.push(npc.cargo);
          npc.cargo = null;
        } else if (npc.job === 'takeOut' && !npc.cargo && p && p.items.length > 0) {
          npc.cargo = p.items.pop();
        }
        npc.state = 'toDoor';
        break;
      }
      case 'toDoor': {
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX, BAY.PATH_Y, 40, dt)) {
          npc.state = 'exit';
        }
        break;
      }
      case 'exit': {
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX + npc.side * 55, BAY.PATH_Y, 42, dt)) {
          npc.alive = false;
        }
        break;
      }
      default:
        npc.state = 'toDoor';
    }

    // Soft keep-out from pads
    const pushed = this._padKeepOut(npc.x, npc.y);
    if (pushed && npc.state !== 'flee') {
      npc.x = pushed.x;
      npc.y = Math.max(pushed.y, BAY.PATH_Y - 40);
    }
  }

  _shipLocalToWorld(padX, padY, lx, ly) {
    const a = SHIP.SPAWN_ANGLE;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      x: padX + lx * cos - ly * sin,
      y: padY + lx * sin + ly * cos,
    };
  }

  /**
   * Walk straight up to the hull (not a fixed apron point).
   * Cargo jobs prefer the aft; weld picks a hull station.
   */
  _shipHullApproach(pad, mode) {
    let lx;
    let ly;
    if (mode === 'weld') {
      const station = pick(['aft', 'aftPort', 'aftStbd', 'port', 'stbd', 'forePort']);
      switch (station) {
        case 'aft':
          lx = -SHIP_EXTENT.LENGTH * 0.42;
          ly = rand(-6, 6);
          break;
        case 'aftPort':
          lx = -SHIP_EXTENT.LENGTH * 0.32;
          ly = -SHIP_EXTENT.BEAM * 0.38;
          break;
        case 'aftStbd':
          lx = -SHIP_EXTENT.LENGTH * 0.32;
          ly = SHIP_EXTENT.BEAM * 0.38;
          break;
        case 'port':
          lx = rand(-6, 10);
          ly = -SHIP_EXTENT.BEAM * 0.45;
          break;
        case 'stbd':
          lx = rand(-6, 10);
          ly = SHIP_EXTENT.BEAM * 0.45;
          break;
        default:
          lx = SHIP_EXTENT.LENGTH * 0.28;
          ly = -SHIP_EXTENT.BEAM * 0.28;
      }
    } else {
      // Cargo: walk up to the stern
      lx = -SHIP_EXTENT.LENGTH * 0.42;
      ly = rand(-7, 7);
    }
    const padY = pad.y ?? 0;
    const onHull = this._shipLocalToWorld(pad.x, padY, lx, ly);
    const dx = onHull.x - pad.x;
    const dy = onHull.y - padY;
    const len = Math.hypot(dx, dy) || 1;
    // Stand just outside the skin
    const standR = len + 2.5;
    return {
      x: pad.x + (dx / len) * standR,
      y: padY + (dy / len) * standR,
    };
  }

  _beginNextMechanicTrip(npc) {
    npc.hullTarget = null;
    if (npc.job === 'weld') {
      npc.state = 'toShip';
      return;
    }
    const nearby = this._nearbyMidPiles(npc.targetPad.x);
    if (npc.job === 'loadShip') {
      npc.targetPile = nearby.find((p) => p.items.length > 0) || null;
      if (!npc.targetPile) {
        npc.job = 'unloadShip';
        npc.targetPile = nearby.find((p) => p.items.length < PILE_CAP) || nearby[0];
      }
      npc.state = npc.job === 'loadShip' ? 'toPile' : 'toShip';
    } else {
      npc.targetPile = nearby.find((p) => p.items.length < PILE_CAP) || nearby[0];
      npc.state = 'toShip';
    }
    // Never dump a fresh spawn into toExit while standing on a hatch
    if (!npc.targetPile) {
      npc.job = 'weld';
      npc.state = 'toShip';
    }
  }

  /** Step clear of a stair hatch onto the deck (north toward ships). */
  _hatchRally(npc) {
    const stair = npc.stair || npc.exitStair || this._nearestStair(npc.x);
    return { x: stair.x, y: stair.y - 26 };
  }

  _updateMechanic(npc, dt, hazard) {
    npc.phase += dt * 8;
    npc.stateT -= dt;

    if (npc.state === 'flinch') {
      npc.x += Math.sin(npc.phase * 2) * 8 * dt;
      if (npc.stateT <= 0) {
        npc.state = npc.resumeState || 'toShip';
        npc.stateT = 0;
      }
      return;
    }
    if (npc.state === 'flee') {
      // Retreat south of the nearest hatch, then resume work — do not arm exit
      // (that made a later toExit despawn immediately on the hatch approach).
      const stair = npc.exitStair || this._nearestStair(npc.x);
      const safeX = stair.x;
      const safeY = stair.y + 22;
      if (this._moveToward(npc, safeX, safeY, 58, dt)) {
        const resume = npc.resumeState || 'toShip';
        npc.state = resume === 'toExit' || resume === 'descend' ? 'toShip' : resume;
        npc.hullTarget = null;
        npc.stateT = 0.2;
        npc.exitArmed = false;
      }
      return;
    }

    if (
      ['toPile', 'toShip', 'workPile', 'workShip', 'workWeld', 'leaveHatch'].includes(npc.state) &&
      hazard > 0.55 &&
      Math.hypot(npc.x - this._shipPos.x, npc.y - this._shipPos.y) < 70 &&
      Math.random() < hazard * 0.035
    ) {
      npc.resumeState = npc.state === 'leaveHatch' ? 'toShip' : npc.state;
      if (hazard > 1.15) {
        npc.state = 'flee';
        npc.stateT = rand(0.8, 1.2);
      } else {
        npc.state = 'flinch';
        npc.stateT = rand(0.35, 0.55);
      }
      return;
    }

    const walk = 27;

    switch (npc.state) {
      case 'emerge': {
        npc.emergeT = (npc.emergeT || 0) + dt;
        if (npc.emergeT >= 0.55) {
          // Must clear the hatch before job logic (toExit on-hatch = instant despawn)
          npc.rally = this._hatchRally(npc);
          npc.afterHatch = 'job';
          npc.state = 'leaveHatch';
          npc.exitArmed = false;
        }
        break;
      }
      case 'leaveHatch': {
        const rally = npc.rally || this._hatchRally(npc);
        if (this._moveToward(npc, rally.x, rally.y, walk, dt)) {
          npc.exitArmed = true;
          if (npc.afterHatch === 'toExit') {
            npc.state = 'toExit';
          } else {
            this._beginNextMechanicTrip(npc);
          }
          npc.afterHatch = null;
        }
        break;
      }
      case 'enterDoor': {
        const ix = this._insideX(npc.side);
        if (this._moveToward(npc, ix, BAY.PATH_Y, walk, dt)) {
          npc.exitArmed = true;
          this._beginNextMechanicTrip(npc);
        }
        break;
      }
      case 'toPile': {
        const p = this._pileById(npc.targetPile?.id);
        if (!p) {
          npc.job = 'weld';
          npc.state = 'toShip';
          break;
        }
        if (this._moveToward(npc, p.x, p.y + 18, walk, dt)) {
          npc.state = 'workPile';
          npc.stateT = 0.55;
        }
        break;
      }
      case 'workPile': {
        if (npc.stateT > 0) break;
        const p = this._pileById(npc.targetPile?.id);
        if (npc.job === 'loadShip' && p && p.items.length > 0 && !npc.cargo) {
          npc.cargo = p.items.pop();
          npc.hullTarget = null;
          npc.state = 'toShip';
        } else if (npc.job === 'unloadShip' && npc.cargo && p && p.items.length < PILE_CAP) {
          p.items.push(npc.cargo);
          npc.cargo = null;
          npc.tripsLeft -= 1;
          if (npc.tripsLeft <= 0) npc.state = 'toExit';
          else this._beginNextMechanicTrip(npc);
        } else {
          // Failed box interaction — weld instead of walking into a hatch despawn
          if (npc.cargo) {
            const nearby = this._nearbyMidPiles(npc.x);
            const room = nearby.find((q) => q.items.length < PILE_CAP);
            if (room) room.items.push(npc.cargo);
            npc.cargo = null;
          }
          npc.job = 'weld';
          npc.hullTarget = null;
          npc.state = 'toShip';
        }
        break;
      }
      case 'toShip': {
        const pad = npc.targetPad;
        if (!pad) {
          npc.state = 'toExit';
          break;
        }
        if (!npc.hullTarget) {
          npc.hullTarget = this._shipHullApproach(
            pad,
            npc.job === 'weld' ? 'weld' : 'cargo'
          );
        }
        if (this._moveToward(npc, npc.hullTarget.x, npc.hullTarget.y, walk, dt)) {
          if (npc.job === 'weld') {
            npc.state = 'workWeld';
            npc.stateT = rand(1.1, 1.9);
          } else {
            npc.state = 'workShip';
            npc.stateT = 0.65;
          }
        }
        break;
      }
      case 'workWeld': {
        if (Math.random() < 0.55) {
          this._sparkle.push({
            x: npc.x + rand(-4, 4),
            y: npc.y + rand(-5, 2),
            life: rand(0.12, 0.35),
            max: 0.35,
            r: rand(0.8, 2.2),
            weld: true,
          });
        }
        if (npc.stateT > 0) break;
        npc.tripsLeft -= 1;
        npc.hullTarget = null;
        if (npc.tripsLeft <= 0) npc.state = 'toExit';
        else npc.state = 'toShip';
        break;
      }
      case 'workShip': {
        if (npc.stateT > 0) break;
        if (npc.job === 'loadShip' && npc.cargo) {
          npc.cargo = null;
          npc.tripsLeft -= 1;
          npc.hullTarget = null;
          if (npc.tripsLeft <= 0) npc.state = 'toExit';
          else this._beginNextMechanicTrip(npc);
        } else if (npc.job === 'unloadShip' && !npc.cargo) {
          const kinds = CARGO_KINDS.filter(
            (k) => k.label === 'INGOT' || k.label === 'AMMO' || k.label === 'CRATE'
          );
          npc.cargo = makeCargo(pick(kinds));
          const nearby = this._nearbyMidPiles(npc.targetPad.x);
          npc.targetPile = nearby.find((p) => p.items.length < PILE_CAP) || nearby[0];
          npc.hullTarget = null;
          npc.state = npc.targetPile ? 'toPile' : 'toShip';
          if (!npc.targetPile) npc.job = 'weld';
        } else {
          npc.job = 'weld';
          npc.hullTarget = null;
          npc.state = 'toShip';
        }
        break;
      }
      case 'toExit': {
        if (npc.cargo) {
          const nearby = this._nearbyMidPiles(npc.x);
          const room = nearby.find((p) => p.items.length < PILE_CAP);
          if (room) room.items.push(npc.cargo);
          npc.cargo = null;
        }
        // Still on a hatch with no walk yet — step onto the deck first
        if (!npc.exitArmed) {
          npc.rally = this._hatchRally(npc);
          npc.afterHatch = 'toExit';
          npc.state = 'leaveHatch';
          break;
        }
        if (npc.exit === 'door') {
          if (npc.y < BAY.PATH_Y - 8) {
            this._moveToward(npc, npc.x, BAY.PATH_Y, walk, dt);
            break;
          }
          const doorX = this._doorX(npc.side);
          if (this._moveToward(npc, doorX, BAY.PATH_Y, walk, dt)) {
            npc.state = 'exitDoor';
          }
        } else {
          const stair = npc.exitStair || this._nearestStair(npc.x);
          // From north of the hatch, detour via a south approach so we don't
          // "arrive" on the hatch without walking. Once at/south of the hatch,
          // walk straight in — the old approach↔stair band oscillated forever
          // (~3px from approach while still >10 from the hatch).
          const approach = { x: stair.x, y: stair.y + 18 };
          const northOfHatch = npc.y < stair.y - 2;
          if (
            northOfHatch &&
            Math.hypot(npc.x - approach.x, npc.y - approach.y) > 2
          ) {
            this._moveToward(npc, approach.x, approach.y, walk, dt);
            break;
          }
          if (this._moveToward(npc, stair.x, stair.y, walk, dt)) {
            npc.state = 'descend';
            npc.stateT = 0.55;
          }
        }
        break;
      }
      case 'descend': {
        if (npc.stateT <= 0) npc.alive = false;
        break;
      }
      case 'exitDoor': {
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX + npc.side * 50, BAY.PATH_Y, walk + 2, dt)) {
          npc.alive = false;
        }
        break;
      }
      default:
        npc.state = 'toExit';
    }

    if (
      npc.state === 'toShip' ||
      npc.state === 'workShip' ||
      npc.state === 'workWeld' ||
      npc.state === 'flinch' ||
      npc.state === 'leaveHatch'
    ) {
      return;
    }
    // Soft pad keep-out — hard snap teleported anyone leaving the hull onto the apron
    const pushed = this._padKeepOut(npc.x, npc.y);
    if (pushed && npc.state !== 'flee') {
      const dx = pushed.x - npc.x;
      const dy = pushed.y - npc.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-6) {
        const step = Math.min(dist, walk * dt);
        npc.x += (dx / dist) * step;
        npc.y += (dy / dist) * step;
      }
    }
  }

  _padKeepOut(x, y) {
    const pads = padCenters().map((px) => ({ x: px, y: 0 }));
    for (const p of pads) {
      const dx = x - p.x;
      const dy = y - p.y;
      const clear = BAY.PAD_R + 14;
      if (dx * dx + dy * dy < clear * clear) {
        const a = Math.atan2(dy, dx);
        return {
          x: p.x + Math.cos(a) * clear,
          y: p.y + Math.sin(a) * clear,
        };
      }
    }
    return null;
  }

  render(ctx, space = null) {
    this.renderDeck(ctx, space);
    this.renderCrew(ctx);
    this.renderVisitors(ctx);
    this.renderOverhead(ctx);
  }

  /** Pads, cargo, floor — below crew and ships. */
  renderDeck(ctx, space = null) {
    this._drawBayShell(ctx);
    if (space) this._drawViewportSpace(ctx, space);
    this._drawViewportFrames(ctx);
    this._drawFloor(ctx);
    this._drawStairs(ctx);
    this._drawBayDoors(ctx);
    this._drawCargoPiles(ctx);
    this._drawDockPad(ctx, 0, 0, 'B2', { active: true });
    for (const pad of this.sidePads) {
      this._drawDockPad(ctx, pad.x, 0, pad.bayId, {
        active: false,
        occupied: !!pad.visitorId,
      });
    }
  }

  /** Crew on the deck — drawn under ships so hulls occlude them. */
  renderCrew(ctx) {
    for (const npc of this.npcs) {
      if (!this._npcVisibleThroughBulkheads(npc)) continue;
      if (npc.kind === 'mechanic') this._drawMechanic(ctx, npc);
      else this._drawForklift(ctx, npc);
    }
    this._drawBulkheadDoors(ctx);
  }

  /** Visitor ships on B1/B3. */
  renderVisitors(ctx) {
    for (const pad of this.sidePads) {
      if (pad.visitorId) this._drawVisitor(ctx, pad);
    }
  }

  /** Overhead gantry + FX above deck actors. */
  renderOverhead(ctx) {
    this._drawOverhead(ctx);
    this._drawSparkles(ctx);
    this._drawDebris(ctx);
    this._drawHazardWash(ctx);
  }

  _drawBayShell(ctx) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const centers = padCenters();
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -h - 40;
    const EXT = 2200;

    ctx.fillStyle = '#0a1018';
    ctx.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);

    const northY = -h - 80;
    const northH = 80 + BAY.DOOR_H;
    const vpGaps = centers.map((cx) => ({
      lo: cx - vpW / 2,
      hi: cx + vpW / 2,
    }));
    let cursor = -w - 100;
    for (const g of vpGaps) {
      if (g.lo > cursor) {
        ctx.fillRect(cursor, northY, g.lo - cursor, northH);
      }
      if (vpY > northY) {
        ctx.fillRect(g.lo, northY, g.hi - g.lo, vpY - northY);
      }
      const belowTop = vpY + vpH;
      const belowH = northY + northH - belowTop;
      if (belowH > 0) {
        ctx.fillRect(g.lo, belowTop, g.hi - g.lo, belowH);
      }
      cursor = Math.max(cursor, g.hi);
    }
    if (cursor < w + 100) {
      ctx.fillRect(cursor, northY, w + 100 - cursor, northH);
    }

    ctx.fillStyle = '#15202c';
    ctx.fillRect(-w - 50, -h - 50, 50, (h + 50) * 2);
    ctx.fillRect(w, -h - 50, 50, (h + 50) * 2);
    ctx.fillRect(-w - 50, h, (w + 50) * 2, 50);

    const wallTop = -h - 50;
    const wallH = 50 + BAY.DOOR_H;
    cursor = -w - 50;
    for (const g of vpGaps) {
      if (g.lo > cursor) {
        ctx.fillRect(cursor, wallTop, g.lo - cursor, wallH);
      }
      if (vpY > wallTop) {
        ctx.fillRect(g.lo, wallTop, g.hi - g.lo, vpY - wallTop);
      }
      const belowTop = vpY + vpH;
      const belowH = wallTop + wallH - belowTop;
      if (belowH > 0) {
        ctx.fillRect(g.lo, belowTop, g.hi - g.lo, belowH);
      }
      cursor = Math.max(cursor, g.hi);
    }
    if (cursor < w + 50) {
      ctx.fillRect(cursor, wallTop, w + 50 - cursor, wallH);
    }

    ctx.fillStyle = '#1c2a38';
    ctx.fillRect(-w, -h + BAY.DOOR_H, w * 2, h * 2 - BAY.DOOR_H);
    ctx.strokeStyle = '#3a5568';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w, -h, w * 2, h * 2);

    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const wy = -30 + i * 48;
        // Skip windows that overlap the bulkhead door band
        if (Math.abs(wy - BAY.PATH_Y) < BAY.BULK_DOOR_HALF + 10) continue;
        const wx = side < 0 ? -w + 8 : w - 22;
        ctx.fillStyle = '#2a3848';
        ctx.fillRect(wx - 2, wy - 2, 18, 22);
        ctx.strokeStyle = '#7a9bb0';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(wx - 2, wy - 2, 18, 22);
        ctx.fillStyle = 'rgba(6, 10, 18, 0.75)';
        ctx.fillRect(wx, wy, 14, 18);
        ctx.strokeStyle = '#4a6070';
        ctx.strokeRect(wx, wy, 14, 18);
      }
    }
  }

  /** Outside the bay, only the door throat is visible; walls hide the rest. */
  _npcVisibleThroughBulkheads(npc) {
    const w = BAY.HALF_W;
    // Anyone still on the deck stays visible (stairs, ships, piles)
    if (Math.abs(npc.x) <= w - 2) return true;
    const doorLo = BAY.PATH_Y - BAY.BULK_DOOR_HALF;
    const doorHi = BAY.PATH_Y + BAY.BULK_DOOR_HALF;
    return npc.y >= doorLo - 4 && npc.y <= doorHi + 4;
  }

  /** Interior bulkheads on L/R of the human path — open doorways; walls occlude NPCs. */
  _drawBulkheadDoors(ctx) {
    const w = BAY.HALF_W;
    const thick = BAY.BULK_THICK;
    const doorLo = BAY.PATH_Y - BAY.BULK_DOOR_HALF;
    const doorHi = BAY.PATH_Y + BAY.BULK_DOOR_HALF;
    const wallTop = -BAY.HALF_H + BAY.DOOR_H;
    const wallBot = BAY.HALF_H;

    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -w - thick : w;
      // Wall panels above and below door (cover NPCs behind solid bulkhead)
      ctx.fillStyle = '#1a2836';
      ctx.fillRect(x0, wallTop, thick, Math.max(0, doorLo - wallTop));
      ctx.fillRect(x0, doorHi, thick, Math.max(0, wallBot - doorHi));

      // Corridor mass above/below the door band (hides approach outside the throat)
      const deepX = side < 0 ? -w - thick - 120 : w + thick;
      ctx.fillStyle = '#0c141c';
      ctx.fillRect(deepX, wallTop, 120, Math.max(0, doorLo - wallTop));
      ctx.fillRect(deepX, doorHi, 120, Math.max(0, wallBot - doorHi));

      // Door frame
      ctx.fillStyle = '#2a3848';
      ctx.fillRect(x0 - 2, doorLo - 4, thick + 4, 4);
      ctx.fillRect(x0 - 2, doorHi, thick + 4, 4);
      ctx.fillRect(x0 - 2, doorLo, 3, doorHi - doorLo);
      ctx.fillRect(x0 + thick - 1, doorLo, 3, doorHi - doorLo);

      ctx.strokeStyle = '#7a9bb0';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x0 - 2, doorLo - 4, thick + 4, doorHi - doorLo + 8);

      ctx.fillStyle = 'rgba(100, 180, 255, 0.08)';
      ctx.fillRect(x0, doorLo, thick, doorHi - doorLo);

      ctx.fillStyle = 'rgba(100, 180, 255, 0.35)';
      ctx.font = '4px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        side < 0 ? 'INT · L' : 'INT · R',
        side < 0 ? -w - thick / 2 : w + thick / 2,
        doorLo - 7
      );
    }
  }

  _drawViewportFrames(ctx) {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    for (const cx of padCenters()) {
      const x = cx - vpW / 2;
      const y = vpY;
      const t = 3;
      ctx.fillStyle = '#2a3848';
      ctx.fillRect(x - t, y - t, vpW + t * 2, t);
      ctx.fillRect(x - t, y + vpH, vpW + t * 2, t);
      ctx.fillRect(x - t, y, t, vpH);
      ctx.fillRect(x + vpW, y, t, vpH);
      ctx.strokeStyle = '#7a9bb0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - t, y - t, vpW + t * 2, vpH + t * 2);
      ctx.strokeStyle = '#4a6070';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1, y - 1, vpW + 2, vpH + 2);
      ctx.fillStyle = '#8a9aa8';
      for (const [bx, by] of [
        [x - 1, y - 1],
        [x + vpW - 1, y - 1],
        [x - 1, y + vpH - 1],
        [x + vpW - 1, y + vpH - 1],
      ]) {
        ctx.beginPath();
        ctx.arc(bx, by, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawViewportSpace(ctx, space) {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    const { starfield, nebulaField, spaceX, spaceY, time, nebulae } = space;

    for (const cx of padCenters()) {
      const x = cx - vpW / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, vpY, vpW, vpH);
      ctx.clip();

      ctx.translate(cx, vpY + vpH / 2);
      const cover = Math.hypot(vpW, vpH) + 40;
      nebulaField.renderProcedural(ctx, spaceX, spaceY, time, cover, 0.55);
      starfield.render(ctx, spaceX, spaceY, cover, time, 0.55);
      if (nebulae?.length) {
        ctx.save();
        ctx.translate(-spaceX, -spaceY);
        ctx.scale(0.12, 0.12);
        ctx.translate(spaceX, spaceY);
        nebulaField.renderWorldNebulae(ctx, nebulae, time);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  _drawBayDoors(ctx) {
    const h = BAY.HALF_H;
    const doorTop = -h;
    const doorH = BAY.DOOR_H;
    const dh = BAY.DOOR_HALF;
    const labels = bayLabels();

    padCenters().forEach((cx, i) => {
      ctx.fillStyle = '#3a4a58';
      ctx.strokeStyle = '#6a8498';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(cx - dh, doorTop, dh - 1.5, doorH);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(cx + 1.5, doorTop, dh - 1.5, doorH);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(20, 30, 40, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, doorTop + 2);
      ctx.lineTo(cx, doorTop + doorH - 2);
      ctx.stroke();

      ctx.fillStyle = '#2a3848';
      ctx.fillRect(cx - dh - 8, doorTop - 4, 8, doorH + 10);
      ctx.fillRect(cx + dh, doorTop - 4, 8, doorH + 10);
      ctx.fillRect(cx - dh - 8, doorTop + doorH, dh * 2 + 16, 7);

      for (let s = 0; s < 6; s++) {
        ctx.fillStyle = s % 2 === 0 ? '#c9a020' : '#1a1a1a';
        ctx.fillRect(cx - dh + s * ((dh * 2) / 6), doorTop + doorH + 1, (dh * 2) / 6, 5);
      }

      ctx.fillStyle = 'rgba(100, 180, 255, 0.2)';
      for (const y of [-120, -95, -72]) {
        ctx.beginPath();
        ctx.moveTo(cx, y - 7);
        ctx.lineTo(cx - 5, y + 5);
        ctx.lineTo(cx + 5, y + 5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(100, 180, 255, 0.45)';
      ctx.font = '5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${labels[i]} · SPACE`, cx, doorTop + doorH + 12);
    });
  }

  _drawFloor(ctx) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;

    ctx.fillStyle = '#243442';
    ctx.fillRect(-w + 2, -h + BAY.DOOR_H + 2, w * 2 - 4, h * 2 - BAY.DOOR_H - 4);

    ctx.strokeStyle = 'rgba(70, 95, 115, 0.22)';
    ctx.lineWidth = 1;
    for (let x = -w + 30; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, -h + BAY.DOOR_H + 8);
      ctx.lineTo(x, h - 8);
      ctx.stroke();
    }
    for (let y = -h + 50; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(-w + 8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }

    // Human / forklift path
    ctx.fillStyle = 'rgba(100, 180, 255, 0.04)';
    ctx.fillRect(-w + 4, BAY.PATH_Y - 18, w * 2 - 8, 36);

    ctx.strokeStyle = 'rgba(100, 180, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 12]);
    for (const cx of padCenters()) {
      ctx.beginPath();
      ctx.moveTo(cx, -h + BAY.DOOR_H + 16);
      ctx.lineTo(cx, h - 40);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  _drawCargoPiles(ctx) {
    for (const pile of this.piles) {
      // Hardpoint mark (empty pads still readable)
      ctx.strokeStyle = 'rgba(90, 120, 140, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pile.x - 11, pile.y - 4, 22, 18);

      pile.items.forEach((item, i) => {
        const pos = this._itemWorldPos(pile, i);
        ctx.fillStyle = item.color;
        ctx.strokeStyle = '#c8c0b0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(pos.x, pos.y, item.w, item.h);
        ctx.fill();
        ctx.stroke();
      });
    }
  }

  _drawDockPad(ctx, cx, cy, label, opts = {}) {
    const active = !!opts.active;
    const occupied = !!opts.occupied;
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = active ? '#121820' : '#161c24';
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = active ? 'rgba(80, 130, 160, 0.45)' : 'rgba(60, 90, 110, 0.35)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    if (active) {
      const pulse = 0.04 + 0.03 * Math.sin(this.time * 2.2);
      ctx.fillStyle = `rgba(70, 160, 200, ${pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = active
      ? 'rgba(100, 180, 255, 0.4)'
      : 'rgba(120, 140, 160, 0.35)';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, BAY.PAD_R + 9);
    if (!active && !occupied) {
      ctx.fillStyle = 'rgba(120, 140, 160, 0.28)';
      ctx.font = '4px sans-serif';
      ctx.fillText('EMPTY', 0, 3);
    }

    ctx.restore();
  }

  _drawVisitor(ctx, pad) {
    ctx.save();
    ctx.translate(pad.x, 0);
    ctx.rotate(SHIP.SPAWN_ANGLE);
    drawVisitorShip(ctx, pad.visitorId);
    ctx.restore();

    ctx.save();
    ctx.translate(pad.x, 0);
    ctx.fillStyle = 'rgba(120, 140, 160, 0.4)';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pad.bayId, 0, BAY.PAD_R + 9);
    ctx.restore();
  }

  _drawStairs(ctx) {
    for (const s of STAIRS) {
      // Hatch into under-deck
      ctx.fillStyle = '#0e1620';
      ctx.strokeStyle = '#5a7088';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(s.x - 11, s.y - 9, 22, 18);
      ctx.fill();
      ctx.stroke();

      // Stair treads (perspective: north = deeper)
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        ctx.fillStyle = i % 2 ? '#1a2834' : '#243444';
        ctx.fillRect(s.x - 8 + i, s.y - 6 + i * 3.2, 16 - i * 2, 2.8);
        ctx.strokeStyle = `rgba(100, 140, 170, ${0.25 + t * 0.2})`;
        ctx.strokeRect(s.x - 8 + i, s.y - 6 + i * 3.2, 16 - i * 2, 2.8);
      }

      ctx.fillStyle = 'rgba(100, 180, 255, 0.3)';
      ctx.font = '3.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STAIR', s.x, s.y + 14);
    }
  }

  /**
   * Manned cab on the trolley — this universe has operators, not automation.
   * Levers nudge with travel / hoist / claw grip.
   */
  _drawCraneCabin(ctx, c, tx, by) {
    const op = c.operator || {
      suit: '#3a6a8a',
      helmet: '#c8d0d8',
    };
    const lev = c.levers || { travel: 0, hoist: 0, grip: 0 };
    const cabX = tx + 13;
    const cabY = by;
    const w = 14;
    const h = 12;

    // Cab shell (offset east of hoist so cables stay clear)
    ctx.fillStyle = '#3a4858';
    ctx.strokeStyle = '#9aacbc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(cabX - w / 2, cabY - h / 2, w, h);
    ctx.fill();
    ctx.stroke();

    // Roof lip
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(cabX - w / 2 - 0.5, cabY - h / 2 - 1.5, w + 1, 2);

    // Glass
    ctx.fillStyle = 'rgba(70, 140, 180, 0.35)';
    ctx.strokeStyle = 'rgba(160, 200, 220, 0.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.rect(cabX - 5.5, cabY - 4.5, 11, 6.5);
    ctx.fill();
    ctx.stroke();

    // Operator (seated, facing roughly toward hoist / bay center)
    const faceLeft = tx < 0 ? 1 : -1;
    ctx.fillStyle = op.suit;
    ctx.fillRect(cabX - 2.2, cabY - 1.5, 4.4, 4.2);
    ctx.fillStyle = op.helmet;
    ctx.beginPath();
    ctx.arc(cabX, cabY - 3.2, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40, 80, 100, 0.45)';
    ctx.fillRect(cabX - 1.4 * faceLeft - 0.6, cabY - 3.8, 2.2, 1.3);

    // Console shelf
    ctx.fillStyle = '#1e2a36';
    ctx.fillRect(cabX - 5, cabY + 2.2, 10, 2.4);
    ctx.strokeStyle = '#6a7a88';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(cabX - 5, cabY + 2.2, 10, 2.4);

    // Three levers: travel · hoist · grip
    const baseY = cabY + 2.4;
    const levers = [
      { x: cabX - 3.2, t: lev.travel, color: '#c8a050' },
      { x: cabX, t: lev.hoist, color: '#70b0d0' },
      { x: cabX + 3.2, t: lev.grip, color: '#d08070' },
    ];
    for (const L of levers) {
      const ang = (L.t || 0) * 0.55;
      const tipX = L.x + Math.sin(ang) * 3.2;
      const tipY = baseY - Math.cos(ang) * 3.2;
      ctx.strokeStyle = '#b0b8c0';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(L.x, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a5560';
      ctx.beginPath();
      ctx.arc(L.x, baseY, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  _drawOverhead(ctx) {
    const c = this.crane;
    const [rx0, rx1] = RUNWAY_X;

    // Runway rails (length of bay — north/south travel)
    ctx.strokeStyle = 'rgba(100, 130, 150, 0.7)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(rx0, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx0, BRIDGE_Y_MAX + 8);
    ctx.moveTo(rx1, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx1, BRIDGE_Y_MAX + 8);
    ctx.stroke();

    // Runway structural beams
    ctx.strokeStyle = 'rgba(70, 95, 115, 0.4)';
    ctx.lineWidth = 2;
    for (let y = BRIDGE_Y_MIN; y <= BRIDGE_Y_MAX; y += 48) {
      ctx.beginPath();
      ctx.moveTo(rx0 - 6, y);
      ctx.lineTo(rx0 + 6, y);
      ctx.moveTo(rx1 - 6, y);
      ctx.lineTo(rx1 + 6, y);
      ctx.stroke();
    }

    // Soft bay lights
    for (const lx of padCenters()) {
      for (const ly of [-70, 40, 120]) {
        const flicker = 0.85 + 0.15 * Math.sin(this.time * 3 + lx * 0.05 + ly);
        ctx.fillStyle = `rgba(220, 230, 200, ${0.07 * flicker})`;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 50, 36, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (!c) return;

    const by = c.bridgeY;
    const tx = c.trolleyX;
    const hoist = c.hoist;
    const hook = this._craneHookPos();

    // Bridge — slimmer load-bearing beam
    ctx.fillStyle = '#4a5a68';
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1;
    ctx.fillRect(rx0 - 2, by - 2.5, rx1 - rx0 + 4, 5);
    ctx.strokeRect(rx0 - 2, by - 2.5, rx1 - rx0 + 4, 5);
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(rx0 - 2, by - 0.5, rx1 - rx0 + 4, 1.5);

    // End trucks on runway
    for (const rx of [rx0, rx1]) {
      ctx.fillStyle = '#6a7888';
      ctx.fillRect(rx - 4, by - 5, 8, 10);
      ctx.strokeStyle = '#a8b8c8';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(rx - 4, by - 5, 8, 10);
    }

    // Trolley — smaller carriage, parks north of cargo
    ctx.fillStyle = '#5a6a78';
    ctx.strokeStyle = '#b0c0d0';
    ctx.lineWidth = 0.9;
    ctx.fillRect(tx - 8, by - 5, 16, 10);
    ctx.strokeRect(tx - 8, by - 5, 16, 10);
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(tx - 3.5, by - 3, 7, 6);

    this._drawCraneCabin(ctx, c, tx, by);

    // Hoist cables — trolley (north) down to hook at cargo
    ctx.strokeStyle = 'rgba(200, 210, 220, 0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx - 2, by + 5);
    ctx.lineTo(hook.x - 2, hook.y);
    ctx.moveTo(tx + 2, by + 5);
    ctx.lineTo(hook.x + 2, hook.y);
    ctx.stroke();

    const shadow = 4 + (hoist / HOIST_MAX) * 8;
    const cargoPos = c.carried ? this._craneCargoDrawPos() : null;
    const shadowY = cargoPos ? cargoPos.top + (c.carried.h || 8) : hook.y + CLAW_FINGER;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + (hoist / HOIST_MAX) * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(hook.x, shadowY + 2, shadow, shadow * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hand / palm
    ctx.fillStyle = '#6a7888';
    ctx.strokeStyle = '#c8d0d8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hook.x - 6, hook.y);
    ctx.lineTo(hook.x + 6, hook.y);
    ctx.lineTo(hook.x + 4, hook.y + CLAW_PALM);
    ctx.lineTo(hook.x - 4, hook.y + CLAW_PALM);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Carried box hangs from the fingers (top just above fingertip line)
    if (c.carried && cargoPos) {
      const box = c.carried;
      ctx.fillStyle = box.color;
      ctx.strokeStyle = '#8a7860';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(hook.x - box.w / 2, cargoPos.top, box.w, box.h);
      ctx.fill();
      ctx.stroke();
    }

    // Fingers — open when empty, partial close around cargo
    const open = c.claw ?? CLAW_OPEN;
    const palmY = hook.y + CLAW_PALM;
    const tipY = hook.y + CLAW_FINGER;
    const leftBase = hook.x - 4;
    const rightBase = hook.x + 4;
    // Open spreads tips outward; grip tucks them in (not fully closed)
    const leftTip = hook.x - (2.2 + open * 5.5);
    const rightTip = hook.x + (2.2 + open * 5.5);
    const midTip = hook.x + (open - 0.5) * 0.8;

    ctx.strokeStyle = '#c8d0d8';
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftBase, palmY);
    ctx.lineTo(leftTip, tipY);
    ctx.moveTo(rightBase, palmY);
    ctx.lineTo(rightTip, tipY);
    ctx.moveTo(hook.x, palmY);
    ctx.lineTo(midTip, tipY + 1);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Fingertip pads
    ctx.fillStyle = '#a8b8c8';
    for (const [fx, fy] of [
      [leftTip, tipY],
      [rightTip, tipY],
      [midTip, tipY + 1],
    ]) {
      ctx.beginPath();
      ctx.arc(fx, fy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawMechanic(ctx, npc) {
    ctx.save();
    ctx.translate(npc.x, npc.y);
    const flip = npc.facing < 0 ? -1 : 1;
    ctx.scale(flip, 1);

    // Under-deck emerge / descend (keep fully opaque once on deck)
    let scale = 1;
    if (npc.state === 'emerge') {
      scale = Math.min(1, 0.4 + ((npc.emergeT || 0) / 0.55) * 0.6);
    } else if (npc.state === 'descend') {
      scale = Math.max(0.35, npc.stateT / 0.45);
    }
    ctx.scale(scale, scale);
    if (npc.state === 'emerge' || npc.state === 'descend') {
      ctx.globalAlpha = 0.55 + scale * 0.45;
    }

    const bob = npc.state === 'flinch' ? Math.sin(npc.phase * 3) * 1.5 : Math.sin(npc.phase) * 0.8;
    const duck = npc.state === 'flinch' || npc.state === 'flee' ? 2 : 0;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = npc.suit;
    ctx.lineWidth = 1.6;
    const walking = ['toPile', 'toShip', 'toExit', 'enterDoor', 'exitDoor', 'flee', 'leaveHatch'].includes(npc.state);
    const stride = walking ? Math.sin(npc.phase) * 3 : 0;
    ctx.beginPath();
    ctx.moveTo(-1.5, 1 + bob);
    ctx.lineTo(-2 - stride * 0.3, 6);
    ctx.moveTo(1.5, 1 + bob);
    ctx.lineTo(2 + stride * 0.3, 6);
    ctx.stroke();

    ctx.fillStyle = npc.suit;
    ctx.fillRect(-3, -4 + bob + duck, 6, 7);

    ctx.fillStyle = npc.helmet;
    ctx.beginPath();
    ctx.arc(0, -6 + bob + duck, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(80, 160, 200, 0.45)';
    ctx.fillRect(-2, -7 + bob + duck, 3, 2);

    if (npc.cargo) {
      const c = npc.cargo;
      ctx.fillStyle = c.color;
      ctx.strokeStyle = '#c8c0b0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(3, -3 + bob - c.h / 2, c.w * 0.7, c.h * 0.7);
      ctx.fill();
      ctx.stroke();
    } else if (npc.state === 'workWeld' || npc.job === 'weld') {
      // Welding torch
      ctx.strokeStyle = '#c0c8d0';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(3, -1 + bob);
      ctx.lineTo(8, -4 + bob);
      ctx.stroke();
      if (npc.state === 'workWeld') {
        ctx.fillStyle = `rgba(160, 220, 255, ${0.5 + 0.5 * Math.sin(npc.phase * 4)})`;
        ctx.beginPath();
        ctx.arc(9, -5 + bob, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#2a3a48';
      ctx.fillRect(3, -2 + bob, 3, 4);
      ctx.fillStyle = 'rgba(100, 220, 160, 0.5)';
      ctx.fillRect(3.5, -1.5 + bob, 2, 1.5);
    }

    if (npc.state === 'flee' || npc.state === 'flinch') {
      ctx.strokeStyle = npc.helmet;
      ctx.beginPath();
      ctx.moveTo(-3, -2 + bob);
      ctx.lineTo(-5, -6 + bob);
      ctx.moveTo(3, -2 + bob);
      ctx.lineTo(5, -5 + bob);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawForklift(ctx, npc) {
    ctx.save();
    ctx.translate(npc.x, npc.y);
    const flip = npc.facing < 0 ? -1 : 1;
    ctx.scale(flip, 1);

    const bounce = Math.sin(npc.phase * 0.5) * 0.4;
    const cargoLift = npc.state === 'work' ? -2 : 2;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 8, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = npc.body;
    ctx.strokeStyle = '#e0a060';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, 2 + bounce);
    ctx.lineTo(8, 2 + bounce);
    ctx.lineTo(10, -4 + bounce);
    ctx.lineTo(-6, -4 + bounce);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2a3848';
    ctx.fillRect(-4, -10 + bounce, 8, 7);
    ctx.fillStyle = 'rgba(120, 200, 255, 0.35)';
    ctx.fillRect(-2.5, -9 + bounce, 5, 4);

    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(9, -4 + bounce);
    ctx.lineTo(9, -14 + bounce);
    ctx.stroke();
    ctx.strokeStyle = '#b0c0d0';
    ctx.beginPath();
    ctx.moveTo(9, -8 + bounce + cargoLift * 0.2);
    ctx.lineTo(16, -8 + bounce + cargoLift * 0.2);
    ctx.moveTo(9, -5 + bounce + cargoLift * 0.2);
    ctx.lineTo(16, -5 + bounce + cargoLift * 0.2);
    ctx.stroke();

    if (npc.cargo) {
      const c = npc.cargo;
      ctx.fillStyle = c.color;
      ctx.strokeStyle = '#c8c0b0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(11, -10 + bounce + cargoLift - c.h / 2, c.w, c.h);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-6, 5 + bounce, 3, 0, Math.PI * 2);
    ctx.arc(4, 5 + bounce, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#c8d0d8';
    ctx.beginPath();
    ctx.arc(0, -11 + bounce, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawSparkles(ctx) {
    for (const s of this._sparkle) {
      const a = s.life / s.max;
      if (s.weld) {
        ctx.fillStyle = `rgba(180, 230, 255, ${a * 0.95})`;
      } else {
        ctx.fillStyle = `rgba(255, 180, 80, ${a * 0.7})`;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawDebris(ctx) {
    for (const d of this._debris) {
      const a = d.life / d.max;
      ctx.fillStyle = d.color;
      ctx.globalAlpha = a;
      ctx.fillRect(d.x, d.y, d.r, d.r);
      ctx.globalAlpha = 1;
    }
  }

  _drawHazardWash(ctx) {
    const e = this._hazard.engine;
    const m = this._hazard.maneuver;
    const w = this._hazard.weapons;
    if (e < 0.05 && m < 0.05 && w < 0.05) return;

    const ang = this._shipAngle ?? SHIP.SPAWN_ANGLE;
    const sx = this._shipPos?.x ?? 0;
    const sy = this._shipPos?.y ?? 0;
    if (e > 0.1) {
      const ax = sx + Math.cos(ang + Math.PI) * 28;
      const ay = sy + Math.sin(ang + Math.PI) * 28;
      ctx.fillStyle = `rgba(255, 120, 40, ${e * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(ax, ay, 22 + e * 10, 40 + e * 20, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    if (w > 0.1) {
      ctx.fillStyle = `rgba(100, 200, 255, ${w * 0.06})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 50 + w * 30, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
