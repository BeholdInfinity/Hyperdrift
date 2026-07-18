/**
 * Title wordmark overlay — STRANGER / IN THE / GALAXY over a dedicated
 * 2.5D default player-ship render (not part of the live Jennings sim).
 *
 * Draws into `#title-art-spacer` (same screenspace as the former logo PNG).
 * World backdrop is drawn by GameEngine title sim.
 */

import { SHIP } from '../core/Constants.js';
import { createPlayerStarter } from '../ships/ShipGenerator.js';
import { drawModularShip } from '../ships/ShipRenderer.js';
import { hangarShipView } from '../ships/ShipViews.js';
import { makeVisitorThrusters } from '../world/HangarVisitorShips.js';
import { TITLE_LAYOUT } from './title-layout.js';

export const TITLE_LOOP = 6;

export const TITLE_TUNING = {
  floatAmp: 1.2,
  breath: 0.006,
  metalSweepPeriod: 11.0,
  galaxyScroll: 14,
  /** Ship beam vs widest title line (<1 so type barely spills past the hull) */
  shipTextFit: 0.88,
};

const DESIGN = 1024;
/** Nose screen-north — same as hangar pad / SPAWN_ANGLE */
const FACE_NORTH = SHIP.SPAWN_ANGLE;

function pulse(time, speed, lo, hi) {
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin(time * speed));
}

export function getLoopProgress(time, duration = TITLE_LOOP) {
  const d = duration > 0 ? duration : TITLE_LOOP;
  return (((time % d) + d) % d) / d;
}

function archY(x, halfW, amp) {
  const t = x / Math.max(halfW, 1);
  return amp * (t * t);
}

export class TitleScreen {
  constructor() {
    this.tuning = { ...TITLE_TUNING };
    this._dt = 1 / 60;
    this._spacer = null;
    this._nebula = document.createElement('canvas');
    this._nebula.width = 512;
    this._nebula.height = 180;
    this._nebCtx = this._nebula.getContext('2d');
    this._glyph = document.createElement('canvas');
    this._glyph.width = 900;
    this._glyph.height = 240;
    this._glyphCtx = this._glyph.getContext('2d');
    this.sparkles = [];
    for (let i = 0; i < 12; i++) {
      this.sparkles.push({ alive: false, x: 0, y: 0, life: 0, max: 1, size: 1 });
    }
    this._si = 0;
    this._nextSpark = 0.5;

    // Dedicated showcase hull — not in the live title sim
    const def = createPlayerStarter();
    this._ship = {
      shipDef: def,
      thrusters: makeVisitorThrusters(def),
      velocity: { x: 0, y: 0 },
      angle: FACE_NORTH,
      angularVelocity: 0,
      miningLaserFiring: false,
      muzzleFlash: 0,
      getTurretLocalAngle: () => 0,
    };
    this._shipHalfW = 0; // measured at scale 1, screen-X after north rotate
  }

