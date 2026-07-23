/**
 * TELEMETRY (nav) + ZOOM (viewport / radar scale) corner readouts.
 */

import { SCANNER } from '../core/Constants.js';
import { formatDistKm } from './ViewportTelemetry.js';

const CARDINAL16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

const FONT = "'Barlow Condensed', 'Segoe UI', sans-serif";
/** Fixed-width digits / punctuation so values do not shift as numerals change. */
const TABULAR_FONT = "'Consolas', 'Cascadia Mono', 'Courier New', monospace";
const TXT = 'rgba(200, 224, 246, 0.9)';
const DIM = 'rgba(150, 178, 202, 0.55)';
const COPPER = 'rgba(230, 171, 109, 0.92)';
const ACCENT = 'rgba(120, 200, 255, 0.95)';
const COPPER_GLOW = 'rgba(224, 164, 104, 0.35)';

/** Math bearing (0=east, canvas) → compass degrees 000–359 (north=0, clockwise). */
export function mathRadToCompassDeg(rad) {
  return ((rad * 180) / Math.PI + 90 + 360) % 360;
}

/** @param {number} compassDeg 0–360 — three digit string (no symbol; drawn by {@link drawHeadingValue}). */
export function formatHeadingDeg(compassDeg) {
  const d = ((compassDeg % 360) + 360) % 360;
  return String(Math.round(d)).padStart(3, '0');
}

/** Display label with degree symbol (non-tabular string contexts). */
export function formatHeadingDegLabel(compassDeg) {
  return `${formatHeadingDeg(compassDeg)}°`;
}

/** @param {number} compassDeg 0–360 */
export function headingToCardinal16(compassDeg) {
  const d = ((compassDeg % 360) + 360) % 360;
  const idx = Math.round(d / 22.5) % 16;
  return CARDINAL16[idx];
}

/** World bearing radians → 16-point compass label (matches TELEMETRY HDG/CRS). */
export function bearingRadToCardinal16(rad) {
  return headingToCardinal16(mathRadToCompassDeg(rad));
}

/** @param {number} rad world bearing radians */
export function bearingRadToHeadingParts(rad) {
  const compassDeg = mathRadToCompassDeg(rad);
  return {
    degStr: formatHeadingDeg(compassDeg),
    cardinal: headingToCardinal16(compassDeg),
  };
}

/**
 * Leading-zero degrees + ° + accent cardinal — fixed two-column layout.
 * Digits stay in a 3-cell tabular column plus a reserved ° cell; cardinals occupy their own slot.
 * @returns {number} total rendered width
 */
