/**
 * Home Base hangar: docked bay, logistics, and reacting NPCs.
 * Seed for new-game start + between-mission hub.
 * Controlled ship seats on a chosen bay (space land = green lane; menu = assigned pad).
 * +Y = south, −Y = north (bay doors to space).
 *
 * Cargo hardpoints: 3×6 — two columns per bay (left=inbound, right=outbound).
 * Rows: N=ship mounts/upgrades, M=hold cargo, S=forklift ↔ storage I/O.
 * Crane ferries S↔N/M in-lane; mechanics ferry N/M ↔ ships; forklifts use S.
 */

import { HANGAR, SHIP } from '../../core/Constants.js';
import { clamp, normalizeAngle } from '../../utils/MathUtils.js';
import { SHIP_EXTENT, HARDPOINTS } from '../../entities/ShipHardpoints.js';
import {
  drawVisitorShip,
  pickVisitorId,
  makeVisitorThrusters,
  getVisitorPropulsion,
  VISITOR_CATALOG,
  equipPadVisitor,
  clearPadVisitor,
  createVisitorShipDef,
} from '../HangarVisitorShips.js';
import {
  upgradeKindFromItemId,
  pickCatalogItemId,
  pickAmbientCatalogUpgradeId,
  pickUpgradeInstallRequest,
  unequipHardpoint,
  equipHardpoint,
  emptySocketsForCategory,
  pickStripKey,
  needsStripBeforeInstall,
  needsStripBeforeInstallKey,
  categoryFromFreightLabel,
  shipDefSwapGroup,
} from '../../ships/HangarLoadout.js';
import {
  createPlayerStarter,
} from '../../ships/ShipGenerator.js';
import {
  hangarShipView,
  headingIndexFromAngle,
  angledLiftLocal,
  angledDepthScale,
} from '../../ships/ShipViews.js';
import { padMkForSwapGroup } from '../../ships/ShipClasses.js';
import { getItem } from '../../ships/ItemCatalog.js';
import { Settings } from '../../core/Settings.js';
import {
  getHangarProps,
  getGossipWaypoints,
  getHangarSidePadX,
  resolveLingerBays,
  lingerAllowsBay,
} from '../hangar-layout.js';
import {
  applyServiceScrollWheel,
  buildServiceBoardRows,
  createServiceScrollState,
  drawServiceChecklistColumn,
  hitServiceColumn,
  hitServiceScrollbar,
  hitServiceScrollbarThumb,
  notifyServiceScrollUser,
  offsetFromScrollbarY,
  serviceBoardFixedMetrics,
  sortServiceDisplayRows,
  tickServiceBoardScroll,
} from '../ServiceBoard.js';
import {
  placeRegistry,
  resolveHangarSkin,
  hasModule,
  isTurretMountCategory,
  canPerformTurretCraneStage,
  canPlayerStartTurretSwap,
  applyHullHeal,
  ensureVesselSimState,
} from '../place/index.js';

import {
  hangarZoomMin,
  hangarZoomMax,
  hangarDefaultZoom,
  hangarElevatorZoom,
  FACE_SOUTH,
  FACE_NORTH,
  BAY,
  ROW,
  ROW_Y,
  DANGER_ZONE_SOUTH,
  SERVICE_BOARD_TOP,
  SERVICE_BOARD_BOTTOM,
  BACKSPLASH_Y,
  BACKSPLASH_BAND,
  BACKSPLASH_BYPASS,
  BACKSPLASH_HALF_W,
  MECH_BODY_R,
  DANGER_ZONE_PAD,
  FLOOR_DROP_CRANE_AGE,
  APRON_SAFE_Y,
  BAY_COMPUTERS,
  CREW_VIS_OCT,
  CREW_VIS_TURN,
  CREW_VIS_TURN_LOCK,
  MECH_TURN_ALIGN,
  MECH_TURN_STOP,
  MECH_BAY_THEMES,
  FORK_TRUCK_LEN,
  FORKLIFT_HUB_W,
  FORKLIFT_PARK_COUNT,
  FORKLIFT_PARKS,
  FORKLIFT_ACTIVE,
  CRANE_HOME,
  STAIRS,
  STAIR_Y,
  MECH_LINGER_Y_MAX,
  GOSSIP_RING_RADIUS,
  BRIDGE_Y_MIN,
  BRIDGE_Y_MAX,
  RUNWAY_X,
  HOIST_RAISED,
  HOIST_MAX,
  TROLLEY_NORTH,
  CLAW_OPEN,
  CLAW_GRIP,
  CLAW_PALM,
  CLAW_FINGER,
  CRANE_CREW,
  FORK_RAISED,
  FORK_LOWERED,
  FORK_ANIM_SPEED,
  FORK_LANE_OFFSET,
  FORK_APPROACH_SOUTH,
  FORK_CREEP_NORTH,
  FORK_TINE_TIP_X,
  FORK_OVERSHOOT,
  FORK_TINE_Y_BASE,
  FORK_DROP_VIS,
  MECH_LANE_OFFSET,
  MECH_APPROACH_ALONG,
  MECH_CREEP_IN,
  MECH_HAND_REACH_X,
  MECH_HAND_GRIP_Y,
  MECH_HANDOFF_SPEED,
  WELD_TORCH_REACH,
  CARGO_MIN,
  CARGO_MAX,
  PILE_CAP,
  INBOUND_SOFT_CAP,
  CRATE_VARIANTS,
  SERVICE_CARGO,
  HOLD_CARGO,
  UPGRADE_KINDS,
  PILE_SLOTS,
  COL_OFFSET,
  CARGO_KINDS,
  HULL_PIP_HEAL_AVG,
} from './constants.js';
import {
  padCenters,
  colXs,
  applyHangarSidePadX,
  hangarPadX,
  syncHangarSidePadFromLayout,
  syncBayAnchors,
  bayIndexFromX,
  colMeta,
  buildPileHardpoints,
  rollSidePad,
  bayLabels,
} from './layout.js';
import {
  makeCargo,
  makeCatalogUpgradeCargo,
  makeInboundCargo,
  packCargoHold,
  meterServiceUnits,
  hullRepairPipCount,
  hullPipHealAmount,
  cargoServiceUnits,
  visitorServiceBias,
  syncCargoSpace,
  addCargoHoldBlock,
  removeCargoHoldBlock,
  crateKindFromHoldBlock,
  holdBlockSkinFromCargo,
  pickHoldCrateSkin,
  statColorForPct,
  cargoSpaceFromHold,
  cargoMkForVisitor,
  cargoBaySpec,
  smoothstep,
  pingPong01,
  pipRevealDelays,
  clearVisitorThrusters,
  rollVisitorPadMk,
  shuffleInPlace,
  needRequestChance,
  unitsFromNeed,
  SERVICE_STAGING_TYPES,
} from './cargoCatalog.js';
import { rand, pick, randInt, thrusterActivity, bayLaneHalf, weldSpotsForPip, craneJobDistScale } from './helpers.js';
import { attachHangarRender } from './HangarRender.js';
import { attachCraneSim } from './CraneSim.js';
import { attachForkliftAI } from './ForkliftAI.js';
import { attachMechanicAI } from './MechanicAI.js';
import { attachVisitorTraffic } from './VisitorTraffic.js';
import { attachCrewShared } from './CrewShared.js';

export {
  hangarZoomMin,
  hangarZoomMax,
  hangarDefaultZoom,
  hangarElevatorZoom,
} from './constants.js';
export {
  applyHangarSidePadX,
  hangarPadX,
  syncHangarSidePadFromLayout,
} from './layout.js';

export class HangarBay {
  constructor() {
    this.time = 0;
    this.npcs = [];
    this._sparkle = [];
    this._debris = [];
    /** Short-lived deck light stamps left by flying weld sparks */
    this._weldEmberTrail = [];
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    this.sidePads = [];
    this.piles = [];
    this.floorDrops = [];
    this._npcUid = 1;
    this._floorDropSeq = 1;
    this._shipPos = { x: 0, y: 0 };
    /** Last weapon deck-wash point (turret tip / laser muzzle) — not pad center */
    this._weaponWash = { x: 0, y: 0 };
    /** Live player Ship entity (set each hangar update) — owns shipDef loadout */
    this._playerShip = null;
    this._shipAngle = SHIP.SPAWN_ANGLE;
    /** Place → hangar area runtime config (from placeRegistry) */
    this.placeId = 'place.jennings';
    this.areaId = 'area.hangar-main';
    this.hangarConfig = placeRegistry.getHangarRuntimeConfig();
    /** Resolved look skin for active hangar area */
    this.skin = null;
    this.crane = null;
    this._pressure = 0; // <0 need more cargo, >0 need less
    /** Per-bay door beacons — computed each frame by `_syncDoorBeacons` */
    this.bayBeacons = ['off', 'off', 'off'];
    /**
     * Per-bay danger-lane lights: 'idle' | 'danger' | 'incoming' | 'departing' | 'elevator'
     * (incoming/departing = chase; elevator = steady at chase brightness)
     */
    this.bayLaneMode = ['idle', 'idle', 'idle'];
    /** 0 = sealed, 1 = fully open (telescoping leaves) */
    this.doorOpen = [0, 0, 0];
    /** Bay indices under launch/land / visitor ops lock */
    this._opsBays = new Set();
    /** Empty-bay cargo sweep after a visitor leaves (non-player bays) */
    this.bayClearing = [false, false, false];
    /** Pad rim yellow lights: 'off' | 'on' | 'flash' */
    this.padRimMode = ['off', 'off', 'off'];
    /** Dev/sim: bay offline — no traffic, no service, no auto arrivals */
    this.bayOffline = [false, false, false];
    /** Which bay (0/1/2) holds the player ship this session */
    this.playerBayIndex = 1;
    /** Player pad turntable facing (matches docked ship nose; SHIP.SPAWN_ANGLE = north) */
    this.playerPadAngle = SHIP.SPAWN_ANGLE;
    /** Player elevator depth — 0 on deck, 1 fully below (menu arrival). */
    this.playerPadDrop = 0;
    /** True while player ship is still rising from elevator (blocks captain service). */
    this.playerArrivalPending = false;
    /** Dev: player ship seated on player bay (false = empty pad for testing) */
    this.playerPadOccupied = true;
    /**
     * Dev hangar control — bay index whose pad uses the “active” draw style,
     * or null when nothing is selected.
     * @type {number|null}
     */
    this.devControlBayIndex = null;
    /** Dev: player-bay scripted pad spin / door / elev */
    this._playerDevSeq = null;
    /** Player ship flight offsets during Dev door/elev scenes */
    this.playerFlight = {
      shipY: 0,
      shipHover: 0,
      shipScale: 1,
      shipVy: 0,
      shipAngle: null,
    };
    /** Door-header ticker lines per bay [{ text, color }, ...] */
    this.bayTicker = [[], [], []];
    /** Hulls that just left into space — drained by GameEngine → ambient */
    this.pendingSpaceEgress = [];
    /**
     * Space runway reservations driving hangar arrive animations.
     * @type {({ shipId: string|number, isPlayer: boolean }|null)[]}
     */
    this._spaceApproach = [null, null, null];
    /**
     * When true (pilot in space), empty-bay door arrives are requested for
     * ambient runway traffic instead of spawning only inside the hangar.
     */
    this.preferExternalDoorTraffic = false;
    /**
     * When false (interior session inactive), ambient must not start new
     * mouth approaches against a frozen sim.
     */
    this.spaceTrafficActive = true;
    /** Per-bay service-column hit boxes (world space; refreshed each draw). */
    this._serviceColumnHit = [null, null, null];
    this._serviceScrollDragBay = null;
  }

  isPlayerBay(bayIndex) {
    return bayIndex === this.playerBayIndex;
  }

  getPlayerBayIndex() {
    return this.playerBayIndex;
  }

  playerPadWorldX() {
    return hangarPadX(this.playerBayIndex);
  }

  getBaySignal(bayIndex) {
    const i = ((bayIndex | 0) + 3) % 3;
    if (this.bayOffline[i]) return 'red';
    const lane = this.bayLaneMode[i] || 'idle';
    const pad = this._servicePad(i);
    const seq = this.isPlayerBay(i) ? this._playerDevSeq : pad?.seq;
    const seqKind = seq?.kind || '';
    // Elevator activity → yellow spinning beacon (space view)
    const elevator =
      lane === 'elevator' ||
      seqKind === 'lower' ||
      seqKind === 'raiseLaunch' ||
      seqKind === 'raiseArrive' ||
      seqKind === 'lowerCycle' ||
      seqKind === 'elevLeave' ||
      seqKind === 'elevArrive';
    if (elevator) return 'elevator';
    const departing =
      lane === 'departing' ||
      seqKind === 'depart' ||
      seqKind === 'doorDepart';
    if (departing) return 'departing';
    if (lane === 'incoming' || seqKind === 'arrive' || seqKind === 'doorArrive') {
      return 'red';
    }
    if (this._bayHasShip(i)) return 'red';
    return 'green';
  }

  getBaySignals() {
    return [0, 1, 2].map((i) => this.getBaySignal(i));
  }

  anyBayDeparting() {
    return this.getBaySignals().some((s) => s === 'departing');
  }

  allBaysBlocked() {
    return this.getBaySignals().every((s) => s !== 'green');
  }

  claimEmptyBayForControlled(bayIndex, playerShip, opts = {}) {
    const bi = ((bayIndex | 0) + 3) % 3;
    const force = !!opts.force;
    if (!force && this.getBaySignal(bi) !== 'green' && !this.isPlayerBay(bi)) {
      return false;
    }
    if (this.isPlayerBay(bi)) {
      this.playerPadOccupied = true;
      if (playerShip) this._playerShip = playerShip;
      this.playerBay.x = hangarPadX(bi);
      this.playerBay.visitorId = 'player';
      this.playerBay.seq = null;
      return true;
    }
    const side = this.sidePads.find((p) => p.bayIndex === bi);
    if (!side) return false;
    if (side.visitorId && !force) return false;
    if (side.visitorId) clearPadVisitor(side);

    const oldBi = this.playerBayIndex;
    const labels = bayLabels();
    const peerMk = this._playerPadMk();
    // Old controlled pad becomes an empty side bay
    const vacated = rollSidePad(hangarPadX(oldBi), labels[oldBi], oldBi, peerMk);
    vacated.visitorId = null;
    vacated.shipDef = null;
    vacated.thrusters = null;
    vacated.shipState = null;
    vacated.service = null;
    vacated.seq = null;

    this.sidePads = this.sidePads.filter((p) => p.bayIndex !== bi);
    this.sidePads.push(vacated);

    this.playerBayIndex = bi;
    this.playerBay = {
      x: hangarPadX(bi),
      bayId: labels[bi],
      bayIndex: bi,
      padMk: 2,
      visitorId: 'player',
      shipState: null,
      service: null,
      seq: null,
    };
    this.playerPadOccupied = true;
    if (playerShip) this._playerShip = playerShip;
    this.playerArrivalPending = false;
    return true;
  }

  clearControlledPadAfterLaunch() {
    this.playerPadOccupied = false;
    if (this.playerBay) {
      this.playerBay.service = null;
      this.playerBay.shipState = null;
      this.playerBay.seq = null;
    }
    this.playerFlight = {
      shipY: 0,
      shipHover: 0,
      shipScale: 1,
      shipVy: 0,
      shipAngle: null,
    };
    this._spaceApproach = [null, null, null];
    this._playerDevSeq = null;
  }

  drainSpaceEgress() {
    const q = this.pendingSpaceEgress || [];
    this.pendingSpaceEgress = [];
    return q;
  }

  acceptSpaceArrival(bayIndex, shipDef, visitorId = 'patrol') {
    const bi = ((bayIndex | 0) + 3) % 3;
    if (this.isPlayerBay(bi)) return false;
    const pad = this.sidePads.find((p) => p.bayIndex === bi);
    if (!pad) return false;

    // Hangar arrive already started from runway reservation — keep playing it
    if (pad.seq?.kind === 'arrive' && pad.seq.fromSpace) {
      if (shipDef) {
        pad.shipDef = shipDef;
        pad.thrusters = makeVisitorThrusters(shipDef);
      }
      pad.wantSpaceArrival = false;
      this._spaceApproach[bi] = null;
      return true;
    }
    // Arrive finished while the ship was still on the runway
    if (
      pad.visitorId &&
      !pad.seq &&
      this._spaceApproach[bi] &&
      !this._spaceApproach[bi].isPlayer
    ) {
      pad.wantSpaceArrival = false;
      this._spaceApproach[bi] = null;
      return true;
    }

    if (this.getBaySignal(bi) !== 'green') return false;
    if (pad.visitorId || pad.seq) return false;
    equipPadVisitor(pad, visitorId);
    if (shipDef) {
      pad.shipDef = shipDef;
      pad.thrusters = makeVisitorThrusters(shipDef);
    }
    pad.wantSpaceArrival = false;
    // Seat immediately (space handoff already played the mouth cinematic)
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padAngle = FACE_NORTH;
    pad.shipAngle = FACE_NORTH;
    this._beginCaptainService(pad);
    return true;
  }

  getSpaceArrivalRequestLanes() {
    if (!this.preferExternalDoorTraffic || !this.spaceTrafficActive) return [];
    const out = [];
    for (const pad of this.sidePads || []) {
      if (!pad?.wantSpaceArrival) continue;
      if (pad.visitorId || pad.seq) continue;
      if (this.bayOffline[pad.bayIndex]) continue;
      if (this.isPlayerBay(pad.bayIndex)) continue;
      if (this._spaceApproach[pad.bayIndex]) continue;
      out.push(pad.bayIndex);
    }
    return out;
  }

  isSpaceDoorArriveActive() {
    return (
      this._playerDevSeq?.kind === 'doorArrive' && !!this._playerDevSeq.fromSpace
    );
  }

  abortPlayerSpaceApproachForLanding() {
    const pb = this.playerBayIndex;
    // Full abandon restore (doors/ops) then land seq re-opens for cinematic
    if (this._playerDevSeq?.fromSpace && !this._spaceApproach[pb]) {
      this._spaceApproach[pb] = { shipId: 'landing', isPlayer: true };
    }
    if (this._spaceApproach[pb]?.isPlayer) {
      this._cancelSpaceApproach(pb);
    }
    this.playerPadOccupied = false;
    if (this.playerBay) {
      this.playerBay.visitorId = null;
      this.playerBay.service = null;
      this.playerBay.shipState = null;
    }
    this._resetPlayerFlight();
  }

  syncSpaceApproachReservations(claims) {
    const wanted = new Map();
    for (const c of claims || []) {
      if (c?.lane == null || c.shipId == null) continue;
      wanted.set(((c.lane | 0) + 3) % 3, c);
    }

    for (let i = 0; i < 3; i++) {
      const token = this._spaceApproach[i];
      const claim = wanted.get(i);
      if (token && (!claim || claim.shipId !== token.shipId)) {
        this._cancelSpaceApproach(i);
      }
    }

    for (const [lane, claim] of wanted) {
      const token = this._spaceApproach[lane];
      if (token && token.shipId === claim.shipId) continue;
      this._beginSpaceApproach(lane, claim);
    }
  }

  _beginSpaceApproach(lane, claim) {
    const bi = ((lane | 0) + 3) % 3;
    if (claim.isPlayer) {
      // Already finished from-space arrive (or mid doorArrive) — keep claim, don't restart
      if (
        this.isPlayerBay(bi) &&
        this._playerDevSeq?.kind === 'doorArrive' &&
        this._playerDevSeq.fromSpace
      ) {
        this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: true };
        return;
      }
      if (this.isPlayerBay(bi) && this.playerPadOccupied && !this._playerDevSeq) {
        this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: true };
        return;
      }

      if (this.getBaySignal(bi) !== 'green' && !this.isPlayerBay(bi)) return;
      if (!this.isPlayerBay(bi)) {
        const ok = this.claimEmptyBayForControlled(bi, claim.playerShip || null);
        if (!ok) return;
      }
      // Keep pad empty until doorArrive approach phase seats the hull
      this.playerPadOccupied = false;
      if (this.playerBay) this.playerBay.visitorId = null;

      if (this._playerDevSeq) return;

