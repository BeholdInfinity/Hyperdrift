/**
 * Home Base hangar: docked bay, logistics, and reacting NPCs.
 * Seed for new-game start + between-mission hub. Player on B2 (center).
 * +Y = south, −Y = north (bay doors to space).
 *
 * Cargo hardpoints: 3×6 — two columns per bay (left=inbound, right=outbound).
 * Rows: N=ship mounts/upgrades, M=hold cargo, S=forklift ↔ storage I/O.
 * Crane ferries S↔N/M in-lane; mechanics ferry N/M ↔ ships; forklifts use S.
 */

import { HANGAR, SHIP } from '../core/Constants.js';
import { SHIP_EXTENT } from '../entities/ShipHardpoints.js';
import {
  drawVisitorShip,
  pickVisitorId,
  makeVisitorThrusters,
  getVisitorPropulsion,
} from './HangarVisitorShips.js';

const FACE_SOUTH = Math.PI / 2;
const FACE_NORTH = SHIP.SPAWN_ANGLE;
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
/** Half-gap from pad center to that bay's inbound / outbound column */
const COL_OFFSET = 58;
const COL_X = (() => {
  const xs = [];
  for (const px of [-BAY.SIDE_PAD_X, 0, BAY.SIDE_PAD_X]) {
    xs.push(px - COL_OFFSET); // inbound (load)
    xs.push(px + COL_OFFSET); // outbound (unload)
  }
  return xs;
})();
/** North (upgrades), mid (hold cargo), south (forklift storage) */
const ROW_Y = [-78, 8, 118];
/**
 * South edge of each bay's engine danger zone (former stair Y).
 * Floor running-lights end here; stairs moved further south past the backsplash.
 */
const DANGER_ZONE_SOUTH = (ROW_Y[1] + ROW_Y[2]) / 2;
/** Blast backsplash behind each ship (engines face south); stairs on safe/south side */
const BACKSPLASH_Y = DANGER_ZONE_SOUTH + 14;
const BACKSPLASH_HALF_W = 50;
/** Y half-thickness treated as blocked for crew pathing around the wall */
const BACKSPLASH_BAND = 11;
/** Clearance past wall end when bypassing (hug shield edges; slight clip OK) */
const BACKSPLASH_BYPASS = 2;
/** Match danger lights; small pad for body radius */
const DANGER_ZONE_PAD = 4;
/** Crane reclaims unclaimed floor drops after this many seconds */
const FLOOR_DROP_CRANE_AGE = 5;
/** Under-deck stair hatches — south of backsplash (crew walk around wall ends) */
const STAIR_Y = BACKSPLASH_Y + 34;
const STAIRS = [-BAY.SIDE_PAD_X, 0, BAY.SIDE_PAD_X].map((x, bay) => ({
  x,
  y: STAIR_Y,
  bay,
  col: bay * 2,
}));
/**
 * Half-width of per-bay danger-zone light lanes (door → DANGER_ZONE_SOUTH).
 * Must stay outside cargo pads (~±71) and inside half pad-spacing (77.5) so
 * neighboring bay lines don't double up: 72 leaves ~11px between B1|B2 and B2|B3.
 */
const BAY_LANE_HALF = 72;

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

const CARGO_MIN = 8;
const CARGO_MAX = 28;
const PILE_CAP = 4;
/** Per-bay soft cap across south+mid+north inbound piles — don't keep stuffing empty bays */
const INBOUND_SOFT_CAP = 3;

/** Hold cargo — always rectangular boxes (size/color vary by type). */
const HOLD_CARGO = [
  { label: 'CRATE', family: 'cargo', shape: 'rect', w: 10, h: 8, color: '#6a5a3a', hp: 30 },
  { label: 'CRATE', family: 'cargo', shape: 'rect', w: 10, h: 8, color: '#3a7a4a', hp: 30 },
  { label: 'BARREL', family: 'cargo', shape: 'rect', w: 7, h: 9, color: '#4a6a4a', hp: 25 },
  { label: 'COIL', family: 'cargo', shape: 'rect', w: 9, h: 7, color: '#8a6a40', hp: 28 },
  { label: 'TANK', family: 'cargo', shape: 'rect', w: 9, h: 9, color: '#3a5a6a', hp: 35 },
  { label: 'AMMO', family: 'cargo', shape: 'rect', w: 9, h: 6, color: '#8a5050', hp: 22 },
  { label: 'FUEL', family: 'cargo', shape: 'rect', w: 8, h: 8, color: '#3a7a6a', hp: 28 },
  { label: 'ORE', family: 'cargo', shape: 'rect', w: 10, h: 7, color: '#8a7a48', hp: 36 },
  { label: 'INGOT', family: 'cargo', shape: 'rect', w: 11, h: 5, color: '#8a8a70', hp: 40 },
];

/** Ship-mounted upgrades — distinct non-rect silhouettes (top-row pipeline). */
const UPGRADE_KINDS = [
  { label: 'LASER', family: 'upgrade', shape: 'laser', w: 16, h: 6, color: '#50a0c8', hp: 40 },
  { label: 'TURRET', family: 'upgrade', shape: 'turret', w: 12, h: 11, color: '#708898', hp: 45 },
  { label: 'ARMOR', family: 'upgrade', shape: 'armor', w: 12, h: 10, color: '#6a7888', hp: 50 },
  { label: 'THRUSTER', family: 'upgrade', shape: 'thruster', w: 8, h: 13, color: '#5a8aaa', hp: 38 },
  { label: 'ENGINE', family: 'upgrade', shape: 'engine', w: 11, h: 13, color: '#c87840', hp: 55 },
  { label: 'SENSOR', family: 'upgrade', shape: 'sensor', w: 10, h: 10, color: '#60b090', hp: 32 },
];

/** @deprecated alias — hold cargo only; upgrades use UPGRADE_KINDS */
const CARGO_KINDS = HOLD_CARGO;