export function drawHeadingValue(
  ctx,
  x,
  y,
  degStr,
  cardinal,
  { fs = 10, weight = 600, align = 'left', baseline = 'alphabetic', minX = null } = {},
) {
  let useFs = fs;
  if (minX != null && align === 'right') {
    useFs = fitHeadingPairInZone(ctx, Math.max(0, x - minX), fs, weight);
  }

  const degColW = degreeColumnWidth(ctx, useFs, weight);
  const cardColW = cardinalColumnWidth(ctx, useFs);
  const gap = CARDINAL_SLOT_GAP;
  const pairW = degColW + gap + cardColW;

  const drawColumns = (degRight, cardLeft) => {
    const degMinX = align === 'right' && minX != null ? minX : cardLeft - gap - degColW;

    clipRect(ctx, cardLeft, y - useFs, cardColW, useFs * 2, () => {
      ctx.font = `600 ${useFs}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = baseline;
      ctx.fillStyle = ACCENT;
      ctx.fillText(cardinal, cardLeft + cardColW, y);
    });

    clipRect(ctx, degMinX, y - useFs, degRight - degMinX, useFs * 2, () => {
      drawDegreeColumn(ctx, degStr, degRight, y, useFs, TXT, weight, baseline, degMinX);
    });
  };

  if (align === 'right') {
    const cardLeft = x - cardColW;
    drawColumns(cardLeft - gap, cardLeft);
  } else {
    const degRight = x + degColW;
    drawColumns(degRight, degRight + gap);
  }

  return pairW;
}

/** RNG/BRG-style split row for narrow panels (destination nav column). */
export function drawNavRangeBearingRow(ctx, box, y, rowH, rngKm, bearingRad, { fs = 10, weight = 500 } = {}) {
  const baseline = y + Math.min(fs, rowH - 2);
  const mid = box.x + Math.floor(box.w * 0.5);
  const halfGap = 4;
  const rngBox = { x: box.x, w: mid - halfGap - box.x, right: mid - halfGap };
  const brgBox = { x: mid + halfGap, w: box.x + box.w - mid - halfGap, right: box.x + box.w };

  clipRect(ctx, rngBox.x, y, rngBox.w, rowH, () => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${fs}px ${FONT}`;
    ctx.fillStyle = COPPER;
    ctx.fillText('RNG', rngBox.x, baseline);
    const rngZone = {
      x: rngBox.x + measureCapWidth(ctx, 'RNG', fs) + CAP_GAP,
      w: Math.max(0, rngBox.w - measureCapWidth(ctx, 'RNG', fs) - CAP_GAP),
      right: rngBox.right,
    };
    clipRect(ctx, rngZone.x, y, rngZone.w, rowH, () => {
      const val = `${rngKm} km`;
      const fit = fitTabularInZone(ctx, val, rngZone.w, fs, weight);
      drawTabularTextRight(ctx, fit.text, rngZone.right, baseline, fit.fs, TXT, weight, 'alphabetic', rngZone.x);
    });
  });

  clipRect(ctx, brgBox.x, y, brgBox.w, rowH, () => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${fs}px ${FONT}`;
    ctx.fillStyle = COPPER;
    ctx.fillText('BRG', brgBox.x, baseline);
    const brg = bearingRadToHeadingParts(bearingRad);
    const brgZone = {
      x: brgBox.x + measureCapWidth(ctx, 'BRG', fs) + CAP_GAP,
      w: Math.max(0, brgBox.w - measureCapWidth(ctx, 'BRG', fs) - CAP_GAP),
      right: brgBox.right,
    };
    drawHeadingValue(ctx, brgZone.right, baseline, brg.degStr, brg.cardinal, {
      fs,
      weight,
      align: 'right',
      baseline: 'alphabetic',
      minX: brgZone.x,
    });
  });

  return fs + 4;
}

/** POS readout — tabular cells; no excess padding that overflows narrow panels. */
export function formatPosTabular(x, y) {
  return `${Math.round(x)},${Math.round(y)}`;
}

const POS_STRIP_FIELD = 6;
const SPD_STRIP_FIELD = 4;
const STRIP_COL_GAP = 10;

function posStripField(n, width) {
  const s = String(Math.round(n));
  return s.length >= width ? s.slice(-width) : s.padStart(width, ' ');
}

/** Fixed-width POS column for sector map telemetry strip. */
export function formatPosStripCol(x, y) {
  return `${posStripField(x, POS_STRIP_FIELD)},${posStripField(y, POS_STRIP_FIELD)}`;
}

function drawTabularColumn(ctx, minX, colW, y, text, fs, color, weight, baseline = 'alphabetic') {
  clipRect(ctx, minX, y - fs, colW, fs * 2, () => {
    drawTabularTextLeft(ctx, text, minX, y, fs, color, weight, baseline);
  });
}

/**
 * Sector map header strip — fixed columns: POS | SPD | CRS | optional hover POS.
 * Columns keep their slots as values change (tabular digits + reserved heading pair).
 */
export function drawSectorMapTelemetry(ctx, x, y, engine, view, { fs = 11, color = DIM } = {}) {
  const ship = engine.ship;
  if (!ship) return;

  const baseline = y + 10;
  const weight = 600;
  let colX = x;

  const posTemplate = `${'0'.repeat(POS_STRIP_FIELD)},${'0'.repeat(POS_STRIP_FIELD)}`;
  const posColW = tabularTextWidth(ctx, posTemplate, fs, weight);
  drawTabularColumn(
    ctx,
    colX,
    posColW,
    baseline,
    formatPosStripCol(ship.position.x, ship.position.y),
    fs,
    color,
    weight,
  );
  colX += posColW + STRIP_COL_GAP;

  const spdColW = tabularTextWidth(ctx, '0'.repeat(SPD_STRIP_FIELD), fs, weight);
  const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  drawTabularColumn(
    ctx,
    colX,
    spdColW,
    baseline,
    String(Math.round(speed)).padStart(SPD_STRIP_FIELD, ' '),
    fs,
    color,
    weight,
  );
  colX += spdColW + STRIP_COL_GAP;

  const hdgColW = headingPairWidth(ctx, fs, weight);
  if (speed >= 1) {
    const course = bearingRadToHeadingParts(Math.atan2(ship.velocity.y, ship.velocity.x));
    drawHeadingValue(ctx, colX + hdgColW, baseline, course.degStr, course.cardinal, {
      fs,
      weight,
      align: 'right',
      minX: colX,
    });
  } else {
    clipRect(ctx, colX, baseline - fs, hdgColW, fs * 2, () => {
      ctx.font = `600 ${fs}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = color;
      ctx.fillText('—', colX, baseline);
    });
  }
  colX += hdgColW;

  if (view.hoverWorld) {
    colX += STRIP_COL_GAP;
    drawTabularColumn(
      ctx,
      colX,
      posColW,
      baseline,
      formatPosStripCol(view.hoverWorld.x, view.hoverWorld.y),
      fs,
      color,
      weight,
    );
  }
}

