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
import {
  paintStrangerBronzePlate,
  STRANGER_BRONZE_STYLE,
  STRANGER_BRONZE_HEIGHT,
} from '../textures/strangerBronzePlate.js';

export const TITLE_LOOP = 6;

export const TITLE_TUNING = {
  galaxyScroll: 14,
  /** Soft metal kiss sweep across the STRANGER bronze plate (seconds) */
  metalSweepPeriod: 11.0,
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

/** Canvas +Y down: ends sit lower, center (AN) highest. */
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
    this._steel = document.createElement('canvas');
    this._steel.width = 640;
    this._steel.height = STRANGER_BRONZE_HEIGHT;
    this._steelBaked = false;
    this._steelStyle = -1;
    this._glyph = document.createElement('canvas');
    this._glyph.width = 900;
    this._glyph.height = 280;
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

    const L = TITLE_LAYOUT;
    const markMul = Math.max(0.05, L.markScale || 1);
    const markY = Number.isFinite(L.markOffsetY) ? L.markOffsetY : 0;
    const scale = (Math.min(box.width, box.height) / DESIGN) * markMul;
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5 + markY;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-DESIGN * 0.5, -DESIGN * 0.5);
    this._drawShowcaseShip(ctx, time);
    this._drawStranger(ctx, time);
    this._drawInThe(ctx);
    this._drawGalaxy(ctx, time);
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
    const archAmp = Math.max(0, TITLE_LAYOUT.strangerArchAmp ?? 6);
    const font = this._strangerFont(size);
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const chars = text.split('');
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let cursor = 512 - total * 0.5;
    /** @type {{ ch: string, x: number, y: number }[]} */
    const bases = [];

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const cw = widths[i];
      const x = cursor + cw * 0.5;
      // S / final R sit lowest; middle AN crest the arch
      const y = y0 + archY(x - 512, total * 0.5, archAmp);
      bases.push({ ch, x, y });
      cursor += cw;
    }

    for (const g of bases) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(g.ch, g.x, g.y + 2);
      ctx.restore();
    }

    // Copper extrusion + outlines, then one brushed-bronze plate across the word
    const platePad = 48;
    this._paintSteelTile(total + platePad * 2);
    const plateLeft = 512 - total * 0.5 - platePad;
    const gctx = this._glyphCtx;
    const gw = this._glyph.width;
    const gh = this._glyph.height;

    for (const g of bases) {
      this._strangerExtrudeOutline(ctx, g.ch, g.x, g.y, size);

      gctx.clearRect(0, 0, gw, gh);
      gctx.save();
      gctx.translate(gw * 0.5, gh * 0.55);
      gctx.font = font;
      gctx.textAlign = 'center';
      gctx.textBaseline = 'middle';
      gctx.fillStyle = '#fff';
      gctx.fillText(g.ch, 0, 0);
      gctx.globalCompositeOperation = 'source-atop';

      const oy = -this._steel.height * 0.5 + (g.y - y0) * -0.5;
      gctx.drawImage(this._steel, plateLeft - g.x, oy);

      // Metal kiss between plate and letter mask (source-atop — not outside glyphs)
      const period = this.tuning.metalSweepPeriod || 11;
      const st = (((time % period) + period) % period) / period;
      if (st < 0.12) {
        const u = st / 0.12;
        const sx = plateLeft + this._steel.width * (u * 1.1 - 0.05) - g.x;
        gctx.globalCompositeOperation = 'source-atop';
        const kiss = gctx.createLinearGradient(sx - 22, 0, sx + 22, 0);
        kiss.addColorStop(0, 'rgba(255,230,180,0)');
        kiss.addColorStop(0.5, 'rgba(255,248,220,0.55)');
        kiss.addColorStop(1, 'rgba(255,230,180,0)');
        gctx.fillStyle = kiss;
        gctx.fillRect(sx - 26, oy, 52, this._steel.height);
      }

      const shade = gctx.createLinearGradient(0, -size * 0.55, 0, size * 0.55);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(0.65, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.1)');
      gctx.globalCompositeOperation = 'source-atop';
      gctx.fillStyle = shade;
      gctx.fillText(g.ch, 0, 0);
      gctx.restore();

      ctx.drawImage(this._glyph, g.x - gw * 0.5, g.y - gh * 0.55, gw, gh);
    }

    ctx.restore();
  }

  _strangerExtrudeOutline(ctx, ch, x, y, size) {
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
    ctx.strokeStyle = '#080604';
    ctx.strokeText(ch, x, y);
    ctx.restore();
  }

  /** Bake the STRANGER bronze plate (`src/textures/strangerBronzePlate.js`). */
  _paintSteelTile(needW = 640) {
    const w = Math.max(640, Math.ceil(needW));
    const h = STRANGER_BRONZE_HEIGHT;
    if (this._steel.width !== w || this._steel.height !== h) {
      this._steelBaked = false;
    }
    if (this._steelStyle !== STRANGER_BRONZE_STYLE) {
      this._steelStyle = STRANGER_BRONZE_STYLE;
      this._steelBaked = false;
    }
    if (this._steelBaked) return;
    paintStrangerBronzePlate(this._steel, w);
    this._steelBaked = true;
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

  /** Grow a letter downward without moving its top edge. */
  _withGalaxyTopScale(ctx, x, yMid, size, extendDown, draw) {
    const top = yMid - size * 0.5;
    const scaleY = (size + Math.max(0, extendDown)) / size;
    ctx.save();
    ctx.translate(x, top);
    ctx.scale(1, scaleY);
    ctx.translate(0, size * 0.5);
    draw();
    ctx.restore();
  }

  _drawGalaxy(ctx, time) {
    const text = 'GALAXY';
    const size = 128 * Math.max(0.05, TITLE_LAYOUT.galaxyScale || 1);
    const yMid = 555;
    const glow = pulse(time, 0.85, 0.82, 1);
    const font = `700 ${size}px "Russo One", "Alfa Slab One", "Arial Black", Impact, sans-serif`;
    // Modest descender: G/Y full; first A + X half that distance (no Y tail)
    const gyDrop = size * 0.14;
    const axDrop = gyDrop * 0.5;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const chars = text.split('');
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const tw = widths.reduce((a, b) => a + b, 0);

    let cursor = 512 - tw * 0.5;
    /** @type {{ ch: string, x: number, cw: number, extendDown: number }[]} */
    const glyphs = [];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const cw = widths[i];
      const x = cursor + cw * 0.5;
      // GALAXY indices: G0 A1 L2 A3 X4 Y5
      let extendDown = 0;
      if (ch === 'G' || ch === 'Y') extendDown = gyDrop;
      else if (i === 1 || ch === 'X') extendDown = axDrop;
      glyphs.push({ ch, x, cw, extendDown });
      cursor += cw;
    }

    const strokeLetter = (ch, dx = 0, dy = 0) => {
      ctx.strokeText(ch, dx, dy);
    };
    const fillLetter = (ch, dx = 0, dy = 0) => {
      ctx.fillText(ch, dx, dy);
    };

    // --- Shadow ---
    for (const g of glyphs) {
      this._withGalaxyTopScale(ctx, g.x, yMid, size, g.extendDown, () => {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 22;
        ctx.fillStyle = 'rgba(0,20,50,0.55)';
        fillLetter(g.ch);
        ctx.restore();
      });
    }

    // --- Extrusion ---
    for (let i = 16; i >= 1; i--) {
      const t = i / 16;
      ctx.fillStyle = `rgb(${Math.round(4 + t * 16)},${Math.round(18 + t * 45)},${Math.round(40 + t * 70)})`;
      ctx.globalAlpha = 0.65;
      for (const g of glyphs) {
        this._withGalaxyTopScale(ctx, g.x, yMid, size, g.extendDown, () => {
          fillLetter(g.ch, i * 0.9, i * 1.55);
        });
      }
    }
    ctx.globalAlpha = 1;

    // --- Outlines ---
    for (const g of glyphs) {
      this._withGalaxyTopScale(ctx, g.x, yMid, size, g.extendDown, () => {
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * 0.13;
        ctx.strokeStyle = '#020814';
        strokeLetter(g.ch);
        ctx.lineWidth = size * 0.055;
        ctx.strokeStyle = `rgba(170,230,255,${0.95 * glow})`;
        strokeLetter(g.ch);
      });
    }

    // --- Nebula faces (seamless tile; continuous scroll, no hard edges) ---
    this._paintNebula(time);
    const gctx = this._glyphCtx;
    const gw = this._glyph.width;
    const gh = this._glyph.height;
    const nebW = this._nebula.width;
    const scroll = ((time * this.tuning.galaxyScroll) % nebW + nebW) % nebW;

    for (const g of glyphs) {
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
      gctx.fillText(g.ch, 0, 0);
      gctx.globalCompositeOperation = 'source-atop';
      gctx.globalAlpha = 0.65 * glow;
      // Shared field across letters; wrap offset so tiles abut without a jump
      const offset = -((((g.x + scroll) % nebW) + nebW) % nebW);
      const nebY = -size * 0.55;
      const nebH = size * 1.2;
      for (let k = -1; k <= 2; k++) {
        gctx.drawImage(this._nebula, offset + k * nebW, nebY, nebW, nebH);
      }
      gctx.restore();
      this._withGalaxyTopScale(ctx, g.x, yMid, size, g.extendDown, () => {
        ctx.drawImage(this._glyph, -gw * 0.5, -gh * 0.55, gw, gh);
      });
    }

    // --- Highlight ---
    for (const g of glyphs) {
      this._withGalaxyTopScale(ctx, g.x, yMid, size, g.extendDown, () => {
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * 0.03;
        ctx.strokeStyle = `rgba(200,240,255,${0.6 * glow})`;
        strokeLetter(g.ch);
      });
    }

    ctx.restore();
  }

  /**
   * Horizontally seamless nebula tile for GALAXY letter faces.
   * Soft radials only (no linear washes) so left/right edges match when tiled.
   * Clouds are drawn at x-w / x / x+w so they wrap without popping.
   */
  _paintNebula(time) {
    const c = this._nebCtx;
    const w = this._nebula.width;
    const h = this._nebula.height;
    c.clearRect(0, 0, w, h);

    // Flat base — identical at both edges
    c.fillStyle = '#061a38';
    c.fillRect(0, 0, w, h);

    // Soft centered wash (no horizontal discontinuity)
    const wash = c.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, h * 0.95);
    wash.addColorStop(0, 'rgba(48,130,210,0.5)');
    wash.addColorStop(1, 'rgba(6,26,56,0)');
    c.fillStyle = wash;
    c.fillRect(0, 0, w, h);

    const clouds = [
      { phase: 0, y: 0.28, r: 72, spd: 20, a: 0.42, col: '140,210,255' },
      { phase: 95, y: 0.55, r: 98, spd: 13, a: 0.36, col: '60,160,255' },
      { phase: 190, y: 0.4, r: 82, spd: 17, a: 0.34, col: '100,200,255' },
      { phase: 280, y: 0.68, r: 88, spd: 10, a: 0.3, col: '40,140,220' },
      { phase: 360, y: 0.32, r: 62, spd: 24, a: 0.4, col: '180,230,255' },
      { phase: 440, y: 0.62, r: 105, spd: 8, a: 0.26, col: '30,100,200' },
      { phase: 120, y: 0.48, r: 58, spd: 19, a: 0.44, col: '160,220,255' },
      { phase: 310, y: 0.22, r: 76, spd: 15, a: 0.28, col: '80,170,240' },
    ];

    for (const cloud of clouds) {
      const x = ((time * cloud.spd + cloud.phase) % w + w) % w;
      const y = h * cloud.y + Math.sin(time * 0.32 + cloud.phase * 0.02) * h * 0.06;
      for (const ox of [x - w, x, x + w]) {
        const rg = c.createRadialGradient(ox, y, 0, ox, y, cloud.r);
        rg.addColorStop(0, `rgba(${cloud.col},${cloud.a})`);
        rg.addColorStop(0.55, `rgba(${cloud.col},${cloud.a * 0.35})`);
        rg.addColorStop(1, `rgba(${cloud.col},0)`);
        c.fillStyle = rg;
        c.beginPath();
        c.arc(ox, y, cloud.r, 0, Math.PI * 2);
        c.fill();
      }
    }

    // Star field — denser, wrap-safe, mixed sizes / twinkle
    for (let i = 0; i < 64; i++) {
      const drift = 2.2 + (i % 6) * 0.7;
      const x = ((time * drift + i * 29.7) % w + w) % w;
      const y = (((i * 37.1 + Math.sin(i * 1.7) * 18) % h) + h) % h;
      const twinkle =
        0.12 + 0.55 * (0.5 + 0.5 * Math.sin(time * (1.1 + (i % 8) * 0.28) + i * 0.7));
      const r = i % 11 === 0 ? 1.9 : i % 5 === 0 ? 1.35 : i % 3 === 0 ? 1.05 : 0.75;
      for (const ox of [x - w, x, x + w]) {
        if (ox < -3 || ox > w + 3) continue;
        c.fillStyle = `rgba(220,245,255,${twinkle})`;
        c.beginPath();
        c.arc(ox, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }

    // Occasional shooting stars (seamless; short streak drawn at wrap copies)
    this._paintNebulaShootingStar(c, w, h, time, 8.4, 0, 0.72, 0);
    this._paintNebulaShootingStar(c, w, h, time, 12.6, 5.2, 0.65, 3);

    // Cross twinkles live in the nebula (masked by letter faces), not over the wordmark
    this._paintNebulaSparkles(c, w, h, time);
  }

  /** Soft diagonal streak that wraps with the nebula tile. */
  _paintNebulaShootingStar(c, w, h, time, period, phase, duration, seed) {
    const t = time + phase;
    const local = ((t % period) + period) % period;
    if (local > duration) return;

    const u = local / duration;
    const fade = Math.sin(u * Math.PI);
    const shot = Math.floor(t / period) + seed;
    const y0 = h * (0.18 + (Math.abs(Math.sin(shot * 12.989)) % 1) * 0.55);
    const x0 = ((shot * 97.13) % w + w) % w;
    const travel = u * w * 0.62;
    const dx = 1;
    const dy = 0.28 + (Math.abs(Math.sin(shot * 3.1)) % 1) * 0.2;
    const hx = x0 + travel * dx;
    const hy = y0 + travel * dy;
    const len = 48 + (shot % 5) * 4;
    const tx = hx - dx * len;
    const ty = hy - dy * len;

    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const ox of [0, -w, w]) {
      const x1 = hx + ox;
      const x0s = tx + ox;
      if (Math.max(x1, x0s) < -len || Math.min(x1, x0s) > w + len) continue;
      if (hy < -8 || hy > h + 8) continue;

      const grad = c.createLinearGradient(x0s, ty, x1, hy);
      grad.addColorStop(0, 'rgba(180,230,255,0)');
      grad.addColorStop(0.55, `rgba(200,240,255,${0.35 * fade})`);
      grad.addColorStop(1, `rgba(255,255,255,${0.95 * fade})`);
      c.strokeStyle = grad;
      c.lineWidth = 1.6;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0s, ty);
      c.lineTo(x1, hy);
      c.stroke();

      c.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
      c.beginPath();
      c.arc(x1, hy, 1.8, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  _paintNebulaSparkles(c, w, h, time) {
    if (time >= this._nextSpark) {
      this._nextSpark = time + 0.38;
      const p = this.sparkles[this._si];
      this._si = (this._si + 1) % this.sparkles.length;
      p.alive = true;
      p.x = Math.random() * w;
      p.y = Math.random() * h;
      p.life = 0;
      p.max = 0.5;
      p.size = 2.2 + Math.random() * 1.4;
    }

    const dt = this._dt;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of this.sparkles) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        continue;
      }
      const a = Math.sin((p.life / p.max) * Math.PI);
      const s = p.size * (0.5 + a);
      c.globalAlpha = a * 0.95;
      c.strokeStyle = '#d8f4ff';
      c.lineWidth = 1.3;
      for (const ox of [p.x - w, p.x, p.x + w]) {
        if (ox < -s || ox > w + s) continue;
        c.beginPath();
        c.moveTo(ox - s, p.y);
        c.lineTo(ox + s, p.y);
        c.moveTo(ox, p.y - s);
        c.lineTo(ox, p.y + s);
        c.stroke();
      }
    }
    c.restore();
  }
}
