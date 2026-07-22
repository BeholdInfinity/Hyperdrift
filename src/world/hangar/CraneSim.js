/**
 * CraneSim — HangarBay prototype mixin.
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


export function attachCraneSim(HangarBay) {
  HangarBay.prototype._divertCraneFromBay = function (bayIndex, opts = {}) {
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
      if (!opts.keepOpsFreeze) c.pause = 0.15;
      // Park on a non-ops bay mid-in (never force B2 — may be the hot bay)
      const parkBay =
        [0, 1, 2].find((b) => b !== bayIndex) ??
        ((bayIndex + 1) % 3);
      c.pickup =
        this._bayPile(parkBay, 'in', ROW.M) ||
        this._bayPile((parkBay + 1) % 3, 'in', ROW.M);
      c.dropoff = c.pickup;
    }
  };

  HangarBay.prototype._enumerateCraneTasks = function () {
    const tasks = [];
    for (let bay = 0; bay < 3; bay++) {
      for (const t of this._enumerateBayStagingTasks(bay)) tasks.push(t);
    }
    return tasks;
  };

  HangarBay.prototype._craneJobOriginXY = function () {
    if (this.crane) {
      return { x: this.crane.trolleyX, y: this.crane.bridgeY };
    }
    return this._craneHomeXY();
  };

  HangarBay.prototype._pickCraneTask = function (tasks) {
    if (!tasks.length) return null;
    const origin = this._craneJobOriginXY();
    let best = null;
    let bestScore = -Infinity;
    for (const t of tasks) {
      const park = this._craneParkXY(t.pickup);
      const dist = Math.hypot(park.x - origin.x, park.y - origin.y);
      const score = (t.weight || 1) / (1 + dist / craneJobDistScale());
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  };

  HangarBay.prototype._pickCraneJob = function () {
    // Prefer reclaiming aged unclaimed floor drops (outside hot bays)
    const floorJob = this._pickFloorDropCraneJob();
    if (floorJob) return floorJob;

    const tasks = this._enumerateCraneTasks();
    const mechCargo = this._mechanicStagingCargoIds();
    const free = tasks.filter((t) => {
      // Per-item claims: only skip crates a bay mech already called
      if (t.cargoId != null && mechCargo.has(t.cargoId)) return false;
      return true;
    });
    const doable = free.filter((t) => t.status === 'doable');
    const blocked = free.filter((t) => t.status === 'blocked');
    const blockedDestIds = new Set(blocked.map((t) => t.dropoff.id));

    // 1) Hard priority: empty a pile someone is blocked waiting to drop onto
    const unblock = doable
      .filter((t) => blockedDestIds.has(t.pickup.id))
      .map((t) => ({ ...t, weight: (t.weight || 1) * 4 }));
    if (unblock.length) {
      const chosen = this._pickCraneTask(unblock);
      return {
        mode: 'work',
        pickup: chosen.pickup,
        dropoff: chosen.dropoff,
        cargoId: chosen.cargoId ?? null,
      };
    }

    // 2) Clear at-capacity piles before they cascade into more blocks
    const atCap = doable.filter((t) => t.clears);
    if (atCap.length) {
      const chosen = this._pickCraneTask(atCap);
      return {
        mode: 'work',
        pickup: chosen.pickup,
        dropoff: chosen.dropoff,
        cargoId: chosen.cargoId ?? null,
      };
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

    const chosen = this._pickCraneTask(pool);
    if (chosen) {
      return {
        mode: 'work',
        pickup: chosen.pickup,
        dropoff: chosen.dropoff,
        cargoId: chosen.cargoId ?? null,
      };
    }

    // 4) Nothing doable — park at home (recheck soon); don't camp blocked piles
    return { mode: 'idle', pickup: null, dropoff: null };
  };

  HangarBay.prototype._craneStagingBeatenByMech = function (c) {
    if (!c || c.carried || !c.pickup || c.pickup.isFloorDrop) return false;
    const craneCargoId = c._pickupItem?.id ?? null;
    for (const n of this.npcs) {
      if (n.kind !== 'mechanic' || !n.alive) continue;
      if (
        n.job !== 'stageFerry' &&
        n.job !== 'loadShip' &&
        n.job !== 'installUpgrade'
      ) {
        continue;
      }
      if (!(n.cargo || n._mechLift?.cargo || n._claimCargoId != null)) continue;
      const mechCargoId =
        n.cargo?.id ?? n._mechLift?.cargo?.id ?? n._claimCargoId ?? null;
      if (craneCargoId != null && mechCargoId != null) {
        if (craneCargoId === mechCargoId) return true;
        continue;
      }
      // Fallback: same pile path when cargo id unknown
      const srcId = c.pickup.id;
      const nSrc =
        n.ferrySource?.id ||
        (!n.cargo ? n.targetPile?.id : null) ||
        n.targetPile?.id;
      if (nSrc === srcId) return true;
    }
    return false;
  };

  HangarBay.prototype._mechStagingBeatenByCrane = function (npc) {
    if (!npc || npc.cargo || npc._mechLift?.cargo) return false;
    const fromSouth =
      npc.targetPile?.lane === 'in' && npc.targetPile?.row === ROW.S;
    if (npc.job !== 'stageFerry' && !(npc.job === 'loadShip' && fromSouth)) {
      return false;
    }
    const c = this.crane;
    if (!c || c.pickup?.isFloorDrop) return false;
    const active =
      !!c.carried || c.phase === 'lowerPickup' || c.phase === 'raisePickup';
    if (!active) return false;
    const craneCargoId = c.carried?.id ?? c._pickupItem?.id ?? null;
    const mechCargoId = npc._claimCargoId ?? null;
    if (craneCargoId != null && mechCargoId != null) {
      return craneCargoId === mechCargoId;
    }
    const srcId = npc.ferrySource?.id || npc.targetPile?.id;
    if (!srcId || c.pickup?.id !== srcId) return false;
    if (npc.job === 'stageFerry') {
      const destId = npc.ferryDest?.id;
      if (destId && c.dropoff?.id && c.dropoff.id !== destId) return false;
    }
    return true;
  };

  HangarBay.prototype._pickFloorDropCraneJob = function () {
    const aged = this.floorDrops.filter((d) => {
      if (this.time - d.droppedAt < FLOOR_DROP_CRANE_AGE) return false;
      if (this._floorDropClaimedByMechanic(d)) return false;
      if (d.claimNpc === 'crane') return true;
      const bay = bayIndexFromX(d.x);
      if (this._isBayOpsHot(bay) && this._pointInDangerRect(d.x, d.y, bay, 0)) return false;
      return true;
    });
    if (!aged.length) return null;
    // Older drops preferred; soft distance bias so he doesn't cross the bay for a 1s-older crate
    const origin = this._craneJobOriginXY();
    let drop = null;
    let bestScore = -Infinity;
    for (const d of aged) {
      const age = Math.max(0.5, this.time - d.droppedAt);
      const parkY = this._clampBridgeY(d.y - TROLLEY_NORTH);
      const parkX = this._clampTrolleyX(d.x);
      const dist = Math.hypot(parkX - origin.x, parkY - origin.y);
      const score = age / (1 + dist / craneJobDistScale());
      if (score > bestScore) {
        bestScore = score;
        drop = d;
      }
    }
    if (!drop) return null;
    drop.claimNpc = 'crane';
    const bay = bayIndexFromX(drop.x);
    const dest = this._findSafePileForCargo(drop.cargo, bay);
    if (!dest) return null;
    return {
      mode: 'work',
      pickup: this._makeFloorPickupProxy(drop),
      dropoff: dest,
    };
  };

  HangarBay.prototype._applyCraneJob = function (c, job) {
    if (!job || job.mode === 'idle') {
      const home = this._craneHomeXY();
      c.pickup = { x: home.x, y: home.y + TROLLEY_NORTH, id: 'craneHome' };
      c.dropoff = c.pickup;
      c.phase = 'idle';
      c.pause = 0;
      c.lingerFor = null;
      c._dropSlot = null;
      c._pickupItem = null;
      return;
    }
    c.pickup = job.pickup;
    c.dropoff = job.dropoff;
    c._dropSlot = null;
    c._pickupItem = null;
    if (job.cargoId != null && job.pickup?.items?.length) {
      c._pickupItem =
        job.pickup.items.find((it) => it.id === job.cargoId) || null;
    }
    c.lingerFor = job.mode === 'linger' ? job.dropoff?.id : null;
    if (job.mode === 'linger') {
      c.phase = 'linger';
      c.pause = 0.35;
    } else {
      c.phase = 'travelPickup';
      c.pause = 0.25;
    }
  };

  HangarBay.prototype._resetCrane = function () {
    if (!this.hasCrane()) {
      this.crane = null;
      return;
    }
    const job = this._pickCraneJob();
    const home = this._craneHomeXY();
    const start = job.mode === 'idle' || !job.pickup
      ? { x: home.x, y: home.y + TROLLEY_NORTH, id: 'craneHome' }
      : job.pickup;
    this.crane = {
      trolleyX: job.mode === 'idle' || !job.pickup ? home.x : start.x,
      bridgeY: job.mode === 'idle' || !job.pickup ? home.y : start.y - TROLLEY_NORTH,
      hoist: HOIST_RAISED,
      hookTargetY: null,
      carried: null,
      claw: CLAW_OPEN,
      levers: { travel: 0, hoist: 0, grip: 0 },
      operator: {
        suit: CRANE_CREW.suit,
        helmet: CRANE_CREW.helmet,
        mask: CRANE_CREW.mask,
        /** Draw yaw — 8-dir head look (smoothed toward task destination) */
        visHeading: Math.PI / 2,
        facing: 1,
      },
      phase: 'idle',
      pickup: start,
      dropoff: job.dropoff || start,
      lingerFor: null,
      pause: 0.2,
      _prevTX: job.mode === 'idle' || !job.pickup ? home.x : start.x,
      _prevBY: job.mode === 'idle' || !job.pickup ? home.y : start.y - TROLLEY_NORTH,
      _prevHoist: HOIST_RAISED,
    };
    this._applyCraneJob(this.crane, job);
  };

  HangarBay.prototype._findCraneDropoffFor = function (carried, preferBay = null, preferLane = null) {
    if (!carried) return null;
    const homeBay =
      carried.serviceBay != null ? carried.serviceBay : preferBay;
    const wantRole = carried.family === 'upgrade' ? 'upgrade' : 'cargo';
    // Checklist inbound freight (install / load) must stay on the in-lane —
    // never the outbound uninstall / sell pads.
    const forceIn = carried.serviceKey != null;
    const lanePref = forceIn ? 'in' : preferLane;
    const candidates = [];
    for (const p of this.piles) {
      if (p.items.length >= PILE_CAP) continue;
      if (carried.serviceKey != null && homeBay != null && p.bay !== homeBay) continue;
      if (p.row === ROW.S) {
        // Transit only when no service tag (sweep / reclaim)
        if (carried.serviceKey) continue;
        if (p.lane !== 'out') continue;
        candidates.push({ p, w: homeBay === p.bay ? 1.2 : 0.3 });
        continue;
      }
      if (!this._pileAcceptsFamily(p, carried)) continue;
      if (forceIn && p.lane !== 'in') continue;
      if (p.lane === 'in' && p.role === wantRole) {
        let w = homeBay === p.bay ? 10 : 2;
        if (lanePref === 'in') w *= 1.25;
        candidates.push({ p, w });
      } else if (p.lane === 'out' && p.role === wantRole) {
        // Opposite-lane only as last resort for non-service freight
        let w = homeBay === p.bay ? 4 : 1;
        if (lanePref === 'in') w *= 0.15;
        else if (lanePref === 'out') w *= 1.25;
        candidates.push({ p, w });
      }
    }
    if (!candidates.length) return null;
    const total = candidates.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.w;
      if (r <= 0) return c.p;
    }
    return candidates[0].p;
  };

  HangarBay.prototype._craneDropoffInvalid = function (dropoff, carried) {
    if (!dropoff || !carried) return true;
    if (dropoff.items.length >= PILE_CAP) return true;
    if (!this._pileAcceptsFamily(dropoff, carried)) return true;
    const wantRole = carried.family === 'upgrade' ? 'upgrade' : 'cargo';
    if (dropoff.row !== ROW.S && dropoff.role !== wantRole) return true;
    // Install / inbound service parts must not land on outbound uninstall pads
    if (carried.serviceKey != null && dropoff.lane === 'out') return true;
    return false;
  };

  HangarBay.prototype._cranePreferLane = function (c) {
    if (c?.carried?.serviceKey) return 'in';
    if (c?.pickup?.lane === 'in' || c?.pickup?.lane === 'out') return c.pickup.lane;
    return null;
  };

  HangarBay.prototype._moveCraneXY = function (c, tx, ty, speed, dt) {
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
  };

  HangarBay.prototype._craneParkXY = function (pile, slotOrItem = null) {
    if (!pile || pile.id === 'craneHome') {
      return {
        x: this._clampTrolleyX(CRANE_HOME.x),
        y: this._clampBridgeY(CRANE_HOME.y),
      };
    }
    let wx = pile.x;
    let wy = pile.y;
    if (slotOrItem != null && typeof slotOrItem === 'object') {
      const pos = this._itemWorldPos(pile, slotOrItem);
      wx = pos.x;
      wy = pos.y;
    } else if (
      typeof slotOrItem === 'number' &&
      slotOrItem >= 0 &&
      slotOrItem < PILE_SLOTS.length
    ) {
      wx = pile.x + PILE_SLOTS[slotOrItem].ox;
      wy = pile.y + PILE_SLOTS[slotOrItem].oy;
    }
    return {
      x: this._clampTrolleyX(wx),
      y: this._clampBridgeY(wy - TROLLEY_NORTH),
    };
  };

  HangarBay.prototype._craneAimFloorY = function (c = this.crane) {
    if (!c) return 0;
    if (c.hookTargetY != null) {
      const cargo = c.carried ?? c._aimCargo;
      return this._craneCargoCenterFromHook(c.hookTargetY, cargo);
    }
    return c.bridgeY + TROLLEY_NORTH;
  };

  HangarBay.prototype._craneOperatorLookAt = function (c = this.crane) {
    if (!c) return { x: 0, y: 0 };
    const phase = c.phase || 'idle';
    const homeish = (p) => !p || p.id?.includes?.('craneHome');
    const towardPickup =
      phase === 'travelPickup' ||
      phase === 'lowerPickup' ||
      phase === 'linger' ||
      (phase === 'raisePickup' && !c.carried);
    const towardDrop =
      phase === 'travelDropoff' ||
      phase === 'lowerDropoff' ||
      phase === 'lingerLoaded' ||
      phase === 'raisePickup' ||
      (phase === 'raiseDropoff' && !!c.dropoff);
    if (towardPickup && !homeish(c.pickup)) {
      return { x: c.pickup.x, y: c.pickup.y };
    }
    if (towardDrop && c.dropoff && !homeish(c.dropoff)) {
      return { x: c.dropoff.x, y: c.dropoff.y };
    }
    if (c.carried && c.dropoff && !homeish(c.dropoff)) {
      return { x: c.dropoff.x, y: c.dropoff.y };
    }
    if (!c.carried && !homeish(c.pickup) && phase !== 'idle' && phase !== 'raiseDropoff') {
      return { x: c.pickup.x, y: c.pickup.y };
    }
    // Idle / home / post-drop — watch the deck aim under the trolley
    return { x: c.trolleyX, y: this._craneAimFloorY(c) };
  };

  HangarBay.prototype._updateCraneOperatorLook = function (dt) {
    const c = this.crane;
    if (!c?.operator) return;
    const op = c.operator;
    const look = this._craneOperatorLookAt(c);
    // Cab seat is east of trolley on the bridge (matches `_drawCraneCabin`)
    const headX = c.trolleyX + 13;
    const headY = c.bridgeY - 3;
    const dx = look.x - headX;
    const dy = look.y - headY;
    if (Math.hypot(dx, dy) < 2) return;
    this._crewSteerVisHeading(op, Math.atan2(dy, dx), dt);
  };

  HangarBay.prototype._craneHookForCargoCenter = function (cy, cargo = null) {
    const h = cargo?.h ?? 8;
    return cy - (CLAW_FINGER - 1) - h * 0.5;
  };

  HangarBay.prototype._craneCargoCenterFromHook = function (hookY, cargo = null) {
    const h = cargo?.h ?? 8;
    return hookY + (CLAW_FINGER - 1) + h * 0.5;
  };

  HangarBay.prototype._cranePeekPickupItem = function (pile) {
    return this._craneResolvePickupItem(pile);
  };

  HangarBay.prototype._craneResolvePickupItem = function (pile) {
    if (!pile?.items?.length) return null;
    if (pile.isFloorDrop) return pile.items[0];
    let best = null;
    let bestSlot = PILE_SLOTS.length;
    for (const item of pile.items) {
      let slot = item.pileSlot;
      if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
        slot = this._pileAssignSlotIfMissing(pile, item);
      }
      if (slot < bestSlot) {
        bestSlot = slot;
        best = item;
      }
    }
    return best;
  };

  HangarBay.prototype._craneLockPickup = function (c) {
    if (!c?.pickup?.items?.length || c.pickup.isFloorDrop) {
      c._pickupItem = null;
      return null;
    }
    if (c._pickupItem && c.pickup.items.includes(c._pickupItem)) {
      return c._pickupItem;
    }
    c._pickupItem = this._craneResolvePickupItem(c.pickup);
    return c._pickupItem;
  };

  HangarBay.prototype._craneEnsureDropSlot = function (c) {
    if (!c?.dropoff) {
      c._dropSlot = null;
      return null;
    }
    if (
      c._dropSlot == null ||
      c._dropSlot < 0 ||
      c._dropSlot >= PILE_SLOTS.length ||
      c.dropoff.items.some((it) => it.pileSlot === c._dropSlot)
    ) {
      // Ignore our own prior reservation while choosing a fresh drop slot
      c._dropSlot = this._pileFreeSlot(c.dropoff, null, { ignoreCraneDrop: true });
    }
    return c._dropSlot;
  };

  HangarBay.prototype._craneHomeXY = function () {
    return {
      x: this._clampTrolleyX(CRANE_HOME.x),
      y: this._clampBridgeY(CRANE_HOME.y),
    };
  };

  HangarBay.prototype._craneHookPos = function () {
    const c = this.crane;
    if (!c) return { x: 0, y: 0 };
    const raisedY = c.bridgeY + 5;
    const targetY = c.hookTargetY ?? raisedY;
    const t = Math.min(1, Math.max(0, c.hoist / HOIST_MAX));
    return {
      x: c.trolleyX,
      y: raisedY + (targetY - raisedY) * t,
    };
  };

  HangarBay.prototype._craneCargoDrawPos = function () {
    const hook = this._craneHookPos();
    const box = this.crane?.carried;
    if (!box) return { ...hook, top: hook.y + CLAW_FINGER - 1 };
    const top = hook.y + CLAW_FINGER - 1;
    return {
      x: hook.x,
      y: top + box.h / 2,
      top,
    };
  };

  HangarBay.prototype._updateCraneClaw = function (dt) {
    const c = this.crane;
    if (!c) return;
    // Open while empty; partial close while holding cargo (including lower-to-drop)
    const target = c.carried ? CLAW_GRIP : CLAW_OPEN;
    const rate = c.carried ? 10 : 7;
    c.claw += (target - (c.claw ?? CLAW_OPEN)) * Math.min(1, dt * rate);
  };

  HangarBay.prototype._updateCraneLevers = function (dt) {
    const c = this.crane;
    if (!c) return;
    if (!c.levers) c.levers = { travel: 0, hoist: 0, grip: 0 };

    const dx = c.trolleyX - (c._prevTX ?? c.trolleyX);
    const dy = c.bridgeY - (c._prevBY ?? c.bridgeY);
    const dh = c.hoist - (c._prevHoist ?? c.hoist);
    c._prevTX = c.trolleyX;
    c._prevBY = c.bridgeY;
    c._prevHoist = c.hoist;

    // XY travel lever — pushed forward while the bridge/trolley is moving
    const moveMag = Math.hypot(dx, dy);
    let travelT = 0;
    if (moveMag > 0.04) {
      travelT = Math.min(1, moveMag * 0.45);
    } else if (
      c.phase === 'travelPickup' ||
      c.phase === 'travelDropoff' ||
      c.phase === 'linger' ||
      c.phase === 'lingerLoaded'
    ) {
      // Micro-nudge while settling on target so the stick isn't dead-still mid-job
      travelT = 0.12 + Math.sin(this.time * 7) * 0.04;
    }

    // Hoist lever — forward = arm down, back = arm up
    let hoistT = 0;
    if (Math.abs(dh) > 0.04) {
      hoistT = Math.max(-1, Math.min(1, dh * 0.14));
    } else if (c.phase === 'lowerPickup' || c.phase === 'lowerDropoff') {
      hoistT = 0.92;
    } else if (c.phase === 'raisePickup' || c.phase === 'raiseDropoff') {
      hoistT = -0.92;
    }

    // Grip lever — back = open, forward = closed (tracks claw open→grip)
    const claw = c.claw ?? CLAW_OPEN;
    const span = CLAW_OPEN - CLAW_GRIP;
    const closed01 = Math.max(0, Math.min(1, (CLAW_OPEN - claw) / span));
    const gripT = closed01 * 2 - 1; // -1 open … +1 closed

    const k = Math.min(1, dt * 10);
    c.levers.travel += (travelT - c.levers.travel) * k;
    c.levers.hoist += (hoistT - c.levers.hoist) * k;
    c.levers.grip += (gripT - c.levers.grip) * k;
  };

  HangarBay.prototype._updateCrane = function (dt) {
    const c = this.crane;
    if (!c) return;
    const moveSpeed = 120;
    const hoistSpeed = 55;
    const near = (a, b, eps = 2.5) => Math.abs(a - b) < eps;

    this._updateCraneClaw(dt);
    this._updateCraneLevers(dt);
    this._updateCraneOperatorLook(dt);

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
        c.hoist = HOIST_RAISED;
        c.hookTargetY = null;

        // Only leave home for doable work — don't camp blocked jams mid-bay
        const next = this._pickCraneJob();
        if (next && next.mode === 'work') {
          this._applyCraneJob(c, next);
          break;
        }

        // No doable work — return to top-left and wait there
        const park = this._craneHomeXY();
        if (!this._moveCraneXY(c, park.x, park.y, moveSpeed * 0.75, dt)) {
          break;
        }
        c.pause = 0.85;
        break;
      }
      case 'linger': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hookTargetY = null;
        // Dest freed?
        if (c.dropoff && c.dropoff.items.length < PILE_CAP && c.pickup?.items?.length) {
          c.lingerFor = null;
          c.phase = 'travelPickup';
          c.pause = 0.15;
          break;
        }
        // Re-evaluate: take doable work, else go home instead of camping the jam
        const retry = this._pickCraneJob();
        if (retry && retry.mode === 'work') {
          this._applyCraneJob(c, retry);
          break;
        }
        c.lingerFor = null;
        this._applyCraneJob(c, { mode: 'idle' });
        break;
      }
      case 'travelPickup': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hoist = HOIST_RAISED;
        c.hookTargetY = null;
        // Mech already grabbed this staging move — pick something else
        if (this._craneStagingBeatenByMech(c)) {
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        // Dest filled while en route — switch to next doable or linger
        if (c.dropoff && c.dropoff.items.length >= PILE_CAP) {
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        if (!c.pickup?.items?.length) {
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        const pickItem = c.pickup.isFloorDrop
          ? null
          : this._craneLockPickup(c);
        const t = this._craneParkXY(c.pickup, pickItem);
        if (this._moveCraneXY(c, t.x, t.y, moveSpeed, dt)) {
          const cargo = pickItem ?? c.pickup.items?.[0];
          const pos = pickItem
            ? this._itemWorldPos(c.pickup, pickItem)
            : { x: c.pickup.x, y: c.pickup.y };
          c.trolleyX = this._clampTrolleyX(pos.x);
          c._aimCargo = cargo;
          c.hookTargetY = this._craneHookForCargoCenter(pos.y, cargo);
          c.phase = 'lowerPickup';
        }
        break;
      }
      case 'lowerPickup': {
        if (this._craneStagingBeatenByMech(c)) {
          c.hookTargetY = null;
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        const pickItem = c.pickup?.isFloorDrop
          ? null
          : this._craneLockPickup(c);
        const cargo = pickItem ?? c.pickup?.items?.[0];
        if (!cargo && !c.pickup?.isFloorDrop) {
          c.hookTargetY = null;
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        if (pickItem) {
          const pos = this._itemWorldPos(c.pickup, pickItem);
          c.trolleyX = this._clampTrolleyX(pos.x);
          c._aimCargo = cargo;
          c.hookTargetY = this._craneHookForCargoCenter(pos.y, cargo);
        } else if (c.pickup) {
          c._aimCargo = cargo;
          c.hookTargetY = this._craneHookForCargoCenter(c.pickup.y, cargo);
        }
        c.hoist = Math.min(c.hoist + hoistSpeed * dt, HOIST_MAX);
        if (near(c.hoist, HOIST_MAX, 2)) {
          c.hoist = HOIST_MAX;
          if (c.pickup.items.length > 0) {
            if (pickItem && c.pickup.items.includes(pickItem)) {
              c.carried = this._pileRemove(c.pickup, pickItem);
            } else {
              c.carried = this._pilePop(c.pickup);
            }
            c._pickupItem = null;
            c._aimCargo = null;
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
          // Re-target if planned dropoff doesn't match what we actually picked up
          if (c.carried && this._craneDropoffInvalid(c.dropoff, c.carried)) {
            const alt = this._findCraneDropoffFor(
              c.carried,
              c.dropoff?.bay ?? c.pickup?.bay,
              this._cranePreferLane(c)
            );
            if (alt) {
              c.dropoff = alt;
              c._dropSlot = null;
            } else {
              c.phase = 'lingerLoaded';
              c.pause = 0.2;
              break;
            }
          }
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
        if (c.carried && c.dropoff && this._craneDropoffInvalid(c.dropoff, c.carried)) {
          const alt = this._findCraneDropoffFor(
            c.carried,
            c.dropoff.bay,
            this._cranePreferLane(c)
          );
          if (alt) {
            c.dropoff = alt;
            c._dropSlot = null;
          } else {
            c.phase = 'lingerLoaded';
            c.pause = 0.25;
            break;
          }
        }
        if (c.dropoff && c.dropoff.items.length >= PILE_CAP) {
          const alt = this._findCraneDropoffFor(
            c.carried,
            c.dropoff.bay,
            this._cranePreferLane(c)
          );
          if (alt) {
            c.dropoff = alt;
            c._dropSlot = null;
          } else {
            // Linger near intended dropoff with load raised
            c.phase = 'lingerLoaded';
            c.pause = 0.3;
            break;
          }
        }
        const dropSlot = this._craneEnsureDropSlot(c);
        const t = this._craneParkXY(c.dropoff, dropSlot);
        if (this._moveCraneXY(c, t.x, t.y, moveSpeed, dt)) {
          const cargoY =
            dropSlot != null && dropSlot >= 0
              ? c.dropoff.y + PILE_SLOTS[dropSlot].oy
              : c.dropoff.y;
          c.hookTargetY = this._craneHookForCargoCenter(cargoY, c.carried);
          c.phase = 'lowerDropoff';
        }
        break;
      }
      case 'lingerLoaded': {
        const dropSlot = this._craneEnsureDropSlot(c);
        const t = this._craneParkXY(c.dropoff, dropSlot);
        this._moveCraneXY(c, t.x, t.y, moveSpeed * 0.6, dt);
        if (c.dropoff && !this._craneDropoffInvalid(c.dropoff, c.carried)) {
          c.phase = 'travelDropoff';
          c.pause = 0.1;
          break;
        }
        const alt = this._findCraneDropoffFor(
          c.carried,
          c.dropoff?.bay,
          this._cranePreferLane(c)
        );
        if (alt && alt.id !== c.dropoff?.id) {
          c.dropoff = alt;
          c._dropSlot = null;
          c.phase = 'travelDropoff';
          c.pause = 0.1;
          break;
        }
        c.pause = 0.4;
        break;
      }
      case 'lowerDropoff': {
        const dropSlot = this._craneEnsureDropSlot(c);
        const cargoY =
          dropSlot != null && dropSlot >= 0
            ? c.dropoff.y + PILE_SLOTS[dropSlot].oy
            : c.dropoff?.y;
        c.hookTargetY = this._craneHookForCargoCenter(cargoY, c.carried);
        c.hoist = Math.min(c.hoist + hoistSpeed * dt, HOIST_MAX);
        if (near(c.hoist, HOIST_MAX, 2)) {
          c.hoist = HOIST_MAX;
          const canDrop =
            c.carried && c.dropoff && !this._craneDropoffInvalid(c.dropoff, c.carried);
          if (canDrop) {
            if (dropSlot != null && dropSlot >= 0) {
              c.carried.pileSlot = dropSlot;
            }
            this._pilePush(c.dropoff, c.carried);
            c.carried = null;
            c._dropSlot = null;
            c.pause = 0.3;
            c.phase = 'raiseDropoff';
          } else if (c.carried) {
            const alt = this._findCraneDropoffFor(
              c.carried,
              c.dropoff?.bay,
              this._cranePreferLane(c)
            );
            if (alt) {
              c.dropoff = alt;
              c._dropSlot = null;
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
  };

  HangarBay.prototype._craneIsBusy = function () {
    const c = this.crane;
    if (!c) return true;
    if ((c.pause || 0) >= 50) return true; // frozen for bay ops
    return c.phase !== 'idle';
  };
}