const CAP_GAP = 4;
const DEGREE_SYMBOL = '°';
/** Tabular digit count (000–359) — symbol is a separate reserved cell. */
const DEG_DIGIT_CHARS = 3;
/** Gap between degree column and reserved cardinal column. */
const CARDINAL_SLOT_GAP = 4;

function degreeDigitsOnly(degStr) {
  const s = String(degStr).replace(/\s/g, '').replace(/°+$/, '');
  return s.padStart(DEG_DIGIT_CHARS, '0').slice(-DEG_DIGIT_CHARS);
}

function degreeSymbolWidth(ctx, fs, weight = 600) {
  ctx.font = tabularFont(fs, weight);
  return ctx.measureText(DEGREE_SYMBOL).width;
}

function degreeColumnWidth(ctx, fs, weight = 600) {
  return tabularTextWidth(ctx, '0'.repeat(DEG_DIGIT_CHARS), fs, weight) + degreeSymbolWidth(ctx, fs, weight);
}

/** 3 tabular digits + ° — clipped to [minX, columnRight]. */
function drawDegreeColumn(ctx, degStr, columnRight, y, fs, color, weight, baseline, minX) {
  const digits = degreeDigitsOnly(degStr);
  const symW = degreeSymbolWidth(ctx, fs, weight);
  const digitsRight = columnRight - symW;
  drawTabularTextRight(ctx, digits, digitsRight, y, fs, color, weight, baseline, minX);
  ctx.font = tabularFont(fs, weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  if (minX == null || columnRight - symW >= minX) {
    ctx.fillText(DEGREE_SYMBOL, digitsRight, y);
  }
}

/** Fixed slot for longest 16-point label (WNW, NNW, …). */
function cardinalColumnWidth(ctx, fs) {
  ctx.font = `600 ${fs}px ${FONT}`;
  let maxW = 0;
  for (const c of CARDINAL16) {
    maxW = Math.max(maxW, ctx.measureText(c).width);
  }
  return maxW;
}

function headingPairWidth(ctx, fs, weight = 600) {
  return degreeColumnWidth(ctx, fs, weight) + CARDINAL_SLOT_GAP + cardinalColumnWidth(ctx, fs);
}

function fitHeadingPairInZone(ctx, zoneW, preferFs, weight, minFs = 8) {
  for (let fs = preferFs; fs >= minFs; fs--) {
    if (headingPairWidth(ctx, fs, weight) <= zoneW) return fs;
  }
  return minFs;
}

function measureCapWidth(ctx, cap, fs) {
  ctx.font = `700 ${fs}px ${FONT}`;
  return ctx.measureText(cap).width;
}

/** Value column to the right of a copper cap — labels never overlap values. */
function valueZone(ctx, box, cap, fs) {
  const capW = measureCapWidth(ctx, cap, fs) + CAP_GAP;
  return {
    x: box.x + capW,
    w: Math.max(0, box.w - capW),
    right: box.x + box.w,
  };
}

function clipRect(ctx, x, y, w, h, fn) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  fn();
  ctx.restore();
}