  bindSpacer(el) {
    this._spacer = el || null;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number,y:number,width:number,height:number}|null} rect
   * @param {number} time
   * @param {number} [dt]
   */
  render(ctx, rect, time, dt = 1 / 60) {
    if (!ctx) return;
    this._dt = Math.min(0.05, Math.max(0, dt));

    let box = rect;
    if ((!box || box.width < 8) && this._spacer) {
      const r = this._spacer.getBoundingClientRect();
      box = { x: r.left, y: r.top, width: r.width, height: r.height };
    }
    if (!box || box.width < 8 || box.height < 8) return;

    const T = this.tuning;
    const L = TITLE_LAYOUT;
    const floatY = Math.sin((time * Math.PI * 2) / TITLE_LOOP) * T.floatAmp;
    const breath = 1 + Math.sin((time * Math.PI * 2) / TITLE_LOOP + 0.6) * T.breath;
    const markMul = Math.max(0.05, L.markScale || 1);
    const markY = Number.isFinite(L.markOffsetY) ? L.markOffsetY : 0;
    const scale = (Math.min(box.width, box.height) / DESIGN) * markMul;
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5 + floatY + markY;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale * breath, scale * breath);
    ctx.translate(-DESIGN * 0.5, -DESIGN * 0.5);

    this._drawShowcaseShip(ctx, time);
    this._drawStranger(ctx, time);
    this._drawInThe(ctx);
    this._drawGalaxy(ctx, time);
    this._drawSparkles(ctx);

    ctx.restore();
  }

  /** Measure ship half-width on screen when facing north (scale 1). */
  _measureShipHalfW() {
    if (this._shipHalfW > 0) return this._shipHalfW;
    const size = 640;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) {
      this._shipHalfW = 32;
      return this._shipHalfW;
    }
    // Measure hull only — plumes would inflate the beam
    const thrusters = this._ship.thrusters;
    this._ship.thrusters = null;
    x.translate(size * 0.5, size * 0.5);
    x.rotate(FACE_NORTH);
    drawModularShip(x, this._ship, hangarShipView(FACE_NORTH));
    this._ship.thrusters = thrusters;
    const data = x.getImageData(0, 0, size, size).data;
    let minX = size;
    let maxX = 0;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        if (data[(py * size + px) * 4 + 3] < 12) continue;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
      }
    }
    const half = maxX > minX ? (maxX - minX) * 0.5 : 32;
    this._shipHalfW = Math.max(14, half);
    return this._shipHalfW;
  }

  /**
   * Scale so widest title line barely spills past the ship's left/right edges.
   * @param {CanvasRenderingContext2D} ctx
   */
  _shipScaleForTitle(ctx) {
    ctx.save();
    ctx.font = this._strangerFont(88);
    const wStranger = ctx.measureText('STRANGER').width;
    ctx.font = `700 128px "Russo One", "Alfa Slab One", "Arial Black", Impact, sans-serif`;
    const wGalaxy = ctx.measureText('GALAXY').width;
    ctx.restore();
    const textHalf = Math.max(wStranger, wGalaxy) * 0.5;
    const shipHalf = this._measureShipHalfW();
    const fit = this.tuning.shipTextFit;
    return (textHalf * fit) / Math.max(1, shipHalf);
  }

  _drawShowcaseShip(ctx, time) {
    const shipScale =
      this._shipScaleForTitle(ctx) * Math.max(0.05, TITLE_LAYOUT.shipScale || 1);
    // Center under the word block (STRANGER ~390 … GALAXY ~555)
    const y = 475;
    const x = 512;

    const t = this._ship.thrusters;
    if (t) {
      for (const k of Object.keys(t)) {
        if (k === 'retroBurn') t[k] = false;
        else t[k] = 0;
      }
    }
    this._ship.velocity = { x: 0, y: 0 };

    // No per-frame ctx.filter / shadowBlur — both were costly on the modular hull
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(shipScale, shipScale);
    ctx.rotate(FACE_NORTH);
    drawModularShip(ctx, this._ship, hangarShipView(FACE_NORTH));
    ctx.restore();
  }

  _strangerFont(size) {
    return `${size}px "Alfa Slab One", "Russo One", "Arial Black", Impact, serif`;
  }

  _drawStranger(ctx, time) {
    const text = 'STRANGER';
    const size = 88 * Math.max(0.05, TITLE_LAYOUT.strangerScale || 1);
    const y0 = 390;
    const archAmp = 16;
    ctx.save();
    ctx.font = this._strangerFont(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(text, 512, y0 + 2);
    ctx.restore();

    const chars = text.split('');
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let cursor = 512 - total * 0.5;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const cw = widths[i];
      const x = cursor + cw * 0.5;
      const y = y0 + archY(x - 512, total * 0.5, archAmp);
      this._strangerGlyph(ctx, ch, x, y, size);
      cursor += cw;
    }

    // Soft, infrequent metal kiss (toned down)
    const period = this.tuning.metalSweepPeriod;
    const st = (((time % period) + period) % period) / period;
    if (st < 0.12) {
      const u = st / 0.12;
      const sx = 512 - tw * 0.55 + tw * 1.1 * u;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.rect(512 - tw * 0.5 - 12, y0 - size * 0.7, tw + 24, size * 1.4);
      ctx.clip();
      const sg = ctx.createLinearGradient(sx - 18, 0, sx + 18, 0);
      sg.addColorStop(0, 'rgba(255,220,160,0)');
      sg.addColorStop(0.5, 'rgba(255,245,210,0.16)');
      sg.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 22, y0 - size * 0.75, 44, size * 1.5);
      ctx.restore();
    }
    ctx.restore();
  }

  _strangerGlyph(ctx, ch, x, y, size) {
    ctx.save();
    ctx.font = this._strangerFont(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 14; i >= 1; i--) {
      const t = i / 14;
      ctx.fillStyle = `rgb(${Math.round(185 - t * 100)},${Math.round(80 - t * 50)},${Math.round(28 - t * 18)})`;
      ctx.fillText(ch, x + 1, y + i * 1.4);
    }

    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = '#080604';
    ctx.strokeText(ch, x, y);

    ctx.lineWidth = size * 0.08;
    const bevel = ctx.createLinearGradient(x, y - size * 0.55, x, y + size * 0.55);
    bevel.addColorStop(0, '#ffffff');
    bevel.addColorStop(0.35, '#c8c0b4');
    bevel.addColorStop(0.7, '#686058');
    bevel.addColorStop(1, '#1a1612');
    ctx.strokeStyle = bevel;
    ctx.strokeText(ch, x, y);

    const face = ctx.createLinearGradient(x, y - size * 0.55, x, y + size * 0.55);
    face.addColorStop(0, '#f0e8dc');
    face.addColorStop(0.25, '#b8b0a4');
    face.addColorStop(0.55, '#7a746c');
    face.addColorStop(1, '#2a2622');
    ctx.fillStyle = face;
    ctx.fillText(ch, x, y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - size, y - size * 0.58, size * 2, size * 0.3);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,160,60,0.35)';
    ctx.fillText(ch, x, y - 1);
    ctx.restore();

    ctx.restore();
  }

  _drawInThe(ctx) {
    const y = 458;
    const size = 22 * Math.max(0.05, TITLE_LAYOUT.inTheScale || 1);
    ctx.save();
    ctx.font = `600 ${size}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#f4f8ff';
    ctx.fillText('IN THE', 512, y);
    ctx.restore();
  }

  _drawGalaxy(ctx, time) {
    const text = 'GALAXY';
    const size = 128 * Math.max(0.05, TITLE_LAYOUT.galaxyScale || 1);
    const y = 555;
    const breath = pulse(time, 0.85, 0.82, 1);
    const font = `700 ${size}px "Russo One", "Alfa Slab One", "Arial Black", Impact, sans-serif`;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(0,20,50,0.55)';
    ctx.fillText(text, 512, y);
    ctx.restore();

    for (let i = 16; i >= 1; i--) {
      const t = i / 16;
      ctx.fillStyle = `rgb(${Math.round(4 + t * 16)},${Math.round(18 + t * 45)},${Math.round(40 + t * 70)})`;
      ctx.globalAlpha = 0.65;
      ctx.fillText(text, 512 + i * 0.9, y + i * 1.55);
    }
    ctx.globalAlpha = 1;

    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.13;
    ctx.strokeStyle = '#020814';
    ctx.strokeText(text, 512, y);
    ctx.lineWidth = size * 0.055;
    ctx.strokeStyle = `rgba(170,230,255,${0.95 * breath})`;
    ctx.strokeText(text, 512, y);

    this._paintNebula(time);
    const gctx = this._glyphCtx;
    const gw = this._glyph.width;
    const gh = this._glyph.height;
    gctx.clearRect(0, 0, gw, gh);
    gctx.save();
    gctx.translate(gw * 0.5, gh * 0.55);
    gctx.font = font;
    gctx.textAlign = 'center';
    gctx.textBaseline = 'middle';
    const face = gctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
    face.addColorStop(0, '#f0fcff');
    face.addColorStop(0.2, '#a8e8ff');
    face.addColorStop(0.5, '#28a0f0');
    face.addColorStop(1, '#041830');
    gctx.fillStyle = face;
    gctx.fillText(text, 0, 0);
    gctx.globalCompositeOperation = 'source-atop';
    gctx.globalAlpha = 0.65 * breath;
    const scroll = (time * this.tuning.galaxyScroll) % 512;
    gctx.drawImage(this._nebula, -tw * 0.55 - scroll * 0.35, -size * 0.55, 512, size * 1.2);
    gctx.drawImage(this._nebula, -tw * 0.55 - scroll * 0.35 + 512, -size * 0.55, 512, size * 1.2);
    gctx.restore();

    ctx.drawImage(this._glyph, 512 - gw * 0.5, y - gh * 0.55, gw, gh);
    ctx.lineWidth = size * 0.03;
    ctx.strokeStyle = `rgba(200,240,255,${0.6 * breath})`;
    ctx.strokeText(text, 512, y);

    // Twinkles on GALAXY (icy flecks)
    if (time >= this._nextSpark) {
      this._nextSpark = time + 0.38;
      const p = this.sparkles[this._si];
      this._si = (this._si + 1) % this.sparkles.length;
      p.alive = true;
      p.x = 512 + (Math.random() - 0.5) * tw * 0.82;
      p.y = y + (Math.random() - 0.5) * size * 0.55;
      p.life = 0;
      p.max = 0.5;
      p.size = 2.4;
    }
    ctx.restore();
  }

  _paintNebula(time) {
    const c = this._nebCtx;
    const w = this._nebula.width;
    const h = this._nebula.height;
    c.clearRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#041228');
    g.addColorStop(0.4, '#1560b8');
    g.addColorStop(0.7, '#40a8ff');
    g.addColorStop(1, '#082850');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const x = (time * 12 + i * 70) % w;
      const y = h * (0.2 + (i % 3) * 0.25);
      const rg = c.createRadialGradient(x, y, 0, x, y, 55);
      rg.addColorStop(0, 'rgba(140,220,255,0.45)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.beginPath();
      c.arc(x, y, 55, 0, Math.PI * 2);
      c.fill();
    }
  }

  _drawSparkles(ctx) {
    const dt = this._dt;
    for (const p of this.sparkles) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        continue;
      }
      const a = Math.sin((p.life / p.max) * Math.PI);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = '#d8f4ff';
      ctx.lineWidth = 1.3;
      const s = p.size * (0.5 + a);
      ctx.beginPath();
      ctx.moveTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x, p.y + s);
      ctx.stroke();
      ctx.restore();
    }
  }
}
