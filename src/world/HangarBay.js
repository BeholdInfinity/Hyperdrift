/**
 * Temporary ship-inspection hangar: docked bay, props, and reacting NPCs.
 * +Y = south, −Y = north (bay doors to space). Player on B2 (center).
 */

import { HANGAR, SHIP } from '../core/Constants.js';
import { drawVisitorShip, pickVisitorId } from './HangarVisitorShips.js';

const BAY = {
  HALF_W: 340,
  HALF_H: 200,
  PAD_R: 38,
  SIDE_PAD_X: HANGAR.SIDE_PAD_X,
  DOOR_HALF: 52,
  DOOR_H: 42,
  /** Space viewports above each closed bay door (near door width) */
  VIEWPORT_W: 96,
  VIEWPORT_H: 22,
};

/** B1 (left) → B2 (center / player) → B3 (right) */
function padCenters() {
  return [-BAY.SIDE_PAD_X, 0, BAY.SIDE_PAD_X];
}

function bayLabels() {
  return ['B1', 'B2', 'B3'];
}

/**
 * Up to 5 crate-stack slots. Far left/right + between-pad lanes
 * (between stacks sit south of pads so they don't block ship→door paths).
 */
const STACK_SLOTS = [
  { id: 'farLeftN', x: -275, y: -78 },
  { id: 'farRightN', x: 275, y: -72 },
  { id: 'farLeftS', x: -285, y: 115 },
  { id: 'lane12', x: -BAY.SIDE_PAD_X / 2, y: 58 },
  { id: 'lane23', x: BAY.SIDE_PAD_X / 2, y: 58 },
];

const CARGO_KINDS = [
  { label: 'CRATE', w: 10, h: 8, color: '#6a5a3a' },
  { label: 'BARREL', w: 7, h: 7, color: '#4a6a4a' },
  { label: 'PANEL', w: 12, h: 5, color: '#5a7088' },
  { label: 'COIL', w: 8, h: 8, color: '#8a6a40' },
  { label: 'ANTENNA', w: 4, h: 14, color: '#708898' },
  { label: 'TANK', w: 9, h: 9, color: '#3a5a6a' },
];

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
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

/** @returns {{ x: number, visitorId: string|null, bayId: string }} */
function rollSidePad(x, bayId) {
  const occupied = Math.random() < 0.7;
  return {
    x,
    bayId,
    visitorId: occupied ? pickVisitorId() : null,
  };
}

export class HangarBay {
  constructor() {
    this.time = 0;
    this.npcs = [];
    this._spawnTimer = 0.5;
    this._sparkle = [];
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    this.sidePads = [];
    this.stacks = [];
    this._shipPos = { x: 0, y: 0 };
    this._shipAngle = SHIP.SPAWN_ANGLE;
    this.crane = null;
  }

  reset() {
    this.time = 0;
    this.npcs = [];
    this._spawnTimer = 0.4;
    this._sparkle = [];
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    // Visitor pads B1 + B3; player occupies B2 (center)
    this.sidePads = [
      rollSidePad(-BAY.SIDE_PAD_X, 'B1'),
      rollSidePad(BAY.SIDE_PAD_X, 'B3'),
    ];
    this._rollStacks();
    this._resetCrane();
    this._spawnMechanic(rand(-100, -50));
    this._spawnMechanic(rand(50, 110));
    this._spawnForklift(Math.random() < 0.5 ? -1 : 1);
  }

  /** Randomly activate 2–5 of the five stack slots. */
  _rollStacks() {
    const shuffled = [...STACK_SLOTS].sort(() => Math.random() - 0.5);
    const count = 2 + ((Math.random() * 4) | 0); // 2..5
    this.stacks = shuffled.slice(0, count).map((slot) => ({
      id: slot.id,
      x: slot.x,
      y: slot.y,
      n: 2 + ((Math.random() * 3) | 0),
    }));
  }