function fitTabularInZone(ctx, text, zoneW, preferFs, weight, minFs = 8) {
  let t = text;
  for (let fs = preferFs; fs >= minFs; fs--) {
    if (tabularTextWidth(ctx, t, fs, weight) <= zoneW) return { text: t, fs };
  }
  let fs = minFs;
  while (t.length > 1 && tabularTextWidth(ctx, `…${t.slice(1)}`, fs, weight) > zoneW) {
    t = t.slice(1);
  }
  if (t.length > 1) t = `…${t.slice(1)}`;
  return { text: t, fs };
}

function fitProportionalInZone(ctx, text, zoneW, preferFs, weight, minFs = 8) {
  let t = text;
  for (let fs = preferFs; fs >= minFs; fs--) {
    ctx.font = `${weight} ${fs}px ${FONT}`;
    if (ctx.measureText(t).width <= zoneW) return { text: t, fs };
  }
  let fs = minFs;
  ctx.font = `${weight} ${fs}px ${FONT}`;
  while (t.length > 1 && ctx.measureText(`…${t.slice(1)}`).width > zoneW) {
    t = t.slice(1);
  }
  if (t.length > 1) t = `…${t.slice(1)}`;
  return { text: t, fs };
}

function tabularFont(fs, weight = 600) {
  return `${weight} ${fs}px ${TABULAR_FONT}`;
}

function tabularCellWidth(ctx, fs, weight = 600) {
  ctx.font = tabularFont(fs, weight);
  return ctx.measureText('0').width;
}

function tabularTextWidth(ctx, text, fs, weight = 600) {
  return text.length * tabularCellWidth(ctx, fs, weight);
}