      this.beginOps(bi, 'incoming');
      this._playerDevSeq = {
        kind: 'doorArrive',
        t: 0,
        phase: 'warn',
        fromSpace: true,
      };
      this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: true };
      return;
    }

    if (this.isPlayerBay(bi)) return;
    const pad = this.sidePads.find((p) => p.bayIndex === bi);
    if (!pad) return;
    // Mid / finished from-space arrive — don't restart
    if (pad.seq?.kind === 'arrive' && pad.seq.fromSpace) {
      this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: false };
      return;
    }
    if (pad.visitorId && !pad.seq) {
      this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: false };
      return;
    }
    if (this.getBaySignal(bi) !== 'green') return;
    if (pad.visitorId || pad.seq) return;

    const visitorId = claim.visitorId || 'hauler';
    equipPadVisitor(pad, visitorId);
    if (claim.shipDef) {
      pad.shipDef = claim.shipDef;
      pad.thrusters = makeVisitorThrusters(claim.shipDef);
    }
    pad.wantSpaceArrival = false;
    pad.padAngle = FACE_SOUTH;
    pad.shipAngle = FACE_SOUTH;
    pad.shipY = HANGAR.LAND_START_Y;
    pad.shipHover = 1;
    pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
    pad.shipVy = 0;
    pad.service = null;
    pad.shipState = null;
    this.beginOps(bi, 'incoming');
    this.setDoorOpen(bi, 0);
    pad.seq = { kind: 'arrive', phase: 'warn', t: 0, fromSpace: true };
    this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: false };
  }

  _cancelSpaceApproach(bayIndex) {
    const bi = ((bayIndex | 0) + 3) % 3;
    const token = this._spaceApproach[bi];
    if (!token) return;
    this._spaceApproach[bi] = null;

    if (token.isPlayer) {
      // Ship left the runway — restore empty pad (close doors, clear ops)
      if (this._playerDevSeq?.fromSpace) this._playerDevSeq = null;
      this.clearOps(bi);
      this.setDoorOpen(bi, 0);
      this.setBeacon(bi, 'off');
      this.setPadRim(bi, 'off');
      this.playerPadOccupied = false;
      this.playerPadAngle = FACE_SOUTH;
      if (this.playerBay) {
        this.playerBay.visitorId = null;
        this.playerBay.service = null;
        this.playerBay.shipState = null;
      }
      this._resetPlayerFlight();
      return;
    }

    const pad = this.sidePads.find((p) => p.bayIndex === bi);
    if (!pad) return;
    // Abort in-progress from-space arrive (not a finished seated visitor)
    if (pad.seq?.fromSpace && pad.seq.kind === 'arrive') {
      clearPadVisitor(pad);
      pad.seq = null;
      pad.service = null;
      pad.shipState = null;
      pad.padAngle = FACE_SOUTH;
      pad.shipAngle = FACE_SOUTH;
      pad.shipY = 0;
      pad.shipHover = 0;
      pad.shipScale = 1;
      this.clearOps(bi);
      this.setDoorOpen(bi, 0);
      this.setBeacon(bi, 'off');
      this.setPadRim(bi, 'off');
    }
  }

  _syncSidePadPositions(delta = 0, floorMoves = [], agentMoves = [], craneBay = null) {
    syncBayAnchors();
    const cols = colXs();
    if (this.piles) {
      for (const pile of this.piles) {
        pile.x = cols[pile.col];
      }
    }
    if (this.playerBay) {
      this.playerBay.x = hangarPadX(this.playerBayIndex);
    }
    if (this.sidePads) {
      for (const pad of this.sidePads) {
        pad.x = hangarPadX(pad.bayIndex);
      }
    }
    if (delta) {
      const shiftX = (bay) => (bay === 0 ? -delta : bay === 2 ? delta : 0);
      for (const { npc, bay } of agentMoves) {
        const dx = shiftX(bay);
        if (dx) npc.x += dx;
      }
      for (const { drop, bay } of floorMoves) {
        const dx = shiftX(bay);
        if (dx) drop.x += dx;
      }
      if (this.crane && (craneBay === 0 || craneBay === 2)) {
        const dx = shiftX(craneBay);
        this.crane.trolleyX += dx;
        if (Number.isFinite(this.crane._prevTX)) this.crane._prevTX += dx;
      }
    }
  }

  setDevControlBay(bayIndex) {
    this.devControlBayIndex =
      bayIndex == null || !Number.isFinite(bayIndex) ? null : bayIndex | 0;
  }

  isDevControlBay(bayIndex) {
    return this.devControlBayIndex != null && bayIndex === this.devControlBayIndex;
  }

  reset(playerShip = null, opts = {}) {
    if (playerShip) this._playerShip = playerShip;
    syncHangarSidePadFromLayout(null);
    this._hydrateFromPlace(opts);
    const bayCount = Math.max(1, this.hangarConfig?.bayCount || 3);
    const bayIndex =
      ((opts.playerBayIndex ?? this.playerBayIndex ?? 1) | 0) % bayCount;
    this.playerBayIndex = bayIndex;
    this.time = 0;
    this.npcs = [];
    this._sparkle = [];
    this._debris = [];
    this._weldEmberTrail = [];
    this.floorDrops = [];
    this._npcUid = 1;
    this._floorDropSeq = 1;
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    this._weaponWash = { x: 0, y: 0 };
    const n = Math.max(1, this.hangarConfig?.bayCount || 3);
    this.bayBeacons = Array(n).fill('off');
    this.bayLaneMode = Array(n).fill('idle');
    this.doorOpen = Array(n).fill(0);
    this._opsBays = new Set();
    this.bayClearing = Array(n).fill(false);
    this.padRimMode = Array(n).fill('off');
    this.bayOffline = (this.hangarConfig?.bayOffline || Array(n).fill(false)).slice();
    while (this.bayOffline.length < n) this.bayOffline.push(false);
    this.playerPadAngle = SHIP.SPAWN_ANGLE;
    this.playerPadDrop = 0;
    this.playerArrivalPending = false;
    this.playerPadOccupied = true;
    this._playerDevSeq = null;
    this.playerFlight = {
      shipY: 0,
      shipHover: 0,
      shipScale: 1,
      shipVy: 0,
      shipAngle: null,
    };
    this.bayTicker = Array.from({ length: n }, () => []);
    this.pendingSpaceEgress = [];
    this._spaceApproach = Array(n).fill(null);
    this.preferExternalDoorTraffic = false;
    this.spaceTrafficActive = !!this.hangarConfig?.visitorTraffic;
    const labels = this._bayLabels();
    const playerPadMk = this._configuredPadMk(bayIndex) || 2;
    this.playerBay = {
      x: hangarPadX(bayIndex),
      bayId: labels[bayIndex],
      bayIndex,
      padMk: playerPadMk,
      visitorId: 'player',
      shipState: null,
      service: null,
      seq: null,
    };
    const peerPadMk = this._playerPadMk();
    const bayIndices = Array.from({ length: n }, (_, i) => i);
    this.sidePads = bayIndices
      .filter((i) => i !== bayIndex)
      .map((i) => {
        const pad = rollSidePad(
          hangarPadX(i),
          labels[i],
          i,
          this._configuredPadMk(i) || peerPadMk
        );
        // Prefer configured pad Mk when present (military / mixed yards)
        const cfgMk = this._configuredPadMk(i);
        if (cfgMk) pad.padMk = cfgMk;
        return pad;
      });
    this.piles = buildPileHardpoints();
    this._seedCargo();
    this._resetCrane();
    for (const pad of this.sidePads) {
      if (pad.visitorId) this._beginCaptainService(pad);
    }
    this._initStationCrew();
  }

  _hydrateFromPlace(opts = {}) {
    if (opts.placeId) {
      placeRegistry.setActive(opts.placeId, opts.areaId || null);
    }
    this.placeId = placeRegistry.activePlaceId;
    const place = placeRegistry.getActive();
    const hangarArea =
      placeRegistry.getActiveHangarArea() ||
      place?.areas?.[place?.defaultHangarAreaId];
    this.areaId = hangarArea?.id || placeRegistry.activeAreaId;
    this.hangarConfig = placeRegistry.getHangarRuntimeConfig(
      this.placeId,
      this.areaId
    );
    this.skin = resolveHangarSkin(place, hangarArea, null);
  }

  _bayLabels() {
    const n = Math.max(1, this.hangarConfig?.bayCount || 3);
    const ids = this.hangarConfig?.bayIds || [];
    return Array.from({ length: n }, (_, i) => {
      const f = ids[i];
      if (this.hangarConfig && placeRegistry.get(this.placeId)?.areas?.[this.areaId]?.features?.[f]?.label) {
        return placeRegistry.get(this.placeId).areas[this.areaId].features[f].label;
      }
      return bayLabels()[i] || `B${i + 1}`;
    });
  }

  _configuredPadMk(bayIndex) {
    const mk = this.hangarConfig?.padMk?.[bayIndex];
    return mk != null ? mk | 0 : null;
  }

  _bayHasModule(bayIndex, moduleId) {
    const mods = this.hangarConfig?.bayModules?.[bayIndex];
    return hasModule(mods, moduleId);
  }

  hasCrane() {
    return !!this.hangarConfig?.hasCrane;
  }

  playerMayManCrane() {
    return !!(this.hasCrane() && this.hangarConfig?.playerCraneAuthority);
  }

  canTurretSwap() {
    return canPlayerStartTurretSwap(this.hangarConfig);
  }

  warmStartHeadless(simSeconds = HANGAR.WARMUP_SEC) {
    const step = HANGAR.WARMUP_STEP;
    const targetTime = this.time + simSeconds;
    this._headlessWarmup = true;
    while (this.time < targetTime) {
      const dt = Math.min(step, targetTime - this.time);
      this.update(dt, null, {});
    }
    this._headlessWarmup = false;
    this._freshPlayerBay();
  }

  _freshPlayerBay() {
    const pb = this.playerBayIndex;
    this.playerPadDrop = 0;
    this.playerArrivalPending = false;
    this.playerPadOccupied = true;
    this._playerDevSeq = null;
    if (this.playerBay) {
      this.playerBay.x = hangarPadX(pb);
      this.playerBay.bayIndex = pb;
      this.playerBay.bayId = bayLabels()[pb];
      this.playerBay.visitorId = 'player';
      this.playerBay.service = null;
      this.playerBay.shipState = null;
    }
    for (const p of this.piles) {
      if (p.bay === pb) p.items = [];
    }
    this.floorDrops = this.floorDrops.filter((d) => bayIndexFromX(d.x) !== pb);
    this.bayClearing[pb] = false;
    this.clearOps(pb);
    for (const npc of this.npcs) {
      if (npc.kind === 'mechanic' && npc.homeBay === pb) {
        this._clearTaskClaim(npc);
        this._parkMechanicIdle(npc);
      }
      if (npc.kind === 'forklift') {
        const onPlayerBay =
          npc.targetPile?.bay === pb ||
          npc.lingerPile?.bay === pb ||
          npc.cargo?.serviceBay === pb;
        if (onPlayerBay) {
          this._clearTaskClaim(npc);
          npc.cargo = null;
          npc.targetPile = null;
          npc.lingerPile = null;
          npc.targetSlot = null;
          npc.forkPhase = null;
          this._parkForkliftAtHub(npc);
        }
      }
    }
    if (this.crane) {
      const c = this.crane;
      const touchesPlayer =
        c.pickup?.bay === pb ||
        c.dropoff?.bay === pb ||
        (c.pickup?.isFloorDrop && bayIndexFromX(c.pickup.x) === pb);
      if (touchesPlayer) {
        this._applyCraneJob(c, this._pickCraneJob());
      }
    }
  }

  getBayDoorAnchor(bayIndex = this.playerBayIndex) {
    const cx = padCenters()[bayIndex] ?? 0;
    return {
      x: cx,
      y: -BAY.HALF_H + BAY.DOOR_H * 0.55,
      halfW: BAY.DOOR_HALF,
      doorH: BAY.DOOR_H,
    };
  }

  beginOps(bayIndex, laneMode = 'departing') {
    this._opsBays.add(bayIndex);
    this.bayLaneMode[bayIndex] = laneMode;
    // Arrival flashes rim; departure / elevator / pad motion hold rim on
    this.padRimMode[bayIndex] = laneMode === 'incoming' ? 'flash' : 'on';
    // Player launch/land freezes the crane; visitor ops do not
    if (this.isPlayerBay(bayIndex) && this.crane) this.crane.pause = 99;
    // Divert after freeze so a bay-touching cancel cannot clear the ops pause
    this._divertCraneFromBay(bayIndex, { keepOpsFreeze: this.isPlayerBay(bayIndex) });
    this._evacBayCrew(bayIndex);
  }

  setBeacon(bayIndex, mode) {
    // Door beacons are derived each frame; keep setter for callers/compat
    this.bayBeacons[bayIndex] = mode;
  }

  setLaneMode(bayIndex, mode) {
    this.bayLaneMode[bayIndex] = mode;
  }

  setDoorOpen(bayIndex, amount) {
    this.doorOpen[bayIndex] = Math.max(0, Math.min(1, amount));
  }

  setPadRim(bayIndex, mode) {
    this.padRimMode[bayIndex] = mode;
  }

  setPlayerPadAngle(angle) {
    this.playerPadAngle = angle;
  }

  _bayHasShip(bayIndex) {
    if (this.isPlayerBay(bayIndex)) return !!this.playerPadOccupied;
    const pad = this._sidePadForBay(bayIndex);
    return !!(pad && pad.visitorId);
  }

  isBayOffline(bayIndex) {
    return !!this.bayOffline[bayIndex];
  }

  isPlayerPadOccupied() {
    return !!this.playerPadOccupied;
  }

  isPlayerShipVisible() {
    const s = this._playerDevSeq;
    if (s) {
      if (s.kind === 'doorDepart') {
        return (
          s.phase === 'warn' ||
          s.phase === 'clear' ||
          s.phase === 'doors' ||
          s.phase === 'lift' ||
          s.phase === 'thrust'
        );
      }
      if (s.kind === 'doorArrive') {
        return (
          s.phase === 'approach' ||
          s.phase === 'settle' ||
          s.phase === 'turn' ||
          s.phase === 'doorsClose'
          // awaitIngress / warn / clear / doors: hull not drawn yet
        );
      }
      if (s.kind === 'elevLeave') {
        return s.phase === 'sink' || s.phase === 'warn' || s.phase === 'clear';
      }
      if (s.kind === 'elevArrive') {
        return s.phase === 'rise';
      }
    }
    return !!this.playerPadOccupied;
  }

  isPlayerDevSceneActive() {
    const k = this._playerDevSeq?.kind;
    return !!(
      k &&
      (k === 'doorDepart' ||
        k === 'doorArrive' ||
        k === 'elevLeave' ||
        k === 'elevArrive' ||
        k === 'padSpin')
    );
  }

  isBayOccupied(bayIndex) {
    return this._bayHasShip(bayIndex);
  }

  pickShipAt(worldX, worldY, hitR = 44) {
    if (this.isPlayerShipVisible()) {
      const px = this.playerPadWorldX();
      const py = this.playerFlight?.shipY || 0;
      if (Math.hypot(worldX - px, worldY - py) <= hitR) {
        return { kind: 'player', bayIndex: this.playerBayIndex };
      }
    }
    for (const pad of this.sidePads) {
      if (!pad.visitorId) continue;
      if ((pad.padDrop || 0) >= 0.02) continue;
      if (!this._visitorArrivalShipVisible(pad)) continue;
      const y = pad.shipY || 0;
      if (Math.hypot(worldX - pad.x, worldY - y) <= hitR) {
        return { kind: 'visitor', bayIndex: pad.bayIndex };
      }
    }
    return null;
  }

  _resetPlayerFlight() {
    this.playerFlight = {
      shipY: 0,
      shipHover: 0,
      shipScale: 1,
      shipVy: 0,
      shipAngle: null,
    };
  }

  _clearPlayerShipThrusters() {
    const ship = this._playerShip;
    if (!ship?.thrusters) return;
    for (const key of Object.keys(ship.thrusters)) {
      if (typeof ship.thrusters[key] === 'number') ship.thrusters[key] = 0;
    }
    ship.thrusters.retroBurn = false;
  }

  _firePlayerManeuverBurst(power) {
    const ship = this._playerShip;
    if (!ship?.thrusters) return;
    this._clearPlayerShipThrusters();
    const keys = [
      'aftPort',
      'aftStarboard',
      'nosePort',
      'noseStarboard',
      'portFore',
      'portAft',
      'starboardFore',
      'starboardAft',
    ];
    for (const key of keys) ship.thrusters[key] = power;
  }

  _firePlayerEngine(power) {
    const ship = this._playerShip;
    if (!ship?.thrusters) return;
    this._clearPlayerShipThrusters();
    ship.thrusters.mainEngine = power;
  }

  _firePlayerNoseBrake(power) {
    const ship = this._playerShip;
    if (!ship?.thrusters) return;
    this._clearPlayerShipThrusters();
    ship.thrusters.nosePort = power;
    ship.thrusters.noseStarboard = power;
  }

  _bayWorkComplete(bayIndex) {
    const pad = this._servicePad(bayIndex);
    if (!pad?.visitorId) return false;
    const svc = pad.service;
    if (!svc) return true;
    // Green / clear-to-depart only after verify scan — never while jobs or settle are live
    if (svc.phase === 'dwell' || svc.phase === 'done' || svc.phase === 'reroll') {
      return true;
    }
    if (
      svc.phase === 'settle' ||
      svc.phase === 'boardReveal' ||
      svc.phase === 'finalScan' ||
      svc.phase === 'active'
    ) {
      return false;
    }
    return this._serviceAllDone(pad) && this._servicePipsSettled(pad);
  }

  _isPadHardwareResting(bayIndex) {
    const door = this.doorOpen[bayIndex] || 0;
    if (door > 0.02) return false;
    if (this.isPlayerBay(bayIndex)) {
      if ((this.playerPadDrop || 0) > 0.02) return false;
      const a = this.playerPadAngle;
      const nearN = Math.abs(Math.atan2(Math.sin(a - FACE_NORTH), Math.cos(a - FACE_NORTH))) < 0.12;
      const nearS = Math.abs(Math.atan2(Math.sin(a - FACE_SOUTH), Math.cos(a - FACE_SOUTH))) < 0.12;
      if (!nearN && !nearS) return false;
      // Elevator/launch ops with closed doors (pad turn / elevator) → not rest
      const pb = this.playerBayIndex;
      if (this._opsBays.has(pb) && this.bayLaneMode[pb] === 'elevator') return false;
      return true;
    }
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return true;
    if ((pad.padDrop || 0) > 0.02) return false;
    if (pad.seq) {
      const k = pad.seq.kind || '';
      if (
        k.includes('turn') ||
        k === 'lower' ||
        k === 'raiseLaunch' ||
        k === 'raiseArrive' ||
        k.startsWith('raise') ||
        k.startsWith('lower')
      ) {
        return false;
      }
    }
    if (this.bayLaneMode[bayIndex] === 'elevator' && this._opsBays.has(bayIndex)) return false;
    return true;
  }

  _isPadRotatingOrElevator(bayIndex) {
    if ((this.doorOpen[bayIndex] || 0) > 0.02) return false;
    if (this.isPlayerBay(bayIndex)) {
      const a = this.playerPadAngle;
      const nearN = Math.abs(Math.atan2(Math.sin(a - FACE_NORTH), Math.cos(a - FACE_NORTH))) < 0.12;
      const nearS = Math.abs(Math.atan2(Math.sin(a - FACE_SOUTH), Math.cos(a - FACE_SOUTH))) < 0.12;
      if (!nearN && !nearS) return true;
      const pb = this.playerBayIndex;
      if (this._opsBays.has(pb) && this.bayLaneMode[pb] === 'elevator') return true;
      return false;
    }
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    if ((pad.padDrop || 0) > 0.02) return true;
    if (pad.seq) {
      const k = pad.seq.kind || '';
      if (k.includes('turn') || k === 'lower' || k.startsWith('raise') || k.startsWith('lower')) {
        return true;
      }
    }
    return this.bayLaneMode[bayIndex] === 'elevator' && this._opsBays.has(bayIndex);
  }

  _syncDoorBeacons() {
    for (let i = 0; i < 3; i++) {
      const door = this.doorOpen[i] || 0;
      if (door > 0.02 && door < 0.98) {
        this.bayBeacons[i] = 'redFlash';
        continue;
      }
      if (door >= 0.98) {
        this.bayBeacons[i] = 'green';
        continue;
      }
      // Doors closed
      if (this._isPadRotatingOrElevator(i)) {
        this.bayBeacons[i] = 'amberFlash';
        continue;
      }
      if (!this._bayHasShip(i)) {
        this.bayBeacons[i] = 'off';
        continue;
      }
      if (!this._bayWorkComplete(i)) {
        this.bayBeacons[i] = 'amber';
        continue;
      }
      this.bayBeacons[i] = 'greenBlink';
    }
  }

  _bayActiveJobLines(bayIndex) {
    const i = ((bayIndex | 0) + 3) % 3;
    const lane = this.bayLaneMode[i];
    const door = this.doorOpen[i] || 0;
    const pad = this._servicePad(i);
    const seq = this.isPlayerBay(i) ? this._playerDevSeq : pad?.seq;
    const seqKind = seq?.kind || '';
    const drop = this.isPlayerBay(i)
      ? this.playerPadDrop || 0
      : pad?.padDrop || 0;

    // --- Bay lifecycle (single status line) ---
    if (this.bayOffline[i]) {
      return [{ text: 'BAY DISABLED', color: 'dim' }];
    }

    const elevator =
      lane === 'elevator' ||
      drop > 0.02 ||
      seqKind === 'lower' ||
      seqKind === 'raiseLaunch' ||
      seqKind === 'raiseArrive' ||
      seqKind === 'lowerCycle' ||
      seqKind === 'elevLeave' ||
      seqKind === 'elevArrive' ||
      seqKind === 'padSpin';
    if (elevator) {
      return [{ text: 'ELEVATOR ACTIVE', color: 'amber' }];
    }

    const incoming =
      lane === 'incoming' ||
      seqKind === 'arrive' ||
      seqKind === 'doorArrive' ||
      seqKind === 'approach';
    if (incoming) {
      return [{ text: 'SHIP INCOMING', color: 'red' }];
    }

    const departing =
      lane === 'departing' ||
      seqKind === 'depart' ||
      seqKind === 'doorDepart' ||
      seqKind === 'leave';
    if (departing) {
      return [{ text: 'SHIP DEPARTING', color: 'red' }];
    }

    if (!this._bayHasShip(i)) {
      return [{ text: 'BAY EMPTY', color: 'dim' }];
    }

    // --- Occupied: board reveal / captain service ---
    const svc = pad?.service;
    if (svc?.phase === 'finalScan') {
      return [{ text: 'SCANNING', color: 'blue' }];
    }
    if (svc?.phase === 'boardReveal' && svc.reveal) {
      const stage = svc.reveal.stage;
      if (
        stage === 'preScan' ||
        stage === 'stats' ||
        stage === 'cargo' ||
        stage === 'postScan'
      ) {
        return [{ text: 'SCANNING', color: 'blue' }];
      }
      if (stage === 'pipGap' || stage === 'pips') {
        return [{ text: 'PLEASE SELECT SERVICES', color: 'amber' }];
      }
    }

    const lines = [];

    if (door > 0.02 && door < 0.98) {
      lines.push({ text: 'DOORS MOVING', color: 'red' });
    }

    if (this._bayWorkComplete(i)) {
      if (door >= 0.98) lines.push({ text: 'CLEAR TO DEPART', color: 'green' });
      else if (!lines.length) lines.push({ text: 'AWAITING EXIT', color: 'green' });
      return lines.slice(0, 2);
    }

    // Active crew / service reporting
    for (const npc of this.npcs) {
      if (lines.length >= 2) break;
      if (npc.kind === 'mechanic' && npc.homeBay === i) {
        if (npc.job === 'weld' && npc.state?.startsWith('work')) {
          lines.push({ text: 'REPAIRING HULL', color: 'blue' });
        } else if (npc.job === 'installUpgrade' && npc.state !== 'idleFluff') {
          lines.push({ text: 'INSTALLING UPGRADE', color: 'blue' });
        } else if (npc.job === 'loadShip' && npc.state !== 'idleFluff') {
          lines.push({ text: 'LOADING CARGO', color: 'blue' });
        } else if (npc.job === 'unloadShip' && npc.state !== 'idleFluff') {
          lines.push({ text: 'UNLOADING CARGO', color: 'blue' });
        } else if (npc.job === 'removeUpgrade' && npc.state !== 'idleFluff') {
          lines.push({ text: 'REMOVING UPGRADE', color: 'blue' });
        }
      }
      if (npc.kind === 'forklift' && npc.targetPile?.bay === i) {
        if (npc.job === 'bringIn') lines.push({ text: 'STAGING MATERIALS', color: 'yellow' });
        else if (npc.job === 'takeOut') lines.push({ text: 'CLEARING BAY', color: 'yellow' });
      }
    }

    if (this.crane?.pickup?.bay === i || this.crane?.dropoff?.bay === i) {
      if (this.crane.phase !== 'idle' && this.crane.phase !== 'linger' && lines.length < 2) {
        lines.push({ text: 'STAGING MATERIALS', color: 'yellow' });
      }
    }

    if (this.bayClearing[i] && lines.length < 2) {
      lines.push({ text: 'CLEARING BAY', color: 'yellow' });
    }

    if (svc?.items?.length && lines.length < 2) {
      const pending = svc.items.find((it) => it.status !== 'done');
      if (pending) {
        const map = {
          refuel: 'REFUELING',
          reloadBullets: 'RELOADING BULLETS',
          reloadShells: 'RELOADING SHELLS',
          repair: 'REPAIRING HULL',
          loadCargo: 'LOADING CARGO',
          unloadCargo: 'UNLOADING CARGO',
          upgrade: 'INSTALLING UPGRADE',
        };
        lines.push({
          text: map[pending.type] || 'STAGING MATERIALS',
          color: pending.status === 'staging' ? 'yellow' : 'blue',
        });
      }
    }

    if (!lines.length) lines.push({ text: 'STANDBY', color: 'dim' });
    const seen = new Set();
    return lines.filter((l) => {
      if (seen.has(l.text)) return false;
      seen.add(l.text);
      return true;
    }).slice(0, 2);
  }

  _syncBayTickers() {
    for (let i = 0; i < 3; i++) {
      this.bayTicker[i] = this._bayActiveJobLines(i);
    }
  }

  _boardUnitColor(bayIndex, svc, it) {
    // Done: stay blue until the mech walks away (pipSettled); finalScan holds blue
    if (it.status === 'done') {
      if (svc?.phase === 'finalScan') return 'blue';
      return it.pipSettled ? 'green' : 'blue';
    }

    // Yellow until a bay mechanic has claimed this exact unit (not forklift staging)
    const claimed = this.npcs.some((n) => {
      if (n.kind !== 'mechanic' || n.homeBay !== bayIndex) return false;
      if (n.job === 'idle' || n.state === 'idleFluff') return false;
      const sid = n._activeServiceId ?? n.cargo?.serviceKey;
      return sid != null && sid === it.id;
    });

    if (it.type === 'upgrade') {
      const blockers = svc.items.filter(
        (o) =>
          o !== it &&
          o.status !== 'done' &&
          (o.type === 'refuel' ||
            o.type === 'repair' ||
            o.type === 'reloadBullets' ||
            o.type === 'reloadShells' ||
            o.type === 'loadCargo')
      );
      if (blockers.length && !claimed) return 'grey';
    }

    return claimed ? 'blue' : 'yellow';
  }

  _settleActiveServicePip(npc) {
    const id = npc?._activeServiceId ?? npc?.cargo?.serviceKey;
    if (id == null) return;
    for (const pad of this._allServicePads()) {
      const it = pad.service?.items?.find((i) => i.id === id);
      if (it) {
        it.pipSettled = true;
        return;
      }
    }
  }

  _ensurePadServiceScroll(pad) {
    if (!pad) return null;
    if (!pad.serviceScroll) pad.serviceScroll = createServiceScrollState();
    return pad.serviceScroll;
  }

  _serviceDisplayRows(bayIndex, ctx = null, colW = null) {
    const pad = this._servicePad(bayIndex);
    const svc = pad?.service;

    if (!this._bayHasShip(bayIndex) || !svc?.items?.length) {
      return buildServiceBoardRows([], { unitColorOf: () => 'dim' });
    }
    const revealing = svc.phase === 'boardReveal' && svc.reveal && svc.reveal.stage !== 'done';
    const shown = revealing ? svc.reveal.shownIds : null;
    const rows = buildServiceBoardRows(svc.items, {
      shownIds: shown,
      unitColorOf: (it) => this._boardUnitColor(bayIndex, svc, it),
    });
    return sortServiceDisplayRows(rows);
  }

  _boardTaskRows(bayIndex) {
    return this._serviceDisplayRows(bayIndex);
  }

  _tickServiceBoardScrolls(dt) {
    const metrics = serviceBoardFixedMetrics(SERVICE_BOARD_TOP);
    for (let bay = 0; bay < 3; bay++) {
      if (!this._bayHasShip(bay)) continue;
      const pad = this._servicePad(bay);
      if (!pad?.service) continue;
      const scroll = this._ensurePadServiceScroll(pad);
      const rows = this._serviceDisplayRows(bay);
      tickServiceBoardScroll(scroll, rows, metrics.visibleRowSlots, this.time, dt);
    }
  }

  pickServiceColumnAt(wx, wy) {
    for (let bay = 0; bay < 3; bay++) {
      const hit = this._serviceColumnHit[bay];
      if (!hit) continue;
      if (hitServiceColumn(wx, wy, hit.colX, hit.colW, hit.listTop, hit.listH)) {
        return bay;
      }
    }
    return -1;
  }

  applyServiceWheel(bayIndex, zoomDelta) {
    if (!zoomDelta) return false;
    const pad = this._servicePad(bayIndex);
    if (!pad?.service) return false;
    const scroll = this._ensurePadServiceScroll(pad);
    const metrics = serviceBoardFixedMetrics(SERVICE_BOARD_TOP);
    const rows = this._serviceDisplayRows(bayIndex);
    const maxOffset = Math.max(0, rows.length - metrics.visibleRowSlots);
    applyServiceScrollWheel(scroll, -Math.sign(zoomDelta), this.time, maxOffset);
    return true;
  }

  handleServiceScrollPointer(mouseDown, wx, wy) {
    if (this._serviceScrollDragBay != null) {
      const pad = this._servicePad(this._serviceScrollDragBay);
      const scroll = pad?.serviceScroll;
      if (mouseDown && scroll?.drag) {
        const thumbTop = wy - scroll.drag.grabDy;
        scroll.offset = clamp(
          offsetFromScrollbarY(thumbTop, scroll.drag.sb),
          0,
          scroll.drag.sb.maxOffset
        );
        notifyServiceScrollUser(scroll, this.time);
        return true;
      }
      if (scroll?.drag) notifyServiceScrollUser(scroll, this.time);
      if (scroll) scroll.drag = null;
      this._serviceScrollDragBay = null;
      return false;
    }

    if (!mouseDown) return false;

    for (let bay = 0; bay < 3; bay++) {
      const hit = this._serviceColumnHit[bay];
      if (!hit?.sb) continue;
      const pad = this._servicePad(bay);
      if (!pad?.service) continue;
      if (!hitServiceScrollbar(wx, wy, hit.sb)) continue;
      const scroll = this._ensurePadServiceScroll(pad);
      notifyServiceScrollUser(scroll, this.time);
      if (hitServiceScrollbarThumb(wx, wy, hit.sb)) {
        scroll.drag = { sb: hit.sb, grabDy: wy - hit.sb.thumbY };
      } else {
        scroll.offset = offsetFromScrollbarY(wy, hit.sb);
        const thumbTravel = Math.max(0, hit.sb.trackH - hit.sb.thumbH);
        const thumbY =
          hit.sb.maxOffset <= 0
            ? hit.sb.trackY
            : hit.sb.trackY + (scroll.offset / hit.sb.maxOffset) * thumbTravel;
        scroll.drag = { sb: hit.sb, grabDy: wy - thumbY };
      }
      this._serviceScrollDragBay = bay;
      return true;
    }
    return false;
  }

  isServiceScrollDragging() {
    return this._serviceScrollDragBay != null;
  }

  _boardHeaderLight(bayIndex) {
    if (!this._bayHasShip(bayIndex)) return 'off';
    if (this._opsBays.has(bayIndex) || (this.doorOpen[bayIndex] || 0) > 0.05) return 'redFlash';
    if (this._bayWorkComplete(bayIndex)) return 'green';
    return 'yellow';
  }

  clearOps(bayIndex) {
    const clearOne = (i) => {
      if (!this._opsBays.has(i)) return;
      this._opsBays.delete(i);
      this.bayLaneMode[i] = 'idle';
      this.doorOpen[i] = 0;
      this.padRimMode[i] = 'off';
      // Match beginOps: unfreeze for whichever bay holds the player (not hardcoded B2)
      if (this.isPlayerBay(i) && this.crane) this.crane.pause = 0.2;
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

  _servicePad(bayIndex) {
    if (this.isPlayerBay(bayIndex)) return this.playerBay;
    return this._sidePadForBay(bayIndex);
  }

  _allServicePads() {
    return [this.playerBay, ...this.sidePads].filter(Boolean);
  }

  _bayAcceptsCargo(bay) {
    if (this.bayClearing[bay]) return false;
    if (this._opsBays.has(bay)) return false;
    const pad = this._servicePad(bay);
    if (this.isPlayerBay(bay)) {
      // Headless warmup must not stock the player bay (wiped after; steals visitor freight).
      if (this._headlessWarmup) return false;
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
    for (const bay of [0, 1, 2]) {
      if (this.isPlayerBay(bay)) continue;
      if (!this.bayClearing[bay]) continue;
      if (!this._bayHasResidualCargo(bay)) this.bayClearing[bay] = false;
    }
  }

  _startBayClear(bay) {
    if (this.isPlayerBay(bay)) return;
    this.bayClearing[bay] = true;
    // Cancel mechanic jobs aimed at this pad
    for (const npc of this.npcs) {
      if (npc.kind !== 'mechanic') continue;
      if (npc.targetPad && Math.abs(npc.targetPad.x - (padCenters()[bay] || 0)) < 20) {
        this._clearTaskClaim(npc);
        npc.job = 'idle';
        npc.taskMode = 'idle';
        this._beginIdleFluff(npc);
      }
    }
  }

  _dangerRect(bayIndex) {
    const cx = padCenters()[bayIndex] ?? 0;
    return {
      x0: cx - bayLaneHalf(),
      x1: cx + bayLaneHalf(),
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

  _shouldHoldForHotDrop(npc) {
    if (npc.state !== 'toFloorDrop') return false;
    const drop = this.floorDrops.find(
      (d) => d.id === npc.floorDropId || d.id === npc.droppedCargoId
    );
    if (!drop) return false;
    return this._pointInAnyHotDanger(drop.x, drop.y, 0) != null;
  }

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
      // Drop sticky south skirts when the real goal is north of the boards
      const goalSouth = ty >= BACKSPLASH_Y;
      if (goalSouth || prefer.y < BACKSPLASH_Y + BACKSPLASH_BAND) {
        return prefer;
      }
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
      const points = [
        { x: left, y: goalSouth ? gateSouth : gateNorth },
        { x: right, y: goalSouth ? gateSouth : gateNorth },
        { x: left, y: sy },
        { x: right, y: sy },
        { x: left, y: ty },
        { x: right, y: ty },
        { x: left, y: north },
        { x: right, y: north },
      ];
      // Only offer south gates when the goal is actually south
      if (goalSouth) {
        points.push({ x: left, y: south }, { x: right, y: south });
        points.push({ x: left, y: gateSouth }, { x: right, y: gateSouth });
      }
      for (const p of points) {
        if (this._pointInAnyHotDanger(p.x, p.y, 2) != null) continue;
        if (this._npcInBacksplash(p.x, p.y) != null) continue;
        if (this._segmentHitsAnyHotDanger(sx, sy, p.x, p.y, exceptBay)) continue;
        let cost = Math.hypot(p.x - sx, p.y - sy) + Math.hypot(tx - p.x, ty - p.y);
        const pSouth = p.y >= BACKSPLASH_Y;
        if (pSouth !== goalSouth) cost += goalSouth ? 80 : 220;
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

  _padWorkable(pad) {
    if (!pad) return false;
    const bay = typeof pad.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(pad.x);
    if (this._isBayOpsHot(bay)) return false;
    const svcPad = this._servicePad(bay);
    if (this.isPlayerBay(bay)) {
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
      npc._weldGlow = null;
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

  _evacBayCrew(bayIndex) {
    for (const npc of this.npcs) {
      if (npc.kind !== 'mechanic') continue;
      if (!this._inBayDangerZone(npc, bayIndex)) continue;
      this._startClearHot(npc, bayIndex);
    }
  }

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
    if (pad.visitorId) {
      const def = this._ensurePadShipDef(pad);
      pad.thrusters = makeVisitorThrusters(def);
    } else {
      pad.thrusters = null;
      pad.shipDef = null;
    }
    clearVisitorThrusters(pad);
  }

  _setPadCooldown(pad, busy) {
    pad.cooldown = busy
      ? rand(HANGAR.VISITOR_COOLDOWN_BUSY_MIN, HANGAR.VISITOR_COOLDOWN_BUSY_MAX)
      : rand(HANGAR.VISITOR_COOLDOWN_EMPTY_MIN, HANGAR.VISITOR_COOLDOWN_EMPTY_MAX);
  }

  _queueSpaceEgress(pad) {
    if (!pad?.shipDef || !Number.isFinite(pad.bayIndex)) return false;
    if (!this.pendingSpaceEgress) this.pendingSpaceEgress = [];
    // One egress per bay in the pending queue
    if (this.pendingSpaceEgress.some((e) => e.bayIndex === pad.bayIndex)) {
      return false;
    }
    this.pendingSpaceEgress.push({
      shipDef: pad.shipDef,
      bayIndex: pad.bayIndex,
      visitorId: pad.visitorId || 'patrol',
    });
    return true;
  }

  rerollPlayerService() {
    const pb = this.playerBayIndex;

    if (this._playerShip) {
      this._playerShip.shipDef = createPlayerStarter();
      this._playerShip.miningLaserRelAngle = 0;
      this._playerShip.miningLaserFiring = false;
      this._playerShip.miningLaserBeamLength = undefined;
      this._playerShip.muzzleFlash = 0;
      this._playerShip.turretRecoil = 0;
      if (typeof this._playerShip.angle === 'number') {
        this._playerShip.turretAngle = this._playerShip.angle;
      }
    }

    // Drop the old checklist entirely (pips / tasks gone — not marked done)
    this.playerBay.service = null;
    this.playerBay.shipState = null;
    this.playerArrivalPending = false;
    this.bayClearing[pb] = false;

    this._purgeBayFreightAndCrew(pb);
    this._beginCaptainService(this.playerBay);
    return true;
  }

  forceSidePadElevatorCycle(bayIndex) {
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;

    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    pad.service = null;
    pad.shipState = null;
    this.setDoorOpen(bayIndex, 0);

    if (!pad.visitorId) {
      pad.padMk = this._rollVisitorPadMk();
      equipPadVisitor(pad, pickVisitorId(pad.padMk));
    }

    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    pad.padAngle = FACE_NORTH;
    pad.shipAngle = FACE_NORTH;
    clearVisitorThrusters(pad);
    this.beginOps(pad.bayIndex, 'elevator');
    // kind starts with "lower" so pad-rest / amber-elevator gates already apply
    pad.seq = { kind: 'lowerCycle', phase: 'sink', t: 0 };
    return true;
  }

  devRerollService(bayIndex) {
    if (this.isPlayerBay(bayIndex)) return this.rerollPlayerService();
    const pad = this._sidePadForBay(bayIndex);
    if (!pad?.visitorId) return false;
    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    pad.service = null;
    pad.shipState = null;
    this._beginCaptainService(pad);
    return true;
  }

  devForceDoor(bayIndex) {
    if (this.bayOffline[bayIndex]) return false;
    if (this.isPlayerBay(bayIndex)) return this._devForcePlayerDoor();
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    if (pad.visitorId) {
      pad.service = null;
      pad.shipState = null;
      this._startVisitorSeq(pad, 'depart');
    } else {
      this._startVisitorSeq(pad, 'arrive');
    }
    return true;
  }

  devForceElev(bayIndex) {
    if (this.bayOffline[bayIndex]) return false;
    if (this.isPlayerBay(bayIndex)) return this._devForcePlayerElev();
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    if (pad.visitorId) {
      pad.service = null;
      pad.shipState = null;
      this._startVisitorSeq(pad, 'lower');
    } else {
      this._startVisitorSeq(pad, 'raiseArrive');
    }
    return true;
  }

  devForcePadSpin(bayIndex) {
    if (this.bayOffline[bayIndex]) return false;
    if (this.isPlayerBay(bayIndex)) {
      const pb = this.playerBayIndex;
      this.clearOps(pb);
      this.beginOps(pb, 'elevator');
      this._playerDevSeq = {
        kind: 'padSpin',
        t: 0,
        startAngle: this.playerPadAngle || FACE_NORTH,
        duration: 2.4,
      };
      return true;
    }
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    this.clearOps(bayIndex);
    this.beginOps(bayIndex, 'elevator');
    pad.seq = {
      kind: 'padSpin',
      phase: 'spin',
      t: 0,
      startAngle: pad.padAngle || FACE_NORTH,
      duration: 2.4,
    };
    return true;
  }

  devForceEmpty(bayIndex) {
    if (this.isPlayerBay(bayIndex)) {
      const pb = this.playerBayIndex;
      this.clearOps(pb);
      this._playerDevSeq = null;
      this.playerPadOccupied = false;
      this.playerPadDrop = 0;
      this.playerArrivalPending = false;
      this.playerBay.service = null;
      this.playerBay.shipState = null;
      this.playerBay.visitorId = null;
      this._purgeBayFreightAndCrew(pb);
      this.bayClearing[pb] = false;
      this.clearOps(pb);
      this.setDoorOpen(pb, 0);
      this.playerPadAngle = FACE_SOUTH;
      return true;
    }
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    this._finishVisitorLeave(pad, { clearCargo: false });
    return true;
  }

  devForceOccupy(bayIndex) {
    if (this.isPlayerBay(bayIndex)) {
      const pb = this.playerBayIndex;
      this.clearOps(pb);
      this._playerDevSeq = null;
      this.playerPadOccupied = true;
      this.playerPadDrop = 0;
      this.playerArrivalPending = false;
      this.playerBay.visitorId = 'player';
      this.playerPadAngle = FACE_NORTH;
      this.setDoorOpen(pb, 0);
      this.bayClearing[pb] = false;
      this._purgeBayFreightAndCrew(pb);
      this._beginCaptainService(this.playerBay);
      return true;
    }
    return this.rerollSidePadVisitor(bayIndex);
  }

  devSetBayOffline(bayIndex, offline) {
    this.bayOffline[bayIndex] = !!offline;
    if (offline) {
      this.clearOps(bayIndex);
      if (this.isPlayerBay(bayIndex)) {
        this._playerDevSeq = null;
      } else {
        const pad = this._sidePadForBay(bayIndex);
        if (pad) pad.seq = null;
      }
      this.setDoorOpen(bayIndex, 0);
      this.bayLaneMode[bayIndex] = 'idle';
      this.padRimMode[bayIndex] = 'off';
    }
    return true;
  }

  devResetBay(bayIndex) {
    this.bayOffline[bayIndex] = false;
    this.bayClearing[bayIndex] = false;
    this.clearOps(bayIndex);
    this.setDoorOpen(bayIndex, 0);
    this.bayLaneMode[bayIndex] = 'idle';
    this.padRimMode[bayIndex] = 'off';

    if (this.isPlayerBay(bayIndex)) {
      const pb = this.playerBayIndex;
      this._playerDevSeq = null;
      this.playerPadOccupied = true;
      this.playerPadDrop = 0;
      this.playerArrivalPending = false;
      this.playerPadAngle = FACE_NORTH;
      this.playerBay.visitorId = 'player';
      this.playerBay.service = null;
      this.playerBay.shipState = null;
      if (this._playerShip) {
        this._playerShip.shipDef = createPlayerStarter();
        this._playerShip.miningLaserRelAngle = 0;
        this._playerShip.miningLaserFiring = false;
        this._playerShip.angle = FACE_NORTH;
        this._playerShip.turretAngle = FACE_NORTH;
      }
      this._purgeBayFreightAndCrew(pb);
      this._beginCaptainService(this.playerBay);
      return true;
    }

    return this.rerollSidePadVisitor(bayIndex);
  }

  _devForcePlayerDoor() {
    const pb = this.playerBayIndex;
    this.clearOps(pb);
    this._playerDevSeq = null;
    this._resetPlayerFlight();
    this._clearPlayerShipThrusters();
    const occupied = !!this.playerPadOccupied;
    if (occupied) {
      this.playerPadAngle = FACE_NORTH;
      this.playerFlight.shipAngle = FACE_NORTH;
      this.beginOps(pb, 'departing');
      this._playerDevSeq = { kind: 'doorDepart', t: 0, phase: 'warn' };
    } else {
      this.playerPadAngle = FACE_SOUTH;
      this.playerFlight.shipY = HANGAR.LAND_START_Y;
      this.playerFlight.shipHover = 1;
      this.playerFlight.shipScale = HANGAR.VISITOR_HOVER_SCALE;
      this.playerFlight.shipAngle = FACE_SOUTH;
      this.playerFlight.shipVy = 0;
      this.playerBay.visitorId = 'player';
      this.beginOps(pb, 'incoming');
      this._playerDevSeq = { kind: 'doorArrive', t: 0, phase: 'warn' };
    }
    return true;
  }

  _devForcePlayerElev() {
    const pb = this.playerBayIndex;
    this.clearOps(pb);
    this._playerDevSeq = null;
    this._resetPlayerFlight();
    this._clearPlayerShipThrusters();
    this.beginOps(pb, 'elevator');
    if (this.playerPadOccupied) {
      this.playerPadAngle = FACE_NORTH;
      this.playerFlight.shipAngle = FACE_NORTH;
      this._playerDevSeq = { kind: 'elevLeave', t: 0, phase: 'warn' };
    } else {
      // Empty pad: sink first, then rise with ship (no snap-to-bottom)
      this.playerPadAngle = FACE_SOUTH;
      this.playerPadDrop = 0;
      this._playerDevSeq = { kind: 'elevArrive', t: 0, phase: 'warn' };
    }
    return true;
  }

  _tickPlayerDevSeq(dt) {
    const s = this._playerDevSeq;
    if (!s) return;
    const pb = this.playerBayIndex;
    s.t += dt;
    this.tickEvac(pb);

    if (s.kind === 'padSpin') {
      const u = Math.min(1, s.t / (s.duration || 2.4));
      this.playerPadAngle = (s.startAngle || FACE_NORTH) + u * Math.PI * 2;
      if (u >= 1) {
        this.playerPadAngle = FACE_NORTH;
        this.clearOps(pb);
        this._playerDevSeq = null;
      }
      return;
    }

    if (s.kind === 'doorDepart') {
      this._tickPlayerDoorDepart(s, dt, pb);
      return;
    }
    if (s.kind === 'doorArrive') {
      this._tickPlayerDoorArrive(s, dt, pb);
      return;
    }
    if (s.kind === 'elevLeave') {
      this._tickPlayerElevLeave(s, dt, pb);
      return;
    }
    if (s.kind === 'elevArrive') {
      this._tickPlayerElevArrive(s, dt, pb);
    }
  }

  _tickPlayerDoorDepart(s, dt, pb) {
    const f = this.playerFlight;
    switch (s.phase) {
      case 'warn':
        this._clearPlayerShipThrusters();
        if (s.t > 1.2) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this._clearPlayerShipThrusters();
        if (this.isBayDangerClear(pb) || s.t > 3.2) {
          s.phase = 'doors';
          s.t = 0;
          this.setBeacon(pb, 'open');
        }
        break;
      case 'doors':
        this._clearPlayerShipThrusters();
        this.setDoorOpen(pb, Math.min(1, s.t / HANGAR.VISITOR_DOOR_TIME));
        if (s.t > HANGAR.VISITOR_DOOR_TIME + 0.15) {
          s.phase = 'lift';
          s.t = 0;
        }
        break;
      case 'lift': {
        const liftT = HANGAR.VISITOR_LIFT_TIME;
        const u = smoothstep(s.t / liftT);
        f.shipHover = u;
        f.shipScale = 1 + u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst =
          s.t < liftT * 0.72
            ? HANGAR.HOVER_BURST_POWER
            : HANGAR.HOVER_BURST_POWER *
              Math.max(0, 1 - (s.t - liftT * 0.72) / (liftT * 0.28));
        if (burst > 0.02) this._firePlayerManeuverBurst(burst);
        else this._clearPlayerShipThrusters();
        f.shipAngle = FACE_NORTH;
        this.playerPadAngle = FACE_NORTH;
        if (s.t >= liftT) {
          f.shipHover = 1;
          f.shipScale = HANGAR.VISITOR_HOVER_SCALE;
          s.phase = 'thrust';
          s.t = 0;
          f.shipVy = 0;
        }
        break;
      }
      case 'thrust': {
        const power = Math.min(1.15, 0.4 + s.t * 0.55);
        this._firePlayerEngine(power);
        f.shipVy -= HANGAR.VISITOR_THRUST_ACCEL * dt;
        f.shipY += f.shipVy * dt;
        f.shipHover = 1;
        f.shipScale = HANGAR.VISITOR_HOVER_SCALE;
        f.shipAngle = FACE_NORTH;
        this.playerPadAngle = FACE_NORTH;
        if (f.shipY < HANGAR.LAUNCH_EXIT_Y || s.t > 5) {
          s.phase = 'doorsClose';
          s.t = 0;
          this.playerPadOccupied = false;
          this.playerBay.visitorId = null;
          this.playerBay.service = null;
          this.playerBay.shipState = null;
          this._resetPlayerFlight();
          this._clearPlayerShipThrusters();
          this.setBeacon(pb, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pb, Math.max(0, 1 - s.t / 1.3));
        if (s.t > 1.35) {
          s.phase = 'turnEmpty';
          s.t = 0;
        }
        break;
      case 'turnEmpty': {
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        this.playerPadAngle = FACE_NORTH + (FACE_SOUTH - FACE_NORTH) * u;
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          this.playerPadAngle = FACE_SOUTH;
          this.setDoorOpen(pb, 0);
          this.clearOps(pb);
          this._playerDevSeq = null;
          this._resetPlayerFlight();
        }
        break;
      }
      default:
        break;
    }
  }

  _tickPlayerDoorArrive(s, dt, pb) {
    const f = this.playerFlight;
    switch (s.phase) {
      case 'warn':
        this._clearPlayerShipThrusters();
        if (s.t > 1.2) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this._clearPlayerShipThrusters();
        if (this.isBayDangerClear(pb) || s.t > 3.2) {
          s.phase = 'doors';
          s.t = 0;
        }
        break;
      case 'doors':
        this._clearPlayerShipThrusters();
        this.setDoorOpen(pb, Math.min(1, s.t / HANGAR.VISITOR_DOOR_TIME));
        if (s.t > HANGAR.VISITOR_DOOR_TIME + 0.15) {
          // fromSpace: hold doors open until the captain cuts to hangar —
          // don't seat the hull headlessly (that skipped the land cinematic).
          if (s.fromSpace) {
            s.phase = 'awaitIngress';
            s.t = 0;
            this.setDoorOpen(pb, 1);
            break;
          }
          s.phase = 'approach';
          s.t = 0;
          f.shipVy = HANGAR.VISITOR_APPROACH_SPEED;
          f.shipY = HANGAR.LAND_START_Y;
          f.shipHover = 1;
          f.shipScale = HANGAR.VISITOR_HOVER_SCALE;
          f.shipAngle = FACE_SOUTH;
          this.playerPadAngle = FACE_SOUTH;
          this.playerPadOccupied = true;
          this.playerBay.visitorId = 'player';
        }
        break;
      case 'awaitIngress':
        // Runway reservation prep only — visual approach starts in hangar mode
        this._clearPlayerShipThrusters();
        this.setDoorOpen(pb, 1);
        break;
      case 'approach': {
        if (f.shipY > -70) {
          this._firePlayerNoseBrake(0.9);
          f.shipVy = Math.max(12, f.shipVy - 90 * dt);
        } else {
          this._clearPlayerShipThrusters();
        }
        f.shipY += f.shipVy * dt;
        f.shipAngle = FACE_SOUTH;
        this.playerPadAngle = FACE_SOUTH;
        if (f.shipY > -6) {
          f.shipY = 0;
          f.shipVy = 0;
          s.phase = 'settle';
          s.t = 0;
        }
        break;
      }
      case 'settle': {
        const u = smoothstep(s.t / HANGAR.VISITOR_LIFT_TIME);
        f.shipHover = 1 - u;
        f.shipScale =
          HANGAR.VISITOR_HOVER_SCALE - u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst = s.t < 0.35 ? 0.95 : Math.max(0, 0.5 - (s.t - 0.35));
        if (burst > 0.02) this._firePlayerManeuverBurst(burst);
        else this._clearPlayerShipThrusters();
        f.shipAngle = FACE_SOUTH;
        this.playerPadAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_LIFT_TIME) {
          f.shipHover = 0;
          f.shipScale = 1;
          this._clearPlayerShipThrusters();
          s.phase = 'turn';
          s.t = 0;
        }
        break;
      }
      case 'turn': {
        this.setPadRim(pb, 'on');
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        const angle = FACE_SOUTH + (FACE_NORTH - FACE_SOUTH) * u;
        f.shipAngle = angle;
        this.playerPadAngle = angle;
        this._clearPlayerShipThrusters();
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          f.shipAngle = FACE_NORTH;
          this.playerPadAngle = FACE_NORTH;
          s.phase = 'doorsClose';
          s.t = 0;
          this.setBeacon(pb, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pb, Math.max(0, 1 - s.t / 1.3));
        if (s.t > 1.4) {
          this.setDoorOpen(pb, 0);
          this.clearOps(pb);
          this._playerDevSeq = null;
          this._resetPlayerFlight();
          this.playerPadOccupied = true;
          this.playerBay.visitorId = 'player';
          this.playerPadAngle = FACE_NORTH;
          this._spaceApproach[pb] = null;
          this._beginCaptainService(this.playerBay);
        }
        break;
      default:
        break;
    }
  }

  _elevSinkTurn(fromAngle, u) {
    return normalizeAngle(fromAngle + u * Math.PI);
  }

  _tickPlayerElevLeave(s, dt, pb) {
    switch (s.phase) {
      case 'warn':
        this._clearPlayerShipThrusters();
        if (s.t > 1.0) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this._clearPlayerShipThrusters();
        if (this.isBayDangerClear(pb) || s.t > 3.0) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        this.playerPadDrop = u;
        const ang = this._elevSinkTurn(FACE_NORTH, u);
        this.playerPadAngle = ang;
        this.playerFlight.shipAngle = ang;
        this._clearPlayerShipThrusters();
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          // Pad+ship fully black before emptying occupancy
          s.phase = 'below';
          s.t = 0;
          this.playerPadDrop = 1;
          this.playerPadOccupied = false;
          this.playerBay.visitorId = null;
          this.playerBay.service = null;
          this.playerBay.shipState = null;
          this.playerPadAngle = FACE_SOUTH;
          this._resetPlayerFlight();
        }
        break;
      }
      case 'below':
        this.playerPadDrop = 1;
        this.playerPadAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME) {
          s.phase = 'riseEmpty';
          s.t = 0;
        }
        break;
      case 'riseEmpty': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        this.playerPadDrop = 1 - u;
        this.playerPadAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          this.playerPadDrop = 0;
          this.clearOps(pb);
          this._playerDevSeq = null;
        }
        break;
      }
      default:
        break;
    }
  }

  _tickPlayerElevArrive(s, dt, pb) {
    switch (s.phase) {
      case 'warn':
        this._clearPlayerShipThrusters();
        if (s.t > 0.9) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this._clearPlayerShipThrusters();
        if (this.isBayDangerClear(pb) || s.t > 2.8) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        // Empty pad descends + 180° (south → north); rise keeps north
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        this.playerPadDrop = u;
        this.playerPadAngle = this._elevSinkTurn(FACE_SOUTH, u);
        this._clearPlayerShipThrusters();
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          this.playerPadDrop = 1;
          this.playerPadAngle = FACE_NORTH;
        }
        break;
      }
      case 'below':
        this.playerPadDrop = 1;
        this.playerPadAngle = FACE_NORTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME) {
          s.phase = 'rise';
          s.t = 0;
          this.playerPadOccupied = true;
          this.playerBay.visitorId = 'player';
          this.playerPadAngle = FACE_NORTH;
          this.playerFlight.shipAngle = FACE_NORTH;
        }
        break;
      case 'rise': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        this.playerPadDrop = 1 - u;
        this.playerPadOccupied = true;
        this.playerBay.visitorId = 'player';
        this.playerPadAngle = FACE_NORTH;
        this.playerFlight.shipAngle = FACE_NORTH;
        this._clearPlayerShipThrusters();
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          this.playerPadDrop = 0;
          this.clearOps(pb);
          this._playerDevSeq = null;
          this._resetPlayerFlight();
          this._beginCaptainService(this.playerBay);
        }
        break;
      }
      default:
        break;
    }
  }

  _purgeBayFreightAndCrew(bay) {
    for (const p of this.piles) {
      if (p.bay === bay) p.items = [];
    }
    this.floorDrops = this.floorDrops.filter((d) => {
      if (bayIndexFromX(d.x) === bay) return false;
      if (d.cargo?.serviceBay === bay) return false;
      return true;
    });

    for (const npc of this.npcs) {
      if (!npc.alive) continue;

      if (npc.kind === 'mechanic' && (npc.homeBay ?? npc.bay) === bay) {
        npc.mechPhase = null;
        npc.targetSlot = null;
        npc._mechLift = null;
        npc.mechHandT = 0;
        npc.cargo = null;
        npc.hullTarget = null;
        npc.targetPile = null;
        npc.lingerPile = null;
        npc.stripCategory = null;
        npc.stripHardpointKey = null;
        npc.workHardpointKey = null;
        npc.tripsLeft = 0;
        this._clearBoardProgress(npc);
        this._clearTaskClaim(npc);
        this._parkMechanicIdle(npc);
        continue;
      }

      if (npc.kind === 'forklift') {
        const touches =
          npc.cargo?.serviceBay === bay ||
          npc._fetchBay === bay ||
          npc._claimBay === bay ||
          npc.targetPile?.bay === bay ||
          npc.lingerPile?.bay === bay;
        if (!touches) continue;
        npc.cargo = null;
        npc._fetchInbound = false;
        npc._fetchBay = null;
        npc._fetchItemId = null;
        npc.targetPile = null;
        npc.lingerPile = null;
        npc.targetSlot = null;
        npc.forkPhase = null;
        npc._forkWorkT = 0;
        npc._mechLift = null;
        this._clearTaskClaim(npc);
        this._parkForkliftAtHub(npc);
      }
    }

    if (this.crane) {
      const c = this.crane;
      const carriedHere = c.carried?.serviceBay === bay;
      const touches =
        carriedHere ||
        c.pickup?.bay === bay ||
        c.dropoff?.bay === bay ||
        (c.pickup?.isFloorDrop && bayIndexFromX(c.pickup.x) === bay);
      if (carriedHere) c.carried = null;
      if (touches) {
        c.pickup = null;
        c.dropoff = null;
        c.pause = 0;
        this._applyCraneJob(c, this._pickCraneJob());
      }
    }
  }

  _playerPadMk() {
    const group = shipDefSwapGroup(this._playerShip?.shipDef);
    return Math.min(2, padMkForSwapGroup(group));
  }

  _shipDefForBay(bay) {
    if (this.isPlayerBay(bay)) {
      const def = this._playerShip?.shipDef;
      if (def) return def;
      if (this._playerShip && !this._playerShip.shipDef) {
        this._playerShip.shipDef = createPlayerStarter();
      }
      return this._playerShip?.shipDef || null;
    }
    const pad = this._servicePad(bay);
    return pad?.shipDef || null;
  }

  _ensurePadShipDef(pad) {
    if (!pad) return null;
    if (this.isPlayerBay(pad.bayIndex)) {
      return this._shipDefForBay(this.playerBayIndex);
    }
    // Locked for the visit lifetime — never re-roll cosmetics while docked.
    if (pad.shipDef) return pad.shipDef;
    if (!pad.visitorId || pad.visitorId === 'player') return null;
    pad.shipDef = createVisitorShipDef(pad.visitorId);
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(pad.shipDef);
    return pad.shipDef;
  }

  _installCatalogPart(bay, cargo) {
    const def = this._shipDefForBay(bay);
    if (!def || !cargo) return true; // nothing to bind
    let itemId = cargo.catalogItemId;
    const cat =
      cargo.catalogCategory ||
      categoryFromFreightLabel(cargo.label) ||
      getItem(itemId)?.category;
    if (!cat) return true;
    if (
      isTurretMountCategory(cat, cargo.shape) &&
      !canPerformTurretCraneStage(this.hangarConfig)
    ) {
      return true; // block swap — leave freight staged
    }

    const mounts = def.resolveMounts();
    const targetKey = cargo.targetHardpointKey;
    if (targetKey) {
      const m = mounts[targetKey];
      if (!m) return true; // no such socket — drop the request cleanly
      if (m.item) return false; // exact hardpoint occupied
      if (!itemId) {
        itemId = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
          mk: m.socket.mk || 2,
          playerEquipable: true,
        });
      }
      if (!itemId) return true;
      const result = equipHardpoint(def, targetKey, itemId);
      if (!result.ok && result.reason === 'mk_too_high') {
        const fallback = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
          mk: m.socket.mk || 2,
          playerEquipable: true,
        });
        if (fallback) return equipHardpoint(def, targetKey, fallback).ok;
      }
      return result.ok;
    }

    const empties = emptySocketsForCategory(def, cat);
    if (!empties.length) {
      const hasSocket = Object.values(mounts).some(
        (m) => m.socket.category === cat
      );
      return !hasSocket;
    }
    const slot = empties[0];
    const maxMk = slot.socket.mk || 2;
    if (!itemId) {
      itemId = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
        mk: maxMk,
        playerEquipable: true,
      });
    }
    let item = getItem(itemId);
    if (item && item.mk > maxMk) {
      itemId = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
        mk: maxMk,
        playerEquipable: true,
      });
      item = getItem(itemId);
    }
    if (!itemId) return true;
    const result = equipHardpoint(def, slot.key, itemId);
    if (!result.ok && result.reason === 'mk_too_high') {
      const fallback = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
        mk: maxMk,
        playerEquipable: true,
      });
      if (fallback) return equipHardpoint(def, slot.key, fallback).ok;
    }
    return result.ok;
  }

  _stripHardpointForBay(bay, preferKey = null) {
    if (preferKey) return preferKey;
    const def = this._shipDefForBay(bay);
    if (!def) return null;
    const upIn = this._bayPile(bay, 'in', ROW.N);
    for (const c of upIn?.items || []) {
      if (c.family !== 'upgrade' || !c.targetHardpointKey) continue;
      if (needsStripBeforeInstallKey(def, c.targetHardpointKey)) {
        return c.targetHardpointKey;
      }
    }
    return null;
  }

  _stripCategoryForBay(bay, preferCategory = null) {
    if (preferCategory) return preferCategory;
    const def = this._shipDefForBay(bay);
    if (!def) return null;
    const upIn = this._bayPile(bay, 'in', ROW.N);
    for (const c of upIn?.items || []) {
      if (c.family !== 'upgrade') continue;
      if (c.targetHardpointKey) continue; // handled by exact-key path
      const cat =
        c.catalogCategory ||
        categoryFromFreightLabel(c.label) ||
        getItem(c.catalogItemId)?.category;
      if (cat && needsStripBeforeInstall(def, cat)) return cat;
    }
    return null;
  }

  _stripCatalogPart(bay, preferCategory = null, preferKey = null) {
    const def = this._shipDefForBay(bay);
    if (!def) return makeCargo(pick(UPGRADE_KINDS));
    const keyHint = this._stripHardpointForBay(bay, preferKey);
    const cat = keyHint ? null : this._stripCategoryForBay(bay, preferCategory);
    const key = pickStripKey(def, cat, keyHint);
    if (!key) return null;
    const mounts = def.resolveMounts?.() || {};
    const socketCat = mounts[key]?.socket?.category || mounts[key]?.item?.category;
    const itemPeek = getItem(mounts[key]?.item?.id || mounts[key]?.item);
    if (
      isTurretMountCategory(socketCat || itemPeek?.category, itemPeek?.shape) &&
      !canPerformTurretCraneStage(this.hangarConfig)
    ) {
      return null;
    }
    const itemId = unequipHardpoint(def, key);
    if (!itemId) return null;
    const cargo = makeCatalogUpgradeCargo(itemId);
    cargo.strippedFromKey = key;
    return cargo;
  }

  exteriorHullRestore(ship = this._playerShip) {
    if (!ship) return null;
    ensureVesselSimState(ship);
    return applyHullHeal(ship, 1, 'exterior');
  }

  _createBoardReveal(items) {
    const work = (items || []).filter((it) => it.type !== 'elevatorTransfer');
    const typeById = new Map(work.map((it) => [it.id, it.type]));
    const revealOrder = shuffleInPlace(work.map((it) => it.id));
    return {
      stage: 'preScan',
      t: 0,
      scanT: 0,
      statsShown: 0,
      cargoProgress: 0,
      cargoOn: false,
      shownIds: new Set(),
      revealOrder,
      pipIndex: 0,
      pipDelays: pipRevealDelays(revealOrder, typeById),
      pipWait: 0,
      gapT: 0,
      gapMax: Math.random() * HANGAR.BOARD_REVEAL_PIP_GAP_MAX,
    };
  }

  _boardScanLive(reveal) {
    if (!reveal) return false;
    return (
      reveal.stage === 'preScan' ||
      reveal.stage === 'stats' ||
      reveal.stage === 'cargo' ||
      reveal.stage === 'postScan'
    );
  }

  _padBoardScanActive(pad) {
    const svc = pad?.service;
    if (!svc) return false;
    if (svc.phase === 'finalScan') return true;
    if (svc.phase === 'boardReveal') return this._boardScanLive(svc.reveal);
    return false;
  }

  _boardScanIntensity(reveal) {
    if (!this._boardScanLive(reveal)) return 0;
    if (reveal.stage === 'preScan') {
      return Math.min(1, (reveal.t || 0) / 0.14);
    }
    if (reveal.stage === 'stats' || reveal.stage === 'cargo') return 1;
    const rem = HANGAR.BOARD_REVEAL_SCAN_TAIL_SEC - (reveal.t || 0);
    return Math.max(0, Math.min(1, rem / 0.22));
  }

  _finalScanIntensity(svc) {
    const dur = HANGAR.BOARD_FINAL_SCAN_SEC;
    const t = svc?.finalScanT || 0;
    if (t < 0.1) return t / 0.1;
    if (t > dur - 0.12) return Math.max(0, (dur - t) / 0.12);
    return 1;
  }

  _padBoardScanClock(pad) {
    const svc = pad?.service;
    if (!svc) return 0;
    // Same laser sweep rate as the intro pass; finalScan just ends sooner (~1s)
    if (svc.phase === 'finalScan') return svc.finalScanT || 0;
    return svc.reveal?.scanT || 0;
  }

  _padBoardScanAmp(pad) {
    const svc = pad?.service;
    if (!svc) return 0;
    if (svc.phase === 'finalScan') return this._finalScanIntensity(svc);
    if (svc.phase === 'boardReveal') return this._boardScanIntensity(svc.reveal);
    return 0;
  }

  _tickBoardReveal(svc, dt) {
    const r = svc.reveal;
    if (!r || r.stage === 'done') return;

    if (this._boardScanLive(r)) r.scanT = (r.scanT || 0) + dt;

    if (r.stage === 'preScan') {
      r.t += dt;
      if (r.t >= HANGAR.BOARD_REVEAL_PRESCAN_SEC) {
        r.stage = 'stats';
        r.t = 0;
      }
      return;
    }

    if (r.stage === 'stats') {
      r.t += dt;
      const step = HANGAR.BOARD_REVEAL_STATS_SEC / 4;
      r.statsShown = Math.min(4, Math.floor(r.t / step));
      if (r.t >= HANGAR.BOARD_REVEAL_STATS_SEC) {
        r.statsShown = 4;
        r.stage = 'cargo';
        r.t = 0;
        r.cargoProgress = 0;
      }
      return;
    }

    if (r.stage === 'cargo') {
      r.t += dt;
      r.cargoProgress = Math.min(1, r.t / HANGAR.BOARD_REVEAL_CARGO_SEC);
      r.cargoOn = true;
      if (r.t >= HANGAR.BOARD_REVEAL_CARGO_SEC) {
        r.cargoProgress = 1;
        r.stage = 'postScan';
        r.t = 0;
      }
      return;
    }

    if (r.stage === 'postScan') {
      r.t += dt;
      if (r.t >= HANGAR.BOARD_REVEAL_SCAN_TAIL_SEC) {
        if (!r.revealOrder.length) {
          r.stage = 'done';
        } else {
          r.stage = 'pipGap';
          r.gapT = 0;
        }
      }
      return;
    }

    if (r.stage === 'pipGap') {
      r.gapT += dt;
      if (r.gapT >= r.gapMax) {
        r.stage = 'pips';
        r.pipIndex = 0;
        r.pipWait = 0;
        // First pip appears after its delay (hesitation before first pick)
      }
      return;
    }

    if (r.stage === 'pips') {
      if (r.pipIndex >= r.revealOrder.length) {
        r.stage = 'done';
        return;
      }
      r.pipWait += dt;
      const need = r.pipDelays[r.pipIndex] ?? 0.4;
      if (r.pipWait >= need) {
        r.shownIds.add(r.revealOrder[r.pipIndex]);
        r.pipIndex += 1;
        r.pipWait = 0;
        if (r.pipIndex >= r.revealOrder.length) r.stage = 'done';
      }
    }
  }

  _sidePadService(bay) {
    return this._servicePad(bay)?.service || null;
  }

  _serviceNeedsStaging(pad) {
    if (!pad?.service || pad.service.phase !== 'active') return [];
    const unloadPending = pad.service.items.some(
      (it) => it.type === 'unloadCargo' && it.status !== 'done'
    );
    return pad.service.items.filter((it) => {
      if (it.status === 'done') return false;
      if (!SERVICE_STAGING_TYPES.includes(it.type)) return false;
      // Cargo loads wait until unloads finish (hold space + deck order)
      if (unloadPending && it.type === 'loadCargo') return false;
      return it.status === 'pending' || it.status === 'staging' || it.status === 'ready';
    });
  }

  _serviceNeedsBringIn(pad) {
    return this._serviceNeedsStaging(pad).filter((it) => it.status === 'pending');
  }

  _cargoMatchesServiceItem(cargo, item, _bay = null) {
    if (!cargo || !item) return false;
    return cargo.serviceKey != null && cargo.serviceKey === item.id;
  }

  _findServiceCargoInWorld(item, bay) {
    const match = (c) => this._cargoMatchesServiceItem(c, item, bay);
    for (const p of this.piles) {
      if (bay != null && p.bay !== bay) continue;
      if (p.items.some(match)) return true;
    }
    if (this.floorDrops?.some((d) => match(d.cargo))) return true;
    for (const n of this.npcs) {
      if (!n.alive) continue;
      if (match(n.cargo) || match(n._forkLift?.cargo) || match(n._mechLift?.cargo)) {
        return true;
      }
    }
    if (match(this.crane?.carried)) return true;
    return false;
  }

  _serviceItemNeedsSpawn(pad, item) {
    if (!pad || !item || item.status === 'done') return false;
    if (!SERVICE_STAGING_TYPES.includes(item.type)) return false;
    if (item.status !== 'pending' && item.status !== 'staging') return false;
    return !this._findServiceCargoInWorld(item, pad.bayIndex);
  }

  _reopenServiceItemIfOrphan(pad, itemId) {
    if (!pad?.service || itemId == null) return;
    const it = pad.service.items?.find((i) => i.id === itemId);
    if (!it || it.status === 'done' || it.status === 'pending') return;
    if (this._findServiceCargoInWorld(it, pad.bayIndex)) return;
    it.status = 'pending';
    it.cargoId = null;
  }

  _makeServiceInboundCargo(pad, preferItemId = null) {
    if (!pad?.service) return null;
    let it = null;
    if (preferItemId != null) {
      it = pad.service.items.find(
        (n) => n.id === preferItemId && this._serviceItemNeedsSpawn(pad, n)
      );
      // Preferred unit unavailable — do not steal another truck's checklist row
      if (!it) return null;
    } else {
      const needs = this._serviceNeedsBringIn(pad).filter((n) =>
        this._serviceItemNeedsSpawn(pad, n)
      );
      if (!needs.length) return null;
      it = pick(needs);
    }
    it.status = 'staging';
    let cargo;
    if (it.type === 'upgrade') {
      let itemId = it.catalogItemId;
      if (!itemId) {
        const cat =
          it.catalogCategory ||
          categoryFromFreightLabel(it.kindLabel) ||
          'smallTurret';
        const def = this._shipDefForBay(pad.bayIndex);
        itemId = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
          playerEquipable: true,
        });
      }
      cargo = itemId
        ? makeCatalogUpgradeCargo(itemId)
        : makeCargo(
            UPGRADE_KINDS.find((k) => k.label === it.kindLabel) || pick(UPGRADE_KINDS)
          );
      if (it.catalogCategory) cargo.catalogCategory = it.catalogCategory;
      if (it.targetHardpointKey) cargo.targetHardpointKey = it.targetHardpointKey;
      if (it.boardLabel) cargo.boardLabel = it.boardLabel;
      // Always bind the exact catalog id from the Install request
      if (it.catalogItemId) cargo.catalogItemId = it.catalogItemId;
    } else if (it.type === 'loadCargo' || it.kindLabel === 'CRATE') {
      cargo = makeCargo(pick(CRATE_VARIANTS));
    } else {
      const kind =
        HOLD_CARGO.find((k) => k.label === it.kindLabel) || pick(CRATE_VARIANTS);
      cargo = makeCargo(kind);
    }
    cargo.serviceKey = it.id;
    cargo.serviceBay = pad.bayIndex;
    it.cargoId = cargo.id;
    return cargo;
  }

  _takeServicePileCargo(pile, bay, job, npc = null) {
    if (!pile?.items?.length) return null;
    if (job === 'stageFerry') {
      const preferCargoId = npc?._claimCargoId ?? null;
      if (preferCargoId != null) {
        const idx = pile.items.findIndex((c) => c.id === preferCargoId);
        if (idx >= 0) return this._pileTakeAt(pile, idx);
      }
      const taken = this._claimedServiceKeys(npc);
      const idx = pile.items.findIndex((c) => {
        const tag = c.serviceKey != null ? c.serviceKey : `cargo:${c.id}`;
        return !taken.has(tag) && !taken.has(`cargo:${c.id}`);
      });
      if (idx >= 0) return this._pileTakeAt(pile, idx);
      return this._pilePop(pile);
    }
    const preferCargoId = npc?._claimCargoId ?? null;
    const preferKey = npc?._claimServiceItemId ?? npc?._activeServiceId ?? null;
    if (preferCargoId != null) {
      const idx = pile.items.findIndex((c) => c.id === preferCargoId);
      if (idx >= 0) return this._pileTakeAt(pile, idx);
    }
    if (preferKey != null && !String(preferKey).startsWith('cargo:')) {
      const idx = pile.items.findIndex((c) => c.serviceKey === preferKey);
      if (idx >= 0) return this._pileTakeAt(pile, idx);
    }
    const taken = this._claimedServiceKeys(npc);
    const svc = this._servicePad(bay)?.service;
    if (!svc || svc.phase !== 'active') {
      const idx = pile.items.findIndex((c) => {
        const tag = c.serviceKey != null ? c.serviceKey : `cargo:${c.id}`;
        return !taken.has(tag);
      });
      if (idx >= 0) return this._pileTakeAt(pile, idx);
      return null;
    }
    const wantTypes =
      job === 'installUpgrade'
        ? ['upgrade']
        : ['refuel', 'reloadBullets', 'reloadShells', 'loadCargo'];
    const pending = svc.items.filter(
      (it) =>
        wantTypes.includes(it.type) &&
        it.status !== 'done' &&
        !taken.has(it.id)
    );
    if (!pending.length) return null;
    const idx = pile.items.findIndex(
      (c) =>
        c.serviceKey != null && pending.some((it) => it.id === c.serviceKey)
    );
    if (idx < 0) return null;
    return this._pileTakeAt(pile, idx);
  }

  _completeLoadService(bay, cargo, job) {
    if (cargo?.serviceKey) {
      this._completeServiceKey(cargo.serviceKey, cargo);
      return;
    }
    if (job === 'installUpgrade') {
      this._completeServiceType(bay, 'upgrade', cargo);
      return;
    }
    if (cargo?.label === 'FUEL') this._completeServiceType(bay, 'refuel', cargo);
    else if (cargo?.label === 'BULLETS') {
      this._completeServiceType(bay, 'reloadBullets', cargo);
    } else if (cargo?.label === 'SHELLS') {
      this._completeServiceType(bay, 'reloadShells', cargo);
    } else if (cargo?.label === 'AMMO') {
      // Legacy label from older saves / warmups
      const pad = this._servicePad(bay);
      const item = pad?.service?.items?.find(
        (it) =>
          (it.type === 'reloadBullets' || it.type === 'reloadShells') &&
          it.status !== 'done'
      );
      if (item) this._completeServiceItem(pad, item, cargo);
    } else this._completeServiceType(bay, 'loadCargo', cargo);
  }

  _completeServiceItem(pad, item, cargo = null) {
    if (!item || item.status === 'done') return;
    item.status = 'done';
    item.cargoId = null;
    // Stay blue on the board until the mech walks away (`_settleActiveServicePip`)
    item.pipSettled = false;
    this._applyServiceToShipState(pad, item.type, cargo);
  }

  _applyServiceToShipState(pad, type, cargo = null) {
    const st = pad?.shipState;
    const svc = pad?.service;
    if (!st) return;

    const stepMeter = (key) => {
      const items = (svc?.items || []).filter((it) => it.type === type);
      const total = items.length || 1;
      const done = items.filter((it) => it.status === 'done').length;
      const start = st._svcStart?.[key] ?? st[key] ?? 0;
      if (done >= total) st[key] = 1;
      else st[key] = Math.min(1, start + ((1 - start) * done) / total);
    };

    if (type === 'refuel') {
      stepMeter('fuel');
    } else if (type === 'repair') {
      // Hull meter is driven by weld-spot sync (not a one-shot step snap)
      this._syncRepairHullMeter(pad);
    } else if (type === 'reloadBullets') {
      stepMeter('bullets');
      st.ammo = Math.min(st.bullets ?? 1, st.shells ?? 1);
    } else if (type === 'reloadShells') {
      stepMeter('shells');
      st.ammo = Math.min(st.bullets ?? 1, st.shells ?? 1);
    } else if (type === 'loadCargo' && st.cargoMk > 0) {
      if (!st.cargoHold) st.cargoHold = packCargoHold(st.cargoMk, st.cargoSpace ?? 1);
      // Board square inherits the 2.5D crate that just loaded
      addCargoHoldBlock(st.cargoHold, cargo);
      syncCargoSpace(st);
    } else if (type === 'unloadCargo' && st.cargoMk > 0) {
      if (!st.cargoHold) st.cargoHold = packCargoHold(st.cargoMk, st.cargoSpace ?? 0.5);
      removeCargoHoldBlock(st.cargoHold);
      syncCargoSpace(st);
    }
  }

  _beginBoardProgress(npc, type) {
    if (type === 'repair') {
      this._beginWeldBoardProgress(npc);
      return;
    }
    const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
    const pad = this._servicePad(bay);
    const st = pad?.shipState;
    if (!st || !type) {
      npc._boardProg = null;
      return;
    }
    let from = 0;
    let to = 1;
    const nextStepTo = (key, itemType) => {
      const items = (pad.service?.items || []).filter((it) => it.type === itemType);
      const total = items.length || 1;
      const done = items.filter((it) => it.status === 'done').length;
      const start = st._svcStart?.[key] ?? st[key] ?? 0;
      const cur = st[key] ?? start;
      const nextDone = Math.min(total, done + 1);
      from = cur;
      to = nextDone >= total ? 1 : start + ((1 - start) * nextDone) / total;
    };

    if (type === 'refuel') nextStepTo('fuel', 'refuel');
    else if (type === 'reloadBullets') nextStepTo('bullets', 'reloadBullets');
    else if (type === 'reloadShells') nextStepTo('shells', 'reloadShells');
    else if (type === 'loadCargo') {
      from = st.cargoSpace ?? 1;
      to = Math.max(0, from - 1 / Math.max(1, st.cargoHold?.slots || 6));
    } else if (type === 'unloadCargo') {
      from = st.cargoSpace ?? 0;
      to = Math.min(1, from + 1 / Math.max(1, st.cargoHold?.slots || 6));
    } else {
      npc._boardProg = null;
      return;
    }
    npc._boardProg = {
      type,
      from,
      to,
      dur: Math.max(0.25, npc.stateT || 1),
      bay,
    };
  }

  _syncRepairHullMeter(pad) {
    const st = pad?.shipState;
    if (!st) return;
    const items = (pad.service?.items || []).filter((it) => it.type === 'repair');
    const start = st._svcStart?.hull ?? st.hull ?? 0;
    const healOf = (it) =>
      it?.healAmt != null
        ? it.healAmt
        : HULL_PIP_HEAL_AVG;

    let healed = 0;
    for (const it of items) {
      if (it.status === 'done') healed += healOf(it);
    }

    for (const n of this.npcs) {
      if (!n.alive || n.job !== 'weld') continue;
      const nBay = n.bay ?? n.homeBay;
      if (nBay !== pad.bayIndex) continue;
      const sid = n._activeServiceId ?? n._claimServiceItemId;
      if (sid == null || String(sid).startsWith('cargo:')) continue;
      const it = items.find((i) => i.id === sid);
      if (!it || it.status === 'done') continue;

      const spots = Math.max(1, n.weldSpotsTotal || 1);
      const i = Math.max(0, Math.min(spots, n.weldSpotIndex || 0));
      const prog = n._boardProg;
      let frac;
      if (prog?.type === 'repair' && prog.weld && n.state === 'workWeld') {
        const u = Math.min(1, Math.max(0, 1 - (n.stateT || 0) / (prog.dur || 1)));
        frac = (i + u) / spots;
      } else {
        // Between spots (or approaching): freeze at finished spot count
        frac = i / spots;
      }
      healed += healOf(it) * frac;
    }

    st.hull = Math.min(1, start + healed);
    // Exterior hangar repair clears scar ceiling when fully restored
    if (st.hull >= 0.999 && this.isPlayerBay(pad.bayIndex) && this._playerShip) {
      applyHullHeal(this._playerShip, 1, 'exterior');
    }
  }

  _tickBoardProgress(npc) {
    const prog = npc._boardProg;
    if (!prog) return;
    const pad = this._servicePad(prog.bay);
    const st = pad?.shipState;
    if (!st) return;
    if (prog.type === 'repair') {
      this._syncRepairHullMeter(pad);
      return;
    }
    const u = Math.min(1, Math.max(0, 1 - npc.stateT / prog.dur));
    const v = prog.from + (prog.to - prog.from) * u;
    if (prog.type === 'refuel') st.fuel = v;
    else if (prog.type === 'reloadBullets') {
      st.bullets = v;
      st.ammo = Math.min(st.bullets, st.shells ?? 1);
    } else if (prog.type === 'reloadShells') {
      st.shells = v;
      st.ammo = Math.min(st.bullets ?? 1, st.shells);
    } else if (prog.type === 'loadCargo' || prog.type === 'unloadCargo') {
      st.cargoSpace = v;
    }
  }

  _clearBoardProgress(npc) {
    npc._boardProg = null;
  }

  _boardProgressTypeForJob(npc) {
    if (npc.job === 'weld') return 'repair';
    if (npc.job === 'loadShip' && npc.cargo) {
      if (npc.cargo.label === 'FUEL') return 'refuel';
      if (npc.cargo.label === 'BULLETS' || npc.cargo.label === 'SHELLS' || npc.cargo.label === 'AMMO') {
        for (const pad of this._allServicePads()) {
          const item = pad.service?.items?.find((it) => it.id === npc.cargo.serviceKey);
          if (item?.type === 'reloadShells') return 'reloadShells';
          if (item?.type === 'reloadBullets') return 'reloadBullets';
        }
        if (npc.cargo.label === 'SHELLS') return 'reloadShells';
        return 'reloadBullets';
      }
      if (npc.cargo.family !== 'upgrade') return 'loadCargo';
    }
    if (npc.job === 'unloadShip') return 'unloadCargo';
    return null;
  }

  _completeServiceKey(serviceKey, cargo = null) {
    if (!serviceKey) return;
    for (const pad of this._allServicePads()) {
      const item = pad.service?.items?.find((it) => it.id === serviceKey);
      if (item) {
        this._completeServiceItem(pad, item, cargo);
        return;
      }
    }
  }

  _completeServiceType(bay, type, cargo = null) {
    const pad = this._servicePad(bay);
    const item = pad?.service?.items?.find(
      (it) => it.type === type && it.status !== 'done'
    );
    if (item) this._completeServiceItem(pad, item, cargo);
  }

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

  _servicePipsSettled(pad) {
    const items = (pad.service?.items || []).filter(
      (it) => it.type !== 'elevatorTransfer'
    );
    if (!items.length) return true;
    return items.every((it) => it.status === 'done' && it.pipSettled);
  }

  _forceSettleServicePips(pad) {
    for (const it of pad.service?.items || []) {
      if (it.status === 'done') it.pipSettled = true;
    }
  }

  _syncServiceStaging(pad) {
    if (!pad.service || pad.service.phase !== 'active') return;
    for (const it of pad.service.items) {
      if (it.status === 'done' || it.type === 'repair' || it.type === 'unloadCargo') continue;
      if (!SERVICE_STAGING_TYPES.includes(it.type)) continue;
      const row = it.type === 'upgrade' ? ROW.N : ROW.M;
      const south = this._bayPile(pad.bayIndex, 'in', ROW.S);
      const dest = this._bayPile(pad.bayIndex, 'in', row);
      const match = (c) => this._cargoMatchesServiceItem(c, it, pad.bayIndex);
      const inWorld = this._findServiceCargoInWorld(it, pad.bayIndex);
      const fetchClaimed = this._forkFetchClaimedForItem(it.id);
      // Lost anywhere (including exported / wrong bay then hauled off) → re-order.
      // Keep staging while a forklift is still en route to spawn that crate.
      if (
        (it.status === 'staging' || it.status === 'ready' || it.status === 'active') &&
        !inWorld &&
        !fetchClaimed
      ) {
        it.status = 'pending';
        it.cargoId = null;
        continue;
      }
      if (dest?.items?.some(match)) {
        it.status = 'ready';
      } else if (south?.items?.some(match) || inWorld || fetchClaimed) {
        if (it.status === 'pending') it.status = 'staging';
      }
    }
  }

  _seedCargo() {
    // Checklist-driven inbound for all bays — don't pre-stock piles
  }

  _pileById(id) {
    return this.piles.find((p) => p.id === id) || null;
  }

  _pileReservedSlots(pile, exceptNpc = null, { ignoreCraneDrop = false } = {}) {
    const used = new Set();
    if (!pile) return used;
    for (const it of pile.items) {
      if (it.pileSlot != null && it.pileSlot >= 0) used.add(it.pileSlot);
    }
    for (const n of this.npcs) {
      if (!n.alive || n === exceptNpc) continue;
      const onPile =
        n.targetPile?.id === pile.id || n.lingerPile?.id === pile.id;
      if (!onPile) continue;
      if (n.targetSlot != null && n.targetSlot >= 0) used.add(n.targetSlot);
      // In-flight deposits: forklift bring-in + mechanic unload/remove
      if (
        n.cargo?.pileSlot != null &&
        n.cargo.pileSlot >= 0 &&
        (n.job === 'bringIn' ||
          n.job === 'unloadShip' ||
          n.job === 'removeUpgrade')
      ) {
        used.add(n.cargo.pileSlot);
      }
    }
    if (!ignoreCraneDrop) {
      const c = this.crane;
      if (c?.dropoff?.id === pile.id && c._dropSlot != null && c._dropSlot >= 0) {
        used.add(c._dropSlot);
      }
    }
    return used;
  }

  _pileFreeSlot(pile, exceptNpc = null, opts = {}) {
    if (!pile) return -1;
    const used = this._pileReservedSlots(pile, exceptNpc, opts);
    for (let s = 0; s < PILE_SLOTS.length; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  _pilePush(pile, cargo, exceptNpc = null) {
    if (!pile || !cargo) return false;
    if (pile.items.length >= PILE_CAP) return false;
    let slot = cargo.pileSlot;
    // Crane placing into its locked drop slot must not treat that reservation as occupied
    const cranePlacing =
      this.crane?.carried === cargo &&
      this.crane.dropoff?.id === pile.id &&
      this.crane._dropSlot != null &&
      cargo.pileSlot === this.crane._dropSlot;
    const used = this._pileReservedSlots(pile, exceptNpc, {
      ignoreCraneDrop: cranePlacing,
    });
    if (slot == null || slot < 0 || slot >= PILE_SLOTS.length || used.has(slot)) {
      slot = this._pileFreeSlot(pile, exceptNpc, {
        ignoreCraneDrop: cranePlacing,
      });
    }
    if (slot < 0) return false;
    cargo.pileSlot = slot;
    // Keep the orientation it arrived with (carrier 8-dir), else leave restHeading
    if (exceptNpc && (exceptNpc.kind === 'forklift' || exceptNpc.kind === 'mechanic')) {
      cargo.restHeading = this._crewVisOctant(exceptNpc) * CREW_VIS_OCT;
    }
    pile.items.push(cargo);
    return true;
  }

  _pilePop(pile) {
    if (!pile?.items?.length) return null;
    const cargo = pile.items.pop();
    if (cargo) cargo.pileSlot = null;
    return cargo;
  }

  _pileRemove(pile, cargo) {
    if (!pile || !cargo) return null;
    const idx = pile.items.indexOf(cargo);
    if (idx < 0) return null;
    pile.items.splice(idx, 1);
    cargo.pileSlot = null;
    return cargo;
  }

  _pileTakeAt(pile, idx) {
    if (!pile || idx < 0 || idx >= pile.items.length) return null;
    const cargo = pile.items.splice(idx, 1)[0];
    if (cargo) cargo.pileSlot = null;
    return cargo;
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

  _enumerateFetchInCandidates(exceptNpc = null) {
    const claimed = this._claimedTaskKeys(exceptNpc);
    const out = [];
    for (const pad of this._allServicePads()) {
      if (!pad.visitorId) continue;
      const needs = this._serviceNeedsBringIn(pad);
      if (!needs.length) continue;
      const bay = pad.bayIndex;
      if (!this._bayAcceptsCargo(bay)) continue;
      const south = this._bayPile(bay, 'in', ROW.S);
      if (!south || south.items.length >= PILE_CAP) continue;

      let reserved = 0;
      for (const n of this.npcs) {
        if (!n.alive || n === exceptNpc) continue;
        if (n._fetchInbound && n._fetchBay === bay) reserved++;
        else if (
          n.cargo?.serviceBay === bay &&
          (n.job === 'bringIn' || n.state === 'enter' || n.state === 'toPile' || n.state === 'linger')
        ) {
          reserved++;
        }
      }
      let room = PILE_CAP - south.items.length - reserved;
      if (room <= 0) continue;

      for (const it of needs) {
        const key = this._taskClaimKey('fetchIn', null, bay, it.id);
        if (claimed.has(key)) continue;
        if (room <= 0) break;
        out.push({
          bay,
          serviceItemId: it.id,
          targetPile: south,
          pendingCount: needs.length,
        });
        room--;
      }
    }
    return out;
  }

  _fetchableServiceBays(exceptNpc = null) {
    return [
      ...new Set(this._enumerateFetchInCandidates(exceptNpc).map((c) => c.bay)),
    ];
  }

  _canFetchInboundNow(exceptNpc = null) {
    return this._enumerateFetchInCandidates(exceptNpc).length > 0;
  }

  _taskClaimKey(job, pile, bay = null, extra = null) {
    if (extra != null && extra !== '') {
      if (job === 'bringIn' || job === 'takeOut') {
        return pile?.id ? `${job}:${pile.id}:${extra}` : `${job}:${extra}`;
      }
      return `${job}:${extra}`;
    }
    // Fallback only if a caller forgot the item/quadrant (should be rare)
    if (pile?.id) return `${job}:${pile.id}:*`;
    if (bay != null) return `${job}:b${bay}:*`;
    return `${job}:*`;
  }

  _claimedTaskKeys(exceptNpc = null) {
    const keys = new Set();
    for (const n of this.npcs) {
      if (!n.alive || n === exceptNpc) continue;
      if (n.claimKey) keys.add(n.claimKey);
    }
    return keys;
  }

  _applyTaskClaim(npc, job, pile, bay = null, extra = null) {
    const ex =
      extra != null
        ? extra
        : job === 'fetchIn'
          ? npc._fetchItemId
          : job === 'loadShip' ||
              job === 'unloadShip' ||
              job === 'installUpgrade' ||
              job === 'weld'
            ? npc._claimServiceItemId ?? npc._activeServiceId
            : job === 'removeUpgrade'
              ? npc.stripHardpointKey ||
                npc.stripCategory ||
                npc._claimServiceItemId ||
                npc._activeServiceId
              : job === 'bringIn'
                ? npc.cargo?.serviceKey || npc.cargo?.id || npc.uid
                : job === 'takeOut'
                  ? npc.targetSlot
                  : job === 'stageFerry'
                    ? npc._claimCargoId != null
                      ? `cargo:${npc._claimCargoId}`
                      : npc._claimServiceItemId
                    : null;
    npc.claimKey = this._taskClaimKey(job, pile, bay, ex);
    if (
      job === 'loadShip' ||
      job === 'unloadShip' ||
      job === 'installUpgrade' ||
      job === 'weld' ||
      job === 'removeUpgrade' ||
      job === 'fetchIn' ||
      job === 'stageFerry'
    ) {
      npc._claimServiceItemId = ex ?? null;
    } else if (job === 'bringIn' || job === 'takeOut') {
      npc._claimServiceItemId = null;
    } else {
      npc._claimServiceItemId = null;
    }
  }

  _clearTaskClaim(npc) {
    npc.claimKey = null;
    npc._activeServiceId = null;
    npc._claimServiceItemId = null;
    npc._claimCargoId = null;
    npc.weldSpotsTotal = null;
    npc.weldSpotIndex = null;
    npc.directFromSouth = false;
    npc._lockFacing = false;
  }

  _claimedServiceKeys(exceptNpc = null) {
    const keys = new Set();
    for (const n of this.npcs) {
      if (!n.alive || n === exceptNpc) continue;
      if (n._claimServiceItemId != null) keys.add(n._claimServiceItemId);
      if (n._activeServiceId != null) keys.add(n._activeServiceId);
      if (n.cargo?.serviceKey != null) keys.add(n.cargo.serviceKey);
      if (n._mechLift?.cargo?.serviceKey != null) {
        keys.add(n._mechLift.cargo.serviceKey);
      }
      if (n._claimCargoId != null) keys.add(`cargo:${n._claimCargoId}`);
      if (n.cargo?.id != null && n.cargo.serviceKey == null) {
        keys.add(`cargo:${n.cargo.id}`);
      }
    }
    return keys;
  }

  _filterUnclaimed(tasks, exceptNpc = null) {
    const claimed = this._claimedTaskKeys(exceptNpc);
    return tasks.filter((t) => {
      let extra = null;
      if (t.serviceItemId != null) extra = t.serviceItemId;
      else if (t.cargoId != null) {
        extra =
          t.job === 'stageFerry' || t.job === 'bringIn'
            ? t.job === 'stageFerry'
              ? `cargo:${t.cargoId}`
              : t.cargoId
            : t.cargoId;
      } else if (t.job === 'bringIn') {
        extra =
          exceptNpc?.cargo?.serviceKey ||
          exceptNpc?.cargo?.id ||
          exceptNpc?.uid;
      } else if (t.job === 'takeOut') {
        extra = t.targetSlot;
      } else if (t.job === 'removeUpgrade') {
        extra = t.stripHardpointKey || t.stripCategory || null;
      } else if (t.targetSlot != null) {
        extra = t.targetSlot;
      }
      const pile = t.targetPile || t.ferrySource || t.pickup || null;
      const key = this._taskClaimKey(t.job, pile, t.bay, extra);
      return !claimed.has(key);
    });
  }

  _enumerateBayStagingTasks(bay) {
    const tasks = [];
    /** One staging task per cargo item (claim = job + item). */
    const pushItem = (pickup, dropoff, cargo, weight = 1) => {
      if (!pickup || !dropoff || !cargo || pickup.id === dropoff.id) return;
      const full = dropoff.items.length >= PILE_CAP;
      let slot = cargo.pileSlot;
      if (slot == null || slot < 0) {
        this._itemWorldPos(pickup, cargo);
        slot = cargo.pileSlot ?? 0;
      }
      tasks.push({
        pickup,
        dropoff,
        bay,
        weight,
        status: full ? 'blocked' : 'doable',
        clears: pickup.items.length >= PILE_CAP,
        cargoId: cargo.id,
        serviceItemId: cargo.serviceKey ?? `cargo:${cargo.id}`,
        targetSlot: slot,
      });
    };
    const pushAll = (pickup, dropoff, weight = 1, pred = null) => {
      if (!pickup?.items?.length || !dropoff) return;
      for (const c of pickup.items) {
        if (pred && !pred(c)) continue;
        pushItem(pickup, dropoff, c, weight);
      }
    };

    const inS = this._bayPile(bay, 'in', ROW.S);
    const inM = this._bayPile(bay, 'in', ROW.M);
    const inN = this._bayPile(bay, 'in', ROW.N);
    const outS = this._bayPile(bay, 'out', ROW.S);
    const outM = this._bayPile(bay, 'out', ROW.M);
    const outN = this._bayPile(bay, 'out', ROW.N);
    const clearing = !!this.bayClearing[bay];

    if (clearing) {
      pushAll(inS, outS, 16);
      pushAll(inM, outS, 16);
      pushAll(inN, outS, 16);
      pushAll(outM, outS, 16);
      pushAll(outN, outS, 16);
      return tasks;
    }

    if (inS?.items.length && this._bayAcceptsCargo(bay)) {
      const svcPad = this._servicePad(bay);
      const svc = svcPad?.service;
      const svcActive = svc?.phase === 'active';
      if (svcActive) {
        const pending = this._serviceNeedsStaging(svcPad).filter(
          (it) => it.status === 'pending' || it.status === 'staging'
        );
        for (const c of inS.items) {
          const match = pending.some((it) =>
            this._cargoMatchesServiceItem(c, it, bay)
          );
          if (match) {
            const svcBoost = c.serviceKey ? 6 : 0;
            if (c.family === 'upgrade') {
              const nCount = inN?.items.length || 0;
              if (nCount < PILE_CAP) {
                pushItem(inS, inN, c, (nCount === 0 ? 5 : 2) + svcBoost);
              }
            } else {
              const mCount = inM?.items.length || 0;
              if (mCount < PILE_CAP) {
                pushItem(inS, inM, c, (mCount < 2 ? 5 : 1) + svcBoost);
              }
            }
          } else {
            pushItem(inS, outS, c, 10);
          }
        }
      } else {
        for (const c of inS.items) {
          const svcBoost = c.serviceKey ? 6 : 0;
          if (c.family === 'upgrade') {
            const nCount = inN?.items.length || 0;
            if (nCount < PILE_CAP) {
              pushItem(inS, inN, c, (nCount === 0 ? 5 : 2) + svcBoost);
            }
          } else {
            const mCount = inM?.items.length || 0;
            if (mCount < PILE_CAP) {
              pushItem(inS, inM, c, (mCount < 2 ? 5 : 1) + svcBoost);
            }
          }
        }
      }
    }

    const fixMisshelf = (src, prefer, fallback, weight) => {
      if (!src?.items.length) return;
      const srcIsUpgrade = src.role === 'upgrade';
      for (const c of src.items) {
        const wantUpgrade = c.family === 'upgrade';
        if (wantUpgrade === srcIsUpgrade) continue;
        if (prefer && prefer.items.length < PILE_CAP) {
          pushItem(src, prefer, c, weight);
        } else if (fallback && fallback.items.length < PILE_CAP) {
          pushItem(src, fallback, c, weight - 1);
        }
      }
    };
    fixMisshelf(inN, inM, outS, 22);
    fixMisshelf(inM, inN, outS, 22);
    fixMisshelf(outN, outM, outS, 20);
    fixMisshelf(outM, outN, outS, 20);

    pushAll(outN, outS, 4);
    pushAll(outM, outS, 4);

    const safeExportItem = (c) => !c.serviceKey;
    if (inM?.items.length >= PILE_CAP) pushAll(inM, outS, 12, safeExportItem);
    if (inN?.items.length >= PILE_CAP) pushAll(inN, outS, 12, safeExportItem);
    if (outM?.items.length >= PILE_CAP) pushAll(outM, outS, 12);
    if (outN?.items.length >= PILE_CAP) pushAll(outN, outS, 12);

    if (this._pressure > 0) {
      pushAll(inM, outS, 2, safeExportItem);
      pushAll(inN, outS, 2, safeExportItem);
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

  _findSafePileForCargo(cargo, preferBay = null) {
    if (!cargo) return null;
    const fromFinder = this._findCraneDropoffFor(
      cargo,
      preferBay,
      cargo.serviceKey != null ? 'in' : null
    );
    if (fromFinder) return fromFinder;
    const wantRole = cargo.family === 'upgrade' ? 'upgrade' : 'cargo';
    const forceIn = cargo.serviceKey != null;
    const ranked = this.piles
      .filter((p) => {
        if (p.items.length >= PILE_CAP) return false;
        if (!this._pileAcceptsFamily(p, cargo)) return false;
        if (forceIn && p.lane !== 'in') return false;
        if (forceIn && p.row === ROW.S) return false;
        return true;
      })
      .map((p) => {
        let w = 1;
        if (preferBay != null && p.bay === preferBay) w += 8;
        if (p.role === wantRole) w += 6;
        if (p.lane === 'in' && p.role === wantRole) w += 4;
        if (p.lane === 'out' && p.role === wantRole) w += 2;
        if (p.row === ROW.S) w -= 4;
        return { p, w };
      })
      .sort((a, b) => b.w - a.w);
    return ranked[0]?.p || null;
  }

  _depositCargoSafe(cargo, preferBay = null, exceptNpc = null) {
    const dest = this._findSafePileForCargo(cargo, preferBay);
    if (!dest) return false;
    return this._pilePush(dest, cargo, exceptNpc);
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

  _pileAcceptsFamily(pile, cargo) {
    if (!pile || !cargo) return false;
    // South storage I/O is transit-only — never a final shelf for the wrong family
    // when a matching N/M pad exists; still allowed as last-resort drop.
    if (pile.row === ROW.S) return true;
    if (cargo.family === 'upgrade') return pile.role === 'upgrade';
    return pile.role === 'cargo';
  }

  update(deltaTime, ship, weapons = {}) {
    this.time += deltaTime;

    if (ship?.position) {
      this._shipPos.x = ship.position.x;
      this._shipPos.y = ship.position.y;
    }
    // Keep last controlled hull ref when ticking headless in space (ship arg null)
    if (ship) this._playerShip = ship;

    const act = thrusterActivity(ship);
    const weaponPulse =
      (weapons.firedTurret ? 1 : 0) + (weapons.laserOn ? 0.55 : 0);
    if (
      weaponPulse > 0 &&
      Number.isFinite(weapons.muzzleX) &&
      Number.isFinite(weapons.muzzleY)
    ) {
      this._weaponWash.x = weapons.muzzleX;
      this._weaponWash.y = weapons.muzzleY;
    }
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
    this._tickPlayerDevSeq(deltaTime);
    this._updateVisitorTraffic(deltaTime);
    if (!this._headlessWarmup) {
      this._updatePlayerBayService(deltaTime);
    }
    this._updateBayClearing();
    this._syncDoorBeacons();
    this._syncBayTickers();
    this._tickServiceBoardScrolls(deltaTime);

    for (const b of this._opsBays) this.tickEvac(b);

    const hazardLevel =
      this._hazard.maneuver * 0.55 +
      this._hazard.engine * 1.1 +
      this._hazard.weapons * 1.35;

    for (const npc of this.npcs) {
      if (npc.kind === 'mechanic') {
        npc.secSinceLastBayTask = (npc.secSinceLastBayTask || 0) + deltaTime;
        this._updateMechanic(npc, deltaTime, hazardLevel);
      } else {
        this._updateForklift(npc, deltaTime, hazardLevel);
      }
    }
    // Fixed roster — never cull by alive; revive if something goes wrong
    for (const npc of this.npcs) {
      if (!npc.alive) {
        npc.alive = true;
        if (npc.kind === 'mechanic') this._parkMechanicIdle(npc);
        else this._parkForkliftAtHub(npc);
      }
    }

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
    if (!this._weldEmberTrail) this._weldEmberTrail = [];
    for (const s of this._sparkle) {
      s.life -= deltaTime;
      if (s.dust || s.weld) {
        const ox = s.x;
        const oy = s.y;
        s.x += (s.vx || 0) * deltaTime;
        s.y += (s.vy || 0) * deltaTime;
        s.vx = (s.vx || 0) * (s.weld ? 0.94 : 0.92);
        s.vy = (s.vy || 0) * (s.weld ? 0.93 : 0.9) + (s.weld ? 28 : 4) * deltaTime;
        // Leave brief ember stamps as sparks travel — underglow trails the slag
        if (s.weld && !s.core) {
          const spd = Math.hypot(s.vx || 0, s.vy || 0);
          const step = Math.hypot(s.x - ox, s.y - oy);
          s._emberAcc = (s._emberAcc || 0) + step;
          if (s._emberAcc > 2.8 || (spd > 40 && Math.random() < deltaTime * 18)) {
            s._emberAcc = 0;
            const lifeA = Math.max(0.15, s.life / (s.max || 0.3));
            this._weldEmberTrail.push({
              x: ox + (s.x - ox) * 0.5,
              y: oy + (s.y - oy) * 0.5,
              life: rand(0.08, 0.16) * lifeA,
              max: 0.16,
              r: (s.r || 1) * 0.85,
              warm: !!s.warm,
              core: false,
              layer: s.layer,
              padX: s.padX,
              padY: s.padY,
              padAngle: s.padAngle,
              bay: s.bay,
            });
          }
        }
      }
    }
    this._sparkle = this._sparkle.filter((s) => s.life > 0);
    for (const e of this._weldEmberTrail) {
      e.life -= deltaTime;
    }
    this._weldEmberTrail = this._weldEmberTrail.filter((e) => e.life > 0);
    // Cap trail so busy multi-bay welds stay cheap
    if (this._weldEmberTrail.length > 80) {
      this._weldEmberTrail.splice(0, this._weldEmberTrail.length - 80);
    }
    // Under-hull weld glow: mid decay + softer flash stutter between emits
    for (const npc of this.npcs) {
      const g = npc._weldGlow;
      if (!g) continue;
      g.intensity = Math.max(0, (g.intensity || 0) - deltaTime * 2.4);
      g.flash = Math.max(0, (g.flash || 0) - deltaTime * 4.5);
      g.surfaceKiss = Math.max(0, (g.surfaceKiss || 0) - deltaTime * 2.2);
      if (g.intensity > 0.15 && Math.random() < deltaTime * 2.25) {
        g.flash = Math.min(0.85, (g.flash || 0) + rand(0.25, 0.55));
        if (Math.random() < 0.35) g.amber = true;
        g.speckleSeed = Math.random();
      }
      if (g.intensity < 0.03 && (g.flash || 0) < 0.03) {
        g.amber = false;
      }
    }
    for (const d of this._debris) {
      d.life -= deltaTime;
      d.x += d.vx * deltaTime;
      d.y += d.vy * deltaTime;
    }
    this._debris = this._debris.filter((d) => d.life > 0);
  }

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
      pile.items.forEach((cargo) => {
        const pos = this._itemWorldPos(pile, cargo);
        out.push({ cargo, pile, x: pos.x, y: pos.y, kind: 'pile' });
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

  _itemWorldPos(pile, itemOrIndex) {
    // Stable 2×2 slot per item — never remap by array index (that caused shuffling)
    let slotIdx = 0;
    if (itemOrIndex && typeof itemOrIndex === 'object') {
      slotIdx = itemOrIndex.pileSlot;
      if (slotIdx == null || slotIdx < 0 || slotIdx >= PILE_SLOTS.length) {
        slotIdx = this._pileAssignSlotIfMissing(pile, itemOrIndex);
      }
    } else {
      slotIdx = Math.min(itemOrIndex | 0, PILE_SLOTS.length - 1);
    }
    const slot = PILE_SLOTS[slotIdx];
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
      this._pileRemove(target.pile, target.cargo);
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

  _pileAssignSlotIfMissing(pile, cargo) {
    if (
      cargo?.pileSlot != null &&
      cargo.pileSlot >= 0 &&
      cargo.pileSlot < PILE_SLOTS.length
    ) {
      return cargo.pileSlot;
    }
    const used = new Set(
      pile.items
        .filter((it) => it !== cargo)
        .map((it) => it.pileSlot)
        .filter((s) => s != null && s >= 0)
    );
    for (let s = 0; s < PILE_SLOTS.length; s++) {
      if (!used.has(s)) {
        cargo.pileSlot = s;
        return s;
      }
    }
    cargo.pileSlot = 0;
    return 0;
  }

  _bayWorkPiles(padX, lane, row) {
    const bay = bayIndexFromX(padX);
    const pile = this._bayPile(bay, lane, row);
    return pile ? [pile] : [];
  }

  _nearbyMidPiles(padX) {
    return this._bayWorkPiles(padX, 'in', ROW.M);
  }

  _initStationCrew() {
    this.npcs = [];
    const labels = this._bayLabels();
    const n = Math.max(1, this.hangarConfig?.bayCount || 3);
    const mechsPerBay = this.hangarConfig?.mechsPerBay || [2, 2, 2];
    for (let bay = 0; bay < n; bay++) {
      const count = Math.max(0, mechsPerBay[bay] | 0);
      for (let slot = 1; slot <= count; slot++) {
        this._createMechanic(`${labels[bay]}Mechanic${slot}`, bay, slot);
      }
    }
    const forkliftCount = this.hangarConfig?.hasForkliftHub
      ? Math.max(0, this.hangarConfig?.forkliftCount | 0)
      : 0;
    if (forkliftCount > 0) {
      const step = Math.max(1, Math.floor(FORKLIFT_PARK_COUNT / forkliftCount));
      for (let i = 0; i < forkliftCount; i++) {
        const parkIndex = Math.min(i * step, FORKLIFT_PARK_COUNT - 1);
        this._createForklift(`forklift${i + 1}`, parkIndex);
      }
    }
  }

  _nearestStair(x) {
    return STAIRS.slice().sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  }

  _enumerateTakeOutSlotTasks(pile, { weight, clears }, exceptNpc = null) {
    if (!pile?.items?.length) return [];
    const claimed = this._claimedTaskKeys(exceptNpc);
    const tasks = [];
    const seen = new Set();
    for (const item of pile.items) {
      let slot = item.pileSlot;
      if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
        slot = this._pileAssignSlotIfMissing(pile, item);
      }
      if (slot == null || slot < 0 || seen.has(slot)) continue;
      seen.add(slot);
      const key = this._taskClaimKey('takeOut', pile, pile.bay, slot);
      if (claimed.has(key)) continue;
      const stolen = this.npcs.some(
        (n) =>
          n !== exceptNpc &&
          n.alive &&
          n.kind === 'forklift' &&
          n.job === 'takeOut' &&
          n.targetPile?.id === pile.id &&
          n.targetSlot === slot
      );
      if (stolen) continue;
      tasks.push({
        job: 'takeOut',
        targetPile: pile,
        targetSlot: slot,
        bay: pile.bay,
        status: 'doable',
        weight,
        clears,
      });
    }
    return tasks;
  }

  _hasOutboundCargo() {
    return this._pilesInRow(ROW.S).some(
      (p) => p.lane === 'out' && p.items.length > 0
    );
  }

  _makeSmartInboundCargo(preferBay = null, preferItemId = null) {
    const padNeedsSpawn = (p) =>
      !!p?.visitorId &&
      !!p.service?.items?.some((it) => this._serviceItemNeedsSpawn(p, it));

    if (preferBay != null) {
      const preferred = this._servicePad(preferBay);
      if (preferItemId != null) {
        const it = preferred?.service?.items?.find((i) => i.id === preferItemId);
        if (this._serviceItemNeedsSpawn(preferred, it)) {
          return this._makeServiceInboundCargo(preferred, preferItemId);
        }
      }
      if (padNeedsSpawn(preferred)) {
        return this._makeServiceInboundCargo(preferred, preferItemId);
      }
    }

    const pads = this._allServicePads().filter(padNeedsSpawn);
    if (!pads.length) return null;
    return this._makeServiceInboundCargo(pick(pads), preferItemId);
  }

  _slotWorld(pile, slotIdx) {
    const s = PILE_SLOTS[slotIdx] || PILE_SLOTS[0];
    return { x: pile.x + s.ox, y: pile.y + s.oy };
  }

  _peekServicePileCargo(pile, bay, job, npc = null) {
    if (!pile?.items?.length) return null;
    if (job === 'stageFerry') {
      const preferCargoId = npc?._claimCargoId ?? null;
      if (preferCargoId != null) {
        const hit = pile.items.find((c) => c.id === preferCargoId);
        if (hit) return hit;
      }
      return pile.items[pile.items.length - 1];
    }
    const preferCargoId = npc?._claimCargoId ?? null;
    const preferKey = npc?._claimServiceItemId ?? npc?._activeServiceId ?? null;
    if (preferCargoId != null) {
      const hit = pile.items.find((c) => c.id === preferCargoId);
      if (hit) return hit;
    }
    if (preferKey != null && !String(preferKey).startsWith('cargo:')) {
      const hit = pile.items.find((c) => c.serviceKey === preferKey);
      if (hit) return hit;
    }
    const taken = this._claimedServiceKeys(npc);
    const svc = this._servicePad(bay)?.service;
    if (!svc || svc.phase !== 'active') {
      return (
        pile.items.find((c) => {
          const tag = c.serviceKey != null ? c.serviceKey : `cargo:${c.id}`;
          return !taken.has(tag);
        }) || null
      );
    }
    const wantTypes =
      job === 'installUpgrade'
        ? ['upgrade']
        : ['refuel', 'reloadBullets', 'reloadShells', 'loadCargo'];
    const pending = svc.items.filter(
      (it) =>
        wantTypes.includes(it.type) &&
        it.status !== 'done' &&
        !taken.has(it.id)
    );
    if (!pending.length) return null;
    const idx = pile.items.findIndex(
      (c) =>
        c.serviceKey != null && pending.some((it) => it.id === c.serviceKey)
    );
    if (idx < 0) return null;
    return pile.items[idx];
  }

  _doorX(side) {
    return side < 0 ? -BAY.HALF_W : BAY.HALF_W;
  }

  _insideX(side) {
    return side < 0 ? -BAY.HALF_W + 28 : BAY.HALF_W - 28;
  }

  _shipLocalToWorld(padX, padY, lx, ly, angle = null) {
    const a = angle ?? this.playerPadAngle ?? SHIP.SPAWN_ANGLE;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      x: padX + lx * cos - ly * sin,
      y: padY + lx * sin + ly * cos,
    };
  }

  _upgradeHardpointKeyForNpc(npc, bay) {
    if (npc.job === 'installUpgrade') {
      return npc.cargo?.targetHardpointKey || npc.workHardpointKey || null;
    }
    if (npc.job === 'removeUpgrade') {
      return (
        npc.stripHardpointKey ||
        npc.workHardpointKey ||
        this._stripHardpointForBay(bay, null)
      );
    }
    return null;
  }

  _padAngleForBay(bay) {
    if (this.isPlayerBay(bay)) return this.playerPadAngle ?? SHIP.SPAWN_ANGLE;
    const pad = this._servicePad(bay);
    return pad?.padAngle ?? FACE_NORTH;
  }

  _projectOntoShipHull(padX, padY, angle, wx, wy) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = wx - padX;
    const dy = wy - padY;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const hx = SHIP_EXTENT.LENGTH * 0.48;
    const hy = SHIP_EXTENT.BEAM * 0.48;
    const nx = lx / hx;
    const ny = ly / hy;
    const d = Math.hypot(nx, ny) || 0;
    let plx = lx;
    let ply = ly;
    if (d > 1) {
      plx = (nx / d) * hx;
      ply = (ny / d) * hy;
    }
    const w = this._shipLocalToWorld(padX, padY, plx, ply, angle);
    return {
      x: w.x,
      y: w.y,
      inside: d <= 1,
      outside: Math.max(0, d - 1),
    };
  }

  _shipHardpointApproach(pad, hardpointKey) {
    const bay =
      typeof pad.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(pad.x);
    const angle =
      this.isPlayerBay(bay) ? this.playerPadAngle ?? SHIP.SPAWN_ANGLE : SHIP.SPAWN_ANGLE;
    const def = this._shipDefForBay(bay);
    const socket =
      def?.resolveMounts?.()?.[hardpointKey]?.socket ||
      HARDPOINTS[hardpointKey] ||
      null;
    if (!socket) return this._shipHullApproach(pad, 'upgrade');

    const padY = pad.y ?? 0;
    const onHull = this._shipLocalToWorld(pad.x, padY, socket.x, socket.y, angle);
    const dx = onHull.x - pad.x;
    const dy = onHull.y - padY;
    const len = Math.hypot(dx, dy);

    // Center / near-center mounts (dorsal turret): approach from a beam flank
    if (len < 5) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const flank = this._shipLocalToWorld(
        pad.x,
        padY,
        socket.x * 0.35 + 2,
        side * (SHIP_EXTENT.BEAM * 0.48),
        angle
      );
      const fdx = flank.x - onHull.x;
      const fdy = flank.y - onHull.y;
      const fl = Math.hypot(fdx, fdy) || 1;
      const stand = this._mechStandForWeldTip(
        onHull.x,
        onHull.y,
        fdx / fl,
        fdy / fl
      );
      return {
        x: stand.x,
        y: stand.y,
        hardpointKey,
        workX: onHull.x,
        workY: onHull.y,
      };
    }

    const stand = this._mechStandForWeldTip(
      onHull.x,
      onHull.y,
      dx / len,
      dy / len
    );
    return {
      x: stand.x,
      y: stand.y,
      hardpointKey,
      workX: onHull.x,
      workY: onHull.y,
    };
  }

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
    const bay =
      typeof pad.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(pad.x);
    const angle =
      this.isPlayerBay(bay) ? this.playerPadAngle ?? SHIP.SPAWN_ANGLE : SHIP.SPAWN_ANGLE;
    const onHull = this._shipLocalToWorld(pad.x, padY, lx, ly, angle);
    const dx = onHull.x - pad.x;
    const dy = onHull.y - padY;
    const len = Math.hypot(dx, dy) || 1;
    // Cargo: stand just outside the skin. Weld/upgrade: tip on contact, grip outboard.
    if (mode === 'weld' || mode === 'upgrade') {
      const stand = this._mechStandForWeldTip(
        onHull.x,
        onHull.y,
        dx / len,
        dy / len
      );
      return {
        x: stand.x,
        y: stand.y,
        workX: onHull.x,
        workY: onHull.y,
      };
    }
    const standR = len + 2.5;
    return {
      x: pad.x + (dx / len) * standR,
      y: padY + (dy / len) * standR,
      workX: onHull.x,
      workY: onHull.y,
    };
  }

  _noteBayTaskComplete(npc) {
    npc.secSinceLastBayTask = 0;
  }

  _beginIdleFluff(npc) {
    this._clearTaskClaim(npc);
    npc.job = 'idle';
    npc.taskMode = 'idle';
    npc.hullTarget = null;
    npc.lingerTarget = null;
    npc.gossipWp = null;
    npc.ferryDest = null;
    npc.ferrySource = null;
    npc.weldSpotsTotal = null;
    npc.weldSpotIndex = null;
    const idleSec = npc.secSinceLastBayTask || 0;
    // Fresh off a job → near-bay; long idle → wing / gossip
    const wingBias = Math.min(1, idleSec / 60);
    const roll = Math.random();
    if (roll < 0.35 + wingBias * 0.35) {
      this._assignGossipLinger(npc);
    } else {
      this._assignPiddleLinger(npc, wingBias);
    }
  }

  _assignPiddleLinger(npc, wingBias = 0.5) {
    const homeBay = npc.homeBay ?? 0;
    const props = getHangarProps();
    const near = props.filter(
      (p) => p.bay === homeBay && p.kind === 'computer'
    );
    // Bay-scoped wing fluff: B1 west, B3 east, B2 center pockets — never south of road
    const wing = props.filter((p) => {
      if (p.kind === 'computer') return false;
      const ly = p.linger?.[0]?.y ?? p.y;
      if (ly >= MECH_LINGER_Y_MAX) return false;
      if (homeBay === 0) return p.bay === 0;
      if (homeBay === 2) return p.bay === 2;
      return p.bay === 1;
    });
    const pool = Math.random() < wingBias && wing.length ? wing : near.length ? near : wing;
    const prop = pool.length ? pick(pool) : BAY_COMPUTERS[homeBay];
    const spots = (prop.linger || [{ x: prop.x, y: prop.y + 12 }])
      .map((s, i) => ({
        ...s,
        id: s.id || `${prop.id}_${i}`,
        _bays: resolveLingerBays(s, prop),
      }))
      .filter((s) => lingerAllowsBay(s._bays, homeBay));
    if (!spots.length) {
      // No bay-legal stand — park near home computer
      const c = BAY_COMPUTERS[homeBay];
      npc.gossipWp = null;
      npc.gossipSlot = null;
      npc.lingerFaceRad = null;
      npc.lingerTarget = {
        x: c.x,
        y: Math.min(c.y + 12, MECH_LINGER_Y_MAX),
        propId: c.id,
        faceDeg: 270,
        faceSlackDeg: 25,
      };
      npc.state = 'idleFluff';
      npc.stateT = rand(2.5, 5.5);
      return;
    }
    const free = spots.filter((s) => {
      const n = this.npcs.filter(
        (o) =>
          o.kind === 'mechanic' &&
          o.alive &&
          o !== npc &&
          (o.state === 'idleFluff' || o.state === 'gossip') &&
          o.lingerTarget &&
          Math.hypot(o.lingerTarget.x - s.x, o.lingerTarget.y - s.y) < 10
      ).length;
      return n === 0;
    });
    const spot = (free.length ? pick(free) : pick(spots)) || spots[0];
    const faceDeg = spot.faceDeg ?? 90;
    const faceSlackDeg = spot.faceSlackDeg ?? 25;
    npc.gossipWp = null;
    npc.gossipSlot = null;
    npc.lingerFaceRad = null;
    npc.lingerTarget = {
      x: spot.x,
      y: Math.min(spot.y, MECH_LINGER_Y_MAX),
      propId: prop.id,
      spotId: spot.id,
      faceDeg,
      faceSlackDeg,
    };
    npc.state = 'idleFluff';
    npc.stateT = rand(2.5, 5.5);
  }

  _gossipRingPose(wp, slotIndex, capacity) {
    const n = Math.max(1, capacity | 0);
    const ang = -Math.PI / 2 + (slotIndex / n) * Math.PI * 2;
    return {
      x: wp.x + Math.cos(ang) * GOSSIP_RING_RADIUS,
      y: Math.min(wp.y + Math.sin(ang) * GOSSIP_RING_RADIUS, MECH_LINGER_Y_MAX),
    };
  }

  _assignGossipLinger(npc) {
    const waypoints = getGossipWaypoints();
    if (!waypoints.length) {
      this._assignPiddleLinger(npc, 0.5);
      return;
    }
    const occupied = waypoints.map((wp) => {
      const taken = new Set();
      for (const o of this.npcs) {
        if (
          o.kind === 'mechanic' &&
          o.alive &&
          o !== npc &&
          (o.state === 'idleFluff' || o.state === 'gossip') &&
          o.gossipWp === wp.id &&
          o.gossipSlot != null
        ) {
          taken.add(o.gossipSlot);
        }
      }
      return { wp, taken, n: taken.size };
    });
    occupied.sort((a, b) => {
      const af = a.n > 0 && a.n < a.wp.capacity ? 0 : 1;
      const bf = b.n > 0 && b.n < b.wp.capacity ? 0 : 1;
      if (af !== bf) return af - bf;
      return b.n - a.n;
    });
    const choice = occupied.find((o) => o.n < o.wp.capacity);
    if (!choice) {
      // All gossip full — piddle instead of stacking
      this._assignPiddleLinger(npc, 0.35);
      return;
    }
    let slotIndex = 0;
    while (choice.taken.has(slotIndex) && slotIndex < choice.wp.capacity) {
      slotIndex++;
    }
    const pose = this._gossipRingPose(choice.wp, slotIndex, choice.wp.capacity);
    npc.gossipWp = choice.wp.id;
    npc.gossipSlot = slotIndex;
    npc.lingerFaceRad = null;
    npc.lingerTarget = {
      x: pose.x,
      y: pose.y,
      propId: choice.wp.id,
      spotId: `${choice.wp.id}_s${slotIndex}`,
    };
    npc.state = 'idleFluff';
    npc.stateT = rand(3, 7);
  }

  _hatchRally(npc) {
    const stair = npc.stair || npc.exitStair || STAIRS[npc.homeBay] || this._nearestStair(npc.x);
    const x = this._pickCorridorX(stair.x, npc.targetPad?.x ?? stair.x, npc);
    return { x, y: BACKSPLASH_Y - BACKSPLASH_BAND - 24 };
  }

  _backsplashGateY(south) {
    return south
      ? BACKSPLASH_Y + BACKSPLASH_BAND + 10
      : BACKSPLASH_Y - BACKSPLASH_BAND - 10;
  }

  _backsplashSideSouth(y) {
    if (y >= BACKSPLASH_Y + BACKSPLASH_BAND) return true;
    if (y <= BACKSPLASH_Y - BACKSPLASH_BAND) return false;
    // Inside the Y band of the wall slab: snap to nearer clear side
    return y >= BACKSPLASH_Y;
  }

  _backsplashCorridors() {
    const pads = padCenters();
    const half = BACKSPLASH_HALF_W;
    const margin = BACKSPLASH_BYPASS;
    const laneGap = 6;
    const xs = [pads[0] - half - margin, pads[0] - half - margin - laneGap];
    for (let i = 0; i < pads.length - 1; i++) {
      const leftFace = pads[i] + half + margin;
      const rightFace = pads[i + 1] - half - margin;
      // Two parallel lanes per gap (already hug faces; nudge inward slightly)
      xs.push(leftFace);
      xs.push(Math.min(leftFace + laneGap, (leftFace + rightFace) * 0.5 - 1));
      xs.push(rightFace);
      xs.push(Math.max(rightFace - laneGap, (leftFace + rightFace) * 0.5 + 1));
    }
    xs.push(pads[pads.length - 1] + half + margin);
    xs.push(pads[pads.length - 1] + half + margin + laneGap);
    return xs;
  }

  _pickCorridorX(x, tx = x, npc = null) {
    const corridors = this._backsplashCorridors();
    const uidBias = npc?.uid != null ? npc.uid % 2 : 0;
    let best = corridors[0];
    let bestScore = Infinity;
    for (let i = 0; i < corridors.length; i++) {
      const cx = corridors[i];
      // Prefer corridor near the crew; slight bias toward the target's X
      let score = Math.abs(cx - x) + Math.abs(cx - tx) * 0.25;
      // Prefer uid-stable lane among near-ties so mechs don't all stack
      if ((i % 2) === uidBias) score -= 4;
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
      if (Math.abs(x - cx) <= BACKSPLASH_HALF_W + MECH_BODY_R) return cx;
    }
    return null;
  }

  _segmentHitsBacksplash(x0, y0, x1, y1) {
    const wy = BACKSPLASH_Y;
    const band = BACKSPLASH_BAND;
    const bothNorth = y0 < wy - band && y1 < wy - band;
    const bothSouth = y0 > wy + band && y1 > wy + band;
    if (bothNorth || bothSouth) return false;
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    for (const cx of padCenters()) {
      if (
        maxX >= cx - BACKSPLASH_HALF_W - MECH_BODY_R &&
        minX <= cx + BACKSPLASH_HALF_W + MECH_BODY_R
      ) {
        return true;
      }
    }
    return false;
  }

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
    npc._corridorX = this._pickCorridorX(npc.x, tx, npc);
    npc._crossFromSouth = this._backsplashSideSouth(npc.y);
  }

  _sameSideDodge(npc, tx, ty, speed, dt) {
    if (
      npc._dodgeCorridorX == null ||
      Math.abs(npc.x - npc._dodgeCorridorX) < 2
    ) {
      npc._dodgeCorridorX = this._pickCorridorX(npc.x, tx, npc);
    }
    const corridorX = npc._dodgeCorridorX;
    const inBand = Math.abs(npc.y - BACKSPLASH_Y) <= BACKSPLASH_BAND;
    if (inBand) {
      const clearY = this._backsplashGateY(this._backsplashSideSouth(ty));
      if (Math.abs(npc.y - clearY) > 3) {
        this._moveToward(npc, npc.x, clearY, speed, dt);
        return false;
      }
    }
    if (Math.abs(npc.x - corridorX) > 4) {
      const slideY = inBand
        ? this._backsplashGateY(this._backsplashSideSouth(ty))
        : npc.y;
      this._moveToward(npc, corridorX, slideY, speed, dt);
      return false;
    }
    npc._dodgeCorridorX = null;
    return this._moveToward(npc, tx, ty, speed, dt);
  }

  _isPileApproachState(npc) {
    return (
      npc.state === 'toPile' ||
      npc.state === 'workPile' ||
      npc.state === 'linger'
    );
  }

  _syncBayLaneModes() {
    const pb = this.playerBayIndex;
    for (let i = 0; i < 3; i++) {
      const mode = this.bayLaneMode[i];
      if (mode === 'incoming' || mode === 'departing' || mode === 'elevator') continue;
      if (this._opsBays.has(i)) continue;
      if (i === pb) {
        const hot =
          this._hazard.engine > 0.28 || this._hazard.maneuver > 0.5;
        this.bayLaneMode[i] = hot ? 'danger' : 'idle';
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
        npc.targetSlot = null;
        npc.state = 'toPile';
        return;
      }
    }
    // Sensible default: put it on a matching-family pile, then re-pick work
    const bay = npc.bay ?? bayIndexFromX(npc.x);
    const dest = this._findSafePileForCargo(npc.cargo, bay);
    if (dest && dest.items.length < PILE_CAP) {
      npc.targetPile = dest;
      npc.targetSlot = null;
      npc.job = npc.cargo?.family === 'upgrade' ? 'removeUpgrade' : 'unloadShip';
      npc.state = 'toPile';
      return;
    }
    this._beginNextMechanicTrip(npc);
  }

  _padKeepOut(x, y, radius = BAY.PAD_R + 14) {
    const pads = padCenters().map((px) => ({ x: px, y: 0 }));
    for (const p of pads) {
      const dx = x - p.x;
      const dy = y - p.y;
      const clear = radius;
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

  _npcBehindServiceBoard(npc) {
    if (npc.y >= SERVICE_BOARD_BOTTOM - 2) return false;
    if (npc.y < SERVICE_BOARD_TOP - 14) return false;
    for (const cx of padCenters()) {
      if (Math.abs(npc.x - cx) <= BACKSPLASH_HALF_W + 6) return true;
    }
    return false;
  }

  getDoorLipY() {
    return -BAY.HALF_H + BAY.DOOR_H;
  }

  _shaftDepthAt(t) {
    const tt = Math.min(1, Math.max(0, t));
    // VP / floor well below the southern lip (clip is ±PAD_R)
    const south = tt * BAY.PAD_R * 1.85;
    const scaleX = 1 - tt * 0.72;
    return {
      south,
      scaleX,
      scaleY: scaleX * (1 - tt * 0.35),
      alpha: Math.max(0, 1 - tt * 0.9),
    };
  }

  _fadeElevatorTransitToBlack(ctx, drop, padR) {
    const t = Math.max(0, Math.min(1, drop));
    if (t < 0.01) return;

    const outer = padR * 1.7;
    const padStop = Math.min(0.98, padR / outer);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
    // Pure black through the pad silhouette
    grad.addColorStop(0, `rgba(0, 0, 0, ${t})`);
    grad.addColorStop(padStop, `rgba(0, 0, 0, ${t})`);
    // Feather: still dark just past the rim, then clear
    grad.addColorStop(Math.min(1, padStop + 0.12), `rgba(0, 0, 0, ${t * 0.55})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.fill();
  }

  _npcVisibleThroughBulkheads(npc) {
    const w = BAY.HALF_W;
    // Anyone still on the deck stays visible (stairs, ships, piles)
    if (Math.abs(npc.x) <= w - 2) return true;
    const doorLo = BAY.PATH_Y - BAY.BULK_DOOR_HALF;
    const doorHi = BAY.PATH_Y + BAY.BULK_DOOR_HALF;
    return npc.y >= doorLo - 4 && npc.y <= doorHi + 4;
  }

  _hangarSpaceCover() {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    const pads = padCenters();
    const left = pads[0] - vpW / 2;
    const right = pads[pads.length - 1] + vpW / 2;
    const midY = vpY + vpH / 2;
    const doorTop = -BAY.HALF_H;
    const doorH = BAY.DOOR_H;
    const windowCover = Math.hypot(right - left, vpH) / 2 + 40;
    const doorCover = Math.hypot(right - left, (doorTop + doorH - midY) * 2) / 2 + 40;
    return Math.max(windowCover, doorCover);
  }

  /** Bust peephole plate when a new hangar session starts. */
  invalidateSpacefieldCache() {
    if (this._spacefieldPlate) this._spacefieldPlate.key = '';
  }

  _paintHangarSpacefield(ctx, space, cover) {
    const { starfield, nebulaField, spaceX, spaceY, time, backdropSession = 0 } = space;
    const zoom = 0.55;
    const side = Math.ceil(cover * 2.2);
    // One bake per hangar visit — cosmetic coords, not live flight/chunk sim.
    const cacheKey = `hangar-static|${backdropSession}|${side}`;

    if (!this._spacefieldPlate) {
      this._spacefieldPlate = { canvas: null, ctx: null, side: 0, key: '' };
    }
    const plate = this._spacefieldPlate;
    if (plate.key !== cacheKey || plate.side < side) {
      if (!plate.canvas || plate.side < side) {
        plate.canvas = document.createElement('canvas');
        plate.canvas.width = side;
        plate.canvas.height = side;
        plate.ctx = plate.canvas.getContext('2d', { alpha: true });
        plate.side = side;
      }
      const pctx = plate.ctx;
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, side, side);
      pctx.translate(side / 2, side / 2);
      nebulaField.paintAmbient(pctx, spaceX, spaceY, time, cover, zoom);
      starfield.render(pctx, spaceX, spaceY, cover, time, zoom);
      plate.key = cacheKey;
    }

    ctx.drawImage(plate.canvas, 0, 0, side, side, -cover, -cover, cover * 2, cover * 2);
  }

  _bayDoorLeafW() {
    return BAY.DOOR_HALF - 1.5;
  }

  _bayDoorSegW() {
    return this._bayDoorLeafW() / 3;
  }

  _bayDoorTelescoping() {
    const segW = this._bayDoorSegW();
    const nestPitch = 2.2;
    const nestSpan = segW + 2 * nestPitch;
    /** Pull the whole nest into the jamb column so the door frame clears fully. */
    const jambTuck = 6;
    return { segW, nestPitch, nestSpan, jambTuck };
  }

  _bayDoorGapHalf(open) {
    const { jambTuck } = this._bayDoorTelescoping();
    // Closed: center seam (~1.5). Open: past the jamb so the full bay mouth is clear.
    return 1.5 + open * (BAY.DOOR_HALF - 1.5 + jambTuck);
  }

  _propBox(ctx, x, y, halfW, halfD, h, cols) {
    const inset = Math.min(1.6, h * 0.08);
    const nw = { x: x - halfW, y: y - halfD };
    const ne = { x: x + halfW, y: y - halfD };
    const se = { x: x + halfW, y: y + halfD };
    const sw = { x: x - halfW, y: y + halfD };
    const tnw = { x: nw.x + inset * 0.15, y: nw.y - h + inset };
    const tne = { x: ne.x - inset * 0.15, y: ne.y - h + inset };
    const tse = { x: se.x - inset * 0.15, y: se.y - h };
    const tsw = { x: sw.x + inset * 0.15, y: sw.y - h };

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + halfD * 0.4 + 2.2,
      halfW * 1.2,
      halfD * 0.55 + 1.8,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Far (north) wall
    ctx.fillStyle = cols.far || '#1a2430';
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(tne.x, tne.y);
    ctx.lineTo(tnw.x, tnw.y);
    ctx.closePath();
    ctx.fill();

    // Side walls — draw lower-Y (farther) side first
    const leftFirst = (nw.y + sw.y) / 2 <= (ne.y + se.y) / 2;
    const sides = leftFirst
      ? [
          [nw, sw, tsw, tnw, cols.sideL || cols.side],
          [ne, se, tse, tne, cols.sideR || cols.side],
        ]
      : [
          [ne, se, tse, tne, cols.sideR || cols.side],
          [nw, sw, tsw, tnw, cols.sideL || cols.side],
        ];
    for (const [a, b, tb, ta, col] of sides) {
      ctx.fillStyle = col || cols.side || '#243040';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(tb.x, tb.y);
      ctx.lineTo(ta.x, ta.y);
      ctx.closePath();
      ctx.fill();
    }

    // Near (south) wall — last so it sits in front
    ctx.fillStyle = cols.near || '#2a3848';
    ctx.beginPath();
    ctx.moveTo(sw.x, sw.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(tse.x, tse.y);
    ctx.lineTo(tsw.x, tsw.y);
    ctx.closePath();
    ctx.fill();

    // Top deck
    ctx.fillStyle = cols.top || '#4a5868';
    ctx.beginPath();
    ctx.moveTo(tnw.x, tnw.y);
    ctx.lineTo(tne.x, tne.y);
    ctx.lineTo(tse.x, tse.y);
    ctx.lineTo(tsw.x, tsw.y);
    ctx.closePath();
    ctx.fill();
    if (cols.stroke) {
      ctx.strokeStyle = cols.stroke;
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }
    // Near lip highlight
    ctx.strokeStyle = 'rgba(220, 230, 240, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tsw.x, tsw.y);
    ctx.lineTo(tse.x, tse.y);
    ctx.stroke();
    return { nw, ne, se, sw, tnw, tne, tse, tsw, h };
  }

  _propDrum(ctx, x, y, r, h, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3.5, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y - h + 3, r * 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x - r, y - h + 3, r * 0.5, h);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + r * 0.3, y - h + 3, r * 0.4, h);
    // Top ellipse
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y - h + 3, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 200, 120, 0.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - r, y - h * 0.35);
    ctx.lineTo(x + r, y - h * 0.35);
    ctx.moveTo(x - r, y - h * 0.62);
    ctx.lineTo(x + r, y - h * 0.62);
    ctx.stroke();
  }

  _cargoOctBasis(headingRad) {
    let oct = Math.round((headingRad || 0) / CREW_VIS_OCT);
    oct = ((oct % 8) + 8) % 8;
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    return {
      oct,
      heading,
      fx,
      fy,
      rx: -fy,
      ry: fx,
      alongScale: 0.72 + 0.28 * Math.abs(fx),
      acrossScale: 0.72 + 0.28 * Math.abs(fy),
    };
  }
}

attachCrewShared(HangarBay);
attachVisitorTraffic(HangarBay);
attachCraneSim(HangarBay);
attachForkliftAI(HangarBay);
attachMechanicAI(HangarBay);
attachHangarRender(HangarBay);
