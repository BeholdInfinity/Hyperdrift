/**
 * ForkliftAI — HangarBay prototype mixin.
 */
import { HANGAR, SHIP } from '../../core/Constants.js';
import { clamp, normalizeAngle } from '../../utils/MathUtils.js';
import { SHIP_EXTENT, HARDPOINTS } from '../../entities/ShipHardpoints.js';
import {
  drawVisitorShip,
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
import { createPlayerStarter } from '../../ships/ShipGenerator.js';
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
} from './constants.js';
import {
  padCenters,
  colXs,
  bayIndexFromX,
  colMeta,
  buildPileHardpoints,
  hangarPadX,
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


export function attachForkliftAI(HangarBay) {
  HangarBay.prototype._forkFetchClaimedForItem = function (itemId) {
    if (itemId == null) return false;
    return this.npcs.some(
      (n) => n.alive && n._fetchInbound && n._fetchItemId === itemId
    );
  };

  HangarBay.prototype._beginForkFetch = function (npc, pick) {
    this._releaseForkliftPark(npc);
    npc.side = this._forkInboundSide();
    npc._fetchInbound = true;
    npc._fetchBay = pick.bay;
    npc._fetchItemId = pick.serviceItemId ?? null;
    npc.job = 'bringIn';
    npc.targetPile = pick.targetPile;
    this._applyTaskClaim(npc, 'fetchIn', null, pick.bay, pick.serviceItemId);
    // Reserve the checklist unit immediately so parallel same-type rows stay distinct
    if (pick.serviceItemId != null) {
      const pad = this._servicePad(pick.bay);
      const it = pad?.service?.items?.find((i) => i.id === pick.serviceItemId);
      if (it && it.status === 'pending') it.status = 'staging';
    }
    this._forkBeginLeaveHub(npc, this._doorX(npc.side));
    npc.state = 'toDoor';
  };

  HangarBay.prototype._createForklift = function (id, parkIndex) {
    const park = FORKLIFT_PARKS[parkIndex] || FORKLIFT_PARKS[0];
    const side = park.x < 0 ? -1 : 1;
    const npc = {
      id,
      kind: 'forklift',
      alive: true,
      parkIndex: park.index,
      x: park.x,
      y: park.y,
      vx: 0,
      facing: park.x <= 0 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
      state: 'atHub',
      stateT: rand(0.5, 2),
      side,
      job: 'idle',
      cargo: null,
      targetPile: null,
      lingerPile: null,
      claimKey: null,
      body: pick(['#c87830', '#b86028', '#d08840', '#c07038']),
      forkH: FORK_RAISED,
      forkPhase: null,
      targetSlot: null,
      _forkLift: null,
      // Draw yaw (8-dir); job/fork math still uses facing ±1
      visHeading: park.x <= 0 ? 0 : Math.PI,
      _visOct: park.x <= 0 ? 0 : 4,
    };
    this.npcs.push(npc);
  };

  HangarBay.prototype._forkParkTaken = function (index, exceptNpc = null) {
    if (index == null) return false;
    return this.npcs.some(
      (n) =>
        n.alive &&
        n.kind === 'forklift' &&
        n !== exceptNpc &&
        n.parkIndex === index
    );
  };

  HangarBay.prototype._claimForkliftPark = function (npc) {
    if (
      npc.parkIndex != null &&
      FORKLIFT_PARKS[npc.parkIndex] &&
      !this._forkParkTaken(npc.parkIndex, npc)
    ) {
      return FORKLIFT_PARKS[npc.parkIndex];
    }
    let best = null;
    let bestD = Infinity;
    for (const park of FORKLIFT_PARKS) {
      if (this._forkParkTaken(park.index, npc)) continue;
      const d = Math.hypot(npc.x - park.x, npc.y - park.y);
      if (d < bestD) {
        bestD = d;
        best = park;
      }
    }
    if (!best) {
      // Every stall claimed — sit at the geometrically nearest anyway
      best = FORKLIFT_PARKS.slice().sort(
        (a, b) =>
          Math.hypot(npc.x - a.x, npc.y - a.y) -
          Math.hypot(npc.x - b.x, npc.y - b.y)
      )[0];
    }
    npc.parkIndex = best.index;
    npc.facing = best.x <= 0 ? 1 : -1;
    return best;
  };

  HangarBay.prototype._releaseForkliftPark = function (npc) {
    npc.parkIndex = null;
  };

  HangarBay.prototype._forkGoToHub = function (npc) {
    const park = this._claimForkliftPark(npc);
    npc.state = 'toHub';
    return park;
  };

  HangarBay.prototype._parkForkliftAtHub = function (npc) {
    this._forkClearMerge(npc);
    const park = this._claimForkliftPark(npc);
    npc.x = park.x;
    npc.y = park.y;
    npc.facing = park.x <= 0 ? 1 : -1;
    npc.cargo = null;
    npc.job = 'idle';
    this._clearTaskClaim(npc);
    npc.state = 'atHub';
    npc.stateT = rand(0.8, 2.5);
  };

  HangarBay.prototype._spawnForklift = function () {
    /* no-op: fixed roster */
  };

  HangarBay.prototype._tryRerouteForkliftFromExit = function (npc) {
    // Already hauling outbound — finish leaving
    if (npc.cargo && npc.job === 'takeOut') return false;
    // Carrying inbound — finish that trip; don't dump it for takeOut
    if (npc.cargo) return false;
    // Empty truck leaving: snag outbound before exiting to fetch inbound
    const pick = this._pickForkliftJob(npc);
    if (pick.mode !== 'work' && pick.mode !== 'linger') return false;
    if (pick.job !== 'takeOut') return false;
    if (!this._forkAssignTakeOut(npc, pick)) return false;
    npc.state = pick.mode === 'linger' ? 'linger' : 'toPile';
    npc.stateT = 0.2;
    return true;
  };

  HangarBay.prototype._enumerateForkliftTasks = function (npc) {
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
      const weight = clears ? (this.bayClearing[p.bay] ? 18 : 12) : 6;
      tasks.push(...this._enumerateTakeOutSlotTasks(p, { weight, clears }, npc));
    }

    // Empty-bay sweep: haul leftover inbound south stock off-station too
    for (const p of southIn) {
      if (!this.bayClearing[p.bay] || !p.items.length) continue;
      tasks.push(
        ...this._enumerateTakeOutSlotTasks(p, { weight: 18, clears: true }, npc)
      );
    }

    const roomIn = southIn.filter(
      (p) => p.items.length < PILE_CAP && this._bayNeedsInbound(p.bay)
    );
    const roomAnyIn = southIn.filter((p) => p.items.length < PILE_CAP);
    const fullIn = southIn.filter((p) => p.items.length >= PILE_CAP);

    // Service cargo must land on its checklist bay only (never into a clearing bay)
    if (npc.cargo?.serviceBay != null) {
      const bay = npc.cargo.serviceBay;
      if (this.bayClearing[bay] || this._opsBays.has(bay)) {
        // Visit ended — restage is moot; dump to outbound or despawn restage
        this._restageServiceCargo(npc.cargo);
        const out = this._bayPile(bay, 'out', ROW.S) || this._pilesInRow(ROW.S).find((p) => p.lane === 'out');
        const cargoRef = npc.cargo.serviceKey || npc.cargo.id;
        if (out && out.items.length < PILE_CAP) {
          tasks.push({
            job: 'bringIn',
            targetPile: out,
            bay,
            cargoId: npc.cargo.id,
            serviceItemId: cargoRef,
            status: 'doable',
            weight: 16,
            clears: true,
          });
        } else if (roomAnyIn.length) {
          // Ops/clear blocked the service bay — still put the crate down somewhere
          const dest = pick(roomAnyIn);
          tasks.push({
            job: 'bringIn',
            targetPile: dest,
            bay: dest.bay,
            cargoId: npc.cargo.id,
            serviceItemId: cargoRef,
            status: 'doable',
            weight: 10,
            clears: true,
          });
        }
      } else {
        const dest = this._bayPile(bay, 'in', ROW.S);
        if (dest) {
          tasks.push({
            job: 'bringIn',
            targetPile: dest,
            bay,
            cargoId: npc.cargo.id,
            serviceItemId: npc.cargo.serviceKey || npc.cargo.id,
            status: dest.items.length < PILE_CAP ? 'doable' : 'blocked',
            weight: 14,
            clears: false,
          });
        }
      }
    } else if (npc.cargo) {
      // Already carrying: soft-cap must not block deposit (only new fetches).
      const cargoRef = npc.cargo.serviceKey || npc.cargo.id;
      if (roomAnyIn.length) {
        const prefer = roomIn.length ? roomIn : roomAnyIn;
        const dest = pick(prefer);
        tasks.push({
          job: 'bringIn',
          targetPile: dest,
          bay: dest.bay,
          cargoId: npc.cargo.id,
          serviceItemId: cargoRef,
          status: 'doable',
          weight: this._pressure < 0 ? 3 : 1.5,
          clears: false,
        });
      } else if (fullIn.length) {
        const dest = pick(fullIn);
        tasks.push({
          job: 'bringIn',
          targetPile: dest,
          bay: dest.bay,
          cargoId: npc.cargo.id,
          serviceItemId: cargoRef,
          status: 'blocked',
          weight: 2,
          clears: false,
        });
      }
    } else {
      // Empty truck: one fetch task per pending checklist item (parallel staging)
      const fetches = this._enumerateFetchInCandidates(npc);
      for (const f of fetches) {
        tasks.push({
          job: 'fetchIn',
          targetPile: f.targetPile,
          bay: f.bay,
          serviceItemId: f.serviceItemId,
          status: 'doable',
          weight: 5 + Math.min(4, f.pendingCount || 1),
          clears: false,
        });
      }
    }

    return tasks;
  };

  HangarBay.prototype._pickForkliftJob = function (npc) {
    const tasks = this._filterUnclaimed(this._enumerateForkliftTasks(npc), npc);
    let pool = tasks;
    if (npc.cargo) {
      pool = tasks.filter((t) => t.job === 'bringIn');
    } else {
      const take = tasks.filter((t) => t.job === 'takeOut');
      const fetch = tasks.filter((t) => t.job === 'fetchIn');
      // Empty truck: always prefer outbound before leaving to fetch inbound
      if (take.length) {
        const clearing = take.filter((t) => t.clears);
        pool = clearing.length ? clearing : take;
      } else {
        pool = fetch;
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

    return { mode: 'idle' };
  };

  HangarBay.prototype._forkAssignTakeOut = function (npc, pick) {
    if (!npc || !pick?.targetPile) return false;
    npc.job = 'takeOut';
    npc.targetPile = pick.targetPile;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.cargo = null;
    npc.targetSlot =
      pick.targetSlot != null && pick.targetSlot >= 0
        ? pick.targetSlot
        : this._forkResolveSlot(npc, pick.targetPile);
    if (npc.targetSlot == null || npc.targetSlot < 0) {
      this._clearTaskClaim(npc);
      return false;
    }
    this._forkClearRoute(npc);
    this._applyTaskClaim(
      npc,
      'takeOut',
      pick.targetPile,
      pick.bay ?? pick.targetPile.bay,
      npc.targetSlot
    );
    return true;
  };

  HangarBay.prototype._forkApproach = function (pile, slotIdx = null) {
    if (!pile) return { x: 0, y: BAY.PATH_Y, facing: 1 };
    const slot = slotIdx != null ? slotIdx : 0;
    return this._forkApproachForSlot(pile, slot);
  };

  HangarBay.prototype._forkLaneWest = function (slotIdx) {
    return (PILE_SLOTS[slotIdx]?.ox ?? 0) < 0;
  };

  HangarBay.prototype._forkApproachForSlot = function (pile, slotIdx) {
    const w = this._slotWorld(pile, slotIdx);
    const west = this._forkLaneWest(slotIdx);
    return {
      x: w.x + (west ? -FORK_LANE_OFFSET : FORK_LANE_OFFSET),
      y: Math.max(pile.y + FORK_APPROACH_SOUTH, BAY.PATH_Y - 8),
      facing: west ? 1 : -1,
    };
  };

  HangarBay.prototype._forkNeedsOvershoot = function (npc, ap) {
    if (!npc || !ap) return false;
    if (ap.facing > 0) return npc.x > ap.x + 4;
    return npc.x < ap.x - 4;
  };

  HangarBay.prototype._forkOvershootPoint = function (ap) {
    if (ap.facing > 0) {
      // Dest left / west lane — if we arrived from the east, pass west of the stop,
      // then turn around and approach facing east into the slot.
      return { x: ap.x - FORK_OVERSHOOT, y: ap.y };
    }
    // Dest right / east lane — if we arrived from the west, pass east of the stop,
    // then turn around and approach facing west into the slot.
    return { x: ap.x + FORK_OVERSHOOT, y: ap.y };
  };

  HangarBay.prototype._forkRouteTarget = function (npc, pile, slotIdx, ap) {
    const key = `${pile?.id ?? '?'}:${slotIdx}`;
    if (npc._forkRouteKey !== key) {
      npc._forkRouteKey = key;
      npc._forkApPhase = null;
      npc._forkOvershoot = null;
    }
    if (!npc._forkApPhase) {
      if (this._forkNeedsOvershoot(npc, ap)) {
        npc._forkApPhase = 'overshoot';
        npc._forkOvershoot = this._forkOvershootPoint(ap);
      } else {
        npc._forkApPhase = 'approach';
        npc._forkOvershoot = null;
      }
    }
    if (npc._forkApPhase === 'overshoot' && npc._forkOvershoot) {
      return npc._forkOvershoot;
    }
    return ap;
  };

  HangarBay.prototype._forkClearRoute = function (npc) {
    if (!npc) return;
    npc._forkApPhase = null;
    npc._forkOvershoot = null;
    npc._forkRouteKey = null;
  };

  HangarBay.prototype._forkBeginLeaveHub = function (npc, destX = null) {
    const dy = Math.max(0, npc.y - BAY.PATH_Y);
    // Already on the roadway — no merge needed
    if (dy < 4) {
      npc._forkMerge = null;
      return;
    }
    const toward = destX != null ? destX - npc.x : 0;
    const dir = Math.sign(toward) || npc.facing || 1;
    // Keep path length ≈ one truck length when possible
    const maxAlong =
      dy >= FORK_TRUCK_LEN
        ? 0
        : Math.sqrt(FORK_TRUCK_LEN * FORK_TRUCK_LEN - dy * dy);
    const along = dir * Math.min(maxAlong, Math.abs(toward) || maxAlong);
    npc._forkMerge = { x: npc.x + along, y: BAY.PATH_Y };
  };

  HangarBay.prototype._forkClearMerge = function (npc) {
    if (npc) npc._forkMerge = null;
  };

  HangarBay.prototype._forkDriveMerge = function (npc, dt, speed = 40) {
    if (!npc._forkMerge) return true;
    npc._lockFacing = false;
    if (this._moveToward(npc, npc._forkMerge.x, npc._forkMerge.y, speed, dt)) {
      npc._forkMerge = null;
      return true;
    }
    return false;
  };

  HangarBay.prototype._forkCreepForSlot = function (pile, slotIdx, npc = null) {
    const w = this._slotWorld(pile, slotIdx);
    const ap = this._forkApproachForSlot(pile, slotIdx);
    if (npc) npc.facing = ap.facing;
    let cargo = null;
    if (npc?.job === 'bringIn' && (npc.cargo || npc._forkLift?.cargo)) {
      cargo = npc.cargo || npc._forkLift.cargo;
    } else if (npc?.job === 'takeOut' && pile) {
      cargo = this._forkItemAtSlot(pile, slotIdx);
    }
    const pos = this._forkTruckPosForCargoCenter(
      w.x,
      w.y,
      npc?.facing ?? ap.facing,
      cargo,
      FORK_LOWERED
    );
    // Never back south of the approach lane — tine math can push tall crates past it.
    pos.y = Math.min(pos.y, ap.y - 2);
    return pos;
  };

  HangarBay.prototype._forkItemAtSlot = function (pile, slotIdx) {
    if (!pile?.items?.length) return null;
    for (const item of pile.items) {
      let slot = item.pileSlot;
      if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
        slot = this._pileAssignSlotIfMissing(pile, item);
      }
      if (slot === slotIdx) return item;
    }
    return null;
  };

  HangarBay.prototype._forkTineLocal = function (forkH = FORK_LOWERED) {
    const forkDrop = forkH * FORK_DROP_VIS;
    return {
      tipX: FORK_TINE_TIP_X,
      tineY: FORK_TINE_Y_BASE + forkDrop * 0.35,
    };
  };

  HangarBay.prototype._forkTruckPosForCargoCenter = function (cx, cy, facing, cargo = null, forkH = FORK_LOWERED) {
    const face = facing >= 0 ? 1 : -1;
    const tine = this._forkTineLocal(forkH);
    const h = cargo?.h ?? 8;
    return {
      x: cx - face * tine.tipX,
      y: cy + h * 0.5 - tine.tineY,
    };
  };

  HangarBay.prototype._forkCargoCenterFromTruck = function (npc, cargo = null) {
    const c = cargo || npc.cargo || npc._forkLift?.cargo;
    const tine = this._forkTineLocal(npc.forkH ?? FORK_RAISED);
    const h = c?.h ?? 8;
    // Ride the *drawn* fork tips (8-dir visHeading), not logic facing ±1 —
    // otherwise turnarounds snap the box while the prongs swing around.
    const oct = this._crewVisOctant(npc);
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const alongScale = 0.72 + 0.28 * Math.abs(fx);
    const tipAlong = tine.tipX * alongScale;
    return {
      x: npc.x + fx * tipAlong,
      y: npc.y + fy * tipAlong + tine.tineY - h * 0.5,
    };
  };

  HangarBay.prototype._forkResolveSlot = function (npc, pile) {
    if (!pile) return -1;
    if (npc.job === 'takeOut') {
      // Keep a pre-claimed quadrant if that crate is still there
      if (npc.targetSlot != null && npc.targetSlot >= 0 && npc.targetSlot < PILE_SLOTS.length) {
        const stillThere = pile.items.some((item) => {
          let slot = item.pileSlot;
          if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
            slot = this._pileAssignSlotIfMissing(pile, item);
          }
          return slot === npc.targetSlot;
        });
        if (stillThere) return npc.targetSlot;
      }
      let bestSlot = PILE_SLOTS.length;
      for (const item of pile.items) {
        let slot = item.pileSlot;
        if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
          slot = this._pileAssignSlotIfMissing(pile, item);
        }
        // Skip slots another forklift already claimed for takeOut
        const stolen = this.npcs.some(
          (n) =>
            n !== npc &&
            n.alive &&
            n.job === 'takeOut' &&
            n.targetPile?.id === pile.id &&
            n.targetSlot === slot
        );
        if (stolen) continue;
        if (slot < bestSlot) bestSlot = slot;
      }
      if (bestSlot >= PILE_SLOTS.length) return -1;
      return bestSlot;
    }
    if (npc.job === 'bringIn' && npc.cargo) {
      return this._forkClaimDropSlot(npc, pile);
    }
    return 0;
  };

  HangarBay.prototype._forkClaimDropSlot = function (npc, pile) {
    if (!npc?.cargo || !pile) return -1;
    const used = this._pileReservedSlots(pile, npc);
    let slot = npc.targetSlot;
    if (slot == null || slot < 0) slot = npc.cargo.pileSlot;
    if (slot != null && slot >= 0 && slot < PILE_SLOTS.length && !used.has(slot)) {
      npc.targetSlot = slot;
      npc.cargo.pileSlot = slot;
      return slot;
    }
    slot = this._pileFreeSlot(pile, npc);
    if (slot < 0) {
      npc.targetSlot = null;
      npc.cargo.pileSlot = null;
      return -1;
    }
    npc.targetSlot = slot;
    npc.cargo.pileSlot = slot;
    return slot;
  };

  HangarBay.prototype._forkAssignBringInDest = function (npc, pile) {
    if (!npc || !pile) return -1;
    const prev = npc.targetPile?.id;
    npc.job = 'bringIn';
    npc.targetPile = pile;
    npc.lingerPile = null;
    if (prev !== pile.id) {
      npc.targetSlot = null;
      if (npc.cargo) npc.cargo.pileSlot = null;
      this._forkClearRoute(npc);
    }
    return this._forkClaimDropSlot(npc, pile);
  };

  HangarBay.prototype._forkBeginPileWork = function (npc, pile) {
    let slotIdx = npc.targetSlot;
    if (slotIdx == null || slotIdx < 0 || slotIdx >= PILE_SLOTS.length) {
      slotIdx = this._forkResolveSlot(npc, pile);
    } else if (npc.job === 'bringIn' && npc.cargo) {
      // Re-validate claim; keep same slot when still free
      slotIdx = this._forkClaimDropSlot(npc, pile);
    }
    if (slotIdx < 0) {
      this._forkClearRoute(npc);
      if (npc.cargo) this._forkQueueAtDest(npc, pile);
      else {
        this._clearTaskClaim(npc);
        this._forkGoToHub(npc);
      }
      return;
    }
    this._forkClearRoute(npc);
    npc.targetSlot = slotIdx;
    if (npc.job === 'bringIn' && npc.cargo) {
      npc.cargo.pileSlot = slotIdx;
    }
    const ap = this._forkApproachForSlot(pile, slotIdx);
    npc.facing = ap.facing;
    npc.forkH = FORK_RAISED;
    npc.forkPhase = 'lower';
    npc._forkLift = null;
    npc._forkWorkT = 0;
    npc._lockFacing = true;
    npc.state = 'work';
    npc.stateT = 0;
  };

  HangarBay.prototype._forkCargoWorldPos = function (npc) {
    const lift = npc._forkLift;
    if (lift?.dropping) {
      return { x: lift.x, y: lift.y };
    }
    if (lift) {
      const t = 1 - (npc.forkH ?? FORK_RAISED);
      const carry = this._forkCarryOffset(npc);
      return {
        x: lift.x + (npc.x + carry.x - lift.x) * t,
        y: lift.y + (npc.y + carry.y - lift.y) * t,
      };
    }
    if (npc.cargo) {
      const c = this._forkCarryOffset(npc);
      return { x: npc.x + c.x, y: npc.y + c.y };
    }
    return null;
  };

  HangarBay.prototype._forkCarryOffset = function (npc) {
    const center = this._forkCargoCenterFromTruck(npc);
    return { x: center.x - npc.x, y: center.y - npc.y };
  };

  HangarBay.prototype._forkFinishTakeOut = function (npc) {
    this._clearTaskClaim(npc);
    npc.side = this._forkOutboundSide();
    npc.forkPhase = null;
    npc._forkLift = null;
    npc.targetSlot = null;
    npc.state = 'toDoor';
    npc._haulOff = true;
  };

  HangarBay.prototype._updateForkWork = function (npc, dt) {
    const pile = this._pileById(npc.targetPile?.id);
    let slotIdx = npc.targetSlot;
    if (slotIdx == null || slotIdx < 0 || slotIdx >= PILE_SLOTS.length) {
      slotIdx = this._forkResolveSlot(npc, pile);
      npc.targetSlot = slotIdx >= 0 ? slotIdx : null;
    }
    if (slotIdx == null || slotIdx < 0) {
      if (npc.cargo) this._forkQueueAtDest(npc, pile);
      else {
        npc.forkPhase = null;
        this._clearTaskClaim(npc);
        this._forkGoToHub(npc);
      }
      return;
    }

    npc._forkWorkT = (npc._forkWorkT || 0) + dt;
    // Watchdog: abort stuck lower/creep animations back to queue or hub
    if (npc._forkWorkT > 5.5) {
      npc.forkPhase = null;
      npc._forkWorkT = 0;
      if (npc._forkLift?.dropping && npc._forkLift.cargo) {
        npc.cargo = npc._forkLift.cargo;
        npc._forkLift = null;
      }
      if (npc.cargo) this._forkQueueAtDest(npc, pile);
      else if (npc.job === 'takeOut' && (npc.cargo || npc._forkLift?.cargo)) {
        if (npc._forkLift?.cargo) {
          npc.cargo = npc._forkLift.cargo;
          npc._forkLift = null;
        }
        this._forkFinishTakeOut(npc);
      } else {
        this._clearTaskClaim(npc);
        npc._forkLift = null;
        this._forkGoToHub(npc);
      }
      return;
    }

    const creep = pile ? this._forkCreepForSlot(pile, slotIdx, npc) : null;
    const back = pile ? this._forkApproachForSlot(pile, slotIdx) : null;

    switch (npc.forkPhase) {
      case 'lower': {
        if (back?.facing) npc.facing = back.facing;
        npc.forkH = Math.min(
          FORK_LOWERED,
          (npc.forkH ?? FORK_RAISED) + dt * FORK_ANIM_SPEED
        );
        if (npc.forkH >= FORK_LOWERED - 0.02) {
          npc.forkH = FORK_LOWERED;
          npc.forkPhase = 'creepIn';
        }
        break;
      }
      case 'creepIn': {
        if (!creep) {
          npc.forkPhase = 'creepOut';
          break;
        }
        if (back?.facing) npc.facing = back.facing;
        if (this._moveToward(npc, creep.x, creep.y, 22, dt)) {
          if (npc.job === 'takeOut' && pile?.items?.length) {
            const item = this._forkItemAtSlot(pile, slotIdx);
            const lifted = item
              ? this._pileRemove(pile, item)
              : this._pilePop(pile);
            if (lifted) {
              if (lifted.serviceKey && pile.lane === 'in') {
                this._restageServiceCargo(lifted);
                lifted.serviceKey = null;
                lifted.serviceBay = null;
              }
              const w = this._slotWorld(pile, slotIdx);
              npc._forkLift = { cargo: lifted, x: w.x, y: w.y };
            }
            npc.forkPhase = 'raise';
          } else if (npc.job === 'bringIn' && npc.cargo && pile) {
            const w = this._slotWorld(pile, slotIdx);
            const from = this._forkCargoCenterFromTruck(npc, npc.cargo);
            npc._forkLift = {
              cargo: npc.cargo,
              dropping: true,
              fromX: from.x,
              fromY: from.y,
              toX: w.x,
              toY: w.y,
              x: from.x,
              y: from.y,
              dropT: 0,
            };
            npc.cargo = null;
            npc.forkPhase = 'drop';
          } else {
            npc.forkPhase = 'creepOut';
          }
        }
        break;
      }
      case 'drop': {
        if (back?.facing) npc.facing = back.facing;
        const lift = npc._forkLift;
        if (pile && lift?.dropping && lift.cargo) {
          lift.dropT = Math.min(1, (lift.dropT || 0) + dt * 4.2);
          const e = lift.dropT * lift.dropT * (3 - 2 * lift.dropT);
          lift.x = lift.fromX + (lift.toX - lift.fromX) * e;
          lift.y = lift.fromY + (lift.toY - lift.fromY) * e;
          if (lift.dropT < 1) break;
          if (pile.lane === 'out' && lift.cargo.serviceKey) {
            lift.cargo.serviceKey = null;
            lift.cargo.serviceBay = null;
          }
          lift.cargo.pileSlot = slotIdx;
          if (this._pilePush(pile, lift.cargo, npc)) {
            npc._forkLift = null;
            npc.forkPhase = 'raise';
          } else {
            npc.cargo = lift.cargo;
            npc._forkLift = null;
            npc.forkPhase = null;
            this._forkQueueAtDest(npc, pile);
          }
        } else if (pile && npc.cargo) {
          // Fallback if drop handoff wasn't armed
          npc.cargo.pileSlot = slotIdx;
          if (this._pilePush(pile, npc.cargo, npc)) {
            npc.cargo = null;
            npc.forkPhase = 'raise';
          } else {
            npc.forkPhase = null;
            this._forkQueueAtDest(npc, pile);
          }
        } else {
          npc.forkPhase = 'raise';
        }
        break;
      }
      case 'raise': {
        npc.forkH = Math.max(
          FORK_RAISED,
          (npc.forkH ?? FORK_LOWERED) - dt * FORK_ANIM_SPEED
        );
        if (npc.forkH <= FORK_RAISED + 0.02) {
          npc.forkH = FORK_RAISED;
          if (npc._forkLift?.cargo) {
            npc.cargo = npc._forkLift.cargo;
            npc._forkLift = null;
          }
          npc.forkPhase = 'creepOut';
        }
        break;
      }
      case 'creepOut': {
        if (!back) {
          npc.forkPhase = null;
          npc._forkWorkT = 0;
          if (npc.job === 'takeOut' && npc.cargo) this._forkFinishTakeOut(npc);
          else if (npc.job === 'bringIn') this._forkAfterBringInDrop(npc);
          else {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
          }
          break;
        }
        npc.facing = back.facing;
        if (this._moveToward(npc, back.x, back.y, 26, dt)) {
          npc.forkPhase = null;
          npc.targetSlot = null;
          npc._forkWorkT = 0;
          if (npc.job === 'takeOut' && npc.cargo) {
            this._forkFinishTakeOut(npc);
          } else if (npc.job === 'bringIn') {
            this._forkAfterBringInDrop(npc);
          } else {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
          }
        }
        break;
      }
      default:
        npc.forkPhase = null;
        npc._forkWorkT = 0;
        this._clearTaskClaim(npc);
        this._forkGoToHub(npc);
    }
  };

  HangarBay.prototype._forkQueueAtDest = function (npc, pile = null) {
    const dest =
      this._pileById(pile?.id) ||
      this._pileById(npc.targetPile?.id) ||
      this._pileById(npc.lingerPile?.id) ||
      (npc.cargo?.serviceBay != null
        ? this._bayPile(npc.cargo.serviceBay, 'in', ROW.S)
        : null) ||
      this._pilesInRow(ROW.S).find((p) => p.lane === 'in' && p.items.length < PILE_CAP) ||
      this._pilesInRow(ROW.S).find((p) => p.lane === 'in');
    if (dest && npc.targetPile?.id !== dest.id) {
      npc.targetSlot = null;
      if (npc.cargo) npc.cargo.pileSlot = null;
      this._forkClearRoute(npc);
    }
    npc.job = 'bringIn';
    npc.targetPile = dest;
    npc.lingerPile = dest;
    const free = dest ? this._forkClaimDropSlot(npc, dest) : -1;
    npc.forkPhase = null;
    npc.forkH = FORK_RAISED;
    npc._forkLift = null;
    npc._forkWorkT = 0;
    npc._lockFacing = false;
    npc._fetchInbound = false;
    npc._fetchItemId = null;
    npc._haulOff = false;
    this._forkClearRoute(npc);
    if (dest && free >= 0) {
      // Only hold the exclusive bringIn claim when the pile can actually accept cargo.
      const key = this._taskClaimKey('bringIn', dest, dest.bay);
      const others = this._claimedTaskKeys(npc);
      if (!others.has(key)) {
        this._applyTaskClaim(npc, 'bringIn', dest, dest.bay);
      } else if (npc.claimKey !== key) {
        npc.claimKey = null;
      }
    } else {
      // Full / missing dest — release claim so another truck (or crane clear) can proceed
      this._clearTaskClaim(npc);
    }
    npc.state = 'linger';
    npc.stateT = 0.35;
  };

  HangarBay.prototype._forkAfterBringInDrop = function (npc) {
    this._clearTaskClaim(npc);
    // Cargo should already be deposited; never silently destroy a still-held crate
    if (npc.cargo) {
      this._forkQueueAtDest(npc);
      return;
    }
    const pick = this._pickForkliftJob(npc);
    if (pick.mode === 'work' && pick.job === 'fetchIn') {
      this._beginForkFetch(npc, pick);
      return;
    }
    if (pick.mode === 'work' || pick.mode === 'linger') {
      if (pick.job === 'takeOut') {
        if (!this._forkAssignTakeOut(npc, pick)) {
          this._forkGoToHub(npc);
          return;
        }
      } else {
        npc.job = pick.job;
        npc.targetPile = pick.targetPile;
        npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
        this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
      }
      npc.state = pick.mode === 'linger' ? 'linger' : 'toPile';
      npc.stateT = 0.3;
      return;
    }
    this._forkGoToHub(npc);
  };

  HangarBay.prototype._forkInboundSide = function () {
    return -1;
  };

  HangarBay.prototype._forkOutboundSide = function () {
    return 1;
  };

  HangarBay.prototype._forkSetApproachFacing = function (npc, ap) {
    if (!ap) {
      npc._lockFacing = false;
      return;
    }
    const dist = Math.hypot(npc.x - ap.x, npc.y - ap.y);
    const correctSide =
      ap.facing > 0 ? npc.x <= ap.x + 3 : npc.x >= ap.x - 3;
    if (dist < 14 && correctSide) {
      npc.facing = ap.facing;
      npc._lockFacing = true;
    } else {
      npc._lockFacing = false;
    }
  };

  HangarBay.prototype._pickSouthPileForFork = function (wantCargo) {
    const south = this._pilesInRow(ROW.S);
    if (wantCargo) {
      // Export only from outbound (right) columns
      const out = south.filter((p) => p.lane === 'out' && p.items.length > 0);
      return out.length ? pick(out) : null;
    }
    // Import only to inbound (left) columns
    const inn = south.filter((p) => p.lane === 'in' && p.items.length < PILE_CAP);
    return inn.length ? pick(inn) : null;
  };

  HangarBay.prototype._updateForklift = function (npc, dt, hazard) {
    const ox = npc.x;
    const oy = npc.y;
    npc.phase += dt * 8;
    npc.stateT -= dt;

    if (npc.state === 'flinch') {
      npc.x += Math.sin(npc.phase * 4) * 14 * dt;
      npc.y += Math.cos(npc.phase * 5) * 4 * dt;
      if (npc.stateT <= 0) npc.state = npc.resumeState || 'toPile';
      this._forkUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
      return;
    }

    const weaponHot = this._hazard.weapons;
    const hazardX = weaponHot > 0.2 ? this._weaponWash.x : this._shipPos.x;
    const hazardY = weaponHot > 0.2 ? this._weaponWash.y : this._shipPos.y;
    if (
      (npc.state === 'toPile' || npc.state === 'work' || npc.state === 'linger' || npc.state === 'enter' || npc.state === 'atHub') &&
      weaponHot > 0.45 &&
      Math.hypot(npc.x - hazardX, npc.y - hazardY) < 110 &&
      Math.random() < weaponHot * 0.1
    ) {
      npc.resumeState = npc.state;
      npc.state = 'flinch';
      npc.stateT = rand(0.35, 0.7);
      this._forkUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
      return;
    }

    switch (npc.state) {
      case 'atHub': {
        const park = this._claimForkliftPark(npc);
        // Stay put until actually seated in the stall — otherwise a truck still
        // returning near the roadway can "leave" and bounce straight home.
        const atStall = this._moveToward(npc, park.x, park.y, 28, dt);
        if (!atStall || npc.stateT > 0) break;
        // Carrying freight must never idle at hub — queue at dest
        if (npc.cargo) {
          this._releaseForkliftPark(npc);
          this._forkQueueAtDest(npc);
          break;
        }
        const pick = this._pickForkliftJob(npc);
        if (pick.mode === 'work' || pick.mode === 'linger') {
          this._releaseForkliftPark(npc);
          if (pick.job === 'fetchIn') {
            this._beginForkFetch(npc, pick);
            break;
          }
          if (pick.job === 'takeOut') {
            if (!this._forkAssignTakeOut(npc, pick)) {
              this._claimForkliftPark(npc);
              npc.stateT = rand(0.6, 1.8);
              break;
            }
          } else {
            npc.job = pick.job;
            npc.targetPile = pick.targetPile;
            npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
          }
          const destX =
            pick.targetPile?.x ??
            (pick.bay != null ? this._bayPile(pick.bay, 'in', ROW.S)?.x : null);
          this._forkBeginLeaveHub(npc, destX);
          // Always drive the job — don't linger-redecide at the roadway merge
          npc.state = 'toPile';
          npc.stateT = 0.3;
        } else {
          npc.stateT = rand(0.6, 1.8);
        }
        break;
      }
      case 'enter': {
        const ix = this._insideX(npc.side);
        if (this._moveToward(npc, ix, BAY.PATH_Y, 40, dt)) {
          if (npc.cargo) {
            const pick = this._pickForkliftJob(npc);
            if (pick.mode === 'work' && pick.job === 'bringIn') {
              this._forkAssignBringInDest(npc, pick.targetPile);
              this._applyTaskClaim(npc, 'bringIn', pick.targetPile, pick.bay ?? pick.targetPile?.bay);
              npc.state = 'toPile';
              npc.stateT = 0.4;
            } else if (pick.mode === 'linger') {
              this._forkQueueAtDest(npc, pick.targetPile);
            } else {
              // Dest claimed/full — wait in line at approach, not hub
              this._forkQueueAtDest(npc);
            }
            break;
          }
          const pick = this._pickForkliftJob(npc);
          if (pick.mode === 'idle' || pick.mode === 'despawn') {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
            break;
          }
          if (pick.job === 'fetchIn') {
            this._beginForkFetch(npc, pick);
            break;
          }
          if (pick.job === 'takeOut') {
            if (!this._forkAssignTakeOut(npc, pick)) {
              this._forkGoToHub(npc);
              break;
            }
          } else {
            npc.job = pick.job;
            npc.targetPile = pick.targetPile;
            npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
          }
          npc.state = pick.mode === 'linger' ? 'linger' : 'toPile';
          npc.stateT = 0.4;
        }
        break;
      }
      case 'toPile': {
        if (!this._forkDriveMerge(npc, dt)) break;
        let p = this._pileById(npc.targetPile?.id);
        if (!p) {
          if (npc.cargo) this._forkQueueAtDest(npc);
          else {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
          }
          break;
        }
        if (npc.job === 'bringIn' && p.items.length >= PILE_CAP) {
          const pick = this._pickForkliftJob(npc);
          if (pick.mode === 'work' && pick.job === 'bringIn') {
            npc.targetPile = pick.targetPile;
            npc.targetSlot = null;
            this._applyTaskClaim(npc, 'bringIn', pick.targetPile, pick.bay ?? pick.targetPile?.bay);
            p = this._pileById(npc.targetPile?.id);
          } else if (pick.mode === 'linger' || npc.cargo) {
            this._forkQueueAtDest(npc, pick.targetPile || p);
            break;
          } else if (pick.mode === 'work' && pick.job === 'fetchIn') {
            this._clearTaskClaim(npc);
            this._beginForkFetch(npc, pick);
            break;
          } else if (pick.mode === 'work') {
            if (pick.job === 'takeOut') {
              if (!this._forkAssignTakeOut(npc, pick)) {
                this._clearTaskClaim(npc);
                this._forkGoToHub(npc);
                break;
              }
            } else {
              npc.job = pick.job;
              npc.targetPile = pick.targetPile;
              npc.targetSlot = null;
              this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
            }
            p = this._pileById(npc.targetPile?.id);
          } else {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
            break;
          }
          if (!p) {
            if (npc.cargo) this._forkQueueAtDest(npc);
            else this._forkGoToHub(npc);
            break;
          }
        }
        if (npc.job === 'bringIn' && npc.cargo) {
          if (npc.targetSlot == null || npc.targetSlot < 0) {
            this._forkClaimDropSlot(npc, p);
          }
        } else if (npc.targetSlot == null || npc.targetSlot < 0) {
          npc.targetSlot = this._forkResolveSlot(npc, p);
        }
        // Empty takeOut with nothing left to claim — don't cruise the roadway then bounce
        if (
          npc.job === 'takeOut' &&
          !npc.cargo &&
          (npc.targetSlot == null || npc.targetSlot < 0)
        ) {
          this._clearTaskClaim(npc);
          this._forkGoToHub(npc);
          break;
        }
        if (npc.job === 'bringIn' && npc.cargo && (npc.targetSlot == null || npc.targetSlot < 0)) {
          this._forkQueueAtDest(npc, p);
          break;
        }
        const slot = npc.targetSlot >= 0 ? npc.targetSlot : 0;
        const ap = this._forkApproach(p, slot);
        const route = this._forkRouteTarget(npc, p, slot, ap);
        if (npc._forkApPhase === 'overshoot') {
          npc._lockFacing = false;
          if (this._moveToward(npc, route.x, route.y, 38, dt)) {
            npc._forkApPhase = 'approach';
            npc._forkOvershoot = null;
          }
          break;
        }
        this._forkSetApproachFacing(npc, ap);
        const arrived = this._moveToward(npc, ap.x, ap.y, 38, dt);
        if (arrived) {
          npc.facing = ap.facing;
          npc._lockFacing = true;
          this._forkBeginPileWork(npc, p);
        }
        break;
      }
      case 'linger': {
        if (!this._forkDriveMerge(npc, dt)) break;
        const p = this._pileById(npc.lingerPile?.id || npc.targetPile?.id);
        if (npc.job === 'bringIn' && npc.cargo && p) {
          if (npc.targetSlot == null || npc.targetSlot < 0) {
            this._forkClaimDropSlot(npc, p);
          }
        } else if (npc.targetSlot == null || npc.targetSlot < 0) {
          npc.targetSlot = p ? this._forkResolveSlot(npc, p) : null;
        }
        const slot = npc.targetSlot >= 0 ? npc.targetSlot : 0;
        const ap = this._forkApproach(p, slot);
        const route = this._forkRouteTarget(npc, p, slot, ap);
        if (npc._forkApPhase === 'overshoot') {
          npc._lockFacing = false;
          this._moveToward(npc, route.x, route.y, 28, dt);
          if (Math.hypot(npc.x - route.x, npc.y - route.y) < 2.5) {
            npc._forkApPhase = 'approach';
            npc._forkOvershoot = null;
          }
        } else {
          this._forkSetApproachFacing(npc, ap);
          this._moveToward(npc, ap.x, ap.y, 28, dt);
        }
        if (npc.stateT > 0) break;
        const pick = this._pickForkliftJob(npc);
        if (npc.cargo) {
          if (pick.mode === 'work' && pick.job === 'bringIn') {
            this._forkAssignBringInDest(npc, pick.targetPile);
            this._applyTaskClaim(npc, 'bringIn', pick.targetPile, pick.bay ?? pick.targetPile?.bay);
            npc.state = 'toPile';
          } else {
            // Stay in line at dest until claim/room opens
            this._forkQueueAtDest(npc, pick.targetPile || p);
            npc.stateT = 0.55;
          }
          break;
        }
        if (pick.mode === 'work') {
          if (pick.job === 'fetchIn') {
            this._clearTaskClaim(npc);
            this._beginForkFetch(npc, pick);
            break;
          }
          if (pick.job === 'takeOut') {
            if (!this._forkAssignTakeOut(npc, pick)) {
              this._clearTaskClaim(npc);
              this._forkGoToHub(npc);
              break;
            }
          } else {
            npc.job = pick.job;
            npc.targetPile = pick.targetPile;
            npc.targetSlot = null;
            npc.lingerPile = null;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
          }
          npc.state = 'toPile';
        } else if (pick.mode === 'linger') {
          if (pick.job === 'takeOut') {
            if (!this._forkAssignTakeOut(npc, pick)) {
              this._clearTaskClaim(npc);
              this._forkGoToHub(npc);
              break;
            }
          } else {
            npc.lingerPile = pick.targetPile;
            npc.targetPile = pick.targetPile;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
          }
          npc.stateT = 0.55;
        } else {
          this._clearTaskClaim(npc);
          this._forkGoToHub(npc);
        }
        break;
      }
      case 'work': {
        if (npc.forkPhase) {
          this._updateForkWork(npc, dt);
          break;
        }
        this._clearTaskClaim(npc);
        this._forkGoToHub(npc);
        break;
      }
      case 'toHub': {
        this._forkClearMerge(npc);
        npc._lockFacing = false;
        if (npc.cargo) {
          this._releaseForkliftPark(npc);
          this._forkQueueAtDest(npc);
          break;
        }
        const park = this._claimForkliftPark(npc);
        if (this._moveToward(npc, park.x, park.y, 40, dt)) {
          npc.facing = park.x <= 0 ? 1 : -1;
          npc.state = 'atHub';
          npc.stateT = rand(0.5, 2);
        }
        break;
      }
      case 'toDoor': {
        if (!this._forkDriveMerge(npc, dt)) break;
        npc._lockFacing = false;
        const rerouteEvery = npc.cargo ? 0.35 : 0.12;
        npc._rerouteT = (npc._rerouteT || 0) + dt;
        if (!npc._haulOff && !npc._fetchInbound && npc._rerouteT >= rerouteEvery) {
          npc._rerouteT = 0;
          if (this._tryRerouteForkliftFromExit(npc)) break;
        }
        // Abandon empty fetch only when the trip is truly dead — not staging quirks
        // (those were bouncing trucks home the instant they merged onto PATH_Y).
        if (npc._fetchInbound && !npc.cargo) {
          const bay = npc._fetchBay;
          const pad = bay != null ? this._servicePad(bay) : null;
          const itemId = npc._fetchItemId;
          const item =
            itemId != null
              ? pad?.service?.items?.find((it) => it.id === itemId)
              : null;
          const bayBlocked =
            bay == null || this.bayClearing[bay] || this._opsBays.has(bay);
          const visitGone =
            !pad?.visitorId ||
            !!pad.seq ||
            pad.service?.phase !== 'active';
          const itemDead = itemId != null && (!item || item.status === 'done');
          const pileFull =
            (this._bayPile(bay, 'in', ROW.S)?.items.length ?? PILE_CAP) >=
            PILE_CAP;
          if (bayBlocked || visitGone || itemDead || pileFull) {
            this._reopenServiceItemIfOrphan(pad, itemId);
            this._clearTaskClaim(npc);
            npc._fetchInbound = false;
            npc._fetchBay = null;
            npc._fetchItemId = null;
            this._forkGoToHub(npc);
            break;
          }
        }
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX, BAY.PATH_Y, 40, dt)) {
          npc.state = 'exit';
        }
        break;
      }
      case 'exit': {
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX + npc.side * 55, BAY.PATH_Y, 42, dt)) {
          if (npc._haulOff && npc.cargo) {
            // Fake offscreen vanish
            this._restageServiceCargo(npc.cargo);
            npc.cargo = null;
            npc._haulOff = false;
            npc.state = 'enter';
            break;
          }
          if (npc._fetchInbound) {
            const fetchBay = npc._fetchBay;
            const fetchItemId = npc._fetchItemId;
            npc.cargo = this._makeSmartInboundCargo(fetchBay, fetchItemId);
            npc._fetchInbound = false;
            npc._fetchBay = null;
            npc._fetchItemId = null;
            this._clearTaskClaim(npc);
            if (npc.cargo) {
              npc.job = 'bringIn';
              const bay =
                npc.cargo.serviceBay != null ? npc.cargo.serviceBay : fetchBay;
              if (bay != null) {
                const dest = this._bayPile(bay, 'in', ROW.S);
                if (dest) {
                  this._forkAssignBringInDest(npc, dest);
                  this._applyTaskClaim(npc, 'bringIn', dest, bay);
                }
              }
              npc.state = 'enter';
            } else {
              // Spawn failed — reopen the checklist unit so another truck can retry
              this._reopenServiceItemIfOrphan(
                fetchBay != null ? this._servicePad(fetchBay) : null,
                fetchItemId
              );
              npc.job = 'idle';
              npc.state = 'enter';
            }
            break;
          }
          // No cargo fiction needed — return via enter then hub
          npc.state = 'enter';
        }
        break;
      }
      default:
        if (npc.cargo) this._forkQueueAtDest(npc);
        else this._forkGoToHub(npc);
    }

    const pushed = this._padKeepOut(npc.x, npc.y);
    if (pushed && npc.state !== 'flee') {
      npc.x = pushed.x;
      npc.y = Math.max(pushed.y, BAY.PATH_Y - 40);
    }
    this._forkUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
  };

  HangarBay.prototype._forkUpdateVisHeading = function (npc, moveX, moveY, dt) {
    const moveDist = Math.hypot(moveX, moveY);
    const faceAng = npc.facing >= 0 ? 0 : Math.PI;
    let target = npc.visHeading ?? faceAng;
    if (npc.forkPhase || npc._lockFacing) {
      target = faceAng;
    } else if (moveDist > 0.2) {
      target = Math.atan2(moveY, moveX);
    } else {
      target = faceAng;
    }
    this._crewSteerVisHeading(npc, target, dt);
  };
}