function drawTabularTextRight(ctx, text, rightX, y, fs, color, weight = 600, baseline = 'alphabetic', minX = null) {
  const cellW = tabularCellWidth(ctx, fs, weight);
  ctx.font = tabularFont(fs, weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  let x = rightX - text.length * cellW;
  if (minX != null && x < minX) x = minX;
  for (const ch of text) {
    if (minX != null && x + cellW <= minX) {
      x += cellW;
      continue;
    }
    if (x >= rightX) break;
    ctx.fillText(ch, x, y);
    x += cellW;
  }
}

function drawTabularTextLeft(ctx, text, x, y, fs, color, weight = 600, baseline = 'alphabetic') {
  const cellW = tabularCellWidth(ctx, fs, weight);
  ctx.font = tabularFont(fs, weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += cellW;
  }
}

/** @param {import('../core/GameEngine.js').GameEngine} engine */
export function buildNavTelemetry(engine) {
  const ship = engine.ship;
  if (!ship) return null;

  const vx = ship.velocity?.x ?? 0;
  const vy = ship.velocity?.y ?? 0;
  const speed = Math.hypot(vx, vy);
  const headingDeg = mathRadToCompassDeg(ship.angle || 0);

  let courseDeg = null;
  let courseCardinal = null;
  if (speed > 0) {
    courseDeg = mathRadToCompassDeg(Math.atan2(vy, vx));
    courseCardinal = headingToCardinal16(courseDeg);
  }

  return {
    speed: Math.round(speed),
    headingDeg,
    headingStr: formatHeadingDeg(headingDeg),
    headingCardinal: headingToCardinal16(headingDeg),
    courseDeg,
    courseStr: courseDeg != null ? formatHeadingDeg(courseDeg) : null,
    courseCardinal,
    posX: Math.round(ship.position.x),
    posY: Math.round(ship.position.y),
  };
}

/** @param {import('../core/GameEngine.js').GameEngine} engine */
export function buildZoomRadarTelemetry(engine) {
  const cam = engine.camera;
  const r = engine.renderer;
  if (!cam || !r) return null;

  const kmScale = SCANNER.KM_SCALE || 100;
  const zoomPct = Math.round(cam.displayZoom() * 100);
  const viewWorld = r.viewportRadius / Math.max(0.001, cam.effectiveZoom);
  const viewKm = viewWorld / kmScale;

  const scan = engine.scannerSystem;
  const scannerOn = !!scan?.on;
  const effectiveTier = scannerOn ? (scan.tier | 0) : 0;
  const plotTier = scannerOn && effectiveTier > 0 ? Math.max(1, scan.plotZoom | 0) : 0;
  const rangeScale = scan?.rangeScale || 1;
  const tierCount = SCANNER.TIERS.length - 1;
  /** @type {Array<{ km: number, tier: number, state: 'locked'|'unlocked'|'active' }>} */
  const rings = [];

  for (let i = 1; i <= tierCount; i++) {
    const worldR = scan?.tierWorldRange
      ? scan.tierWorldRange(i)
      : (SCANNER.TIERS[i]?.range || 0) * rangeScale;
    const km = Math.round(worldR / kmScale);
    let state = 'locked';
    if (effectiveTier >= i) {
      state = i === plotTier ? 'active' : 'unlocked';
    }
    rings.push({ km, tier: i, state });
  }

  const activeRing = rings.find((r) => r.state === 'active');

  return {
    zoomPct,
    viewKm,
    viewKmLabel: formatDistKm(viewWorld, kmScale),
    scannerOn,
    rings,
    activeKm: activeRing?.km ?? null,
    effectiveTier,
  };
}

/** Live readout inset below baked corner title (ZOOM, TELEMETRY, etc.). */
function cornerLiveContentBox(screen) {
  const pad = Math.max(2, Math.min(screen.w, screen.h) * 0.04);
  const titleBand = Math.max(14, screen.h * 0.18);
  return {
    x: screen.x + pad,
    y: screen.y + titleBand,
    w: screen.w - pad * 2,
    h: screen.h - titleBand - pad,
  };
}

/** Row height + font size scaled to fill a corner content band. */
function cornerRowMetrics(bandH, rowCount, { gapFrac = 0.04, divSlot = 0 } = {}) {
  const rowGap = Math.max(2, Math.floor(bandH * gapFrac));
  const slots = rowGap * Math.max(0, rowCount - 1) + divSlot;
  const rowH = Math.max(16, (bandH - slots) / Math.max(1, rowCount));
  const fs = Math.max(11, Math.min(15, rowH - 2));
  return { rowGap, rowH, fs };
}

/** ZOOM corner — same live inset as other corners. */
function zoomCornerContentBox(screen) {
  return cornerLiveContentBox(screen);
}

function drawLabelValueRow(ctx, box, y, rowH, cap, value, { valueColor = TXT, fs: fsIn, tabular = true } = {}) {
  const fs = fsIn ?? Math.max(8, Math.min(10, rowH - 2));
  const midY = y + rowH / 2;
  ctx.font = `700 ${fs}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COPPER;
  ctx.fillText(cap, box.x, midY);

  const zone = valueZone(ctx, box, cap, fs);
  clipRect(ctx, zone.x, y, zone.w, rowH, () => {
    if (tabular) {
      const fit = fitTabularInZone(ctx, value, zone.w, fs, 600);
      drawTabularTextRight(ctx, fit.text, zone.right, midY, fit.fs, valueColor, 600, 'middle', zone.x);
    } else {
      const fit = fitProportionalInZone(ctx, value, zone.w, fs, 600);
      ctx.textAlign = 'right';
      ctx.fillStyle = valueColor;
      ctx.font = `600 ${fit.fs}px ${FONT}`;
      ctx.fillText(fit.text, zone.right, midY);
    }
  });
}

/** HDG/CRS: degrees + accent cardinal — value clipped to column right of cap. */
function drawHeadingRow(ctx, box, y, rowH, cap, degStr, cardinal, { fs: fsIn } = {}) {
  const fs = fsIn ?? Math.max(8, Math.min(10, rowH - 2));
  const midY = y + rowH / 2;
  ctx.font = `700 ${fs}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COPPER;
  ctx.fillText(cap, box.x, midY);

  const zone = valueZone(ctx, box, cap, fs);
  drawHeadingValue(ctx, zone.right, midY, degStr, cardinal, {
    fs,
    weight: 600,
    align: 'right',
    baseline: 'middle',
    minX: zone.x,
  });
}

function drawDivider(ctx, box, y) {
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(box.x + 2, y);
  ctx.lineTo(box.x + box.w - 2, y);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} screen
 * @param {ReturnType<typeof buildNavTelemetry>} data
 */
export function drawNavCorner(ctx, screen, data) {
  if (!screen || !data) return;
  const box = cornerLiveContentBox(screen);
  clipRect(ctx, box.x, box.y, box.w, box.h, () => {
    const navRows = data.courseStr ? 3 : 2;
    const divH = 2;
    const divGap = 2;
    const divSlot = divH + divGap;
    const rowCount = navRows + 1;
    const { rowGap, rowH, fs } = cornerRowMetrics(box.h, rowCount, { divSlot });
    let y = box.y;

    drawLabelValueRow(ctx, box, y, rowH, 'SPD', String(data.speed).padStart(4, ' '), { fs });
    y += rowH + rowGap;

    drawHeadingRow(ctx, box, y, rowH, 'HDG', data.headingStr, data.headingCardinal, { fs });
    y += rowH + rowGap;

    if (data.courseStr) {
      drawHeadingRow(ctx, box, y, rowH, 'CRS', data.courseStr, data.courseCardinal, { fs });
      y += rowH + rowGap;
    }

    drawDivider(ctx, box, y + divH / 2);
    y += divSlot;

    drawLabelValueRow(ctx, box, y, rowH, 'POS', formatPosTabular(data.posX, data.posY), { fs });
  });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} screen
 * @param {ReturnType<typeof buildZoomRadarTelemetry>} data
 */
export function drawZoomCorner(ctx, screen, data) {
  if (!screen || !data) return;
  const box = zoomCornerContentBox(screen);
  const divH = 2;
  const sectionGap = 3;
  const midY = box.y + Math.floor(box.h * 0.52);

  const zoomBox = {
    x: box.x,
    y: box.y,
    w: box.w,
    h: midY - box.y - sectionGap,
  };
  const radarBox = {
    x: box.x,
    y: midY + divH + sectionGap,
    w: box.w,
    h: box.y + box.h - midY - divH - sectionGap,
  };

  clipRect(ctx, zoomBox.x, zoomBox.y, zoomBox.w, zoomBox.h, () => {
    const { rowGap, rowH, fs: rowFs } = cornerRowMetrics(zoomBox.h, 2, { gapFrac: 0.08 });
    let y = zoomBox.y;
    drawLabelValueRow(ctx, zoomBox, y, rowH, 'ZOOM', `${String(data.zoomPct).padStart(3, ' ')}%`, { fs: rowFs });
    y += rowH + rowGap;
    drawLabelValueRow(ctx, zoomBox, y, rowH, 'VIEW', data.viewKmLabel, { fs: rowFs, tabular: false });
  });

  drawDivider(ctx, box, midY);
  clipRect(ctx, radarBox.x, radarBox.y, radarBox.w, radarBox.h, () => {
    drawRadarSection(ctx, radarBox, data);
  });
}

/** @param {Array<{ km: number, state: string }>} rings */
function measureRadarRowWidth(ctx, rings, tokenFs) {
  const sep = ' · ';
  let w = 0;
  for (let i = 0; i < rings.length; i++) {
    if (i > 0) {
      ctx.font = `600 ${tokenFs}px ${FONT}`;
      w += ctx.measureText(sep).width;
    }
    const weight = rings[i].state === 'active' ? 700 : 600;
    ctx.font = `${weight} ${tokenFs}px ${FONT}`;
    w += ctx.measureText(String(rings[i].km)).width;
  }
  ctx.font = `600 ${Math.max(9, tokenFs - 1)}px ${FONT}`;
  w += ctx.measureText(' km').width;
  return w;
}

/** @param {Array<{ km: number, state: string }>} rings */
function fitRadarTokenFs(ctx, rings, maxW, preferFs = 12) {
  for (let fs = preferFs; fs >= 8; fs--) {
    if (measureRadarRowWidth(ctx, rings, fs) <= maxW) return fs;
  }
  return 8;
}

/** Centered pip row — all tiers shown; locked gray, unlocked light blue, active bold. */
function drawRadarRingRowCentered(ctx, box, y, lineH, rings, tokenFs) {
  const sep = ' · ';
  const kmSuffix = ' km';
  const totalW = measureRadarRowWidth(ctx, rings, tokenFs);
  let tx = box.x + (box.w - totalW) / 2;
  const midY = y + lineH / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (i > 0) {
      ctx.font = `600 ${tokenFs}px ${FONT}`;
      ctx.fillStyle = 'rgba(120, 200, 255, 0.25)';
      ctx.fillText(sep, tx, midY);
      tx += ctx.measureText(sep).width;
    }
    const bold = ring.state === 'active';
    ctx.font = `${bold ? 700 : 600} ${tokenFs}px ${FONT}`;
    if (ring.state === 'locked') {
      ctx.fillStyle = DIM;
      ctx.globalAlpha = 0.55;
    } else {
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = ring.state === 'active' ? 1 : 0.82;
    }
    ctx.fillText(String(ring.km), tx, midY);
    ctx.globalAlpha = 1;
    tx += ctx.measureText(String(ring.km)).width;
  }

  ctx.font = `600 ${Math.max(9, tokenFs - 1)}px ${FONT}`;
  ctx.fillStyle = DIM;
  ctx.globalAlpha = 0.7;
  ctx.fillText(kmSuffix, tx, midY);
  ctx.globalAlpha = 1;
}

