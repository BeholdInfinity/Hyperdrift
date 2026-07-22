/**
 * VisitorTraffic — HangarBay prototype mixin.
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
  nextServiceSeq,
  SERVICE_STAGING_TYPES,
} from './cargoCatalog.js';
import { rand, pick, randInt, thrusterActivity, bayLaneHalf, weldSpotsForPip, craneJobDistScale } from './helpers.js';


export function attachVisitorTraffic(HangarBay) {
  HangarBay.prototype._fireVisitorManeuverBurst = function (pad, power) {
    if (!pad.visitorId) return;
    const def = this._ensurePadShipDef(pad);
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(def);
    clearVisitorThrusters(pad);
    const prop = getVisitorPropulsion(def);
    for (const m of prop.thrusters) pad.thrusters[m.key] = power;
  };

  HangarBay.prototype._fireVisitorNoseBrake = function (pad, power) {
    if (!pad.visitorId) return;
    const def = this._ensurePadShipDef(pad);
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(def);
    clearVisitorThrusters(pad);
    const prop = getVisitorPropulsion(def);
    const noses = prop.thrusters.filter((m) => m.key.startsWith('nose'));
    if (noses.length) {
      for (const m of noses) pad.thrusters[m.key] = power;
    } else {
      // No nose thrusters — hover on laterals + light engine for settle cue
      for (const m of prop.thrusters) pad.thrusters[m.key] = power * 0.55;
      pad.thrusters.mainEngine = power * 0.25;
    }
  };

  HangarBay.prototype._fireVisitorEngine = function (pad, power) {
    if (!pad.visitorId) return;
    const def = this._ensurePadShipDef(pad);
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(def);
    clearVisitorThrusters(pad);
    pad.thrusters.mainEngine = power;
  };

  HangarBay.prototype._finishVisitorLeave = function (pad, { clearCargo = true } = {}) {
    this._queueSpaceEgress(pad);
    clearPadVisitor(pad);
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
  };

  HangarBay.prototype._finishVisitorArrive = function (pad) {
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
    if (pad.bayIndex != null) this._spaceApproach[pad.bayIndex] = null;
    this._beginCaptainService(pad);
  };

  HangarBay.prototype.rerollSidePadVisitor = function (bayIndex) {
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;

    const prevVisitorId = pad.visitorId;

    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    pad.service = null;
    pad.shipState = null;
    clearPadVisitor(pad);

    pad.padMk = this._rollVisitorPadMk();
    let visitorId = pickVisitorId(pad.padMk);
    if (visitorId === prevVisitorId) {
      const retry = pickVisitorId(pad.padMk);
      if (retry) visitorId = retry;
    }
    equipPadVisitor(pad, visitorId);
    this._finishVisitorArrive(pad);
    return true;
  };

  HangarBay.prototype._rollVisitorPadMk = function () {
    return rollVisitorPadMk(this._playerPadMk());
  };

  HangarBay.prototype._beginCaptainService = function (pad) {
    if (!pad?.visitorId) return;
    const shipDef = this._ensurePadShipDef(pad);
    const cargoMk = cargoMkForVisitor(pad.visitorId, pad.shipDef);
    const bias = visitorServiceBias(pad.visitorId);
    const ammoBase = rand(0.05, 1);
    const cargoSpace = rand(0.05, 1);
    const fuel = rand(0.05, 1);
    const hull = rand(0.05, 1);
    const bullets = Math.max(0.05, Math.min(1, ammoBase + rand(-0.12, 0.12)));
    const shells = Math.max(0.05, Math.min(1, ammoBase + rand(-0.12, 0.12)));
    const cargoHold = packCargoHold(cargoMk, cargoSpace);
    const shipState = {
      fuel,
      hull,
      bullets,
      shells,
      ammo: Math.min(bullets, shells),
      cargoSpace: cargoMk > 0 ? cargoSpaceFromHold(cargoHold) : 1,
      // Display-only Mk stubs (1–3); real component tiers TBD later
      hullMk: randInt(1, 3),
      fuelMk: randInt(1, 3),
      bulletsMk: randInt(1, 3),
      shellsMk: randInt(1, 3),
      cargoMk,
      cargoHold,
      _svcStart: { fuel, hull, bullets, shells },
    };
    pad.shipState = shipState;
    const items = [];
    const push = (type, extra = {}) => {
      items.push({
        id: `svc${nextServiceSeq()}`,
        type,
        status: 'pending',
        kindLabel: null,
        cargoId: null,
        ...extra,
      });
    };
    const pushN = (n, type, extra = {}) => {
      for (let i = 0; i < n; i++) push(type, extra);
    };

    pushN(meterServiceUnits(shipState.fuel, bias.fuel), 'refuel', {
      kindLabel: 'FUEL',
      priority: 2,
    });
    {
      const hullN = hullRepairPipCount(shipState.hull, bias.hull);
      for (let i = 0; i < hullN; i++) {
        push('repair', { priority: 3, healAmt: hullPipHealAmount() });
      }
    }
    pushN(meterServiceUnits(shipState.bullets, bias.ammo), 'reloadBullets', {
      kindLabel: 'BULLETS',
      priority: 2,
    });
    pushN(meterServiceUnits(shipState.shells, bias.ammo), 'reloadShells', {
      kindLabel: 'SHELLS',
      priority: 2,
    });

    // Cargo: 1 load/unload = 1 slot. Unloads before loads (priority + free-after-unload cap).
    // Empty hold → no unload. Max unloads = filled at landing; max loads = free after those unloads.
    if (cargoMk > 0 && cargoHold?.slots) {
      let used = 0;
      for (const c of cargoHold.cells || []) used += (c.w || 1) * (c.h || 1);
      const freeSlots = Math.max(0, cargoHold.slots - used);
      const filledSlots = used;
      const unloadN =
        filledSlots <= 0
          ? 0
          : Math.min(
              filledSlots,
              cargoServiceUnits(filledSlots, filledSlots / cargoHold.slots, bias.cargo)
            );
      const freeAfterUnload = freeSlots + unloadN;
      const loadN =
        freeAfterUnload <= 0
          ? 0
          : Math.min(
              freeAfterUnload,
              cargoServiceUnits(
                freeAfterUnload,
                freeAfterUnload / cargoHold.slots,
                bias.cargo
              )
            );
      pushN(unloadN, 'unloadCargo', { priority: 1 });
      for (let i = 0; i < loadN; i++) {
        push('loadCargo', { kindLabel: 'CRATE', priority: 2 });
      }
    }

    // Upgrades: exact hardpoint + matching catalog item (forklift fetches that item)
    const upgradeCount = (Math.random() * 3) | 0; // 0–2
    const usedHardpoints = new Set();
    for (let i = 0; i < upgradeCount; i++) {
      const req = pickUpgradeInstallRequest(shipDef, {
        excludeKeys: [...usedHardpoints],
      });
      if (!req) break;
      usedHardpoints.add(req.hardpointKey);
      push('upgrade', {
        kindLabel: req.kindLabel,
        boardLabel: req.boardLabel,
        catalogItemId: req.catalogItemId,
        catalogCategory: req.catalogCategory,
        targetHardpointKey: req.hardpointKey,
        priority: 2,
      });
    }

    const isPlayer = this.isPlayerBay(pad.bayIndex);
    if (!items.length) {
      if (!isPlayer) push('elevatorTransfer', { priority: 0 });
    }

    items.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
    pad.service = {
      items,
      phase: 'boardReveal',
      reveal: this._createBoardReveal(items),
      settleT: 0,
      settleMax: 0,
      dwellT: 0,
      dwellMax: rand(HANGAR.VISITOR_SERVICE_DWELL_MIN, HANGAR.VISITOR_SERVICE_DWELL_MAX),
      rerollT: 0,
      rerollMax: rand(
        HANGAR.PLAYER_SERVICE_REROLL_MIN,
        HANGAR.PLAYER_SERVICE_REROLL_MAX
      ),
      elevatorOnly: items.length === 1 && items[0].type === 'elevatorTransfer',
    };
    pad.serviceScroll = createServiceScrollState();
  };

  HangarBay.prototype._updateCaptainService = function (pad, dt, { exitOnComplete = true } = {}) {
    const svc = pad.service;
    if (!svc || !pad.visitorId || pad.seq) return;

    if (svc.phase === 'boardReveal') {
      this._tickBoardReveal(svc, dt);
      if (svc.reveal?.stage !== 'done') return;
      const workItems = svc.items.filter((it) => it.type !== 'elevatorTransfer');
      if (svc.elevatorOnly || (!workItems.length && exitOnComplete)) {
        svc.items.forEach((it) => {
          it.status = 'done';
          it.pipSettled = true;
        });
        svc.phase = 'finalScan';
        svc.finalScanT = 0;
      } else if (!workItems.length) {
        // Player empty roll — board scanned, nothing ordered → wait then reroll
        svc.phase = 'reroll';
        svc.rerollT = 0;
        svc.rerollMax = rand(
          HANGAR.PLAYER_SERVICE_REROLL_MIN,
          HANGAR.PLAYER_SERVICE_REROLL_MAX
        );
      } else {
        svc.phase = 'active';
      }
      return;
    }

    // Legacy settle beat (warmup / mid-session leftovers)
    if (svc.phase === 'settle') {
      svc.settleT += dt;
      if (svc.settleT >= svc.settleMax) {
        if (svc.elevatorOnly) {
          svc.items.forEach((it) => {
            it.status = 'done';
            it.pipSettled = true;
          });
          svc.phase = 'finalScan';
          svc.finalScanT = 0;
        } else {
          svc.phase = 'active';
        }
      }
      return;
    }

    if (svc.phase === 'active') {
      this._syncServiceStaging(pad);
      if (this._serviceAllDone(pad)) {
        svc._allDoneT = (svc._allDoneT || 0) + dt;
        // Wait for finishing mechs to walk away (pips green) before the verify scan.
        // Failsafe: don't hold the bay forever if a settle was missed.
        if (
          this._servicePipsSettled(pad) ||
          svc._allDoneT >= HANGAR.VISITOR_PIP_SETTLE_FAILSAFE_SEC
        ) {
          this._forceSettleServicePips(pad);
          svc.phase = 'finalScan';
          svc.finalScanT = 0;
          svc._allDoneT = 0;
        }
      } else {
        svc._allDoneT = 0;
      }
      return;
    }

    if (svc.phase === 'finalScan') {
      svc.finalScanT = (svc.finalScanT || 0) + dt;
      if (svc.finalScanT < HANGAR.BOARD_FINAL_SCAN_SEC) return;
      // Board goes green after the verify pass, then a short depart beat
      this._forceSettleServicePips(pad);
      svc.phase = 'dwell';
      svc.dwellT = 0;
      svc.dwellMax = rand(
        HANGAR.VISITOR_SERVICE_DWELL_MIN,
        HANGAR.VISITOR_SERVICE_DWELL_MAX
      );
      return;
    }

    if (svc.phase === 'dwell') {
      svc.dwellT += dt;
      if (svc.dwellT < svc.dwellMax) return;
      if (exitOnComplete) {
        // Only leave once the board has finished (scan + green pips + short dwell)
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
  };

  HangarBay.prototype._updateVisitorService = function (pad, dt) {
    this._updateCaptainService(pad, dt, { exitOnComplete: true });
  };

  HangarBay.prototype._updatePlayerBayService = function (dt) {
    if (!this.playerBay || this.playerArrivalPending) return;
    if (this.bayOffline[this.playerBayIndex] || !this.playerPadOccupied) return;
    if (this._playerDevSeq) return;
    // Launch / land / elevator ops — no board reveal or scan mid-sequence
    const pb = this.playerBayIndex;
    if (this._opsBays.has(pb)) return;
    const lane = this.bayLaneMode[pb];
    if (lane === 'departing' || lane === 'incoming' || lane === 'elevator') {
      return;
    }
    if (!this.playerBay.service) this._beginCaptainService(this.playerBay);
    this._updateCaptainService(this.playerBay, dt, { exitOnComplete: false });
  };

  HangarBay.prototype._tickVisitorSeq = function (pad, dt) {
    const s = pad.seq;
    if (!s) return;
    s.t += dt;
    this.tickEvac(pad.bayIndex);

    if (s.kind === 'depart') this._tickVisitorDepart(pad, s, dt);
    else if (s.kind === 'arrive') this._tickVisitorArrive(pad, s, dt);
    else if (s.kind === 'lower') this._tickVisitorLower(pad, s, dt);
    else if (s.kind === 'lowerCycle') this._tickVisitorLowerCycle(pad, s, dt);
    else if (s.kind === 'raiseLaunch') this._tickVisitorRaiseLaunch(pad, s, dt);
    else if (s.kind === 'raiseArrive') this._tickVisitorRaiseArrive(pad, s, dt);
    else if (s.kind === 'padSpin') this._tickVisitorPadSpin(pad, s, dt);
  };

  HangarBay.prototype._tickVisitorPadSpin = function (pad, s, _dt) {
    const u = Math.min(1, s.t / (s.duration || 2.4));
    pad.padAngle = (s.startAngle || FACE_NORTH) + u * Math.PI * 2;
    if (pad.visitorId) pad.shipAngle = pad.padAngle;
    if (u >= 1) {
      pad.padAngle = FACE_NORTH;
      if (pad.visitorId) pad.shipAngle = FACE_NORTH;
      pad.seq = null;
      this.clearOps(pad.bayIndex);
    }
  };

  HangarBay.prototype._updateVisitorTraffic = function (dt) {
    for (const pad of this.sidePads) {
      if (pad.seq) {
        this._tickVisitorSeq(pad, dt);
        continue;
      }
      if (this.bayOffline[pad.bayIndex]) continue;
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

      // Waiting on a space approach — keep the request alive, don't roll elevator
      if (this.preferExternalDoorTraffic && pad.wantSpaceArrival) {
        pad.cooldown = rand(
          HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MIN,
          HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MAX
        );
        continue;
      }

      // Empty bay: door arrive vs elevator raise
      if (Math.random() < HANGAR.VISITOR_EMPTY_ELEVATOR_CHANCE) {
        const kind =
          Math.random() < HANGAR.VISITOR_RAISE_LAUNCH_CHANCE
            ? 'raiseLaunch'
            : 'raiseArrive';
        this._startVisitorSeq(pad, kind);
      } else if (this.preferExternalDoorTraffic) {
        // Pilot is in space — request a runway approach instead of hangar-only arrive
        pad.wantSpaceArrival = true;
        pad.cooldown = rand(
          HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MIN,
          HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MAX
        );
      } else {
        this._startVisitorSeq(pad, 'arrive');
      }
    }
  };

  HangarBay.prototype._startVisitorSeq = function (pad, kind) {
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    clearVisitorThrusters(pad);

    if (kind === 'arrive') {
      pad.padMk = this._rollVisitorPadMk();
      equipPadVisitor(pad, pickVisitorId(pad.padMk));
      pad.padAngle = FACE_SOUTH;
      pad.shipAngle = FACE_SOUTH;
      pad.shipY = HANGAR.LAND_START_Y;
      pad.shipHover = 1;
      pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
      pad.shipVy = 0;
      pad.service = null;
      pad.shipState = null;
      this.beginOps(pad.bayIndex, 'incoming');
      this.setDoorOpen(pad.bayIndex, 0);
      pad.seq = { kind, phase: 'warn', t: 0 };
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
      clearPadVisitor(pad);
      pad.service = null;
      pad.shipState = null;
      pad.padAngle = FACE_SOUTH;
      pad.shipAngle = FACE_SOUTH;
      this.beginOps(pad.bayIndex, 'elevator');
      pad.seq = { kind, phase: 'warn', t: 0 };
    }
  };

  HangarBay.prototype._tickVisitorDepart = function (pad, s, dt) {
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
        const liftT = HANGAR.VISITOR_LIFT_TIME;
        const u = smoothstep(s.t / liftT);
        pad.shipHover = u;
        pad.shipScale = 1 + u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst =
          s.t < liftT * 0.72
            ? HANGAR.HOVER_BURST_POWER
            : HANGAR.HOVER_BURST_POWER *
              Math.max(0, 1 - (s.t - liftT * 0.72) / (liftT * 0.28));
        if (burst > 0.02) this._fireVisitorManeuverBurst(pad, burst);
        else clearVisitorThrusters(pad);
        if (s.t >= liftT) {
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
          // Hand off to space before wipe — otherwise bay lights spin→green with no ship
          this._queueSpaceEgress(pad);
          clearPadVisitor(pad);
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
  };

  HangarBay.prototype._tickVisitorArrive = function (pad, s, dt) {
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
        }
        break;
      case 'doors':
        clearVisitorThrusters(pad);
        this.setDoorOpen(pad.bayIndex, Math.min(1, s.t / HANGAR.VISITOR_DOOR_TIME));
        if (s.t > HANGAR.VISITOR_DOOR_TIME + 0.15) {
          s.phase = 'approach';
          s.t = 0;
          pad.shipVy = HANGAR.VISITOR_APPROACH_SPEED;
        }
        break;
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
  };

  HangarBay.prototype._tickVisitorLower = function (pad, s, dt) {
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
        const ang = this._elevSinkTurn(FACE_NORTH, u);
        pad.padAngle = ang;
        pad.shipAngle = ang;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          // Fully black (drop = 1) before clearing the hull
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.padAngle = FACE_SOUTH;
          clearPadVisitor(pad);
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
  };

  HangarBay.prototype._tickVisitorLowerCycle = function (pad, s, dt) {
    switch (s.phase) {
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        pad.padDrop = u;
        pad.shipHover = 0;
        pad.shipScale = 1;
        const ang = this._elevSinkTurn(FACE_NORTH, u);
        pad.padAngle = ang;
        pad.shipAngle = ang;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.padAngle = FACE_SOUTH;
          pad.shipAngle = FACE_SOUTH;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        // Hidden reorient so the rise returns nose-north with no visible turn
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME) {
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
  };

  HangarBay.prototype._tickVisitorRaiseLaunch = function (pad, s, dt) {
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
        pad.padAngle = this._elevSinkTurn(FACE_SOUTH, u);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.padAngle = FACE_NORTH;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        pad.padAngle = FACE_NORTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME * 0.85) {
          pad.padMk = this._rollVisitorPadMk();
          equipPadVisitor(pad, pickVisitorId(pad.padMk));
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
          this._queueSpaceEgress(pad);
          clearPadVisitor(pad);
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
  };

  HangarBay.prototype._tickVisitorRaiseArrive = function (pad, s, dt) {
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
        pad.padAngle = this._elevSinkTurn(FACE_SOUTH, u);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.padAngle = FACE_NORTH;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        pad.padAngle = FACE_NORTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME * 0.85) {
          pad.padMk = this._rollVisitorPadMk();
          equipPadVisitor(pad, pickVisitorId(pad.padMk));
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
  };
}
