/**
 * Theme-level surface skins — seams, grit, stripes, marks painted over section meshes.
 * Driven by palette.finish + palette.colors (see Themes.js).
 */

import { hexToRgba } from './Themes.js';
import { lastDeckLift } from './ShipViews.js';

function shade(hex, amt) {
  const s = String(hex || '#445566').trim();
  let r;
  let g;
  let b;
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    r = Math.round(Number(rgb[1]));
    g = Math.round(Number(rgb[2]));
    b = Math.round(Number(rgb[3]));
  } else {
    const n = s.replace('#', '');
    const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return hex;
    r = (num >> 16) & 0xff;
    g = (num >> 8) & 0xff;
    b = num & 0xff;
  }
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function boundsOf(pts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function clipToFoot(ctx, foot) {
  ctx.beginPath();
  ctx.moveTo(foot[0][0], foot[0][1]);
  for (let i = 1; i < foot.length; i++) ctx.lineTo(foot[i][0], foot[i][1]);
  ctx.closePath();
  ctx.clip();
}

function paintSeams(ctx, foot, b, strength) {
  if (strength < 0.05) return;
  ctx.save();
  ctx.globalAlpha = 0.18 + strength * 0.32;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.45;
  // Longitudinal spine
  ctx.beginPath();
  ctx.moveTo(b.minX + 1.5, b.cy);
  ctx.lineTo(b.maxX - 1.5, b.cy);
  ctx.stroke();
  // Cross ribs
  const ribs = 2 + Math.round(strength * 3);
  for (let i = 1; i <= ribs; i++) {
    const t = i / (ribs + 1);
    const x = b.minX + (b.maxX - b.minX) * t;
    ctx.beginPath();
    ctx.moveTo(x, b.minY + 1.2);
    ctx.lineTo(x, b.maxY - 1.2);
    ctx.stroke();
  }
  // Inset rim
  ctx.globalAlpha = 0.14 + strength * 0.22;
  ctx.beginPath();
  ctx.moveTo(foot[0][0], foot[0][1]);
  for (let i = 1; i < foot.length; i++) ctx.lineTo(foot[i][0], foot[i][1]);
  ctx.closePath();
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
}

function paintRivets(ctx, foot, density) {
  if (density < 0.05) return;
  const n = Math.max(3, Math.round(4 + density * 10));
  ctx.fillStyle = 'rgba(8,6,4,0.7)';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const i0 = Math.floor(t * foot.length) % foot.length;
    const i1 = (i0 + 1) % foot.length;
    const u = t * foot.length - i0;
    const x = foot[i0][0] + (foot[i1][0] - foot[i0][0]) * u;
    const y = foot[i0][1] + (foot[i1][1] - foot[i0][1]) * u;
    ctx.beginPath();
    ctx.arc(x * 0.92, y * 0.92, 0.45 + density * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintWelds(ctx, b, strength) {
  if (strength < 0.1) return;
  ctx.save();
  ctx.globalAlpha = 0.22 + strength * 0.32;
  ctx.strokeStyle = 'rgba(180,160,120,0.55)';
  ctx.lineWidth = 0.55;
  ctx.setLineDash([1.0, 1.4]);
  const y0 = b.cy - (b.maxY - b.minY) * 0.22;
  const y1 = b.cy + (b.maxY - b.minY) * 0.22;
  ctx.beginPath();
  ctx.moveTo(b.minX + 2, y0);
  ctx.lineTo(b.maxX - 2, y0);
  ctx.moveTo(b.minX + 2, y1);
  ctx.lineTo(b.maxX - 2, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  // Tiny bead dots along primary weld
  ctx.globalAlpha = 0.3 + strength * 0.25;
  ctx.fillStyle = 'rgba(200,180,140,0.7)';
  const beads = 4 + Math.round(strength * 3);
  for (let i = 0; i < beads; i++) {
    const t = (i + 0.5) / beads;
    const x = b.minX + 2 + (b.maxX - b.minX - 4) * t;
    ctx.beginPath();
    ctx.arc(x, y0, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintGrit(ctx, b, wear, grit, dirtHex) {
  const amt = wear * grit;
  if (amt < 0.08) return;
  ctx.save();
  const dirt = dirtHex || '#1a1410';
  const patches = 3 + Math.round(amt * 6);
  for (let i = 0; i < patches; i++) {
    const px = b.minX + ((i * 37) % 97) / 97 * (b.maxX - b.minX);
    const py = b.minY + ((i * 53) % 89) / 89 * (b.maxY - b.minY);
    const rx = 1.2 + (i % 3) * 0.9 * amt;
    const ry = 0.7 + (i % 2) * 0.6 * amt;
    ctx.globalAlpha = 0.12 + amt * 0.28;
    ctx.fillStyle = dirt;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, (i * 0.7) % Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Scratches
  ctx.globalAlpha = 0.18 + amt * 0.3;
  ctx.strokeStyle = shade(dirt, -20);
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(b.minX + 2, b.cy - 2.5);
  ctx.lineTo(b.maxX - 3, b.cy - 1.8);
  ctx.moveTo(b.minX + 3, b.cy + 2.2);
  ctx.lineTo(b.maxX - 2, b.cy + 2.8);
  ctx.stroke();
  ctx.restore();
}

function paintSoot(ctx, b, role, soot, wear) {
  const amt = soot * (0.45 + wear * 0.55);
  if (amt < 0.08) return;
  if (role !== 'engine' && role !== 'aft' && role !== 'body' && role !== 'hull') {
    return;
  }
  ctx.save();
  ctx.globalAlpha = 0.15 + amt * 0.4;
  ctx.fillStyle = '#06080c';
  const x0 = role === 'body' || role === 'hull' ? b.minX : b.minX - 1;
  ctx.beginPath();
  ctx.ellipse(x0 + 2, b.cy, 3.5 * amt + 1.5, (b.maxY - b.minY) * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintSheen(ctx, foot, b, sheen, gloss, trim) {
  if (sheen < 0.05 && gloss < 0.05) return;
  ctx.save();
  // Specular rim — thin hairline, depth from alpha not stroke weight
  if (sheen > 0.05) {
    ctx.globalAlpha = 0.1 + sheen * 0.38;
    ctx.strokeStyle = hexToRgba(trim || '#c0d0e0', 0.95);
    ctx.lineWidth = 0.5 + Math.min(0.35, sheen * 0.35);
    ctx.beginPath();
    ctx.moveTo(foot[0][0], foot[0][1]);
    for (let i = 1; i < foot.length; i++) ctx.lineTo(foot[i][0], foot[i][1]);
    ctx.closePath();
    ctx.stroke();
  }
  // Gloss highlight streak
  if (gloss > 0.1) {
    ctx.globalAlpha = 0.08 + gloss * 0.28;
    const grad = ctx.createLinearGradient(b.minX, b.minY, b.maxX, b.maxY);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(b.minX, b.cy - 1.4, b.maxX - b.minX, 2.8);
  }
  ctx.restore();
}

function paintStripe(ctx, b, finish, colors, role) {
  const kind = finish.stripe || 'none';
  if (kind === 'none') return;
  // Nose sections: keep skin quiet so canopy reads clean
  if (role === 'bridge' || role === 'cockpit') return;
  const stripe = colors.stripe || colors.accent || '#c08040';
  const secondary = colors.secondary || colors.trim || '#668088';
  const y = b.cy;
  const x0 = b.minX + 1.5;
  const x1 = b.maxX - 1.5;
  const len = x1 - x0;
  if (len < 4) return;

  ctx.save();
  if (kind === 'hazard') {
    ctx.globalAlpha = 0.72;
    const bandH = Math.min(3.2, (b.maxY - b.minY) * 0.28);
    ctx.fillStyle = stripe;
    ctx.fillRect(x0, y - bandH / 2, len, bandH);
    ctx.fillStyle = '#121418';
    const chev = 4;
    for (let i = 0; i < chev; i++) {
      const t0 = i / chev;
      const t1 = (i + 0.45) / chev;
      ctx.beginPath();
      ctx.moveTo(x0 + len * t0, y - bandH / 2);
      ctx.lineTo(x0 + len * t1, y - bandH / 2);
      ctx.lineTo(x0 + len * (t1 - 0.08), y + bandH / 2);
      ctx.lineTo(x0 + len * (t0 - 0.08), y + bandH / 2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === 'military') {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = secondary;
    ctx.fillRect(x0, y - 1.1, len, 2.2);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = stripe;
    ctx.fillRect(x0, y - 0.35, len, 0.7);
  } else if (kind === 'police') {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = stripe;
    ctx.fillRect(x0, y - 1.6, len, 3.2);
    ctx.fillStyle = colors.accent || '#3060c0';
    ctx.fillRect(x0, y - 0.45, len, 0.9);
    // Light pods hint
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = colors.glow || colors.canopy || '#60a0ff';
    ctx.beginPath();
    ctx.ellipse(b.cx - len * 0.18, y, 1.1, 1.4, 0, 0, Math.PI * 2);
    ctx.ellipse(b.cx + len * 0.18, y, 1.1, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'civ') {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = stripe;
    ctx.fillRect(x0, y - 0.75, len, 1.5);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = colors.accent || '#c47840';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  } else if (kind === 'chrome') {
    ctx.globalAlpha = 0.7;
    const g = ctx.createLinearGradient(x0, y, x1, y);
    g.addColorStop(0, 'rgba(255,255,255,0.1)');
    g.addColorStop(0.5, stripe);
    g.addColorStop(1, 'rgba(255,255,255,0.1)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y - 0.45, len, 0.9);
  } else if (kind === 'elite') {
    // Razor accent: thin core + soft fill bloom (no chunky 2px glow stroke)
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = colors.glow || stripe;
    ctx.fillRect(x0, y - 0.85, len, 1.7);
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = stripe;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  } else if (kind === 'racing') {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = stripe;
    ctx.fillRect(x0, y - 1.4, len, 2.8);
    ctx.fillStyle = secondary;
    ctx.fillRect(x0, y - 0.4, len, 0.8);
  }
  ctx.restore();
}

function paintMarks(ctx, b, finish, colors, wear, role) {
  const mark = finish.mark || 'none';
  if (mark === 'none') return;
  ctx.save();

  if (mark === 'stencil') {
    ctx.globalAlpha = 0.35 + (1 - wear) * 0.2;
    ctx.fillStyle = colors.trim || '#a0a8b0';
    const code = role === 'bridge' || role === 'cockpit' ? '01' : role === 'engine' || role === 'aft' ? '03' : '02';
    ctx.font = 'bold 3.2px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, b.cx, b.minY + 2.8);
    // Hash ticks
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = colors.trim || '#888';
    ctx.lineWidth = 0.55;
    for (let i = 0; i < 3; i++) {
      const x = b.cx - 4 + i * 4;
      ctx.beginPath();
      ctx.moveTo(x, b.maxY - 2.2);
      ctx.lineTo(x, b.maxY - 1.1);
      ctx.stroke();
    }
  } else if (mark === 'patches') {
    ctx.globalAlpha = 0.45 + wear * 0.25;
    const patches = [
      [b.cx - 3, b.cy - 2, 2.4, 1.6],
      [b.cx + 2, b.cy + 1.5, 2.8, 1.4],
      [b.cx - 1, b.cy + 3, 1.8, 1.2],
    ];
    for (let i = 0; i < patches.length; i++) {
      const [px, py, w, h] = patches[i];
      ctx.fillStyle = i % 2 === 0 ? colors.secondary || '#5a5048' : shade(colors.hull || '#444', 18);
      ctx.fillRect(px - w / 2, py - h / 2, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 0.45;
      ctx.strokeRect(px - w / 2, py - h / 2, w, h);
    }
    // Tape
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = colors.accent || '#a07040';
    ctx.fillRect(b.cx - 5, b.cy - 0.35, 4.5, 0.7);
  } else if (mark === 'badge') {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = colors.accent || '#c47840';
    ctx.beginPath();
    ctx.arc(b.cx + (b.maxX - b.minX) * 0.22, b.cy - (b.maxY - b.minY) * 0.15, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.trim || '#88a';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  } else if (mark === 'pinstripe') {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = colors.stripe || colors.trim || '#ddd';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(b.minX + 2, b.cy - 2.2);
    ctx.lineTo(b.maxX - 2, b.cy - 2.2);
    ctx.moveTo(b.minX + 2, b.cy + 2.2);
    ctx.lineTo(b.maxX - 2, b.cy + 2.2);
    ctx.stroke();
  } else if (mark === 'lights') {
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = colors.glow || colors.canopy || '#60a0ff';
    const ly = b.minY + 1.6;
    ctx.beginPath();
    ctx.ellipse(b.cx - 3.5, ly, 1.3, 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(b.cx + 3.5, ly, 1.3, 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = colors.accent || '#3060c0';
    ctx.fillRect(b.minX + 2, b.maxY - 2.2, b.maxX - b.minX - 4, 0.85);
  }

  ctx.restore();
}

/**
 * Paint theme skin into a section footprint (already extruded).
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number, number][]} footprint unit-space outline (same coords as extrude)
 * @param {object} pal resolvePalette / paletteForSection result
 * @param {{ role?: string }} [opts]
 */
export function paintSectionSkin(ctx, footprint, pal, opts = {}) {
  if (!footprint?.length || !pal) return;
  const finish = pal.finish || {};
  const colors = pal.colors || {};
  const wear = pal.wear ?? 0.5;
  const role = opts.role || 'body';
  const b = boundsOf(footprint);
  const lift = lastDeckLift();

  ctx.save();
  if (lift.x || lift.y) ctx.translate(lift.x, lift.y);
  clipToFoot(ctx, footprint);

  const matte = finish.matte || 0;
  if (matte > 0.2) {
    ctx.globalAlpha = matte * 0.18;
    ctx.fillStyle = '#000';
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    ctx.globalAlpha = 1;
  }

  paintSeams(ctx, footprint, b, finish.seams ?? 0.5);
  paintWelds(ctx, b, finish.weld ?? 0);
  paintRivets(ctx, footprint, finish.rivets ?? 0.5);
  paintGrit(ctx, b, wear, finish.grit ?? 0.4, colors.dirt);
  paintSoot(ctx, b, role, finish.soot ?? 0, wear);
  paintStripe(ctx, b, finish, colors, role);
  paintMarks(ctx, b, finish, colors, wear, role);
  paintSheen(ctx, footprint, b, finish.sheen ?? 0, finish.gloss ?? 0, colors.trim);

  ctx.restore();
}