/** Match baked corner chrome titles (`CockpitFrame._panelScreen`). */
function drawCornerPanelTitle(ctx, box, title, yOffset = 5) {
  let fs = Math.max(10, Math.min(14, box.w * (title.length > 12 ? 0.07 : 0.085)));
  ctx.font = `600 ${fs}px ${FONT}`;
  let tw = ctx.measureText(title).width;
  const maxW = box.w - 12;
  if (tw > maxW) {
    fs = Math.max(9, fs * (maxW / tw));
    ctx.font = `600 ${fs}px ${FONT}`;
    tw = ctx.measureText(title).width;
  }
  ctx.fillStyle = COPPER;
  ctx.shadowColor = COPPER_GLOW;
  ctx.shadowBlur = 3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, box.x + box.w / 2, box.y + yOffset);
  ctx.shadowBlur = 0;
  return yOffset + fs + 3;
}

function drawRadarSection(ctx, box, data) {
  const titleRowH = drawCornerPanelTitle(ctx, box, 'RADAR', 2);
  const ringsBox = {
    x: box.x,
    y: box.y + titleRowH + 1,
    w: box.w,
    h: Math.max(10, box.h - titleRowH - 2),
  };

  const rings = data.rings?.length ? data.rings : [];
  if (!rings.length) return;

  const preferFs = Math.max(11, Math.min(15, Math.floor(ringsBox.h * 0.45)));
  const tokenFs = fitRadarTokenFs(ctx, rings, ringsBox.w, preferFs);
  const ringLineH = Math.max(tokenFs + 6, ringsBox.h * 0.55);
  const y = ringsBox.y + Math.max(0, (ringsBox.h - ringLineH) / 2);
  clipRect(ctx, ringsBox.x, ringsBox.y, ringsBox.w, ringsBox.h, () => {
    drawRadarRingRowCentered(ctx, ringsBox, y, ringLineH, rings, tokenFs);
  });
}
