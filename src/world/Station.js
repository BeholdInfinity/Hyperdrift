/**
 * Jennings Station — overworld exterior for Home Base.
 * Official entrance (caution paint) on the north circumference (−RADIUS).
 * Short black apron north of the paint; hangar roof pad + cheek flares south /
 * beside the mouth so the entrance reads attached to the disc.
 *
 * Occlusion (ship under): caution tape + hangar roof only — and only on a
 * safe-speed approach (or during hangar→space `exitBurn`). Apron floor stays
 * under. Northbound open-space flight is not treated as an exit.
 */

import { STATION } from '../core/Constants.js';
import { angleDifference } from '../utils/MathUtils.js';

const FACE_SOUTH = Math.PI / 2;
const FACE_NORTH = -Math.PI / 2;

/** Rounded-rect path helper (local space). */
function roundRectPath(ctx, x, y, w, h, rad) {
  const r = Math.min(rad, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Station {
  constructor() {
    this.x = STATION.WORLD_X;
    this.y = STATION.WORLD_Y;
    this.vx = STATION.WORLD_VX ?? 0;
    this.vy = STATION.WORLD_VY ?? 0;
    /** @type {'yellow'|'green'|'red'|'fullBlinkRed'|'exitReverseRed'} */
    this.approachLightMode = 'yellow';
    /**
     * Per-ship entrance occlusion hysteresis (ship id → latch).
     * @type {Map<string|number, boolean>}
     */
    this._occludeLatchByShip = new Map();
    /** Hangar pad occupancy only (no approach reservations). */
    /** @type {('green'|'red'|'departing'|'elevator'|'reserved')[]} */
    this._padOccupancy = ['green', 'green', 'green'];
    /** Display signals (occupancy + runway reservations as pulse-green). */
    /** @type {('green'|'red'|'departing'|'elevator'|'reserved')[]} */
    this.baySignals = ['green', 'green', 'green'];
    /**
     * Runway approach reservations (ship id → claim).
     * @type {Map<string|number, { lane: number, ship: object, shipDef?: object, isPlayer?: boolean, visitorId?: string }>}
     */
    this.laneReservations = new Map();
  }

  /** Move overworld anchor (Jennings orbit). */
  setWorldAnchor(x, y, vx = 0, vy = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  /** Speed relative to the station's orbital frame. */
  relativeSpeed(vx, vy) {
    return Math.hypot(vx - (this.vx || 0), vy - (this.vy || 0));
  }

  _shipVelocity(ship) {
    return {
      vx: ship?.velocity?.x ?? ship?.vx ?? 0,
      vy: ship?.velocity?.y ?? ship?.vy ?? 0,
    };
  }

  /**
   * Sync pad lights from hangar (or mirror). Call each frame while in space.
   * Rebuilds display signals with any current runway reservations.
   * @param {('green'|'red'|'departing'|'elevator'|'reserved')[]} signals
   */
  setBaySignals(signals) {
    if (!signals?.length) return;
    this._padOccupancy = [0, 1, 2].map((i) => signals[i] || 'red');
    this._rebuildDisplaySignals();
  }

  _rebuildDisplaySignals() {
    const reserved = new Set();
    for (const claim of this.laneReservations.values()) {
      reserved.add(claim.lane);
    }
    this.baySignals = [0, 1, 2].map((i) => {
      const occ = this._padOccupancy[i] || 'red';
      if (occ === 'departing' || occ === 'elevator') return occ;
      // Reserved runway approach → pulse green (hangar arrive plays in parallel)
      if (reserved.has(i)) return 'reserved';
      return occ;
    });
  }

  /**
   * Approaching ship on the runway, at safe speed, in a pad lane → reserves that lane.
   * @param {{ position?: {x:number,y:number}, angle?: number, velocity?: {x?:number,y?:number}, id?: string|number }} ship
   * @param {number} [speed]
   * @returns {number|null} lane 0–2 or null
   */
  computeLaneReservation(ship) {
    if (!ship?.position || !Number.isFinite(ship.angle)) return null;
    const { vx, vy } = this._shipVelocity(ship);
    if (!this.isSafeDockSpeed(vx, vy)) return null;
    if (!this.inApproachLights(ship.position.x, ship.position.y)) return null;
    if (!this.isIngressHeading(ship.angle)) return null;
    // Outbound traffic does not claim a pad
    if (vy - (this.vy || 0) < -4) return null;
    const hw = STATION.MOUTH_HALF_W + STATION.INGRESS_MOUTH_SLACK;
    if (Math.abs(ship.position.x - this.x) > hw) return null;
    return this.laneIndexFromWorldX(ship.position.x);
  }

  /**
   * Replace runway reservations from the given ships (player + ambient).
   * @param {{ ship: object, speed?: number, shipDef?: object, isPlayer?: boolean, visitorId?: string }[]} entries
   */
  refreshLaneReservations(entries) {
    const next = new Map();
    for (const entry of entries || []) {
      const ship = entry?.ship;
      if (!ship) continue;
      const lane = this.computeLaneReservation(ship);
      if (lane == null) continue;
      const id = this._shipLatchId(ship);
      next.set(id, {
        lane,
        ship,
        shipDef: entry.shipDef || ship.shipDef || null,
        isPlayer: !!entry.isPlayer,
        visitorId: entry.visitorId || null,
      });
    }
    this.laneReservations = next;
    this._rebuildDisplaySignals();
  }

  /** @returns {{ shipId: string|number, lane: number, ship: object, shipDef?: object, isPlayer?: boolean, visitorId?: string }[]} */
  getLaneReservationClaims() {
    const out = [];
    for (const [shipId, claim] of this.laneReservations) {
      out.push({ shipId, ...claim });
    }
    return out;
  }

  /** Mouth lane 0/1/2 from world X (west→east = B1/B2/B3). */
  laneIndexFromWorldX(worldX) {
    const hw = STATION.MOUTH_HALF_W;
    const localX = worldX - this.x;
    const u = (localX + hw) / (hw * 2);
    if (u < 1 / 3) return 0;
    if (u < 2 / 3) return 1;
    return 2;
  }

  /** World X center of a bay lane (local thirds of the mouth). */
  laneCenterWorldX(laneIndex) {
    const i = ((laneIndex | 0) + 3) % 3;
    const hw = STATION.MOUTH_HALF_W;
    const third = (hw * 2) / 3;
    return this.x - hw + third * (i + 0.5);
  }

  /** Display signal (includes runway reservation as red). */
  padSignal(laneIndex) {
    return this.baySignals[((laneIndex | 0) + 3) % 3] || 'red';
  }

  /**
   * Pad free for landing: hangar open (or our in-progress space approach) and
   * not reserved by another ship.
   * @param {number} laneIndex
   * @param {object|null} [ship] requester — ignores that ship's own reservation
   */
  padAvailable(laneIndex, ship = null) {
    const i = ((laneIndex | 0) + 3) % 3;
    const occ = this._padOccupancy?.[i] ?? this.baySignals[i] ?? 'red';
    if (occ === 'departing' || occ === 'elevator') return false;

    const selfId = ship != null ? this._shipLatchId(ship) : null;
    let reservedByOther = false;
    let reservedBySelf = false;
    for (const [id, claim] of this.laneReservations) {
      if (claim.lane !== i) continue;
      if (id === selfId) reservedBySelf = true;
      else reservedByOther = true;
    }
    if (reservedByOther) return false;
    if (occ === 'green') return true;
    // Hangar already running arrive for our reservation (incoming → red occupancy)
    if (reservedBySelf && (occ === 'red' || occ === 'reserved')) return true;
    return false;
  }

  anyBayDeparting() {
    return this._padOccupancy.some((s) => s === 'departing')
      || this.baySignals.some((s) => s === 'departing');
  }

  /**
   * No open pad for the requester (or for a new anonymous arriver if ship omitted).
   * @param {object|null} [ship]
   */
  allBaysBlocked(ship = null) {
    return [0, 1, 2].every((i) => !this.padAvailable(i, ship));
  }

  /** True when hangar pads themselves have no green (ignores runway reservations). */
  allPadsOccupied() {
    return (this._padOccupancy || this.baySignals).every((s) => s !== 'green');
  }

  /** Local Y of the official entrance / caution paint (north circle rim). */
  stripeLocalY() {
    return -STATION.RADIUS;
  }

  /** Local Y of the outer (north) edge of the black apron. */
  apronNorthLocalY() {
    return this.stripeLocalY() - STATION.MOUTH_APRON;
  }

  /** Local Y of the south edge of the hangar roof pad. */
  hangarRoofSouthLocalY() {
    return this.stripeLocalY() + STATION.MOUTH_STRIPE_H + STATION.HANGAR_ROOF_DEPTH;
  }

  /** World Y of the dock-check center (official entrance on the north rim). */
  dockFaceY() {
    return this.y - STATION.DOCK_FACE_Y;
  }

  /** World Y of the yellow-black caution sill (entry lip on the circle). */
  stripeWorldY() {
    return this.y + this.stripeLocalY();
  }

  /** World Y of the furthest (outer) approach-light pair — end of the floating runway. */
  furthestApproachLightY() {
    return this.dockFaceY() - STATION.DOCK_RADIUS;
  }

  /**
   * Exit burn complete when the north-most hull tip reaches the outer runway lights.
   */
  isExitBurnFinished(ship) {
    if (!ship?.position) return true;
    const lightY = this.furthestApproachLightY();
    const pad = STATION.EXIT_BURN_LIGHT_PAD;
    const { nose, aft } = this.hullTipsWorld(ship);
    const northTipY = Math.min(nose.y, aft.y);
    return northTipY <= lightY + pad;
  }

  /**
   * Hangar→space handoff: under the hangar roof just south of the paint so the
   * ship starts occluded and crosses the official entrance outbound.
   * @param {number} [laneIndex] bay lane 0–2 (defaults to center)
   */
  getExitSpawn(laneIndex = 1) {
    return {
      x: this.laneCenterWorldX(laneIndex),
      y: this.stripeWorldY() + STATION.EXIT_NEST,
      angle: -Math.PI / 2,
    };
  }

  /** Stable id for per-ship occlusion latch. */
  _shipLatchId(ship) {
    if (!ship) return 'unknown';
    if (ship.id != null) return ship.id;
    if (ship === this._latchPlayerRef) return 'player';
    return 'anon';
  }

  /**
   * Entrance occlusion volume: black apron + caution tape + hangar roof.
   * (Ship center alone used to miss this — nose reaches the tape while the
   * body is still north of a roof-only band.)
   */
  inEntranceOcclusionZone(shipX, shipY) {
    const hw = STATION.HANGAR_ROOF_HALF_W + STATION.INGRESS_CORRIDOR_PAD_X;
    if (Math.abs(shipX - this.x) > hw) return false;
    const north =
      this.y + this.apronNorthLocalY() - STATION.LEADING_EDGE_FALLBACK;
    const south = this.y + this.hangarRoofSouthLocalY() + STATION.SCALE * 4;
    return shipY >= north && shipY <= south;
  }

  /**
   * Nose and aft tips in world space.
   * @returns {{ nose: {x:number,y:number}, aft: {x:number,y:number} }}
   */
  hullTipsWorld(ship) {
    const extents = ship.shipDef?.hullExtents?.();
    const fwd = extents?.forward ?? STATION.LEADING_EDGE_FALLBACK;
    const aft = extents?.aft ?? STATION.AFT_EDGE_FALLBACK;
    const c = Math.cos(ship.angle);
    const s = Math.sin(ship.angle);
    return {
      nose: {
        x: ship.position.x + fwd * c,
        y: ship.position.y + fwd * s,
      },
      aft: {
        x: ship.position.x - aft * c,
        y: ship.position.y - aft * s,
      },
    };
  }

  /**
   * Hull tip closest to the station center — used for entrance occlusion on
   * both ingress and egress (exit trailing edge / enter leading edge).
   */
  stationClosestEdgeWorld(ship) {
    const { nose, aft } = this.hullTipsWorld(ship);
    const dNose = Math.hypot(nose.x - this.x, nose.y - this.y);
    const dAft = Math.hypot(aft.x - this.x, aft.y - this.y);
    return dNose <= dAft ? nose : aft;
  }

  /**
   * True if the ship overlaps entrance occluders. Always keys off the
   * station-closest tip (plus center) — not travel direction.
   */
  shipOverlapsEntranceOccluders(ship) {
    if (!ship?.position) return false;
    if (this.inEntranceOcclusionZone(ship.position.x, ship.position.y)) {
      return true;
    }
    const closest = this.stationClosestEdgeWorld(ship);
    if (this.inEntranceOcclusionZone(closest.x, closest.y)) return true;
    const { nose, aft } = this.hullTipsWorld(ship);
    return (
      this.inEntranceOcclusionZone(nose.x, nose.y) ||
      this.inEntranceOcclusionZone(aft.x, aft.y)
    );
  }

  /** @deprecated use inEntranceOcclusionZone / shipOverlapsEntranceOccluders */
  inBayMouthTunnel(shipX, shipY) {
    return this.inEntranceOcclusionZone(shipX, shipY);
  }

  /**
   * Hangar→space egress — keep occlusion regardless of speed.
   * Must key off `exitBurn`, not merely northbound velocity: flying north
   * across the disc from open south used to trip this and bury the hull
   * under the roof at any speed.
   */
  isExitingEntrance(ship) {
    return !!(ship && ship.exitBurn);
  }

  /**
   * Whether tape + hangar roof should draw above the ship.
   * Overlap uses station-closest hull edge — heading does not matter while
   * under the structure (rotating under the tape must not pop on top).
   * Exit burn: any speed until clear. Otherwise: safe-speed hysteresis only.
   */
  shouldOccludeShip(ship) {
    const id = this._shipLatchId(ship);
    if (!ship?.position) {
      this._occludeLatchByShip.delete(id);
      return false;
    }
    if (!this.shipOverlapsEntranceOccluders(ship)) {
      this._occludeLatchByShip.delete(id);
      return false;
    }

    // Hangar→space: stay under roof/tape until the station-closest tip clears
    if (this.isExitingEntrance(ship)) {
      this._occludeLatchByShip.delete(id);
      return true;
    }

    const { vx, vy } = this._shipVelocity(ship);
    const speed = this.relativeSpeed(vx, vy);
    // Under the entrance: geometry wins over heading. Only drop if too fast.
    const enter = STATION.DOCK_MAX_SPEED;
    const leave = enter + STATION.OCCLUDE_SPEED_SLACK;
    const latched = !!this._occludeLatchByShip.get(id);
    if (speed >= leave) {
      this._occludeLatchByShip.delete(id);
      return false;
    }
    if (speed < enter || latched) {
      this._occludeLatchByShip.set(id, true);
      return true;
    }
    return false;
  }

  /** Soft approach ring for dock prompt. */
  inApproach(shipX, shipY) {
    const dx = shipX - this.x;
    const dy = shipY - this.dockFaceY();
    return Math.hypot(dx, dy) < STATION.APPROACH_RADIUS;
  }

  /** Tight zone + slow enough to request landing (Enter/Click ready). */
  canRequestDock(shipX, shipY, vx, vy) {
    const dx = shipX - this.x;
    const dy = shipY - this.dockFaceY();
    return Math.hypot(dx, dy) < STATION.DOCK_RADIUS && this.isSafeDockSpeed(vx, vy);
  }

  /**
   * Corridor between furthest approach lights and just inside the caution sill.
   * Furthest lights align with DOCK_RADIUS north of the dock face / paint.
   */
  inApproachLights(shipX, shipY) {
    const furthestY = this.dockFaceY() - STATION.DOCK_RADIUS;
    const closestY =
      this.stripeWorldY() + STATION.INGRESS_EDGE_OVERHANG + STATION.INGRESS_CORRIDOR_PAD_Y;
    const hw = STATION.APPROACH_LIGHT_HALF_W + STATION.INGRESS_CORRIDOR_PAD_X;
    return (
      Math.abs(shipX - this.x) <= hw &&
      shipY >= furthestY &&
      shipY <= closestY
    );
  }

  isSafeDockSpeed(vx, vy) {
    return this.relativeSpeed(vx, vy) < STATION.DOCK_MAX_SPEED;
  }

  /** Nose-in: facing into the bay (south) within slack. */
  isNoseInHeading(angle) {
    return Math.abs(angleDifference(angle, FACE_SOUTH)) <= STATION.INGRESS_ANGLE_SLACK;
  }

  /** Reverse: nose-out (north) within slack — aft enters the bay first. */
  isReverseHeading(angle) {
    return Math.abs(angleDifference(angle, FACE_NORTH)) <= STATION.INGRESS_ANGLE_SLACK;
  }

  /** Nose-in or reverse docking attitude. */
  isIngressHeading(angle) {
    return this.isNoseInHeading(angle) || this.isReverseHeading(angle);
  }

  /**
   * Safe enter approach from the correct angle: aligned (nose-in or reverse),
   * slow enough, in the light corridor / mouth.
   */
  isSafeIngressApproach(ship) {
    if (!ship?.position) return false;
    if (!this.isIngressHeading(ship.angle)) return false;
    const { vx, vy } = this._shipVelocity(ship);
    if (!this.isSafeDockSpeed(vx, vy)) return false;
    return this.inApproachLights(ship.position.x, ship.position.y);
  }

  /**
   * World position of the inbound hull edge (the tip entering the bay).
   * Nose-in → forward tip; reverse → aft tip.
   * @param {{ position: {x:number,y:number}, angle: number, shipDef?: object }} ship
   */
  ingressEdgeWorld(ship) {
    const extents = ship.shipDef?.hullExtents?.();
    const c = Math.cos(ship.angle);
    const s = Math.sin(ship.angle);
    if (this.isReverseHeading(ship.angle)) {
      const tip = extents?.aft ?? STATION.AFT_EDGE_FALLBACK;
      return {
        x: ship.position.x - tip * c,
        y: ship.position.y - tip * s,
      };
    }
    const tip = extents?.forward ?? STATION.LEADING_EDGE_FALLBACK;
    return {
      x: ship.position.x + tip * c,
      y: ship.position.y + tip * s,
    };
  }

  /** @deprecated use ingressEdgeWorld */
  leadingEdgeWorld(ship) {
    return this.ingressEdgeWorld(ship);
  }

  /**
   * Auto-trigger landing: safe speed, nose-in or reverse heading, in a **green**
   * pad lane, after the inbound hull edge has crossed past the caution paint.
   */
  shouldAutoIngress(ship) {
    if (!ship?.position) return false;
    const { vx, vy } = this._shipVelocity(ship);
    if (!this.isSafeDockSpeed(vx, vy)) return false;
    if (!this.isIngressHeading(ship.angle)) return false;
    if (this.allBaysBlocked(ship)) return false;

    const edge = this.ingressEdgeWorld(ship);
    const hw = STATION.MOUTH_HALF_W + STATION.INGRESS_MOUTH_SLACK;
    if (Math.abs(edge.x - this.x) > hw) return false;

    const lane = this.laneIndexFromWorldX(edge.x);
    if (!this.padAvailable(lane, ship)) return false;

    const rvy = vy - (this.vy || 0);
    if (rvy < 6) return false;

    const stripeY = this.stripeWorldY();
    const triggerY = stripeY + STATION.INGRESS_EDGE_OVERHANG;
    return (
      edge.y >= triggerY - 1 && edge.y <= triggerY + STATION.INGRESS_TRIGGER_WINDOW
    );
  }

  /**
   * Update approach-light color mode from bay status + controlled ship.
   * @returns {'yellow'|'green'|'red'|'fullBlinkRed'|'exitReverseRed'}
   */
  updateApproachLights(ship) {
    if (this.anyBayDeparting()) {
      this.approachLightMode = 'exitReverseRed';
      return this.approachLightMode;
    }
    // Full blink from hangar occupancy only — runway reservations use bay lights
    if (this.allPadsOccupied()) {
      this.approachLightMode = 'fullBlinkRed';
      return this.approachLightMode;
    }
    if (!ship?.position || !this.inApproachLights(ship.position.x, ship.position.y)) {
      this.approachLightMode = 'yellow';
      return this.approachLightMode;
    }
    const { vx, vy } = this._shipVelocity(ship);
    this.approachLightMode = this.isSafeDockSpeed(vx, vy) ? 'green' : 'red';
    return this.approachLightMode;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ time?: number, ship?: object, speed?: number, layer?: 'all'|'under'|'over'|'bayBeacons', baySignals?: string[] }} [opts]
   */
  render(ctx, opts = {}) {
    const { x, y } = this;
    const time = opts.time ?? performance.now() / 1000;
    const layer = opts.layer ?? 'all';
    if (opts.baySignals) this.setBaySignals(opts.baySignals);
    if (opts.ship) this._latchPlayerRef = opts.ship;
    if (opts.ship && layer !== 'over') {
      this.updateApproachLights(opts.ship);
    }

    ctx.save();
    ctx.translate(x, y);

    if (layer === 'all' || layer === 'under') {
      const glowR = STATION.RADIUS * 1.15;
      const glow = ctx.createRadialGradient(0, 0, STATION.RADIUS * 0.25, 0, 0, glowR);
      glow.addColorStop(0, 'rgba(40, 70, 95, 0.35)');
      glow.addColorStop(0.55, 'rgba(20, 35, 50, 0.2)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, STATION.RADIUS * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (layer === 'all') {
      this._drawHull(ctx);
      this._drawMouthCheeks(ctx);
      this._drawHangarRoof(ctx);
      this._drawArms(ctx);
      this._drawBayMouthFloor(ctx);
      this._drawBayMouthFrame(ctx);
      this._drawApproachLights(ctx, time);
      this._drawHullBeacons(ctx, time);
      this._drawLabel(ctx);
    } else if (layer === 'under') {
      // Full station minus roof/tape — ship rides on apron under those occluders
      this._drawHull(ctx);
      this._drawMouthCheeks(ctx);
      this._drawArms(ctx);
      this._drawBayMouthFloor(ctx);
      this._drawApproachLights(ctx, time);
      this._drawHullBeacons(ctx, time);
      this._drawLabel(ctx);
    } else if (layer === 'over') {
      // Occluders only: hangar roof + caution tape / jambs
      this._drawHangarRoof(ctx);
      this._drawBayMouthFrame(ctx);
    } else if (layer === 'bayBeacons') {
      // Overhead lane beacons — always drawn after ships so hulls pass under
      this._drawFloatingBaySignalRows(ctx, time);
    }

    ctx.restore();
  }

  _drawHull(ctx) {
    const r = STATION.RADIUS;
    const cw = STATION.CORE_HALF_W;
    const ch = STATION.CORE_HALF_H;
    const stroke = Math.max(2, STATION.SCALE);

    ctx.fillStyle = '#1a2430';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#243444';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(90, 120, 145, 0.45)';
    ctx.lineWidth = stroke;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35);
      ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
      ctx.stroke();
    }

    ctx.fillStyle = '#121a22';
    ctx.fillRect(-cw, -ch, cw * 2, ch * 2);
    ctx.strokeStyle = '#5a7a92';
    ctx.lineWidth = stroke;
    ctx.strokeRect(-cw, -ch, cw * 2, ch * 2);

    ctx.strokeStyle = 'rgba(100, 180, 255, 0.25)';
    ctx.lineWidth = stroke + 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    const rivetR = Math.max(2, 2.2 * (STATION.SCALE / 2));
    ctx.fillStyle = 'rgba(150, 170, 185, 0.35)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, rivetR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Curve the disc out at the NE/NW mouth corners so the entrance jambs
   * read as attached (fills the left/right gaps at the north pole).
   */
  _drawMouthCheeks(ctx) {
    const r = STATION.RADIUS;
    const hw = STATION.MOUTH_HALF_W;
    const pad = STATION.MOUTH_FRAME_PAD;
    const outer = hw + pad + STATION.MOUTH_CHEEK_OUT * 0.35;
    const stripeY = this.stripeLocalY();
    const apronN = this.apronNorthLocalY();
    const cheekS = STATION.MOUTH_CHEEK_SOUTH;
    const yJoin = Math.min(stripeY + cheekS, -1);
    const xJoinMax = Math.sqrt(Math.max(0, r * r - yJoin * yJoin));

    for (const side of [-1, 1]) {
      const xJoin = side * Math.max(xJoinMax, hw * 0.55);
      const xOuter = side * outer;
      const xJamb = side * (hw + pad);

      ctx.beginPath();
      ctx.moveTo(xJoin, yJoin);
      // Sweep out from the disc to the outer entrance corner
      ctx.bezierCurveTo(
        side * (Math.abs(xJoin) * 0.55 + Math.abs(xOuter) * 0.45),
        yJoin - cheekS * 0.15,
        xOuter,
        stripeY - STATION.MOUTH_APRON * 0.45,
        xOuter,
        apronN + STATION.SCALE * 2
      );
      ctx.lineTo(xJamb, apronN);
      ctx.lineTo(xJamb, stripeY + cheekS * 0.2);
      ctx.quadraticCurveTo(side * hw * 0.85, yJoin * 0.55 + stripeY * 0.45, xJoin, yJoin);
      ctx.closePath();

      ctx.fillStyle = '#1a2430';
      ctx.fill();
      ctx.fillStyle = '#243444';
      ctx.beginPath();
      ctx.moveTo(xJoin * 0.92, yJoin * 0.92);
      ctx.bezierCurveTo(
        side * (Math.abs(xJoin) * 0.6 + Math.abs(xOuter) * 0.35),
        yJoin - cheekS * 0.1,
        xOuter * 0.92,
        stripeY - STATION.MOUTH_APRON * 0.35,
        xJamb * 0.96,
        apronN + STATION.SCALE * 4
      );
      ctx.lineTo(xJamb * 0.9, stripeY + cheekS * 0.15);
      ctx.quadraticCurveTo(side * hw * 0.7, yJoin * 0.6, xJoin * 0.92, yJoin * 0.92);
      ctx.closePath();
      ctx.fill();

      // Seam highlight where cheek meets jamb
      ctx.strokeStyle = 'rgba(90, 120, 145, 0.4)';
      ctx.lineWidth = Math.max(1.5, STATION.SCALE * 0.6);
      ctx.beginPath();
      ctx.moveTo(xJamb, apronN);
      ctx.lineTo(xJamb, stripeY + cheekS * 0.15);
      ctx.stroke();
    }
  }

  /** Unique rounded hangar-roof pad just south of the caution paint. */
  _drawHangarRoof(ctx) {
    const stripeY = this.stripeLocalY();
    const y0 = stripeY + STATION.MOUTH_STRIPE_H;
    const h = STATION.HANGAR_ROOF_DEPTH;
    const hw = STATION.HANGAR_ROOF_HALF_W;
    const cr = STATION.HANGAR_ROOF_CORNER;
    const stroke = Math.max(2, STATION.SCALE);

    // Outer shell
    roundRectPath(ctx, -hw, y0, hw * 2, h, cr);
    ctx.fillStyle = '#1e2a38';
    ctx.fill();
    ctx.strokeStyle = '#5a7a92';
    ctx.lineWidth = stroke;
    ctx.stroke();

    // Inner deck plate
    const inset = STATION.SCALE * 3;
    roundRectPath(
      ctx,
      -hw + inset,
      y0 + inset,
      hw * 2 - inset * 2,
      h - inset * 2,
      Math.max(4, cr - inset)
    );
    ctx.fillStyle = '#2a3a4c';
    ctx.fill();

    // Panel seams
    ctx.strokeStyle = 'rgba(100, 140, 170, 0.35)';
    ctx.lineWidth = Math.max(1, STATION.SCALE * 0.5);
    const midY = y0 + h * 0.5;
    ctx.beginPath();
    ctx.moveTo(-hw + cr, midY);
    ctx.lineTo(hw - cr, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y0 + inset);
    ctx.lineTo(0, y0 + h - inset);
    ctx.stroke();

    // Roof edge lights (dim)
    ctx.fillStyle = 'rgba(100, 180, 255, 0.35)';
    const litR = Math.max(2, STATION.SCALE * 1.1);
    for (const sx of [-hw * 0.7, 0, hw * 0.7]) {
      ctx.beginPath();
      ctx.arc(sx, y0 + inset * 1.2, litR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawArms(ctx) {
    const root = STATION.ARM_ROOT;
    const beamH = STATION.ARM_BEAM_HALF_H;
    const tipW = STATION.ARM_TIP_W;
    const tipH = STATION.ARM_TIP_H;
    const arms = [
      { a: 0.35, len: STATION.ARM_LEN },
      { a: Math.PI - 0.35, len: STATION.ARM_LEN },
      { a: -0.35, len: STATION.ARM_LEN },
      { a: -(Math.PI - 0.35), len: STATION.ARM_LEN },
      { a: Math.PI * 0.5, len: STATION.ARM_LEN_S },
    ];
    for (const arm of arms) {
      const c = Math.cos(arm.a);
      const s = Math.sin(arm.a);
      ctx.fillStyle = '#2a3848';
      ctx.save();
      ctx.translate(c * root, s * root);
      ctx.rotate(arm.a);
      ctx.fillRect(0, -beamH, arm.len, beamH * 2);
      ctx.fillStyle = '#3a4a58';
      ctx.fillRect(arm.len - tipW * 0.65, -tipH / 2, tipW, tipH);
      ctx.fillStyle = 'rgba(255, 170, 40, 0.55)';
      ctx.fillRect(arm.len + STATION.SCALE, -STATION.SCALE * 2, STATION.SCALE * 3, STATION.SCALE * 4);
      ctx.restore();
    }
  }

  /** Black apron north of the paint only — always under the ship. */
  _drawBayMouthFloor(ctx) {
    const hw = STATION.MOUTH_HALF_W;
    const apronN = this.apronNorthLocalY();
    const apronH = STATION.MOUTH_APRON;
    const stripeY = this.stripeLocalY();

    ctx.fillStyle = '#05080c';
    ctx.fillRect(-hw, apronN, hw * 2, apronH);

    const g = ctx.createLinearGradient(0, apronN, 0, stripeY);
    g.addColorStop(0, 'rgba(100, 180, 255, 0.12)');
    g.addColorStop(1, 'rgba(100, 180, 255, 0)');
    ctx.fillStyle = g;
    const inset = STATION.SCALE;
    ctx.fillRect(-hw + inset, apronN + inset, hw * 2 - inset * 2, apronH - inset * 2);

    // Subtle warning paint: two N–S lines dividing apron into even thirds (bay lanes)
    const third = (hw * 2) / 3;
    ctx.strokeStyle = 'rgba(201, 160, 32, 0.28)';
    ctx.lineWidth = Math.max(1.2, STATION.SCALE * 0.45);
    ctx.setLineDash([STATION.SCALE * 3.5, STATION.SCALE * 2.2]);
    for (const k of [1, 2]) {
      const lx = -hw + third * k;
      ctx.beginPath();
      ctx.moveTo(lx, apronN + inset);
      ctx.lineTo(lx, stripeY - inset * 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Frame jambs + caution paint — occluder when over the ship. */
  _drawBayMouthFrame(ctx) {
    const hw = STATION.MOUTH_HALF_W;
    const pad = STATION.MOUTH_FRAME_PAD;
    const apronN = this.apronNorthLocalY();
    const apronH = STATION.MOUTH_APRON;
    const stripeY = this.stripeLocalY();
    const stripeH = STATION.MOUTH_STRIPE_H;
    const sillH = STATION.MOUTH_SILL_BAR_H;

    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(-hw - pad, apronN - pad * 0.3, pad, apronH + pad * 0.3 + stripeH);
    ctx.fillRect(hw, apronN - pad * 0.3, pad, apronH + pad * 0.3 + stripeH);

    // Thin sill under the tape into the roof
    ctx.fillRect(-hw - pad, stripeY + stripeH * 0.5, hw * 2 + pad * 2, sillH);

    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#c9a020' : '#1a1a1a';
      ctx.fillRect(-hw + i * ((hw * 2) / 8), stripeY, (hw * 2) / 8, stripeH);
    }

    this._drawPadStatusLights(ctx, stripeY, stripeH);
  }

  /**
   * Three pad availability lights on the caution paint:
   * left-half center, mouth center, right-half center (B1/B2/B3).
   */
  _drawPadStatusLights(ctx, stripeY, stripeH) {
    const cy = stripeY + stripeH * 0.5;
    this._drawBaySignalRow(ctx, cy, performance.now() / 1000, { floating: false });
  }

  /**
   * Floating bay-signal rows along the runway (same logic as caution-paint lights).
   * Outer row shares Y with the furthest approach-light pair; mid is halfway to the paint.
   */
  _drawFloatingBaySignalRows(ctx, time) {
    const stripeY = this.stripeLocalY();
    const stripeH = STATION.MOUTH_STRIPE_H;
    const paintY = stripeY + stripeH * 0.5;
    const outerY = this.dockFaceY() - this.y - STATION.DOCK_RADIUS;
    const midY = (paintY + outerY) * 0.5;
    this._drawBaySignalRow(ctx, midY, time, { floating: true });
    this._drawBaySignalRow(ctx, outerY, time, { floating: true });
  }

  /**
   * One row of three bay signals, lane-centered (B1/B2/B3).
   * @param {{ floating?: boolean }} [opts]
   */
  _drawBaySignalRow(ctx, localY, time, opts = {}) {
    const floating = !!opts.floating;
    const hw = STATION.MOUTH_HALF_W;
    const third = (hw * 2) / 3;
    const r = STATION.PAD_STATUS_LIGHT_R;

    for (let i = 0; i < 3; i++) {
      const lx = -hw + third * (i + 0.5);
      this._drawBaySignalLight(ctx, lx, localY, this.baySignals[i] || 'red', i, time, {
        r,
        floating,
      });
    }
  }

  /**
   * Single bay status light: green / pulse-green reserved / red / spin-red / spin-yellow.
   * Spin wedges stay inside `r`; soft glow is tight and follows the lit sector.
   */
  _drawBaySignalLight(ctx, lx, ly, sig, i, time, opts = {}) {
    const r = opts.r ?? STATION.PAD_STATUS_LIGHT_R;
    const floating = !!opts.floating;
    // Glow reach ~same visual softness as before, scaled to the smaller core
    const glowMul = floating ? 1.85 : 1.7;

    if (sig === 'departing' || sig === 'elevator') {
      const yellow = sig === 'elevator';
      const spin = time * 7 + i * 1.7;
      const wedge = Math.PI * 0.45;
      const hotRgb = yellow ? '255, 230, 90' : '255, 90, 60';
      const coolRgb = yellow ? '120, 90, 20' : '120, 30, 20';
      const core = yellow ? 'rgba(255, 250, 210, 0.95)' : 'rgba(255, 200, 180, 0.9)';
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(spin);

      // Directional glow centered on the hot wedge (not a full halo)
      const midA = wedge * 0.5;
      const glowR = r * glowMul;
      const gx = Math.cos(midA) * r * 0.4;
      const gy = Math.sin(midA) * r * 0.4;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, glowR, midA - wedge * 0.75, midA + wedge * 0.75);
      ctx.closePath();
      ctx.clip();
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, glowR);
      g.addColorStop(0, `rgba(${hotRgb},0.55)`);
      g.addColorStop(0.5, `rgba(${hotRgb},0.18)`);
      g.addColorStop(1, `rgba(${hotRgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Beacon body — wedges fill the disc (spin stays inside r)
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        ctx.fillStyle =
          k === 0 ? `rgba(${hotRgb},0.95)` : `rgba(${coolRgb},0.55)`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, a, a + wedge);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Reserved lane: pulse green while hangar approach animation runs
    if (sig === 'reserved') {
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 5.2 + i * 0.9));
      const lit = { r: 70, g: 220, b: 120 };
      const glowR = r * glowMul * (0.9 + 0.2 * pulse);
      const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, glowR);
      glow.addColorStop(0, `rgba(${lit.r},${lit.g},${lit.b},${0.25 + 0.45 * pulse})`);
      glow.addColorStop(1, `rgba(${lit.r},${lit.g},${lit.b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, ly, glowR, 0, Math.PI * 2);
      ctx.fill();
      const bodyA = 0.35 + 0.6 * pulse;
      ctx.fillStyle = `rgba(${lit.r},${lit.g},${lit.b},${bodyA})`;
      ctx.beginPath();
      ctx.arc(lx, ly, r * (0.88 + 0.12 * pulse), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,230,${0.25 + 0.5 * pulse})`;
      ctx.beginPath();
      ctx.arc(lx - r * 0.25, ly - r * 0.25, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const on = sig === 'green';
    const lit = on
      ? { r: 70, g: 220, b: 120 }
      : { r: 230, g: 55, b: 45 };
    const glowR = r * glowMul;
    const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, glowR);
    glow.addColorStop(0, `rgba(${lit.r},${lit.g},${lit.b},${floating ? 0.5 : 0.55})`);
    glow.addColorStop(1, `rgba(${lit.r},${lit.g},${lit.b},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${lit.r},${lit.g},${lit.b},0.95)`;
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,230,0.55)';
    ctx.beginPath();
    ctx.arc(lx - r * 0.25, ly - r * 0.25, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawApproachLights(ctx, time) {
    const n = STATION.APPROACH_LIGHT_PAIRS;
    const step = STATION.APPROACH_LIGHT_STEP;
    const onDur = STATION.APPROACH_LIGHT_ON;
    const seqPeriod = Math.max(0.01, (n - 1) * step);
    const furthestY = this.dockFaceY() - this.y - STATION.DOCK_RADIUS;
    const closestY = this.apronNorthLocalY() + STATION.MOUTH_APRON * 0.15;
    const hw = STATION.APPROACH_LIGHT_HALF_W;
    const baseR = STATION.APPROACH_LIGHT_R;

    const mode = this.approachLightMode;
    const isExit = mode === 'exitReverseRed';
    const isFull = mode === 'fullBlinkRed';
    const lit =
      mode === 'green'
        ? { r: 80, g: 220, b: 120 }
        : mode === 'yellow'
          ? { r: 255, g: 200, b: 50 }
          : { r: 255, g: 70, b: 55 };
    const dim =
      mode === 'green'
        ? { r: 30, g: 80, b: 45 }
        : mode === 'yellow'
          ? { r: 90, g: 70, b: 20 }
          : { r: 90, g: 25, b: 20 };

    const fullBlinkOn =
      isFull && Math.sin(time * (Math.PI * 2) / STATION.APPROACH_LIGHT_FULL_BLINK) > 0;

    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : i / (n - 1);
      const ly = furthestY + (closestY - furthestY) * u;
      // i=0 furthest, i=n-1 closest. Ingress chase furthest→closest; exit reverses.
      const chaseIndex = isExit ? n - 1 - i : i;
      let bright = 0.22;
      if (isFull) {
        bright = fullBlinkOn ? 0.95 : 0.18;
      } else {
        const phase = time - chaseIndex * step;
        if (phase >= 0) {
          const inCycle = phase % seqPeriod;
          if (inCycle < onDur) {
            const pulse = 1 - inCycle / onDur;
            bright = 0.35 + 0.65 * pulse;
          }
        }
      }

      const col = {
        r: Math.round(dim.r + (lit.r - dim.r) * bright),
        g: Math.round(dim.g + (lit.g - dim.g) * bright),
        b: Math.round(dim.b + (lit.b - dim.b) * bright),
      };
      const alpha = 0.35 + 0.55 * bright;
      const radius = baseR + bright * baseR * 0.5;

      for (const side of [-1, 1]) {
        const lx = side * hw;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius * 3.2);
        g.addColorStop(0, `rgba(${col.r},${col.g},${col.b},${alpha * 0.55})`);
        g.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lx, ly, radius * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;
        ctx.beginPath();
        ctx.arc(lx, ly, radius, 0, Math.PI * 2);
        ctx.fill();
        if (bright > 0.55) {
          ctx.fillStyle = `rgba(255,255,230,${(bright - 0.55) * 0.9})`;
          ctx.beginPath();
          ctx.arc(lx, ly, radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  _drawHullBeacons(ctx, time) {
    const blink = Math.sin(time * 3) > 0;
    ctx.fillStyle = blink ? 'rgba(255, 80, 60, 0.9)' : 'rgba(80, 20, 20, 0.5)';
    const br = STATION.BEACON_R;
    // Four hull beacons: mirrored pairs on the north/south rims (±spread from pole).
    const spread = 0.67;
    const angles = [
      -Math.PI / 2 + spread,
      -Math.PI / 2 - spread,
      Math.PI / 2 - spread,
      Math.PI / 2 + spread,
    ];
    for (const a of angles) {
      ctx.beginPath();
      ctx.arc(
        Math.cos(a) * STATION.RADIUS * 0.92,
        Math.sin(a) * STATION.RADIUS * 0.92,
        br,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  _drawLabel(ctx) {
    const gap = STATION.LABEL_GAP;
    const fontMain = Math.max(11, 11 * (STATION.SCALE * 0.55));
    const fontSub = Math.max(8, 8 * (STATION.SCALE * 0.55));
    ctx.fillStyle = 'rgba(100, 180, 255, 0.55)';
    ctx.font = `${fontMain}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('JENNINGS STATION', 0, STATION.RADIUS + gap);
    ctx.font = `${fontSub}px sans-serif`;
    ctx.fillStyle = 'rgba(200, 214, 229, 0.4)';
    ctx.fillText('HOME BASE', 0, STATION.RADIUS + gap * 1.65);
  }
}
