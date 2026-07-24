/**
 * HangarRender — HangarBay prototype mixin.
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
  FORKLIFT_HUB_HALF_W,
  FORKLIFT_HUB_Y,
  FORKLIFT_PARK_SPOT_H,
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


export function attachHangarRender(HangarBay) {
  HangarBay.prototype.render = function (ctx, space = null) {
    this.renderDeck(ctx, space);
    this.renderCrew(ctx);
    this.renderWeldUnder(ctx);
    this.renderElevatorTransits(ctx);
    this.renderVisitors(ctx);
    this.renderOverhead(ctx);
  };

  HangarBay.prototype.renderWeldUnder = function (ctx) {
    this._drawWeldUnderGlow(ctx);
    this._drawSparkles(ctx, 'under');
  };

  HangarBay.prototype.renderDeck = function (ctx, space = null) {
    this._drawBayShell(ctx);
    if (space) {
      this._drawViewportSpace(ctx, space);
      this._drawOpenDoorSpace(ctx, space);
    }
    this._drawViewportFrames(ctx);
    this._drawFloor(ctx);
    this._drawBayDangerLights(ctx);
    this._drawSetDressing(ctx);
    this._drawForkliftHub(ctx);
    this._drawServiceDisplayBoards(ctx);
    this._drawBayDoors(ctx);
    this._drawBayBeacons(ctx);
    this._drawDoorTickers(ctx);
    this._drawCargoPiles(ctx);

    // Shaft well under the player pad (rim peeks around the pad edge)
    const px = this.playerPadWorldX();
    const pb = this.playerBayIndex;
    this._drawElevationShaft(ctx, px, 0);
    if ((this.playerPadDrop || 0) < 0.02) {
      this._drawDockPad(ctx, px, 0, this.playerBay?.bayId || bayLabels()[pb], {
        active: this.isDevControlBay(pb),
        occupied: !!this.playerPadOccupied,
        angle: this.playerPadAngle,
        rimMode: this.padRimMode[pb] || 'off',
      });
    }

    for (const pad of this.sidePads) {
      const drop = pad.padDrop || 0;
      this._drawElevationShaft(ctx, pad.x, 0);
      if (drop < 0.02) {
        this._drawDockPad(ctx, pad.x, 0, pad.bayId, {
          active: this.isDevControlBay(pad.bayIndex),
          occupied: !!pad.visitorId,
          angle: pad.padAngle ?? FACE_NORTH,
          rimMode: this.padRimMode[pad.bayIndex] || 'off',
        });
      }
      // Transit pad+ship drawn later (clipped) so deck dressing stays around the hole
    }
  };

  HangarBay.prototype._drawNpc = function (ctx, npc) {
    if (npc.kind === 'mechanic') this._drawMechanic(ctx, npc);
    else this._drawForklift(ctx, npc);
  };

  HangarBay.prototype.renderCrew = function (ctx) {
    const behind = [];
    const front = [];
    for (const npc of this.npcs) {
      if (!this._npcVisibleThroughBulkheads(npc)) continue;
      if (this._npcBehindServiceBoard(npc)) behind.push(npc);
      else front.push(npc);
    }
    for (const npc of behind) this._drawNpc(ctx, npc);
    // Redraw displays so their 2.5D height occludes northern crew
    this._drawServiceDisplayBoards(ctx);
    for (const npc of front) this._drawNpc(ctx, npc);
    this._drawBulkheadDoors(ctx);
  };

  HangarBay.prototype.renderElevatorTransits = function (ctx, hooks = {}) {
    const playerDrop = this.playerPadDrop || 0;
    if (playerDrop >= 0.02) {
      this._drawPlayerElevatorTransit(ctx, hooks.drawPlayerShip);
      this._drawElevationShaftRim(ctx, this.playerPadWorldX(), 0);
    }
    for (const pad of this.sidePads) {
      if ((pad.padDrop || 0) < 0.02) continue;
      this._drawElevatorTransit(ctx, pad);
      this._drawElevationShaftRim(ctx, pad.x, 0);
    }
  };

  HangarBay.prototype._visitorArrivalShipVisible = function (pad) {
    const s = pad.seq;
    if (!s || s.kind !== 'arrive') return true;
    return (
      s.phase === 'approach' ||
      s.phase === 'settle' ||
      s.phase === 'turn' ||
      s.phase === 'doorsClose'
    );
  };

  HangarBay.prototype.renderVisitors = function (ctx, hooks = {}) {
    const doorLip = this.getDoorLipY();
    const outside = [];
    const inside = [];
    for (const pad of this.sidePads) {
      if (!pad.visitorId) continue;
      if (!this._visitorArrivalShipVisible(pad)) continue;
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
    this._drawDoorTickers(ctx);
    // Wall art sits on the north wall face — must paint after occlusion restamp
    this._drawWallArt(ctx);
    for (const pad of inside) this._drawVisitor(ctx, pad);
    if (hooks.afterOcclusion) hooks.afterOcclusion(ctx);
    // Ship scan beams sit on top of hulls (pods are drawn on the boards)
    this._drawShipBoardScans(ctx);
  };

  HangarBay.prototype._drawElevationShaft = function (ctx, cx, cy) {
    this._drawElevationShaftWell(ctx, cx, cy);
    this._drawElevationShaftRim(ctx, cx, cy);
  };

  HangarBay.prototype._drawElevationShaftWell = function (ctx, cx, cy) {
    const r = BAY.PAD_R;
    const deep = this._shaftDepthAt(1);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    // Depth gradient: steel-blue at the north lip → void toward south (away/below)
    const grad = ctx.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, '#2a3848');
    grad.addColorStop(0.4, '#1a2430');
    grad.addColorStop(0.75, '#0a1018');
    grad.addColorStop(1, '#020408');
    ctx.fillStyle = grad;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // Soft falloff toward the off-screen floor VP (only the southern wash is visible)
    const radial = ctx.createRadialGradient(
      0, deep.south, r * 0.05,
      0, r * 0.25, r * 1.35
    );
    radial.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
    radial.addColorStop(0.45, 'rgba(0, 0, 0, 0.45)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // Wall guide lines converge on the off-screen south VP
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.1;
    for (const lx of [-r * 0.55, 0, r * 0.55]) {
      ctx.beginPath();
      ctx.moveTo(lx, -r * 0.95);
      ctx.lineTo(lx * 0.08, deep.south);
      ctx.stroke();
    }

    // Depth rings as circular walls — deeper = smaller, flatter, more southern.
    // Centers past the lip clip to arcs; the t=1 floor itself is never drawn.
    for (const [t, alpha] of [
      [0.16, 0.32],
      [0.32, 0.4],
      [0.48, 0.48],
      [0.62, 0.56],
      [0.76, 0.64],
      [0.88, 0.72],
    ]) {
      const d = this._shaftDepthAt(t);
      const rr = r * d.scaleX;
      const ry = r * d.scaleY;
      // Skip rings wholly south of the opening (no visible arc)
      if (d.south - ry > r * 0.98) continue;
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(0, d.south, rr, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Subtle face highlight on the north lip of each ring
      ctx.strokeStyle = `rgba(90, 120, 145, ${0.14 * (1 - t)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, d.south, rr, ry, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    ctx.restore();
  };

  HangarBay.prototype._drawElevationShaftRim = function (ctx, cx, cy) {
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
  };

  HangarBay.prototype._drawElevatorTransit = function (ctx, pad) {
    const drop = pad.padDrop || 0;
    const r = BAY.PAD_R;
    const south = drop * 48;
    const sc = 1 - drop * 0.55;

    ctx.save();
    ctx.beginPath();
    ctx.arc(pad.x, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(pad.x, south);
    ctx.scale(sc, sc);

    this._drawDockPad(ctx, 0, 0, pad.bayId, {
      active: this.isDevControlBay(pad.bayIndex),
      occupied: !!pad.visitorId,
      angle: pad.padAngle ?? FACE_NORTH,
      skipShadow: true,
      rimMode: this.padRimMode[pad.bayIndex] || 'off',
    });

    if (pad.visitorId) {
      const hover = pad.shipHover || 0;
      const angle = pad.shipAngle ?? FACE_NORTH;
      ctx.save();
      ctx.translate(0, hover * 2);
      ctx.scale(pad.shipScale || 1, pad.shipScale || 1);
      ctx.rotate(angle);
      const def = pad.shipDef || this._ensurePadShipDef(pad);
      if (!def) {
        ctx.restore();
        this._fadeElevatorTransitToBlack(ctx, drop, r);
        ctx.restore();
        return;
      }
      drawVisitorShip(
        ctx,
        {
          shipDef: def,
          thrusters: pad.thrusters,
          velocity: { x: pad.shipVx || 0, y: pad.shipVy || 0 },
          angle,
          angularVelocity: 0,
          miningLaserFiring: false,
          muzzleFlash: 0,
          getTurretLocalAngle: () => 0,
        },
        null,
        hangarShipView(angle)
      );
      ctx.restore();
    }

    this._fadeElevatorTransitToBlack(ctx, drop, r);
    ctx.restore();
  };

  HangarBay.prototype._drawPlayerElevatorTransit = function (ctx, drawPlayerShip) {
    const drop = this.playerPadDrop || 0;
    const px = this.playerPadWorldX();
    const pb = this.playerBayIndex;
    const r = BAY.PAD_R;
    const south = drop * 48;
    const sc = 1 - drop * 0.55;

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(px, south);
    ctx.scale(sc, sc);

    this._drawDockPad(ctx, 0, 0, this.playerBay?.bayId || bayLabels()[pb], {
      active: this.isDevControlBay(pb),
      occupied: !!this.playerPadOccupied,
      angle: this.playerPadAngle,
      skipShadow: true,
      rimMode: this.padRimMode[pb] || 'off',
    });

    if (this.playerPadOccupied && drawPlayerShip) {
      drawPlayerShip(ctx);
    }

    this._fadeElevatorTransitToBlack(ctx, drop, r);
    ctx.restore();
  };

  HangarBay.prototype._drawNorthWallOcclusion = function (ctx) {
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
        const gapHalf = this._bayDoorGapHalf(open);
        holes.push({
          lo: cx - gapHalf,
          hi: cx + gapHalf,
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
  };

  HangarBay.prototype.renderOverhead = function (ctx) {
    this._drawOverhead(ctx);
    // Plating wash under over-layer sparks (after ships, before spark streaks)
    this._drawWeldHullWashes(ctx);
    this._drawSparkles(ctx, 'overhead');
    this._drawSparkles(ctx, 'over');
    this._drawDebris(ctx);
    this._drawHazardWash(ctx);
  };

  HangarBay.prototype._drawBayShell = function (ctx) {
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
  };

  HangarBay.prototype._drawWallPanels = function (ctx, x0, y0, width, height, vpGaps, vpY, vpH) {
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
  };

  HangarBay.prototype._drawSideWallDetail = function (ctx, side) {
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
  };

  HangarBay.prototype._drawCornerColumn = function (ctx, cx, cy) {
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
  };

  HangarBay.prototype._drawBulkheadDoors = function (ctx) {
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
  };

  HangarBay.prototype._drawViewportFrames = function (ctx) {
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
  };

  HangarBay.prototype._drawViewportSpace = function (ctx, space) {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    const pads = padCenters();

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
    this._paintHangarSpacefield(ctx, space, cover);
    ctx.restore();
  };

  HangarBay.prototype._drawOpenDoorSpace = function (ctx, space) {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    const pads = padCenters();

    // Match window backdrop anchor exactly — doors peek into the same chunk
    const left = pads[0] - vpW / 2;
    const right = pads[pads.length - 1] + vpW / 2;
    const midX = (left + right) / 2;
    const midY = vpY + vpH / 2;
    const doorTop = -BAY.HALF_H;
    const doorH = BAY.DOOR_H;
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
      const gapHalf = this._bayDoorGapHalf(open);
      ctx.rect(cx - gapHalf, doorTop, gapHalf * 2, doorH);
    }
    if (!any) {
      ctx.restore();
      return;
    }
    ctx.clip();

    ctx.translate(midX, midY);
    this._paintHangarSpacefield(ctx, space, cover);
    // Space-view apron pavement in the lower door aperture (ships draw above)
    this._drawDoorApronPavement(ctx, cover);
    ctx.restore();
  };

  HangarBay.prototype._drawDoorApronPavement = function (ctx, cover) {
    const bandH = cover * 0.55;
    const y0 = cover * 0.22;
    ctx.fillStyle = '#05080c';
    ctx.fillRect(-cover, y0, cover * 2, bandH);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + bandH);
    g.addColorStop(0, 'rgba(100, 180, 255, 0.1)');
    g.addColorStop(0.45, 'rgba(20, 28, 36, 0.55)');
    g.addColorStop(1, 'rgba(5, 8, 12, 0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(-cover, y0, cover * 2, bandH);
    ctx.strokeStyle = 'rgba(201, 160, 32, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);
    for (const t of [-cover / 3, cover / 3]) {
      ctx.beginPath();
      ctx.moveTo(t, y0 + 4);
      ctx.lineTo(t, y0 + bandH - 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  HangarBay.prototype._drawDoorSegmentPanel = function (ctx, x, y, w, h) {
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(120, 150, 170, 0.12)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x, y + h - 3, w, 3);
    ctx.strokeStyle = '#6a8498';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(50, 70, 85, 0.7)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + 3, y + 4, w - 6, h * 0.4);
    ctx.strokeRect(x + 3, y + h * 0.5, w - 6, h * 0.38);
    ctx.fillStyle = 'rgba(150, 170, 185, 0.4)';
    for (const ry of [y + 6, y + h - 6]) {
      ctx.beginPath();
      ctx.arc(x + 4, ry, 0.8, 0, Math.PI * 2);
      ctx.arc(x + w - 4, ry, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  HangarBay.prototype._drawTelescopingLeaf = function (ctx, cx, doorTop, doorH, open, side) {
    const dh = BAY.DOOR_HALF;
    const lw = this._bayDoorLeafW();
    const { segW, nestPitch, nestSpan, jambTuck } = this._bayDoorTelescoping();
    const baseLx = side < 0 ? cx - dh : cx + 1.5;

    for (let k = 0; k < 3; k++) {
      const closedX = baseLx + k * segW;
      // Nested pack: outer→inner with nestPitch. Fully open, pack sits in the jamb.
      const openX =
        side < 0
          ? baseLx - jambTuck - nestSpan + k * nestPitch
          : baseLx + lw + jambTuck + k * nestPitch;
      const segX = closedX + (openX - closedX) * open;
      this._drawDoorSegmentPanel(ctx, segX, doorTop, segW, doorH);
    }
  };

  HangarBay.prototype._drawBayDoors = function (ctx, opts = {}) {
    const leavesOnly = !!opts.leavesOnly;
    const h = BAY.HALF_H;
    const doorTop = -h;
    const doorH = BAY.DOOR_H;
    const dh = BAY.DOOR_HALF;
    const labels = bayLabels();

    padCenters().forEach((cx, i) => {
      const open = this.doorOpen[i] || 0;
      const dh = BAY.DOOR_HALF;
      const gapHalf = this._bayDoorGapHalf(open);

      // Dark pocket only while sealed — open apertures show shared spacefield
      if (!leavesOnly && open <= 0.05) {
        ctx.fillStyle = '#0a1018';
        ctx.fillRect(cx - dh - 6, doorTop - 2, dh * 2 + 12, doorH + 8);
      }

      // Telescoping leaves — three segments per side, collapse into own jamb
      this._drawTelescopingLeaf(ctx, cx, doorTop, doorH, open, -1);
      this._drawTelescopingLeaf(ctx, cx, doorTop, doorH, open, 1);

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
  };

  HangarBay.prototype._drawBayBeacons = function (ctx, opts = {}) {
    const wallOnly = !!opts.wallOnly;
    const doorTop = -BAY.HALF_H;
    padCenters().forEach((cx, i) => {
      const mode = this.bayBeacons[i] || 'off';
      let on = false;
      let color = '255, 170, 40';
      let glow = 0.08;
      if (mode === 'off') {
        on = false;
        glow = 0.05;
        color = '80, 90, 100';
      } else if (mode === 'amber') {
        on = true;
        glow = 0.55;
        color = '255, 170, 40';
      } else if (mode === 'amberFlash') {
        on = Math.sin(this.time * 10 + i) > 0;
        glow = on ? 0.85 : 0.12;
        color = '255, 170, 40';
      } else if (mode === 'greenBlink') {
        on = Math.sin(this.time * 5 + i) > 0;
        glow = on ? 0.8 : 0.15;
        color = '60, 220, 100';
      } else if (mode === 'green') {
        on = true;
        glow = 0.9;
        color = '40, 230, 90';
      } else if (mode === 'redFlash') {
        on = Math.sin(this.time * 12 + i) > 0;
        glow = on ? 0.9 : 0.12;
        color = '255, 50, 45';
      } else {
        // Legacy fallbacks
        on = mode !== 'idle';
        glow = 0.4;
      }

      for (const dx of [-BAY.DOOR_HALF - 4, BAY.DOOR_HALF + 4]) {
        const bx = cx + dx;
        const by = doorTop - 10;
        ctx.fillStyle = '#2a3848';
        ctx.fillRect(bx - 3, by - 2, 6, 5);
        ctx.strokeStyle = '#6a8498';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(bx - 3, by - 2, 6, 5);
        ctx.fillStyle = `rgba(${color}, ${0.2 + glow * 0.8})`;
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

      if (!wallOnly && (mode === 'redFlash' || mode === 'amberFlash' || mode === 'green')) {
        const a = mode === 'green' ? 0.08 : on ? 0.07 : 0.02;
        ctx.fillStyle = `rgba(${color}, ${a})`;
        ctx.beginPath();
        ctx.ellipse(cx, doorTop + BAY.DOOR_H + 28, 36, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };

  HangarBay.prototype._drawDoorTickers = function (ctx) {
    // Pilot channel: between viewport windows and bay doors, between door lights
    const vpY = -BAY.HALF_H - 40;
    const vpH = BAY.VIEWPORT_H;
    const doorTop = -BAY.HALF_H;
    const lightX = BAY.DOOR_HALF + 4;
    const y = vpY + vpH + 5;
    const h = Math.min(10, doorTop - 2 - y);
    const colorMap = {
      red: '#ff5048',
      amber: '#ffb028',
      yellow: '#e8c040',
      blue: '#58b0ff',
      green: '#40e070',
      dim: '#7a8898',
    };
    padCenters().forEach((cx, i) => {
      const lines = this.bayTicker[i] || [];
      const w = lightX * 2 - 12;
      ctx.fillStyle = '#0c1218';
      ctx.strokeStyle = '#4a6070';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.rect(cx - w / 2, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - w / 2 + 1, y + 1, w - 2, h - 2);
      ctx.clip();
      const texts = lines.length ? lines : [{ text: 'STANDBY', color: 'dim' }];
      const innerW = w - 4;
      texts.forEach((line, li) => {
        const raw = line.text || 'STANDBY';
        ctx.fillStyle = colorMap[line.color] || colorMap.dim;
        ctx.font = '4.2px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ty = y + h / 2 + (texts.length > 1 ? (li === 0 ? -2.2 : 2.2) : 0);
        const textW = ctx.measureText(raw).width;
        let drawX = cx;
        if (textW > innerW) {
          // Marquee only when the line doesn't fit the ticker box
          const overflow = textW - innerW;
          const scroll = Math.sin(this.time * 0.7 + i + li) * (overflow * 0.5);
          drawX = cx - scroll;
        }
        ctx.fillText(raw, drawX, ty);
      });
      ctx.restore();
    });
  };

  HangarBay.prototype._drawFloor = function (ctx) {
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
  };

  HangarBay.prototype._drawCautionBox = function (ctx, x, y, w, h) {
    for (let i = 0; i < Math.ceil(w / 8); i++) {
      ctx.fillStyle = i % 2 ? '#c9a020' : '#1a1a14';
      ctx.fillRect(x + i * 8, y, Math.min(8, w - i * 8), h);
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
  };

  HangarBay.prototype._drawFloorChevron = function (ctx, x, y, dir) {
    ctx.fillStyle = 'rgba(201, 160, 32, 0.28)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * 10, y - 6);
    ctx.lineTo(x + dir * 10, y + 6);
    ctx.closePath();
    ctx.fill();
  };

  HangarBay.prototype._drawSetDressing = function (ctx) {
    // Far→near by screen Y — single prop list (yard/desk/shelf via category)
    const props = getHangarProps()
      // Wall posters paint on the north wall after occlusion (see `_drawWallArt`)
      .filter((p) => p.kind !== 'computer' && p.kind !== 'wallPoster')
      .slice()
      .sort((a, b) => a.y - b.y);
    for (const prop of props) this._drawHangarProp(ctx, prop);

    // South-of-road bulk fuel (no linger) — clear of hub stalls
    this._drawPropFuelFarm(ctx, -310, 176, 0);
    this._drawPropFuelFarm(ctx, 302, 182, 1);
    this._drawPropExtinguisher(ctx, -328, BAY.PATH_Y - 46);
    this._drawPropExtinguisher(ctx, 322, BAY.PATH_Y - 40);
    this._drawPropFloorDrain(ctx, -132, 168);
    this._drawPropFloorDrain(ctx, 148, 162);

    ctx.fillStyle = 'rgba(201, 160, 32, 0.35)';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    const pads = padCenters();
    ctx.fillText('KEEP CLEAR', pads[0], DANGER_ZONE_SOUTH - 8);
    ctx.fillText('KEEP CLEAR', pads[2], DANGER_ZONE_SOUTH - 8);
  };

  HangarBay.prototype._drawHangarProp = function (ctx, prop) {
    const v = prop.variant ?? 0;
    const facing = ((prop.facing | 0) % 8 + 8) % 8;
    const px = prop.x;
    const py = prop.y;
    ctx.save();
    ctx.translate(px, py);
    if (facing) ctx.rotate(facing * (Math.PI / 4));
    const x = 0;
    const y = 0;
    switch (prop.kind) {
      case 'workbench':
        this._drawPropWorkbench(ctx, x, y, v);
        break;
      case 'bayTerminal':
        this._drawPropBayTerminal(ctx, x, y, v);
        break;
      case 'partsRack':
        this._drawPropPartsRack(ctx, x, y, v);
        break;
      case 'drumStack':
        this._drawPropDrumStack(ctx, x, y, v);
        break;
      case 'suitLocker':
        this._drawPropSuitLocker(ctx, x, y, v);
        break;
      case 'pallet':
        this._drawPropPallet(ctx, x, y, v);
        break;
      case 'diagCart':
        this._drawPropDiagCart(ctx, x, y, v);
        break;
      case 'cableSpool':
        this._drawPropCableSpool(ctx, x, y, v);
        break;
      case 'breakCrate':
        this._drawPropBreakCrate(ctx, x, y, v);
        break;
      case 'weldScreen':
        this._drawPropWeldScreen(ctx, x, y, v);
        break;
      case 'bottleRack':
        this._drawPropBottleRack(ctx, x, y, v);
        break;
      case 'shiftBoard':
        this._drawPropShiftBoard(ctx, x, y, v);
        break;
      case 'wallPoster':
        this._drawPropWallPoster(ctx, x, y, v);
        break;
      case 'forkCharger':
        this._drawPropForkCharger(ctx, x, y, v);
        break;
      case 'forkTireRack':
        this._drawPropForkTireRack(ctx, x, y, v);
        break;
      case 'forkCones':
        this._drawPropForkCones(ctx, x, y, v);
        break;
      case 'forkCrate':
        this._drawPropForkCrate(ctx, x, y, v);
        break;
      default:
        break;
    }
    ctx.restore();
  };

  HangarBay.prototype._drawPropWorkbench = function (ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    this._propBox(ctx, x, y, 14, 7, 9, {
      top: '#5a6a78',
      far: '#1a2834',
      near: '#2a3a48',
      side: '#243444',
      sideL: '#1e303c',
      sideR: '#2a4050',
      stroke: '#9aacbc',
    });
    // Hazard stripe on near lip
    ctx.fillStyle = 'rgba(201, 160, 32, 0.55)';
    ctx.fillRect(x - 12, y + 5.5 - 9, 24, 1.4);
    ctx.fillStyle = 'rgba(20, 14, 8, 0.35)';
    ctx.fillRect(x - 8, y - 1 - 9, 7, 2);
    if (v === 0) {
      // Arc welder bottle + leads
      this._propBox(ctx, x + 10, y + 1, 2.8, 2.8, 8, {
        top: '#c85840',
        far: '#802820',
        near: '#a03828',
        side: '#903028',
      });
      ctx.strokeStyle = '#c0c8d0';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 10);
      ctx.quadraticCurveTo(x + 2, y - 16, x + 8, y - 14);
      ctx.stroke();
      ctx.fillStyle = `rgba(160, 220, 255, 0.55)`;
      ctx.beginPath();
      ctx.arc(x + 9, y - 14.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineCap = 'butt';
    } else if (v === 1) {
      // Open tool tray
      this._propBox(ctx, x - 4, y - 1, 6, 4, 2.5, {
        top: '#3a4550',
        far: '#1a2228',
        near: '#2a343c',
        side: '#222c34',
      });
      ctx.strokeStyle = '#d0d8e0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 10);
      ctx.lineTo(x + 11, y - 17);
      ctx.moveTo(x + 5, y - 10);
      ctx.lineTo(x + 12, y - 14);
      ctx.stroke();
    } else {
      // Bench vise
      this._propBox(ctx, x - 1, y - 1, 5, 3.5, 5, {
        top: '#7a8490',
        far: '#3a4450',
        near: '#5a6470',
        side: '#4a5460',
      });
      ctx.strokeStyle = '#b8c0c8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + 9, y - 13, 4.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#c9a020';
      ctx.fillRect(x + 10, y - 8, 3, 2);
    }
  };

  HangarBay.prototype._drawPropBayTerminal = function (ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    // Slim pedestal
    this._propBox(ctx, x, y, 3.5, 3.2, 7, {
      top: '#3a4854',
      far: '#141c24',
      near: '#243038',
      side: '#1a2430',
      stroke: '#6a7a88',
    });
    if (v === 0) {
      this._propBox(ctx, x, y - 1, 6.5, 2.4, 12, {
        top: '#1a2834',
        far: '#0a1018',
        near: '#152028',
        side: '#0e181f',
        stroke: '#5a7080',
      });
      ctx.fillStyle = 'rgba(60, 170, 220, 0.45)';
      ctx.fillRect(x - 4.2, y - 1 - 10.5, 8.4, 6.5);
    } else if (v === 1) {
      this._propBox(ctx, x, y - 2, 5.5, 2, 8, {
        top: '#1a2834',
        far: '#0a1018',
        near: '#152028',
        side: '#0e181f',
      });
      this._propBox(ctx, x, y - 2, 5.2, 1.8, 16, {
        top: '#1a2834',
        far: '#0a1018',
        near: '#152028',
        side: '#0e181f',
      });
      ctx.fillStyle = 'rgba(100, 210, 160, 0.4)';
      ctx.fillRect(x - 3.4, y - 2 - 14.5, 6.8, 4.2);
      ctx.fillStyle = 'rgba(80, 170, 230, 0.42)';
      ctx.fillRect(x - 3.6, y - 2 - 7.5, 7.2, 4.2);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 7.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      const h = 11;
      ctx.fillStyle = '#152028';
      ctx.beginPath();
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x - 5, y - h);
      ctx.lineTo(x + 5, y - h);
      ctx.lineTo(x + 7, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(90, 190, 240, 0.4)';
      ctx.fillRect(x - 3.6, y - h + 2, 7.2, 5.5);
      ctx.fillStyle = '#c9a020';
      ctx.beginPath();
      ctx.arc(x - 2.2, y - 3.2, 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#40a060';
      ctx.beginPath();
      ctx.arc(x + 2.2, y - 3.2, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  HangarBay.prototype._drawPropPartsRack = function (ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    this._propBox(ctx, x, y, 12, 6.5, 24, {
      top: '#3a4854',
      far: '#101820',
      near: '#1e2a36',
      side: '#162028',
      stroke: '#7a90a0',
    });
    for (let i = 0; i < 3; i++) {
      const sy = y - 4 - i * 6.5;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 11, sy, 22, 1.4);
      if (v === 0) {
        this._propBox(ctx, x - 5, sy + 3.2, 4, 3.2, 4, {
          top: '#5a6a50',
          far: '#2a3830',
          near: '#3a4a40',
          side: '#304038',
        });
        this._propBox(ctx, x + 5, sy + 3.2, 4, 3.2, 3.6, {
          top: '#5a4a38',
          far: '#2a2018',
          near: '#3a3020',
          side: '#322818',
        });
      } else if (v === 1) {
        ctx.fillStyle = '#5a4030';
        ctx.beginPath();
        ctx.ellipse(x - 4, sy + 1.5, 4.2, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a5060';
        ctx.beginPath();
        ctx.ellipse(x + 5, sy + 1.5, 3.6, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#9aa8b4';
        ctx.beginPath();
        ctx.arc(x - 4, sy - 0.5, 3.4, 0, Math.PI * 2);
        ctx.fill();
        this._propBox(ctx, x + 4.5, sy + 2.5, 3.8, 2.8, 4.5, {
          top: '#4a5a48',
          far: '#243028',
          near: '#354438',
          side: '#2c3830',
        });
      }
    }
  };

  HangarBay.prototype._drawPropDrumStack = function (ctx, x, y, variant = 0) {
    const v = ((variant % 2) + 2) % 2;
    if (v === 0) {
      this._propDrum(ctx, x - 7, y + 1, 5.8, 14, '#4a5a40');
      this._propDrum(ctx, x + 7, y + 3, 5.4, 13, '#3a4a58');
    } else {
      this._propDrum(ctx, x - 8, y + 2, 5.2, 12, '#5a4a38');
      this._propDrum(ctx, x + 2, y - 1, 5.6, 14, '#4a5a48');
      this._propDrum(ctx, x + 11, y + 4, 4.8, 11, '#3a4858');
    }
  };

  HangarBay.prototype._drawPropSuitLocker = function (ctx, x, y, variant = 0) {
    const v = ((variant % 2) + 2) % 2;
    const halfW = v === 0 ? 8.5 : 7;
    const h = v === 0 ? 22 : 26;
    this._propBox(ctx, x, y, halfW, 5.5, h, {
      top: '#3a4a58',
      far: '#101820',
      near: '#243040',
      side: '#1a2834',
      stroke: '#8aa0b0',
    });
    ctx.strokeStyle = 'rgba(160, 180, 200, 0.5)';
    ctx.lineWidth = 0.9;
    if (v === 0) {
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y + 4 - h);
      ctx.stroke();
      ctx.fillStyle = '#c9a020';
      ctx.beginPath();
      ctx.arc(x - 3.2, y - h * 0.38, 1.35, 0, Math.PI * 2);
      ctx.arc(x + 3.2, y - h * 0.38, 1.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#c9a020';
      ctx.beginPath();
      ctx.arc(x + halfW - 2.8, y - h * 0.42, 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x - 4, y - h * 0.55 + i * 2.8, 8, 1.1);
      }
    }
  };

  HangarBay.prototype._drawPropPallet = function (ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    this._propBox(ctx, x, y, 13, 8.5, 3.2, {
      top: '#6a5a38',
      far: '#2a2010',
      near: '#4a3a20',
      side: '#3a2e18',
      stroke: 'rgba(200, 170, 80, 0.4)',
    });
    if (v === 0) {
      // Thruster nozzle crate
      this._propBox(ctx, x - 2, y - 1, 8, 5.5, 10, {
        top: '#4a5a68',
        far: '#1a2834',
        near: '#2a3a48',
        side: '#223040',
      });
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(x - 2, y - 1 - 10, 4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (v === 1) {
      this._propBox(ctx, x, y - 1, 9, 5.5, 11, {
        top: '#3a5a48',
        far: '#1a3020',
        near: '#2a4030',
        side: '#243828',
      });
      ctx.fillStyle = 'rgba(80, 180, 220, 0.3)';
      ctx.fillRect(x - 6, y - 1 - 10, 12, 3);
    } else {
      this._propBox(ctx, x - 4, y, 6.5, 5, 8, {
        top: '#5a4a30',
        far: '#2a2010',
        near: '#3a3020',
        side: '#322818',
      });
      this._propBox(ctx, x + 5.5, y - 2, 5.5, 4.5, 6, {
        top: '#2a3848',
        far: '#101820',
        near: '#1e2a36',
        side: '#162028',
      });
    }
  };

  HangarBay.prototype._drawPropDiagCart = function (ctx, x, y, variant = 0) {
    const v = ((variant % 2) + 2) % 2;
    this._propBox(ctx, x, y, 11, 6.5, 10, {
      top: '#3a4a58',
      far: '#101820',
      near: '#243040',
      side: '#1a2834',
      stroke: '#8aa0b0',
    });
    this._propBox(ctx, x + (v === 0 ? 3 : -3), y - 2, 5.5, 2.2, 9, {
      top: '#1a2834',
      far: '#0a1018',
      near: '#152028',
      side: '#0e181f',
    });
    ctx.fillStyle =
      v === 0 ? 'rgba(80, 210, 160, 0.45)' : 'rgba(80, 170, 230, 0.45)';
    ctx.fillRect(x + (v === 0 ? 3 : -3) - 3.5, y - 2 - 8, 7, 5);
    for (const [ox, oy] of [
      [-8, 4.5],
      [8, 4.5],
      [-8, -3.5],
      [8, -3.5],
    ]) {
      ctx.fillStyle = '#121212';
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy + 2.2, 2.6, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy + 1.8, 1.2, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  HangarBay.prototype._drawPropCableSpool = function (ctx, x, y, _variant = 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Axle stand
    this._propBox(ctx, x - 9, y + 2, 1.5, 3, 10, {
      top: '#5a6878',
      far: '#2a343c',
      near: '#3a4850',
      side: '#323c44',
    });
    this._propBox(ctx, x + 9, y + 2, 1.5, 3, 10, {
      top: '#5a6878',
      far: '#2a343c',
      near: '#3a4850',
      side: '#323c44',
    });
    // Spool
    ctx.fillStyle = '#5a4030';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2818';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 4, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6a40';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 8, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  };

  HangarBay.prototype._drawPropBreakCrate = function (ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 10, 7, 7, {
      top: '#6a5a38',
      far: '#2a2010',
      near: '#4a3a20',
      side: '#3a2e18',
      stroke: 'rgba(200, 170, 80, 0.35)',
    });
    // Thermos + mugs
    this._propBox(ctx, x - 3, y - 1, 2.2, 2.2, 5, {
      top: '#4a5868',
      far: '#1a2430',
      near: '#2a3848',
      side: '#223040',
    });
    ctx.fillStyle = '#c05040';
    ctx.beginPath();
    ctx.arc(x + 4, y - 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  };

  HangarBay.prototype._drawPropWeldScreen = function (ctx, x, y, _variant = 0) {
    // Curtain frame
    this._propBox(ctx, x - 8, y + 2, 1.2, 2.5, 16, {
      top: '#5a6878',
      far: '#2a343c',
      near: '#3a4850',
      side: '#323c44',
    });
    this._propBox(ctx, x + 8, y + 2, 1.2, 2.5, 16, {
      top: '#5a6878',
      far: '#2a343c',
      near: '#3a4850',
      side: '#323c44',
    });
    ctx.fillStyle = 'rgba(180, 90, 40, 0.55)';
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 14);
    ctx.lineTo(x + 8, y - 14);
    ctx.lineTo(x + 8, y + 1);
    ctx.lineTo(x - 8, y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40, 20, 10, 0.25)';
    for (let i = -6; i <= 6; i += 4) {
      ctx.fillRect(x + i - 0.6, y - 13, 1.2, 12);
    }
  };

  HangarBay.prototype._drawPropBottleRack = function (ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 9, 5, 4, {
      top: '#3a4550',
      far: '#141c24',
      near: '#243038',
      side: '#1a2430',
      stroke: '#6a7a88',
    });
    for (const ox of [-5, 0, 5]) {
      this._propBox(ctx, x + ox, y - 1, 2.2, 2.2, 14, {
        top: ox === 0 ? '#c8d0d8' : '#6a8a9a',
        far: '#2a3840',
        near: '#4a5a68',
        side: '#3a4a58',
      });
      ctx.fillStyle = ox === 0 ? '#4090c0' : '#c05040';
      ctx.beginPath();
      ctx.arc(x + ox, y - 1 - 14, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  HangarBay.prototype._drawPropShiftBoard = function (ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 2.5, 2.5, 6, {
      top: '#4a5868',
      far: '#1a2430',
      near: '#2a3848',
      side: '#223040',
    });
    this._propBox(ctx, x, y - 2, 9, 2, 12, {
      top: '#2a343c',
      far: '#101820',
      near: '#1e2830',
      side: '#162028',
      stroke: '#7a90a0',
    });
    // Blank slate face (no stenciled copy)
    ctx.fillStyle = 'rgba(200, 195, 175, 0.28)';
    ctx.fillRect(x - 6, y - 2 - 10, 12, 8);
  };

  HangarBay.prototype._drawWallArt = function (ctx) {
    const props = getHangarProps().filter((p) => p.kind === 'wallPoster');
    // Stable order west→east so overlapping tape reads consistently
    props.sort((a, b) => a.x - b.x);
    for (const prop of props) {
      ctx.save();
      // North-wall mounts ignore facing — art is flat on the wall band
      this._drawPropWallPoster(ctx, prop.x, prop.y, prop.variant ?? 0);
      ctx.restore();
    }
  };

  HangarBay.prototype._drawPropWallPoster = function (ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    const fw = 13; // half-width of paper
    const fh = 30; // face height into the wall (−Y / further north)
    const faceTop = y - fh;
    const faceBot = y;

    // Slight crooked hang — someone slapped it up mid-shift
    ctx.save();
    ctx.translate(x, y - fh * 0.5);
    ctx.rotate(-0.04);
    ctx.translate(-x, -(y - fh * 0.5));

    // Paper / print face (flat on the wall — no floor `_propBox`)
    const px0 = x - fw;
    const py0 = faceTop;
    const pw = fw * 2;
    const ph = faceBot - faceTop;

    // Scrap metal backing flush to the wall panel
    ctx.fillStyle = '#2a3238';
    ctx.fillRect(px0 - 1.6, py0 - 1.6, pw + 3.2, ph + 3.2);
    ctx.strokeStyle = '#6a7884';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(px0 - 1.6, py0 - 1.6, pw + 3.2, ph + 3.2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(px0, py0, pw, ph);
    ctx.clip();

    if (v === 0) {
      this._drawPosterArtCrew(ctx, px0, py0, pw, ph);
    } else {
      // Reserved future wall-art variants — warm blank print for now
      const g = ctx.createLinearGradient(px0, py0, px0, py0 + ph);
      g.addColorStop(0, '#2a3038');
      g.addColorStop(1, '#1a2028');
      ctx.fillStyle = g;
      ctx.fillRect(px0, py0, pw, ph);
      ctx.fillStyle = 'rgba(201,160,32,0.35)';
      ctx.fillRect(px0 + 2, py0 + ph * 0.45, pw - 4, 1.2);
    }

    // Print wear — scratches / grit (engine-drawn, not a texture PNG)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.4;
    for (let i = 0; i < 7; i++) {
      const sx = px0 + 1.5 + ((i * 37) % (pw - 3));
      const sy = py0 + 2 + ((i * 53) % (ph - 4));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 2.5 + (i % 3), sy + 0.4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(px0, py0 + ph * 0.72, pw, ph * 0.28);

    ctx.restore();

    // Metal lip around the print
    ctx.strokeStyle = 'rgba(140, 155, 170, 0.7)';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(px0 - 0.4, py0 - 0.4, pw + 0.8, ph + 0.8);

    // Duct-tape corners + bolts — "mechanic put it there"
    const tape = (tx, ty, ang) => {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(180, 160, 90, 0.72)';
      ctx.fillRect(-3.2, -1.1, 6.4, 2.2);
      ctx.fillStyle = 'rgba(120, 100, 50, 0.35)';
      ctx.fillRect(-3.2, -0.2, 6.4, 0.5);
      ctx.restore();
    };
    tape(px0 + 1.5, py0 + 1.8, -0.35);
    tape(px0 + pw - 1.5, py0 + 2.0, 0.4);
    tape(px0 + 2.0, py0 + ph - 1.6, 0.25);
    tape(px0 + pw - 1.8, py0 + ph - 1.8, -0.3);

    ctx.fillStyle = '#8a98a4';
    for (const [bx, by] of [
      [px0 - 0.2, py0 - 0.2],
      [px0 + pw + 0.2, py0 - 0.2],
      [px0 - 0.2, py0 + ph + 0.2],
      [px0 + pw + 0.2, py0 + ph + 0.2],
    ]) {
      ctx.beginPath();
      ctx.arc(bx, by, 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a3238';
      ctx.beginPath();
      ctx.arc(bx, by, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a98a4';
    }

    // Torn bottom edge nick
    ctx.fillStyle = '#1a2028';
    ctx.beginPath();
    ctx.moveTo(px0 + pw * 0.55, py0 + ph);
    ctx.lineTo(px0 + pw * 0.62, py0 + ph + 1.4);
    ctx.lineTo(px0 + pw * 0.7, py0 + ph);
    ctx.fill();

    ctx.restore();
  };

  HangarBay.prototype._drawPosterArtCrew = function (ctx, x, y, w, h) {
    // Background hangar depth
    const sky = ctx.createLinearGradient(x, y, x, y + h);
    sky.addColorStop(0, '#1a222c');
    sky.addColorStop(0.45, '#141a22');
    sky.addColorStop(0.78, '#0e1218');
    sky.addColorStop(1, '#181410');
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h);

    // Soft structural silhouettes
    ctx.fillStyle = 'rgba(40, 50, 62, 0.55)';
    ctx.fillRect(x + w * 0.05, y + h * 0.08, w * 0.18, h * 0.55);
    ctx.fillRect(x + w * 0.78, y + h * 0.12, w * 0.16, h * 0.5);
    ctx.fillStyle = 'rgba(60, 70, 80, 0.25)';
    ctx.fillRect(x + w * 0.35, y + h * 0.05, w * 0.12, h * 0.35);

    // Warm weld / lamp bokeh
    const orbs = [
      [0.18, 0.22, 1.8, 'rgba(220,150,40,0.55)'],
      [0.42, 0.14, 1.3, 'rgba(240,180,60,0.4)'],
      [0.72, 0.28, 2.1, 'rgba(200,120,40,0.45)'],
      [0.88, 0.18, 1.1, 'rgba(255,200,80,0.35)'],
      [0.55, 0.35, 0.9, 'rgba(180,90,30,0.35)'],
      [0.28, 0.4, 1.0, 'rgba(100,180,220,0.2)'],
    ];
    for (const [u, vv, r, col] of orbs) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + w * u, y + h * vv, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Deck reflection band
    const floor = ctx.createLinearGradient(x, y + h * 0.72, x, y + h);
    floor.addColorStop(0, 'rgba(30,28,24,0)');
    floor.addColorStop(0.35, 'rgba(40,36,30,0.55)');
    floor.addColorStop(1, 'rgba(20,18,14,0.9)');
    ctx.fillStyle = floor;
    ctx.fillRect(x, y + h * 0.7, w, h * 0.3);
    ctx.fillStyle = 'rgba(220,160,60,0.08)';
    ctx.fillRect(x, y + h * 0.78, w, 0.6);

    const cx = x + w * 0.56;
    const botX = x + w * 0.28;
    const ground = y + h * 0.9;

    // --- Bot (left, waist-high) ---
    this._drawPosterBot(ctx, botX, ground, h * 0.38);

    // --- Pilot ---
    this._drawPosterPilot(ctx, cx, ground, h * 0.78);

    // Foreground rim light / vignette
    const vig = ctx.createRadialGradient(
      x + w * 0.5,
      y + h * 0.42,
      w * 0.2,
      x + w * 0.5,
      y + h * 0.5,
      w * 0.72
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(x, y, w, h);
  };

  HangarBay.prototype._drawPosterBot = function (ctx, cx, groundY, tall) {
    const s = tall / 22;
    const gy = groundY;

    // Legs
    ctx.fillStyle = '#8a8e92';
    ctx.fillRect(cx - 4.2 * s, gy - 9 * s, 2.6 * s, 9 * s);
    ctx.fillRect(cx + 1.4 * s, gy - 9 * s, 2.6 * s, 9 * s);
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(cx - 4.4 * s, gy - 3.2 * s, 2.8 * s, 1.4 * s);
    ctx.fillRect(cx + 1.2 * s, gy - 3.2 * s, 2.8 * s, 1.4 * s);

    // Torso plates
    ctx.fillStyle = '#c8ccd0';
    ctx.beginPath();
    ctx.moveTo(cx - 5.5 * s, gy - 10 * s);
    ctx.lineTo(cx + 5.5 * s, gy - 10 * s);
    ctx.lineTo(cx + 4.5 * s, gy - 18 * s);
    ctx.lineTo(cx - 4.5 * s, gy - 18 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8acb0';
    ctx.fillRect(cx - 4 * s, gy - 16.5 * s, 8 * s, 2.2 * s);
    // Rust streaks matching pilot orange
    ctx.fillStyle = 'rgba(180, 90, 40, 0.55)';
    ctx.fillRect(cx - 5 * s, gy - 14 * s, 1.4 * s, 4 * s);
    ctx.fillRect(cx + 3.2 * s, gy - 15 * s, 1.6 * s, 3.5 * s);
    ctx.fillStyle = 'rgba(60, 50, 40, 0.35)';
    ctx.fillRect(cx - 2 * s, gy - 12 * s, 4 * s, 0.7 * s);

    // Arms
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 5 * s, gy - 16 * s);
    ctx.lineTo(cx - 7.5 * s, gy - 11 * s);
    ctx.lineTo(cx - 6.5 * s, gy - 8.5 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 5 * s, gy - 16 * s);
    ctx.lineTo(cx + 7 * s, gy - 12 * s);
    ctx.stroke();
    ctx.fillStyle = '#707478';
    ctx.beginPath();
    ctx.arc(cx - 6.5 * s, gy - 8.2 * s, 1.3 * s, 0, Math.PI * 2);
    ctx.fill();

    // Domed head + cyan eyes
    ctx.fillStyle = '#d0d4d8';
    ctx.beginPath();
    ctx.ellipse(cx, gy - 20.2 * s, 5.2 * s, 4.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b0b4b8';
    ctx.beginPath();
    ctx.ellipse(cx, gy - 18.8 * s, 5.4 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye glow
    const eyeY = gy - 20.4 * s;
    for (const ex of [cx - 2.1 * s, cx + 2.1 * s]) {
      ctx.fillStyle = 'rgba(40, 200, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(ex, eyeY, 2.4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20e8ff';
      ctx.beginPath();
      ctx.arc(ex, eyeY, 1.55 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8ffff';
      ctx.beginPath();
      ctx.arc(ex - 0.35 * s, eyeY - 0.35 * s, 0.45 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  HangarBay.prototype._drawPosterPilot = function (ctx, cx, groundY, tall) {
    const s = tall / 40;
    const gy = groundY;

    // Boots / legs
    ctx.fillStyle = '#2a2e32';
    ctx.fillRect(cx - 4.5 * s, gy - 14 * s, 3.6 * s, 14 * s);
    ctx.fillRect(cx + 0.8 * s, gy - 14 * s, 3.6 * s, 14 * s);
    // Orange knee plates
    ctx.fillStyle = '#c86828';
    ctx.fillRect(cx - 4.8 * s, gy - 11 * s, 4 * s, 3.2 * s);
    ctx.fillRect(cx + 0.6 * s, gy - 11 * s, 4 * s, 3.2 * s);
    ctx.fillStyle = 'rgba(80,40,16,0.35)';
    ctx.fillRect(cx - 4.8 * s, gy - 9.6 * s, 4 * s, 0.7 * s);
    ctx.fillRect(cx + 0.6 * s, gy - 9.6 * s, 4 * s, 0.7 * s);

    // Torso suit
    ctx.fillStyle = '#3a4048';
    ctx.beginPath();
    ctx.moveTo(cx - 7 * s, gy - 14 * s);
    ctx.lineTo(cx + 7 * s, gy - 14 * s);
    ctx.lineTo(cx + 6.2 * s, gy - 26 * s);
    ctx.lineTo(cx - 6.2 * s, gy - 26 * s);
    ctx.closePath();
    ctx.fill();
    // Camo flecks
    ctx.fillStyle = 'rgba(50,58,66,0.7)';
    for (let i = 0; i < 8; i++) {
      const fx = cx + ((i % 4) - 1.5) * 2.4 * s;
      const fy = gy - (16 + (i % 3) * 3) * s;
      ctx.fillRect(fx, fy, 1.4 * s, 1.1 * s);
    }

    // Chest strap
    ctx.strokeStyle = '#6a4a30';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(cx + 5.5 * s, gy - 25 * s);
    ctx.lineTo(cx - 5.5 * s, gy - 16 * s);
    ctx.stroke();

    // Utility belt
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(cx - 6.5 * s, gy - 15.5 * s, 13 * s, 2.2 * s);
    ctx.fillStyle = '#8a7050';
    ctx.fillRect(cx - 5.5 * s, gy - 15.2 * s, 2.4 * s, 2.6 * s);
    ctx.fillRect(cx - 1.5 * s, gy - 15.2 * s, 2.2 * s, 2.4 * s);
    ctx.fillRect(cx + 2.5 * s, gy - 15.2 * s, 2.8 * s, 2.8 * s);

    // Arms
    ctx.fillStyle = '#3a4048';
    ctx.beginPath();
    ctx.moveTo(cx - 6.2 * s, gy - 25 * s);
    ctx.lineTo(cx - 10 * s, gy - 18 * s);
    ctx.lineTo(cx - 8.5 * s, gy - 16 * s);
    ctx.lineTo(cx - 5.5 * s, gy - 22 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 6.2 * s, gy - 25 * s);
    ctx.lineTo(cx + 9.5 * s, gy - 19 * s);
    ctx.lineTo(cx + 8 * s, gy - 17 * s);
    ctx.lineTo(cx + 5.5 * s, gy - 22 * s);
    ctx.closePath();
    ctx.fill();

    // Orange shoulder plates
    ctx.fillStyle = '#d07030';
    ctx.beginPath();
    ctx.ellipse(cx - 5.8 * s, gy - 25.5 * s, 3.2 * s, 2.2 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 5.8 * s, gy - 25.5 * s, 3.2 * s, 2.2 * s, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,200,120,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx - 5.5 * s, gy - 26 * s, 1.6 * s, 0.8 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Rag in right hand
    ctx.fillStyle = '#c4a878';
    ctx.beginPath();
    ctx.moveTo(cx - 9.5 * s, gy - 16.5 * s);
    ctx.lineTo(cx - 12 * s, gy - 14 * s);
    ctx.lineTo(cx - 10.5 * s, gy - 13 * s);
    ctx.lineTo(cx - 8.2 * s, gy - 15.5 * s);
    ctx.closePath();
    ctx.fill();

    // Gloves
    ctx.fillStyle = '#1a1e22';
    ctx.beginPath();
    ctx.arc(cx - 9 * s, gy - 16.2 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.arc(cx + 9 * s, gy - 18 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
    // Wrist computer
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(cx + 7.2 * s, gy - 19.5 * s, 2.4 * s, 1.3 * s);
    ctx.fillStyle = 'rgba(80,200,220,0.55)';
    ctx.fillRect(cx + 7.5 * s, gy - 19.2 * s, 1.6 * s, 0.6 * s);

    // Guitar neck over left shoulder
    ctx.fillStyle = '#6a4a28';
    ctx.save();
    ctx.translate(cx + 4 * s, gy - 27 * s);
    ctx.rotate(-0.55);
    ctx.fillRect(-1 * s, -10 * s, 2 * s, 12 * s);
    ctx.fillStyle = '#8a6a40';
    ctx.fillRect(-2.2 * s, -12 * s, 4.4 * s, 2.4 * s);
    ctx.fillStyle = '#c9a020';
    ctx.fillRect(-1.6 * s, -11.5 * s, 0.5 * s, 1.4 * s);
    ctx.fillRect(1.1 * s, -11.5 * s, 0.5 * s, 1.4 * s);
    ctx.restore();

    // Neck ring / helmet base
    ctx.fillStyle = '#1a1e22';
    ctx.beginPath();
    ctx.ellipse(cx, gy - 27.2 * s, 5.5 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a020';
    ctx.beginPath();
    ctx.arc(cx - 3.2 * s, gy - 27.2 * s, 0.55 * s, 0, Math.PI * 2);
    ctx.arc(cx + 3.2 * s, gy - 27.2 * s, 0.55 * s, 0, Math.PI * 2);
    ctx.fill();

    // Bubble helmet glass
    const hx = cx;
    const hy = gy - 32.5 * s;
    const hr = 6.8 * s;
    const glass = ctx.createRadialGradient(
      hx - hr * 0.25,
      hy - hr * 0.3,
      hr * 0.1,
      hx,
      hy,
      hr
    );
    glass.addColorStop(0, 'rgba(210,230,240,0.35)');
    glass.addColorStop(0.55, 'rgba(140,170,190,0.22)');
    glass.addColorStop(1, 'rgba(40,60,80,0.35)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,200,220,0.55)';
    ctx.lineWidth = 0.7 * s;
    ctx.stroke();

    // Face inside helmet
    ctx.fillStyle = '#c8a890';
    ctx.beginPath();
    ctx.ellipse(hx, hy + 0.6 * s, 3.4 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hair
    ctx.fillStyle = '#2a2420';
    ctx.beginPath();
    ctx.ellipse(hx, hy - 1.8 * s, 3.3 * s, 2.2 * s, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Eyes / brow / stubble cue
    ctx.fillStyle = '#1a1814';
    ctx.fillRect(hx - 2.2 * s, hy - 0.2 * s, 1.5 * s, 0.55 * s);
    ctx.fillRect(hx + 0.7 * s, hy - 0.2 * s, 1.5 * s, 0.55 * s);
    ctx.strokeStyle = 'rgba(60,40,30,0.5)';
    ctx.lineWidth = 0.45 * s;
    ctx.beginPath();
    ctx.moveTo(hx - 1.8 * s, hy + 2.2 * s);
    ctx.quadraticCurveTo(hx, hy + 2.8 * s, hx + 1.8 * s, hy + 2.2 * s);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,30,24,0.25)';
    ctx.fillRect(hx - 2.4 * s, hy + 1.2 * s, 4.8 * s, 1.6 * s);

    // Helmet specular
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.arc(hx - hr * 0.15, hy - hr * 0.25, hr * 0.55, -2.4, -0.9);
    ctx.stroke();
  };

  HangarBay.prototype._drawPropForkCharger = function (ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 8, 6, 12, {
      top: '#3a4a38',
      far: '#142018',
      near: '#2a3a28',
      side: '#1e2e20',
      stroke: '#7a9a70',
    });
    ctx.fillStyle = 'rgba(80, 200, 120, 0.45)';
    ctx.fillRect(x - 4, y - 9, 8, 3);
    ctx.fillStyle = '#c9a020';
    ctx.beginPath();
    ctx.arc(x + 5, y - 11, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Cable to deck
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 4);
    ctx.quadraticCurveTo(x - 14, y + 4, x - 8, y + 8);
    ctx.stroke();
  };

  HangarBay.prototype._drawPropForkTireRack = function (ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 7, 5, 5, {
      top: '#3a4550',
      far: '#141c24',
      near: '#243038',
      side: '#1a2430',
    });
    for (let i = 0; i < 3; i++) {
      const ty = y - 6 - i * 5.5;
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(x, ty, 6.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.ellipse(x, ty, 2.8, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5a5a5a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, ty, 6.5, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  HangarBay.prototype._drawPropForkCones = function (ctx, x, y, _variant = 0) {
    for (const [ox, oy] of [
      [-5, 2],
      [4, 0],
      [0, 5],
    ]) {
      const cx = x + ox;
      const cy = y + oy;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 3, 3.5, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d08020';
      ctx.beginPath();
      ctx.moveTo(cx - 3.5, cy + 2);
      ctx.lineTo(cx, cy - 10);
      ctx.lineTo(cx + 3.5, cy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1a1a14';
      ctx.fillRect(cx - 2.5, cy - 3, 5, 1.5);
    }
  };

  HangarBay.prototype._drawPropForkCrate = function (ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 9, 6, 8, {
      top: '#5a4a30',
      far: '#2a2010',
      near: '#3a3020',
      side: '#322818',
      stroke: 'rgba(200, 170, 80, 0.35)',
    });
  };

  HangarBay.prototype._drawPropFuelFarm = function (ctx, x, y, variant = 0) {
    const v = ((variant % 2) + 2) % 2;
    this._propDrum(
      ctx,
      x,
      y,
      v === 0 ? 11 : 9.5,
      v === 0 ? 22 : 18,
      v === 0 ? '#3a4a38' : '#3a4850'
    );
    ctx.fillStyle = '#6a7888';
    ctx.fillRect(x + 8, y - 10, 5, 3);
    ctx.fillStyle = '#c05040';
    ctx.beginPath();
    ctx.arc(x + 14, y - 8.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    const s = x < 0 ? -1 : 1;
    const baseY = Math.max(y + 8, BAY.PATH_Y + 20);
    ctx.lineCap = 'round';
    for (const pass of [
      { color: 'rgba(40, 30, 20, 0.55)', w: 3.2 },
      { color: 'rgba(90, 70, 40, 0.7)', w: 1.8 },
    ]) {
      ctx.strokeStyle = pass.color;
      ctx.lineWidth = pass.w;
      ctx.beginPath();
      ctx.moveTo(x - s * 4, y + 2);
      ctx.quadraticCurveTo(x - s * 18, baseY - 4, x - s * 10, baseY + 6);
      ctx.quadraticCurveTo(x - s * 2, baseY + 12, x - s * 16, baseY + 4);
      ctx.stroke();
    }
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(x - s * 12 - 3, baseY + 4, 8, 4);
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._drawPropExtinguisher = function (ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a03028';
    ctx.fillRect(x - 3, y - 9, 6, 13);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x - 3, y - 9, 2, 13);
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(x - 2, y - 11, 4, 2);
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 9);
    ctx.lineTo(x + 7, y - 4);
    ctx.stroke();
  };

  HangarBay.prototype._drawPropFloorDrain = function (ctx, x, y) {
    ctx.fillStyle = '#121820';
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a5a68';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70, 90, 105, 0.55)';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y + i * 1.4);
      ctx.lineTo(x + 6, y + i * 1.4);
      ctx.stroke();
    }
  };

  HangarBay.prototype._drawCargoPiles = function (ctx) {
    const pileHidden = new Set();
    for (const n of this.npcs) {
      if (n.kind === 'forklift' && n._forkLift?.cargo?.id) {
        pileHidden.add(n._forkLift.cargo.id);
      }
      if (n.kind === 'mechanic' && n._mechLift?.cargo?.id) {
        pileHidden.add(n._mechLift.cargo.id);
      }
    }
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

      pile.items.forEach((item) => {
        if (pileHidden.has(item.id)) return;
        const pos = this._itemWorldPos(pile, item);
        this._drawCargoItem(ctx, item, pos.x, pos.y, 1, item.restHeading);
      });
    }

    // Panic drops — crates on the deck until crew or crane reclaim them
    for (const drop of this.floorDrops) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y + drop.cargo.h * 0.45, drop.cargo.w * 0.55, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      this._drawCargoItem(ctx, drop.cargo, drop.x, drop.y, 0.92, drop.cargo.restHeading);
    }
  };

  HangarBay.prototype._drawCargoItem = function (ctx, item, cx, cy, scale = 1, headingRad = null) {
    if (!item) return;
    const heading =
      headingRad != null && Number.isFinite(headingRad)
        ? headingRad
        : item.restHeading ?? 0;
    const b = this._cargoOctBasis(heading);
    const s = scale;
    const len = item.w * s * 0.92;
    const wid = item.h * s * 0.52;
    const tall = item.h * s * 0.42;
    const g = (along, across, up = 0) => ({
      x: cx + b.fx * along * b.alongScale + b.rx * across * b.acrossScale,
      y: cy + b.fy * along * b.alongScale + b.ry * across * b.acrossScale - up,
    });

    ctx.save();

    // Soft deck shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + tall * 0.15, len * 0.42, wid * 0.28, b.heading * 0.15, 0, Math.PI * 2);
    ctx.fill();

    const shape = item.shape || (item.family === 'upgrade' ? 'laser' : 'crate');
    if (shape === 'fuel') this._drawCargoFuel(ctx, item, g, len, wid, tall, b);
    else if (shape === 'bullets') this._drawCargoBullets(ctx, item, g, len, wid, tall, b);
    else if (shape === 'shells') this._drawCargoShells(ctx, item, g, len, wid, tall, b);
    else if (shape === 'laser') this._drawCargoLaser(ctx, item, g, len, wid, tall, b);
    else if (shape === 'turret') this._drawCargoTurret(ctx, item, g, len, wid, tall, b);
    else if (shape === 'armor') this._drawCargoArmor(ctx, item, g, len, wid, tall, b);
    else if (shape === 'thruster') this._drawCargoThruster(ctx, item, g, len, wid, tall, b);
    else if (shape === 'engine') this._drawCargoEngine(ctx, item, g, len, wid, tall, b);
    else if (shape === 'sensor') this._drawCargoSensor(ctx, item, g, len, wid, tall, b);
    else if (item.family === 'upgrade') this._drawCargoLaser(ctx, item, g, len, wid, tall, b);
    else this._drawCargoCrate(ctx, item, g, len, wid, tall, b);

    ctx.restore();
  };

  HangarBay.prototype._drawCargoBoxFaces = function (ctx, g, hl, hw, H, fill, fillDark, fillTop) {
    const corners = [
      g(-hl, -hw, 0),
      g(hl, -hw, 0),
      g(hl, hw, 0),
      g(-hl, hw, 0),
    ];
    const tops = [
      g(-hl, -hw, H),
      g(hl, -hw, H),
      g(hl, hw, H),
      g(-hl, hw, H),
    ];
    const faces = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ].map(([i, j], idx) => ({
      i,
      j,
      y: (corners[i].y + corners[j].y + tops[i].y + tops[j].y) / 4,
      idx,
    }));
    faces.sort((a, b) => a.y - b.y);
    for (let f = 0; f < faces.length; f++) {
      const { i, j } = faces[f];
      ctx.fillStyle = f < 2 ? fillDark : fill;
      ctx.beginPath();
      ctx.moveTo(corners[i].x, corners[i].y);
      ctx.lineTo(corners[j].x, corners[j].y);
      ctx.lineTo(tops[j].x, tops[j].y);
      ctx.lineTo(tops[i].x, tops[i].y);
      ctx.closePath();
      ctx.fill();
    }
    // Top plate
    ctx.fillStyle = fillTop;
    ctx.beginPath();
    ctx.moveTo(tops[0].x, tops[0].y);
    ctx.lineTo(tops[1].x, tops[1].y);
    ctx.lineTo(tops[2].x, tops[2].y);
    ctx.lineTo(tops[3].x, tops[3].y);
    ctx.closePath();
    ctx.fill();
    return { corners, tops };
  };

  HangarBay.prototype._drawCargoCrate = function (ctx, item, g, len, wid, tall) {
    const hl = len * 0.5;
    const hw = wid * 0.5;
    const H = tall;
    const fill = item.color || '#6a5538';
    const fillDark = '#2a2218';
    const fillTop = item.accent ? this._cargoMix(fill, item.accent, 0.25) : '#7a6848';
    const { tops } = this._drawCargoBoxFaces(ctx, g, hl, hw, H, fill, fillDark, fillTop);

    // Corner wear / banding
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(tops[0].x, tops[0].y);
    ctx.lineTo(tops[1].x, tops[1].y);
    ctx.lineTo(tops[2].x, tops[2].y);
    ctx.lineTo(tops[3].x, tops[3].y);
    ctx.closePath();
    ctx.stroke();

    // Hazard / stencil stripe on lid
    const a = item.accent || '#c9a020';
    const s0 = g(-hl * 0.7, -hw * 0.15, H + 0.2);
    const s1 = g(hl * 0.7, hw * 0.15, H + 0.2);
    ctx.strokeStyle = a;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Latch nub
    const latch = g(hl * 0.15, 0, H + 0.4);
    ctx.fillStyle = '#8a9aa8';
    ctx.fillRect(latch.x - 1.2, latch.y - 0.7, 2.4, 1.4);

    // Scuff
    const sc = g(-hl * 0.2, hw * 0.2, H * 0.55);
    ctx.fillStyle = 'rgba(20, 12, 6, 0.28)';
    ctx.fillRect(sc.x - 1.5, sc.y - 0.8, 3.2, 1.6);
  };

  HangarBay.prototype._drawCargoFuel = function (ctx, item, g, len, wid, tall) {
    const hl = len * 0.5;
    const hw = wid * 0.5;
    const wall = tall * 0.55;
    const fill = item.color || '#2a6858';
    const fillDark = '#142820';
    // Open-top crate walls
    this._drawCargoBoxFaces(ctx, g, hl, hw, wall, fill, fillDark, '#1a3028');

    // Inner floor
    const floor = [
      g(-hl * 0.82, -hw * 0.78, 1.2),
      g(hl * 0.82, -hw * 0.78, 1.2),
      g(hl * 0.82, hw * 0.78, 1.2),
      g(-hl * 0.82, hw * 0.78, 1.2),
    ];
    ctx.fillStyle = '#0e1814';
    ctx.beginPath();
    ctx.moveTo(floor[0].x, floor[0].y);
    ctx.lineTo(floor[1].x, floor[1].y);
    ctx.lineTo(floor[2].x, floor[2].y);
    ctx.lineTo(floor[3].x, floor[3].y);
    ctx.closePath();
    ctx.fill();

    // Sci-fi fuel cells (cylinders standing in the crate)
    const accent = item.accent || '#40e0a0';
    const cells = [
      [-0.35, -0.28],
      [0.35, -0.28],
      [-0.35, 0.28],
      [0.35, 0.28],
      [0, 0],
    ];
    const cellH = tall * 0.85;
    for (const [ua, uc] of cells) {
      const base = g(ua * hl * 1.1, uc * hw * 1.1, wall * 0.15);
      const top = g(ua * hl * 1.1, uc * hw * 1.1, wall * 0.15 + cellH);
      ctx.strokeStyle = '#3a7060';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(top.x, top.y, 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#a0ffe0';
      ctx.beginPath();
      ctx.arc(top.x, top.y, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Collar ring
      ctx.strokeStyle = '#8aa8a0';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(base.x, base.y - cellH * 0.15, 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._drawAmmoCanOpen = function (ctx, g, len, wid, tall, opts = {}) {
    const hl = len * 0.5;
    const hw = wid * 0.5;
    const H = tall * (opts.wallH ?? 0.78);
    const fill = opts.fill || '#4a3428';
    const fillDark = opts.fillDark || '#241810';
    const fillMid = opts.fillMid || this._cargoMix(fill, '#2a2018', 0.35);
    const lidFill = opts.lidFill || this._cargoMix(fill, '#1a1410', 0.25);
    const stencil = opts.stencil || '7.62';
    const stencilColor = opts.stencilColor || 'rgba(200, 190, 150, 0.55)';

    const corners = [
      g(-hl, -hw, 0),
      g(hl, -hw, 0),
      g(hl, hw, 0),
      g(-hl, hw, 0),
    ];
    const tops = [
      g(-hl, -hw, H),
      g(hl, -hw, H),
      g(hl, hw, H),
      g(-hl, hw, H),
    ];
    // Side walls only (open top) — far faces first
    const faces = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ].map(([i, j], idx) => ({
      i,
      j,
      y: (corners[i].y + corners[j].y + tops[i].y + tops[j].y) / 4,
      idx,
    }));
    faces.sort((a, b) => a.y - b.y);
    for (let f = 0; f < faces.length; f++) {
      const { i, j } = faces[f];
      ctx.fillStyle = f < 2 ? fillDark : fill;
      ctx.beginPath();
      ctx.moveTo(corners[i].x, corners[i].y);
      ctx.lineTo(corners[j].x, corners[j].y);
      ctx.lineTo(tops[j].x, tops[j].y);
      ctx.lineTo(tops[i].x, tops[i].y);
      ctx.closePath();
      ctx.fill();
    }

    // Foam / insert floor
    const foamZ = H * 0.28;
    const foam = [
      g(-hl * 0.86, -hw * 0.78, foamZ),
      g(hl * 0.86, -hw * 0.78, foamZ),
      g(hl * 0.86, hw * 0.78, foamZ),
      g(-hl * 0.86, hw * 0.78, foamZ),
    ];
    ctx.fillStyle = opts.foam || '#1a1610';
    ctx.beginPath();
    ctx.moveTo(foam[0].x, foam[0].y);
    ctx.lineTo(foam[1].x, foam[1].y);
    ctx.lineTo(foam[2].x, foam[2].y);
    ctx.lineTo(foam[3].x, foam[3].y);
    ctx.closePath();
    ctx.fill();

    // Inner wall lip (rim) so the open top reads as a can
    const rimIn = [
      g(-hl * 0.92, -hw * 0.88, H),
      g(hl * 0.92, -hw * 0.88, H),
      g(hl * 0.92, hw * 0.88, H),
      g(-hl * 0.92, hw * 0.88, H),
    ];
    ctx.strokeStyle = fillMid;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(tops[0].x, tops[0].y);
    ctx.lineTo(tops[1].x, tops[1].y);
    ctx.lineTo(tops[2].x, tops[2].y);
    ctx.lineTo(tops[3].x, tops[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 160, 120, 0.22)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(rimIn[0].x, rimIn[0].y);
    ctx.lineTo(rimIn[1].x, rimIn[1].y);
    ctx.lineTo(rimIn[2].x, rimIn[2].y);
    ctx.lineTo(rimIn[3].x, rimIn[3].y);
    ctx.closePath();
    ctx.stroke();

    // Corner rivets
    const rivets = [
      [-0.92, -0.88],
      [0.92, -0.88],
      [0.92, 0.88],
      [-0.92, 0.88],
    ];
    for (const [ua, uc] of rivets) {
      const p = g(ua * hl, uc * hw, H * 0.55);
      ctx.fillStyle = '#8a8070';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2418';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    // Recessed carry handles on left / right faces
    for (const side of [-1, 1]) {
      const h0 = g(side * hl * 0.98, -hw * 0.28, H * 0.42);
      const h1 = g(side * hl * 0.98, hw * 0.28, H * 0.42);
      ctx.strokeStyle = '#1a1410';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(h0.x, h0.y);
      ctx.lineTo(h1.x, h1.y);
      ctx.stroke();
      ctx.strokeStyle = '#6a6050';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(h0.x, h0.y - 0.35);
      ctx.lineTo(h1.x, h1.y - 0.35);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Latch on near face
    const latch = g(0, hw * 0.98, H * 0.62);
    ctx.fillStyle = '#7a8890';
    ctx.beginPath();
    ctx.ellipse(latch.x, latch.y, 1.5, 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a3038';
    ctx.beginPath();
    ctx.ellipse(latch.x, latch.y, 0.55, 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stencil on near face
    const mark = g(0, hw * 0.62, H * 0.48);
    ctx.fillStyle = stencilColor;
    ctx.font = 'bold 3.6px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stencil, mark.x, mark.y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Upright hinged lid on far edge (~90°, concept-sheet style)
    const lidH = tall * 0.95;
    const lid = [
      g(-hl * 0.94, -hw * 0.98, H + 0.15),
      g(hl * 0.94, -hw * 0.98, H + 0.15),
      g(hl * 0.88, -hw * 1.08, H + lidH),
      g(-hl * 0.88, -hw * 1.08, H + lidH),
    ];
    ctx.fillStyle = lidFill;
    ctx.beginPath();
    ctx.moveTo(lid[0].x, lid[0].y);
    ctx.lineTo(lid[1].x, lid[1].y);
    ctx.lineTo(lid[2].x, lid[2].y);
    ctx.lineTo(lid[3].x, lid[3].y);
    ctx.closePath();
    ctx.fill();
    // Lid underside shadow + hinge nubs
    ctx.fillStyle = 'rgba(10, 8, 4, 0.35)';
    ctx.beginPath();
    ctx.moveTo(lid[0].x, lid[0].y);
    ctx.lineTo(lid[1].x, lid[1].y);
    ctx.lineTo(g(hl * 0.7, -hw * 1.02, H + lidH * 0.35).x, g(hl * 0.7, -hw * 1.02, H + lidH * 0.35).y);
    ctx.lineTo(g(-hl * 0.7, -hw * 1.02, H + lidH * 0.35).x, g(-hl * 0.7, -hw * 1.02, H + lidH * 0.35).y);
    ctx.closePath();
    ctx.fill();
    for (const t of [-0.55, 0.55]) {
      const hn = g(t * hl, -hw * 0.98, H + 0.2);
      ctx.fillStyle = '#6a6050';
      ctx.beginPath();
      ctx.arc(hn.x, hn.y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lid rim highlight
    ctx.strokeStyle = 'rgba(200, 180, 130, 0.28)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(lid[2].x, lid[2].y);
    ctx.lineTo(lid[3].x, lid[3].y);
    ctx.stroke();

    // Wear scuffs on near face
    const sc = g(-hl * 0.35, hw * 0.55, H * 0.7);
    ctx.fillStyle = 'rgba(20, 12, 6, 0.3)';
    ctx.fillRect(sc.x - 1.8, sc.y - 0.5, 3.6, 1.1);

    return { H, hl, hw, foamZ };
  };

  HangarBay.prototype._drawCargoBullets = function (ctx, item, g, len, wid, tall) {
    const fill = item.color || '#4a3428';
    const { H, hl, hw, foamZ } = this._drawAmmoCanOpen(ctx, g, len, wid, tall, {
      fill,
      fillDark: '#241810',
      fillMid: '#3a2a20',
      lidFill: '#3a2820',
      foam: '#14100c',
      stencil: '7.62',
      stencilColor: 'rgba(200, 190, 150, 0.55)',
      wallH: 0.82,
    });

    const accent = item.accent || '#c9a020';
    const brass = '#b89040';
    const brassHi = '#e0c878';
    const tipCol = '#3a4048';
    const rows = [-0.32, 0.32];
    const cols = 7;
    // Sort rounds far→near so nearer bullets occlude
    const rounds = [];
    for (let r = 0; r < rows.length; r++) {
      for (let i = 0; i < cols; i++) {
        const t = (i / (cols - 1)) * 2 - 1;
        const ax = t * hl * 0.72;
        const ay = rows[r] * hw;
        rounds.push({ ax, ay, r, i, depth: ay });
      }
    }
    rounds.sort((a, b) => a.depth - b.depth);

    // Belt links under each row
    for (const row of rows) {
      const a0 = g(-hl * 0.72, row * hw, foamZ + 0.8);
      const a1 = g(hl * 0.72, row * hw, foamZ + 0.8);
      ctx.strokeStyle = '#5a5548';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.stroke();
      ctx.strokeStyle = '#8a8070';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y - 0.4);
      ctx.lineTo(a1.x, a1.y - 0.4);
      ctx.stroke();
    }

    for (const rd of rounds) {
      const base = g(rd.ax, rd.ay, foamZ + 0.4);
      const mid = g(rd.ax, rd.ay, H * 0.55);
      const tip = g(rd.ax, rd.ay, H + tall * 0.18);
      // Brass casing
      ctx.strokeStyle = brass;
      ctx.lineWidth = 2.15;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(mid.x, mid.y);
      ctx.stroke();
      ctx.strokeStyle = brassHi;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(base.x - 0.45, base.y);
      ctx.lineTo(mid.x - 0.45, mid.y);
      ctx.stroke();
      // Case mouth
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, 1.05, 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      // Dark tip
      ctx.strokeStyle = tipCol;
      ctx.lineWidth = 1.55;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.fillStyle = '#5a6870';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 0.55, 0, Math.PI * 2);
      ctx.fill();
      // Primer
      ctx.fillStyle = '#d0a848';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y + 0.15, 0.75, 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Link clip between neighbors
      if (rd.i < cols - 1) {
        const nx = ((rd.i + 1) / (cols - 1)) * 2 - 1;
        const nBase = g(nx * hl * 0.72, rd.ay, foamZ + 1.0);
        ctx.strokeStyle = '#6a6558';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y - 0.3);
        ctx.lineTo(nBase.x, nBase.y - 0.3);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._drawCargoShells = function (ctx, item, g, len, wid, tall) {
    const fill = item.color || '#4a5230';
    const { H, hl, hw, foamZ } = this._drawAmmoCanOpen(ctx, g, len, wid, tall, {
      fill,
      fillDark: '#252818',
      fillMid: '#3a4228',
      lidFill: '#3a4224',
      foam: '#141810',
      stencil: '40mm',
      stencilColor: 'rgba(200, 190, 150, 0.55)',
      wallH: 0.72,
    });

    const accent = item.accent || '#d0a048';
    const slots = [
      [-0.55, -0.28],
      [0, -0.28],
      [0.55, -0.28],
      [-0.55, 0.38],
      [0, 0.38],
      [0.55, 0.38],
    ];
    // Pocket rings in foam
    for (const [ua, uc] of slots) {
      const p = g(ua * hl * 0.9, uc * hw * 0.85, foamZ + 0.15);
      ctx.strokeStyle = '#0c1008';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 2.4, 1.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const sorted = slots
      .map(([ua, uc]) => ({ ua, uc, depth: uc }))
      .sort((a, b) => a.depth - b.depth);

    for (const { ua, uc } of sorted) {
      const ax = ua * hl * 0.9;
      const ay = uc * hw * 0.85;
      const base = g(ax, ay, foamZ + 0.35);
      const mid = g(ax, ay, H + tall * 0.12);
      const tip = g(ax, ay, H + tall * 0.68);
      // Brass casing body
      ctx.strokeStyle = '#8a6a30';
      ctx.lineWidth = 4.6;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(mid.x, mid.y);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(base.x - 0.7, base.y);
      ctx.lineTo(mid.x - 0.7, mid.y);
      ctx.stroke();
      // Case mouth rim
      ctx.fillStyle = '#c8a060';
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, 2.25, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a4830';
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, 1.35, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Dark ogive / warhead
      ctx.strokeStyle = '#2e343c';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.fillStyle = '#5a6878';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
      // Band stripe on casing
      const band = g(ax, ay, foamZ + (H - foamZ) * 0.55);
      ctx.strokeStyle = 'rgba(40, 36, 28, 0.55)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(band.x, band.y, 2.1, 1.05, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Primer disc
      ctx.fillStyle = '#d0a848';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y + 0.25, 1.7, 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a5028';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y + 0.25, 0.55, 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._drawCargoLaser = function (ctx, item, g, len, wid, tall) {
    const accent = item.color || '#50a0c8';
    const metal = '#4a5868';
    const metalDark = '#1a2430';
    // Mount plate
    this._drawCargoBoxFaces(ctx, g, len * 0.22, wid * 0.42, tall * 0.35, metal, metalDark, '#6a7888');
    // Main housing
    const gH = (a, c, u = 0) => g(a - len * 0.08, c, u + tall * 0.2);
    this._drawCargoBoxFaces(
      ctx,
      gH,
      len * 0.28,
      wid * 0.28,
      tall * 0.55,
      metal,
      metalDark,
      this._cargoMix(metal, accent, 0.3)
    );
    // Emitter barrel along forward
    const b0 = g(-len * 0.05, 0, tall * 0.55);
    const b1 = g(len * 0.48, 0, tall * 0.6);
    ctx.strokeStyle = metalDark;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.stroke();
    // Emitter tip glow
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(b1.x, b1.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#c0f0ff';
    ctx.beginPath();
    ctx.arc(b1.x, b1.y, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Cooling fins
    for (let i = -1; i <= 1; i++) {
      const f0 = g(-len * 0.2, i * wid * 0.35, tall * 0.35);
      const f1 = g(-len * 0.38, i * wid * 0.4, tall * 0.7);
      ctx.strokeStyle = '#8a9aa8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._drawCargoTurret = function (ctx, item, g, len, wid, tall) {
    const accent = item.color || '#708898';
    const metal = '#4a5560';
    const metalDark = '#1e2830';
    // Ring base
    const base = g(0, 0, 0);
    ctx.fillStyle = metalDark;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + 1, len * 0.38, wid * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, len * 0.34, wid * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // Cupola
    const cup = g(0, 0, tall * 0.55);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(cup.x, cup.y, len * 0.22, wid * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = metalDark;
    ctx.beginPath();
    ctx.ellipse(cup.x, cup.y - tall * 0.08, len * 0.14, wid * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Twin barrels forward
    for (const ac of [-wid * 0.12, wid * 0.12]) {
      const t0 = g(len * 0.05, ac, tall * 0.5);
      const t1 = g(len * 0.48, ac * 0.6, tall * 0.55);
      ctx.strokeStyle = '#2a343c';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.stroke();
      ctx.fillStyle = '#8a9aa8';
      ctx.beginPath();
      ctx.arc(t1.x, t1.y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._drawCargoArmor = function (ctx, item, g, len, wid, tall) {
    const accent = item.color || '#6a7888';
    const metalDark = '#2a343c';
    // Sloped plate footprint
    const p0 = g(-len * 0.4, -wid * 0.4, tall * 0.15);
    const p1 = g(len * 0.42, -wid * 0.35, tall * 0.25);
    const p2 = g(len * 0.38, wid * 0.4, tall * 0.2);
    const p3 = g(-len * 0.42, wid * 0.38, tall * 0.12);
    const t0 = g(-len * 0.38, -wid * 0.35, tall * 0.85);
    const t1 = g(len * 0.4, -wid * 0.3, tall * 0.95);
    const t2 = g(len * 0.35, wid * 0.35, tall * 0.9);
    const t3 = g(-len * 0.4, wid * 0.32, tall * 0.8);
    // Far/near faces
    const faces = [
      [p0, p1, t1, t0],
      [p1, p2, t2, t1],
      [p2, p3, t3, t2],
      [p3, p0, t0, t3],
    ].sort(
      (a, b) =>
        (a[0].y + a[1].y + a[2].y + a[3].y) / 4 -
        (b[0].y + b[1].y + b[2].y + b[3].y) / 4
    );
    for (let i = 0; i < faces.length; i++) {
      const [a, b2, c, d] = faces[i];
      ctx.fillStyle = i < 2 ? metalDark : accent;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = this._cargoMix(accent, '#c0d0e0', 0.25);
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();
    // Rivet row
    for (let i = -2; i <= 2; i++) {
      const r = g(i * len * 0.12, 0, tall * 0.9);
      ctx.fillStyle = '#c9a020';
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  HangarBay.prototype._drawCargoThruster = function (ctx, item, g, len, wid, tall) {
    const accent = item.color || '#5a8aaa';
    const metal = '#4a5868';
    const metalDark = '#1a2430';
    // Flange / mount
    this._drawCargoBoxFaces(ctx, g, len * 0.28, wid * 0.35, tall * 0.4, metal, metalDark, '#6a7888');
    // Nozzle body along +along (exhaust aft = -along visually: use +along as nozzle mouth)
    const n0 = g(-len * 0.05, 0, tall * 0.45);
    const n1 = g(len * 0.42, 0, tall * 0.35);
    ctx.strokeStyle = metalDark;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(n0.x, n0.y);
    ctx.lineTo(n1.x, n1.y);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(n0.x, n0.y);
    ctx.lineTo(n1.x, n1.y);
    ctx.stroke();
    // Bell flare at mouth
    ctx.fillStyle = metalDark;
    ctx.beginPath();
    ctx.ellipse(n1.x, n1.y, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Throat glow
    ctx.fillStyle = 'rgba(120, 200, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(n1.x, n1.y, 1.6, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Feed lines
    for (const ac of [-wid * 0.25, wid * 0.25]) {
      const f0 = g(-len * 0.2, ac, tall * 0.55);
      const f1 = g(len * 0.1, ac * 0.4, tall * 0.4);
      ctx.strokeStyle = '#8a9aa8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._drawCargoEngine = function (ctx, item, g, len, wid, tall) {
    const accent = item.color || '#c87840';
    const metal = '#4a4848';
    const metalDark = '#221e1c';
    // Core housing
    this._drawCargoBoxFaces(
      ctx,
      g,
      len * 0.32,
      wid * 0.38,
      tall * 0.85,
      metal,
      metalDark,
      this._cargoMix(metal, accent, 0.35)
    );
    // Intake scoop (aft / -along)
    const i0 = g(-len * 0.45, -wid * 0.25, tall * 0.3);
    const i1 = g(-len * 0.45, wid * 0.25, tall * 0.3);
    const i2 = g(-len * 0.45, wid * 0.2, tall * 0.75);
    const i3 = g(-len * 0.45, -wid * 0.2, tall * 0.75);
    ctx.fillStyle = '#0a1018';
    ctx.beginPath();
    ctx.moveTo(i0.x, i0.y);
    ctx.lineTo(i1.x, i1.y);
    ctx.lineTo(i2.x, i2.y);
    ctx.lineTo(i3.x, i3.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Exhaust nozzles forward
    for (const ac of [-wid * 0.22, 0, wid * 0.22]) {
      const e0 = g(len * 0.28, ac, tall * 0.4);
      const e1 = g(len * 0.48, ac, tall * 0.35);
      ctx.strokeStyle = metalDark;
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e0.x, e0.y);
      ctx.lineTo(e1.x, e1.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 160, 60, 0.55)';
      ctx.beginPath();
      ctx.arc(e1.x, e1.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Status light
    const lite = g(0, wid * 0.15, tall * 0.95);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(lite.x, lite.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._drawCargoSensor = function (ctx, item, g, len, wid, tall) {
    const accent = item.color || '#60b090';
    const metal = '#4a5868';
    const metalDark = '#1a2830';
    // Pedestal
    this._drawCargoBoxFaces(ctx, g, len * 0.18, wid * 0.22, tall * 0.45, metal, metalDark, '#6a7888');
    // Mast
    const m0 = g(0, 0, tall * 0.45);
    const m1 = g(0, 0, tall * 0.85);
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m0.x, m0.y);
    ctx.lineTo(m1.x, m1.y);
    ctx.stroke();
    // Dish (tilted ellipse facing forward)
    const dish = g(len * 0.08, 0, tall * 0.9);
    ctx.fillStyle = metalDark;
    ctx.beginPath();
    ctx.ellipse(dish.x, dish.y, len * 0.32, wid * 0.28, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this._cargoMix(accent, '#a0e0c8', 0.2);
    ctx.beginPath();
    ctx.ellipse(dish.x - 0.4, dish.y - 0.3, len * 0.26, wid * 0.22, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(dish.x, dish.y, len * 0.32, wid * 0.28, 0.35, 0, Math.PI * 2);
    ctx.stroke();
    // Feed horn
    const horn = g(len * 0.22, 0, tall * 0.88);
    ctx.fillStyle = '#c8d0d8';
    ctx.beginPath();
    ctx.arc(horn.x, horn.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
    // Side secondary antenna
    const a0 = g(-len * 0.1, wid * 0.25, tall * 0.5);
    const a1 = g(-len * 0.15, wid * 0.4, tall * 1.05);
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(a1.x, a1.y);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(a1.x, a1.y, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
  };

  HangarBay.prototype._cargoMix = function (a, b, t) {
    const parse = (hex) => {
      const h = hex.replace('#', '');
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    };
    try {
      const A = parse(a);
      const B = parse(b);
      const m = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
      return `rgb(${m(0)},${m(1)},${m(2)})`;
    } catch {
      return a;
    }
  };

  HangarBay.prototype._drawDockPad = function (ctx, cx, cy, label, opts = {}) {
    const active = !!opts.active;
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

    ctx.restore();
  };

  HangarBay.prototype._drawVisitor = function (ctx, pad) {
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

    const def = pad.shipDef || this._ensurePadShipDef(pad);
    if (!def) {
      ctx.restore();
      return;
    }
    const turretAngle =
      typeof pad.turretAngle === 'number' ? pad.turretAngle : angle;
    drawVisitorShip(
      ctx,
      {
        shipDef: def,
        thrusters: pad.thrusters,
        velocity: { x: pad.shipVx || 0, y: pad.shipVy || 0 },
        angle,
        angularVelocity: 0,
        turretAngle,
        miningLaserRelAngle: pad.miningLaserRelAngle || 0,
        miningLaserFiring: !!pad.miningLaserFiring,
        miningLaserBeamLength: pad.miningLaserBeamLength,
        muzzleFlash: pad.muzzleFlash || 0,
        turretRecoil: pad.turretRecoil || 0,
        getTurretLocalAngle: () => turretAngle - angle,
      },
      null,
      hangarShipView(angle)
    );
    ctx.restore();
  };

  HangarBay.prototype._drawStairsLegacy = function (ctx) {
    for (const s of STAIRS) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(s.x - 12, s.y - 8, 24, 18);
    }
  };

  HangarBay.prototype._drawBayDangerLights = function (ctx) {
    const y0 = -BAY.HALF_H + BAY.DOOR_H + 6;
    const y1 = DANGER_ZONE_SOUTH;
    padCenters().forEach((cx, bay) => {
      const mode = this.bayLaneMode[bay] || 'idle';
      const lane = bayLaneHalf();
      this._drawDangerStripV(ctx, cx - lane, y0, y1, mode);
      this._drawDangerStripV(ctx, cx + lane, y0, y1, mode);
      this._drawDangerStripH(ctx, cx - lane, cx + lane, y1, mode);
    });
  };

  HangarBay.prototype._dangerYellowLit = function (mode, along, t) {
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
  };

  HangarBay.prototype._drawDangerStripV = function (ctx, x, y0, y1, mode) {
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
  };

  HangarBay.prototype._drawDangerStripH = function (ctx, x0, x1, y, mode) {
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
  };

  HangarBay.prototype._drawServiceBoardCargoBlock = function (ctx, x, y, w, h, block) {
    if (w < 0.8 || h < 0.8) return;
    const fill = block?.color || '#6a5538';
    const accent = block?.accent || '#c9a020';
    const fillTop = this._cargoMix(fill, accent, 0.25);
    const fillDark = '#2a2218';

    // Crate body (side bevel peek)
    ctx.fillStyle = fillDark;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.82);

    // Lid top
    ctx.fillStyle = fillTop;
    ctx.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.72);

    // Corner rim
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.45)';
    ctx.lineWidth = Math.max(0.35, Math.min(w, h) * 0.08);
    ctx.strokeRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.78);

    // Hazard / stencil stripe (matches `_drawCargoCrate` lid stripe)
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(0.45, Math.min(w, h) * 0.14);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, y + h * 0.58);
    ctx.lineTo(x + w * 0.82, y + h * 0.42);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Latch nub
    const lw = Math.max(0.6, w * 0.22);
    const lh = Math.max(0.35, h * 0.12);
    ctx.fillStyle = '#8a9aa8';
    ctx.fillRect(x + w * 0.5 - lw * 0.5, y + h * 0.2, lw, lh);

    // Scuff
    ctx.fillStyle = 'rgba(20, 12, 6, 0.28)';
    ctx.fillRect(x + w * 0.22, y + h * 0.62, w * 0.32, h * 0.16);
  };

  HangarBay.prototype._drawServiceDisplayBoards = function (ctx) {
    const top = SERVICE_BOARD_TOP;
    const hw = BACKSPLASH_HALF_W;
    const layout = serviceBoardFixedMetrics(top);
    const { bottom, wallH, bodyTop, bodyBot, bodyH } = layout;
    const colorMap = {
      green: '#3ce070',
      blue: '#4aa8ff',
      yellow: '#e8c040',
      red: '#ff5048',
      grey: '#8a9098',
      dim: '#6a7888',
      white: '#d0dce8',
    };

    padCenters().forEach((cx, bay) => {
      const x0 = cx - hw;
      const w = hw * 2;
      const faceY = top;
      const pad = this._servicePad(bay);
      const hasShip = this._bayHasShip(bay);
      const st = hasShip ? pad?.shipState : null;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(x0 - 1, bottom + 2, w + 2, 5);

      ctx.fillStyle = '#1a2228';
      ctx.fillRect(x0, bottom - 4, w, 8);
      ctx.fillStyle = '#0a1014';
      ctx.fillRect(x0, faceY, w, wallH - 2);
      ctx.fillStyle = 'rgba(120, 150, 170, 0.25)';
      ctx.fillRect(x0, faceY, w, 2);
      ctx.fillStyle = 'rgba(40, 50, 60, 0.5)';
      ctx.fillRect(x0, bottom - 4, w, 2);
      ctx.strokeStyle = '#5a7080';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, faceY, w, wallH + 2);

      ctx.fillStyle = '#2a3848';
      ctx.fillRect(x0 - 2, faceY - 1, 4, wallH + 6);
      ctx.fillRect(x0 + w - 2, faceY - 1, 4, wallH + 6);
      ctx.fillStyle = '#c9a020';
      ctx.fillRect(x0 - 2, faceY - 1, 4, 2);
      ctx.fillRect(x0 + w - 2, faceY - 1, 4, 2);

      const padInner = 3;
      const contentX = x0 + padInner;
      const contentW = w - padInner * 2;
      const colGap = 2;
      const colW = (contentW - colGap * 2) / 3;

      const col0 = contentX;
      const col1 = contentX + colW + colGap;
      const col2 = contentX + (colW + colGap) * 2;

      ctx.strokeStyle = 'rgba(80, 120, 150, 0.45)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(col1 - colGap / 2, bodyTop);
      ctx.lineTo(col1 - colGap / 2, bodyBot);
      ctx.moveTo(col2 - colGap / 2, bodyTop);
      ctx.lineTo(col2 - colGap / 2, bodyBot);
      ctx.stroke();

      const svc = pad?.service;
      const reveal = svc?.phase === 'boardReveal' ? svc.reveal : null;
      const statsShown =
        !hasShip || !st
          ? 0
          : reveal && reveal.stage !== 'done'
            ? reveal.statsShown | 0
            : 4;
      const cargoRevealOn =
        !reveal || reveal.stage === 'done' || reveal.cargoOn || reveal.stage === 'cargo';
      const cargoProgress =
        !reveal || reveal.stage === 'done' ? 1 : Math.max(0, reveal.cargoProgress || 0);

      ctx.fillStyle = colorMap.white;
      ctx.font = '3.2px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SHIP STATS', col0 + 1, bodyTop + 4);

      const statRows = hasShip && st
        ? [
            { label: `Hull (Mk.${st.hullMk ?? 1})`, v: st.hull },
            { label: `Fuel (Mk.${st.fuelMk ?? 1})`, v: st.fuel },
            { label: `Bullets (Mk.${st.bulletsMk ?? 1})`, v: st.bullets ?? st.ammo },
            { label: `Shells (Mk.${st.shellsMk ?? 1})`, v: st.shells ?? st.ammo },
          ]
        : [
            { label: 'Hull', v: null },
            { label: 'Fuel', v: null },
            { label: 'Bullets', v: null },
            { label: 'Shells', v: null },
          ];
      statRows.forEach((row, ri) => {
        const ty = bodyTop + 10 + ri * 5.5;
        if (ri >= statsShown || row.v == null) {
          ctx.fillStyle = colorMap.dim;
          ctx.font = '3.1px monospace';
          ctx.fillText(`${row.label}: --`, col0 + 1, ty);
        } else {
          const pct = Math.round(row.v * 100);
          ctx.fillStyle = colorMap[statColorForPct(row.v)] || colorMap.dim;
          ctx.font = '3.1px monospace';
          ctx.fillText(`${row.label}: ${pct}%`, col0 + 1, ty);
        }
      });

      const hold = st?.cargoHold;
      const cargoMk = st?.cargoMk ?? 0;
      if (!hasShip || !st) {
        ctx.fillStyle = colorMap.dim;
        ctx.font = '3.2px monospace';
        ctx.fillText('CARGO', col1 + 1, bodyTop + 4);
        ctx.fillText('--', col1 + 1, bodyTop + 12);
      } else if (!cargoRevealOn) {
        ctx.fillStyle = colorMap.dim;
        ctx.font = '3.2px monospace';
        ctx.fillText('CARGO', col1 + 1, bodyTop + 4);
        ctx.fillText('--', col1 + 1, bodyTop + 12);
      } else if (!cargoMk || !hold?.slots) {
        ctx.fillStyle = colorMap.white;
        ctx.font = '3.2px monospace';
        ctx.fillText('CARGO', col1 + 1, bodyTop + 4);
        ctx.fillStyle = colorMap.dim;
        ctx.font = '3px monospace';
        ctx.fillText('NO CARGO BAY', col1 + 1, bodyTop + 14);
      } else {
        const freePct = Math.round((st.cargoSpace ?? 0) * 100);
        ctx.fillStyle = colorMap.white;
        ctx.font = '3.2px monospace';
        ctx.fillText(`CARGO (Mk.${cargoMk})`, col1 + 1, bodyTop + 4);
        if (cargoProgress >= 0.25) {
          ctx.font = '2.8px monospace';
          ctx.fillStyle = '#a8b8c8';
          ctx.fillText(`Room: ${freePct}% (${hold.slots} Slots)`, col1 + 1, bodyTop + 9);
        }

        const gridTop = bodyTop + 12;
        const gridBot = bodyBot - 1;
        const gridH = Math.max(8, gridBot - gridTop);
        const gridW = colW - 2;
        const cell = Math.min(gridW / hold.cols, gridH / hold.rows);
        const gw = cell * hold.cols;
        const gh = cell * hold.rows;
        const gx = col1 + (colW - gw) / 2;
        const gy = gridTop + (gridH - gh) / 2;

        if (cargoProgress >= 0.35) {
          ctx.strokeStyle = 'rgba(100, 120, 140, 0.55)';
          ctx.lineWidth = 0.5;
          for (let r = 0; r < hold.rows; r++) {
            for (let c = 0; c < hold.cols; c++) {
              ctx.strokeRect(gx + c * cell, gy + r * cell, cell - 0.4, cell - 0.4);
            }
          }
        }
        const blocks = hold.cells || [];
        const showN = Math.floor(blocks.length * cargoProgress);
        for (let bi = 0; bi < showN; bi++) {
          const block = blocks[bi];
          this._drawServiceBoardCargoBlock(
            ctx,
            gx + block.c * cell + 0.25,
            gy + block.r * cell + 0.25,
            (block.w || 1) * cell - 0.7,
            (block.h || 1) * cell - 0.7,
            block
          );
        }
      }

      const rows = this._serviceDisplayRows(bay, ctx, colW);
      const scroll = pad?.serviceScroll || { offset: 0 };
      const sb = drawServiceChecklistColumn(ctx, col2, colW, layout, rows, {
        headerLight: this._boardHeaderLight(bay),
        headerFlash:
          this._boardHeaderLight(bay) === 'redFlash'
            ? Math.sin(this.time * 10 + bay) > 0
              ? 0.9
              : 0.15
            : undefined,
        colorMap,
        scroll,
      });
      this._serviceColumnHit[bay] = {
        colX: col2,
        colW,
        listTop: layout.listTop,
        listH: layout.listH,
        sb,
      };

      // Twin Hangar Bay Scanners are permanent board hardware (glow while scanning)
      const scanAmp =
        hasShip && this._padBoardScanActive(pad) ? this._padBoardScanAmp(pad) : 0;
      this._drawHangarBayScannerPod(ctx, x0 + 3.5, faceY - 1.5, scanAmp, bay, 0);
      this._drawHangarBayScannerPod(ctx, x0 + w - 3.5, faceY - 1.5, scanAmp, bay, 1);

      ctx.fillStyle = '#c98020';
      ctx.font = 'bold 5.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bayLabels()[bay], cx, bottom - 2);
    });
  };

  HangarBay.prototype._drawHangarBayScannerPod = function (ctx, x, y, intensity, bay, side) {
    const on = intensity > 0.02;
    const pulse = on
      ? 0.72 + 0.28 * Math.sin(this.time * 14 + bay * 1.7 + side * 2.1)
      : 0;
    const glow = intensity * pulse;

    // Stem into board lip
    ctx.fillStyle = '#1c2830';
    ctx.fillRect(x - 1.2, y, 2.4, 3.2);
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(x - 2.2, y - 1.6, 4.4, 2.8);

    // Lens / emitter
    ctx.beginPath();
    ctx.arc(x, y - 2.4, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = on ? `rgba(40, 90, 60, ${0.55 + glow * 0.35})` : '#243038';
    ctx.fill();
    ctx.strokeStyle = on ? `rgba(90, 220, 140, ${0.35 + glow * 0.5})` : '#4a6070';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    if (on) {
      ctx.beginPath();
      ctx.arc(x, y - 2.4, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120, 255, 170, ${0.45 + glow * 0.5})`;
      ctx.fill();
      // Soft corona
      ctx.beginPath();
      ctx.arc(x, y - 2.4, 3.6 + glow * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(60, 220, 120, ${0.08 + glow * 0.14})`;
      ctx.fill();
    }
  };

  HangarBay.prototype._shipScanTarget = function (bay) {
    if (!this._bayHasShip(bay)) return null;
    const pad = this._servicePad(bay);
    const cx = padCenters()[bay] ?? 0;
    let sy = 0;
    let angle = FACE_NORTH;
    let def = pad?.shipDef || null;
    if (this.isPlayerBay(bay) && this._playerShip) {
      const ship = this._playerShip;
      sy = ship.position?.y ?? 0;
      angle = typeof ship.angle === 'number' ? ship.angle : FACE_NORTH;
      def = ship.shipDef || def;
    } else if (pad) {
      sy = pad.shipY || 0;
      angle = pad.shipAngle ?? FACE_NORTH;
      def = def || this._ensurePadShipDef(pad);
    }
    const ext = def?.hullExtents?.();
    const halfLen = Math.max(16, ((ext?.forward || 22) + (ext?.aft || 20)) * 0.52);
    const halfBeam = Math.max(10, halfLen * 0.42);
    return { cx, cy: sy, angle, halfLen, halfBeam };
  };

  HangarBay.prototype._drawShipBoardScans = function (ctx) {
    padCenters().forEach((cx, bay) => {
      const pad = this._servicePad(bay);
      if (!this._padBoardScanActive(pad)) return;
      const amp = this._padBoardScanAmp(pad);
      if (amp < 0.02) return;
      const target = this._shipScanTarget(bay);
      if (!target) return;

      const boardX0 = cx - BACKSPLASH_HALF_W;
      const boardW = BACKSPLASH_HALF_W * 2;
      const faceY = SERVICE_BOARD_TOP;
      const emitters = [
        { x: boardX0 + 3.5, y: faceY - 3.8, side: 0 },
        { x: boardX0 + boardW - 3.5, y: faceY - 3.8, side: 1 },
      ];
      const scanT = this._padBoardScanClock(pad);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Raster bar: sweeps nose↔aft across the hull (barcode-reader feel)
      const rasterU = pingPong01(scanT * 1.15);
      const c = Math.cos(target.angle);
      const s = Math.sin(target.angle);
      // Ship local +X is forward; hangar nose is typically north (−Y world when angle=SPAWN)
      const along = (rasterU * 2 - 1) * target.halfLen;
      const rx = target.cx + c * along;
      const ry = target.cy + s * along;
      const bx = -s * target.halfBeam * 1.15;
      const by = c * target.halfBeam * 1.15;
      this._strokeScanSegment(
        ctx,
        rx - bx,
        ry - by,
        rx + bx,
        ry + by,
        amp * 0.85,
        2.4
      );
      this._strokeScanSegment(
        ctx,
        rx - bx,
        ry - by,
        rx + bx,
        ry + by,
        amp,
        0.85
      );

      // Ghost trailing rasters
      for (const trail of [-0.12, 0.12]) {
        const u2 = pingPong01(scanT * 1.15 + trail);
        const along2 = (u2 * 2 - 1) * target.halfLen;
        const rx2 = target.cx + c * along2;
        const ry2 = target.cy + s * along2;
        this._strokeScanSegment(
          ctx,
          rx2 - bx,
          ry2 - by,
          rx2 + bx,
          ry2 + by,
          amp * 0.28,
          1.4
        );
      }

      // Corner lasers ping-pong aim points across the hull
      for (const em of emitters) {
        const phase = em.side * 0.5;
        for (let k = 0; k < 3; k++) {
          const u = pingPong01(scanT * (1.35 + k * 0.17) + phase + k * 0.22);
          const v = pingPong01(scanT * (0.9 + k * 0.11) + phase * 1.3 + 0.4);
          // Aim in ship-local frame, then to world
          const lx = (u * 2 - 1) * target.halfLen * 0.95;
          const ly = (v * 2 - 1) * target.halfBeam * 0.9;
          const ax = target.cx + c * lx - s * ly;
          const ay = target.cy + s * lx + c * ly;
          // Overshoot slightly past the aim so lines rake the silhouette
          const dx = ax - em.x;
          const dy = ay - em.y;
          const len = Math.hypot(dx, dy) || 1;
          const ox = ax + (dx / len) * 6;
          const oy = ay + (dy / len) * 6;
          const beamAmp = amp * (0.55 + 0.2 * (1 - k * 0.25));
          this._strokeScanSegment(ctx, em.x, em.y, ox, oy, beamAmp * 0.45, 2.8);
          this._strokeScanSegment(ctx, em.x, em.y, ox, oy, beamAmp, 0.7);
          // Contact spark on hull
          ctx.beginPath();
          ctx.arc(ax, ay, 1.2 + amp * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(160, 255, 200, ${0.15 * beamAmp})`;
          ctx.fill();
        }
      }

      ctx.restore();
    });
  };

  HangarBay.prototype._strokeScanSegment = function (ctx, x0, y0, x1, y1, amp, width) {
    if (amp < 0.02) return;
    ctx.strokeStyle = `rgba(70, 230, 130, ${0.22 * amp})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = `rgba(180, 255, 210, ${0.35 * amp})`;
    ctx.lineWidth = Math.max(0.45, width * 0.28);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  HangarBay.prototype._drawForkliftHub = function (ctx) {
    const y = FORKLIFT_HUB_Y;
    const hw = FORKLIFT_HUB_HALF_W;
    const padH = FORKLIFT_PARK_SPOT_H + 14;
    const x0 = -hw;
    const y0 = y - padH / 2;

    // Worn deck patch — no individual stall marks (logic still uses FORKLIFT_PARKS)
    ctx.fillStyle = 'rgba(36, 44, 52, 0.62)';
    ctx.fillRect(x0, y0, FORKLIFT_HUB_W, padH);
    ctx.fillStyle = 'rgba(18, 14, 8, 0.12)';
    ctx.beginPath();
    ctx.ellipse(-hw * 0.35, y + 2, 40, 8, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hw * 0.4, y - 3, 28, 6, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Same dashed yellow paint as the roadway — skip the north edge (road already has it)
    ctx.strokeStyle = 'rgba(200, 160, 40, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y0 + padH);
    ctx.lineTo(x0 + FORKLIFT_HUB_W, y0 + padH);
    ctx.lineTo(x0 + FORKLIFT_HUB_W, y0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Faded industrial stencils — a few placements, not a clean title
    const stencils = [
      { text: 'FORKLIFT PARKING', x: -hw * 0.55, y: y - 4, rot: -0.04, size: 4.2 },
      { text: 'FORKLIFT ONLY', x: hw * 0.2, y: y + 5, rot: 0.03, size: 3.6 },
      { text: 'CREW VEHICLES', x: hw * 0.55, y: y - 6, rot: -0.02, size: 3.2 },
      { text: 'PARK HERE', x: -hw * 0.15, y: y + 7, rot: 0.05, size: 3.4 },
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of stencils) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = 'rgba(201, 160, 32, 0.22)';
      ctx.font = `bold ${s.size}px sans-serif`;
      ctx.fillText(s.text, 0.6, 0.5);
      ctx.fillStyle = 'rgba(160, 150, 110, 0.38)';
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
    }
    // Chargers / tire racks / cones live in FORKLIFT_YARD_PROPS (2.5D set dressing)
  };

  HangarBay.prototype._drawCraneCabin = function (ctx, c, tx, by) {
    const op = c.operator || CRANE_CREW;
    const lev = c.levers || { travel: 0, hoist: 0, grip: 0 };
    const cabX = tx + 13;
    const cabY = by;
    const w = 15;
    const h = 13;

    // Cab shadow on bridge
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cabX, cabY + h / 2 + 2, w * 0.55, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cab body — 2.5D shell
    ctx.fillStyle = '#1a2834';
    ctx.fillRect(cabX - w / 2, cabY - h / 2 + 2, w, h - 2);
    ctx.fillStyle = CRANE_CREW.suitDark;
    ctx.fillRect(cabX - w / 2, cabY - h / 2 + 2, 3, h - 2);
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(cabX - w / 2, cabY - h / 2, w, h);
    ctx.fillStyle = '#4a5a68';
    ctx.fillRect(cabX - w / 2, cabY - h / 2, w, 2.5);
    ctx.strokeStyle = '#9aacbc';
    ctx.lineWidth = 1;
    ctx.strokeRect(cabX - w / 2, cabY - h / 2, w, h);
    // Hazard stripe on roof
    ctx.fillStyle = CRANE_CREW.stripe;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cabX - w / 2 + 1, cabY - h / 2 + 0.4, w - 2, 1.4);
    ctx.globalAlpha = 1;
    // Wear scuff
    ctx.fillStyle = 'rgba(20, 12, 6, 0.3)';
    ctx.fillRect(cabX + 2, cabY - 1, 4, 5);

    // Glass viewport
    ctx.fillStyle = 'rgba(50, 110, 150, 0.38)';
    ctx.strokeStyle = 'rgba(160, 200, 220, 0.55)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.rect(cabX - 5.8, cabY - 4.8, 11.6, 7);
    ctx.fill();
    ctx.stroke();

    // Operator body (seated)
    const headX = cabX;
    const headY = cabY - 3.0;
    ctx.fillStyle = op.suit || CRANE_CREW.suit;
    ctx.fillRect(cabX - 2.4, cabY - 1.2, 4.8, 4.5);
    ctx.fillStyle = CRANE_CREW.stripe;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(cabX - 2.4, cabY - 0.2, 4.8, 1.1);
    ctx.globalAlpha = 1;

    // Head — 8-dir look at current task destination; helmet + distinct facemask
    const oct = this._crewVisOctant(op);
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const faceCam = fy; // +Y south / toward camera → full mask

    // Helmet shell
    ctx.fillStyle = op.helmet || CRANE_CREW.helmet;
    ctx.beginPath();
    ctx.arc(headX, headY, 2.35, 0, Math.PI * 2);
    ctx.fill();
    // Helmet rim wear
    ctx.strokeStyle = 'rgba(40, 28, 16, 0.4)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.arc(headX, headY, 2.35, 0.35, Math.PI * 1.15);
    ctx.stroke();
    // Brow stripe
    ctx.strokeStyle = CRANE_CREW.stripe;
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(headX - 1.6, headY - 1.55);
    ctx.lineTo(headX + 1.6, headY - 1.55);
    ctx.stroke();

    // Facemask — dark plate offset toward look dir (hidden when facing fully away)
    if (faceCam > -0.55) {
      const maskScale = 0.55 + 0.45 * Math.max(0, Math.min(1, (faceCam + 0.55) / 1.55));
      const mx = headX + fx * (1.15 * maskScale);
      const my = headY + fy * (0.95 * maskScale);
      const mask = op.mask || CRANE_CREW.mask;
      // Mask body
      ctx.fillStyle = mask;
      ctx.beginPath();
      ctx.ellipse(mx, my, 1.55 * maskScale, 1.4 * maskScale, heading, 0, Math.PI * 2);
      ctx.fill();
      // Mask rim (metal lip — reads separate from helmet)
      ctx.strokeStyle = CRANE_CREW.maskRim;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(mx, my, 1.55 * maskScale, 1.4 * maskScale, heading, 0, Math.PI * 2);
      ctx.stroke();
      // Visor glass inset in the mask
      ctx.fillStyle = CRANE_CREW.visor;
      ctx.beginPath();
      ctx.ellipse(
        mx + fx * 0.2,
        my + fy * 0.15,
        1.05 * maskScale,
        0.78 * maskScale,
        heading,
        0,
        Math.PI * 2
      );
      ctx.fill();
      // Cheek vents (mask detail, not helmet)
      ctx.fillStyle = 'rgba(120, 140, 160, 0.35)';
      const rx = -fy;
      const ry = fx;
      ctx.fillRect(mx + rx * 0.95 * maskScale - 0.35, my + ry * 0.95 * maskScale - 0.5, 0.7, 1.0);
      ctx.fillRect(mx - rx * 0.95 * maskScale - 0.35, my - ry * 0.95 * maskScale - 0.5, 0.7, 1.0);
    } else {
      // Back of helmet when looking north
      ctx.fillStyle = 'rgba(40, 32, 24, 0.35)';
      ctx.beginPath();
      ctx.arc(headX + fx * 0.4, headY + fy * 0.4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Console shelf
    ctx.fillStyle = '#141c26';
    ctx.fillRect(cabX - 5.5, cabY + 2.4, 11, 2.6);
    ctx.strokeStyle = '#6a7a88';
    ctx.lineWidth = 0.65;
    ctx.strokeRect(cabX - 5.5, cabY + 2.4, 11, 2.6);

    // Three levers: XY travel · hoist up/down · claw open/close
    const baseY = cabY + 2.65;
    const levers = [
      { x: cabX - 3.4, t: lev.travel, color: '#c8a050', label: 'XY' },
      { x: cabX, t: lev.hoist, color: '#70b0d0', label: 'Z' },
      { x: cabX + 3.4, t: lev.grip, color: '#d08070', label: 'C' },
    ];
    for (const L of levers) {
      const throwAmt = Math.max(-1, Math.min(1, L.t || 0));
      const a = throwAmt * 0.72;
      const tipX = L.x + Math.sin(a) * 3.6;
      const tipY = baseY - Math.cos(a) * 3.6;
      // Gate slot
      ctx.strokeStyle = 'rgba(90, 100, 110, 0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(L.x - Math.sin(0.72) * 1.6, baseY - Math.cos(0.72) * 1.6);
      ctx.lineTo(L.x + Math.sin(0.72) * 1.6, baseY - Math.cos(0.72) * 1.6);
      ctx.stroke();
      // Stick
      ctx.strokeStyle = '#c8d0d8';
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(L.x, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      // Knob
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // Pivot
      ctx.fillStyle = '#3a4450';
      ctx.beginPath();
      ctx.arc(L.x, baseY, 1.05, 0, Math.PI * 2);
      ctx.fill();
      // Tiny legend on console
      ctx.fillStyle = 'rgba(180, 190, 200, 0.55)';
      ctx.font = '4px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(L.label, L.x, baseY + 3.6);
    }
    ctx.lineCap = 'butt';
    ctx.textAlign = 'left';
  };

  HangarBay.prototype._drawOverhead = function (ctx) {
    const c = this.crane;
    const [rx0, rx1] = RUNWAY_X;

    // Runway rails
    ctx.strokeStyle = 'rgba(90, 120, 140, 0.75)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rx0, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx0, BRIDGE_Y_MAX + 8);
    ctx.moveTo(rx1, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx1, BRIDGE_Y_MAX + 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160, 180, 200, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rx0 - 1.5, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx0 - 1.5, BRIDGE_Y_MAX + 8);
    ctx.moveTo(rx1 + 1.5, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx1 + 1.5, BRIDGE_Y_MAX + 8);
    ctx.stroke();

    // Runway structural ties
    ctx.strokeStyle = 'rgba(70, 95, 115, 0.45)';
    ctx.lineWidth = 2;
    for (let y = BRIDGE_Y_MIN; y <= BRIDGE_Y_MAX; y += 48) {
      ctx.beginPath();
      ctx.moveTo(rx0 - 7, y);
      ctx.lineTo(rx0 + 7, y);
      ctx.moveTo(rx1 - 7, y);
      ctx.lineTo(rx1 + 7, y);
      ctx.stroke();
    }

    if (!c) return;

    const by = c.bridgeY;
    const tx = c.trolleyX;
    const hoist = c.hoist;
    const hook = this._craneHookPos();

    // Bridge beam — thicker 2.5D girder
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(rx0 - 3, by - 1, rx1 - rx0 + 6, 5);
    ctx.fillStyle = '#5a6a78';
    ctx.fillRect(rx0 - 3, by - 3.5, rx1 - rx0 + 6, 5);
    ctx.fillStyle = '#4a5a68';
    ctx.fillRect(rx0 - 3, by - 3.5, rx1 - rx0 + 6, 2);
    ctx.strokeStyle = '#9aacbc';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx0 - 3, by - 3.5, rx1 - rx0 + 6, 7);
    // Hazard dashes along near lip
    ctx.fillStyle = 'rgba(201, 160, 32, 0.4)';
    for (let x = rx0 + 8; x < rx1 - 8; x += 22) {
      ctx.fillRect(x, by + 2.2, 10, 1.2);
    }

    // End trucks
    for (const rx of [rx0, rx1]) {
      ctx.fillStyle = '#1a2430';
      ctx.fillRect(rx - 5, by - 2, 10, 9);
      ctx.fillStyle = '#6a7888';
      ctx.fillRect(rx - 5, by - 6, 10, 10);
      ctx.strokeStyle = '#b0c0d0';
      ctx.lineWidth = 0.85;
      ctx.strokeRect(rx - 5, by - 6, 10, 10);
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.arc(rx - 2.5, by + 4, 2, 0, Math.PI * 2);
      ctx.arc(rx + 2.5, by + 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trolley carriage
    ctx.fillStyle = '#1a2430';
    ctx.fillRect(tx - 9, by - 2, 18, 9);
    ctx.fillStyle = '#5a6a78';
    ctx.fillRect(tx - 9, by - 6, 18, 10);
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(tx - 9, by - 6, 18, 2.5);
    ctx.strokeStyle = '#c0d0e0';
    ctx.lineWidth = 0.95;
    ctx.strokeRect(tx - 9, by - 6, 18, 10);
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(tx - 4, by - 3.5, 8, 6);
    ctx.fillStyle = 'rgba(201, 160, 32, 0.45)';
    ctx.fillRect(tx - 8, by - 5.5, 6, 1.2);

    this._drawCraneCabin(ctx, c, tx, by);

    // Hoist cables
    ctx.strokeStyle = 'rgba(40, 44, 48, 0.75)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tx - 2.5, by + 5);
    ctx.lineTo(hook.x - 2.5, hook.y);
    ctx.moveTo(tx + 2.5, by + 5);
    ctx.lineTo(hook.x + 2.5, hook.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190, 200, 210, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx - 2.5, by + 5);
    ctx.lineTo(hook.x - 2.5, hook.y);
    ctx.moveTo(tx + 2.5, by + 5);
    ctx.lineTo(hook.x + 2.5, hook.y);
    ctx.stroke();

    // Aim shadow on deck
    const aimY = this._craneAimFloorY(c);
    const hoistT = Math.min(1, Math.max(0, hoist / HOIST_MAX));
    const rx = 8.5 + hoistT * 2.5;
    const ry = rx * 0.5;
    const sx = tx;
    const sy = aimY + 2;
    const aCore = 0.34 + hoistT * 0.08;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, ry / rx);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, `rgba(0, 0, 0, ${aCore})`);
    grad.addColorStop(0.5, `rgba(0, 0, 0, ${aCore * 0.55})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const cargoPos = c.carried ? this._craneCargoDrawPos() : null;

    // —— Grabber hand (tip math LOCKED — do not change leftTip/rightTip/midTip/tipY) ——
    const open = c.claw ?? CLAW_OPEN;
    const palmY = hook.y + CLAW_PALM;
    const tipY = hook.y + CLAW_FINGER;
    const leftBase = hook.x - 4;
    const rightBase = hook.x + 4;
    const leftTip = hook.x - (2.2 + open * 5.5);
    const rightTip = hook.x + (2.2 + open * 5.5);
    const midTip = hook.x + (open - 0.5) * 0.8;

    // Wrist block above palm
    ctx.fillStyle = '#3a4550';
    ctx.strokeStyle = '#a8b8c8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hook.x - 5, hook.y - 2);
    ctx.lineTo(hook.x + 5, hook.y - 2);
    ctx.lineTo(hook.x + 4.5, hook.y + 1);
    ctx.lineTo(hook.x - 4.5, hook.y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Palm plate (same footprint as before, slightly thicker face)
    ctx.fillStyle = '#5a6a78';
    ctx.strokeStyle = '#c8d0d8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hook.x - 6, hook.y);
    ctx.lineTo(hook.x + 6, hook.y);
    ctx.lineTo(hook.x + 4, palmY);
    ctx.lineTo(hook.x - 4, palmY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(20, 16, 10, 0.25)';
    ctx.fillRect(hook.x - 3, hook.y + 1, 2, palmY - hook.y - 2);

    // Carried cargo hangs from the fingers (top just above fingertip line)
    if (c.carried && cargoPos) {
      this._drawCargoItem(ctx, c.carried, cargoPos.x, cargoPos.y, 1, c.carried.restHeading ?? 0);
    }

    // Fingers — thicker industrial tines, endpoints unchanged
    ctx.strokeStyle = '#2a343c';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftBase, palmY);
    ctx.lineTo(leftTip, tipY);
    ctx.moveTo(rightBase, palmY);
    ctx.lineTo(rightTip, tipY);
    ctx.moveTo(hook.x, palmY);
    ctx.lineTo(midTip, tipY + 1);
    ctx.stroke();
    ctx.strokeStyle = '#c8d0d8';
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(leftBase, palmY);
    ctx.lineTo(leftTip, tipY);
    ctx.moveTo(rightBase, palmY);
    ctx.lineTo(rightTip, tipY);
    ctx.moveTo(hook.x, palmY);
    ctx.lineTo(midTip, tipY + 1);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Fingertip pads — exact tip locations
    ctx.fillStyle = '#8a9aa8';
    for (const [fx, fy] of [
      [leftTip, tipY],
      [rightTip, tipY],
      [midTip, tipY + 1],
    ]) {
      ctx.beginPath();
      ctx.arc(fx, fy, 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d0d8e0';
      ctx.beginPath();
      ctx.arc(fx, fy, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a9aa8';
    }
  };

  HangarBay.prototype._drawMechanic = function (ctx, npc) {
    const theme =
      npc.theme ||
      MECH_BAY_THEMES[npc.homeBay ?? 0] ||
      MECH_BAY_THEMES[0];
    const weldingWork =
      npc.state === 'workWeld' ||
      (npc.state === 'workShip' &&
        (npc.job === 'installUpgrade' || npc.job === 'removeUpgrade'));
    const bob =
      npc.state === 'flinch' || npc.state === 'clearHot'
        ? Math.sin(npc.phase * 3) * 1.5
        : weldingWork
          ? Math.sin(npc.phase) * 0.25
          : Math.sin(npc.phase) * 0.8;
    const duck =
      npc.state === 'flinch' || npc.state === 'flee' || npc.state === 'clearHot'
        ? 2
        : weldingWork
          ? 1.35
          : 0;
    const walking = [
      'toPile',
      'toShip',
      'toExit',
      'enterDoor',
      'exitDoor',
      'flee',
      'clearHot',
      'toFloorDrop',
      'leaveHatch',
      'linger',
      'idleFluff',
      'gossip',
    ].includes(npc.state);
    const stride = walking ? Math.sin(npc.phase) * 2.4 : 0;

    const oct = this._crewVisOctant(npc);
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const rx = -fy;
    const ry = fx;
    const alongScale = 0.78 + 0.22 * Math.abs(fx);
    const acrossScale = 0.78 + 0.22 * Math.abs(fy);

    // Under-deck emerge / descend
    let scale = 1;
    let alpha = 1;
    if (npc.state === 'emerge') {
      scale = Math.min(1, 0.4 + ((npc.emergeT || 0) / 0.55) * 0.6);
      alpha = 0.55 + scale * 0.45;
    } else if (npc.state === 'descend') {
      scale = Math.max(0.35, npc.stateT / 0.45);
      alpha = 0.55 + scale * 0.45;
    }

    const g = (along, across, up = 0) => ({
      x: npc.x + (fx * along * alongScale + rx * across * acrossScale) * scale,
      y:
        npc.y +
        (fy * along * alongScale + ry * across * acrossScale) * scale +
        bob -
        up * scale,
    });

    // Torch / arc only for hull repair + hardpoint install/strip — not load/unload
    const welding =
      npc.job === 'weld' ||
      npc.job === 'installUpgrade' ||
      npc.job === 'removeUpgrade';
    const cargo = npc.cargo || npc._mechLift?.cargo;
    const panicked =
      npc.state === 'flee' || npc.state === 'flinch' || npc.state === 'clearHot';

    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(
      npc.x,
      npc.y + 5 + bob,
      5.5 * scale,
      2.2 * scale,
      heading * 0.12,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Legs — far then near by screen Y
    const legL = {
      hip: g(-0.6, -1.6, 3 + duck),
      foot: g(-0.8 - stride * 0.15, -2.1, -0.2),
      y: 0,
    };
    const legR = {
      hip: g(-0.6, 1.6, 3 + duck),
      foot: g(-0.8 + stride * 0.15, 2.1, -0.2),
      y: 0,
    };
    legL.y = (legL.hip.y + legL.foot.y) / 2;
    legR.y = (legR.hip.y + legR.foot.y) / 2;
    const legs = [legL, legR].sort((a, b) => a.y - b.y);

    const drawLeg = (leg) => {
      ctx.strokeStyle = theme.suitDark;
      ctx.lineWidth = 2.1 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(leg.hip.x, leg.hip.y);
      ctx.lineTo(leg.foot.x, leg.foot.y);
      ctx.stroke();
      // Boot
      ctx.fillStyle = theme.boot;
      ctx.beginPath();
      ctx.ellipse(leg.foot.x, leg.foot.y + 0.6, 2.1 * scale, 1.2 * scale, heading * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineCap = 'butt';
    };

    drawLeg(legs[0]);

    // Tool belt / hips (far side of torso stack)
    const hip = g(-0.4, 0, 3.2 + duck);
    ctx.fillStyle = theme.suitWear;
    ctx.beginPath();
    ctx.ellipse(hip.x, hip.y, 3.4 * scale, 2.0 * scale, heading * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Torso — vertical faces sorted by Y
    const t0 = g(-1.2, -2.4, 4 + duck);
    const t1 = g(-1.2, 2.4, 4 + duck);
    const t2 = g(1.6, 2.4, 4 + duck);
    const t3 = g(1.6, -2.4, 4 + duck);
    const torsoH = 6.5;
    const torsoFaces = [
      [t0, t1],
      [t1, t2],
      [t2, t3],
      [t3, t0],
    ].sort((e0, e1) => (e0[0].y + e0[1].y) / 2 - (e1[0].y + e1[1].y) / 2);
    for (let i = 0; i < torsoFaces.length; i++) {
      const [p0, p1] = torsoFaces[i];
      ctx.fillStyle = i < 2 ? theme.suitWear : theme.suitDark;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p1.x, p1.y - torsoH * scale);
      ctx.lineTo(p0.x, p0.y - torsoH * scale);
      ctx.closePath();
      ctx.fill();
    }
    // Top / chest plate
    ctx.fillStyle = theme.suit;
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y - torsoH * scale);
    ctx.lineTo(t1.x, t1.y - torsoH * scale);
    ctx.lineTo(t2.x, t2.y - torsoH * scale);
    ctx.lineTo(t3.x, t3.y - torsoH * scale);
    ctx.closePath();
    ctx.fill();
    // Bay stripe + scuff
    const s0 = g(0.2, -2.0, 7.5 + duck);
    const s1 = g(0.2, 2.0, 7.5 + duck);
    ctx.strokeStyle = theme.stripe;
    ctx.lineWidth = 1.5 * scale;
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20, 14, 8, 0.22)';
    const sc = g(0.4, -0.8, 8.2 + duck);
    ctx.fillRect(sc.x - 1.5 * scale, sc.y, 3.2 * scale, 1.4 * scale);

    // Backpack / O2 pack — draw before helmet if farther (negative along)
    const pack = g(-2.4, 0, 7 + duck);
    const chest = g(0.4, 0, 7 + duck);
    const drawPack = () => {
      ctx.fillStyle = theme.pack;
      ctx.fillRect(
        pack.x - 2.2 * scale,
        pack.y - 4.5 * scale,
        4.4 * scale,
        5.5 * scale
      );
      ctx.fillStyle = 'rgba(180, 160, 80, 0.35)';
      ctx.fillRect(
        pack.x - 1.6 * scale,
        pack.y - 3.8 * scale,
        3.2 * scale,
        1.1 * scale
      );
      ctx.strokeStyle = 'rgba(120, 130, 140, 0.45)';
      ctx.lineWidth = 0.8 * scale;
      ctx.strokeRect(
        pack.x - 2.2 * scale,
        pack.y - 4.5 * scale,
        4.4 * scale,
        5.5 * scale
      );
    };

    if (pack.y <= chest.y) drawPack();

    // Shoulders / arms
    const armL = {
      sh: g(0.2, -2.8, 9 + duck),
      hand: g(MECH_HAND_REACH_X * 0.55, -3.2, 4.5 + duck),
      y: 0,
    };
    const armR = {
      sh: g(0.2, 2.8, 9 + duck),
      hand: g(
        welding || cargo ? MECH_HAND_REACH_X : MECH_HAND_REACH_X * 0.7,
        3.0,
        welding || cargo ? 5.5 + duck : 4.2 + duck
      ),
      y: 0,
    };
    // Prefer right arm as tool/cargo arm (matches facing-local +X hand reach when E/W)
    if (cargo || welding) {
      const handLocal = this._mechHandLocal(cargo || null);
      // World hand from logic facing for cargo alignment; visual arm still uses octant
      const face = npc.facing >= 0 ? 1 : -1;
      armR.hand = {
        x: npc.x + face * handLocal.x * scale,
        y: npc.y + (handLocal.y + bob - duck * 0.3) * scale,
      };
    }
    armL.y = (armL.sh.y + armL.hand.y) / 2;
    armR.y = (armR.sh.y + armR.hand.y) / 2;
    const arms = [armL, armR].sort((a, b) => a.y - b.y);

    const drawArm = (arm, isToolArm) => {
      ctx.strokeStyle = theme.suit;
      ctx.lineWidth = 2.0 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(arm.sh.x, arm.sh.y);
      ctx.lineTo(arm.hand.x, arm.hand.y);
      ctx.stroke();
      ctx.fillStyle = theme.glove;
      ctx.beginPath();
      ctx.arc(arm.hand.x, arm.hand.y, 1.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      if (isToolArm && welding && !cargo) {
        const torch = this._weldTorchTip(npc, { scale, bob, duck });
        ctx.strokeStyle = theme.tool;
        ctx.lineWidth = 1.35 * scale;
        ctx.beginPath();
        ctx.moveTo(arm.hand.x, arm.hand.y);
        ctx.lineTo(torch.x, torch.y);
        ctx.stroke();
        if (weldingWork) {
          const pulse = 0.5 + 0.5 * Math.sin(npc.phase * 4);
          ctx.fillStyle = `rgba(160, 220, 255, ${pulse})`;
          ctx.beginPath();
          ctx.arc(torch.x, torch.y, 2.2 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(220, 245, 255, ${pulse * 0.55})`;
          ctx.beginPath();
          ctx.arc(torch.x, torch.y, 1.1 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (isToolArm && !cargo && !welding) {
        // Scanner / datapad
        ctx.fillStyle = '#2a3a48';
        ctx.fillRect(
          arm.hand.x - 0.5 * scale,
          arm.hand.y - 2.2 * scale,
          3.2 * scale,
          3.6 * scale
        );
        ctx.fillStyle = 'rgba(100, 220, 160, 0.55)';
        ctx.fillRect(
          arm.hand.x,
          arm.hand.y - 1.6 * scale,
          2.2 * scale,
          1.6 * scale
        );
      }
      ctx.lineCap = 'butt';
    };

    // Far arm first
    drawArm(arms[0], arms[0] === armR);

    // Helmet
    const head = g(0.3, 0, 11.2 + duck);
    ctx.fillStyle = theme.helmet;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.3 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Helmet rim wear
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.35)';
    ctx.lineWidth = 0.9 * scale;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.3 * scale, 0.2, Math.PI * 1.1);
    ctx.stroke();
    // Visor toward forward
    const v0 = g(1.6, -1.5, 11.5 + duck);
    const v1 = g(1.6, 1.5, 11.5 + duck);
    ctx.fillStyle = theme.visor;
    ctx.beginPath();
    ctx.moveTo(v0.x, v0.y - 1.2 * scale);
    ctx.lineTo(v1.x, v1.y - 1.2 * scale);
    ctx.lineTo(v1.x, v1.y + 1.0 * scale);
    ctx.lineTo(v0.x, v0.y + 1.0 * scale);
    ctx.closePath();
    ctx.fill();
    // Bay stripe on helmet brow
    ctx.strokeStyle = theme.stripe;
    ctx.lineWidth = 1.1 * scale;
    ctx.beginPath();
    ctx.moveTo(g(-0.2, -2.2, 12.2 + duck).x, g(-0.2, -2.2, 12.2 + duck).y);
    ctx.lineTo(g(-0.2, 2.2, 12.2 + duck).x, g(-0.2, 2.2, 12.2 + duck).y);
    ctx.stroke();

    if (pack.y > chest.y) drawPack();

    // Near arm
    drawArm(arms[1], arms[1] === armR);

    // Near leg
    drawLeg(legs[1]);

    // Cargo in world space (logic hand) so pick/place stay aligned
    if (cargo) {
      const world = this._mechCargoWorldPos(npc);
      if (world) {
        const head = this._crewVisOctant(npc) * CREW_VIS_OCT;
        this._drawCargoItem(ctx, cargo, world.x, world.y, 0.72 * scale, head);
      }
    }

    // Panic arms up
    if (panicked) {
      ctx.strokeStyle = theme.helmet;
      ctx.lineWidth = 1.4 * scale;
      const hL = g(-0.5, -3.5, 8 + duck);
      const hR = g(-0.5, 3.5, 8 + duck);
      ctx.beginPath();
      ctx.moveTo(hL.x, hL.y);
      ctx.lineTo(hL.x - rx * 2 * scale, hL.y - 4 * scale);
      ctx.moveTo(hR.x, hR.y);
      ctx.lineTo(hR.x + rx * 2 * scale, hR.y - 3.5 * scale);
      ctx.stroke();
    }

    ctx.restore();
  };

  HangarBay.prototype._drawForklift = function (ctx, npc) {
    const bounce = Math.sin(npc.phase * 0.5) * 0.35;
    const forkH = npc.forkH ?? FORK_RAISED;
    const forkDrop = forkH * FORK_DROP_VIS;
    const oct = this._crewVisOctant(npc);
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const rx = -fy;
    const ry = fx;
    // Foreshortening: length reads best E/W; width best N/S (2.5D look-down)
    const alongScale = 0.72 + 0.28 * Math.abs(fx);
    const acrossScale = 0.72 + 0.28 * Math.abs(fy);
    const body = npc.body || '#c87830';
    const bodyDark = '#6a3a18';
    const bodyWear = '#8a5030';
    const metal = '#8a9aa8';
    const metalLit = '#b0c0d0';
    const metalDark = '#4a5868';

    // Ground-plane point. Hangar 2.5D: higher screen Y = nearer camera (draw later).
    const g = (along, across) => ({
      x: npc.x + fx * along * alongScale + rx * across * acrossScale,
      y: npc.y + fy * along * alongScale + ry * across * acrossScale + bounce,
    });

    const drawWheel = (p) => {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1.5, 3.1, 2.2, heading * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1.2, 1.4, 1.0, heading * 0.2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawCounterweight = () => {
      const a0 = g(-11, -5.5);
      const a1 = g(-11, 5.5);
      const a2 = g(-5.5, 5.5);
      const a3 = g(-5.5, -5.5);
      const h = 5;
      // Vertical faces: far (low Y) first, near (high Y) last
      const edges = [
        [a0, a1],
        [a1, a2],
        [a2, a3],
        [a3, a0],
      ].sort((e0, e1) => (e0[0].y + e0[1].y) / 2 - (e1[0].y + e1[1].y) / 2);
      ctx.fillStyle = '#2a3038';
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.lineTo(a2.x, a2.y);
      ctx.lineTo(a3.x, a3.y);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < edges.length; i++) {
        const [p0, p1] = edges[i];
        ctx.fillStyle = i < 2 ? '#3a4450' : '#454e5a';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - h);
        ctx.lineTo(p1.x, p1.y - h);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p0.x, p0.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#505a68';
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y - h);
      ctx.lineTo(a1.x, a1.y - h);
      ctx.lineTo(a2.x, a2.y - h);
      ctx.lineTo(a3.x, a3.y - h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 160, 40, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y - h * 0.45);
      ctx.lineTo(a1.x, a1.y - h * 0.45);
      ctx.stroke();
    };

    const drawChassis = () => {
      const a0 = g(-6, -5);
      const a1 = g(-6, 5);
      const a2 = g(7, 5);
      const a3 = g(7, -5);
      const h = 6;
      const edges = [
        [a0, a1],
        [a1, a2],
        [a2, a3],
        [a3, a0],
      ].sort((e0, e1) => (e0[0].y + e0[1].y) / 2 - (e1[0].y + e1[1].y) / 2);
      for (let i = 0; i < edges.length; i++) {
        const [p0, p1] = edges[i];
        ctx.fillStyle = i < 2 ? bodyWear : bodyDark;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p1.x, p1.y - h);
        ctx.lineTo(p0.x, p0.y - h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y - h);
      ctx.lineTo(a1.x, a1.y - h);
      ctx.lineTo(a2.x, a2.y - h);
      ctx.lineTo(a3.x, a3.y - h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e0a060';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.fillStyle = 'rgba(40, 24, 12, 0.22)';
      const w0 = g(-2, -2.5);
      const w1 = g(3, 1.5);
      ctx.fillRect(w0.x - 2, w0.y - h - 1, 5, 2.2);
      ctx.fillRect(w1.x - 1.5, w1.y - h - 0.5, 4, 1.6);
      ctx.strokeStyle = 'rgba(20, 12, 6, 0.35)';
      ctx.lineWidth = 0.7;
      const s0 = g(1, -4.5);
      const s1 = g(1, 4.5);
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y - h);
      ctx.lineTo(s1.x, s1.y - h);
      ctx.stroke();
    };

    const ropsPosts = [
      g(-3.5, -4),
      g(-3.5, 4),
      g(2.5, 4),
      g(2.5, -4),
    ].sort((a, b) => a.y - b.y);
    const roofH = 12;

    const drawRopsPost = (p) => {
      ctx.strokeStyle = metalDark;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x, p.y - roofH);
      ctx.stroke();
    };

    const drawRopsRoof = () => {
      const posts = [
        g(-3.5, -4),
        g(-3.5, 4),
        g(2.5, 4),
        g(2.5, -4),
      ];
      ctx.strokeStyle = metal;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(posts[0].x, posts[0].y - roofH);
      ctx.lineTo(posts[1].x, posts[1].y - roofH);
      ctx.lineTo(posts[2].x, posts[2].y - roofH);
      ctx.lineTo(posts[3].x, posts[3].y - roofH);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140, 150, 160, 0.35)';
      ctx.lineWidth = 0.6;
      const m0 = g(-0.5, -3.5);
      const m1 = g(-0.5, 3.5);
      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y - roofH + 1);
      ctx.lineTo(m1.x, m1.y - roofH + 1);
      ctx.stroke();
    };

    const drawCab = () => {
      const a0 = g(-3, -3.5);
      const a1 = g(-3, 3.5);
      const a2 = g(2, 3.5);
      const a3 = g(2, -3.5);
      const h0 = 6;
      const h1 = 11;
      const faces = [
        [a0, a1],
        [a1, a2],
        [a2, a3],
        [a3, a0],
      ].sort((e0, e1) => (e0[0].y + e0[1].y) / 2 - (e1[0].y + e1[1].y) / 2);
      for (let i = 0; i < faces.length; i++) {
        const [p0, p1] = faces[i];
        ctx.fillStyle = i < 2 ? '#2a3848' : '#1e2834';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - h0);
        ctx.lineTo(p1.x, p1.y - h0);
        ctx.lineTo(p1.x, p1.y - h1);
        ctx.lineTo(p0.x, p0.y - h1);
        ctx.closePath();
        ctx.fill();
      }
      // Windshield on the forward cab face (toward mast / +along)
      const f0 = g(2, -3.5);
      const f1 = g(2, 3.5);
      ctx.fillStyle = 'rgba(120, 200, 255, 0.32)';
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y - h0 - 1);
      ctx.lineTo(f1.x, f1.y - h0 - 1);
      ctx.lineTo(f1.x, f1.y - h1 + 0.5);
      ctx.lineTo(f0.x, f0.y - h1 + 0.5);
      ctx.closePath();
      ctx.fill();
      const head = g(-0.2, 0);
      ctx.fillStyle = '#c8d0d8';
      ctx.beginPath();
      ctx.arc(head.x, head.y - 9.5, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(80, 160, 200, 0.4)';
      ctx.fillRect(head.x - 1.4, head.y - 10.2, 2.2, 1.4);
    };

    const drawMast = () => {
      const base = g(7.5, 0);
      const mastH = 15;
      ctx.fillStyle = metalDark;
      ctx.fillRect(base.x - 2.2, base.y - mastH, 4.4, mastH - 2);
      ctx.fillStyle = metal;
      ctx.fillRect(base.x - 1.5, base.y - mastH, 1.1, mastH - 2);
      ctx.fillRect(base.x + 0.4, base.y - mastH, 1.1, mastH - 2);
      const carY = base.y - 10 + forkDrop * 0.55;
      ctx.fillStyle = '#5a6878';
      ctx.fillRect(base.x - 2.6, carY - 2, 5.2, 4);
      ctx.strokeStyle = 'rgba(20, 16, 10, 0.4)';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(base.x - 2.6, carY - 2, 5.2, 4);
      const blink = 0.45 + 0.55 * Math.max(0, Math.sin(npc.phase * 1.7));
      ctx.fillStyle = `rgba(255, 170, 40, ${0.35 + blink * 0.5})`;
      ctx.beginPath();
      ctx.arc(base.x, base.y - mastH - 1.2, 1.6, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawForks = () => {
      const tineAlong0 = 8.5;
      const tineAlong1 = FORK_TINE_TIP_X;
      const tineLift = FORK_TINE_Y_BASE + forkDrop * 0.35;
      ctx.strokeStyle = metalLit;
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      for (const across of [-2.2, 2.2]) {
        const p0 = g(tineAlong0, across);
        const p1 = g(tineAlong1, across);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y + tineLift);
        ctx.lineTo(p1.x, p1.y + tineLift);
        ctx.stroke();
      }
      const b0 = g(tineAlong0, -3);
      const b1 = g(tineAlong0, 3);
      ctx.strokeStyle = metal;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y + tineLift - 1);
      ctx.lineTo(b1.x, b1.y + tineLift - 1);
      ctx.stroke();
      ctx.lineCap = 'butt';
    };

    const drawCargo = () => {
      const cargo = npc.cargo || npc._forkLift?.cargo;
      if (!cargo) return;
      const world = this._forkCargoWorldPos(npc);
      if (world) {
        const head = this._crewVisOctant(npc) * CREW_VIS_OCT;
        this._drawCargoItem(ctx, cargo, world.x, world.y, 0.9, head);
      }
    };

    const drawMastForksCargo = () => {
      drawMast();
      drawForks();
      drawCargo();
    };

    // --- Painter pass (far → near). Per-octant occlusion via screen Y. ---
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(npc.x + fx * 1, npc.y + 7 + bounce, 13, 4.2, heading * 0.15, 0, Math.PI * 2);
    ctx.fill();

    const wheels = [
      [-7.5, -4.8],
      [-7.5, 4.8],
      [4.5, -5.2],
      [4.5, 5.2],
    ]
      .map(([al, ac]) => g(al, ac))
      .sort((a, b) => a.y - b.y);
    const farWheels = wheels.slice(0, 2);
    const nearWheels = wheels.slice(2);

    for (const w of farWheels) drawWheel(w);

    drawCounterweight();
    drawChassis();

    for (const p of ropsPosts.slice(0, 2)) drawRopsPost(p);

    const mastDepth = g(7.5, 0).y;
    const cabDepth = g(-0.5, 0).y;
    if (mastDepth <= cabDepth) {
      drawMastForksCargo();
      drawCab();
    } else {
      drawCab();
      drawMastForksCargo();
    }

    drawRopsRoof();
    for (const p of ropsPosts.slice(2)) drawRopsPost(p);

    for (const w of nearWheels) drawWheel(w);
  };

  HangarBay.prototype._drawSparkles = function (ctx, mode = 'overhead') {
    for (const s of this._sparkle) {
      if (mode === 'under') {
        if (!(s.weld && s.layer === 'under') && !(s.dust && s.layer === 'under')) {
          continue;
        }
      } else if (mode === 'over') {
        if (!(s.weld && s.layer === 'over')) continue;
      } else {
        // Overhead: non-weld, and dust not tagged as under-weld smoke
        if (s.weld) continue;
        if (s.dust && s.layer === 'under') continue;
      }

      const a = Math.max(0, s.life / s.max);
      if (s.dust) {
        // Soft hold-dust puffs (load / unload) + weld contact smoke
        const r = s.r * (0.85 + (1 - a) * 0.7);
        ctx.fillStyle = `rgba(120, 105, 80, ${a * 0.28})`;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, r * 1.35, r * 0.75, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(160, 145, 115, ${a * 0.16})`;
        ctx.beginPath();
        ctx.ellipse(s.x + r * 0.2, s.y - r * 0.15, r * 0.7, r * 0.45, -0.3, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (s.weld) {
        const spd = Math.hypot(s.vx || 0, s.vy || 0);
        if (s.core) {
          ctx.fillStyle = `rgba(220, 245, 255, ${a * 0.95})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * a, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(160, 220, 255, ${a * 0.45})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * a * 1.85, 0, Math.PI * 2);
          ctx.fill();
        } else if (spd > 12) {
          const ang = Math.atan2(s.vy || 0, s.vx || 0);
          const len = Math.min(5.5, 1.2 + spd * 0.035) * a;
          const hw = Math.max(0.45, s.r * 0.45) * a;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(ang);
          ctx.fillStyle = s.warm
            ? `rgba(255, 190, 90, ${a * 0.9})`
            : `rgba(180, 230, 255, ${a * 0.92})`;
          ctx.beginPath();
          ctx.ellipse(-len * 0.15, 0, len, hw, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = s.warm
            ? `rgba(255, 180, 80, ${a * 0.85})`
            : `rgba(180, 230, 255, ${a * 0.95})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = `rgba(255, 180, 80, ${a * 0.7})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  HangarBay.prototype._drawWeldUnderGlow = function (ctx) {
    for (const npc of this.npcs) {
      const g = npc._weldGlow;
      const base = g?.intensity || 0;
      const flash = g?.flash || 0;
      if (!g || (base < 0.04 && flash < 0.04)) continue;
      // Halfway between first underglow and the bright punch pass
      const a = Math.min(1.2, base * 0.92 + flash * 0.5);
      const pulse = 0.82 + 0.28 * Math.min(1, flash);
      const x = g.x;
      const y = g.y;
      const seed = g.speckleSeed || 0;
      const t = this.time;

      // Contact wash jitter both ways around the tuned mid (radius + brightness)
      const sizeJ =
        1 +
        Math.sin(t * 31 + seed * 7) * 0.1 +
        Math.sin(t * 67 + seed * 13) * 0.07 +
        Math.sin(t * 103 + seed * 3) * 0.04;
      const brightJ =
        1 +
        Math.sin(t * 39 + seed * 5) * 0.12 +
        Math.sin(t * 81 + seed * 17) * 0.08 +
        Math.sin(t * 127 + seed * 9) * 0.05;
      // Slight axis stretch so the blob breathes, not just scales uniformly
      const stretchX = 1 + Math.sin(t * 47 + seed * 11) * 0.06;
      const stretchY = 1 + Math.cos(t * 53 + seed * 19) * 0.06;

      const rx = (19 + a * 11) * (0.96 + pulse * 0.06) * sizeJ * stretchX;
      const ry = (10.5 + a * 6.5) * (0.96 + pulse * 0.06) * sizeJ * stretchY;
      const ba = pulse * brightJ;
      const wash = ctx.createRadialGradient(x, y, 0, x, y, rx);
      wash.addColorStop(0, `rgba(200, 240, 255, ${Math.min(0.52, a * 0.34 * ba)})`);
      wash.addColorStop(0.38, `rgba(125, 208, 255, ${Math.min(0.3, a * 0.19 * ba)})`);
      wash.addColorStop(0.72, `rgba(90, 180, 240, ${Math.min(0.12, a * 0.06 * ba)})`);
      wash.addColorStop(1, 'rgba(80, 160, 220, 0)');
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0.08 + Math.sin(t * 19 + seed) * 0.05, 0, Math.PI * 2);
      ctx.fill();

      const jx = x + Math.sin(t * 42 + seed * 11) * 2.1 * a;
      const jy = y + Math.cos(t * 37 + seed * 9) * 1.55 * a;
      const crx = (6.75 + a * 4.75) * pulse * sizeJ;
      const cry = (3.85 + a * 2.85) * pulse * sizeJ;
      const core = ctx.createRadialGradient(jx, jy, 0, jx, jy, crx);
      core.addColorStop(0, `rgba(248, 252, 255, ${Math.min(0.8, a * 0.7 * ba)})`);
      core.addColorStop(0.3, `rgba(180, 230, 255, ${Math.min(0.55, a * 0.42 * ba)})`);
      core.addColorStop(0.6, `rgba(140, 210, 255, ${Math.min(0.25, a * 0.16 * ba)})`);
      core.addColorStop(1, 'rgba(100, 180, 240, 0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.ellipse(jx, jy, crx, cry, -0.15, 0, Math.PI * 2);
      ctx.fill();

      if (g.amber || flash > 0.5) {
        const aa = Math.min(0.42, a * 0.32 * ba);
        ctx.fillStyle = `rgba(255, 155, 58, ${aa})`;
        ctx.beginPath();
        ctx.ellipse(
          jx + Math.sin(t * 55) * 1.4,
          jy + 0.8,
          (5.75 + a * 2.75) * sizeJ,
          (2.95 + a * 1.4) * sizeJ,
          0.3,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      const n = 2 + ((seed * 3.5) | 0) % 3;
      for (let i = 0; i < n; i++) {
        const sx =
          jx + Math.sin(t * 68 + i * 2.3 + seed * 17) * (3 + a * 2.5);
        const sy =
          jy + Math.cos(t * 61 + i * 1.7 + seed * 13) * (1.9 + a * 1.7);
        const sa = Math.min(
          0.85,
          a * pulse * (0.4 + 0.5 * Math.abs(Math.sin(t * 100 + i * 3 + flash * 6)))
        );
        ctx.fillStyle = `rgba(235, 248, 255, ${sa})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.65 + a * 0.45 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Each flying weld spark casts its own small deck wash — composite reads as lively slag light
    this._drawWeldSparkUnderglows(ctx);
  };

  HangarBay.prototype._drawWeldSparkUnderglows = function (ctx) {
    for (const s of this._sparkle) {
      if (!s.weld) continue;
      const lifeA = Math.max(0, s.life / (s.max || 0.3));
      if (lifeA < 0.06) continue;
      this._paintSparkDeckGlow(ctx, s.x, s.y, lifeA, s);
    }
    if (!this._weldEmberTrail?.length) return;
    for (const e of this._weldEmberTrail) {
      const lifeA = Math.max(0, e.life / e.max);
      if (lifeA < 0.05) continue;
      this._paintSparkDeckGlow(ctx, e.x, e.y, lifeA * 0.7, e);
    }
  };

  HangarBay.prototype._drawWeldHullWashes = function (ctx) {
    /** @type {Map<number, { padX: number, padY: number, padAngle: number, paints: Array }>} */
    const groups = new Map();
    const enqueue = (padX, padY, padAngle, bay, paint) => {
      if (padX == null || bay == null) return;
      let g = groups.get(bay);
      if (!g) {
        g = { padX, padY, padAngle, paints: [] };
        groups.set(bay, g);
      }
      g.paints.push(paint);
    };

    for (const s of this._sparkle) {
      if (!s.weld || s.padX == null) continue;
      const lifeA = Math.max(0, s.life / (s.max || 0.3));
      if (lifeA < 0.06) continue;
      const proj = this._projectOntoShipHull(
        s.padX,
        s.padY ?? 0,
        s.padAngle ?? FACE_NORTH,
        s.x,
        s.y
      );
      const over = s.layer === 'over';
      // Over sparks always light plating; under sparks only when they fly past the rim
      if (!over && proj.inside) continue;
      if (!over && proj.outside > 1.1) continue;
      const rimFall =
        proj.outside <= 0
          ? 1
          : Math.max(0, 1 - proj.outside / (over ? 1.15 : 0.95));
      if (rimFall < 0.08) continue;
      const strength = (over ? 0.92 : 0.55) * rimFall;
      enqueue(s.padX, s.padY ?? 0, s.padAngle ?? FACE_NORTH, s.bay, {
        x: proj.x,
        y: proj.y,
        lifeA,
        src: s,
        strength,
      });
    }

    for (const e of this._weldEmberTrail || []) {
      if (e.padX == null || e.layer !== 'over') continue;
      const lifeA = Math.max(0, e.life / e.max);
      if (lifeA < 0.05) continue;
      const proj = this._projectOntoShipHull(
        e.padX,
        e.padY ?? 0,
        e.padAngle ?? FACE_NORTH,
        e.x,
        e.y
      );
      const rimFall =
        proj.outside <= 0 ? 1 : Math.max(0, 1 - proj.outside / 1.15);
      if (rimFall < 0.08) continue;
      enqueue(e.padX, e.padY ?? 0, e.padAngle ?? FACE_NORTH, e.bay, {
        x: proj.x,
        y: proj.y,
        lifeA: lifeA * 0.65,
        src: e,
        strength: 0.7 * rimFall,
      });
    }

    // Contact heat on plating after over-layer bursts
    for (const npc of this.npcs) {
      const g = npc._weldGlow;
      if (!g || (g.surfaceKiss || 0) < 0.05 || g.padX == null) continue;
      const a = Math.min(1, (g.intensity || 0) * 0.7 + (g.flash || 0) * 0.4);
      if (a < 0.05) continue;
      enqueue(g.padX, g.padY ?? 0, g.padAngle ?? FACE_NORTH, g.bay, {
        x: g.x,
        y: g.y,
        lifeA: a,
        src: { warm: !!g.amber, core: true, r: 2.2, _glowSeed: g.speckleSeed || 1 },
        strength: 0.75 * g.surfaceKiss,
        contact: true,
      });
    }

    if (!groups.size) return;

    // Hangar ships are 2.5D (base + side walls + raised deck). Paint the same
    // wash on each extrude band so light hits side peeks as well as the top face.
    for (const g of groups.values()) {
      this._paintWeldHullWashLayers(ctx, g);
    }
  };

  HangarBay.prototype._paintSparkDeckGlow = function (ctx, x, y, lifeA, src) {
    const warm = !!src.warm;
    const core = !!src.core;
    const r = src.r || 1.2;
    const t = this.time;
    // Per-spark phase so neighbors don't breathe in lockstep
    const seed = (src._glowSeed ??= Math.random() * 20) + x * 0.17 + y * 0.13;
    const sizeJ =
      1 +
      Math.sin(t * 31 + seed * 7) * 0.1 +
      Math.sin(t * 67 + seed * 13) * 0.07 +
      Math.sin(t * 103 + seed * 3) * 0.04;
    const brightJ =
      1 +
      Math.sin(t * 39 + seed * 5) * 0.12 +
      Math.sin(t * 81 + seed * 17) * 0.08 +
      Math.sin(t * 127 + seed * 9) * 0.05;
    const stretchX = 1 + Math.sin(t * 47 + seed * 11) * 0.06;
    const stretchY = 1 + Math.cos(t * 53 + seed * 19) * 0.06;
    // Modest alphas so many sparks dance without blowing out the main wash
    const peak = core ? 0.38 : warm ? 0.3 : 0.24;
    const a = Math.min(peak, lifeA * peak * (0.55 + 0.45 * lifeA) * brightJ);
    const rx = ((core ? 6.2 : 4.6) + r * 2.1) * sizeJ * stretchX;
    const ry = rx * 0.52 * stretchY;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rx);
    if (warm) {
      grad.addColorStop(0, `rgba(255, 210, 140, ${a})`);
      grad.addColorStop(0.4, `rgba(255, 160, 70, ${a * 0.45})`);
      grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
    } else {
      grad.addColorStop(0, `rgba(230, 248, 255, ${a})`);
      grad.addColorStop(0.4, `rgba(150, 220, 255, ${a * 0.42})`);
      grad.addColorStop(1, 'rgba(100, 180, 240, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0.1 + Math.sin(t * 19 + seed) * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // Tiny hot pin so individual sparks read under the belly
    ctx.fillStyle = warm
      ? `rgba(255, 200, 120, ${a * 0.85})`
      : `rgba(245, 252, 255, ${a * 0.9})`;
    ctx.beginPath();
    ctx.arc(x, y, (core ? 1.3 : 0.85) * lifeA * sizeJ, 0, Math.PI * 2);
    ctx.fill();
  };

  HangarBay.prototype._drawDebris = function (ctx) {
    for (const d of this._debris) {
      const a = d.life / d.max;
      ctx.fillStyle = d.color;
      ctx.globalAlpha = a;
      ctx.fillRect(d.x, d.y, d.r, d.r);
      ctx.globalAlpha = 1;
    }
  };

  HangarBay.prototype._drawHazardWash = function (ctx) {
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
    // Soft cyan kiss on the deck under the muzzle tip (not the whole pad)
    if (w > 0.1) {
      const wx = this._weaponWash?.x ?? sx;
      const wy = this._weaponWash?.y ?? sy;
      const r = 7 + w * 5;
      const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
      grad.addColorStop(0, `rgba(180, 230, 255, ${w * 0.22})`);
      grad.addColorStop(0.45, `rgba(100, 200, 255, ${w * 0.1})`);
      grad.addColorStop(1, 'rgba(80, 160, 220, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}