/** 2×2 slot offsets inside a hardpoint (fill L→R, bottom→top). */
const PILE_SLOTS = [
  { ox: -5.5, oy: 4 },
  { ox: 5.5, oy: 4 },
  { ox: -5.5, oy: -5 },
  { ox: 5.5, oy: -5 },
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

function bayIndexFromX(x) {
  const pads = padCenters();
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pads.length; i++) {
    const d = Math.abs(pads[i] - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function colMeta(col) {
  const bay = (col / 2) | 0;
  const lane = col % 2 === 0 ? 'in' : 'out';
  return { bay, lane, bayId: bayLabels()[bay] };
}

function rowRole(row) {
  if (row === ROW.N) return 'upgrade';
  if (row === ROW.M) return 'cargo';
  return 'storage';
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

function rollSidePad(x, bayId, bayIndex) {
  const occupied = Math.random() < HANGAR.VISITOR_OCCUPY_CHANCE;
  const visitorId = occupied ? pickVisitorId() : null;
  return {
    x,
    bayId,
    bayIndex,
    visitorId,
    cooldown: occupied
      ? rand(HANGAR.VISITOR_COOLDOWN_BUSY_MIN, HANGAR.VISITOR_COOLDOWN_BUSY_MAX)
      : rand(HANGAR.VISITOR_COOLDOWN_EMPTY_MIN, HANGAR.VISITOR_COOLDOWN_EMPTY_MAX),
    seq: null,
    shipY: 0,
    shipScale: 1,
    shipHover: 0,
    shipAngle: occupied ? FACE_NORTH : FACE_SOUTH,
    /** Turntable facing — empty pads point south; occupied face north */
    padAngle: occupied ? FACE_NORTH : FACE_SOUTH,
    padDrop: 0,
    thrusters: visitorId ? makeVisitorThrusters(visitorId) : null,
    shipVx: 0,
    shipVy: 0,
    shipState: null,
    service: null,
  };
}

/** Curved request probability — mild deficits rarely ask; emptier curves up hard. */
function needRequestChance(need) {
  const n = Math.max(0, Math.min(1, need));
  return n ** 2.2;
}

let _serviceSeq = 1;

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function clearVisitorThrusters(pad) {
  if (!pad.thrusters) return;
  for (const k of Object.keys(pad.thrusters)) pad.thrusters[k] = 0;
}

function makeCargo(kind = null) {
  const k = kind ? { ...kind } : { ...pick(HOLD_CARGO) };
  return {
    id: _cargoSeq++,
    label: k.label,
    family: k.family || 'cargo',
    shape: k.shape || 'crate',
    w: k.w,
    h: k.h,
    color: k.color,
    hp: k.hp,
    maxHp: k.hp,
  };
}

function makeInboundCargo() {
  // Forklift arrivals: mostly hold cargo; upgrades are uncommon (installs drive strip/swap)
  return makeCargo(Math.random() < 0.18 ? pick(UPGRADE_KINDS) : pick(HOLD_CARGO));
}

function pileId(row, col) {
  return `r${row}c${col}`;
}

/** Build 3×6 hardpoint grid (2 columns × 3 bays). */
function buildPileHardpoints() {
  const piles = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const meta = colMeta(col);
      piles.push({
        id: pileId(row, col),
        row,
        col,
        bay: meta.bay,
        bayId: meta.bayId,
        lane: meta.lane,
        role: rowRole(row),
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
    this.floorDrops = [];
    this._npcUid = 1;
    this._floorDropSeq = 1;
    this._shipPos = { x: 0, y: 0 };
    this._shipAngle = SHIP.SPAWN_ANGLE;
    this.crane = null;
    this._pressure = 0; // <0 need more cargo, >0 need less
    /** Per-bay door beacons: 'idle' | 'warning' | 'open' | 'steady' */
    this.bayBeacons = ['idle', 'idle', 'idle'];
    /**
     * Per-bay danger-lane lights: 'idle' | 'danger' | 'incoming' | 'departing' | 'elevator'
     * (incoming/departing = chase; elevator = steady at chase brightness)
     */
    this.bayLaneMode = ['idle', 'idle', 'idle'];
    /** 0 = sealed, 1 = fully open (leaf slide) */
    this.doorOpen = [0, 0, 0];
    /** Bay indices under launch/land / visitor ops lock */
    this._opsBays = new Set();
    /** Empty-bay cargo sweep after a visitor leaves (B1/B3) */
    this.bayClearing = [false, false, false];
    /** Pad rim yellow lights: 'off' | 'on' | 'flash' */
    this.padRimMode = ['off', 'off', 'off'];
    /** B2 turntable facing (matches docked ship nose; SHIP.SPAWN_ANGLE = north) */
    this.playerPadAngle = SHIP.SPAWN_ANGLE;
  }

  reset() {
    this.time = 0;
    this.npcs = [];
    this._spawnTimer = 0.4;
    this._sparkle = [];
    this._debris = [];
    this.floorDrops = [];
    this._npcUid = 1;
    this._floorDropSeq = 1;
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    this.bayBeacons = ['idle', 'idle', 'idle'];
    this.bayLaneMode = ['idle', 'idle', 'idle'];
    this.doorOpen = [0, 0, 0];
    this._opsBays = new Set();
    this.bayClearing = [false, false, false];
    this.padRimMode = ['off', 'off', 'off'];
    this.playerPadAngle = SHIP.SPAWN_ANGLE;
    this.playerBay = {
      x: 0,
      bayId: 'B2',
      bayIndex: 1,
      visitorId: 'player',
      shipState: null,
      service: null,
      seq: null,
    };
    this.sidePads = [
      rollSidePad(-BAY.SIDE_PAD_X, 'B1', 0),
      rollSidePad(BAY.SIDE_PAD_X, 'B3', 2),
    ];
    this.piles = buildPileHardpoints();
    this._seedCargo();
    this._resetCrane();
    this._beginCaptainService(this.playerBay);
    for (const pad of this.sidePads) {
      if (pad.visitorId) this._beginCaptainService(pad);
    }
    this._spawnMechanic();
    this._spawnMechanic();
    this._spawnForklift(Math.random() < 0.5 ? -1 : 1);
  }

  /** World anchor on B2 bay door face (for LAUNCH button). */
  getBayDoorAnchor(bayIndex = 1) {
    const cx = padCenters()[bayIndex] ?? 0;
    return {
      x: cx,
      y: -BAY.HALF_H + BAY.DOOR_H * 0.55,
      halfW: BAY.DOOR_HALF,
      doorH: BAY.DOOR_H,
    };
  }

  /**
   * Start departure / arrival ops on a bay: warning beacons, lane mode, crew evac.
   * @param {number} bayIndex
   * @param {'departing'|'incoming'|'elevator'} laneMode
   */
  beginOps(bayIndex, laneMode = 'departing') {
    this._opsBays.add(bayIndex);
    this.bayBeacons[bayIndex] = laneMode === 'elevator' ? 'steady' : 'warning';
    this.bayLaneMode[bayIndex] = laneMode;
    // Arrival flashes rim; departure / elevator / pad motion hold rim on
    this.padRimMode[bayIndex] = laneMode === 'incoming' ? 'flash' : 'on';
    // Player launch/land freezes the crane; side-bay visitor ops do not
    if (bayIndex === 1 && this.crane) this.crane.pause = 99;
    this._divertCraneFromBay(bayIndex);
    this._evacBayCrew(bayIndex);
  }

  setBeacon(bayIndex, mode) {
    this.bayBeacons[bayIndex] = mode;
  }

  setLaneMode(bayIndex, mode) {
    this.bayLaneMode[bayIndex] = mode;
  }

  setDoorOpen(bayIndex, amount) {
    this.doorOpen[bayIndex] = Math.max(0, Math.min(1, amount));
  }

  /** Pad rim yellow lights: 'off' | 'on' (steady) | 'flash' (arrival). */
  setPadRim(bayIndex, mode) {
    this.padRimMode[bayIndex] = mode;
  }

  /** B2 turntable facing angle (ship nose when locked to pad). */
  setPlayerPadAngle(angle) {
    this.playerPadAngle = angle;
  }

  /**
   * Clear ops on one bay, or all bays when bayIndex is omitted.
   * @param {number} [bayIndex]
   */
  clearOps(bayIndex) {
    const clearOne = (i) => {
      if (!this._opsBays.has(i)) return;
      this._opsBays.delete(i);
      this.bayBeacons[i] = 'idle';
      this.bayLaneMode[i] = 'idle';
      this.doorOpen[i] = 0;
      this.padRimMode[i] = 'off';
      if (i === 1 && this.crane) this.crane.pause = 0.2;
    };
    if (bayIndex == null) {
      for (const i of [...this._opsBays]) clearOne(i);
    } else {
      clearOne(bayIndex);
    }
  }

  _sidePadForBay(bayIndex) {
    return this.sidePads.find((p) => p.bayIndex === bayIndex) || null;
  }

  /** Side visitor pad or player B2 stub (captain checklist). */
  _servicePad(bayIndex) {
    if (bayIndex === 1) return this.playerBay;
    return this._sidePadForBay(bayIndex);
  }

  _allServicePads() {
    return [this.playerBay, ...this.sidePads].filter(Boolean);
  }

  /** Occupied neighbor pad, or player B2 while checklist wants inbound. */
  _bayAcceptsCargo(bay) {
    if (this.bayClearing[bay]) return false;
    if (this._opsBays.has(bay)) return false;
    const pad = this._servicePad(bay);
    if (bay === 1) {
      if (!pad?.service) return true;
      if (pad.service.phase === 'active') {
        return (
          this._serviceNeedsBringIn(pad).length > 0 ||
          this._serviceNeedsStaging(pad).some((it) => it.status === 'staging')
        );
      }
      return false;
    }
    if (!pad?.visitorId || pad.seq) return false;
    // During captain service, only accept inbound the checklist still needs brought in / lifted
    if (pad.service?.phase === 'active') {
      return (
        this._serviceNeedsBringIn(pad).length > 0 ||
        this._serviceNeedsStaging(pad).some((it) => it.status === 'staging')
      );
    }
    if (pad.service) return false;
    return true;
  }

  _bayNeedsInbound(bay) {
    if (!this._bayAcceptsCargo(bay)) return false;
    const south = this._bayPile(bay, 'in', ROW.S);
    if (!south || south.items.length >= PILE_CAP) return false;
    const pad = this._servicePad(bay);
    if (pad?.service?.phase === 'active') {
      return this._serviceNeedsBringIn(pad).length > 0;
    }
    return this._bayInboundStock(bay) < INBOUND_SOFT_CAP;
  }

  _bayPileCargoCount(bay) {
    let n = 0;
    for (const p of this.piles) {
      if (p.bay === bay) n += p.items.length;
    }
    return n;
  }

  /** Piles + floor drops + carriers still holding this bay's freight. */
  _bayHasResidualCargo(bay) {
    if (this._bayPileCargoCount(bay) > 0) return true;
    if (this.floorDrops?.some((d) => bayIndexFromX(d.x) === bay)) return true;
    for (const n of this.npcs) {
      if (!n.alive || !n.cargo) continue;
      if (n.cargo.serviceBay === bay) return true;
      if (n.bay === bay && n.cargo) return true;
    }
    if (this.crane?.carried) {
      const c = this.crane.carried;
      if (c.serviceBay === bay) return true;
      if (this.crane.dropoff?.bay === bay || this.crane.pickup?.bay === bay) return true;
    }
    return false;
  }

  _updateBayClearing() {
    for (const bay of [0, 2]) {
      if (!this.bayClearing[bay]) continue;
      if (!this._bayHasResidualCargo(bay)) this.bayClearing[bay] = false;
    }
  }

  _startBayClear(bay) {
    if (bay === 1) return;
    this.bayClearing[bay] = true;
    // Cancel mechanic jobs aimed at this pad
    for (const npc of this.npcs) {
      if (npc.kind !== 'mechanic') continue;
      if (npc.targetPad && Math.abs(npc.targetPad.x - (padCenters()[bay] || 0)) < 20) {
        this._clearTaskClaim(npc);
        npc.job = 'idle';
        npc.taskMode = 'despawn';
        npc.state = 'toExit';
      }
    }
  }

  _divertCraneFromBay(bayIndex) {
    const c = this.crane;
    if (!c) return;
    const touches = (pile) => pile && pile.bay === bayIndex;
    const floorInBay =
      c.pickup?.isFloorDrop && bayIndexFromX(c.pickup.x) === bayIndex;
    if (touches(c.pickup) || touches(c.dropoff) || floorInBay) {
      if (c.pickup?.isFloorDrop && c.pickup.floorDropId) {
        const drop = this.floorDrops.find((d) => d.id === c.pickup.floorDropId);
        if (drop && drop.claimNpc === 'crane') drop.claimNpc = null;
      }
      c.carried = null;
      c.phase = 'idle';
      c.pause = 0.15;
      c.pickup = this._bayPile(1, 'in', ROW.M);
      c.dropoff = c.pickup;
    }
  }

  /** Lit danger rectangle for a bay (matches floor running lights). */
  _dangerRect(bayIndex) {
    const cx = padCenters()[bayIndex] ?? 0;
    return {
      x0: cx - BAY_LANE_HALF,
      x1: cx + BAY_LANE_HALF,
      y0: -BAY.HALF_H + BAY.DOOR_H + 6,
      y1: DANGER_ZONE_SOUTH,
    };
  }

  _pointInDangerRect(x, y, bayIndex, pad = DANGER_ZONE_PAD) {
    const r = this._dangerRect(bayIndex);
    return x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad;
  }

  _inBayDangerZone(npc, bayIndex) {
    return this._pointInDangerRect(npc.x, npc.y, bayIndex);
  }

  _isBayOpsHot(bayIndex) {
    return this._opsBays.has(bayIndex);
  }

  _pointInAnyHotDanger(x, y, pad = DANGER_ZONE_PAD) {
    for (const bay of this._opsBays) {
      if (this._pointInDangerRect(x, y, bay, pad)) return bay;
    }
    return null;
  }

  _xInAnyHotDanger(x, pad = DANGER_ZONE_PAD) {
    for (const bay of this._opsBays) {
      const r = this._dangerRect(bay);
      if (x >= r.x0 - pad && x <= r.x1 + pad) return true;
    }
    return false;
  }

  /** Axis-aligned segment vs hot danger rects (sample along the path). */
  _segmentHitsAnyHotDanger(x0, y0, x1, y1, exceptBay = null) {
    if (!this._opsBays.size) return false;
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const bay = this._pointInAnyHotDanger(x, y, 2);
      if (bay != null && bay !== exceptBay) return true;
    }
    return false;
  }

  _segmentHitsBayDanger(x0, y0, x1, y1, bayIndex) {
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (this._pointInDangerRect(x, y, bayIndex, 2)) return true;
    }
    return false;
  }

  /** Last safe point on the segment before entering a hot rect. */
  _pointBeforeHotSegment(x0, y0, x1, y1, exceptBay = null) {
    if (!this._segmentHitsAnyHotDanger(x0, y0, x1, y1, exceptBay)) {
      return { x: x1, y: y1 };
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) * 0.5;
      const x = x0 + (x1 - x0) * mid;
      const y = y0 + (y1 - y0) * mid;
      const bay = this._pointInAnyHotDanger(x, y, 2);
      if (bay != null && bay !== exceptBay) hi = mid;
      else lo = mid;
    }
    return { x: x0 + (x1 - x0) * lo, y: y0 + (y1 - y0) * lo };
  }

  /** True when this mechanic is waiting to reclaim a floor drop still inside a hot bay. */
  _shouldHoldForHotDrop(npc) {
    if (npc.state !== 'toFloorDrop') return false;
    const drop = this.floorDrops.find(
      (d) => d.id === npc.floorDropId || d.id === npc.droppedCargoId
    );
    if (!drop) return false;
    return this._pointInAnyHotDanger(drop.x, drop.y, 0) != null;
  }

  /**
   * Next waypoint around hot danger rectangles toward (tx, ty).
   * When zones clear, callers path straight again (shorter through the bay).
   * @param {{ x: number, y: number } | null} prefer sticky prior waypoint
   */
  _skirtAroundHot(sx, sy, tx, ty, exceptBay = null, prefer = null) {
    if (!this._segmentHitsAnyHotDanger(sx, sy, tx, ty, exceptBay)) {
      return { x: tx, y: ty };
    }
    // Stick to a prior skirt point until reached (stops left/right ping-pong)
    if (
      prefer &&
      this._pointInAnyHotDanger(prefer.x, prefer.y, 2) == null &&
      this._npcInBacksplash(prefer.x, prefer.y) == null &&
      !this._segmentHitsAnyHotDanger(sx, sy, prefer.x, prefer.y, exceptBay) &&
      Math.hypot(sx - prefer.x, sy - prefer.y) > 4
    ) {
      return prefer;
    }

    const margin = DANGER_ZONE_PAD + 10;
    const goalSouth = ty >= BACKSPLASH_Y;
    const candidates = [];
    for (const bay of this._opsBays) {
      if (bay === exceptBay) continue;
      if (!this._segmentHitsBayDanger(sx, sy, tx, ty, bay)) continue;
      const r = this._dangerRect(bay);
      const left = r.x0 - margin;
      const right = r.x1 + margin;
      const south = r.y1 + margin;
      const north = Math.max(r.y0 - margin, -BAY.HALF_H + BAY.DOOR_H + 4);
      // Keep skirt on the goal's side of the blast wall when possible
      const gateSouth = Math.max(south, BACKSPLASH_Y + BACKSPLASH_BAND + 6);
      const gateNorth = Math.min(south - 4, BACKSPLASH_Y - BACKSPLASH_BAND - 6);
      for (const p of [
        { x: left, y: goalSouth ? gateSouth : gateNorth },
        { x: right, y: goalSouth ? gateSouth : gateNorth },
        { x: left, y: sy },
        { x: right, y: sy },
        { x: left, y: ty },
        { x: right, y: ty },
        { x: left, y: south },
        { x: right, y: south },
        { x: left, y: north },
        { x: right, y: north },
      ]) {
        if (this._pointInAnyHotDanger(p.x, p.y, 2) != null) continue;
        if (this._npcInBacksplash(p.x, p.y) != null) continue;
        if (this._segmentHitsAnyHotDanger(sx, sy, p.x, p.y, exceptBay)) continue;
        let cost = Math.hypot(p.x - sx, p.y - sy) + Math.hypot(tx - p.x, ty - p.y);
        const pSouth = p.y >= BACKSPLASH_Y;
        if (pSouth !== goalSouth) cost += 80;
        if (prefer && Math.hypot(p.x - prefer.x, p.y - prefer.y) < 8) cost -= 40;
        candidates.push({ p, cost });
      }
    }
    if (!candidates.length) {
      for (const bay of this._opsBays) {
        if (bay === exceptBay) continue;
        const r = this._dangerRect(bay);
        const left = r.x0 - margin;
        const right = r.x1 + margin;
        const y = goalSouth
          ? Math.max(r.y1 + margin, BACKSPLASH_Y + BACKSPLASH_BAND + 8)
          : Math.min(r.y1 - 8, BACKSPLASH_Y - BACKSPLASH_BAND - 8);
        for (const p of [
          { x: left, y },
          { x: right, y },
          { x: left, y: ty },
          { x: right, y: ty },
        ]) {
          if (this._pointInAnyHotDanger(p.x, p.y, 2) != null) continue;
          if (this._npcInBacksplash(p.x, p.y) != null) continue;
          return p;
        }
      }
      const side = tx >= sx ? 1 : -1;
      const y = goalSouth
        ? DANGER_ZONE_SOUTH + margin + 8
        : BACKSPLASH_Y - BACKSPLASH_BAND - 12;
      return { x: sx + side * 48, y };
    }
    candidates.sort((a, b) => a.cost - b.cost);
    return candidates[0].p;
  }

  /** Nearest floor point outside a bay's lit danger rectangle. */
  _nearestSafePoint(x, y, bayIndex) {
    const r = this._dangerRect(bayIndex);
    const pad = DANGER_ZONE_PAD + 6;
    const southY = Math.max(r.y1 + pad, BACKSPLASH_Y + BACKSPLASH_BAND + 8);
    const candidates = [
      { x, y: southY },
      { x: r.x0 - pad, y: Math.min(y, r.y1 - 4) },
      { x: r.x1 + pad, y: Math.min(y, r.y1 - 4) },
      { x: r.x0 - pad, y: southY },
      { x: r.x1 + pad, y: southY },
      { x: this._pickCorridorX(x, r.x0 - pad), y: southY },
      { x: this._pickCorridorX(x, r.x1 + pad), y: southY },
    ];
    let best = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
      if (this._pointInDangerRect(c.x, c.y, bayIndex, 0)) continue;
      if (this._npcInBacksplash(c.x, c.y) != null) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  _dropFloorCargo(npc) {
    if (!npc.cargo) return null;
    const drop = {
      id: `fd${this._floorDropSeq++}`,
      cargo: npc.cargo,
      x: npc.x + (npc.facing > 0 ? 4 : -4),
      y: npc.y + 2,
      droppedAt: this.time,
      ownerId: npc.uid,
      claimNpc: null,
    };
    this.floorDrops.push(drop);
    npc.droppedCargoId = drop.id;
    npc.cargo = null;
    return drop;
  }

  _abortMechanicForOps(npc) {
    if (npc.state === 'workWeld' || npc.state === 'workShip') {
      npc.hullTarget = null;
    }
    if (npc.cargo) this._dropFloorCargo(npc);
    this._clearTaskClaim(npc);
  }

  /** Pad still has a workable ship (not mid ops / elevator / empty). */
  _padWorkable(pad) {
    if (!pad) return false;
    const bay = typeof pad.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(pad.x);
    if (this._isBayOpsHot(bay)) return false;
    const svcPad = this._servicePad(bay);
    if (bay === 1) {
      // Player ship is always "here"; deck work only while checklist is active
      if (svcPad?.service && svcPad.service.phase !== 'active') return false;
      return true;
    }
    if (!svcPad?.visitorId) return false;
    if (svcPad.seq) return false;
    if (svcPad.service && svcPad.service.phase !== 'active') return false;
    return true;
  }

  _startClearHot(npc, bayIndex) {
    if (npc.kind !== 'mechanic') return;
    if (npc.state === 'clearHot' || npc.state === 'resumeWait') return;
    if (npc.state === 'emerge' || npc.state === 'descend') return;

    const lane = this.bayLaneMode[bayIndex];
    const dropDrama = lane === 'incoming' || lane === 'departing';
    const hullWork =
      npc.state === 'workWeld' ||
      npc.state === 'workShip' ||
      npc.state === 'toShip' ||
      npc.job === 'weld';

    if (!['clearHot', 'waitHot', 'resumeWait', 'flee', 'flinch'].includes(npc.state)) {
      npc.resumeState = npc.state === 'leaveHatch' ? 'toShip' : npc.state;
      npc._opsResumeJob = npc.job;
      npc._opsResumePad = npc.targetPad;
      npc._opsResumePile = npc.targetPile;
      npc._opsResumeBay = npc.bay;
    }

    if (dropDrama) {
      this._abortMechanicForOps(npc);
      // Don't resume mid-weld / mid-hull after a panic drop
      if (hullWork) {
        npc.resumeState = null;
        npc._opsResumeJob = null;
      }
    } else if (hullWork) {
      // Elevator (etc.): cancel hull work without dropping cargo; re-pick after clear
      npc.hullTarget = null;
      npc.resumeState = null;
      npc._opsResumeJob = null;
      if (npc.job === 'weld') {
        this._clearTaskClaim(npc);
        npc.job = 'idle';
      }
    }

    npc.clearBay = bayIndex;
    npc.safeSpot = this._nearestSafePoint(npc.x, npc.y, bayIndex);
    npc.state = 'clearHot';
    npc.stateT = 0;
    this._clearBacksplashCross(npc);
  }

  /** Mechanics inside the lit box scramble out. Forklifts ignore bay danger. */
  _evacBayCrew(bayIndex) {
    for (const npc of this.npcs) {
      if (npc.kind !== 'mechanic') continue;
      if (!this._inBayDangerZone(npc, bayIndex)) continue;
      this._startClearHot(npc, bayIndex);
    }
  }

  /** Keep pushing anyone still in the danger zone out during ops. */
  tickEvac(bayIndex) {
    for (const npc of this.npcs) {
      if (npc.kind !== 'mechanic') continue;
      if (!this._inBayDangerZone(npc, bayIndex)) continue;
      if (npc.state === 'clearHot' || npc.state === 'resumeWait') continue;
      this._startClearHot(npc, bayIndex);
    }
  }

  isBayDangerClear(bayIndex) {
    return !this.npcs.some(
      (n) => n.kind === 'mechanic' && n.alive && this._inBayDangerZone(n, bayIndex)
    );
  }

  _resetPadMotion(pad) {
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.shipAngle = pad.visitorId ? FACE_NORTH : FACE_SOUTH;
    pad.padAngle = pad.visitorId ? FACE_NORTH : FACE_SOUTH;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    if (pad.visitorId) pad.thrusters = makeVisitorThrusters(pad.visitorId);
    else pad.thrusters = null;
    clearVisitorThrusters(pad);
  }

  _fireVisitorManeuverBurst(pad, power) {
    if (!pad.visitorId) return;
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(pad.visitorId);
    clearVisitorThrusters(pad);
    const prop = getVisitorPropulsion(pad.visitorId);
    for (const m of prop.thrusters) pad.thrusters[m.key] = power;
  }

  _fireVisitorNoseBrake(pad, power) {
    if (!pad.visitorId) return;
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(pad.visitorId);
    clearVisitorThrusters(pad);
    const prop = getVisitorPropulsion(pad.visitorId);
    const noses = prop.thrusters.filter((m) => m.key.startsWith('nose'));
    if (noses.length) {
      for (const m of noses) pad.thrusters[m.key] = power;
    } else {
      // No nose thrusters — hover on laterals + light engine for settle cue
      for (const m of prop.thrusters) pad.thrusters[m.key] = power * 0.55;
      pad.thrusters.mainEngine = power * 0.25;
    }
  }

  _fireVisitorEngine(pad, power) {
    if (!pad.visitorId) return;
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(pad.visitorId);
    clearVisitorThrusters(pad);
    pad.thrusters.mainEngine = power;
  }

  _setPadCooldown(pad, busy) {
    pad.cooldown = busy
      ? rand(HANGAR.VISITOR_COOLDOWN_BUSY_MIN, HANGAR.VISITOR_COOLDOWN_BUSY_MAX)
      : rand(HANGAR.VISITOR_COOLDOWN_EMPTY_MIN, HANGAR.VISITOR_COOLDOWN_EMPTY_MAX);
  }

  _finishVisitorLeave(pad, { clearCargo = true } = {}) {
    pad.visitorId = null;
    pad.thrusters = null;
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    pad.padAngle = FACE_SOUTH;
    pad.shipAngle = FACE_SOUTH;
    pad.shipState = null;
    pad.service = null;
    this.clearOps(pad.bayIndex);
    pad.seq = null;
    if (clearCargo) this._startBayClear(pad.bayIndex);
    this._setPadCooldown(pad, false);
  }

  _finishVisitorArrive(pad) {
    pad.padAngle = FACE_NORTH;
    pad.shipAngle = FACE_NORTH;
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    clearVisitorThrusters(pad);
    this.clearOps(pad.bayIndex);
    pad.seq = null;
    this._beginCaptainService(pad);
  }

  /** Roll need meters + captain checklist (visitors + interim B2 ambient). */
  _beginCaptainService(pad) {
    if (!pad?.visitorId) return;
    const shipState = {
      fuel: rand(0.05, 1),
      hull: rand(0.05, 1),
      ammo: rand(0.05, 1),
      cargoSpace: rand(0.05, 1),
    };
    pad.shipState = shipState;
    const items = [];
    const push = (type, extra = {}) => {
      items.push({
        id: `svc${_serviceSeq++}`,
        type,
        status: 'pending',
        kindLabel: null,
        cargoId: null,
        ...extra,
      });
    };

    if (Math.random() < needRequestChance(1 - shipState.fuel)) {
      push('refuel', { kindLabel: 'FUEL', priority: 2 });
    }
    if (Math.random() < needRequestChance(1 - shipState.hull)) {
      push('repair', { priority: 3 });
    }
    if (Math.random() < needRequestChance(1 - shipState.ammo)) {
      push('reload', { kindLabel: 'AMMO', priority: 2 });
    }
    if (Math.random() < needRequestChance(shipState.cargoSpace)) {
      push('loadCargo', {
        kindLabel: pick(['CRATE', 'ORE', 'INGOT', 'BARREL', 'COIL', 'TANK']),
        priority: 2,
      });
    }
    if (Math.random() < needRequestChance(1 - shipState.cargoSpace)) {
      push('unloadCargo', { priority: 1 });
    }
    const upgradeCount = (Math.random() * 4) | 0; // 0–3
    for (let i = 0; i < upgradeCount; i++) {
      push('upgrade', { kindLabel: pick(UPGRADE_KINDS).label, priority: 2 });
    }

    const isPlayer = pad.bayIndex === 1;
    if (!items.length) {
      if (isPlayer) {
        // Empty roll — wait then reroll (player owns exit; no elevator fiction)
        pad.service = {
          items: [],
          phase: 'reroll',
          settleT: 0,
          settleMax: 0,
          dwellT: 0,
          dwellMax: 0,
          rerollT: 0,
          rerollMax: rand(
            HANGAR.PLAYER_SERVICE_REROLL_MIN,
            HANGAR.PLAYER_SERVICE_REROLL_MAX
          ),
          elevatorOnly: false,
        };
        return;
      }
      push('elevatorTransfer', { priority: 0 });
    }

    items.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
    pad.service = {
      items,
      phase: 'settle',
      settleT: 0,
      settleMax: rand(
        HANGAR.VISITOR_ARRIVE_SETTLE_DWELL_MIN,
        HANGAR.VISITOR_ARRIVE_SETTLE_DWELL_MAX
      ),
      dwellT: 0,
      dwellMax: rand(HANGAR.VISITOR_SERVICE_DWELL_MIN, HANGAR.VISITOR_SERVICE_DWELL_MAX),
      rerollT: 0,
      rerollMax: rand(
        HANGAR.PLAYER_SERVICE_REROLL_MIN,
        HANGAR.PLAYER_SERVICE_REROLL_MAX
      ),
      elevatorOnly: items.length === 1 && items[0].type === 'elevatorTransfer',
    };
  }

  _sidePadService(bay) {
    return this._servicePad(bay)?.service || null;
  }

  _serviceNeedsStaging(pad) {
    if (!pad?.service || pad.service.phase !== 'active') return [];
    return pad.service.items.filter(
      (it) =>
        it.status !== 'done' &&
        ['refuel', 'reload', 'loadCargo', 'upgrade'].includes(it.type) &&
        (it.status === 'pending' || it.status === 'staging' || it.status === 'ready')
    );
  }

  /** Needs a fresh forklift bring-in (not already ordered / sitting on deck). */
  _serviceNeedsBringIn(pad) {
    return this._serviceNeedsStaging(pad).filter((it) => it.status === 'pending');
  }

  _cargoMatchesServiceItem(cargo, item, bay) {
    if (!cargo || !item) return false;
    if (cargo.serviceKey === item.id) return true;
    return !!(
      item.kindLabel &&
      cargo.label === item.kindLabel &&
      cargo.serviceBay === bay
    );
  }

  _findServiceCargoInWorld(item, bay) {
    const match = (c) => this._cargoMatchesServiceItem(c, item, bay);
    for (const p of this.piles) {
      if (p.items.some(match)) return true;
    }
    if (this.floorDrops?.some((d) => match(d.cargo))) return true;
    if (this.npcs.some((n) => match(n.cargo))) return true;
    if (match(this.crane?.carried)) return true;
    return false;
  }

  _makeServiceInboundCargo(pad) {
    const needs = this._serviceNeedsBringIn(pad);
    if (!needs.length) return null;
    const it = pick(needs);
    it.status = 'staging';
    let cargo;
    if (it.type === 'upgrade') {
      const kind = UPGRADE_KINDS.find((k) => k.label === it.kindLabel) || pick(UPGRADE_KINDS);
      cargo = makeCargo(kind);
    } else {
      const kind =
        HOLD_CARGO.find((k) => k.label === it.kindLabel) ||
        HOLD_CARGO.find((k) => k.label === 'CRATE');
      cargo = makeCargo(kind);
    }
    cargo.serviceKey = it.id;
    cargo.serviceBay = pad.bayIndex;
    it.cargoId = cargo.id;
    return cargo;
  }

  /** Prefer checklist-tagged freight when loading a service bay. */
  _takeServicePileCargo(pile, bay, job) {
    if (!pile?.items?.length) return null;
    const svc = this._servicePad(bay)?.service;
    if (!svc || svc.phase !== 'active') {
      return pile.items.pop();
    }
    const wantTypes =
      job === 'installUpgrade'
        ? ['upgrade']
        : ['refuel', 'reload', 'loadCargo'];
    const pending = svc.items.filter(
      (it) => wantTypes.includes(it.type) && it.status !== 'done'
    );
    if (!pending.length) return null;
    const idx = pile.items.findIndex((c) => {
      if (pending.some((it) => it.id === c.serviceKey)) return true;
      return pending.some((it) => it.kindLabel && c.label === it.kindLabel);
    });
    if (idx < 0) return null;
    return pile.items.splice(idx, 1)[0];
  }

  _completeLoadService(bay, cargo, job) {
    if (cargo?.serviceKey) {
      this._completeServiceKey(cargo.serviceKey);
      return;
    }
    if (job === 'installUpgrade') {
      this._completeServiceType(bay, 'upgrade');
      return;
    }
    if (cargo?.label === 'FUEL') this._completeServiceType(bay, 'refuel');
    else if (cargo?.label === 'AMMO') this._completeServiceType(bay, 'reload');
    else this._completeServiceType(bay, 'loadCargo');
  }

  _completeServiceItem(pad, item) {
    if (!item || item.status === 'done') return;
    item.status = 'done';
    item.cargoId = null;
  }

  _completeServiceKey(serviceKey) {
    if (!serviceKey) return;
    for (const pad of this._allServicePads()) {
      const item = pad.service?.items?.find((it) => it.id === serviceKey);
      if (item) {
        this._completeServiceItem(pad, item);
        return;
      }
    }
  }

  _completeServiceType(bay, type) {
    const pad = this._servicePad(bay);
    const item = pad?.service?.items?.find(
      (it) => it.type === type && it.status !== 'done'
    );
    if (item) this._completeServiceItem(pad, item);
  }

  /** Player blew up staged freight — re-order the same checklist need. */
  _restageServiceCargo(cargo) {
    if (!cargo?.serviceKey) return;
    for (const pad of this._allServicePads()) {
      const item = pad.service?.items?.find((it) => it.id === cargo.serviceKey);
      if (!item || item.status === 'done') continue;
      item.status = 'pending';
      item.cargoId = null;
      // Don't yank a visitor that's already departing / lowering
      if (pad.seq) return;
      if (
        pad.service.phase === 'dwell' ||
        pad.service.phase === 'done' ||
        pad.service.phase === 'reroll'
      ) {
        pad.service.phase = 'active';
        pad.service.dwellT = 0;
        pad.service.rerollT = 0;
      }
      return;
    }
  }

  _serviceAllDone(pad) {
    const items = pad.service?.items;
    if (!items || !items.length) return true;
    return items.every((it) => it.status === 'done');
  }

  _syncServiceStaging(pad) {
    if (!pad.service || pad.service.phase !== 'active') return;
    for (const it of pad.service.items) {
      if (it.status === 'done' || it.type === 'repair' || it.type === 'unloadCargo') continue;
      if (!['refuel', 'reload', 'loadCargo', 'upgrade'].includes(it.type)) continue;
      const row = it.type === 'upgrade' ? ROW.N : ROW.M;
      const south = this._bayPile(pad.bayIndex, 'in', ROW.S);
      const dest = this._bayPile(pad.bayIndex, 'in', row);
      const match = (c) => this._cargoMatchesServiceItem(c, it, pad.bayIndex);
      const inWorld = this._findServiceCargoInWorld(it, pad.bayIndex);
      // Lost anywhere (including exported / wrong bay then hauled off) → re-order
      if (
        (it.status === 'staging' || it.status === 'ready' || it.status === 'active') &&
        !inWorld
      ) {
        it.status = 'pending';
        it.cargoId = null;
        continue;
      }
      if (dest?.items?.some(match)) {
        it.status = 'ready';
      } else if (south?.items?.some(match) || inWorld) {
        if (it.status === 'pending') it.status = 'staging';
      }
    }
  }

  /**
   * @param {{ exitOnComplete?: boolean }} opts
   *   Visitors exit after dwell. Player B2 rerolls after a long pause (player owns launch).
   */
  _updateCaptainService(pad, dt, { exitOnComplete = true } = {}) {
    const svc = pad.service;
    if (!svc || !pad.visitorId || pad.seq) return;

    if (svc.phase === 'settle') {
      svc.settleT += dt;
      if (svc.settleT >= svc.settleMax) {
        if (svc.elevatorOnly) {
          svc.phase = 'dwell';
          svc.dwellT = 0;
          svc.dwellMax = rand(1.2, 2.8);
          svc.items.forEach((it) => {
            it.status = 'done';
          });
        } else {
          svc.phase = 'active';
        }
      }
      return;
    }

    if (svc.phase === 'active') {
      this._syncServiceStaging(pad);
      if (this._serviceAllDone(pad)) {
        svc.phase = 'dwell';
        svc.dwellT = 0;
        svc.dwellMax = rand(
          HANGAR.VISITOR_SERVICE_DWELL_MIN,
          HANGAR.VISITOR_SERVICE_DWELL_MAX
        );
      }
      return;
    }

    if (svc.phase === 'dwell') {
      svc.dwellT += dt;
      if (svc.dwellT < svc.dwellMax) return;
      if (exitOnComplete) {
        svc.phase = 'done';
        const forceElev = svc.elevatorOnly;
        const useElev =
          forceElev || Math.random() < HANGAR.VISITOR_ELEVATOR_CHANCE;
        this._startVisitorSeq(pad, useElev ? 'lower' : 'depart');
      } else {
        svc.phase = 'reroll';
        svc.rerollT = 0;
        svc.rerollMax = rand(
          HANGAR.PLAYER_SERVICE_REROLL_MIN,
          HANGAR.PLAYER_SERVICE_REROLL_MAX
        );
      }
      return;
    }

    if (svc.phase === 'reroll') {
      svc.rerollT += dt;
      if (svc.rerollT >= svc.rerollMax) this._beginCaptainService(pad);
    }
  }

  _updateVisitorService(pad, dt) {
    this._updateCaptainService(pad, dt, { exitOnComplete: true });
  }

  _updatePlayerBayService(dt) {
    if (!this.playerBay) return;
    if (!this.playerBay.service) this._beginCaptainService(this.playerBay);
    this._updateCaptainService(this.playerBay, dt, { exitOnComplete: false });
  }

  _tickVisitorSeq(pad, dt) {
    const s = pad.seq;
    if (!s) return;
    s.t += dt;
    this.tickEvac(pad.bayIndex);

    if (s.kind === 'depart') this._tickVisitorDepart(pad, s, dt);
    else if (s.kind === 'arrive') this._tickVisitorArrive(pad, s, dt);
    else if (s.kind === 'lower') this._tickVisitorLower(pad, s, dt);
    else if (s.kind === 'raiseLaunch') this._tickVisitorRaiseLaunch(pad, s, dt);
    else if (s.kind === 'raiseArrive') this._tickVisitorRaiseArrive(pad, s, dt);
  }

  _updateVisitorTraffic(dt) {
    for (const pad of this.sidePads) {
      if (pad.seq) {
        this._tickVisitorSeq(pad, dt);
        continue;
      }
      if (this._opsBays.has(pad.bayIndex)) continue;
      if (this.bayClearing[pad.bayIndex]) {
        pad.cooldown = Math.max(pad.cooldown, 1.5);
        continue;
      }

      if (pad.visitorId) {
        if (!pad.service) this._beginCaptainService(pad);
        this._updateVisitorService(pad, dt);
        continue;
      }

      pad.cooldown -= dt;
      if (pad.cooldown > 0) continue;

      if (this._bayPileCargoCount(pad.bayIndex) > 0) {
        this._startBayClear(pad.bayIndex);
        pad.cooldown = 2;
        continue;
      }

      // Empty bay: door arrive vs elevator raise
      if (Math.random() < HANGAR.VISITOR_EMPTY_ELEVATOR_CHANCE) {
        const kind =
          Math.random() < HANGAR.VISITOR_RAISE_LAUNCH_CHANCE
            ? 'raiseLaunch'
            : 'raiseArrive';
        this._startVisitorSeq(pad, kind);
      } else {
        this._startVisitorSeq(pad, 'arrive');
      }
    }
  }

  _startVisitorSeq(pad, kind) {
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    clearVisitorThrusters(pad);

    if (kind === 'arrive') {
      pad.visitorId = pickVisitorId();
      pad.thrusters = makeVisitorThrusters(pad.visitorId);
      pad.padAngle = FACE_SOUTH;
      pad.shipAngle = FACE_SOUTH;
      pad.shipY = HANGAR.LAND_START_Y;
      pad.shipHover = 1;
      pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
      pad.shipVy = HANGAR.VISITOR_APPROACH_SPEED;
      pad.service = null;
      pad.shipState = null;
      this.beginOps(pad.bayIndex, 'incoming');
      this.setDoorOpen(pad.bayIndex, 1);
      this.setBeacon(pad.bayIndex, 'open');
      pad.seq = { kind, phase: 'approach', t: 0 };
    } else if (kind === 'depart') {
      pad.padAngle = FACE_NORTH;
      pad.shipAngle = FACE_NORTH;
      this.beginOps(pad.bayIndex, 'departing');
      pad.seq = { kind, phase: 'warn', t: 0 };
    } else if (kind === 'lower') {
      pad.padAngle = FACE_NORTH;
      pad.shipAngle = FACE_NORTH;
      this.beginOps(pad.bayIndex, 'elevator');
      pad.seq = { kind, phase: 'warn', t: 0 };
    } else if (kind === 'raiseLaunch' || kind === 'raiseArrive') {
      pad.visitorId = null;
      pad.thrusters = null;
      pad.service = null;
      pad.shipState = null;
      pad.padAngle = FACE_SOUTH;
      pad.shipAngle = FACE_SOUTH;
      this.beginOps(pad.bayIndex, 'elevator');
      pad.seq = { kind, phase: 'warn', t: 0 };
    }
  }

  _tickVisitorDepart(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        clearVisitorThrusters(pad);
        if (s.t > 1.2) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        clearVisitorThrusters(pad);
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 3.2) {
          s.phase = 'doors';
          s.t = 0;
          this.setBeacon(pad.bayIndex, 'open');
        }
        break;
      case 'doors':
        clearVisitorThrusters(pad);
        this.setDoorOpen(pad.bayIndex, Math.min(1, s.t / HANGAR.VISITOR_DOOR_TIME));
        if (s.t > HANGAR.VISITOR_DOOR_TIME + 0.15) {
          s.phase = 'lift';
          s.t = 0;
        }
        break;
      case 'lift': {
        const u = smoothstep(s.t / HANGAR.VISITOR_LIFT_TIME);
        pad.shipHover = u;
        pad.shipScale = 1 + u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst = s.t < 0.35 ? HANGAR.HOVER_BURST_POWER : Math.max(0, 0.55 - (s.t - 0.35));
        if (burst > 0.02) this._fireVisitorManeuverBurst(pad, burst);
        else clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_LIFT_TIME) {
          pad.shipHover = 1;
          pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
          s.phase = 'thrust';
          s.t = 0;
          pad.shipVy = 0;
        }
        break;
      }
      case 'thrust': {
        const power = Math.min(1.15, 0.4 + s.t * 0.55);
        this._fireVisitorEngine(pad, power);
        pad.shipVy -= HANGAR.VISITOR_THRUST_ACCEL * dt;
        pad.shipY += pad.shipVy * dt;
        pad.shipHover = 1;
        pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
        pad.shipAngle = FACE_NORTH;
        pad.padAngle = FACE_NORTH;
        if (pad.shipY < HANGAR.LAUNCH_EXIT_Y || s.t > 5) {
          s.phase = 'doorsClose';
          s.t = 0;
          pad.visitorId = null;
          pad.thrusters = null;
          pad.shipY = 0;
          pad.shipHover = 0;
          pad.shipScale = 1;
          pad.shipVy = 0;
          this.setBeacon(pad.bayIndex, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pad.bayIndex, Math.max(0, 1 - s.t / 1.3));
        if (s.t > 1.35) {
          s.phase = 'turnEmpty';
          s.t = 0;
        }
        break;
      case 'turnEmpty': {
        // Pad arrow north → south after departure
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        pad.padAngle = FACE_NORTH + (FACE_SOUTH - FACE_NORTH) * u;
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          pad.padAngle = FACE_SOUTH;
          this._finishVisitorLeave(pad);
        }
        break;
      }
      default:
        break;
    }
  }

  _tickVisitorArrive(pad, s, dt) {
    switch (s.phase) {
      case 'approach': {
        // Soft brake as we near the pad (nose-south)
        if (pad.shipY > -70) {
          this._fireVisitorNoseBrake(pad, 0.9);
          pad.shipVy = Math.max(12, pad.shipVy - 90 * dt);
        } else {
          clearVisitorThrusters(pad);
        }
        pad.shipY += pad.shipVy * dt;
        pad.shipAngle = FACE_SOUTH;
        pad.padAngle = FACE_SOUTH;
        if (pad.shipY > -6) {
          pad.shipY = 0;
          pad.shipVy = 0;
          s.phase = 'settle';
          s.t = 0;
        }
        break;
      }
      case 'settle': {
        const u = smoothstep(s.t / HANGAR.VISITOR_LIFT_TIME);
        pad.shipHover = 1 - u;
        pad.shipScale = HANGAR.VISITOR_HOVER_SCALE - u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst = s.t < 0.35 ? 0.95 : Math.max(0, 0.5 - (s.t - 0.35));
        if (burst > 0.02) this._fireVisitorManeuverBurst(pad, burst);
        else clearVisitorThrusters(pad);
        pad.shipAngle = FACE_SOUTH;
        pad.padAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_LIFT_TIME) {
          pad.shipHover = 0;
          pad.shipScale = 1;
          clearVisitorThrusters(pad);
          s.phase = 'turn';
          s.t = 0;
        }
        break;
      }
      case 'turn': {
        // Pad + ship: south → north (same as B2 turntable)
        this.setPadRim(pad.bayIndex, 'on');
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        const angle = FACE_SOUTH + (FACE_NORTH - FACE_SOUTH) * u;
        pad.shipAngle = angle;
        pad.padAngle = angle;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          pad.shipAngle = FACE_NORTH;
          pad.padAngle = FACE_NORTH;
          s.phase = 'doorsClose';
          s.t = 0;
          this.setBeacon(pad.bayIndex, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pad.bayIndex, Math.max(0, 1 - s.t / 1.3));
        if (s.t > 1.4) this._finishVisitorArrive(pad);
        break;
      default:
        break;
    }
  }

  _tickVisitorLower(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        clearVisitorThrusters(pad);
        if (s.t > 1.0) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        clearVisitorThrusters(pad);
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 3.0) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        pad.padDrop = u;
        pad.shipHover = 0;
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.visitorId = null;
          pad.thrusters = null;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        pad.padAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME) {
          s.phase = 'riseEmpty';
          s.t = 0;
        }
        break;
      case 'riseEmpty': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        pad.padDrop = 1 - u;
        pad.padAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          pad.padDrop = 0;
          this._finishVisitorLeave(pad);
        }
        break;
      }
      default:
        break;
    }
  }

  _tickVisitorRaiseLaunch(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        if (s.t > 0.9) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 2.8) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        pad.padDrop = u;
        pad.padAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME * 0.85) {
          pad.visitorId = pickVisitorId();
          pad.thrusters = makeVisitorThrusters(pad.visitorId);
          pad.padAngle = FACE_NORTH;
          pad.shipAngle = FACE_NORTH;
          s.phase = 'riseShip';
          s.t = 0;
        }
        break;
      case 'riseShip': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        pad.padDrop = 1 - u;
        pad.shipHover = 0;
        pad.shipScale = 1;
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          pad.padDrop = 0;
          this.setLaneMode(pad.bayIndex, 'departing');
          this.setBeacon(pad.bayIndex, 'warning');
          s.phase = 'doors';
          s.t = 0;
        }
        break;
      }
      case 'doors':
        clearVisitorThrusters(pad);
        this.setDoorOpen(pad.bayIndex, Math.min(1, s.t / 1.1));
        if (s.t > 1.15) {
          this.setBeacon(pad.bayIndex, 'open');
          s.phase = 'lift';
          s.t = 0;
        }
        break;
      case 'lift': {
        const u = smoothstep(s.t / (HANGAR.VISITOR_LIFT_TIME * 0.75));
        pad.shipHover = u;
        pad.shipScale = 1 + u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst = s.t < 0.28 ? HANGAR.HOVER_BURST_POWER : Math.max(0, 0.45 - (s.t - 0.28));
        if (burst > 0.02) this._fireVisitorManeuverBurst(pad, burst);
        else clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_LIFT_TIME * 0.75) {
          s.phase = 'thrust';
          s.t = 0;
          pad.shipVy = 0;
        }
        break;
      }
      case 'thrust': {
        const power = Math.min(1.2, 0.5 + s.t * 0.7);
        this._fireVisitorEngine(pad, power);
        pad.shipVy -= HANGAR.VISITOR_THRUST_ACCEL * 1.15 * dt;
        pad.shipY += pad.shipVy * dt;
        pad.shipHover = 1;
        pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
        pad.shipAngle = FACE_NORTH;
        pad.padAngle = FACE_NORTH;
        if (pad.shipY < HANGAR.LAUNCH_EXIT_Y || s.t > 4.5) {
          s.phase = 'doorsClose';
          s.t = 0;
          pad.visitorId = null;
          pad.thrusters = null;
          pad.shipY = 0;
          pad.shipHover = 0;
          pad.shipScale = 1;
          pad.shipVy = 0;
          this.setBeacon(pad.bayIndex, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pad.bayIndex, Math.max(0, 1 - s.t / 1.2));
        if (s.t > 1.25) {
          s.phase = 'turnEmpty';
          s.t = 0;
        }
        break;
      case 'turnEmpty': {
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        pad.padAngle = FACE_NORTH + (FACE_SOUTH - FACE_NORTH) * u;
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          pad.padAngle = FACE_SOUTH;
          this._finishVisitorLeave(pad, { clearCargo: false });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Elevator raise that settles for captain service (no immediate launch). */
  _tickVisitorRaiseArrive(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        if (s.t > 0.9) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 2.8) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        pad.padDrop = u;
        pad.padAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME * 0.85) {
          pad.visitorId = pickVisitorId();
          pad.thrusters = makeVisitorThrusters(pad.visitorId);
          pad.padAngle = FACE_NORTH;
          pad.shipAngle = FACE_NORTH;
          s.phase = 'riseShip';
          s.t = 0;
        }
        break;
      case 'riseShip': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        pad.padDrop = 1 - u;
        pad.shipHover = 0;
        pad.shipScale = 1;
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          pad.padDrop = 0;
          this._finishVisitorArrive(pad);
        }
        break;
      }
      default:
        break;
    }
  }

  _seedCargo() {
    // Checklist-driven inbound for all bays — don't pre-stock piles
  }

  _pileById(id) {
    return this.piles.find((p) => p.id === id) || null;
  }

  _pileAt(row, col) {
    return this.piles.find((p) => p.row === row && p.col === col) || null;
  }

  _pilesInRow(row) {
    return this.piles.filter((p) => p.row === row);
  }

  _bayPile(bay, lane, row) {
    const col = bay * 2 + (lane === 'out' ? 1 : 0);
    return this._pileAt(row, col);
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

  _bayInboundStock(bay) {
    let n = 0;
    for (const row of [ROW.N, ROW.M, ROW.S]) {
      n += this._bayPile(bay, 'in', row)?.items.length || 0;
    }
    return n;
  }

  _anyBayNeedsInbound() {
    for (let bay = 0; bay < 3; bay++) {
      if (this._bayNeedsInbound(bay)) return true;
    }
    return false;
  }

  /** Unique claim key so two crew can't take the same job/pile. */
  _taskClaimKey(job, pile, bay = null) {
    if (pile?.id) return `${job}:${pile.id}`;
    if (bay != null) return `${job}:b${bay}`;
    return `${job}`;
  }

  _claimedTaskKeys(exceptNpc = null) {
    const keys = new Set();
    for (const n of this.npcs) {
      if (!n.alive || n === exceptNpc) continue;
      if (n.claimKey) keys.add(n.claimKey);
    }
    return keys;
  }

  _applyTaskClaim(npc, job, pile, bay = null) {
    npc.claimKey = this._taskClaimKey(job, pile, bay);
  }

  _clearTaskClaim(npc) {
    npc.claimKey = null;
  }

  _filterUnclaimed(tasks, exceptNpc = null) {
    const claimed = this._claimedTaskKeys(exceptNpc);
    return tasks.filter((t) => {
      const key = this._taskClaimKey(t.job, t.targetPile, t.bay);
      return !claimed.has(key);
    });
  }

  /**
   * Crane moves: doable (src has item + dest has room) or blocked (src has item, dest full).
   * Clearing a full pile that others are waiting on is prioritized.
   */
  _enumerateCraneTasks() {
    const tasks = [];
    const push = (pickup, dropoff, weight = 1) => {
      if (!pickup || !dropoff || pickup.id === dropoff.id) return;
      if (!pickup.items.length) return;
      const full = dropoff.items.length >= PILE_CAP;
      tasks.push({
        pickup,
        dropoff,
        weight,
        status: full ? 'blocked' : 'doable',
        clears: pickup.items.length >= PILE_CAP,
      });
    };

    for (let bay = 0; bay < 3; bay++) {
      const inS = this._bayPile(bay, 'in', ROW.S);
      const inM = this._bayPile(bay, 'in', ROW.M);
      const inN = this._bayPile(bay, 'in', ROW.N);
      const outS = this._bayPile(bay, 'out', ROW.S);
      const outM = this._bayPile(bay, 'out', ROW.M);
      const outN = this._bayPile(bay, 'out', ROW.N);
      const clearing = !!this.bayClearing[bay];

      // Empty-bay sweep: dump every hardpoint down to south-out for forklift haul-off
      if (clearing) {
        push(inS, outS, 16);
        push(inM, outS, 16);
        push(inN, outS, 16);
        push(outM, outS, 16);
        push(outN, outS, 16);
        continue;
      }

      // Inbound lift: don't keep stuffing mid/top that are already stocked
      if (inS?.items.length && this._bayAcceptsCargo(bay)) {
        const svcPad = this._servicePad(bay);
        const svc = svcPad?.service;
        const svcActive = svc?.phase === 'active';
        if (svcActive) {
          const pending = this._serviceNeedsStaging(svcPad).filter(
            (it) => it.status === 'pending' || it.status === 'staging'
          );
          const liftIdx = inS.items.findIndex(
            (c) =>
              pending.some((it) => this._cargoMatchesServiceItem(c, it, bay))
          );
          if (liftIdx >= 0) {
            if (liftIdx !== inS.items.length - 1) {
              const [item] = inS.items.splice(liftIdx, 1);
              inS.items.push(item);
            }
            const top = inS.items[inS.items.length - 1];
            const svcBoost = top.serviceKey ? 6 : 0;
            if (top.family === 'upgrade') {
              const nCount = inN?.items.length || 0;
              if (nCount < PILE_CAP) push(inS, inN, (nCount === 0 ? 5 : 2) + svcBoost);
            } else {
              const mCount = inM?.items.length || 0;
              if (mCount < PILE_CAP) push(inS, inM, (mCount < 2 ? 5 : 1) + svcBoost);
            }
          } else {
            // Non-matching south freight blocks checklist bring-in — sweep it out
            push(inS, outS, 10);
          }
        } else {
          const top = inS.items[inS.items.length - 1];
          const svcBoost = top.serviceKey ? 6 : 0;
          if (top.family === 'upgrade') {
            const nCount = inN?.items.length || 0;
            if (nCount < PILE_CAP) push(inS, inN, (nCount === 0 ? 5 : 2) + svcBoost);
          } else {
            const mCount = inM?.items.length || 0;
            if (mCount < PILE_CAP) push(inS, inM, (mCount < 2 ? 5 : 1) + svcBoost);
          }
        }
      }

      // Outbound lower to storage
      push(outN, outS, 4);
      push(outM, outS, 4);

      // Cap clears — never dump visitor checklist freight off-station
      const safeExport = (pile) => {
        if (!pile?.items.length) return false;
        const top = pile.items[pile.items.length - 1];
        return !top.serviceKey;
      };
      if (inM?.items.length >= PILE_CAP && safeExport(inM)) push(inM, outS, 12);
      if (inN?.items.length >= PILE_CAP && safeExport(inN)) push(inN, outS, 12);
      if (outM?.items.length >= PILE_CAP) push(outM, outS, 12);
      if (outN?.items.length >= PILE_CAP) push(outN, outS, 12);

      if (this._pressure > 0) {
        if (safeExport(inM)) push(inM, outS, 2);
        if (safeExport(inN)) push(inN, outS, 2);
      }
    }
    return tasks;
  }

  _pickWeighted(tasks) {
    if (!tasks.length) return null;
    const total = tasks.reduce((s, t) => s + (t.weight || 1), 0);
    let r = Math.random() * total;
    for (const t of tasks) {
      r -= t.weight || 1;
      if (r <= 0) return t;
    }
    return tasks[0];
  }

  /**
   * @returns {{ mode: 'work'|'linger'|'idle', pickup?: object, dropoff?: object }}
   */
  _pickCraneJob() {
    // Prefer reclaiming aged unclaimed floor drops (outside hot bays)
    const floorJob = this._pickFloorDropCraneJob();
    if (floorJob) return floorJob;

    const tasks = this._enumerateCraneTasks();
    const doable = tasks.filter((t) => t.status === 'doable');
    const blocked = tasks.filter((t) => t.status === 'blocked');
    const blockedDestIds = new Set(blocked.map((t) => t.dropoff.id));

    // 1) Hard priority: empty a pile someone is blocked waiting to drop onto
    const unblock = doable
      .filter((t) => blockedDestIds.has(t.pickup.id))
      .map((t) => ({ ...t, weight: (t.weight || 1) * 4 }));
    if (unblock.length) {
      const chosen = this._pickWeighted(unblock);
      return { mode: 'work', pickup: chosen.pickup, dropoff: chosen.dropoff };
    }

    // 2) Clear at-capacity piles before they cascade into more blocks
    const atCap = doable.filter((t) => t.clears);
    if (atCap.length) {
      const chosen = this._pickWeighted(atCap);
      return { mode: 'work', pickup: chosen.pickup, dropoff: chosen.dropoff };
    }

    // 3) Normal doable work
    let pool = doable;
    if (this._pressure > 0) {
      const out = doable.filter((t) => t.dropoff.lane === 'out' && t.dropoff.row === ROW.S);
      if (out.length) pool = out;
    } else if (this._pressure < 0) {
      const inn = doable.filter((t) => t.pickup.lane === 'in' && t.pickup.row === ROW.S);
      if (inn.length) pool = inn;
    }

    const chosen = this._pickWeighted(pool);
    if (chosen) {
      return { mode: 'work', pickup: chosen.pickup, dropoff: chosen.dropoff };
    }

    // 4) Linger on blocked task start
    const wait = this._pickWeighted(blocked);
    if (wait) {
      return { mode: 'linger', pickup: wait.pickup, dropoff: wait.dropoff };
    }

    return { mode: 'idle', pickup: this._bayPile(1, 'in', ROW.M), dropoff: null };
  }

  _floorDropClaimedByMechanic(drop) {
    return this.npcs.some(
      (n) =>
        n.kind === 'mechanic' &&
        n.alive &&
        (n.floorDropId === drop.id ||
          (n.droppedCargoId === drop.id &&
            (n.state === 'toFloorDrop' || n.state === 'resumeWait' || n.state === 'clearHot')))
    );
  }

  _pickFloorDropCraneJob() {
    const aged = this.floorDrops.filter((d) => {
      if (this.time - d.droppedAt < FLOOR_DROP_CRANE_AGE) return false;
      if (this._floorDropClaimedByMechanic(d)) return false;
      if (d.claimNpc === 'crane') return true;
      const bay = bayIndexFromX(d.x);
      if (this._isBayOpsHot(bay) && this._pointInDangerRect(d.x, d.y, bay, 0)) return false;
      return true;
    });
    if (!aged.length) return null;
    aged.sort((a, b) => a.droppedAt - b.droppedAt);
    const drop = aged[0];
    drop.claimNpc = 'crane';
    const bay = bayIndexFromX(drop.x);
    const row = drop.cargo.family === 'upgrade' ? ROW.N : ROW.M;
    let dest =
      this._bayPile(bay, 'out', row) ||
      this._bayPile(bay, 'in', ROW.S) ||
      this.piles.find((p) => p.items.length < PILE_CAP && !this._isBayOpsHot(p.bay));
    if (!dest || dest.items.length >= PILE_CAP) {
      dest = this.piles.find((p) => p.items.length < PILE_CAP);
    }
    if (!dest || dest.items.length >= PILE_CAP) return null;
    return {
      mode: 'work',
      pickup: this._makeFloorPickupProxy(drop),
      dropoff: dest,
    };
  }

  _makeFloorPickupProxy(drop) {
    return {
      id: `floor:${drop.id}`,
      x: drop.x,
      y: drop.y,
      bay: bayIndexFromX(drop.x),
      items: [drop.cargo],
      isFloorDrop: true,
      floorDropId: drop.id,
      lane: 'out',
      row: ROW.S,
      role: drop.cargo.family === 'upgrade' ? 'upgrade' : 'cargo',
    };
  }

  _applyCraneJob(c, job) {
    if (!job || job.mode === 'idle') {
      c.pickup = job?.pickup || this._bayPile(1, 'in', ROW.M);
      c.dropoff = c.pickup;
      c.phase = 'idle';
      c.pause = 0.6;
      c.lingerFor = null;
      return;
    }
    c.pickup = job.pickup;
    c.dropoff = job.dropoff;
    c.lingerFor = job.mode === 'linger' ? job.dropoff?.id : null;
    if (job.mode === 'linger') {
      c.phase = 'linger';
      c.pause = 0.35;
    } else {
      c.phase = 'travelPickup';
      c.pause = 0.25;
    }
  }

  _resetCrane() {
    const job = this._pickCraneJob();
    const start = job.pickup || this._bayPile(1, 'in', ROW.M);
    this.crane = {
      trolleyX: start.x,
      bridgeY: start.y - TROLLEY_NORTH,
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
      pickup: start,
      dropoff: job.dropoff || start,
      lingerFor: null,
      pause: 0.5,
      _prevTX: start.x,
      _prevBY: start.y - TROLLEY_NORTH,
      _prevHoist: HOIST_RAISED,
    };
    this._applyCraneJob(this.crane, job);
  }

  /** Prefer a doable dropoff for carried cargo (same bay / matching family). */
  _findCraneDropoffFor(carried, preferBay = null) {
    if (!carried) return null;
    const homeBay =
      carried.serviceBay != null ? carried.serviceBay : preferBay;
    const tasks = this._enumerateCraneTasks().filter((t) => t.status === 'doable');
    const candidates = [];
    for (const p of this.piles) {
      if (p.items.length >= PILE_CAP) continue;
      // Checklist freight must stay on its service bay
      if (carried.serviceKey != null && homeBay != null && p.bay !== homeBay) continue;
      if (carried.family === 'upgrade' && p.role === 'upgrade' && p.lane === 'in') {
        candidates.push({ p, w: homeBay === p.bay ? 8 : 2 });
      } else if (carried.family === 'cargo' && p.role === 'cargo' && p.lane === 'in') {
        candidates.push({ p, w: homeBay === p.bay ? 8 : 2 });
      } else if (p.lane === 'out' && p.row === ROW.S) {
        if (carried.serviceKey) continue; // don't export tagged inbound via alt drop
        candidates.push({ p, w: homeBay === p.bay ? 4 : 1 });
      } else if (p.items.length < PILE_CAP && !carried.serviceKey) {
        candidates.push({ p, w: 0.3 });
      }
    }
    for (const t of tasks) {
      if (t.dropoff.items.length >= PILE_CAP) continue;
      if (carried.serviceKey != null && homeBay != null && t.dropoff.bay !== homeBay) {
        continue;
      }
      candidates.push({ p: t.dropoff, w: homeBay === t.dropoff.bay ? 10 : 2 });
    }
    if (!candidates.length) return null;
    const total = candidates.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.w;
      if (r <= 0) return c.p;
    }
    return candidates[0].p;
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
    this._syncBayLaneModes();

    this._updatePressure();
    this._updateCrane(deltaTime);
    this._updateVisitorTraffic(deltaTime);
    this._updatePlayerBayService(deltaTime);
    this._updateBayClearing();

    this._spawnTimer -= deltaTime;
    if (this._spawnTimer <= 0 && this.npcs.length < 6 && !this._opsBays.has(1)) {
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
    } else if (this._opsBays.has(1)) {
      this._spawnTimer = 1.5;
    }
    for (const b of this._opsBays) this.tickEvac(b);

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
        const r = this._cargoRadius(t.cargo) + proj.radius;
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
          t.x, t.y, this._cargoRadius(t.cargo)
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
    for (const drop of this.floorDrops) {
      out.push({
        cargo: drop.cargo,
        drop,
        x: drop.x,
        y: drop.y,
        kind: 'floor',
      });
    }
    return out;
  }

  _itemWorldPos(pile, index) {
    // 2×2 slot grid — horizontal + vertical fill (max PILE_CAP)
    const slot = PILE_SLOTS[Math.min(index, PILE_SLOTS.length - 1)];
    return {
      x: pile.x + slot.ox,
      y: pile.y + slot.oy,
    };
  }

  _cargoRadius(cargo) {
    return Math.max(cargo.w, cargo.h) * 0.55;
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
      this._restageServiceCargo(target.cargo);
    } else if (target.kind === 'crane' && this.crane) {
      this._restageServiceCargo(this.crane.carried);
      this.crane.carried = null;
      this.crane.phase = 'raiseDropoff';
      this.crane.pause = 0.2;
    } else if (target.kind === 'floor' && target.drop) {
      this._restageServiceCargo(target.drop.cargo);
      this.floorDrops = this.floorDrops.filter((d) => d.id !== target.drop.id);
    } else if (target.kind === 'npc' && target.npc) {
      this._restageServiceCargo(target.npc.cargo);
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

  /** Top-center of carried cargo (top edge just above fingertip line). */
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
      c.phase === 'travelDropoff' ||
      c.phase === 'linger' ||
      c.phase === 'lingerLoaded'
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

    c.pickup = this._pileById(c.pickup?.id) || c.pickup;
    c.dropoff = this._pileById(c.dropoff?.id) || c.dropoff;
    // Keep floor-drop proxy cargo in sync if still on the deck
    if (c.pickup?.isFloorDrop && c.pickup.floorDropId) {
      const drop = this.floorDrops.find((d) => d.id === c.pickup.floorDropId);
      if (!drop) {
        this._applyCraneJob(c, this._pickCraneJob());
        return;
      }
      c.pickup.x = drop.x;
      c.pickup.y = drop.y;
      c.pickup.items = [drop.cargo];
    }

    switch (c.phase) {
      case 'idle': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        const park = this._craneParkXY(c.pickup || this._bayPile(1, 'in', ROW.M));
        this._moveCraneXY(c, park.x, park.y, moveSpeed * 0.6, dt);
        c.pause = 0.5;
        this._applyCraneJob(c, this._pickCraneJob());
        break;
      }
      case 'linger': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hookTargetY = null;
        // Wait near the start of the blocked task (pickup)
        const t = this._craneParkXY(c.pickup);
        this._moveCraneXY(c, t.x, t.y, moveSpeed * 0.7, dt);
        // Dest freed?
        if (c.dropoff && c.dropoff.items.length < PILE_CAP && c.pickup?.items?.length) {
          c.lingerFor = null;
          c.phase = 'travelPickup';
          c.pause = 0.15;
          break;
        }
        c.pause = 0.45;
        this._applyCraneJob(c, this._pickCraneJob());
        break;
      }
      case 'travelPickup': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hoist = HOIST_RAISED;
        c.hookTargetY = null;
        // Dest filled while en route — switch to next doable or linger
        if (c.dropoff && c.dropoff.items.length >= PILE_CAP) {
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        if (!c.pickup?.items?.length) {
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
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
            if (c.pickup.isFloorDrop && c.pickup.floorDropId) {
              this.floorDrops = this.floorDrops.filter((d) => d.id !== c.pickup.floorDropId);
            }
            c.pause = 0.28;
            c.phase = 'raisePickup';
          } else {
            c.pause = 0.15;
            c.phase = 'raiseDropoff';
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
        if (c.dropoff && c.dropoff.items.length >= PILE_CAP) {
          const alt = this._findCraneDropoffFor(c.carried, c.dropoff.bay);
          if (alt) {
            c.dropoff = alt;
          } else {
            // Linger near intended dropoff with load raised
            c.phase = 'lingerLoaded';
            c.pause = 0.3;
            break;
          }
        }
        const t = this._craneParkXY(c.dropoff);
        if (this._moveCraneXY(c, t.x, t.y, moveSpeed, dt)) {
          c.hookTargetY = c.dropoff.y;
          c.phase = 'lowerDropoff';
        }
        break;
      }
      case 'lingerLoaded': {
        const t = this._craneParkXY(c.dropoff);
        this._moveCraneXY(c, t.x, t.y, moveSpeed * 0.6, dt);
        if (c.dropoff && c.dropoff.items.length < PILE_CAP) {
          c.phase = 'travelDropoff';
          c.pause = 0.1;
          break;
        }
        const alt = this._findCraneDropoffFor(c.carried, c.dropoff?.bay);
        if (alt && alt.id !== c.dropoff?.id) {
          c.dropoff = alt;
          c.phase = 'travelDropoff';
          c.pause = 0.1;
          break;
        }
        c.pause = 0.4;
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
            c.pause = 0.3;
            c.phase = 'raiseDropoff';
          } else if (c.carried) {
            const alt = this._findCraneDropoffFor(c.carried, c.dropoff?.bay);
            if (alt) {
              c.dropoff = alt;
              c.phase = 'raisePickup';
              c.pause = 0.12;
            } else {
              c.phase = 'raisePickup';
              c._afterRaise = 'lingerLoaded';
              c.pause = 0.12;
            }
          } else {
            c.pause = 0.3;
            c.phase = 'raiseDropoff';
          }
        }
        break;
      }
      case 'raiseDropoff': {
        c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
        if (near(c.hoist, HOIST_RAISED, 2)) {
          c.hoist = HOIST_RAISED;
          c.hookTargetY = null;
          if (c._afterRaise === 'lingerLoaded' && c.carried) {
            c._afterRaise = null;
            c.phase = 'lingerLoaded';
            c.pause = 0.2;
            break;
          }
          c._afterRaise = null;
          this._applyCraneJob(c, this._pickCraneJob());
        }
        break;
      }
      default:
        this._applyCraneJob(c, this._pickCraneJob());
    }
  }

  _enumerateMechanicTasks(bay, pad) {
    const tasks = [];
    const midIn = this._bayPile(bay, 'in', ROW.M);
    const midOut = this._bayPile(bay, 'out', ROW.M);
    const upIn = this._bayPile(bay, 'in', ROW.N);
    const upOut = this._bayPile(bay, 'out', ROW.N);
    const svcPad = this._servicePad(bay);
    const svc = svcPad?.service;
    const svcActive = svc?.phase === 'active';
    const needs = (type) =>
      svcActive && svc.items.some((it) => it.type === type && it.status !== 'done');

    // Captain repair request
    if (needs('repair')) {
      tasks.push({
        job: 'weld',
        targetPad: pad,
        bay,
        targetPile: null,
        status: 'doable',
        weight: 7,
        clears: false,
        service: true,
      });
    }

    // Load / install only when inbound staging has parts
    if (midIn?.items.length) {
      const serviceLoad =
        !svcActive ||
        midIn.items.some((c) => c.serviceKey) ||
        needs('refuel') ||
        needs('reload') ||
        needs('loadCargo');
      if (serviceLoad) {
        tasks.push({
          job: 'loadShip',
          targetPad: pad,
          bay,
          targetPile: midIn,
          status: 'doable',
          weight: svcActive ? 9 : midIn.items.length >= PILE_CAP ? 8 : 4,
          clears: midIn.items.length >= PILE_CAP,
        });
      }
    }
    if (upIn?.items.length) {
      const serviceInstall =
        !svcActive || needs('upgrade') || upIn.items.some((c) => c.serviceKey);
      if (serviceInstall) {
        tasks.push({
          job: 'installUpgrade',
          targetPad: pad,
          bay,
          targetPile: upIn,
          status: 'doable',
          weight: svcActive ? 9 : upIn.items.length >= PILE_CAP ? 8 : 4,
          clears: upIn.items.length >= PILE_CAP,
        });
      }
    }

    // Unload when captain asked
    if (midOut && needs('unloadCargo')) {
      tasks.push({
        job: 'unloadShip',
        targetPad: pad,
        bay,
        targetPile: midOut,
        status: midOut.items.length < PILE_CAP ? 'doable' : 'blocked',
        weight: 8,
        clears: false,
      });
    }

    // Strip a mount only when a replacement is staged (swap)
    if (upOut && upIn?.items.length && needs('upgrade')) {
      tasks.push({
        job: 'removeUpgrade',
        targetPad: pad,
        bay,
        targetPile: upOut,
        status: upOut.items.length < PILE_CAP ? 'doable' : 'blocked',
        weight: 3,
        clears: false,
      });
    }
    return tasks;
  }

  /**
   * @returns {{ mode: 'work'|'linger'|'despawn', job?, targetPad?, bay?, targetPile? }}
   */
  _pickMechanicTask(npc) {
    const pads = this._dockTargets();
    if (!pads.length) return { mode: 'despawn' };

    // Already carrying — must deliver to matching outbound pile (or linger if full)
    if (npc.cargo) {
      const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
      const pad = pads.find((p) => bayIndexFromX(p.x) === bay) || pads[0];
      const row = npc.cargo.family === 'upgrade' ? ROW.N : ROW.M;
      const job = npc.cargo.family === 'upgrade' ? 'removeUpgrade' : 'unloadShip';
      const dest = this._bayPile(bay, 'out', row);
      if (dest && dest.items.length < PILE_CAP) {
        return {
          mode: 'work',
          job,
          targetPad: pad,
          bay,
          targetPile: dest,
          weight: 5,
        };
      }
      if (dest) {
        return {
          mode: 'linger',
          job,
          targetPad: pad,
          bay,
          targetPile: dest,
          weight: 3,
        };
      }
      return { mode: 'despawn' };
    }

    const all = [];
    for (const pad of pads) {
      const bay = bayIndexFromX(pad.x);
      for (const t of this._enumerateMechanicTasks(bay, pad)) all.push(t);
    }

    // Drop tasks already claimed by other crew
    const free = this._filterUnclaimed(all, npc);
    const doable = free.filter((t) => t.status === 'doable');
    const blocked = free.filter((t) => t.status === 'blocked');

    // Prefer captain repair, then clearing full inbound, then load/install
    // (never prioritize ambient/random weld — B2 has none now)
    let pool = doable.filter((t) => t.job === 'weld' && t.service);
    if (!pool.length) pool = doable.filter((t) => t.clears);
    if (!pool.length) {
      pool = doable.filter(
        (t) => t.job === 'loadShip' || t.job === 'installUpgrade' || t.job === 'unloadShip'
      );
    }
    if (!pool.length) pool = doable.filter((t) => t.job !== 'weld');
    if (!pool.length) pool = doable;

    const chosen = this._pickWeighted(pool);
    if (chosen) {
      return { mode: 'work', ...chosen };
    }

    const wait = this._pickWeighted(blocked);
    if (wait) {
      return { mode: 'linger', ...wait };
    }

    return { mode: 'despawn' };
  }

  _assignMechanicRoute(npc) {
    const pick = this._pickMechanicTask(npc);
    npc.hullTarget = null;
    npc.targetPile = null;
    npc.lingerPile = null;

    if (pick.mode === 'despawn') {
      npc.job = 'idle';
      this._clearTaskClaim(npc);
      return false;
    }

    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay;
    npc.targetPile = pick.targetPile;
    npc.tripsLeft = 2 + ((Math.random() * 3) | 0);
    npc.taskMode = pick.mode;
    if (pick.mode === 'linger') {
      npc.lingerPile = pick.targetPile;
    }
    this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay);
    return true;
  }

  _bayWorkPiles(padX, lane, row) {
    const bay = bayIndexFromX(padX);
    const pile = this._bayPile(bay, lane, row);
    return pile ? [pile] : [];
  }

  /** @deprecated — mid inbound of nearest bay */
  _nearbyMidPiles(padX) {
    return this._bayWorkPiles(padX, 'in', ROW.M);
  }

  /** Stairs only — bulkhead doors are forklift logistics. */
  _spawnMechanic() {
    const hotStairs = STAIRS.filter((s) => !this._isBayOpsHot(s.bay));
    const stairPool = hotStairs.length ? hotStairs : STAIRS;
    const stair = pick(stairPool);
    // Prefer not emerging into an ops-hot bay's danger rect
    if (this._isBayOpsHot(stair.bay) && this._opsBays.size) return;

    const side = Math.random() < 0.5 ? -1 : 1;

    const npc = {
      kind: 'mechanic',
      uid: this._npcUid++,
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
      droppedCargoId: null,
      floorDropId: null,
      targetPile: null,
      lingerPile: null,
      targetPad: null,
      bay: stair.bay,
      job: 'loadShip',
      taskMode: 'work',
      tripsLeft: 2,
      emergeT: 0,
      exitArmed: false,
      claimKey: null,
      _crossing: false,
      _crossPhase: 0,
      _corridorX: null,
      _crossCool: 0,
      suit: pick(['#3a6a8a', '#4a7a6a', '#6a5a4a', '#5a5a7a']),
      helmet: pick(['#c8d0d8', '#a8b8c8', '#d0c8b0']),
      _skirtWp: null,
    };

    if (!this._assignMechanicRoute(npc)) {
      // Nothing useful to do — don't surface just to weld B2
      return;
    }
    npc.exitStair = this._nearestStair(npc.targetPad?.x ?? npc.x);
    this.npcs.push(npc);
  }

  _tryRerouteMechanicFromExit(npc) {
    if (npc.cargo) return false; // finish delivering / dumping via toExit cargo drop
    const pick = this._pickMechanicTask(npc);
    if (pick.mode !== 'work' && pick.mode !== 'linger') return false;
    // Cargo / clearing / captain repair only — don't bounce leavers for fluff
    const useful =
      pick.clears ||
      pick.service ||
      pick.job === 'loadShip' ||
      pick.job === 'installUpgrade' ||
      pick.job === 'unloadShip' ||
      pick.job === 'removeUpgrade' ||
      pick.mode === 'linger';
    if (!useful) return false;
    npc.tripsLeft = Math.max(1, npc.tripsLeft || 1);
    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay;
    npc.targetPile = pick.targetPile;
    npc.taskMode = pick.mode;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.exitArmed = true;
    npc.exitStair = this._nearestStair(npc.targetPad?.x ?? npc.x);
    npc.hullTarget = null;
    this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay);
    this._startMechanicJob(npc);
    return true;
  }

  _tryRerouteForkliftFromExit(npc) {
    // Already hauling outbound — finish leaving
    if (npc.cargo && npc.job === 'takeOut') return false;
    // Carrying inbound — finish that trip; don't dump it for takeOut
    if (npc.cargo) return false;
    // Empty truck leaving: snag outbound before exiting to fetch inbound
    const pick = this._pickForkliftJob(npc);
    if (pick.mode !== 'work' && pick.mode !== 'linger') return false;
    if (pick.job !== 'takeOut') return false;
    npc.job = 'takeOut';
    npc.targetPile = pick.targetPile;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.cargo = null;
    this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.targetPile?.bay);
    npc.state = pick.mode === 'linger' ? 'linger' : 'toPile';
    npc.stateT = 0.2;
    return true;
  }

  _nearestStair(x) {
    return STAIRS.slice().sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  }

  /**
   * Forklift tasks: bringIn (south-in room) / takeOut (south-out items).
   * Forklifts can only clear south-row blockages (not mid/upgrade).
   */
  _enumerateForkliftTasks(npc) {
    const tasks = [];
    const south = this._pilesInRow(ROW.S);
    const southIn = south.filter((p) => p.lane === 'in');
    const southOut = south.filter((p) => p.lane === 'out');

    // Who is blocked on south piles? (crane waiting to drop on south-out)
    const craneBlocked = this._enumerateCraneTasks().filter((t) => t.status === 'blocked');
    const blockedSouthOut = new Set(
      craneBlocked.filter((t) => t.dropoff.row === ROW.S && t.dropoff.lane === 'out').map((t) => t.dropoff.id)
    );

    for (const p of southOut) {
      if (!p.items.length) continue;
      const clears = p.items.length >= PILE_CAP || blockedSouthOut.has(p.id) || this.bayClearing[p.bay];
      tasks.push({
        job: 'takeOut',
        targetPile: p,
        status: 'doable',
        // Outbound slightly above inbound so empty trucks clear clogs first
        weight: clears ? (this.bayClearing[p.bay] ? 18 : 12) : 6,
        clears,
      });
    }

    // Empty-bay sweep: haul leftover inbound south stock off-station too
    for (const p of southIn) {
      if (!this.bayClearing[p.bay] || !p.items.length) continue;
      tasks.push({
        job: 'takeOut',
        targetPile: p,
        status: 'doable',
        weight: 18,
        clears: true,
      });
    }

    const roomIn = southIn.filter(
      (p) => p.items.length < PILE_CAP && this._bayNeedsInbound(p.bay)
    );
    const fullIn = southIn.filter((p) => p.items.length >= PILE_CAP);

    // Service cargo must land on its checklist bay only (never into a clearing bay)
    if (npc.cargo?.serviceBay != null) {
      const bay = npc.cargo.serviceBay;
      if (this.bayClearing[bay] || this._opsBays.has(bay)) {
        // Visit ended — restage is moot; dump to outbound or despawn restage
        this._restageServiceCargo(npc.cargo);
        const out = this._bayPile(bay, 'out', ROW.S) || this._pilesInRow(ROW.S).find((p) => p.lane === 'out');
        if (out && out.items.length < PILE_CAP) {
          tasks.push({
            job: 'bringIn',
            targetPile: out,
            status: 'doable',
            weight: 16,
            clears: true,
          });
        }
      } else {
        const dest = this._bayPile(bay, 'in', ROW.S);
        if (dest) {
          tasks.push({
            job: 'bringIn',
            targetPile: dest,
            status: dest.items.length < PILE_CAP ? 'doable' : 'blocked',
            weight: 14,
            clears: false,
          });
        }
      }
    } else if (roomIn.length && (npc.cargo || this._anyBayNeedsInbound())) {
      // Only bring freight into bays that still need inbound stock
      tasks.push({
        job: 'bringIn',
        targetPile: pick(roomIn),
        status: 'doable',
        weight: this._pressure < 0 ? 3 : 1.5,
        clears: false,
      });
    } else if (fullIn.length && npc.cargo) {
      // Carrying inbound freight but south-in is full — linger (crane must clear)
      tasks.push({
        job: 'bringIn',
        targetPile: pick(fullIn),
        status: 'blocked',
        weight: 2,
        clears: false,
      });
    }

    return tasks;
  }

  _pickForkliftJob(npc) {
    const tasks = this._filterUnclaimed(this._enumerateForkliftTasks(npc), npc);
    let pool = tasks;
    if (npc.cargo) {
      pool = tasks.filter((t) => t.job === 'bringIn');
    } else {
      const take = tasks.filter((t) => t.job === 'takeOut');
      const bring = tasks.filter((t) => t.job === 'bringIn');
      // Empty truck: always prefer outbound before leaving to fetch inbound
      if (take.length) {
        const clearing = take.filter((t) => t.clears);
        pool = clearing.length ? clearing : take;
      } else {
        pool = bring;
      }
    }

    const doable = pool.filter((t) => t.status === 'doable');
    const blocked = pool.filter((t) => t.status === 'blocked');

    let prefer = doable.filter((t) => t.clears);
    if (!prefer.length) prefer = doable;

    const chosen = this._pickWeighted(prefer);
    if (chosen) return { mode: 'work', ...chosen };

    const wait = this._pickWeighted(blocked);
    if (wait) return { mode: 'linger', ...wait };

    return { mode: 'despawn' };
  }

  _hasOutboundCargo() {
    return this._pilesInRow(ROW.S).some(
      (p) => p.lane === 'out' && p.items.length > 0
    );
  }

  _spawnForklift(side = 1) {
    const doorX = side < 0 ? -BAY.HALF_W : BAY.HALF_W;
    const npc = {
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
      job: 'takeOut',
      cargo: null,
      targetPile: null,
      lingerPile: null,
      claimKey: null,
      body: pick(['#c87830', '#b86028', '#d08840']),
    };

    // Prefer entering empty for takeOut when outbound is waiting
    if (this._hasOutboundCargo() || this._pressure > 0) {
      npc.job = 'takeOut';
    } else if (this._anyBayNeedsInbound() && (this._pressure < 0 || Math.random() < 0.55)) {
      npc.job = 'bringIn';
      npc.cargo = this._makeSmartInboundCargo();
      if (!npc.cargo) {
        npc.job = 'takeOut';
      } else if (npc.cargo.serviceBay != null) {
        npc.targetPile = this._bayPile(npc.cargo.serviceBay, 'in', ROW.S);
      }
    } else {
      npc.job = 'takeOut';
    }

    this.npcs.push(npc);
  }

  _makeSmartInboundCargo() {
    const needy = this._allServicePads().filter(
      (p) => p.visitorId && this._serviceNeedsBringIn(p).length > 0
    );
    if (needy.length) {
      const cargo = this._makeServiceInboundCargo(pick(needy));
      if (cargo) return cargo;
    }
    return null;
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
      // Export only from outbound (right) columns
      const out = south.filter((p) => p.lane === 'out' && p.items.length > 0);
      return out.length ? pick(out) : null;
    }
    // Import only to inbound (left) columns
    const inn = south.filter((p) => p.lane === 'in' && p.items.length < PILE_CAP);
    return inn.length ? pick(inn) : null;
  }

  _pickMidPile(wantCargo) {
    const mid = this._pilesInRow(ROW.M);
    if (wantCargo) {
      const full = mid.filter((p) => p.lane === 'in' && p.items.length > 0);
      return full.length ? pick(full) : null;
    }
    const room = mid.filter((p) => p.lane === 'out' && p.items.length < PILE_CAP);
    return room.length ? pick(room) : null;
  }

  _dockTargets() {
    const pads = [];
    if (this._padWorkable({ x: 0, bayIndex: 1 })) {
      pads.push({ x: 0, y: 0, bayId: 'B2', bayIndex: 1, occupied: true });
    }
    for (const p of this.sidePads) {
      if (!this._padWorkable(p)) continue;
      pads.push({
        x: p.x,
        y: 0,
        bayId: p.bayId,
        bayIndex: p.bayIndex,
        occupied: true,
      });
    }
    return pads;
  }

  _updateForklift(npc, dt, hazard) {
    npc.phase += dt * 8;
    npc.stateT -= dt;

    if (npc.state === 'flinch') {
      npc.x += Math.sin(npc.phase * 4) * 14 * dt;
      npc.y += Math.cos(npc.phase * 5) * 4 * dt;
      if (npc.stateT <= 0) npc.state = npc.resumeState || 'toPile';
      return;
    }

    // Only react to being shot — ignore thrusters / bay danger
    const weaponHot = this._hazard.weapons;
    if (
      (npc.state === 'toPile' || npc.state === 'work' || npc.state === 'linger' || npc.state === 'enter') &&
      weaponHot > 0.45 &&
      Math.hypot(npc.x - this._shipPos.x, npc.y - this._shipPos.y) < 110 &&
      Math.random() < weaponHot * 0.1
    ) {
      npc.resumeState = npc.state;
      npc.state = 'flinch';
      npc.stateT = rand(0.35, 0.7);
      return;
    }

    switch (npc.state) {
      case 'enter': {
        const ix = this._insideX(npc.side);
        if (this._moveToward(npc, ix, BAY.PATH_Y, 40, dt)) {
          const pick = this._pickForkliftJob(npc);
          if (pick.mode === 'despawn') {
            this._clearTaskClaim(npc);
            npc.state = 'toDoor';
            break;
          }
          // Empty + only inbound waiting → leave to fetch. But if outbound exists,
          // _pickForkliftJob already preferred takeOut.
          if (pick.job === 'bringIn' && !npc.cargo) {
            this._clearTaskClaim(npc);
            npc.state = 'toDoor';
            break;
          }
          npc.job = pick.job;
          npc.targetPile = pick.targetPile;
          npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
          if (pick.job === 'takeOut') npc.cargo = null;
          this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.targetPile?.bay);
          npc.state = pick.mode === 'linger' ? 'linger' : 'toPile';
          npc.stateT = 0.4;
        }
        break;
      }
      case 'toPile': {
        let p = this._pileById(npc.targetPile?.id);
        if (!p) {
          npc.state = 'toDoor';
          break;
        }
        // Dest full while bringing in — linger or switch
        if (npc.job === 'bringIn' && p.items.length >= PILE_CAP) {
          const pick = this._pickForkliftJob(npc);
          if (pick.mode === 'work' && pick.job === 'bringIn') {
            npc.targetPile = pick.targetPile;
            p = this._pileById(npc.targetPile?.id);
          } else if (pick.mode === 'linger') {
            npc.lingerPile = pick.targetPile;
            npc.targetPile = pick.targetPile;
            npc.state = 'linger';
            npc.stateT = 0.4;
            break;
          } else if (pick.mode === 'work') {
            if (pick.job === 'bringIn' && !npc.cargo) {
              this._clearTaskClaim(npc);
              npc.state = 'toDoor';
              break;
            }
            npc.job = pick.job;
            npc.targetPile = pick.targetPile;
            if (pick.job === 'takeOut') npc.cargo = null;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.targetPile?.bay);
            p = this._pileById(npc.targetPile?.id);
          } else {
            this._clearTaskClaim(npc);
            npc.state = 'toDoor';
            break;
          }
          if (!p) {
            npc.state = 'toDoor';
            break;
          }
        }
        const tx = p.x;
        const ty = Math.max(p.y + 22, BAY.PATH_Y - 10);
        if (this._moveToward(npc, tx, ty, 38, dt)) {
          npc.state = 'work';
          npc.stateT = 0.55;
        }
        break;
      }
      case 'linger': {
        const p = this._pileById(npc.lingerPile?.id || npc.targetPile?.id);
        const tx = p ? p.x : npc.x;
        const ty = p ? Math.max(p.y + 22, BAY.PATH_Y - 10) : BAY.PATH_Y;
        this._moveToward(npc, tx, ty, 28, dt);
        if (npc.stateT > 0) break;
        const pick = this._pickForkliftJob(npc);
        if (pick.mode === 'work') {
          if (pick.job === 'bringIn' && !npc.cargo) {
            this._clearTaskClaim(npc);
            npc.state = 'toDoor';
            break;
          }
          npc.job = pick.job;
          npc.targetPile = pick.targetPile;
          npc.lingerPile = null;
          if (pick.job === 'takeOut') npc.cargo = null;
          this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.targetPile?.bay);
          npc.state = 'toPile';
        } else if (pick.mode === 'linger') {
          npc.lingerPile = pick.targetPile;
          npc.targetPile = pick.targetPile;
          this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.targetPile?.bay);
          npc.stateT = 0.55;
        } else {
          this._clearTaskClaim(npc);
          npc.state = 'toDoor';
        }
        break;
      }
      case 'work': {
        if (npc.stateT > 0) break;
        const p = this._pileById(npc.targetPile?.id);
        if (npc.job === 'bringIn' && npc.cargo && p && p.items.length < PILE_CAP) {
          // Dumping onto outbound during bay clear — drop checklist tags
          if (p.lane === 'out' && npc.cargo.serviceKey) {
            npc.cargo.serviceKey = null;
            npc.cargo.serviceBay = null;
          }
          p.items.push(npc.cargo);
          npc.cargo = null;
          this._clearTaskClaim(npc);
          // Must exit to fetch the next inbound load — never spawn cargo in-bay
          npc.state = 'toDoor';
          break;
        } else if (npc.job === 'bringIn' && npc.cargo && p && p.items.length >= PILE_CAP) {
          npc.lingerPile = p;
          npc.state = 'linger';
          npc.stateT = 0.4;
          break;
        } else if (npc.job === 'takeOut' && !npc.cargo && p && p.items.length > 0) {
          npc.cargo = p.items.pop();
          // Hauling checklist freight off-station → re-order that need
          if (npc.cargo?.serviceKey && p.lane === 'in') {
            this._restageServiceCargo(npc.cargo);
            npc.cargo.serviceKey = null;
            npc.cargo.serviceBay = null;
          }
          this._clearTaskClaim(npc);
        }
        this._clearTaskClaim(npc);
        npc.state = 'toDoor';
        break;
      }
      case 'toDoor': {
        // Empty trucks check often so they don't drive past outbound piles
        const rerouteEvery = npc.cargo ? 0.35 : 0.12;
        npc._rerouteT = (npc._rerouteT || 0) + dt;
        if (npc._rerouteT >= rerouteEvery) {
          npc._rerouteT = 0;
          if (this._tryRerouteForkliftFromExit(npc)) break;
        }
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX, BAY.PATH_Y, 40, dt)) {
          npc.state = 'exit';
        }
        break;
      }
      case 'exit': {
        const rerouteEvery = npc.cargo ? 0.35 : 0.12;
        npc._rerouteT = (npc._rerouteT || 0) + dt;
        if (npc._rerouteT >= rerouteEvery) {
          npc._rerouteT = 0;
          if (this._tryRerouteForkliftFromExit(npc)) break;
        }
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX + npc.side * 55, BAY.PATH_Y, 42, dt)) {
          if (npc.cargo) {
            this._restageServiceCargo(npc.cargo);
            npc.cargo = null;
          }
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
   * Hold cargo prefers the aft; upgrades / weld pick hull stations.
   */
  _shipHullApproach(pad, mode) {
    let lx;
    let ly;
    if (mode === 'weld' || mode === 'upgrade') {
      const station = mode === 'upgrade'
        ? pick(['fore', 'forePort', 'dorsal', 'aftPort', 'aftStbd'])
        : pick(['aft', 'aftPort', 'aftStbd', 'port', 'stbd', 'forePort']);
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
        case 'fore':
          lx = SHIP_EXTENT.LENGTH * 0.36;
          ly = rand(-4, 4);
          break;
        case 'dorsal':
          lx = rand(-4, 8);
          ly = rand(-5, 5);
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

  /** Job still makes sense right now (pile stock / dest room / weld pad). */
  _mechanicJobValid(npc) {
    if (npc.job === 'weld') return this._padWorkable(npc.targetPad);
    if (npc.job === 'idle' || npc.taskMode === 'despawn') return false;
    if (!this._padWorkable(npc.targetPad) &&
        (npc.job === 'loadShip' || npc.job === 'unloadShip' ||
          npc.job === 'installUpgrade' || npc.job === 'removeUpgrade')) {
      // Still OK to walk cargo to a pile if we're not going to the ship
      if (npc.state === 'toPile' || npc.state === 'workPile') {
        /* fall through to pile checks */
      } else if (!npc.cargo) {
        return false;
      }
    }
    const p = this._pileById(npc.targetPile?.id);
    if (!p) return false;
    if (npc.job === 'loadShip' || npc.job === 'installUpgrade') {
      return !npc.cargo ? p.items.length > 0 : true;
    }
    if (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') {
      if (npc.cargo) return p.items.length < PILE_CAP;
      // Going to ship to pull freight/parts — outbound must have room
      return p.items.length < PILE_CAP;
    }
    return false;
  }

  _startMechanicJob(npc) {
    npc.hullTarget = null;
    if (npc.taskMode === 'despawn' || npc.job === 'idle') {
      this._clearTaskClaim(npc);
      npc.state = 'toExit';
      return;
    }
    if (npc.taskMode === 'linger') {
      npc.lingerPile = npc.targetPile;
      npc.state = 'linger';
      npc.stateT = 0.5;
      return;
    }
    // Stale assignment (pile emptied) — one re-pick, then exit if still nothing
    if (!this._mechanicJobValid(npc)) {
      if (npc._revalidating) {
        this._clearTaskClaim(npc);
        npc.state = 'toExit';
        npc._revalidating = false;
        return;
      }
      npc._revalidating = true;
      this._beginNextMechanicTrip(npc);
      npc._revalidating = false;
      return;
    }
    if (npc.job === 'weld') {
      npc.state = 'toShip';
      return;
    }
    if (npc.job === 'loadShip' || npc.job === 'installUpgrade') {
      npc.state = npc.targetPile ? 'toPile' : 'toExit';
    } else if (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') {
      npc.state = npc.cargo ? 'toPile' : 'toShip';
    } else {
      this._clearTaskClaim(npc);
      npc.state = 'toExit';
    }
  }

  _beginNextMechanicTrip(npc) {
    npc.hullTarget = null;
    this._clearSkirtStick(npc);
    this._clearBacksplashCross(npc);
    npc._dodgeCorridorX = null;
    if (npc.job === 'weld') {
      npc.tripsLeft -= 0; // weld uses trips in workWeld
      if (npc.tripsLeft <= 0) {
        this._clearTaskClaim(npc);
        npc.state = 'toExit';
        return;
      }
      npc.state = 'toShip';
      return;
    }

    if (npc.tripsLeft <= 0) {
      this._clearTaskClaim(npc);
      npc.state = 'toExit';
      return;
    }

    const pick = this._pickMechanicTask(npc);
    if (pick.mode === 'despawn') {
      this._clearTaskClaim(npc);
      npc.state = 'toExit';
      return;
    }

    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay;
    npc.targetPile = pick.targetPile;
    npc.taskMode = pick.mode;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.exitStair = this._nearestStair(npc.targetPad?.x ?? npc.x);
    this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay);
    this._startMechanicJob(npc);
  }

  /** Step clear of a stair hatch onto the deck (around backsplash, toward ships). */
  _hatchRally(npc) {
    const stair = npc.stair || npc.exitStair || this._nearestStair(npc.x);
    // Corridor X — never the pad center. Center rallies sit inside pad keep-out
    // and cause N/S ping-pong on the apron as soon as toPile starts.
    const x = this._pickCorridorX(stair.x, npc.targetPad?.x ?? stair.x);
    return { x, y: BACKSPLASH_Y - BACKSPLASH_BAND - 24 };
  }

  _backsplashGateY(south) {
    return south
      ? BACKSPLASH_Y + BACKSPLASH_BAND + 10
      : BACKSPLASH_Y - BACKSPLASH_BAND - 10;
  }

  /**
   * Side of the blast wall for pathing. Use the clear gate bands — not the wall
   * midline — so crew standing between gate and wall aren't misclassified and
   * forced into an extra N/S cross (apron ping-pong).
   */
  _backsplashSideSouth(y) {
    if (y >= BACKSPLASH_Y + BACKSPLASH_BAND) return true;
    if (y <= BACKSPLASH_Y - BACKSPLASH_BAND) return false;
    // Inside the Y band of the wall slab: snap to nearer clear side
    return y >= BACKSPLASH_Y;
  }

  /**
   * Walkable corridor X positions past blast walls: outer ends + wall-hug lanes
   * in each inter-bay gap (not gap midpoints — those cut across neighbor aprons).
   */
  _backsplashCorridors() {
    const pads = padCenters();
    const half = BACKSPLASH_HALF_W;
    const margin = BACKSPLASH_BYPASS;
    const xs = [pads[0] - half - margin];
    for (let i = 0; i < pads.length - 1; i++) {
      // Hug right face of left wall, left face of right wall
      xs.push(pads[i] + half + margin);
      xs.push(pads[i + 1] - half - margin);
    }
    xs.push(pads[pads.length - 1] + half + margin);
    return xs;
  }

  _pickCorridorX(x, tx = x) {
    const corridors = this._backsplashCorridors();
    let best = corridors[0];
    let bestScore = Infinity;
    for (const cx of corridors) {
      // Prefer corridor near the crew; slight bias toward the target's X
      let score = Math.abs(cx - x) + Math.abs(cx - tx) * 0.25;
      // Strongly avoid corridors that sit inside a hot danger lane
      if (this._xInAnyHotDanger(cx, 2)) score += 500;
      if (score < bestScore) {
        bestScore = score;
        best = cx;
      }
    }
    return best;
  }

  _clearBacksplashCross(npc) {
    npc._crossing = false;
    npc._crossPhase = 0;
    npc._corridorX = null;
    npc._crossFromSouth = null;
  }

  _clearSkirtStick(npc) {
    npc._skirtWp = null;
  }

  _npcInBacksplash(x, y) {
    if (Math.abs(y - BACKSPLASH_Y) > BACKSPLASH_BAND) return null;
    for (const cx of padCenters()) {
      if (Math.abs(x - cx) <= BACKSPLASH_HALF_W + 1) return cx;
    }
    return null;
  }

  /** True if the segment crosses a solid backsplash slab. */
  _segmentHitsBacksplash(x0, y0, x1, y1) {
    const wy = BACKSPLASH_Y;
    const band = BACKSPLASH_BAND;
    const bothNorth = y0 < wy - band && y1 < wy - band;
    const bothSouth = y0 > wy + band && y1 > wy + band;
    if (bothNorth || bothSouth) return false;
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    for (const cx of padCenters()) {
      if (maxX >= cx - BACKSPLASH_HALF_W && minX <= cx + BACKSPLASH_HALF_W) {
        return true;
      }
    }
    return false;
  }

  /**
   * Locked corridor cross: near-gate → far-gate at fixed corridor X, then release.
   */
  _continueBacksplashCross(npc, tx, ty, speed, dt) {
    const corridorX = npc._corridorX;
    const gateNear = this._backsplashGateY(npc._crossFromSouth);
    const gateFar = this._backsplashGateY(!npc._crossFromSouth);
    const destSouth = !npc._crossFromSouth;

    if (npc._crossPhase <= 1) {
      npc._crossPhase = 1;
      if (Math.hypot(npc.x - corridorX, npc.y - gateNear) > 3) {
        this._moveToward(npc, corridorX, gateNear, speed, dt);
        return false;
      }
      npc._crossPhase = 2;
    }

    if (npc._crossPhase === 2) {
      if (Math.hypot(npc.x - corridorX, npc.y - gateFar) > 3) {
        this._moveToward(npc, corridorX, gateFar, speed, dt);
        return false;
      }
      npc._crossPhase = 3;
    }

    if (npc._crossPhase >= 3) {
      const clearY = gateFar;
      const onDest = destSouth ? npc.y >= clearY - 1 : npc.y <= clearY + 1;
      if (!onDest || Math.abs(npc.x - corridorX) > 4) {
        this._moveToward(npc, corridorX, clearY, speed, dt);
        return false;
      }
      this._clearBacksplashCross(npc);
      npc._crossCool = 0.4;
    }

    return this._moveToward(npc, tx, ty, speed, dt);
  }

  _beginBacksplashCross(npc, tx, ty) {
    npc._crossing = true;
    npc._crossPhase = 1;
    npc._corridorX = this._pickCorridorX(npc.x, tx);
    npc._crossFromSouth = this._backsplashSideSouth(npc.y);
  }

  /**
   * Same-side wall dodge via nearest corridor (no N/S reverse).
   * Sticky corridor X so left/right picks don't flip every frame.
   */
  _sameSideDodge(npc, tx, ty, speed, dt) {
    if (
      npc._dodgeCorridorX == null ||
      Math.abs(npc.x - npc._dodgeCorridorX) < 2
    ) {
      npc._dodgeCorridorX = this._pickCorridorX(npc.x, tx);
    }
    const corridorX = npc._dodgeCorridorX;
    if (Math.abs(npc.x - corridorX) > 4) {
      this._moveToward(npc, corridorX, npc.y, speed, dt);
      return false;
    }
    npc._dodgeCorridorX = null;
    return this._moveToward(npc, tx, ty, speed, dt);
  }

  /**
   * Mechanic pathing around solid backsplash walls via inter-bay corridors.
   * Hot danger rectangles are skirted (not crossed). Exception: reclaiming a
   * floor drop still inside a hot bay — hold at the edge until it clears.
   * When ops end, the direct path is used again automatically.
   * Arrival is only true for the real goal — never for a skirt/hold waypoint.
   */
  _mechMove(npc, tx, ty, speed, dt) {
    const wy = BACKSPLASH_Y;
    const goalX = tx;
    const goalY = ty;
    let diverted = false;

    // Don't fight an in-progress corridor cross with skirt redirects
    if (!npc._crossing && this._opsBays.size) {
      const exceptBay = npc.state === 'clearHot' ? npc.clearBay : null;

      if (this._shouldHoldForHotDrop(npc)) {
        const drop = this.floorDrops.find(
          (d) => d.id === npc.floorDropId || d.id === npc.droppedCargoId
        );
        const edge = this._pointBeforeHotSegment(
          npc.x, npc.y, drop.x, drop.y + 6, exceptBay
        );
        if (Math.hypot(npc.x - edge.x, npc.y - edge.y) <= 2.5) return false;
        tx = edge.x;
        ty = edge.y;
        diverted = true;
        this._clearSkirtStick(npc);
      } else if (this._segmentHitsAnyHotDanger(npc.x, npc.y, goalX, goalY, exceptBay)) {
        const wp = this._skirtAroundHot(
          npc.x, npc.y, goalX, goalY, exceptBay, npc._skirtWp
        );
        npc._skirtWp = { x: wp.x, y: wp.y };
        tx = wp.x;
        ty = wp.y;
        diverted = true;
        if (Math.hypot(npc.x - wp.x, npc.y - wp.y) <= 3) {
          // Reached sticky skirt — clear so the next hop can replan
          this._clearSkirtStick(npc);
        }
      } else {
        this._clearSkirtStick(npc);
      }
    } else if (!this._opsBays.size) {
      this._clearSkirtStick(npc);
    }

    if (npc._crossCool > 0) npc._crossCool -= dt;

    // When diverted, path against the skirt waypoint (not the ship) so we don't
    // start a N/S wall cross toward the goal while the skirt pulls south again.
    const pathX = diverted ? tx : goalX;
    const pathY = diverted ? ty : goalY;

    if (npc._crossing) {
      return this._continueBacksplashCross(npc, goalX, goalY, speed, dt);
    }

    // Embedded in a wall — eject through nearest corridor toward destination
    if (this._npcInBacksplash(npc.x, npc.y) != null) {
      this._beginBacksplashCross(npc, pathX, pathY);
      if (pathY < wy - 4) npc._crossFromSouth = true;
      else if (pathY > wy + 4) npc._crossFromSouth = false;
      return this._continueBacksplashCross(npc, pathX, pathY, speed, dt);
    }

    const npcSouth = this._backsplashSideSouth(npc.y);
    const tgtSouth = this._backsplashSideSouth(pathY);
    const oppositeSides = npcSouth !== tgtSouth;
    const clips = this._segmentHitsBacksplash(npc.x, npc.y, pathX, pathY);

    let arrived = false;
    if (!oppositeSides) {
      if (clips) arrived = this._sameSideDodge(npc, pathX, pathY, speed, dt);
      else arrived = this._moveToward(npc, pathX, pathY, speed, dt);
    } else if (npc._crossCool > 0) {
      const corridorX = this._pickCorridorX(npc.x, pathX);
      const destGate = this._backsplashGateY(tgtSouth);
      this._moveToward(npc, corridorX, destGate, speed, dt);
      arrived = false;
    } else {
      this._beginBacksplashCross(npc, pathX, pathY);
      arrived = this._continueBacksplashCross(npc, pathX, pathY, speed, dt);
    }

    // Skirt / hold waypoints must not count as reaching the real destination
    if (diverted) return false;
    return arrived;
  }

  /**
   * Auto danger on B2 when player engines/thrusters blast; preserve incoming/departing/elevator.
   */
  _syncBayLaneModes() {
    for (let i = 0; i < 3; i++) {
      const mode = this.bayLaneMode[i];
      if (mode === 'incoming' || mode === 'departing' || mode === 'elevator') continue;
      if (this._opsBays.has(i)) continue;
      if (i === 1) {
        const hot =
          this._hazard.engine > 0.28 || this._hazard.maneuver > 0.5;
        this.bayLaneMode[i] = hot ? 'danger' : 'idle';
      }
    }
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
      // Player thruster/weapon retreat — south of hatch, then resume (unchanged).
      const stair = npc.exitStair || this._nearestStair(npc.x);
      const safeX = stair.x;
      const safeY = stair.y + 22;
      if (this._mechMove(npc, safeX, safeY, 58, dt)) {
        const resume = npc.resumeState || 'toShip';
        npc.state = resume === 'toExit' || resume === 'descend' ? 'toShip' : resume;
        npc.hullTarget = null;
        npc.stateT = 0.2;
        npc.exitArmed = false;
      }
      return;
    }
    if (npc.state === 'clearHot') {
      let bay = npc.clearBay;
      if (bay == null || !this._inBayDangerZone(npc, bay)) {
        bay = this._pointInAnyHotDanger(npc.x, npc.y);
      }
      if (bay != null && this._inBayDangerZone(npc, bay)) {
        npc.clearBay = bay;
        npc.safeSpot = this._nearestSafePoint(npc.x, npc.y, bay);
        this._mechMove(npc, npc.safeSpot.x, npc.safeSpot.y, 62, dt);
        if (this._pointInAnyHotDanger(npc.x, npc.y) == null) {
          npc.state = 'resumeWait';
          npc.stateT = rand(0.15, 0.55);
        }
        return;
      }
      npc.state = 'resumeWait';
      npc.stateT = rand(0.15, 0.55);
      return;
    }
    if (npc.state === 'resumeWait') {
      if (npc.stateT > 0) return;
      this._resumeAfterOpsClear(npc);
      return;
    }
    if (npc.state === 'toFloorDrop') {
      const drop = this.floorDrops.find((d) => d.id === npc.floorDropId || d.id === npc.droppedCargoId);
      if (!drop) {
        npc.droppedCargoId = null;
        npc.floorDropId = null;
        this._beginNextMechanicTrip(npc);
        return;
      }
      if (this._mechMove(npc, drop.x, drop.y + 6, 30, dt)) {
        npc.cargo = drop.cargo;
        this.floorDrops = this.floorDrops.filter((d) => d.id !== drop.id);
        npc.droppedCargoId = null;
        npc.floorDropId = null;
        this._decideAfterReclaimDrop(npc);
      }
      return;
    }

    if (
      ['toPile', 'toShip', 'workPile', 'workShip', 'workWeld', 'leaveHatch', 'linger'].includes(npc.state) &&
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
          // Idle/despawn must never walk north toward ships then reverse down the hatch
          if (npc.taskMode === 'despawn' || npc.job === 'idle') {
            this._clearTaskClaim(npc);
            npc.state = 'descend';
            npc.stateT = 0.45;
            break;
          }
          npc.rally = this._hatchRally(npc);
          npc.afterHatch = 'job';
          npc.state = 'leaveHatch';
          npc.exitArmed = false;
        }
        break;
      }
      case 'leaveHatch': {
        const rally = npc.rally || this._hatchRally(npc);
        if (this._mechMove(npc, rally.x, rally.y, walk, dt)) {
          npc.exitArmed = true;
          if (npc.afterHatch === 'toExit' || npc.taskMode === 'despawn' || npc.job === 'idle') {
            this._clearTaskClaim(npc);
            npc.state = 'toExit';
          } else {
            this._startMechanicJob(npc);
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
          this._beginNextMechanicTrip(npc);
          break;
        }
        // Dest full for unload jobs — switch to another doable task or linger
        const unloading = npc.job === 'unloadShip' || npc.job === 'removeUpgrade';
        if (unloading && p.items.length >= PILE_CAP && npc.cargo) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        if (this._mechMove(npc, p.x, p.y + 14, walk, dt)) {
          npc.state = 'workPile';
          npc.stateT = 0.55;
        }
        break;
      }
      case 'linger': {
        const p = this._pileById(npc.lingerPile?.id || npc.targetPile?.id);
        const tx = p ? p.x : npc.x;
        const ty = p ? p.y + 16 : npc.y;
        this._mechMove(npc, tx, ty, walk * 0.7, dt);
        npc.x += Math.sin(npc.phase) * 0.15;
        if (npc.stateT > 0) break;
        // Recheck: dest free → work; else other doable; else keep lingering / despawn
        const pick = this._pickMechanicTask(npc);
        if (pick.mode === 'work') {
          npc.job = pick.job;
          npc.targetPad = pick.targetPad;
          npc.bay = pick.bay;
          npc.targetPile = pick.targetPile;
          npc.taskMode = 'work';
          npc.lingerPile = null;
          this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay);
          this._startMechanicJob(npc);
        } else if (pick.mode === 'linger') {
          npc.job = pick.job;
          npc.targetPad = pick.targetPad;
          npc.bay = pick.bay;
          npc.targetPile = pick.targetPile;
          npc.lingerPile = pick.targetPile;
          this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay);
          npc.stateT = 0.55;
        } else {
          this._clearTaskClaim(npc);
          npc.state = 'toExit';
        }
        break;
      }
      case 'workPile': {
        if (npc.stateT > 0) break;
        const p = this._pileById(npc.targetPile?.id);
        const loading = npc.job === 'loadShip' || npc.job === 'installUpgrade';
        const unloading = npc.job === 'unloadShip' || npc.job === 'removeUpgrade';
        if (loading && p && p.items.length > 0 && !npc.cargo) {
          const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
          npc.cargo = this._takeServicePileCargo(p, bay, npc.job);
          if (!npc.cargo) {
            this._beginNextMechanicTrip(npc);
            break;
          }
          npc.hullTarget = null;
          npc.state = 'toShip';
        } else if (unloading && npc.cargo && p && p.items.length < PILE_CAP) {
          if (npc.cargo.unloadServiceBay != null) {
            this._completeServiceType(npc.cargo.unloadServiceBay, 'unloadCargo');
          }
          p.items.push(npc.cargo);
          npc.cargo = null;
          npc.tripsLeft -= 1;
          if (npc.tripsLeft <= 0) npc.state = 'toExit';
          else this._beginNextMechanicTrip(npc);
        } else if (unloading && npc.cargo && p && p.items.length >= PILE_CAP) {
          // Dest blocked — try another task or linger
          this._beginNextMechanicTrip(npc);
        } else {
          // Failed pickup — try another logistics task
          if (npc.cargo) {
            const bay = npc.bay ?? bayIndexFromX(npc.x);
            const row = npc.cargo.family === 'upgrade' ? ROW.N : ROW.M;
            const room = this._bayPile(bay, 'out', row);
            if (room && room.items.length < PILE_CAP) room.items.push(npc.cargo);
            else {
              const any = this.piles.find((q) => q.items.length < PILE_CAP);
              if (any) any.items.push(npc.cargo);
            }
            npc.cargo = null;
          }
          this._beginNextMechanicTrip(npc);
        }
        break;
      }
      case 'toShip': {
        const pad = npc.targetPad;
        if (!pad || !this._padWorkable(pad) || !this._mechanicJobValid(npc)) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        // Load/install must carry a part — never walk to the hull empty-handed
        if (
          (npc.job === 'loadShip' || npc.job === 'installUpgrade') &&
          !npc.cargo
        ) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        // Unload/remove only if outbound still has room
        if (
          (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') &&
          !npc.cargo &&
          !this._mechanicJobValid(npc)
        ) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        if (!npc.hullTarget) {
          const mode =
            npc.job === 'weld' ? 'weld'
              : (npc.job === 'installUpgrade' || npc.job === 'removeUpgrade') ? 'upgrade'
                : 'cargo';
          npc.hullTarget = this._shipHullApproach(pad, mode);
        }
        if (this._mechMove(npc, npc.hullTarget.x, npc.hullTarget.y, walk, dt)) {
          if (npc.job === 'weld') {
            npc.state = 'workWeld';
            npc.stateT = rand(1.1, 1.9);
          } else {
            npc.state = 'workShip';
            npc.stateT = npc.job === 'installUpgrade' || npc.job === 'removeUpgrade'
              ? rand(1.2, 1.9)
              : rand(0.7, 1.1);
          }
        }
        break;
      }
      case 'workWeld': {
        if (!this._padWorkable(npc.targetPad)) {
          npc.hullTarget = null;
          this._beginNextMechanicTrip(npc);
          break;
        }
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
        this._clearTaskClaim(npc);
        const weldBay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
        this._completeServiceType(weldBay, 'repair');
        npc.tripsLeft -= 1;
        npc.hullTarget = null;
        if (npc.tripsLeft <= 0 || weldBay !== 1) {
          // Visitor repair is one checklist item; B2 may keep ambient multi-trip welds
          if (weldBay !== 1) npc.tripsLeft = 0;
          npc.state = 'toExit';
        } else npc.state = 'toShip';
        break;
      }
      case 'workShip': {
        if (!this._padWorkable(npc.targetPad)) {
          npc.hullTarget = null;
          this._beginNextMechanicTrip(npc);
          break;
        }
        const upgrading =
          npc.job === 'installUpgrade' || npc.job === 'removeUpgrade';
        // Sparky weld during install / uninstall (same as hull repair)
        if (upgrading && Math.random() < 0.6) {
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
        const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);

        if ((npc.job === 'loadShip' || npc.job === 'installUpgrade') && npc.cargo) {
          this._completeLoadService(bay, npc.cargo, npc.job);
          npc.cargo = null;
          npc.tripsLeft -= 1;
          npc.hullTarget = null;
          if (npc.tripsLeft <= 0) {
            this._clearTaskClaim(npc);
            npc.state = 'toExit';
          } else this._beginNextMechanicTrip(npc);
        } else if ((npc.job === 'loadShip' || npc.job === 'installUpgrade') && !npc.cargo) {
          // Arrived empty — don't no-op at the hull; find real work
          this._beginNextMechanicTrip(npc);
        } else if (npc.job === 'unloadShip' && !npc.cargo) {
          const dest = this._bayPile(bay, 'out', ROW.M);
          if (!dest || dest.items.length >= PILE_CAP) {
            this._beginNextMechanicTrip(npc);
            break;
          }
          const kinds = HOLD_CARGO.filter(
            (k) => k.label === 'ORE' || k.label === 'INGOT' || k.label === 'AMMO' || k.label === 'CRATE'
          );
          npc.cargo = makeCargo(pick(kinds));
          npc.cargo.unloadServiceBay = bay;
          npc.targetPile = dest;
          npc.hullTarget = null;
          this._applyTaskClaim(npc, 'unloadShip', npc.targetPile, bay);
          npc.state = 'toPile';
        } else if (npc.job === 'removeUpgrade' && !npc.cargo) {
          const dest = this._bayPile(bay, 'out', ROW.N);
          if (!dest || dest.items.length >= PILE_CAP) {
            this._beginNextMechanicTrip(npc);
            break;
          }
          npc.cargo = makeCargo(pick(UPGRADE_KINDS));
          npc.targetPile = dest;
          npc.hullTarget = null;
          this._applyTaskClaim(npc, 'removeUpgrade', npc.targetPile, bay);
          npc.state = 'toPile';
        } else {
          this._beginNextMechanicTrip(npc);
        }
        break;
      }
      case 'toExit': {
        this._clearTaskClaim(npc);
        if (npc.cargo) {
          const bay = npc.bay ?? bayIndexFromX(npc.x);
          const row = npc.cargo.family === 'upgrade' ? ROW.N : ROW.M;
          const room = this._bayPile(bay, 'out', row);
          if (room && room.items.length < PILE_CAP) room.items.push(npc.cargo);
          else {
            const any = this.piles.find((p) => p.items.length < PILE_CAP);
            if (any) any.items.push(npc.cargo);
          }
          npc.cargo = null;
        }
        // New work appeared while walking off — jump back on it
        npc._rerouteT = (npc._rerouteT || 0) + dt;
        if (npc._rerouteT >= 0.35) {
          npc._rerouteT = 0;
          if (this._tryRerouteMechanicFromExit(npc)) break;
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
            this._mechMove(npc, npc.x, BAY.PATH_Y, walk, dt);
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
            this._mechMove(npc, approach.x, approach.y, walk, dt);
            break;
          }
          if (this._mechMove(npc, stair.x, stair.y, walk, dt)) {
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
      npc.state === 'toPile' ||
      npc.state === 'workPile' ||
      npc.state === 'linger' ||
      npc.state === 'toFloorDrop' ||
      npc.state === 'flinch' ||
      npc.state === 'clearHot' ||
      npc.state === 'leaveHatch'
    ) {
      return;
    }
    // Soft pad keep-out — only when not on apron jobs (piles/hull sit in this circle)
    const pushed = this._padKeepOut(npc.x, npc.y);
    if (pushed && npc.state !== 'flee' && npc.state !== 'clearHot') {
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

  _resumeAfterOpsClear(npc) {
    const drop =
      this.floorDrops.find((d) => d.id === npc.droppedCargoId) ||
      this.floorDrops.find((d) => d.ownerId === npc.uid && !d.claimNpc);
    if (drop) {
      drop.claimNpc = npc.uid;
      npc.floorDropId = drop.id;
      npc.droppedCargoId = drop.id;
      npc.state = 'toFloorDrop';
      npc.stateT = 0;
      return;
    }

    const resume = npc.resumeState;
    npc.resumeState = null;
    npc.clearBay = null;
    npc.safeSpot = null;

    // Never resume mid-weld / mid-hull in thin air — revalidate or re-pick
    let next = resume;
    if (next === 'workWeld' || next === 'workShip') next = 'toShip';

    if (next && !['toExit', 'descend', 'clearHot', 'resumeWait', 'flee', 'flinch'].includes(next)) {
      if (npc._opsResumeJob) npc.job = npc._opsResumeJob;
      if (npc._opsResumePad) npc.targetPad = npc._opsResumePad;
      if (npc._opsResumePile) npc.targetPile = npc._opsResumePile;
      if (npc._opsResumeBay != null) npc.bay = npc._opsResumeBay;
      npc.hullTarget = null;
      if (!this._mechanicJobValid(npc) || !this._padWorkable(npc.targetPad)) {
        this._beginNextMechanicTrip(npc);
        return;
      }
      npc.state = next;
      npc.stateT = 0.15;
      return;
    }
    this._beginNextMechanicTrip(npc);
  }

  _decideAfterReclaimDrop(npc) {
    // Carrying again — deliver to ship, park on outbound pile, or re-pick
    if (npc.job === 'loadShip' || npc.job === 'installUpgrade') {
      if (npc.targetPad) {
        npc.state = 'toShip';
        npc.hullTarget = null;
        return;
      }
    }
    if (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') {
      const bay = npc.bay ?? bayIndexFromX(npc.x);
      const row = npc.cargo?.family === 'upgrade' ? ROW.N : ROW.M;
      const dest = this._bayPile(bay, 'out', row);
      if (dest && dest.items.length < PILE_CAP) {
        npc.targetPile = dest;
        npc.state = 'toPile';
        return;
      }
    }
    // Sensible default: put it on a pile with room, then re-pick work
    const bay = npc.bay ?? bayIndexFromX(npc.x);
    const row = npc.cargo?.family === 'upgrade' ? ROW.N : ROW.M;
    const dest =
      this._bayPile(bay, 'out', row) ||
      this.piles.find((p) => p.items.length < PILE_CAP);
    if (dest && dest.items.length < PILE_CAP) {
      npc.targetPile = dest;
      npc.job = npc.cargo?.family === 'upgrade' ? 'removeUpgrade' : 'unloadShip';
      npc.state = 'toPile';
      return;
    }
    this._beginNextMechanicTrip(npc);
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
    this.renderElevatorTransits(ctx);
    this.renderVisitors(ctx);
    this.renderOverhead(ctx);
  }

  /** Pads, cargo, floor — below crew and ships. */
  renderDeck(ctx, space = null) {
    this._drawBayShell(ctx);
    if (space) {
      this._drawViewportSpace(ctx, space);
      this._drawOpenDoorSpace(ctx, space);
    }
    this._drawViewportFrames(ctx);
    this._drawFloor(ctx);
    this._drawBayDangerLights(ctx);
    this._drawSetDressing(ctx);
    this._drawBacksplashWalls(ctx);
    this._drawStairs(ctx);
    this._drawBayDoors(ctx);
    this._drawBayBeacons(ctx);
    this._drawCargoPiles(ctx);

    // B2 shaft well under the player pad (rim peeks around the pad edge)
    this._drawElevationShaft(ctx, 0, 0);
    this._drawDockPad(ctx, 0, 0, 'B2', {
      active: true,
      angle: this.playerPadAngle,
      rimMode: this.padRimMode[1] || 'off',
    });

    for (const pad of this.sidePads) {
      const drop = pad.padDrop || 0;
      this._drawElevationShaft(ctx, pad.x, 0);
      if (drop < 0.02) {
        this._drawDockPad(ctx, pad.x, 0, pad.bayId, {
          active: false,
          occupied: !!pad.visitorId,
          angle: pad.padAngle ?? FACE_NORTH,
          rimMode: this.padRimMode[pad.bayIndex] || 'off',
        });
      }
      // Transit pad+ship drawn later (clipped) so deck dressing stays around the hole
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

  /**
   * Elevator pad+ship while descending/ascending — clipped to the shaft opening
   * so the rest of the hangar occludes anything outside the circle.
   */
  renderElevatorTransits(ctx) {
    for (const pad of this.sidePads) {
      if ((pad.padDrop || 0) < 0.02) continue;
      this._drawElevatorTransit(ctx, pad);
      this._drawElevationShaftRim(ctx, pad.x, 0);
    }
  }

  /** North lip of bay doors — ships with y < this are outside (space side). */
  getDoorLipY() {
    return -BAY.HALF_H + BAY.DOOR_H;
  }

  /**
   * Visitor ships on B1/B3 (+ optional player ship via hooks).
   * Elevator-transit visitors are drawn clipped inside the shaft.
   * Outside ships draw first, then north-wall occlusion (windows + open doors
   * stay clear), then door leaves/frames, then inside ships.
   *
   * @param {{ beforeOcclusion?: (ctx: CanvasRenderingContext2D) => void,
   *           afterOcclusion?: (ctx: CanvasRenderingContext2D) => void }} [hooks]
   */
  renderVisitors(ctx, hooks = {}) {
    const doorLip = this.getDoorLipY();
    const outside = [];
    const inside = [];
    for (const pad of this.sidePads) {
      if (!pad.visitorId) continue;
      if ((pad.padDrop || 0) >= 0.02) continue; // shaft pass owns these
      const y = pad.shipY || 0;
      if (y < doorLip - 2) outside.push(pad);
      else inside.push(pad);
    }
    for (const pad of outside) this._drawVisitor(ctx, pad);
    if (hooks.beforeOcclusion) hooks.beforeOcclusion(ctx);
    this._drawNorthWallOcclusion(ctx);
    this._drawViewportFrames(ctx);
    // Leaves/jambs only — floor sill/hazard stays under ships from the deck pass
    this._drawBayDoors(ctx, { leavesOnly: true });
    this._drawBayBeacons(ctx, { wallOnly: true });
    for (const pad of inside) this._drawVisitor(ctx, pad);
    if (hooks.afterOcclusion) hooks.afterOcclusion(ctx);
  }

  /**
   * 2.5D elevator shaft. Inner opening radius = pad radius (exact match).
   * Rim sits just outside the pad circumference; interior is the deep well.
   */
  _drawElevationShaft(ctx, cx, cy) {
    this._drawElevationShaftWell(ctx, cx, cy);
    this._drawElevationShaftRim(ctx, cx, cy);
  }

  /** Dark cylindrical well — clipped to pad circle. */
  _drawElevationShaftWell(ctx, cx, cy) {
    const r = BAY.PAD_R;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    // Depth gradient: steel-blue near the lip → near-black at the deep south
    const grad = ctx.createLinearGradient(0, -r, 0, r * 0.85);
    grad.addColorStop(0, '#2a3848');
    grad.addColorStop(0.35, '#1a2430');
    grad.addColorStop(0.7, '#0a1018');
    grad.addColorStop(1, '#020408');
    ctx.fillStyle = grad;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // Soft radial falloff toward deep center (offset slightly south)
    const radial = ctx.createRadialGradient(0, r * 0.22, r * 0.1, 0, r * 0.15, r);
    radial.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    radial.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // Vertical cylinder guide lines (left / center / right)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.1;
    for (const lx of [-r * 0.52, 0, r * 0.52]) {
      ctx.beginPath();
      ctx.moveTo(lx, -r * 0.92);
      ctx.lineTo(lx * 0.35, r * 0.72);
      ctx.stroke();
    }

    // Curved depth rings — deeper rings smaller + shifted south (2.5D look-down)
    for (const [t, alpha] of [
      [0.28, 0.45],
      [0.52, 0.55],
      [0.78, 0.7],
    ]) {
      const rr = r * (1 - t * 0.72);
      const oy = t * r * 0.38;
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(0, oy, rr, rr * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Subtle face highlight on the north lip of each ring
      ctx.strokeStyle = `rgba(90, 120, 145, ${0.12 * (1 - t)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, oy, rr, rr * 0.92, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    // Deep void
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.42, r * 0.22, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** Textured rim just outside the pad circumference. */
  _drawElevationShaftRim(ctx, cx, cy) {
    const r = BAY.PAD_R;
    const rim = 3.5;
    ctx.save();
    ctx.translate(cx, cy);

    // Annulus: outer rim disk minus pad hole
    ctx.beginPath();
    ctx.arc(0, 0, r + rim, 0, Math.PI * 2);
    ctx.arc(0, 0, r, 0, Math.PI * 2, true);
    ctx.fillStyle = '#1a2836';
    ctx.fill('evenodd');

    // Cross-hatch / mesh on the rim face
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r + rim, 0, Math.PI * 2);
    ctx.arc(0, 0, r, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.6;
    for (let i = -r - rim; i < r + rim; i += 2.2) {
      ctx.beginPath();
      ctx.moveTo(i, -r - rim);
      ctx.lineTo(i + (r + rim) * 2, r + rim);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, r + rim);
      ctx.lineTo(i + (r + rim) * 2, -r - rim);
      ctx.stroke();
    }
    ctx.restore();

    // Inner lip (matches pad outline exactly)
    ctx.strokeStyle = 'rgba(100, 130, 150, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Outer rim edge
    ctx.strokeStyle = 'rgba(60, 85, 105, 0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r + rim, 0, Math.PI * 2);
    ctx.stroke();

    // Top bevel highlight on north of rim
    ctx.strokeStyle = 'rgba(140, 170, 190, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r + rim * 0.55, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Descending/ascending pad + ship, clipped to the shaft opening so the rest
   * of the hangar occludes anything outside the circle.
   */
  _drawElevatorTransit(ctx, pad) {
    const drop = pad.padDrop || 0;
    const r = BAY.PAD_R;
    const south = drop * 48;
    const sc = 1 - drop * 0.55;
    const alpha = Math.max(0, 1 - drop * 0.92);

    ctx.save();
    ctx.beginPath();
    ctx.arc(pad.x, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.globalAlpha = alpha;
    ctx.translate(pad.x, south);
    ctx.scale(sc, sc);

    this._drawDockPad(ctx, 0, 0, pad.bayId, {
      active: false,
      occupied: !!pad.visitorId && drop < 0.85,
      angle: pad.padAngle ?? FACE_NORTH,
      skipShadow: true,
      rimMode: this.padRimMode[pad.bayIndex] || 'off',
    });

    if (pad.visitorId && drop < 0.92) {
      const hover = pad.shipHover || 0;
      const angle = pad.shipAngle ?? FACE_NORTH;
      ctx.save();
      ctx.translate(0, hover * 2);
      ctx.scale(pad.shipScale || 1, pad.shipScale || 1);
      ctx.rotate(angle);
      drawVisitorShip(ctx, pad.visitorId, {
        thrusters: pad.thrusters,
        velocity: { x: pad.shipVx || 0, y: pad.shipVy || 0 },
        angle,
        angularVelocity: 0,
      });
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Redraw north wall solid mass so departing ships are occluded except through
   * viewport windows and open bay-door apertures.
   */
  _drawNorthWallOcclusion(ctx) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const centers = padCenters();
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -h - 40;
    const doorTop = -h;
    const doorH = BAY.DOOR_H;
    const dh = BAY.DOOR_HALF;

    const holes = [];
    for (let i = 0; i < centers.length; i++) {
      const cx = centers[i];
      holes.push({ lo: cx - vpW / 2, hi: cx + vpW / 2, y0: vpY, y1: vpY + vpH });
      const open = this.doorOpen[i] || 0;
      if (open > 0.05) {
        const slide = open * (dh + 4);
        const gap = dh - 1.5 + slide;
        holes.push({
          lo: cx - gap,
          hi: cx + gap,
          y0: doorTop,
          y1: doorTop + doorH,
        });
      }
    }

    const wallX = -w - 100;
    const wallW = w * 2 + 200;
    const wallY = -h - 80;
    const wallH = 80 + BAY.DOOR_H;

    // Evenodd clip: solid wall minus windows and open door apertures.
    // (Band-scan fills break when viewport + door holes stack in Y.)
    ctx.save();
    ctx.beginPath();
    ctx.rect(wallX, wallY, wallW, wallH);
    for (const hole of holes) {
      ctx.rect(hole.lo, hole.y0, hole.hi - hole.lo, hole.y1 - hole.y0);
    }
    ctx.clip('evenodd');

    ctx.fillStyle = '#101820';
    ctx.fillRect(wallX, wallY, wallW, wallH);
    ctx.fillStyle = '#182430';
    ctx.fillRect(-w - 50, -h - 50, w * 2 + 100, 50 + BAY.DOOR_H);
    this._drawWallPanels(ctx, -w - 50, -h - 50, w * 2 + 100, 50 + BAY.DOOR_H, [], vpY, vpH);
    ctx.restore();
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

    ctx.fillStyle = '#06090e';
    ctx.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);

    const northY = -h - 80;
    const northH = 80 + BAY.DOOR_H;
    const vpGaps = centers.map((cx) => ({
      lo: cx - vpW / 2,
      hi: cx + vpW / 2,
    }));

    const fillNorthBand = (y, bandH, fill) => {
      ctx.fillStyle = fill;
      let cursor = -w - 100;
      for (const g of vpGaps) {
        if (g.lo > cursor) ctx.fillRect(cursor, y, g.lo - cursor, bandH);
        if (vpY > y) ctx.fillRect(g.lo, y, g.hi - g.lo, Math.min(vpY - y, bandH));
        const belowTop = vpY + vpH;
        const belowH = y + bandH - belowTop;
        if (belowH > 0) ctx.fillRect(g.lo, belowTop, g.hi - g.lo, belowH);
        cursor = Math.max(cursor, g.hi);
      }
      if (cursor < w + 100) ctx.fillRect(cursor, y, w + 100 - cursor, bandH);
    };

    // Deep outer bulk (station hull beyond the bay)
    fillNorthBand(northY, northH, '#101820');
    // Mid shell with slight warm grit
    fillNorthBand(-h - 50, 50 + BAY.DOOR_H, '#182430');

    // Side / south outer bulk — 2.5D lip (darker “underside” + face)
    ctx.fillStyle = '#0e1620';
    ctx.fillRect(-w - 58, -h - 50, 58, (h + 50) * 2);
    ctx.fillRect(w, -h - 50, 58, (h + 50) * 2);
    ctx.fillRect(-w - 58, h, (w + 58) * 2, 58);
    ctx.fillStyle = '#1a2836';
    ctx.fillRect(-w - 50, -h - 50, 50, (h + 50) * 2);
    ctx.fillRect(w, -h - 50, 50, (h + 50) * 2);
    ctx.fillRect(-w - 50, h, (w + 50) * 2, 50);
    // Top edge highlight on bulk lips
    ctx.fillStyle = 'rgba(90, 120, 140, 0.22)';
    ctx.fillRect(-w - 50, -h - 50, 50, 2);
    ctx.fillRect(w, -h - 50, 50, 2);
    ctx.fillRect(-w - 50, h, (w + 50) * 2, 2);

    // Interior deck mass (base before plate detail)
    ctx.fillStyle = '#1e2c38';
    ctx.fillRect(-w, -h + BAY.DOOR_H, w * 2, h * 2 - BAY.DOOR_H);

    // North wall face panels (between / around viewport glass)
    this._drawWallPanels(ctx, -w - 50, -h - 50, w * 2 + 100, 50 + BAY.DOOR_H, vpGaps, vpY, vpH);
    // Side wall paneling
    this._drawSideWallDetail(ctx, -1);
    this._drawSideWallDetail(ctx, 1);

    ctx.strokeStyle = '#4a6578';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-w, -h, w * 2, h * 2);
    // Inner shadow line for depth
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w + 2, -h + 2, w * 2 - 4, h * 2 - 4);

    // Corner columns (2.5D posts)
    for (const [cx, cy] of [
      [-w, -h + BAY.DOOR_H],
      [w, -h + BAY.DOOR_H],
      [-w, h],
      [w, h],
    ]) {
      this._drawCornerColumn(ctx, cx, cy);
    }
  }

  _drawWallPanels(ctx, x0, y0, width, height, vpGaps, vpY, vpH) {
    const panelW = 28;
    for (let x = x0; x < x0 + width - 4; x += panelW) {
      const px = x + 2;
      const pw = panelW - 4;
      // Skip glass openings
      let blocked = false;
      for (const g of vpGaps) {
        if (px + pw > g.lo && px < g.hi && y0 < vpY + vpH && y0 + height > vpY) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // Panel face + top bevel (2.5D)
      ctx.fillStyle = '#1c2a36';
      ctx.fillRect(px, y0 + 4, pw, height - 8);
      ctx.fillStyle = 'rgba(110, 140, 160, 0.18)';
      ctx.fillRect(px, y0 + 4, pw, 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(px, y0 + height - 8, pw, 2);
      ctx.strokeStyle = 'rgba(60, 85, 105, 0.55)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(px, y0 + 4, pw, height - 8);

      // Rivets
      ctx.fillStyle = 'rgba(140, 160, 175, 0.35)';
      for (const ry of [y0 + 10, y0 + height - 12]) {
        ctx.beginPath();
        ctx.arc(px + 3, ry, 0.9, 0, Math.PI * 2);
        ctx.arc(px + pw - 3, ry, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Horizontal stringers
    ctx.strokeStyle = 'rgba(70, 95, 115, 0.45)';
    ctx.lineWidth = 1.5;
    for (const sy of [y0 + 14, y0 + height * 0.55]) {
      ctx.beginPath();
      ctx.moveTo(x0 + 4, sy);
      ctx.lineTo(x0 + width - 4, sy);
      ctx.stroke();
    }

    // Grime streaks
    ctx.fillStyle = 'rgba(20, 14, 8, 0.12)';
    for (let i = 0; i < 7; i++) {
      const gx = x0 + 18 + i * 92;
      ctx.fillRect(gx, y0 + 8, 3 + (i % 3), height - 16);
    }
  }

  _drawSideWallDetail(ctx, side) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const xFace = side < 0 ? -w : w - 18;
    const wallTop = -h + BAY.DOOR_H;
    const wallBot = h;

    // Vertical ribbing
    for (let i = 0; i < 3; i++) {
      const wx = side < 0 ? -w + 4 + i * 5 : w - 8 - i * 5;
      ctx.fillStyle = i === 1 ? '#243444' : '#1a2834';
      ctx.fillRect(wx, wallTop + 4, 4, wallBot - wallTop - 8);
      ctx.fillStyle = 'rgba(100, 130, 150, 0.15)';
      ctx.fillRect(wx, wallTop + 4, 4, 1.5);
    }

    // Side observation ports (skip bulkhead door band)
    for (let i = 0; i < 3; i++) {
      const wy = -30 + i * 48;
      if (Math.abs(wy - BAY.PATH_Y) < BAY.BULK_DOOR_HALF + 10) continue;
      const wx = side < 0 ? -w + 8 : w - 22;
      // Frame depth
      ctx.fillStyle = '#121a22';
      ctx.fillRect(wx - 1, wy + 1, 18, 22);
      ctx.fillStyle = '#2a3848';
      ctx.fillRect(wx - 2, wy - 2, 18, 22);
      ctx.strokeStyle = '#7a9bb0';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(wx - 2, wy - 2, 18, 22);
      ctx.fillStyle = 'rgba(6, 10, 18, 0.82)';
      ctx.fillRect(wx, wy, 14, 18);
      ctx.strokeStyle = '#4a6070';
      ctx.strokeRect(wx, wy, 14, 18);
      // Glass sheen
      ctx.fillStyle = 'rgba(120, 180, 220, 0.06)';
      ctx.fillRect(wx + 1, wy + 1, 5, 16);
    }

    // Wall conduits
    const pipeX = side < 0 ? -w + 22 : w - 26;
    ctx.strokeStyle = '#3a4a58';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pipeX, wallTop + 10);
    ctx.lineTo(pipeX, BAY.PATH_Y - BAY.BULK_DOOR_HALF - 8);
    ctx.moveTo(pipeX, BAY.PATH_Y + BAY.BULK_DOOR_HALF + 8);
    ctx.lineTo(pipeX, wallBot - 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 100, 60, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pipeX + side * 5, wallTop + 20);
    ctx.lineTo(pipeX + side * 5, wallBot - 30);
    ctx.stroke();
    // Couplings
    ctx.fillStyle = '#5a6a78';
    for (const cy of [wallTop + 40, 20, 90]) {
      if (Math.abs(cy - BAY.PATH_Y) < BAY.BULK_DOOR_HALF + 6) continue;
      ctx.fillRect(pipeX - 2, cy, 8, 4);
    }

    // Stencil hazard strip on wall base
    ctx.fillStyle = '#c9a020';
    for (let y = wallTop + 6; y < wallBot - 4; y += 10) {
      if (Math.abs(y - BAY.PATH_Y) < BAY.BULK_DOOR_HALF + 4) continue;
      ctx.fillRect(xFace, y, 3, 5);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(xFace, y + 5, 3, 5);
      ctx.fillStyle = '#c9a020';
    }
  }

  _drawCornerColumn(ctx, cx, cy) {
    ctx.fillStyle = '#0a1016';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(cx - 5, cy - 14, 10, 16);
    ctx.fillStyle = 'rgba(120, 150, 170, 0.25)';
    ctx.fillRect(cx - 5, cy - 14, 10, 2);
    ctx.fillStyle = '#1a2834';
    ctx.fillRect(cx - 3, cy - 12, 6, 12);
    ctx.strokeStyle = '#6a8498';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 5, cy - 14, 10, 16);
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
      ctx.fillStyle = '#15202c';
      ctx.fillRect(x0, wallTop, thick, Math.max(0, doorLo - wallTop));
      ctx.fillRect(x0, doorHi, thick, Math.max(0, wallBot - doorHi));
      // Panel seams
      ctx.strokeStyle = 'rgba(70, 95, 115, 0.4)';
      ctx.lineWidth = 0.8;
      for (let y = wallTop + 12; y < doorLo - 4; y += 16) {
        ctx.beginPath();
        ctx.moveTo(x0 + 2, y);
        ctx.lineTo(x0 + thick - 2, y);
        ctx.stroke();
      }

      const deepX = side < 0 ? -w - thick - 120 : w + thick;
      ctx.fillStyle = '#0a1018';
      ctx.fillRect(deepX, wallTop, 120, Math.max(0, doorLo - wallTop));
      ctx.fillRect(deepX, doorHi, 120, Math.max(0, wallBot - doorHi));

      // Door frame with depth lip
      ctx.fillStyle = '#0e1620';
      ctx.fillRect(x0 - 3, doorLo - 5, thick + 6, doorHi - doorLo + 10);
      ctx.fillStyle = '#2e3e4e';
      ctx.fillRect(x0 - 2, doorLo - 4, thick + 4, 4);
      ctx.fillRect(x0 - 2, doorHi, thick + 4, 4);
      ctx.fillRect(x0 - 2, doorLo, 3, doorHi - doorLo);
      ctx.fillRect(x0 + thick - 1, doorLo, 3, doorHi - doorLo);
      ctx.fillStyle = 'rgba(130, 160, 180, 0.2)';
      ctx.fillRect(x0 - 2, doorLo - 4, thick + 4, 1.5);

      ctx.strokeStyle = '#7a9bb0';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x0 - 2, doorLo - 4, thick + 4, doorHi - doorLo + 8);

      // Caution jamb stripes
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? '#c9a020' : '#1a1a1a';
        ctx.fillRect(x0 + 2, doorLo + 4 + i * 11, thick - 4, 9);
      }

      ctx.fillStyle = 'rgba(100, 180, 255, 0.06)';
      ctx.fillRect(x0, doorLo, thick, doorHi - doorLo);

      ctx.fillStyle = 'rgba(100, 180, 255, 0.4)';
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
      // Frame only — never fill the glass (ships must read through windows)
      ctx.fillStyle = '#1e2a36';
      ctx.fillRect(x - t, y - t, vpW + t * 2, t);
      ctx.fillRect(x - t, y + vpH, vpW + t * 2, t);
      ctx.fillRect(x - t, y, t, vpH);
      ctx.fillRect(x + vpW, y, t, vpH);
      ctx.fillStyle = 'rgba(120, 150, 170, 0.25)';
      ctx.fillRect(x - t, y - t, vpW + t * 2, 1.5);
      ctx.strokeStyle = '#8aabbc';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - t, y - t, vpW + t * 2, vpH + t * 2);
      ctx.strokeStyle = '#4a6070';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1, y - 1, vpW + 2, vpH + 2);
      ctx.fillStyle = '#9aaab8';
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
    const pads = padCenters();
    const { starfield, nebulaField, spaceX, spaceY, time, nebulae } = space;

    // One continuous space pass behind the north wall; each window clips a
    // different slice (not three re-centered copies of the same chunk).
    const left = pads[0] - vpW / 2;
    const right = pads[pads.length - 1] + vpW / 2;
    const midX = (left + right) / 2;
    const midY = vpY + vpH / 2;
    const cover = Math.hypot(right - left, vpH) / 2 + 40;

    ctx.save();
    ctx.beginPath();
    for (const cx of pads) {
      ctx.rect(cx - vpW / 2, vpY, vpW, vpH);
    }
    ctx.clip();

    ctx.translate(midX, midY);
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

  /**
   * Same space chunk as `_drawViewportSpace` (identical mid/cover/camera), clipped
   * only to open bay-door apertures so doors and windows share one field.
   */
  _drawOpenDoorSpace(ctx, space) {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    const pads = padCenters();
    const { starfield, nebulaField, spaceX, spaceY, time, nebulae } = space;

    // Match window backdrop anchor exactly — doors peek into the same chunk
    const left = pads[0] - vpW / 2;
    const right = pads[pads.length - 1] + vpW / 2;
    const midX = (left + right) / 2;
    const midY = vpY + vpH / 2;
    const doorTop = -BAY.HALF_H;
    const doorH = BAY.DOOR_H;
    const dh = BAY.DOOR_HALF;
    // Cover must reach door bottoms (south of window mid) without changing windows
    const cover = Math.max(
      Math.hypot(right - left, vpH) / 2 + 40,
      Math.hypot(right - left, (doorTop + doorH - midY) * 2) / 2 + 40
    );

    ctx.save();
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < pads.length; i++) {
      const open = this.doorOpen[i] || 0;
      if (open <= 0.05) continue;
      any = true;
      const cx = pads[i];
      const slide = open * (dh + 4);
      const gap = dh - 1.5 + slide;
      ctx.rect(cx - gap, doorTop, gap * 2, doorH);
    }
    if (!any) {
      ctx.restore();
      return;
    }
    ctx.clip();

    ctx.translate(midX, midY);
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

  /**
   * @param {{ leavesOnly?: boolean }} [opts]
   *   leavesOnly — wall hardware only (leaves, jambs). Floor sill / hazard paint
   *   stays in the deck pass so it never restamps over arriving ships.
   */
  _drawBayDoors(ctx, opts = {}) {
    const leavesOnly = !!opts.leavesOnly;
    const h = BAY.HALF_H;
    const doorTop = -h;
    const doorH = BAY.DOOR_H;
    const dh = BAY.DOOR_HALF;
    const labels = bayLabels();

    padCenters().forEach((cx, i) => {
      const open = this.doorOpen[i] || 0;
      const slide = open * (dh + 4);

      // Dark pocket only while sealed — open apertures show shared spacefield
      if (!leavesOnly && open <= 0.05) {
        ctx.fillStyle = '#0a1018';
        ctx.fillRect(cx - dh - 6, doorTop - 2, dh * 2 + 12, doorH + 8);
      }

      // Leaf faces with paneling — slide apart when open
      for (const [baseLx, lw, side] of [
        [cx - dh, dh - 1.5, -1],
        [cx + 1.5, dh - 1.5, 1],
      ]) {
        const lx = baseLx + side * slide;
        ctx.fillStyle = '#3a4a58';
        ctx.fillRect(lx, doorTop, lw, doorH);
        ctx.fillStyle = 'rgba(120, 150, 170, 0.12)';
        ctx.fillRect(lx, doorTop, lw, 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(lx, doorTop + doorH - 3, lw, 3);
        ctx.strokeStyle = '#6a8498';
        ctx.lineWidth = 1.3;
        ctx.strokeRect(lx, doorTop, lw, doorH);
        ctx.strokeStyle = 'rgba(50, 70, 85, 0.7)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(lx + 3, doorTop + 4, lw - 6, doorH * 0.4);
        ctx.strokeRect(lx + 3, doorTop + doorH * 0.5, lw - 6, doorH * 0.38);
        ctx.fillStyle = 'rgba(150, 170, 185, 0.4)';
        for (const ry of [doorTop + 6, doorTop + doorH - 6]) {
          ctx.beginPath();
          ctx.arc(lx + 4, ry, 0.8, 0, Math.PI * 2);
          ctx.arc(lx + lw - 4, ry, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (open < 0.15) {
        ctx.strokeStyle = 'rgba(20, 30, 40, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, doorTop + 2);
        ctx.lineTo(cx, doorTop + doorH - 2);
        ctx.stroke();
      }

      // Jamb columns (wall) — safe to restamp over ships at the aperture edges
      for (const px of [cx - dh - 8, cx + dh]) {
        ctx.fillStyle = '#121a22';
        ctx.fillRect(px + 1, doorTop - 2, 8, doorH + 10);
        ctx.fillStyle = '#2a3848';
        ctx.fillRect(px, doorTop - 4, 8, doorH + 10);
        ctx.fillStyle = 'rgba(120, 150, 170, 0.2)';
        ctx.fillRect(px, doorTop - 4, 8, 2);
      }

      // Deck threshold + label — deck pass only (floor caution lives in _drawFloor)
      if (leavesOnly) return;

      ctx.fillStyle = '#243444';
      ctx.fillRect(cx - dh - 8, doorTop + doorH, dh * 2 + 16, 7);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(cx - dh - 8, doorTop + doorH + 5, dh * 2 + 16, 2);

      ctx.fillStyle = 'rgba(100, 180, 255, 0.18)';
      for (const y of [-120, -95, -72]) {
        ctx.beginPath();
        ctx.moveTo(cx, y - 7);
        ctx.lineTo(cx - 5, y + 5);
        ctx.lineTo(cx + 5, y + 5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(100, 180, 255, 0.5)';
      ctx.font = '5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${labels[i]} · SPACE`, cx, doorTop + doorH + 12);
    });
  }

  /**
   * Per-bay door beacons. Modes: idle (dim), warning (flash), steady (elevator),
   * open (solid red).
   * @param {{ wallOnly?: boolean }} [opts] — skip floor wash (restamp after ships)
   */
  _drawBayBeacons(ctx, opts = {}) {
    const wallOnly = !!opts.wallOnly;
    const doorTop = -BAY.HALF_H;
    padCenters().forEach((cx, i) => {
      const mode = this.bayBeacons[i] || 'idle';
      let on = false;
      let color = '255, 170, 40';
      let glow = 0.15;
      if (mode === 'idle') {
        on = Math.sin(this.time * 1.4 + i) > 0.65;
        glow = on ? 0.35 : 0.08;
      } else if (mode === 'warning') {
        on = Math.sin(this.time * 10 + i) > 0;
        glow = on ? 0.85 : 0.12;
        color = '255, 160, 20';
      } else if (mode === 'steady') {
        on = true;
        glow = 0.55 + 0.08 * Math.sin(this.time * 1.6 + i);
        color = '255, 190, 60';
      } else if (mode === 'open') {
        on = true;
        glow = 0.9;
        color = '255, 60, 50';
      }

      for (const dx of [-BAY.DOOR_HALF - 4, BAY.DOOR_HALF + 4]) {
        const bx = cx + dx;
        const by = doorTop - 10;
        ctx.fillStyle = '#2a3848';
        ctx.fillRect(bx - 3, by - 2, 6, 5);
        ctx.strokeStyle = '#6a8498';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(bx - 3, by - 2, 6, 5);
        ctx.fillStyle = `rgba(${color}, ${0.25 + glow * 0.75})`;
        ctx.beginPath();
        ctx.arc(bx, by + 1, 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (glow > 0.2) {
          ctx.fillStyle = `rgba(${color}, ${glow * 0.2})`;
          ctx.beginPath();
          ctx.ellipse(bx, by + 8, 10, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!wallOnly && (mode === 'warning' || mode === 'open' || mode === 'steady')) {
        const a =
          mode === 'open' ? 0.1
            : mode === 'steady' ? 0.05
              : (on ? 0.08 : 0.02);
        ctx.fillStyle = `rgba(${color}, ${a})`;
        ctx.beginPath();
        ctx.ellipse(cx, doorTop + BAY.DOOR_H + 28, 36, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  _drawFloor(ctx) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const deckTop = -h + BAY.DOOR_H + 2;
    const deckBot = h - 2;
    const deckLeft = -w + 2;
    const deckRight = w - 2;

    ctx.fillStyle = '#243442';
    ctx.fillRect(deckLeft, deckTop, deckRight - deckLeft, deckBot - deckTop);

    const tile = 36;
    for (let y = deckTop; y < deckBot; y += tile) {
      for (let x = deckLeft; x < deckRight; x += tile) {
        const tw = Math.min(tile - 1, deckRight - x);
        const th = Math.min(tile - 1, deckBot - y);
        const shade = ((Math.floor(x / tile) + Math.floor(y / tile)) & 1) ? 0.03 : 0;
        ctx.fillStyle = `rgba(30, 42, 54, ${0.35 + shade})`;
        ctx.fillRect(x, y, tw, th);
        ctx.fillStyle = 'rgba(110, 140, 160, 0.08)';
        ctx.fillRect(x, y, tw, 1.2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(x, y + th - 1.2, tw, 1.2);
        ctx.fillRect(x + tw - 1.2, y, 1.2, th);
      }
    }

    const stains = [
      [-90, 50, 28, 14, 0.14],
      [70, -20, 22, 11, 0.12],
      [200, 90, 30, 16, 0.15],
      [-210, 100, 24, 12, 0.13],
      [40, 160, 40, 10, 0.1],
      [-40, -50, 18, 20, 0.11],
      [160, 40, 16, 26, 0.1],
    ];
    for (const [sx, sy, sw, sh, a] of stains) {
      ctx.fillStyle = `rgba(18, 12, 6, ${a})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sw, sh, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(40, 55, 30, ${a * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(sx + 4, sy + 2, sw * 0.45, sh * 0.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 3;
    for (const tx of [-240, -80, 80, 240]) {
      ctx.beginPath();
      ctx.moveTo(tx - 6, BAY.PATH_Y - 14);
      ctx.quadraticCurveTo(tx, BAY.PATH_Y + 6, tx + 10, BAY.PATH_Y + 16);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(100, 180, 255, 0.035)';
    ctx.fillRect(-w + 4, BAY.PATH_Y - 18, w * 2 - 8, 36);
    ctx.strokeStyle = 'rgba(200, 160, 40, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(-w + 10, BAY.PATH_Y - 18);
    ctx.lineTo(w - 10, BAY.PATH_Y - 18);
    ctx.moveTo(-w + 10, BAY.PATH_Y + 18);
    ctx.lineTo(w - 10, BAY.PATH_Y + 18);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(100, 180, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 12]);
    for (const cx of padCenters()) {
      ctx.beginPath();
      ctx.moveTo(cx, -h + BAY.DOOR_H + 16);
      ctx.lineTo(cx, h - 40);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const cx of padCenters()) {
      this._drawCautionBox(ctx, cx - 42, -h + BAY.DOOR_H + 8, 84, 14);
    }
    for (const cx of padCenters()) {
      this._drawFloorChevron(ctx, cx - 55, 55, -1);
      this._drawFloorChevron(ctx, cx + 55, 55, 1);
    }
  }

  _drawCautionBox(ctx, x, y, w, h) {
    for (let i = 0; i < Math.ceil(w / 8); i++) {
      ctx.fillStyle = i % 2 ? '#c9a020' : '#1a1a14';
      ctx.fillRect(x + i * 8, y, Math.min(8, w - i * 8), h);
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
  }

  _drawFloorChevron(ctx, x, y, dir) {
    ctx.fillStyle = 'rgba(201, 160, 32, 0.28)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * 10, y - 6);
    ctx.lineTo(x + dir * 10, y + 6);
    ctx.closePath();
    ctx.fill();
  }

  /** Static industrial props — tanks, hoses, tool stations, barrels (clear of pads/piles). */
  _drawSetDressing(ctx) {
    this._drawFuelTank(ctx, -305, 178, 1);
    this._drawFuelTank(ctx, 305, 178, 0.92);

    this._drawFuelHose(ctx, -290, 170, -200, 155, -120, 148);
    this._drawFuelHose(ctx, 290, 170, 200, 155, 120, 148);

    this._drawHoseReel(ctx, -318, 30, -1);
    this._drawHoseReel(ctx, 318, 30, 1);
    this._drawHoseReel(ctx, -318, -70, -1);
    this._drawHoseReel(ctx, 318, -70, 1);

    this._drawToolStation(ctx, -230, 172);
    this._drawToolStation(ctx, 230, 172);
    this._drawToolStation(ctx, 0, 178);

    this._drawBarrel(ctx, -280, 100, '#4a5a40');
    this._drawBarrel(ctx, -268, 108, '#3a4a58');
    this._drawBarrel(ctx, 275, 95, '#5a4030');
    this._drawBarrel(ctx, 288, 102, '#3a4a58');

    const lockerY = -BAY.HALF_H + BAY.DOOR_H + 18;
    this._drawWallLocker(ctx, -78, lockerY);
    this._drawWallLocker(ctx, 78, lockerY);

    this._drawFireExt(ctx, -325, BAY.PATH_Y - 48);
    this._drawFireExt(ctx, 325, BAY.PATH_Y - 48);

    this._drawDrain(ctx, -160, 165);
    this._drawDrain(ctx, 160, 165);
    this._drawDrain(ctx, 0, -40);

    ctx.fillStyle = 'rgba(201, 160, 32, 0.35)';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KEEP CLEAR', -155, DANGER_ZONE_SOUTH - 8);
    ctx.fillText('KEEP CLEAR', 155, DANGER_ZONE_SOUTH - 8);
    ctx.fillStyle = 'rgba(160, 180, 200, 0.25)';
    ctx.font = '4px sans-serif';
    ctx.fillText('FUEL · SOUTH', 0, 192);
  }

  _drawFuelTank(ctx, x, y, scale = 1) {
    const s = scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a4a38';
    ctx.fillRect(-10, -18, 20, 22);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(-10, -18, 5, 22);
    ctx.fillStyle = 'rgba(140, 160, 120, 0.2)';
    ctx.fillRect(4, -18, 6, 22);
    ctx.fillStyle = '#4a5a48';
    ctx.beginPath();
    ctx.ellipse(0, -18, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a8a70';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeRect(-10, -18, 20, 22);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#c9a020' : '#1a1a14';
      ctx.fillRect(-10 + i * 5, -4, 5, 4);
    }
    ctx.fillStyle = '#6a7888';
    ctx.fillRect(8, -8, 5, 3);
    ctx.fillStyle = '#c05040';
    ctx.beginPath();
    ctx.arc(14, -6.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawFuelHose(ctx, x0, y0, x1, y1, x2, y2) {
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.55)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x1, y1 + 8, x2, y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90, 70, 40, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x1, y1 + 8, x2, y2);
    ctx.stroke();
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(x2 - 3, y2 - 2, 8, 4);
    ctx.lineCap = 'butt';
  }

  _drawHoseReel(ctx, x, y, side) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(side * 2, 8, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a4858';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a90a0';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#1a2834';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0.2, Math.PI * 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * 5, 4);
    ctx.quadraticCurveTo(side * 12, 18, side * 8, 28);
    ctx.stroke();
    ctx.restore();
  }

  _drawToolStation(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a3440';
    ctx.fillRect(-14, -6, 28, 10);
    ctx.fillStyle = '#3a4858';
    ctx.fillRect(-14, -8, 28, 3);
    ctx.fillStyle = 'rgba(140, 160, 180, 0.2)';
    ctx.fillRect(-14, -8, 28, 1.2);
    ctx.strokeStyle = '#6a7a88';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(-14, -6, 28, 10);
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(-4, -16);
    ctx.moveTo(2, -9);
    ctx.lineTo(6, -15);
    ctx.stroke();
    ctx.fillStyle = '#c05040';
    ctx.fillRect(8, -12, 4, 3);
    ctx.fillStyle = '#1a2430';
    ctx.fillRect(-12, 2, 3, 4);
    ctx.fillRect(9, 2, 3, 4);
    ctx.restore();
  }

  _drawBarrel(ctx, x, y, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(-5, -8, 10, 12);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(-5, -8, 3, 12);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -8, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 180, 100, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, -2);
    ctx.lineTo(5, -2);
    ctx.moveTo(-5, 2);
    ctx.lineTo(5, 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawWallLocker(ctx, x, y) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x - 9, y + 2, 18, 4);
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(x - 10, y - 14, 20, 18);
    ctx.fillStyle = 'rgba(120, 150, 170, 0.15)';
    ctx.fillRect(x - 10, y - 14, 20, 2);
    ctx.strokeStyle = '#6a8498';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 10, y - 14, 20, 18);
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
    ctx.fillStyle = '#c9a020';
    ctx.beginPath();
    ctx.arc(x - 4, y - 4, 1.2, 0, Math.PI * 2);
    ctx.arc(x + 4, y - 4, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawFireExt(ctx, x, y) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a03028';
    ctx.fillRect(x - 3, y - 8, 6, 12);
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(x - 2, y - 10, 4, 2);
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 8);
    ctx.lineTo(x + 6, y - 4);
    ctx.stroke();
  }

  _drawDrain(ctx, x, y) {
    ctx.fillStyle = '#121820';
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a5a68';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70, 90, 105, 0.6)';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y + i * 1.4);
      ctx.lineTo(x + 6, y + i * 1.4);
      ctx.stroke();
    }
  }

  _drawCargoPiles(ctx) {
    for (const pile of this.piles) {
      // Hardpoint pad — role tint (sized for 2×2 slots)
      const roleColor =
        pile.role === 'upgrade' ? 'rgba(80, 160, 200, 0.22)'
          : pile.role === 'cargo' ? 'rgba(180, 160, 80, 0.18)'
            : 'rgba(90, 120, 140, 0.2)';
      ctx.strokeStyle = roleColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(pile.x - 13, pile.y - 10, 26, 22);

      // Tiny lane / role mark
      ctx.fillStyle = pile.lane === 'in'
        ? 'rgba(100, 200, 140, 0.35)'
        : 'rgba(200, 120, 100, 0.35)';
      ctx.font = '3px sans-serif';
      ctx.textAlign = 'center';
      const tag =
        pile.role === 'upgrade' ? (pile.lane === 'in' ? 'UP·IN' : 'UP·OUT')
          : pile.role === 'cargo' ? (pile.lane === 'in' ? 'CG·IN' : 'CG·OUT')
            : (pile.lane === 'in' ? 'ST·IN' : 'ST·OUT');
      ctx.fillText(tag, pile.x, pile.y + 15);

      pile.items.forEach((item, i) => {
        const pos = this._itemWorldPos(pile, i);
        this._drawCargoItem(ctx, item, pos.x, pos.y, 1);
      });
    }

    // Panic drops — crates on the deck until crew or crane reclaim them
    for (const drop of this.floorDrops) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y + drop.cargo.h * 0.45, drop.cargo.w * 0.55, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      this._drawCargoItem(ctx, drop.cargo, drop.x, drop.y, 0.92);
    }
  }

  /**
   * Hold cargo = rectangles only. Ship mounts = complex silhouettes.
   * (cx, cy) = item center.
   */
  _drawCargoItem(ctx, item, cx, cy, scale = 1) {
    const s = scale;
    const w = item.w * s;
    const h = item.h * s;
    ctx.save();
    ctx.translate(cx, cy);

    // Hold cargo is always a rectangular box
    if (item.family === 'cargo' || item.shape === 'rect') {
      ctx.fillStyle = item.color;
      ctx.strokeStyle = '#c8c0b0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(0, h / 2);
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 2);
      ctx.restore();
      return;
    }

    const shape = item.shape || 'laser';
    switch (shape) {
      case 'laser': {
        ctx.fillStyle = '#2a3848';
        ctx.fillRect(-w * 0.48, -h * 0.28, w * 0.72, h * 0.56);
        ctx.strokeStyle = '#8ab0c8';
        ctx.lineWidth = 1;
        ctx.strokeRect(-w * 0.48, -h * 0.28, w * 0.72, h * 0.56);
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.moveTo(w * 0.2, -h * 0.35);
        ctx.lineTo(w * 0.5, 0);
        ctx.lineTo(w * 0.2, h * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(160, 230, 255, 0.7)';
        ctx.fillRect(-w * 0.4, -h * 0.12, w * 0.45, h * 0.24);
        ctx.fillStyle = '#c8d8e8';
        ctx.fillRect(-w * 0.48, -h * 0.45, 3, h * 0.9);
        break;
      }
      case 'turret': {
        ctx.fillStyle = '#3a4858';
        ctx.beginPath();
        ctx.arc(0, h * 0.15, w * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#a0b0c0';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.fillRect(-2, -h * 0.48, 4, h * 0.55);
        ctx.fillStyle = '#1a2430';
        ctx.beginPath();
        ctx.arc(0, h * 0.12, w * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d0d8e0';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.48);
        ctx.lineTo(0, -h * 0.1);
        ctx.stroke();
        break;
      }
      case 'armor': {
        ctx.fillStyle = item.color;
        ctx.strokeStyle = '#b0c0d0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.48);
        ctx.lineTo(w * 0.45, -h * 0.15);
        ctx.lineTo(w * 0.38, h * 0.42);
        ctx.lineTo(-w * 0.38, h * 0.42);
        ctx.lineTo(-w * 0.45, -h * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(200, 220, 240, 0.45)';
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.3);
        ctx.lineTo(0, h * 0.25);
        ctx.moveTo(-w * 0.22, -h * 0.05);
        ctx.lineTo(w * 0.22, -h * 0.05);
        ctx.stroke();
        break;
      }
      case 'thruster': {
        ctx.fillStyle = '#3a4a58';
        ctx.fillRect(-w * 0.35, -h * 0.4, w * 0.7, h * 0.55);
        ctx.strokeStyle = '#90a8b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(-w * 0.35, -h * 0.4, w * 0.7, h * 0.55);
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.4, h * 0.1);
        ctx.lineTo(w * 0.4, h * 0.1);
        ctx.lineTo(w * 0.28, h * 0.48);
        ctx.lineTo(-w * 0.28, h * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(120, 200, 255, 0.35)';
        ctx.fillRect(-w * 0.18, -h * 0.28, w * 0.36, h * 0.28);
        break;
      }
      case 'engine': {
        ctx.fillStyle = '#3a3838';
        ctx.beginPath();
        ctx.ellipse(0, -h * 0.05, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c09060';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.35, h * 0.2);
        ctx.lineTo(w * 0.35, h * 0.2);
        ctx.lineTo(w * 0.22, h * 0.48);
        ctx.lineTo(-w * 0.22, h * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 180, 80, 0.4)';
        ctx.beginPath();
        ctx.arc(0, -h * 0.08, w * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'sensor': {
        ctx.fillStyle = '#2a3848';
        ctx.fillRect(-w * 0.2, h * 0.05, w * 0.4, h * 0.35);
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(0, -h * 0.1, w * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b0e0d0';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(200, 255, 230, 0.55)';
        ctx.beginPath();
        ctx.arc(-w * 0.08, -h * 0.18, w * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#80c0a8';
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.48);
        ctx.lineTo(0, -h * 0.28);
        ctx.stroke();
        break;
      }
      default: {
        ctx.fillStyle = item.color;
        ctx.strokeStyle = '#c8c0b0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fill();
        ctx.stroke();
        break;
      }
    }

    ctx.fillStyle = 'rgba(120, 200, 255, 0.7)';
    ctx.fillRect(-1.5, -h / 2 - 3, 3, 2);
    ctx.restore();
  }

  _drawDockPad(ctx, cx, cy, label, opts = {}) {
    const active = !!opts.active;
    const occupied = !!opts.occupied;
    const angle = opts.angle ?? SHIP.SPAWN_ANGLE;
    const skipShadow = !!opts.skipShadow;
    const rimMode = opts.rimMode || 'off';
    ctx.save();
    ctx.translate(cx, cy);

    // Soft contact shadow (2.5D) — skip while sunk in the shaft
    if (!skipShadow) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 4, BAY.PAD_R + 2, BAY.PAD_R * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(angle);

    ctx.fillStyle = active ? '#10161c' : '#141a22';
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R, 0, Math.PI * 2);
    ctx.fill();

    // Concentric wear rings
    ctx.strokeStyle = active ? 'rgba(50, 80, 100, 0.35)' : 'rgba(40, 60, 75, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R * 0.32, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = active ? 'rgba(90, 140, 170, 0.5)' : 'rgba(60, 90, 110, 0.38)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R, 0, Math.PI * 2);
    ctx.stroke();

    // Outer rim: 6 dark separators + 6 yellow caution lights
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x0 = Math.cos(a) * (BAY.PAD_R - 1);
      const y0 = Math.sin(a) * (BAY.PAD_R - 1);
      const x1 = Math.cos(a) * (BAY.PAD_R + 2.5);
      const y1 = Math.sin(a) * (BAY.PAD_R + 2.5);
      if (i % 2 === 0) {
        ctx.strokeStyle = 'rgba(20, 20, 16, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        continue;
      }
      let lit = 0.2;
      if (rimMode === 'on') lit = 0.95;
      else if (rimMode === 'flash') {
        lit = Math.sin(this.time * 10 + i) > 0 ? 0.95 : 0.14;
      }
      ctx.strokeStyle = `rgba(201, 160, 32, ${0.3 + lit * 0.7})`;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (lit > 0.45) {
        const mx = (x0 + x1) * 0.5;
        const my = (y0 + y1) * 0.5;
        ctx.fillStyle = `rgba(255, 220, 80, ${(lit - 0.45) * 0.55})`;
        ctx.beginPath();
        ctx.ellipse(mx, my, 4.5, 3.2, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.lineCap = 'butt';

    // Nose chevron — reads turntable facing (local +X = pad forward)
    ctx.fillStyle = active
      ? 'rgba(100, 180, 255, 0.55)'
      : 'rgba(120, 140, 160, 0.28)';
    ctx.beginPath();
    ctx.moveTo(BAY.PAD_R * 0.72, 0);
    ctx.lineTo(BAY.PAD_R * 0.42, -5);
    ctx.lineTo(BAY.PAD_R * 0.42, 5);
    ctx.closePath();
    ctx.fill();

    if (active) {
      const pulse = 0.04 + 0.03 * Math.sin(this.time * 2.2);
      ctx.fillStyle = `rgba(70, 160, 200, ${pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Un-rotate for upright bay label
    ctx.rotate(-angle);

    ctx.fillStyle = active
      ? 'rgba(100, 180, 255, 0.45)'
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
    const drop = pad.padDrop || 0;
    const south = drop * 52;
    const sc = (1 - drop * 0.42) * (pad.shipScale || 1);
    const alpha = 1 - drop * 0.8;
    const hover = pad.shipHover || 0;
    const y = (pad.shipY || 0) + south + hover * 2;
    const angle = pad.shipAngle ?? FACE_NORTH;

    // Ground shadow (shrinks / fades as pad descends or ship lifts)
    if (drop < 0.85 && Math.abs(pad.shipY || 0) < 40) {
      ctx.save();
      ctx.translate(pad.x, south + 4 + hover * 5);
      ctx.fillStyle = `rgba(0, 0, 0, ${(0.18 + hover * 0.28) * (1 - drop)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14 + hover * 4, 8 + hover * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pad.x, y);
    ctx.scale(sc, sc * (1 - drop * 0.1));
    ctx.rotate(angle);

    drawVisitorShip(ctx, pad.visitorId, {
      thrusters: pad.thrusters,
      velocity: { x: pad.shipVx || 0, y: pad.shipVy || 0 },
      angle,
      angularVelocity: 0,
    });
    ctx.restore();
  }

  _drawStairs(ctx) {
    for (const s of STAIRS) {
      // Hatch lip + shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(s.x - 12, s.y - 8, 24, 18);
      ctx.fillStyle = '#0a121a';
      ctx.strokeStyle = '#5a7088';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.rect(s.x - 11, s.y - 9, 22, 18);
      ctx.fill();
      ctx.stroke();

      // Caution hatch rim
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#c9a020' : '#1a1a14';
        ctx.fillRect(s.x - 11 + i * (22 / 6), s.y - 9, 22 / 6, 2);
      }

      // Stair treads (perspective: north = deeper)
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        ctx.fillStyle = i % 2 ? '#1a2834' : '#243444';
        ctx.fillRect(s.x - 8 + i, s.y - 6 + i * 3.2, 16 - i * 2, 2.8);
        ctx.strokeStyle = `rgba(100, 140, 170, ${0.25 + t * 0.2})`;
        ctx.strokeRect(s.x - 8 + i, s.y - 6 + i * 3.2, 16 - i * 2, 2.8);
      }

      // Handrail stubs
      ctx.strokeStyle = '#6a8498';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s.x - 10, s.y + 6);
      ctx.lineTo(s.x - 10, s.y - 8);
      ctx.moveTo(s.x + 10, s.y + 6);
      ctx.lineTo(s.x + 10, s.y - 8);
      ctx.stroke();

      ctx.fillStyle = 'rgba(100, 180, 255, 0.35)';
      ctx.font = '3.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bayLabels()[s.bay] || 'STAIR', s.x, s.y + 14);
    }
  }

  /**
   * Black/yellow danger-zone running lights: verticals from bay doors → former
   * stair line, plus a horizontal closer. Yellow cells glow by bayLaneMode;
   * incoming/departing chase along the verticals.
   */
  _drawBayDangerLights(ctx) {
    const y0 = -BAY.HALF_H + BAY.DOOR_H + 6;
    const y1 = DANGER_ZONE_SOUTH;
    padCenters().forEach((cx, bay) => {
      const mode = this.bayLaneMode[bay] || 'idle';
      this._drawDangerStripV(ctx, cx - BAY_LANE_HALF, y0, y1, mode);
      this._drawDangerStripV(ctx, cx + BAY_LANE_HALF, y0, y1, mode);
      this._drawDangerStripH(ctx, cx - BAY_LANE_HALF, cx + BAY_LANE_HALF, y1, mode);
    });
  }

  _dangerYellowLit(mode, along, t) {
    if (mode === 'idle') return 0.22;
    if (mode === 'danger') return 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5));
    if (mode === 'elevator') {
      // Steady at arrive/depart peak brightness — no chase / blink
      return 0.95;
    }
    // Chase pulse along strip axis (along increases south / +Y for verticals)
    const period = 36;
    let phase;
    if (mode === 'incoming') {
      // Flow south (doors → pad): bright band moves +along
      phase = ((along + t * 28) % period + period) % period;
    } else if (mode === 'departing') {
      // Flow north (pad → doors)
      phase = ((along - t * 28) % period + period) % period;
    } else {
      return 0.35;
    }
    return phase < 12 ? 0.95 : 0.18;
  }

  _drawDangerStripV(ctx, x, y0, y1, mode) {
    const seg = 7;
    const t = this.time;
    const half = 1.6;
    for (let y = y0, i = 0; y < y1 - 1; y += seg, i++) {
      const h = Math.min(seg, y1 - y);
      if (i % 2 === 1) {
        ctx.fillStyle = '#141410';
        ctx.fillRect(x - half, y, half * 2, h);
        continue;
      }
      const lit = this._dangerYellowLit(mode, y - y0, t);
      ctx.fillStyle = `rgba(201, 160, 32, ${0.35 + lit * 0.65})`;
      ctx.fillRect(x - half, y, half * 2, h);
      if (lit > 0.45) {
        ctx.fillStyle = `rgba(255, 220, 80, ${(lit - 0.45) * 0.45})`;
        ctx.beginPath();
        ctx.ellipse(x, y + h * 0.5, 5.5, h * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawDangerStripH(ctx, x0, x1, y, mode) {
    const seg = 7;
    const t = this.time;
    const half = 1.6;
    for (let x = x0, i = 0; x < x1 - 1; x += seg, i++) {
      const w = Math.min(seg, x1 - x);
      if (i % 2 === 1) {
        ctx.fillStyle = '#141410';
        ctx.fillRect(x, y - half, w, half * 2);
        continue;
      }
      let lit = 0.22;
      if (mode === 'danger' || mode === 'incoming' || mode === 'departing') {
        lit = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5 + x * 0.05));
      } else if (mode === 'elevator') {
        // Match active-mode peak, steady (no pulse)
        lit = 0.9;
      }
      ctx.fillStyle = `rgba(201, 160, 32, ${0.35 + lit * 0.65})`;
      ctx.fillRect(x, y - half, w, half * 2);
      if (lit > 0.45) {
        ctx.fillStyle = `rgba(255, 220, 80, ${(lit - 0.45) * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y, w * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Jet-blast backsplash behind each pad (solid — crew walk around the ends). */
  _drawBacksplashWalls(ctx) {
    const y = BACKSPLASH_Y;
    const hw = BACKSPLASH_HALF_W;

    padCenters().forEach((cx, bay) => {
      const x0 = cx - hw;
      const w = hw * 2;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(x0 - 1, y + 4, w + 2, 5);

      // 2.5D slab — dark north face (blast), lighter top
      ctx.fillStyle = '#1a1010';
      ctx.fillRect(x0, y - 2, w, 8);
      ctx.fillStyle = '#3a3230';
      ctx.fillRect(x0, y - 6, w, 5);
      ctx.fillStyle = 'rgba(160, 140, 120, 0.22)';
      ctx.fillRect(x0, y - 6, w, 1.5);
      ctx.fillStyle = 'rgba(80, 40, 30, 0.35)';
      ctx.fillRect(x0, y - 2, w, 2);
      ctx.strokeStyle = '#6a5a50';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y - 6, w, 9);

      // Scorch / rivets on blast face
      ctx.fillStyle = 'rgba(20, 10, 8, 0.4)';
      ctx.fillRect(x0 + 2, y - 1, w - 4, 3);
      ctx.fillStyle = 'rgba(140, 130, 120, 0.35)';
      for (let rx = x0 + 4; rx < x0 + w - 3; rx += 8) {
        ctx.beginPath();
        ctx.arc(rx, y - 4, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // End posts
      ctx.fillStyle = '#2a3848';
      ctx.fillRect(x0 - 2, y - 7, 4, 12);
      ctx.fillRect(x0 + w - 2, y - 7, 4, 12);
      ctx.fillStyle = '#c9a020';
      ctx.fillRect(x0 - 2, y - 7, 4, 2);
      ctx.fillRect(x0 + w - 2, y - 7, 4, 2);

      ctx.fillStyle = 'rgba(160, 180, 200, 0.35)';
      ctx.font = '3.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${bayLabels()[bay]} · BLAST`, cx, y - 9);
    });
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

    // Carried cargo hangs from the fingers (top just above fingertip line)
    if (c.carried && cargoPos) {
      this._drawCargoItem(ctx, c.carried, cargoPos.x, cargoPos.y, 1);
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

    const bob = npc.state === 'flinch' || npc.state === 'clearHot'
      ? Math.sin(npc.phase * 3) * 1.5
      : Math.sin(npc.phase) * 0.8;
    const duck = npc.state === 'flinch' || npc.state === 'flee' || npc.state === 'clearHot' ? 2 : 0;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = npc.suit;
    ctx.lineWidth = 1.6;
    const walking = [
      'toPile', 'toShip', 'toExit', 'enterDoor', 'exitDoor',
      'flee', 'clearHot', 'toFloorDrop', 'leaveHatch', 'linger',
    ].includes(npc.state);
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
      this._drawCargoItem(ctx, npc.cargo, 6 + npc.cargo.w * 0.15, -2 + bob, 0.72);
    } else if (
      npc.state === 'workWeld' ||
      npc.job === 'weld' ||
      npc.job === 'installUpgrade' ||
      npc.job === 'removeUpgrade'
    ) {
      // Welding torch / install tool
      ctx.strokeStyle = '#c0c8d0';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(3, -1 + bob);
      ctx.lineTo(8, -4 + bob);
      ctx.stroke();
      if (npc.state === 'workWeld' || npc.state === 'workShip') {
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

    if (npc.state === 'flee' || npc.state === 'flinch' || npc.state === 'clearHot') {
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
      this._drawCargoItem(
        ctx,
        npc.cargo,
        11 + npc.cargo.w / 2,
        -10 + bounce + cargoLift,
        0.9
      );
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