  _pickCraneJob() {
    const piles = this.stacks;
    if (!piles.length) return { pickup: STACK_SLOTS[0], dropoff: STACK_SLOTS[1] };
    const pickup = pick(piles);
    let dropoff = pick(piles);
    let guard = 0;
    while (dropoff.id === pickup.id && piles.length > 1 && guard++ < 12) {
      dropoff = pick(piles);
    }
    return { pickup, dropoff };
  }

  _resetCrane() {
    const railY = -BAY.HALF_H + 36;
    const job = this._pickCraneJob();
    this.crane = {
      x: job.pickup.x,
      clawY: railY + 16,
      travelY: railY + 16,
      carrying: false,
      boxColor: '#6a5840',
      phase: 'toPickup',
      pickup: job.pickup,
      dropoff: job.dropoff,
      pause: 0.4,
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

    this._updateCrane(deltaTime);

    this._spawnTimer -= deltaTime;
    if (this._spawnTimer <= 0 && this.npcs.length < 5) {
      if (Math.random() < 0.55) this._spawnMechanic();
      else this._spawnForklift(Math.random() < 0.5 ? -1 : 1);
      this._spawnTimer = rand(2.8, 5.5);
    }

    const hazardLevel =
      this._hazard.maneuver * 0.55 +
      this._hazard.engine * 1.1 +
      this._hazard.weapons * 1.35;

    for (const npc of this.npcs) {
      this._updateNpc(npc, deltaTime, hazardLevel);
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
  }

  _updateCrane(dt) {
    const c = this.crane;
    if (!c) return;
    const railY = -BAY.HALF_H + 36;
    c.travelY = railY + 16;
    const grabY = (pile) => pile.y - 6;
    const moveSpeed = 95;
    const hoistSpeed = 55;

    if (c.pause > 0) {
      c.pause -= dt;
      return;
    }

    const near = (a, b, eps = 2.5) => Math.abs(a - b) < eps;

    switch (c.phase) {
      case 'toPickup': {
        const dx = c.pickup.x - c.x;
        const step = Math.sign(dx) * moveSpeed * dt;
        if (Math.abs(dx) <= Math.abs(step) || near(c.x, c.pickup.x)) {
          c.x = c.pickup.x;
          c.phase = 'lowerPickup';
        } else {
          c.x += step;
        }
        c.clawY = c.travelY;
        break;
      }
      case 'lowerPickup': {
        const ty = grabY(c.pickup);
        c.clawY = Math.min(c.clawY + hoistSpeed * dt, ty);
        if (near(c.clawY, ty, 3)) {
          c.clawY = ty;
          c.carrying = true;
          c.boxColor = Math.random() < 0.5 ? '#6a5840' : '#5a4a32';
          c.pause = 0.35;
          c.phase = 'raisePickup';
        }
        break;
      }
      case 'raisePickup': {
        c.clawY = Math.max(c.clawY - hoistSpeed * dt, c.travelY);
        if (near(c.clawY, c.travelY, 3)) {
          c.clawY = c.travelY;
          c.phase = 'toDropoff';
        }
        break;
      }
      case 'toDropoff': {
        const dx = c.dropoff.x - c.x;
        const step = Math.sign(dx) * moveSpeed * dt;
        if (Math.abs(dx) <= Math.abs(step) || near(c.x, c.dropoff.x)) {
          c.x = c.dropoff.x;
          c.phase = 'lowerDropoff';
        } else {
          c.x += step;
        }
        c.clawY = c.travelY;
        break;
      }
      case 'lowerDropoff': {
        const ty = grabY(c.dropoff);
        c.clawY = Math.min(c.clawY + hoistSpeed * dt, ty);
        if (near(c.clawY, ty, 3)) {
          c.clawY = ty;
          c.carrying = false;
          c.pause = 0.4;
          c.phase = 'raiseDropoff';
        }
        break;
      }
      case 'raiseDropoff': {
        c.clawY = Math.max(c.clawY - hoistSpeed * dt, c.travelY);
        if (near(c.clawY, c.travelY, 3)) {
          c.clawY = c.travelY;
          const job = this._pickCraneJob();
          c.pickup = job.pickup;
          c.dropoff = job.dropoff;
          c.pause = 0.55;
          c.phase = 'toPickup';
        }
        break;
      }
      default:
        c.phase = 'toPickup';
    }
  }

  _spawnMechanic(x = null) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const startX = x ?? (side < 0 ? -BAY.HALF_W - 20 : BAY.HALF_W + 20);
    // Walk the south apron so they stay clear of the north door approach
    this.npcs.push({
      kind: 'mechanic',
      alive: true,
      x: startX,
      y: rand(55, 130),
      vx: side * rand(18, 32),
      facing: side,
      phase: Math.random() * Math.PI * 2,
      state: 'walk',
      stateT: 0,
      suit: pick(['#3a6a8a', '#4a7a6a', '#6a5a4a', '#5a5a7a']),
      helmet: pick(['#c8d0d8', '#a8b8c8', '#d0c8b0']),
    });
  }

  _spawnForklift(dir = 1) {
    const cargo = pick(CARGO_KINDS);
    this.npcs.push({
      kind: 'forklift',
      alive: true,
      x: dir < 0 ? BAY.HALF_W + 40 : -BAY.HALF_W - 40,
      y: rand(70, 150),
      vx: dir * rand(28, 42),
      facing: dir,
      phase: Math.random() * Math.PI * 2,
      state: 'drive',
      stateT: 0,
      cargo,
      body: pick(['#c87830', '#b86028', '#d08840']),
    });
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

  _updateNpc(npc, dt, hazard) {
    npc.phase += dt * 8;
    npc.stateT -= dt;

    const dist = Math.hypot(npc.x, npc.y);
    const nearPad = dist < 80;

    if (npc.state === 'walk' || npc.state === 'drive') {
      if (hazard > 0.35 && nearPad && Math.random() < hazard * 0.08) {
        npc.state = hazard > 0.9 ? 'flee' : 'flinch';
        npc.stateT = hazard > 0.9 ? rand(0.7, 1.2) : rand(0.35, 0.6);
        if (npc.state === 'flee') {
          const away = Math.atan2(npc.y, npc.x);
          const speed = npc.kind === 'forklift' ? 55 : 70;
          npc.vx = Math.cos(away) * speed;
          npc.facing = Math.sign(npc.vx) || npc.facing;
        }
      } else if (hazard > 0.7 && npc.kind === 'forklift' && Math.random() < 0.04) {
        npc.state = 'drop';
        npc.stateT = 0.55;
      }
    } else if (npc.state === 'flinch') {
      npc.x += Math.sin(npc.phase * 2) * 12 * dt;
      if (npc.stateT <= 0) npc.state = npc.kind === 'forklift' ? 'drive' : 'walk';
    } else if (npc.state === 'flee') {
      npc.x += npc.vx * dt;
      if (npc.stateT <= 0 || Math.abs(npc.x) > BAY.HALF_W + 50) {
        npc.alive = false;
      }
    } else if (npc.state === 'drop') {
      if (npc.stateT <= 0) npc.state = 'drive';
    }

    if (npc.state === 'walk' || npc.state === 'drive') {
      npc.x += npc.vx * dt;
      npc.y += Math.sin(npc.phase * 0.35) * (npc.kind === 'forklift' ? 4 : 6) * dt;
      if (Math.abs(npc.x) > BAY.HALF_W + 55) npc.alive = false;
    }

    const pushed = this._padKeepOut(npc.x, npc.y);
    if (pushed && npc.state !== 'flee') {
      npc.x = pushed.x;
      npc.y = pushed.y;
    }
  }

  render(ctx, space = null) {
    this._drawBayShell(ctx);
    if (space) this._drawViewportSpace(ctx, space);
    this._drawViewportFrames(ctx);
    this._drawFloor(ctx);
    this._drawBayDoors(ctx);
    this._drawProps(ctx);
    // B2 = player (center); B1/B3 = visitors
    this._drawDockPad(ctx, 0, 0, 'B2', { active: true });
    for (const pad of this.sidePads) {
      this._drawDockPad(ctx, pad.x, 0, pad.bayId, {
        active: false,
        occupied: !!pad.visitorId,
      });
    }
    for (const pad of this.sidePads) {
      if (pad.visitorId) this._drawVisitor(ctx, pad);
    }
    this._drawOverhead(ctx);
    for (const npc of this.npcs) {
      if (npc.kind === 'mechanic') this._drawMechanic(ctx, npc);
      else this._drawForklift(ctx, npc);
    }
    this._drawSparkles(ctx);
    this._drawHazardWash(ctx);
  }

  _drawBayShell(ctx) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const centers = padCenters();
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -h - 40;

    // Station bulk — paint around viewport holes so title-space (drawn underneath) shows through.
    // Do NOT use destination-out: that clears to the page background (black), not prior canvas pixels.
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(-w - 100, h, (w + 100) * 2, 100);
    ctx.fillRect(-w - 100, -h - 80, 100, (h + 80) * 2 + 100);
    ctx.fillRect(w, -h - 80, 100, (h + 80) * 2 + 100);

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
      // Above and below the glass within this column
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

    // North interior bulkhead — leave glass holes open
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

    // Interior deck
    ctx.fillStyle = '#1c2a38';
    ctx.fillRect(-w, -h + BAY.DOOR_H, w * 2, h * 2 - BAY.DOOR_H);
    ctx.strokeStyle = '#3a5568';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w, -h, w * 2, h * 2);

    // Side observation windows — opaque dark glass (not space portals)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const wy = -30 + i * 48;
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

  /**
   * Paint the live title-space chunk into each viewport glass
   * (world-local clip — reliable at hangar zoom; does not rely on under-layer compositing).
   */
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
      // Local “window camera”: same drifting chunk as the title screen
      const cover = Math.hypot(vpW, vpH) + 40;
      nebulaField.renderProcedural(ctx, spaceX, spaceY, time, cover, 0.55);
      starfield.render(ctx, spaceX, spaceY, cover, time, 0.55);
      if (nebulae?.length) {
        ctx.save();
        ctx.translate(-spaceX, -spaceY);
        // Scale world nebulae down so they read in the small window
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
      // Closed door leaves
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

      ctx.strokeStyle = 'rgba(90, 110, 130, 0.35)';
      for (const ox of [-dh * 0.55, -dh * 0.25, dh * 0.25, dh * 0.55]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox, doorTop + 4);
        ctx.lineTo(cx + ox, doorTop + doorH - 4);
        ctx.stroke();
      }

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

    // Quiet deck grid (low contrast so hulls read clearly)
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

    // Taxi lines toward each bay door
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

  _drawProps(ctx) {
    for (const s of this.stacks) {
      for (let i = 0; i < s.n; i++) {
        ctx.fillStyle = i % 2 ? '#5a4a32' : '#6a5840';
        ctx.strokeStyle = '#8a7860';
        ctx.lineWidth = 1;
        const bx = s.x - 8 + (i % 2) * 3;
        const by = s.y + 6 - i * 7;
        ctx.beginPath();
        ctx.rect(bx, by, 16, 12);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#3a4858';
    ctx.fillRect(-70, 145, 22, 12);
    ctx.fillStyle = '#c87830';
    ctx.beginPath();
    ctx.arc(-67, 159, 2.5, 0, Math.PI * 2);
    ctx.arc(-51, 159, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a2834';
    ctx.strokeStyle = '#5a90a8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(BAY.HALF_W - 32, 40, 18, 50);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(80, 200, 140, 0.35)';
    ctx.fillRect(BAY.HALF_W - 28, 48, 10, 6);
    ctx.fillStyle = 'rgba(100, 180, 255, 0.3)';
    ctx.fillRect(BAY.HALF_W - 28, 60, 10, 14);
  }

  /**
   * Flat, low-detail pad — must not read as hull hardware.
   * @param {{ active?: boolean, occupied?: boolean }} opts
   */
  _drawDockPad(ctx, cx, cy, label, opts = {}) {
    const active = !!opts.active;
    const occupied = !!opts.occupied;
    ctx.save();
    ctx.translate(cx, cy);

    // Solid matte disc — darker than deck, no chevrons / clamps / markings under hull
    ctx.fillStyle = active ? '#121820' : '#161c24';
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R, 0, Math.PI * 2);
    ctx.fill();

    // Quiet outer lip only
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

    // Bay id south of pad — clear of ship silhouette
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

    // Clear EMPTY label overlap: redraw bay id only (ship covers center)
    ctx.save();
    ctx.translate(pad.x, 0);
    ctx.fillStyle = 'rgba(120, 140, 160, 0.4)';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pad.bayId, 0, BAY.PAD_R + 9);
    ctx.restore();
  }

  _drawOverhead(ctx) {
    const railY = -BAY.HALF_H + 36;
    const c = this.crane;

    // Gantry rails
    ctx.strokeStyle = 'rgba(90, 120, 140, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-BAY.HALF_W + 10, railY);
    ctx.lineTo(BAY.HALF_W - 10, railY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-BAY.HALF_W + 10, BAY.HALF_H - 28);
    ctx.lineTo(BAY.HALF_W - 10, BAY.HALF_H - 28);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(70, 100, 120, 0.35)';
    for (const x of padCenters()) {
      ctx.beginPath();
      ctx.moveTo(x, railY);
      ctx.lineTo(x, railY + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, BAY.HALF_H - 28);
      ctx.lineTo(x, BAY.HALF_H - 42);
      ctx.stroke();
    }

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

    const craneX = c.x;
    const trolleyY = railY - 4;
    const clawY = c.clawY;

    ctx.fillStyle = '#5a6a78';
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1;
    ctx.fillRect(craneX - 16, trolleyY, 32, 12);
    ctx.strokeRect(craneX - 16, trolleyY, 32, 12);

    ctx.strokeStyle = 'rgba(180, 190, 200, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(craneX, trolleyY + 12);
    ctx.lineTo(craneX, clawY - 4);
    ctx.stroke();

    // Carried crate (visual only — piles don't change)
    if (c.carrying) {
      ctx.fillStyle = c.boxColor;
      ctx.strokeStyle = '#8a7860';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(craneX - 8, clawY + 8, 16, 12);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = '#6a7888';
    ctx.strokeStyle = '#a8b8c8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(craneX - 7, clawY - 4);
    ctx.lineTo(craneX + 7, clawY - 4);
    ctx.lineTo(craneX + 5, clawY + 2);
    ctx.lineTo(craneX - 5, clawY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(craneX - 5, clawY + 2);
    ctx.lineTo(craneX - 8, clawY + 9);
    ctx.moveTo(craneX + 5, clawY + 2);
    ctx.lineTo(craneX + 8, clawY + 9);
    ctx.moveTo(craneX, clawY + 2);
    ctx.lineTo(craneX, clawY + 10);
    ctx.stroke();
  }

  _drawMechanic(ctx, npc) {
    ctx.save();
    ctx.translate(npc.x, npc.y);
    const flip = npc.facing < 0 ? -1 : 1;
    ctx.scale(flip, 1);

    const bob = npc.state === 'flinch' ? Math.sin(npc.phase * 3) * 1.5 : Math.sin(npc.phase) * 0.8;
    const duck = npc.state === 'flinch' || npc.state === 'flee' ? 2 : 0;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = npc.suit;
    ctx.lineWidth = 1.6;
    const stride = npc.state === 'walk' ? Math.sin(npc.phase) * 3 : 0;
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

    if (npc.state === 'walk') {
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
    const cargoLift = npc.state === 'drop' ? -6 : 2;

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

    if (npc.state !== 'drop' || npc.stateT > 0.25) {
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
      ctx.fillStyle = `rgba(255, 180, 80, ${a * 0.7})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * a, 0, Math.PI * 2);
      ctx.fill();
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
