/**
 * CrewShared — HangarBay prototype mixin.
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


export function attachCrewShared(HangarBay) {
  HangarBay.prototype._moveToward = function (npc, tx, ty, speed, dt) {
    const dx = tx - npc.x;
    const dy = ty - npc.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      npc.x = tx;
      npc.y = ty;
      return true;
    }
    let step = speed * dt;
    if (npc.kind === 'mechanic' && !this._mechFacingLocked(npc)) {
      // Turn toward travel first; cut stride when facing the wrong way (no moonwalk)
      const travelAng = Math.atan2(dy, dx);
      this._crewSteerVisHeading(npc, travelAng, dt);
      npc.facing = Math.cos(npc.visHeading ?? travelAng) >= 0 ? 1 : -1;
      npc._mechSteeredVis = true;
      const align = this._crewFacingAlign(npc.visHeading, travelAng);
      step *= align;
      if (align < 0.2) return false; // pivot in place
    }
    if (step >= dist) {
      npc.x = tx;
      npc.y = ty;
      return true;
    }
    if (step > 0) {
      npc.x += (dx / dist) * step;
      npc.y += (dy / dist) * step;
    }
    const lockFacing =
      npc.forkPhase || npc.mechPhase || npc._lockFacing || npc.kind === 'mechanic';
    if (!lockFacing) {
      // Face along clearly horizontal travel only — tiny X corrections while
      // driving N/S were flipping the truck and causing moonwalks.
      if (Math.abs(dx) >= Math.abs(dy) * 0.45 && Math.abs(dx) > 1.25) {
        const next = Math.sign(dx);
        if (next) npc.facing = next;
      }
    }
    return false;
  };

  HangarBay.prototype._crewFacingAlign = function (heading, travelAng) {
    let cur = heading;
    if (cur == null || Number.isNaN(cur)) return 1;
    let diff = travelAng - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const abs = Math.abs(diff);
    if (abs <= MECH_TURN_ALIGN) return 1;
    if (abs >= MECH_TURN_STOP) return 0;
    return 1 - (abs - MECH_TURN_ALIGN) / (MECH_TURN_STOP - MECH_TURN_ALIGN);
  };

  HangarBay.prototype._crewSteerVisHeading = function (npc, target, dt) {
    let cur = npc.visHeading;
    if (cur == null || Number.isNaN(cur)) {
      npc.visHeading = target;
      return;
    }
    let diff = target - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const locked = !!(npc.forkPhase || npc.mechPhase || npc._lockFacing);
    const step = (locked ? CREW_VIS_TURN_LOCK : CREW_VIS_TURN) * dt;
    if (Math.abs(diff) <= step) npc.visHeading = target;
    else npc.visHeading = cur + Math.sign(diff) * step;
    if (npc.visHeading > Math.PI) npc.visHeading -= Math.PI * 2;
    if (npc.visHeading <= -Math.PI) npc.visHeading += Math.PI * 2;
  };

  HangarBay.prototype._crewVisOctant = function (npc) {
    const h = npc.visHeading ?? (npc.facing >= 0 ? 0 : Math.PI);
    let oct = Math.round(h / CREW_VIS_OCT);
    oct = ((oct % 8) + 8) % 8;
    const prev = npc._visOct;
    if (prev != null && prev !== oct) {
      const ang = (o) => {
        let a = o * CREW_VIS_OCT;
        if (a > Math.PI) a -= Math.PI * 2;
        return a;
      };
      const wrap = (d) => {
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
      };
      const dNew = Math.abs(wrap(h - ang(oct)));
      const dOld = Math.abs(wrap(h - ang(prev)));
      if (dNew + 0.14 > dOld) oct = prev;
    }
    npc._visOct = oct;
    return oct;
  };
}
