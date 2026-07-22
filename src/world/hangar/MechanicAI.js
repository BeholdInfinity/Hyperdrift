/**
 * MechanicAI — HangarBay prototype mixin.
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


export function attachMechanicAI(HangarBay) {
  HangarBay.prototype._bindActiveServiceForMech = function (npc) {
    const bay = npc.bay ?? npc.homeBay;
    const items = this._servicePad(bay)?.service?.items || [];
    const taken = this._claimedServiceKeys(npc);
    const firstOpen = (type) =>
      items.find(
        (i) => i.type === type && i.status !== 'done' && !taken.has(i.id)
      )?.id ?? null;

    if (npc.cargo?.serviceKey != null) {
      npc._activeServiceId = npc.cargo.serviceKey;
      return;
    }
    // Keep the per-unit claim from task pick (both mechs load/unload in parallel)
    if (npc._claimServiceItemId != null) {
      const sid = npc._claimServiceItemId;
      if (!String(sid).startsWith('cargo:')) {
        const it = items.find((i) => i.id === sid);
        if (it && it.status !== 'done') {
          npc._activeServiceId = sid;
          return;
        }
      } else {
        npc._activeServiceId = sid;
        return;
      }
    }
    if (npc._activeServiceId != null) {
      const it = items.find((i) => i.id === npc._activeServiceId);
      if (it && it.status !== 'done') return;
    }
    if (npc.job === 'weld') {
      npc._activeServiceId = firstOpen('repair');
    } else if (npc.job === 'unloadShip') {
      npc._activeServiceId = firstOpen('unloadCargo');
    } else if (npc.job === 'installUpgrade' || npc.job === 'removeUpgrade') {
      npc._activeServiceId = firstOpen('upgrade');
    } else if (npc.job === 'loadShip') {
      const pile = this._pileById(npc.targetPile?.id);
      const staged = pile?.items?.find(
        (c) => c.serviceKey != null && !taken.has(c.serviceKey)
      );
      npc._activeServiceId =
        staged?.serviceKey ??
        items.find(
          (i) =>
            (i.type === 'refuel' ||
              i.type === 'reloadBullets' ||
              i.type === 'reloadShells' ||
              i.type === 'loadCargo') &&
            i.status !== 'done' &&
            !taken.has(i.id)
        )?.id ??
        null;
    } else {
      npc._activeServiceId = null;
    }
  };

  HangarBay.prototype._abortMechanicForOps = function (npc) {
    if (npc.state === 'workWeld' || npc.state === 'workShip') {
      npc.hullTarget = null;
      npc._weldGlow = null;
    }
    if (npc.cargo) this._dropFloorCargo(npc);
    this._clearTaskClaim(npc);
  };

  HangarBay.prototype._beginWeldBoardProgress = function (npc) {
    const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
    const pad = this._servicePad(bay);
    const st = pad?.shipState;
    if (!st) {
      npc._boardProg = null;
      return;
    }
    const spots = Math.max(1, npc.weldSpotsTotal || npc.tripsLeft || 1);
    if (npc.weldSpotsTotal == null) npc.weldSpotsTotal = spots;
    if (npc.weldSpotIndex == null) npc.weldSpotIndex = 0;
    npc._boardProg = {
      type: 'repair',
      from: 0,
      to: 1,
      dur: Math.max(0.25, npc.stateT || 1),
      bay,
      weld: true,
    };
    this._syncRepairHullMeter(pad);
  };

  HangarBay.prototype._bayMateActiveJobs = function (npc, homeBay) {
    const jobs = new Set();
    for (const n of this.npcs) {
      if (!n.alive || n === npc || n.kind !== 'mechanic') continue;
      if ((n.homeBay ?? n.bay) !== homeBay) continue;
      if (
        n.job === 'weld' ||
        n.job === 'loadShip' ||
        n.job === 'unloadShip' ||
        n.job === 'installUpgrade' ||
        n.job === 'removeUpgrade' ||
        n.job === 'stageFerry'
      ) {
        jobs.add(n.job);
      }
    }
    return jobs;
  };

  HangarBay.prototype._softPriorityMechPool = function (doable) {
    let pool = doable.filter((t) => t.job === 'weld' && t.service);
    if (!pool.length) pool = doable.filter((t) => t.clears);
    if (!pool.length) {
      pool = doable.filter(
        (t) =>
          t.job === 'loadShip' ||
          t.job === 'installUpgrade' ||
          t.job === 'unloadShip'
      );
    }
    if (!pool.length) pool = doable.filter((t) => t.job !== 'weld');
    if (!pool.length) pool = doable;
    return pool;
  };

  HangarBay.prototype._mechanicStagingCargoIds = function () {
    const ids = new Set();
    for (const n of this.npcs) {
      if (n.kind !== 'mechanic' || !n.alive) continue;
      const helping =
        n.job === 'stageFerry' ||
        n.job === 'loadShip' ||
        n.job === 'installUpgrade';
      if (!helping) continue;
      if (n._claimCargoId != null) ids.add(n._claimCargoId);
      if (n.cargo?.id != null) ids.add(n.cargo.id);
      if (n._mechLift?.cargo?.id != null) ids.add(n._mechLift.cargo.id);
    }
    return ids;
  };

  HangarBay.prototype._mechanicStagingPileIds = function () {
    const ids = new Set();
    for (const n of this.npcs) {
      if (n.kind !== 'mechanic' || !n.alive || n.job !== 'stageFerry') continue;
      if (!n.cargo && n.targetPile?.id) ids.add(n.targetPile.id);
      if (n.ferrySource?.id && !n.cargo) ids.add(n.ferrySource.id);
      if (n.cargo && n.ferryDest?.id) ids.add(n.ferryDest.id);
      if (n.cargo && n.targetPile?.id) ids.add(n.targetPile.id);
    }
    return ids;
  };

  HangarBay.prototype._abandonMechanicStagingFerry = function (npc) {
    npc.mechPhase = null;
    npc.targetSlot = null;
    npc._mechLift = null;
    npc.mechHandT = 0;
    this._clearTaskClaim(npc);
    npc.ferryDest = null;
    npc.ferrySource = null;
    this._beginIdleFluff(npc);
  };

  HangarBay.prototype._floorDropClaimedByMechanic = function (drop) {
    return this.npcs.some(
      (n) =>
        n.kind === 'mechanic' &&
        n.alive &&
        (n.floorDropId === drop.id ||
          (n.droppedCargoId === drop.id &&
            (n.state === 'toFloorDrop' || n.state === 'resumeWait' || n.state === 'clearHot')))
    );
  };

  HangarBay.prototype._enumerateMechanicTasks = function (bay, pad) {
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

    // Hull repair — one task per checklist pip; each pip plays out over several hull spots
    if (needs('repair')) {
      for (const it of svc.items) {
        if (it.type !== 'repair' || it.status === 'done') continue;
        tasks.push({
          job: 'weld',
          targetPad: pad,
          bay,
          targetPile: null,
          serviceItemId: it.id,
          status: 'doable',
          weight: 7,
          clears: false,
          service: true,
          tripsLeft: weldSpotsForPip(),
        });
      }
    }

    // Load — one task per staged crate so both bay mechs can work in parallel
    if (midIn?.items.length) {
      const loadWeight = svcActive ? 9 : midIn.items.length >= PILE_CAP ? 8 : 4;
      const loadClears = midIn.items.length >= PILE_CAP;
      for (const c of midIn.items) {
        if (svcActive) {
          if (c.serviceKey == null) continue;
          const it = svc.items.find(
            (i) => i.id === c.serviceKey && i.status !== 'done'
          );
          if (
            !it ||
            (it.type !== 'refuel' &&
              it.type !== 'reloadBullets' &&
              it.type !== 'reloadShells' &&
              it.type !== 'loadCargo')
          ) {
            continue;
          }
          tasks.push({
            job: 'loadShip',
            targetPad: pad,
            bay,
            targetPile: midIn,
            serviceItemId: c.serviceKey,
            cargoId: c.id,
            status: 'doable',
            weight: loadWeight,
            clears: loadClears,
            tripsLeft: 1,
          });
        } else {
          tasks.push({
            job: 'loadShip',
            targetPad: pad,
            bay,
            targetPile: midIn,
            serviceItemId: `cargo:${c.id}`,
            cargoId: c.id,
            status: 'doable',
            weight: loadWeight,
            clears: loadClears,
            tripsLeft: 1,
          });
        }
      }
    }
    // Install — one task per staged upgrade part
    if (upIn?.items.length) {
      const def = this._shipDefForBay(bay);
      const mounts = def?.resolveMounts?.() || {};
      const instWeight = svcActive ? 9 : upIn.items.length >= PILE_CAP ? 8 : 4;
      const instClears = upIn.items.length >= PILE_CAP;
      for (const c of upIn.items) {
        if (c.family !== 'upgrade') continue;
        if (svcActive) {
          if (c.serviceKey == null && !needs('upgrade')) continue;
          if (c.serviceKey != null) {
            const it = svc.items.find(
              (i) =>
                i.id === c.serviceKey &&
                i.type === 'upgrade' &&
                i.status !== 'done'
            );
            if (!it) continue;
          } else if (!needs('upgrade')) {
            continue;
          }
        }
        let canInstall = true;
        if (c.targetHardpointKey) {
          const m = mounts[c.targetHardpointKey];
          canInstall = !!(m && !m.item);
        } else {
          const cat =
            c.catalogCategory ||
            categoryFromFreightLabel(c.label) ||
            getItem(c.catalogItemId)?.category;
          if (cat && def) canInstall = emptySocketsForCategory(def, cat).length > 0;
        }
        if (!canInstall) continue;
        tasks.push({
          job: 'installUpgrade',
          targetPad: pad,
          bay,
          targetPile: upIn,
          serviceItemId: c.serviceKey ?? `cargo:${c.id}`,
          cargoId: c.id,
          status: 'doable',
          weight: instWeight,
          clears: instClears,
          tripsLeft: 1,
        });
      }
    }

    // Unload — one task per checklist unit (both mechs can pull different boxes)
    if (midOut && needs('unloadCargo')) {
      const unloadItems = svc.items.filter(
        (it) => it.type === 'unloadCargo' && it.status !== 'done'
      );
      const room = Math.max(0, PILE_CAP - midOut.items.length);
      unloadItems.forEach((it, i) => {
        tasks.push({
          job: 'unloadShip',
          targetPad: pad,
          bay,
          targetPile: midOut,
          serviceItemId: it.id,
          status: i < room ? 'doable' : 'blocked',
          weight: 8,
          clears: false,
          tripsLeft: 1,
        });
      });
    }

    // Strip only the exact hardpoint named by a staged Install part (if occupied)
    if (upOut && needs('upgrade')) {
      const def = this._shipDefForBay(bay);
      const staged = (upIn?.items || []).filter((c) => c.family === 'upgrade');
      let stripHardpointKey = null;
      let stripCategory = null;
      for (const c of staged) {
        if (c.targetHardpointKey && needsStripBeforeInstallKey(def, c.targetHardpointKey)) {
          stripHardpointKey = c.targetHardpointKey;
          stripCategory =
            c.catalogCategory ||
            categoryFromFreightLabel(c.label) ||
            getItem(c.catalogItemId)?.category;
          break;
        }
      }
      if (!stripHardpointKey) {
        for (const c of staged) {
          if (c.targetHardpointKey) continue;
          const cat =
            c.catalogCategory ||
            categoryFromFreightLabel(c.label) ||
            getItem(c.catalogItemId)?.category;
          if (cat && needsStripBeforeInstall(def, cat)) {
            stripCategory = cat;
            break;
          }
        }
      }
      if ((stripHardpointKey || stripCategory) && def) {
        const stagedMatch = staged.find(
          (c) =>
            (stripHardpointKey && c.targetHardpointKey === stripHardpointKey) ||
            (stripCategory &&
              !c.targetHardpointKey &&
              (c.catalogCategory ||
                categoryFromFreightLabel(c.label) ||
                getItem(c.catalogItemId)?.category) === stripCategory)
        );
        tasks.push({
          job: 'removeUpgrade',
          targetPad: pad,
          bay,
          targetPile: upOut,
          serviceItemId:
            stagedMatch?.serviceKey ||
            stripHardpointKey ||
            stripCategory ||
            `strip:${bay}`,
          status: upOut.items.length < PILE_CAP ? 'doable' : 'blocked',
          weight: 10,
          clears: false,
          stripCategory,
          stripHardpointKey,
          tripsLeft: 1,
        });
      }
    }
    return tasks;
  };

  HangarBay.prototype._pickMechanicTask = function (npc) {
    const homeBay = npc.homeBay ?? npc.bay ?? 0;
    const pads = this._dockTargets().filter((p) => bayIndexFromX(p.x) === homeBay);
    const servicePad = this._servicePad(homeBay);

    // Already carrying — deliver ferry dest or outbound unload pile
    if (npc.cargo) {
      if (npc.job === 'stageFerry') {
        const dest =
          this._pileById(npc.ferryDest?.id) || npc.ferryDest || null;
        const pad =
          pads[0] ||
          (servicePad
            ? {
                x: servicePad.x,
                y: 0,
                bayId: servicePad.bayId,
                bayIndex: homeBay,
                occupied: true,
              }
            : null);
        if (!pad || !dest) return { mode: 'idle' };
        if (dest.items.length < PILE_CAP) {
          return {
            mode: 'work',
            job: 'stageFerry',
            targetPad: pad,
            bay: homeBay,
            targetPile: dest,
            ferryDest: dest,
            ferrySource: npc.ferrySource || null,
            tripsLeft: 1,
            weight: 5,
          };
        }
        return {
          mode: 'linger',
          job: 'stageFerry',
          targetPad: pad,
          bay: homeBay,
          targetPile: dest,
          ferryDest: dest,
          tripsLeft: 1,
          weight: 3,
        };
      }
      const pad =
        pads[0] ||
        (servicePad
          ? {
              x: servicePad.x,
              y: 0,
              bayId: servicePad.bayId,
              bayIndex: homeBay,
              occupied: true,
            }
          : null);
      if (!pad) return { mode: 'idle' };
      const row = npc.cargo.family === 'upgrade' ? ROW.N : ROW.M;
      const job = npc.cargo.family === 'upgrade' ? 'removeUpgrade' : 'unloadShip';
      const dest = this._bayPile(homeBay, 'out', row);
      if (dest && dest.items.length < PILE_CAP) {
        return {
          mode: 'work',
          job,
          targetPad: pad,
          bay: homeBay,
          targetPile: dest,
          weight: 5,
        };
      }
      if (dest) {
        return {
          mode: 'linger',
          job,
          targetPad: pad,
          bay: homeBay,
          targetPile: dest,
          weight: 3,
        };
      }
      return { mode: 'idle' };
    }

    if (!pads.length && !this.bayClearing[homeBay]) {
      return { mode: 'idle' };
    }

    const all = [];
    if (pads.length) {
      for (const pad of pads) {
        for (const t of this._enumerateMechanicTasks(homeBay, pad)) all.push(t);
      }
    } else if (this.bayClearing[homeBay] && servicePad) {
      const stub = {
        x: servicePad.x,
        y: 0,
        bayId: servicePad.bayId,
        bayIndex: homeBay,
        occupied: false,
      };
      for (const t of this._enumerateMechanicTasks(homeBay, stub)) all.push(t);
    }

    const free = this._filterUnclaimed(all, npc);
    const doable = free.filter((t) => t.status === 'doable');
    const blocked = free.filter((t) => t.status === 'blocked');

    // Strip-before-install must beat install attempts (otherwise weld-loop on full sockets)
    let pool = doable.filter((t) => t.job === 'removeUpgrade');
    if (!pool.length) {
      // Prefer a job type no bay-mate is on when several types are doable;
      // if only one type remains (or mate already covers the rest), double-team.
      let candidates = doable;
      const mateJobs = this._bayMateActiveJobs(npc, homeBay);
      const typesPresent = new Set(doable.map((t) => t.job));
      if (typesPresent.size > 1 && mateJobs.size > 0) {
        const other = doable.filter((t) => !mateJobs.has(t.job));
        if (other.length) candidates = other;
      }
      pool = this._softPriorityMechPool(candidates);
    }

    const chosen = this._pickWeighted(pool);
    if (chosen) {
      return { mode: 'work', ...chosen };
    }

    const wait = this._pickWeighted(blocked);
    if (wait) {
      return { mode: 'linger', ...wait };
    }

    // Idle helper: bay staging ferry only while the crane is busy elsewhere
    if (this._craneIsBusy()) {
      const ferry = this._pickMechanicStagingFerry(npc, homeBay);
      if (ferry) return ferry;
    }

    return { mode: 'idle' };
  };

  HangarBay.prototype._shipHoldHasLoadRoom = function (pad) {
    const st = pad?.shipState;
    if (!st || !(st.cargoMk > 0)) return false;
    const hold = st.cargoHold;
    if (!hold?.slots) return false;
    let used = 0;
    for (const c of hold.cells || []) used += (c.w || 1) * (c.h || 1);
    return used < hold.slots;
  };

  HangarBay.prototype._stagingTaskIsDirectShipLoad = function (t, bay) {
    if (!t?.pickup || !t.dropoff || t.cargoId == null) return false;
    if (t.pickup.lane !== 'in' || t.pickup.row !== ROW.S) return false;
    if (t.dropoff.lane !== 'in' || t.dropoff.row !== ROW.M) return false;
    const cargo = t.pickup.items?.find((c) => c.id === t.cargoId);
    if (!cargo || cargo.family === 'upgrade') return false;
    const pad = this._servicePad(bay);
    if (!pad?.visitorId || pad.seq || pad.service?.phase !== 'active') {
      return false;
    }
    if (!this._padWorkable(pad)) return false;
    const it = pad.service.items.find(
      (i) =>
        i.id === cargo.serviceKey &&
        i.status !== 'done' &&
        (i.type === 'refuel' ||
          i.type === 'reloadBullets' ||
          i.type === 'reloadShells' ||
          i.type === 'loadCargo')
    );
    if (!it) return false;
    if (it.type === 'loadCargo') {
      const unloadPending = pad.service.items.some(
        (i) => i.type === 'unloadCargo' && i.status !== 'done'
      );
      if (unloadPending) return false;
      if (!this._shipHoldHasLoadRoom(pad)) return false;
    }
    return true;
  };

  HangarBay.prototype._pickMechanicStagingFerry = function (npc, homeBay) {
    const tasks = this._enumerateBayStagingTasks(homeBay);
    const crane = this.crane;
    const craneCargoId = crane?.carried?.id ?? crane?._pickupItem?.id ?? null;
    const free = this._filterUnclaimed(
      tasks
        .filter((t) => t.status === 'doable')
        .filter((t) => {
          if (t.cargoId != null && craneCargoId != null && t.cargoId === craneCargoId) {
            return false;
          }
          return true;
        })
        .map((t) => {
          const sid =
            t.serviceItemId ??
            (t.cargoId != null ? `cargo:${t.cargoId}` : null);
          if (this._stagingTaskIsDirectShipLoad(t, homeBay)) {
            return {
              job: 'loadShip',
              targetPile: t.pickup,
              bay: homeBay,
              status: 'doable',
              weight: (t.weight || 1) + 6,
              clears: t.clears,
              tripsLeft: 1,
              cargoId: t.cargoId,
              serviceItemId: sid,
              targetSlot: t.targetSlot,
              directFromSouth: true,
            };
          }
          return {
            job: 'stageFerry',
            targetPile: t.pickup,
            ferryDest: t.dropoff,
            ferrySource: t.pickup,
            bay: homeBay,
            status: 'doable',
            weight: t.weight || 1,
            clears: t.clears,
            tripsLeft: 1,
            cargoId: t.cargoId,
            serviceItemId: sid,
            targetSlot: t.targetSlot,
          };
        }),
      npc
    );
    // Prefer direct ship loads, then clearing moves, then anything else
    let pool = free.filter((t) => t.job === 'loadShip');
    if (!pool.length) pool = free.filter((t) => t.clears);
    if (!pool.length) pool = free;
    const chosen = this._pickWeighted(pool);
    if (!chosen) return null;
    const svcPad = this._servicePad(homeBay);
    const pad =
      this._dockTargets().find((p) => bayIndexFromX(p.x) === homeBay) ||
      (svcPad
        ? {
            x: svcPad.x,
            y: 0,
            bayId: svcPad.bayId,
            bayIndex: homeBay,
            occupied: true,
          }
        : null);
    if (!pad) return null;
    return {
      mode: 'work',
      ...chosen,
      targetPad: pad,
    };
  };

  HangarBay.prototype._assignMechanicRoute = function (npc) {
    const pick = this._pickMechanicTask(npc);
    npc.hullTarget = null;
    npc.targetPile = null;
    npc.lingerPile = null;

    if (pick.mode === 'idle' || pick.mode === 'despawn') {
      npc.job = 'idle';
      this._clearTaskClaim(npc);
      return false;
    }

    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay ?? npc.homeBay;
    npc.targetPile = pick.targetPile;
    npc.tripsLeft =
      pick.tripsLeft != null
        ? pick.tripsLeft
        : pick.job === 'removeUpgrade'
          ? 1
          : 2 + ((Math.random() * 3) | 0);
    npc.taskMode = pick.mode;
    npc.stripCategory = pick.stripCategory || null;
    npc.stripHardpointKey = pick.stripHardpointKey || null;
    npc.ferryDest = pick.ferryDest || null;
    npc.ferrySource =
      pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
    npc.directFromSouth = !!pick.directFromSouth;
    npc._claimCargoId = pick.cargoId ?? null;
    if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
    if (pick.mode === 'linger') {
      npc.lingerPile = pick.targetPile;
    }
    this._applyTaskClaim(
      npc,
      pick.job,
      pick.targetPile,
      pick.bay,
      pick.serviceItemId ?? null
    );
    return true;
  };

  HangarBay.prototype._createMechanic = function (id, homeBay, slot) {
    const comp = BAY_COMPUTERS[homeBay];
    const ox = slot === 1 ? -10 : 10;
    const npc = {
      id,
      kind: 'mechanic',
      uid: this._npcUid++,
      alive: true,
      homeBay,
      x: comp.x + ox,
      y: comp.y + 16,
      vx: 0,
      facing: homeBay === 2 ? -1 : 1,
      phase: Math.random() * Math.PI * 2,
      state: 'idleFluff',
      stateT: rand(0.4, 1.2),
      side: homeBay === 0 ? -1 : 1,
      entry: 'apron',
      exit: 'apron',
      stair: STAIRS[homeBay],
      exitStair: STAIRS[homeBay],
      cargo: null,
      droppedCargoId: null,
      floorDropId: null,
      targetPile: null,
      lingerPile: null,
      targetSlot: null,
      mechPhase: null,
      mechHandT: 0,
      _mechLift: null,
      targetPad: null,
      bay: homeBay,
      job: 'idle',
      taskMode: 'idle',
      tripsLeft: 0,
      emergeT: 0,
      exitArmed: true,
      claimKey: null,
      secSinceLastBayTask: rand(5, 40),
      lingerTarget: null,
      gossipWp: null,
      gossipSlot: null,
      lingerFaceRad: null,
      _crossing: false,
      _crossPhase: 0,
      _corridorX: null,
      _crossCool: 0,
      theme: MECH_BAY_THEMES[homeBay] || MECH_BAY_THEMES[0],
      suit: (MECH_BAY_THEMES[homeBay] || MECH_BAY_THEMES[0]).suit,
      helmet: (MECH_BAY_THEMES[homeBay] || MECH_BAY_THEMES[0]).helmet,
      // Draw yaw (8-dir); job/hand math still uses facing ±1
      visHeading: homeBay === 2 ? Math.PI : 0,
      _visOct: homeBay === 2 ? 4 : 0,
      _skirtWp: null,
    };
    if (this._assignMechanicRoute(npc)) {
      this._startMechanicJob(npc);
    } else {
      this._beginIdleFluff(npc);
    }
    this.npcs.push(npc);
  };

  HangarBay.prototype._parkMechanicIdle = function (npc) {
    const comp = BAY_COMPUTERS[npc.homeBay ?? 0];
    npc.x = comp.x + (Math.random() < 0.5 ? -8 : 8);
    npc.y = comp.y + 14;
    npc.cargo = null;
    npc.job = 'idle';
    npc.taskMode = 'idle';
    this._clearTaskClaim(npc);
    this._beginIdleFluff(npc);
  };

  HangarBay.prototype._spawnMechanic = function () {
    /* no-op: fixed roster */
  };

  HangarBay.prototype._tryRerouteMechanicFromExit = function (npc) {
    if (npc.cargo) return false;
    const pick = this._pickMechanicTask(npc);
    if (pick.mode !== 'work' && pick.mode !== 'linger') return false;
    const useful =
      pick.clears ||
      pick.service ||
      pick.job === 'loadShip' ||
      pick.job === 'installUpgrade' ||
      pick.job === 'unloadShip' ||
      pick.job === 'removeUpgrade' ||
      pick.job === 'stageFerry' ||
      pick.mode === 'linger';
    if (!useful) return false;
    npc.tripsLeft = Math.max(
      1,
      pick.tripsLeft != null
        ? pick.tripsLeft
        : pick.job === 'removeUpgrade'
          ? 1
          : npc.tripsLeft || 1
    );
    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay ?? npc.homeBay;
    npc.targetPile = pick.targetPile;
    npc.taskMode = pick.mode;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.stripCategory = pick.stripCategory || null;
    npc.stripHardpointKey = pick.stripHardpointKey || null;
    npc.ferryDest = pick.ferryDest || null;
    npc.ferrySource =
      pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
    npc.directFromSouth = !!pick.directFromSouth;
    npc._claimCargoId = pick.cargoId ?? null;
    if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
    npc.exitArmed = true;
    npc.exitStair = STAIRS[npc.homeBay] || this._nearestStair(npc.x);
    npc.hullTarget = null;
    this._applyTaskClaim(
      npc,
      pick.job,
      pick.targetPile,
      pick.bay,
      pick.serviceItemId ?? null
    );
    this._startMechanicJob(npc);
    return true;
  };

  HangarBay.prototype._mechApproachForSlot = function (pile, slotIdx) {
    const w = this._slotWorld(pile, slotIdx);
    const west = this._forkLaneWest(slotIdx);
    return {
      x: w.x + (west ? -MECH_LANE_OFFSET : MECH_LANE_OFFSET),
      y: w.y + MECH_APPROACH_ALONG,
      facing: west ? 1 : -1,
    };
  };

  HangarBay.prototype._mechCreepForSlot = function (pile, slotIdx, npc = null) {
    const w = this._slotWorld(pile, slotIdx);
    const ap = this._mechApproachForSlot(pile, slotIdx);
    if (npc) npc.facing = ap.facing;
    let cargo = null;
    const ferryPick = npc?.job === 'stageFerry' && !npc.cargo;
    const ferryDrop = npc?.job === 'stageFerry' && !!npc.cargo;
    const loading =
      npc?.job === 'loadShip' || npc?.job === 'installUpgrade' || ferryPick;
    const unloading =
      npc?.job === 'unloadShip' || npc?.job === 'removeUpgrade' || ferryDrop;
    if (unloading && npc?.cargo) cargo = npc.cargo;
    else if (loading && pile?.items?.length) {
      const bay = npc?.bay ?? bayIndexFromX(npc?.targetPad?.x ?? npc?.x ?? 0);
      cargo =
        this._peekServicePileCargo(pile, bay, npc.job, npc) ||
        pile.items[pile.items.length - 1];
    }
    return this._mechPosForCargoCenter(
      w.x,
      w.y,
      npc?.facing ?? ap.facing,
      cargo
    );
  };

  HangarBay.prototype._mechHandLocal = function (cargo = null) {
    if (cargo) {
      const h = cargo.h ?? 8;
      return {
        x: MECH_HAND_REACH_X + (cargo.w ?? 8) * 0.2,
        y: -4 - h * 0.35,
      };
    }
    return { x: MECH_HAND_REACH_X, y: MECH_HAND_GRIP_Y };
  };

  HangarBay.prototype._mechPosForCargoCenter = function (cx, cy, facing, cargo = null) {
    const face = facing >= 0 ? 1 : -1;
    const hand = this._mechHandLocal(cargo);
    return {
      x: cx - face * hand.x,
      y: cy - hand.y,
    };
  };

  HangarBay.prototype._mechResolveSlot = function (npc, pile) {
    if (!pile) return -1;
    const ferryPick = npc.job === 'stageFerry' && !npc.cargo;
    const ferryDrop = npc.job === 'stageFerry' && !!npc.cargo;
    const loading =
      npc.job === 'loadShip' || npc.job === 'installUpgrade' || ferryPick;
    const unloading =
      npc.job === 'unloadShip' || npc.job === 'removeUpgrade' || ferryDrop;
    if (loading && !npc.cargo) {
      const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
      const peek = this._peekServicePileCargo(pile, bay, npc.job, npc);
      if (peek) {
        let slot = peek.pileSlot;
        if (slot == null || slot < 0) {
          this._itemWorldPos(pile, peek);
          slot = peek.pileSlot ?? 0;
        }
        return slot;
      }
      const top = pile.items[pile.items.length - 1];
      if (top) {
        let slot = top.pileSlot;
        if (slot == null || slot < 0) {
          this._itemWorldPos(pile, top);
          slot = top.pileSlot ?? 0;
        }
        return slot;
      }
      return -1;
    }
    if (unloading && npc.cargo) {
      return this._mechClaimDropSlot(npc, pile);
    }
    return 0;
  };

  HangarBay.prototype._mechClaimDropSlot = function (npc, pile) {
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

  HangarBay.prototype._mechCarryOffset = function (npc) {
    const hand = this._mechHandLocal(npc.cargo || npc._mechLift?.cargo);
    const face = npc.facing >= 0 ? 1 : -1;
    return { x: face * hand.x, y: hand.y };
  };

  HangarBay.prototype._mechCargoCenterFromTruck = function (npc, cargo = null) {
    const c = cargo || npc.cargo || npc._mechLift?.cargo;
    const hand = this._mechHandLocal(c);
    const face = npc.facing >= 0 ? 1 : -1;
    return {
      x: npc.x + face * hand.x,
      y: npc.y + hand.y,
    };
  };

  HangarBay.prototype._mechCargoWorldPos = function (npc) {
    const lift = npc._mechLift;
    const t = npc.mechHandT ?? 0;
    if (lift?.cargo && npc.mechPhase === 'handoff') {
      const carry = this._mechCarryOffset(npc);
      const cx = npc.x + carry.x;
      const cy = npc.y + carry.y;
      if (npc.cargo) {
        const pile = this._pileById(npc.targetPile?.id);
        const slot = npc.targetSlot ?? 0;
        const dest = pile ? this._slotWorld(pile, slot) : { x: lift.x, y: lift.y };
        return {
          x: lift.x + (dest.x - lift.x) * t,
          y: lift.y + (dest.y - lift.y) * t,
        };
      }
      return {
        x: lift.x + (cx - lift.x) * t,
        y: lift.y + (cy - lift.y) * t,
      };
    }
    if (npc.cargo) {
      const c = this._mechCarryOffset(npc);
      return { x: npc.x + c.x, y: npc.y + c.y };
    }
    return null;
  };

  HangarBay.prototype._mechBeginPileDrop = function (npc, pile, slotIdx) {
    const carry = this._mechCarryOffset(npc);
    npc._mechLift = {
      cargo: npc.cargo,
      x: npc.x + carry.x,
      y: npc.y + carry.y,
    };
    npc.mechHandT = 0;
    npc.mechPhase = 'handoff';
    npc.targetSlot = slotIdx;
  };

  HangarBay.prototype._mechCompleteDrop = function (npc, pile, slotIdx) {
    if (!npc.cargo) return false;
    if (npc.cargo?.unloadServiceBay != null) {
      const ubay = npc.cargo.unloadServiceBay;
      const already = !!npc.cargo._boardUnloadApplied;
      const pad = this._servicePad(ubay);
      const item = pad?.service?.items?.find(
        (it) =>
          it.type === 'unloadCargo' &&
          it.status !== 'done' &&
          (npc._activeServiceId == null || it.id === npc._activeServiceId)
      );
      if (item) {
        item.status = 'done';
        item.cargoId = null;
        item.pipSettled = false;
        npc._activeServiceId = item.id;
        if (!already) this._applyServiceToShipState(pad, 'unloadCargo');
      }
    }
    npc.cargo.pileSlot = slotIdx;
    npc.targetSlot = slotIdx;
    // Pass npc so our own reservation doesn't force a quadrant reassignment
    // (or fail the push and vanish the crate when the pile is nearly full).
    if (!this._pilePush(pile, npc.cargo, npc)) {
      return false;
    }
    npc.cargo = null;
    npc._mechLift = null;
    npc.mechHandT = 0;
    return true;
  };

  HangarBay.prototype._mechAbortPileWork = function (npc) {
    npc.mechPhase = null;
    npc.targetSlot = null;
    npc._mechLift = null;
    npc.mechHandT = 0;
    const p = this._pileById(npc.targetPile?.id);
    const unloading =
      npc.job === 'unloadShip' ||
      npc.job === 'removeUpgrade' ||
      (npc.job === 'stageFerry' && !!npc.cargo);
    if (unloading && npc.cargo && p && p.items.length >= PILE_CAP) {
      this._beginNextMechanicTrip(npc);
      return;
    }
    if (npc.cargo) {
      const bay = npc.bay ?? bayIndexFromX(npc.x);
      if (!this._depositCargoSafe(npc.cargo, bay, npc)) {
        this._dropFloorCargo(npc);
      } else {
        npc.cargo = null;
      }
    }
    this._beginNextMechanicTrip(npc);
  };

  HangarBay.prototype._mechFinishPileWork = function (npc) {
    npc.mechPhase = null;
    npc.targetSlot = null;
    npc._mechLift = null;
    npc.mechHandT = 0;
    npc._lockFacing = false;
    const loading = npc.job === 'loadShip' || npc.job === 'installUpgrade';
    const unloading = npc.job === 'unloadShip' || npc.job === 'removeUpgrade';
    if (npc.job === 'stageFerry') {
      if (npc.cargo) {
        // Picked up at source — walk to dest staging pile
        const dest = this._pileById(npc.ferryDest?.id) || npc.ferryDest;
        if (!dest) {
          this._depositCargoSafe(npc.cargo, npc.homeBay ?? npc.bay, npc) ||
            this._dropFloorCargo(npc);
          npc.cargo = null;
          this._clearTaskClaim(npc);
          this._beginIdleFluff(npc);
          return;
        }
        npc.targetPile = dest;
        npc.targetSlot = null;
        this._applyTaskClaim(npc, 'stageFerry', dest, npc.bay ?? npc.homeBay);
        npc.state = 'toPile';
        return;
      }
      // No cargo: successful dest drop, or failed pick (crane/someone beat us)
      const destId = npc.ferryDest?.id;
      const atDest = destId && npc.targetPile?.id === destId;
      if (!atDest) {
        this._abandonMechanicStagingFerry(npc);
        return;
      }
      this._clearTaskClaim(npc);
      npc.ferryDest = null;
      npc.ferrySource = null;
      this._noteBayTaskComplete(npc);
      this._beginIdleFluff(npc);
      return;
    }
    if (loading && npc.cargo) {
      npc.hullTarget = null;
      npc.state = 'toShip';
      return;
    }
    if (unloading && !npc.cargo) {
      // Drop finished — walking away from the pile settles the pip green
      this._settleActiveServicePip(npc);
      npc.tripsLeft -= 1;
      if (npc.tripsLeft <= 0) {
        this._noteBayTaskComplete(npc);
        this._beginIdleFluff(npc);
      } else {
        this._beginNextMechanicTrip(npc);
      }
      return;
    }
    this._mechAbortPileWork(npc);
  };

  HangarBay.prototype._updateMechPileWork = function (npc, dt) {
    const pile = this._pileById(npc.targetPile?.id);
    const slotIdx = npc.targetSlot ?? 0;
    const creep = pile ? this._mechCreepForSlot(pile, slotIdx, npc) : null;
    const back = pile ? this._mechApproachForSlot(pile, slotIdx) : null;
    const ferryPick = npc.job === 'stageFerry' && !npc.cargo;
    const ferryDrop = npc.job === 'stageFerry' && !!npc.cargo;
    const loading =
      npc.job === 'loadShip' || npc.job === 'installUpgrade' || ferryPick;
    const unloading =
      npc.job === 'unloadShip' || npc.job === 'removeUpgrade' || ferryDrop;
    const walk = 27;

    switch (npc.mechPhase) {
      case 'creepIn': {
        if (!creep) {
          npc.mechPhase = 'creepOut';
          break;
        }
        if (back?.facing) npc.facing = back.facing;
        if (this._mechMove(npc, creep.x, creep.y, walk * 0.85, dt)) {
          if (loading && !npc.cargo && pile?.items?.length) {
            const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
            const cargo = this._takeServicePileCargo(pile, bay, npc.job, npc);
            if (cargo) {
              const w = this._slotWorld(pile, slotIdx);
              npc._mechLift = { cargo, x: w.x, y: w.y };
              npc.mechHandT = 0;
              npc.mechPhase = 'handoff';
            } else {
              npc.mechPhase = 'creepOut';
            }
          } else if (unloading && npc.cargo && pile && pile.items.length < PILE_CAP) {
            this._mechBeginPileDrop(npc, pile, slotIdx);
          } else if (unloading && npc.cargo && pile && pile.items.length >= PILE_CAP) {
            npc.mechPhase = 'creepOut';
          } else {
            npc.mechPhase = 'creepOut';
          }
        }
        break;
      }
      case 'handoff': {
        if (back?.facing) npc.facing = back.facing;
        npc.mechHandT = Math.min(
          1,
          (npc.mechHandT ?? 0) + dt * MECH_HANDOFF_SPEED
        );
        if (npc.mechHandT < 1 - 0.02) break;
        npc.mechHandT = 1;
        if (npc._mechLift?.cargo && !npc.cargo) {
          npc.cargo = npc._mechLift.cargo;
          npc._mechLift = null;
          if (npc.cargo?.serviceKey != null) {
            npc._activeServiceId = npc.cargo.serviceKey;
          }
          npc.mechPhase = 'creepOut';
        } else if (unloading && npc.cargo && pile) {
          if (!this._mechCompleteDrop(npc, pile, slotIdx)) {
            // Race / full pile — keep the crate on the deck instead of vanishing
            this._dropFloorCargo(npc);
          }
          npc.mechPhase = 'creepOut';
        } else {
          npc.mechPhase = 'creepOut';
        }
        break;
      }
      case 'creepOut': {
        if (!back) {
          this._mechFinishPileWork(npc);
          break;
        }
        if (back.facing) npc.facing = back.facing;
        if (this._mechMove(npc, back.x, back.y, walk * 0.9, dt)) {
          this._mechFinishPileWork(npc);
        }
        break;
      }
      default:
        this._mechAbortPileWork(npc);
    }
  };

  HangarBay.prototype._mechFacingLocked = function (npc) {
    return !!(
      npc.mechPhase ||
      npc._lockFacing ||
      npc.state === 'workPile' ||
      npc.state === 'workShip' ||
      npc.state === 'workWeld'
    );
  };

  HangarBay.prototype._mechSetApproachFacing = function (npc, ap) {
    if (!ap) {
      npc._lockFacing = false;
      return;
    }
    const dist = Math.hypot(npc.x - ap.x, npc.y - ap.y);
    const correctSide =
      ap.facing > 0 ? npc.x <= ap.x + 4 : npc.x >= ap.x - 4;
    if (dist < 12 && correctSide) {
      npc.facing = ap.facing;
      npc._lockFacing = true;
    } else {
      npc._lockFacing = false;
    }
  };

  HangarBay.prototype._mechSetHullFacing = function (npc) {
    const ht = npc.hullTarget;
    if (!ht || ht.workX == null) {
      npc._lockFacing = false;
      return;
    }
    const dist = Math.hypot(npc.x - (ht.x ?? npc.x), npc.y - (ht.y ?? npc.y));
    if (dist < 14) {
      npc.facing = ht.workX >= npc.x ? 1 : -1;
      npc._lockFacing = true;
    } else {
      npc._lockFacing = false;
    }
  };

  HangarBay.prototype._pickMidPile = function (wantCargo) {
    const mid = this._pilesInRow(ROW.M);
    if (wantCargo) {
      const full = mid.filter((p) => p.lane === 'in' && p.items.length > 0);
      return full.length ? pick(full) : null;
    }
    const room = mid.filter((p) => p.lane === 'out' && p.items.length < PILE_CAP);
    return room.length ? pick(room) : null;
  };

  HangarBay.prototype._dockTargets = function () {
    const pads = [];
    const pb = this.playerBay;
    if (pb && this._padWorkable(pb)) {
      pads.push({
        x: pb.x,
        y: 0,
        bayId: pb.bayId,
        bayIndex: pb.bayIndex,
        occupied: true,
      });
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
  };

  HangarBay.prototype._mechUpdateVisHeading = function (npc, moveX, moveY, dt) {
    if (npc._mechSteeredVis) {
      npc._mechSteeredVis = false;
      return;
    }
    const moveDist = Math.hypot(moveX, moveY);
    const faceAng = npc.facing >= 0 ? 0 : Math.PI;
    let target = npc.visHeading ?? faceAng;
    const locked = this._mechFacingLocked(npc);
    if (locked) {
      target = faceAng;
    } else if (moveDist > 0.2) {
      target = Math.atan2(moveY, moveX);
      npc.facing = Math.cos(target) >= 0 ? 1 : -1;
    } else {
      target = faceAng;
    }
    this._crewSteerVisHeading(npc, target, dt);
  };

  HangarBay.prototype._mechStandForWeldTip = function (workX, workY, outNx, outNy) {
    const handX = workX + outNx * WELD_TORCH_REACH;
    const handY = workY + outNy * WELD_TORCH_REACH;
    const facing = workX >= handX ? 1 : -1;
    return this._mechPosForCargoCenter(handX, handY, facing, null);
  };

  HangarBay.prototype._weldTorchTip = function (npc, opts = {}) {
    const scale = opts.scale ?? 1;
    const bob = opts.bob ?? 0;
    const duck = opts.duck ?? 0;
    const hand = this._mechHandLocal(null);
    const face = npc.facing >= 0 ? 1 : -1;
    const hx = npc.x + face * hand.x * scale;
    const hy = npc.y + (hand.y + bob - duck * 0.3) * scale;
    const workX = npc.hullTarget?.workX;
    const workY = npc.hullTarget?.workY;
    let ax;
    let ay;
    let tipX;
    let tipY;
    const reach = WELD_TORCH_REACH * scale;
    if (workX != null && workY != null) {
      const dx = workX - hx;
      const dy = workY - hy;
      const len = Math.hypot(dx, dy) || 1;
      ax = dx / len;
      ay = dy / len;
      // Tip kisses the work point — never punches past the hull/mount
      const use = Math.min(reach, len);
      tipX = hx + ax * use;
      tipY = hy + ay * use;
    } else {
      const oct = this._crewVisOctant(npc);
      const heading = oct * CREW_VIS_OCT;
      ax = Math.cos(heading);
      ay = Math.sin(heading);
      tipX = hx + ax * reach;
      tipY = hy + ay * reach - 1.5 * scale;
    }
    return {
      x: tipX,
      y: tipY,
      handX: hx,
      handY: hy,
      ax,
      ay,
    };
  };

  HangarBay.prototype._emitWeldArc = function (npc) {
    const tip = this._weldTorchTip(npc);
    const workX = npc.hullTarget?.workX ?? npc.x;
    const workY = npc.hullTarget?.workY ?? npc.y;
    const hardpoint =
      npc.job === 'installUpgrade' || npc.job === 'removeUpgrade';
    const layer = hardpoint
      ? Math.random() < 0.5
        ? 'under'
        : 'over'
      : 'under';

    const pad = npc.targetPad;
    const padX = pad?.x ?? npc.x;
    const padY = pad?.y ?? 0;
    // Nudge wash under the hull footprint toward pad center
    const gx = workX + (padX - workX) * 0.28;
    const gy = workY + (padY - workY) * 0.28;
    const warmBurst = Math.random() < 0.38;
    const bay =
      npc.bay ??
      (typeof pad?.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(padX));
    const padAngle = this._padAngleForBay(bay);
    const g = npc._weldGlow || (npc._weldGlow = {});
    // Midway punch: readable under hull without the full bright pass
    g.intensity = Math.min(1.18, (g.intensity || 0) + rand(0.58, 0.78));
    g.flash = Math.min(0.85, (g.flash || 0) + rand(0.35, 0.75));
    g.x = gx;
    g.y = gy;
    g.amber = warmBurst;
    g.speckleSeed = Math.random();
    g.padX = padX;
    g.padY = padY;
    g.padAngle = padAngle;
    g.bay = bay;
    // Over-layer bursts also kiss the plating (drawn after ships)
    if (layer === 'over') {
      g.surfaceKiss = Math.min(1, (g.surfaceKiss || 0) + 0.85);
    }

    const dx = workX - tip.x;
    const dy = workY - tip.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const padTag = { padX, padY, padAngle, bay };

    // Arc core at tip
    this._sparkle.push({
      x: tip.x,
      y: tip.y,
      life: rand(0.07, 0.16),
      max: 0.16,
      r: rand(1.4, 2.6),
      weld: true,
      layer,
      core: true,
      vx: nx * rand(8, 20),
      vy: ny * rand(8, 20),
      ...padTag,
    });

    const count = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < count; i++) {
      const speed = rand(45, 95);
      const warm = warmBurst || Math.random() < 0.22;
      this._sparkle.push({
        x: tip.x + rand(-1.2, 1.2),
        y: tip.y + rand(-1.2, 1.2),
        life: rand(0.14, 0.38),
        max: 0.38,
        r: rand(0.65, 1.7),
        weld: true,
        layer,
        warm,
        vx: nx * speed + rand(-38, 38),
        vy: ny * speed + rand(-28, 28),
        ...padTag,
      });
    }

    if (Math.random() < 0.28) {
      this._sparkle.push({
        x: workX + rand(-2.5, 2.5),
        y: workY + rand(-2, 2),
        life: rand(0.28, 0.5),
        max: 0.5,
        r: rand(1.8, 3.2),
        dust: true,
        layer: 'under',
        vx: rand(-10, 10),
        vy: rand(-18, -4),
        ...padTag,
      });
    }
  };

  HangarBay.prototype._mechanicJobValid = function (npc) {
    if (npc.job === 'weld') return this._padWorkable(npc.targetPad);
    if (npc.job === 'idle' || npc.taskMode === 'despawn') return false;
    if (npc.job === 'stageFerry') {
      if (this._mechStagingBeatenByCrane(npc)) return false;
      const p = this._pileById(npc.targetPile?.id);
      if (!p) return false;
      if (npc.cargo) return p.items.length < PILE_CAP;
      return p.items.length > 0;
    }
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
      if (
        !npc.cargo &&
        npc.job === 'loadShip' &&
        this._mechStagingBeatenByCrane(npc)
      ) {
        return false;
      }
      return !npc.cargo ? p.items.length > 0 : true;
    }
    if (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') {
      if (npc.cargo) return p.items.length < PILE_CAP;
      // Going to ship to pull freight/parts — outbound must have room
      return p.items.length < PILE_CAP;
    }
    return false;
  };

  HangarBay.prototype._startMechanicJob = function (npc) {
    npc.hullTarget = null;
    npc.mechPhase = null;
    npc.mechHandT = 0;
    npc._mechLift = null;
    if (npc.taskMode === 'despawn' || npc.taskMode === 'idle' || npc.job === 'idle') {
      this._clearTaskClaim(npc);
      this._beginIdleFluff(npc);
      return;
    }
    if (npc.taskMode === 'linger') {
      npc.lingerPile = npc.targetPile;
      npc.state = 'linger';
      npc.stateT = 0.5;
      return;
    }
    if (!this._mechanicJobValid(npc)) {
      if (npc._revalidating) {
        this._clearTaskClaim(npc);
        this._beginIdleFluff(npc);
        npc._revalidating = false;
        return;
      }
      npc._revalidating = true;
      this._beginNextMechanicTrip(npc);
      npc._revalidating = false;
      return;
    }
    this._bindActiveServiceForMech(npc);
    if (npc.job === 'weld') {
      // Fresh Hull pip → plan 2–3 hull stations; keep plan when resuming mid-pip
      if (npc.weldSpotsTotal == null) {
        const spots = Math.max(1, npc.tripsLeft || weldSpotsForPip());
        npc.weldSpotsTotal = spots;
        npc.weldSpotIndex = 0;
        npc.tripsLeft = spots;
      }
      npc.state = 'toShip';
      return;
    }
    if (
      npc.job === 'loadShip' ||
      npc.job === 'installUpgrade' ||
      npc.job === 'stageFerry'
    ) {
      npc.state = npc.targetPile ? 'toPile' : 'idleFluff';
      if (npc.state === 'idleFluff') this._beginIdleFluff(npc);
    } else if (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') {
      npc.state = npc.cargo ? 'toPile' : 'toShip';
    } else {
      this._clearTaskClaim(npc);
      this._beginIdleFluff(npc);
    }
  };

  HangarBay.prototype._beginNextMechanicTrip = function (npc) {
    npc.hullTarget = null;
    this._clearSkirtStick(npc);
    this._clearBacksplashCross(npc);
    npc._dodgeCorridorX = null;
    if (npc.job === 'weld') {
      npc.tripsLeft -= 0;
      if (npc.tripsLeft <= 0) {
        this._noteBayTaskComplete(npc);
        this._clearTaskClaim(npc);
        this._beginIdleFluff(npc);
        return;
      }
      npc.state = 'toShip';
      return;
    }

    if (npc.tripsLeft <= 0) {
      this._noteBayTaskComplete(npc);
      this._clearTaskClaim(npc);
      this._beginIdleFluff(npc);
      return;
    }

    const pick = this._pickMechanicTask(npc);
    if (pick.mode === 'idle' || pick.mode === 'despawn') {
      this._noteBayTaskComplete(npc);
      this._clearTaskClaim(npc);
      this._beginIdleFluff(npc);
      return;
    }

    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay ?? npc.homeBay;
    npc.targetPile = pick.targetPile;
    npc.targetSlot = null;
    npc.taskMode = pick.mode;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.stripCategory = pick.stripCategory || null;
    npc.stripHardpointKey = pick.stripHardpointKey || null;
    npc.ferryDest = pick.ferryDest || null;
    npc.ferrySource = pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
    npc.directFromSouth = !!pick.directFromSouth;
    npc._claimCargoId = pick.cargoId ?? null;
    if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
    if (pick.tripsLeft != null) npc.tripsLeft = pick.tripsLeft;
    npc.exitStair = STAIRS[npc.homeBay] || this._nearestStair(npc.targetPad?.x ?? npc.x);
    this._applyTaskClaim(
      npc,
      pick.job,
      pick.targetPile,
      pick.bay,
      pick.serviceItemId ?? null
    );
    this._startMechanicJob(npc);
  };

  HangarBay.prototype._mechMove = function (npc, tx, ty, speed, dt) {
    const wy = BACKSPLASH_Y;
    const goalX = tx;
    const goalY = ty;
    let diverted = false;
    const pileJob = this._isPileApproachState(npc);

    // Don't fight an in-progress corridor cross with skirt redirects
    if (!npc._crossing && this._opsBays.size) {
      let exceptBay = npc.state === 'clearHot' ? npc.clearBay : null;
      // Pile jobs may re-enter own hot bay only when reclaiming; otherwise skirt neighbors only
      if (pileJob && npc.state === 'toFloorDrop') {
        exceptBay = npc.homeBay;
      }

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

    // Embedded in a wall — eject to clear Y + corridor (same-side) or full cross
    if (this._npcInBacksplash(npc.x, npc.y) != null) {
      const wantSouth = this._backsplashSideSouth(pathY);
      const npcSouth = this._backsplashSideSouth(npc.y);
      if (wantSouth === npcSouth) {
        const clearY = this._backsplashGateY(wantSouth);
        const corridorX = this._pickCorridorX(npc.x, pathX, npc);
        this._moveToward(npc, corridorX, clearY, speed, dt);
        return false;
      }
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
      const corridorX = this._pickCorridorX(npc.x, pathX, npc);
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
  };

  HangarBay.prototype._updateMechanic = function (npc, dt, hazard) {
    const ox = npc.x;
    const oy = npc.y;
    try {
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
      case 'emerge':
      case 'leaveHatch': {
        // Stairs removed — treat as idle fluff / job start
        npc.exitArmed = true;
        if (npc.taskMode === 'despawn' || npc.job === 'idle' || npc.taskMode === 'idle') {
          this._beginIdleFluff(npc);
        } else {
          this._startMechanicJob(npc);
        }
        break;
      }
      case 'idleFluff': {
        // Interrupt for real bay work
        const wake = this._pickMechanicTask(npc);
        if (wake.mode === 'work' || wake.mode === 'linger') {
          npc.job = wake.job;
          npc.targetPad = wake.targetPad;
          npc.bay = wake.bay ?? npc.homeBay;
          npc.targetPile = wake.targetPile;
          npc.targetSlot = null;
          npc.taskMode = wake.mode;
          npc.lingerPile = wake.mode === 'linger' ? wake.targetPile : null;
          npc.ferryDest = wake.ferryDest || null;
          npc.ferrySource =
            wake.ferrySource || (wake.job === 'stageFerry' ? wake.targetPile : null);
          npc.directFromSouth = !!wake.directFromSouth;
          npc.tripsLeft =
            wake.tripsLeft != null
              ? wake.tripsLeft
              : 2 + ((Math.random() * 3) | 0);
          npc._claimCargoId = wake.cargoId ?? null;
          if (wake.serviceItemId != null) npc._activeServiceId = wake.serviceItemId;
          this._applyTaskClaim(
            npc,
            wake.job,
            wake.targetPile,
            wake.bay,
            wake.serviceItemId ?? null
          );
          this._startMechanicJob(npc);
          break;
        }
        const tgt = npc.lingerTarget;
        if (tgt) {
          // Never route idle fluff across the forklift road
          const lx = tgt.x;
          const ly = Math.min(tgt.y, MECH_LINGER_Y_MAX);
          if (npc.y > MECH_LINGER_Y_MAX) {
            this._mechMove(npc, npc.x, MECH_LINGER_Y_MAX - 4, walk * 0.9, dt);
          } else {
            this._mechMove(npc, lx, ly, walk * 0.85, dt);
          }
          if (npc.y > MECH_LINGER_Y_MAX) npc.y = MECH_LINGER_Y_MAX;
          if (Math.hypot(npc.x - lx, npc.y - ly) < 4) {
            npc.x += Math.sin(npc.phase) * 0.12;
            if (npc.gossipWp) {
              // Face huddle centroid (or waypoint center if alone)
              let cx = lx;
              let cy = ly;
              let n = 0;
              let sx = 0;
              let sy = 0;
              for (const o of this.npcs) {
                if (
                  o !== npc &&
                  o.kind === 'mechanic' &&
                  o.alive &&
                  o.gossipWp === npc.gossipWp
                ) {
                  sx += o.x;
                  sy += o.y;
                  n++;
                }
              }
              if (n > 0) {
                cx = sx / n;
                cy = sy / n;
              } else {
                const wp = getGossipWaypoints().find((w) => w.id === npc.gossipWp);
                if (wp) {
                  cx = wp.x;
                  cy = wp.y;
                }
              }
              const ang = Math.atan2(cy - npc.y, cx - npc.x);
              npc.visHeading = ang;
              npc.facing = Math.cos(ang) >= 0 ? 1 : -1;
            } else if (tgt.faceDeg != null) {
              if (npc.lingerFaceRad == null) {
                const slack = ((tgt.faceSlackDeg ?? 0) * Math.PI) / 180;
                const base = (tgt.faceDeg * Math.PI) / 180;
                npc.lingerFaceRad = base + (Math.random() * 2 - 1) * slack;
              }
              this._crewSteerVisHeading(npc, npc.lingerFaceRad, dt);
              npc.facing = Math.cos(npc.visHeading ?? 0) >= 0 ? 1 : -1;
            }
          }
        }
        if (npc.stateT <= 0) {
          this._beginIdleFluff(npc);
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
        // Crane got this south-staging crate first — drop the assist / direct-load
        if (
          !npc.cargo &&
          this._mechStagingBeatenByCrane(npc)
        ) {
          this._abandonMechanicStagingFerry(npc);
          break;
        }
        if (
          (npc.job === 'stageFerry' ||
            (npc.job === 'loadShip' && npc.directFromSouth)) &&
          !npc.cargo &&
          !p.items.length
        ) {
          this._abandonMechanicStagingFerry(npc);
          break;
        }
        const unloading =
          npc.job === 'unloadShip' ||
          npc.job === 'removeUpgrade' ||
          (npc.job === 'stageFerry' && !!npc.cargo);
        if (unloading && p.items.length >= PILE_CAP && npc.cargo) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        if (unloading && npc.cargo) {
          // Re-validate / lock claim each frame so approach lane matches deposit
          npc.targetSlot = this._mechClaimDropSlot(npc, p);
        } else if (npc.targetSlot == null) {
          npc.targetSlot = this._mechResolveSlot(npc, p);
        }
        if (npc.targetSlot < 0) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        const slot = npc.targetSlot;
        const ap = this._mechApproachForSlot(p, slot);
        this._mechSetApproachFacing(npc, ap);
        if (this._mechMove(npc, ap.x, ap.y, walk, dt)) {
          npc.targetSlot = slot;
          npc.facing = ap.facing;
          npc._lockFacing = true;
          npc.mechPhase = 'creepIn';
          npc.mechHandT = 0;
          npc._mechLift = null;
          npc.state = 'workPile';
          npc.stateT = 0;
        }
        break;
      }
      case 'linger': {
        const p = this._pileById(npc.lingerPile?.id || npc.targetPile?.id);
        const slot = npc.targetSlot ?? (p ? this._mechResolveSlot(npc, p) : 0);
        const ap = p ? this._mechApproachForSlot(p, slot >= 0 ? slot : 0) : null;
        const tx = ap ? ap.x : npc.x;
        const ty = ap ? ap.y : npc.y;
        this._mechSetApproachFacing(npc, ap);
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
          npc.targetSlot = null;
          npc.taskMode = 'work';
          npc.lingerPile = null;
          npc.stripCategory = pick.stripCategory || null;
          npc.stripHardpointKey = pick.stripHardpointKey || null;
          npc.ferryDest = pick.ferryDest || null;
          npc.ferrySource =
            pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
          npc.directFromSouth = !!pick.directFromSouth;
          npc._claimCargoId = pick.cargoId ?? null;
          if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
          if (pick.tripsLeft != null) npc.tripsLeft = pick.tripsLeft;
          this._applyTaskClaim(
            npc,
            pick.job,
            pick.targetPile,
            pick.bay,
            pick.serviceItemId ?? null
          );
          this._startMechanicJob(npc);
        } else if (pick.mode === 'linger') {
          npc.job = pick.job;
          npc.targetPad = pick.targetPad;
          npc.bay = pick.bay;
          npc.targetPile = pick.targetPile;
          npc.targetSlot = null;
          npc.lingerPile = pick.targetPile;
          npc.stripCategory = pick.stripCategory || null;
          npc.stripHardpointKey = pick.stripHardpointKey || null;
          npc.ferryDest = pick.ferryDest || null;
          npc.ferrySource =
            pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
          npc.directFromSouth = !!pick.directFromSouth;
          npc._claimCargoId = pick.cargoId ?? null;
          if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
          if (pick.tripsLeft != null) npc.tripsLeft = pick.tripsLeft;
          this._applyTaskClaim(
            npc,
            pick.job,
            pick.targetPile,
            pick.bay,
            pick.serviceItemId ?? null
          );
          npc.stateT = 0.55;
        } else {
          this._clearTaskClaim(npc);
          this._beginIdleFluff(npc);
        }
        break;
      }
      case 'workPile': {
        if (
          !npc.cargo &&
          !npc._mechLift?.cargo &&
          this._mechStagingBeatenByCrane(npc)
        ) {
          this._abandonMechanicStagingFerry(npc);
          break;
        }
        if (npc.mechPhase) {
          this._updateMechPileWork(npc, dt);
          break;
        }
        this._mechAbortPileWork(npc);
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
          const bay =
            npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
          if (npc.job === 'installUpgrade' || npc.job === 'removeUpgrade') {
            const hpKey = this._upgradeHardpointKeyForNpc(npc, bay);
            npc.workHardpointKey = hpKey;
            npc.hullTarget = hpKey
              ? this._shipHardpointApproach(pad, hpKey)
              : this._shipHullApproach(pad, 'upgrade');
          } else {
            const mode = npc.job === 'weld' ? 'weld' : 'cargo';
            npc.hullTarget = this._shipHullApproach(pad, mode);
          }
        }
        // Face the work spot only when close; travel facing owns the walk-up
        this._mechSetHullFacing(npc);
        if (this._mechMove(npc, npc.hullTarget.x, npc.hullTarget.y, walk, dt)) {
          if (npc.hullTarget?.workX != null) {
            npc.facing = npc.hullTarget.workX >= npc.x ? 1 : -1;
          }
          npc._lockFacing = true;
          if (npc.job === 'weld') {
            npc.state = 'workWeld';
            npc.stateT = rand(1.1, 1.9);
            this._beginBoardProgress(npc, 'repair');
          } else {
            npc.state = 'workShip';
            npc.stateT = npc.job === 'installUpgrade' || npc.job === 'removeUpgrade'
              ? rand(1.2, 1.9)
              : rand(0.7, 1.1);
            this._beginBoardProgress(npc, this._boardProgressTypeForJob(npc));
          }
        }
        break;
      }
      case 'workWeld': {
        if (!this._padWorkable(npc.targetPad)) {
          npc.hullTarget = null;
          npc._weldGlow = null;
          npc._lockFacing = false;
          this._clearBoardProgress(npc);
          this._beginNextMechanicTrip(npc);
          break;
        }
        if (npc.hullTarget?.workX != null) {
          npc.facing = npc.hullTarget.workX >= npc.x ? 1 : -1;
          npc._lockFacing = true;
        }
        this._tickBoardProgress(npc);
        if (Math.random() < 0.55) this._emitWeldArc(npc);
        if (npc.stateT > 0) break;
        const weldBay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
        const pad = this._servicePad(weldBay);
        // Finish this spot's fraction, then pause meter while walking to the next
        npc.weldSpotIndex = (npc.weldSpotIndex || 0) + 1;
        npc.tripsLeft -= 1;
        this._clearBoardProgress(npc);
        this._syncRepairHullMeter(pad);
        npc.hullTarget = null;
        npc._weldGlow = null;

        if (npc.tripsLeft <= 0 || weldBay !== npc.homeBay) {
          // Last spot of this Hull pip — mark done only now (hull already at pip end)
          if (npc._activeServiceId != null || npc._claimServiceItemId != null) {
            this._completeServiceKey(
              npc._activeServiceId ?? npc._claimServiceItemId
            );
          } else {
            this._completeServiceType(weldBay, 'repair');
          }
          this._syncRepairHullMeter(pad);
          this._noteBayTaskComplete(npc);
          this._settleActiveServicePip(npc);
          npc.tripsLeft = 0;
          npc.weldSpotIndex = 0;
          npc.weldSpotsTotal = null;
          this._clearTaskClaim(npc);
          this._beginIdleFluff(npc);
        } else {
          // Walk to next hull station — board % holds until sparks resume
          npc._lockFacing = false;
          npc.state = 'toShip';
        }
        break;
      }
      case 'workShip': {
        if (!this._padWorkable(npc.targetPad)) {
          npc.hullTarget = null;
          npc._weldGlow = null;
          this._clearBoardProgress(npc);
          this._beginNextMechanicTrip(npc);
          break;
        }
        const upgrading =
          npc.job === 'installUpgrade' || npc.job === 'removeUpgrade';
        if (upgrading && npc.hullTarget?.workX != null) {
          npc.facing = npc.hullTarget.workX >= npc.x ? 1 : -1;
          npc._lockFacing = true;
        }
        this._tickBoardProgress(npc);
        const freightJob =
          npc.job === 'loadShip' || npc.job === 'unloadShip';
        if (upgrading && Math.random() < 0.6) {
          this._emitWeldArc(npc);
        } else if (freightJob && Math.random() < 0.4) {
          // Soft dust puff while seating / pulling hold freight
          const wx = npc.hullTarget?.workX ?? npc.x;
          const wy = npc.hullTarget?.workY ?? npc.y;
          this._sparkle.push({
            x: wx + rand(-5, 5),
            y: wy + rand(-3, 4),
            life: rand(0.25, 0.55),
            max: 0.55,
            r: rand(1.6, 3.4),
            dust: true,
            vx: rand(-6, 6),
            vy: rand(-2, 8),
          });
        }
        if (npc.stateT > 0) break;
        const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);

        if ((npc.job === 'loadShip' || npc.job === 'installUpgrade') && npc.cargo) {
          if (npc.job === 'installUpgrade') {
            const ok = this._installCatalogPart(bay, npc.cargo);
            if (!ok) {
              // Socket still occupied — return part to UP-in and strip first
              const failedCat =
                npc.cargo.catalogCategory ||
                categoryFromFreightLabel(npc.cargo.label) ||
                getItem(npc.cargo.catalogItemId)?.category;
              const failedKey = npc.cargo.targetHardpointKey || null;
              const upIn = this._bayPile(bay, 'in', ROW.N);
              if (upIn && upIn.items.length < PILE_CAP) {
                upIn.items.push(npc.cargo);
                npc.cargo = null;
                npc.stripCategory = failedCat || npc.stripCategory;
                npc.stripHardpointKey = failedKey || npc.stripHardpointKey;
                this._clearBoardProgress(npc);
                this._beginNextMechanicTrip(npc);
                break;
              }
            }
          }
          if (npc.cargo?.serviceKey != null) {
            npc._activeServiceId = npc.cargo.serviceKey;
          }
          this._completeLoadService(bay, npc.cargo, npc.job);
          this._clearBoardProgress(npc);
          this._noteBayTaskComplete(npc);
          npc.cargo = null;
          npc.tripsLeft -= 1;
          npc.hullTarget = null;
          npc._weldGlow = null;
          // Walking away from the pad settles the pip green
          this._settleActiveServicePip(npc);
          if (npc.tripsLeft <= 0) {
            this._clearTaskClaim(npc);
            this._beginIdleFluff(npc);
          } else this._beginNextMechanicTrip(npc);
        } else if ((npc.job === 'loadShip' || npc.job === 'installUpgrade') && !npc.cargo) {
          this._clearBoardProgress(npc);
          this._beginNextMechanicTrip(npc);
        } else if (npc.job === 'unloadShip' && !npc.cargo) {
          const dest = this._bayPile(bay, 'out', ROW.M);
          if (!dest || dest.items.length >= PILE_CAP) {
            this._clearBoardProgress(npc);
            this._beginNextMechanicTrip(npc);
            break;
          }
          // Reflect unload on the board as soon as the crate leaves the ship —
          // physical freight matches the square that disappeared
          const pad = this._servicePad(bay);
          let unloadedBlock = null;
          if (pad?.shipState?.cargoMk > 0) {
            if (!pad.shipState.cargoHold) {
              pad.shipState.cargoHold = packCargoHold(
                pad.shipState.cargoMk,
                pad.shipState.cargoSpace ?? 0.4
              );
            }
            unloadedBlock = removeCargoHoldBlock(pad.shipState.cargoHold);
            syncCargoSpace(pad.shipState);
          }
          npc.cargo = makeCargo(crateKindFromHoldBlock(unloadedBlock));
          npc.cargo.unloadServiceBay = bay;
          npc.cargo._boardUnloadApplied = true;
          npc.targetPile = dest;
          npc.targetSlot = null;
          npc.hullTarget = null;
          this._clearBoardProgress(npc);
          this._applyTaskClaim(
            npc,
            'unloadShip',
            npc.targetPile,
            bay,
            npc._claimServiceItemId ?? npc._activeServiceId
          );
          npc.state = 'toPile';
        } else if (npc.job === 'removeUpgrade' && !npc.cargo) {
          this._clearBoardProgress(npc);
          const dest = this._bayPile(bay, 'out', ROW.N);
          if (!dest || dest.items.length >= PILE_CAP) {
            this._beginNextMechanicTrip(npc);
            break;
          }
          const stripped = this._stripCatalogPart(
            bay,
            npc.stripCategory,
            npc.stripHardpointKey
          );
          if (!stripped) {
            // Don't weld-loop forever if strip can't resolve a part
            npc._stripFailCount = (npc._stripFailCount || 0) + 1;
            if (npc._stripFailCount >= 2) {
              npc._stripFailCount = 0;
              this._clearTaskClaim(npc);
              this._beginIdleFluff(npc);
            } else {
              this._beginNextMechanicTrip(npc);
            }
            break;
          }
          npc._stripFailCount = 0;
          npc.cargo = stripped;
          npc.targetPile = dest;
          npc.targetSlot = null;
          npc.hullTarget = null;
          npc._weldGlow = null;
          this._applyTaskClaim(npc, 'removeUpgrade', npc.targetPile, bay);
          npc.state = 'toPile';
        } else {
          this._clearBoardProgress(npc);
          npc._weldGlow = null;
          this._beginNextMechanicTrip(npc);
        }
        break;
      }
      case 'toExit':
      case 'descend':
      case 'exitDoor': {
        // Stairs removed — dump cargo if any and idle on apron
        this._clearTaskClaim(npc);
        if (npc.cargo) {
          const bay = npc.homeBay ?? bayIndexFromX(npc.x);
          if (!this._depositCargoSafe(npc.cargo, bay)) {
            this._dropFloorCargo(npc);
          } else {
            npc.cargo = null;
          }
        }
        if (this._tryRerouteMechanicFromExit(npc)) break;
        this._beginIdleFluff(npc);
        break;
      }
      default:
        this._beginIdleFluff(npc);
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
      npc.state === 'leaveHatch' ||
      npc.state === 'idleFluff' ||
      npc.state === 'gossip' ||
      npc.state === 'flee' ||
      npc.state === 'resumeWait'
    ) {
      return;
    }
    // Mechanics walk over pads freely — keep-out only for any leftover states
    // (forklifts still use _padKeepOut in their own update).
    } finally {
      if (npc.state === 'idleFluff' && npc.lingerFaceRad != null) {
        this._crewSteerVisHeading(npc, npc.lingerFaceRad, dt);
      } else if (npc.state === 'idleFluff' && npc.gossipWp) {
        // Keep inward facing set in idleFluff arrive; light steer only
        if (npc.visHeading != null) {
          this._crewSteerVisHeading(npc, npc.visHeading, dt);
        } else {
          this._mechUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
        }
      } else {
        this._mechUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
      }
    }
  };

  HangarBay.prototype._paintWeldHullWashLayers = function (ctx, g) {
    const heading = headingIndexFromAngle(g.padAngle);
    // Typical hull extrude liftH ≈ h*0.45 with h≈4.5–5.5 → ~2.2 on the deck
    const deckH = 2.35;
    const midH = deckH * 0.48;
    const deckLift = angledLiftLocal(heading, deckH);
    const midLift = angledLiftLocal(heading, midH);
    const depthY = angledDepthScale(heading);

    const layers = [
      { lx: 0, ly: 0, strength: 0.5, label: 'base' },
      { lx: midLift.x, ly: midLift.y, strength: 0.78, label: 'sides' },
      { lx: deckLift.x, ly: deckLift.y, strength: 1, label: 'deck' },
    ];

    for (const layer of layers) {
      // Lift is ship-local (same space as extrude); convert to world offset
      const liftW = this._shipLocalToWorld(0, 0, layer.lx, layer.ly, g.padAngle);
      const ox = g.padX + liftW.x;
      const oy = g.padY + liftW.y;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(g.padAngle);
      ctx.scale(1, depthY);
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        SHIP_EXTENT.LENGTH * 0.52,
        SHIP_EXTENT.BEAM * 0.52,
        0,
        0,
        Math.PI * 2
      );
      ctx.clip();
      ctx.scale(1, 1 / depthY);
      ctx.rotate(-g.padAngle);
      ctx.translate(-ox, -oy);

      for (const p of g.paints) {
        this._paintSparkDeckGlow(
          ctx,
          p.x + liftW.x,
          p.y + liftW.y,
          p.lifeA * p.strength * layer.strength,
          p.src
        );
      }
      ctx.restore();
    }
  };
}
