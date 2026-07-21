/**
 * Hangar pad status board — service checklist column (row layout, scroll, draw).
 * Fixed board face height; checklist scrolls inside the service column.
 */

import { clamp } from '../utils/MathUtils.js';

/** Compact labels (colon added when drawn). Widest locks the pip column. */
export const SERVICE_BOARD_LABELS = {
  repair: 'Hull',
  refuel: 'Fuel',
  reloadBullets: 'Bullet',
  reloadShells: 'Shells',
  upgrade: 'Install',
  loadCargo: 'Load',
  unloadCargo: 'Unload',
};

export const SERVICE_BOARD_LABEL_WIDEST = 'Install:';
/** Labeled row — max 5 pips in the job’s primary grid band. */
export const SERVICE_BOARD_PIPS_PER_ROW = 5;
/** Shared pip grid width (labeled row uses the rightmost 5 slots; continuation up to 9). */
export const SERVICE_BOARD_GRID_SLOTS = 9;
/** Label-less overflow rows — up to 9 pips per continuation row. */
export const SERVICE_BOARD_CONTINUATION_PIPS = 9;
/** Gap after the row's own `Label:` before continuation pips (bulleted-list tab). */
export const SERVICE_BOARD_LABEL_TAB = 1.1;
export const SERVICE_BOARD_FACE_H = 48;
export const SERVICE_BOARD_ROW_PITCH = 4.5;
export const SERVICE_BOARD_FOOTER_H = 7;
export const SERVICE_BOARD_FACE_PAD = 3;
export const SERVICE_BOARD_ROW0_DY = 11;
export const SERVICE_BOARD_HEADER_H = 8;
export const SERVICE_BOARD_SCROLLBAR_W = 3;
export const SERVICE_BOARD_USER_OVERRIDE_SEC = 4;
export const SERVICE_BOARD_SCROLL_LERP = 10;

const CIRC_R = 1.2;
const CIRC_GAP = 2.85;
const CHECK_W = 3.2;
const ROW_FONT = '3px monospace';

export const SERVICE_BOARD_COLORS = {
  green: '#3ce070',
  blue: '#4aa8ff',
  yellow: '#e8c040',
  red: '#ff5048',
  grey: '#8a9098',
  dim: '#6a7888',
  white: '#d0dce8',
};

/**
 * @typedef {{ color: string, status?: string, serviceItemId?: number, targetHardpointKey?: string|null, pipSlot: number }} ServiceBoardUnit
 * @typedef {{ label: string, type?: string, units: ServiceBoardUnit[], complete?: boolean, showLabel?: boolean, color?: string, status?: string }} ServiceBoardRow
 */

/** Fixed grid slot for one pip in its job layout (stable across reveal and color changes). */
export function pipSlotForJobIndex(globalIndex, totalInType) {
  if (globalIndex < SERVICE_BOARD_PIPS_PER_ROW) {
    const chunkTotal = Math.min(SERVICE_BOARD_PIPS_PER_ROW, totalInType);
    const rowStart =
      SERVICE_BOARD_GRID_SLOTS -
      SERVICE_BOARD_PIPS_PER_ROW +
      (SERVICE_BOARD_PIPS_PER_ROW - chunkTotal);
    return rowStart + globalIndex;
  }
  const contGlobal = globalIndex - SERVICE_BOARD_PIPS_PER_ROW;
  const contRowStart =
    Math.floor(contGlobal / SERVICE_BOARD_CONTINUATION_PIPS) *
    SERVICE_BOARD_CONTINUATION_PIPS;
  const remaining = totalInType - SERVICE_BOARD_PIPS_PER_ROW - contRowStart;
  const chunkTotal = Math.min(SERVICE_BOARD_CONTINUATION_PIPS, remaining);
  const gridStart = SERVICE_BOARD_CONTINUATION_PIPS - chunkTotal;
  const localIndex = contGlobal - contRowStart;
  return gridStart + localIndex;
}

/**
 * Fixed board geometry at a northern lip Y.
 * @param {number} topY
 */
export function serviceBoardFixedMetrics(topY) {
  const wallH = SERVICE_BOARD_FACE_H;
  const bottom = topY + wallH;
  const bodyTop = topY + SERVICE_BOARD_FACE_PAD;
  const bodyBot = bottom - SERVICE_BOARD_FOOTER_H - 2;
  const bodyH = bodyBot - bodyTop;
  const listTop = bodyTop + SERVICE_BOARD_HEADER_H;
  const listH = Math.max(4, bodyBot - listTop);
  const visibleRowSlots = Math.max(
    1,
    Math.floor(listH / SERVICE_BOARD_ROW_PITCH)
  );
  return {
    top: topY,
    bottom,
    wallH,
    bodyTop,
    bodyBot,
    bodyH,
    listTop,
    listH,
    visibleRowSlots,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} colX
 */
export function servicePipLayout(ctx, colX) {
  ctx.font = ROW_FONT;
  const labelColW = ctx.measureText(SERVICE_BOARD_LABEL_WIDEST).width;
  const nameX = colX + CHECK_W;
  /** Grid slot 0 for the primary row's first pip — locked to widest label (`Install:`). */
  const circStart = nameX + labelColW + SERVICE_BOARD_LABEL_TAB;
  const primaryGridStart = SERVICE_BOARD_GRID_SLOTS - SERVICE_BOARD_PIPS_PER_ROW;
  const gridOrigin = circStart - primaryGridStart * CIRC_GAP;
  const gridSlotX = (slot) => gridOrigin + CIRC_R + slot * CIRC_GAP;
  return { circStart, nameX, labelColW, gridSlotX, primaryGridStart };
}

/**
 * @param {ServiceBoardRow[]} rows
 */
export function sortServiceDisplayRows(rows) {
  if (!rows?.length || rows[0]?.label === 'STANDBY') return rows;
  const complete = [];
  const pending = [];
  for (const r of rows) {
    (r.complete ? complete : pending).push(r);
  }
  return [...complete, ...pending];
}

/**
 * Build service-column rows — max 5 pips on the labeled row; overflow on label-less
 * continuation rows (up to 9). Each pip keeps a fixed slot in its job grid layout.
 * @param {Array<{ id: number, type: string, status?: string, targetHardpointKey?: string }>} items
 * @param {{ shownIds?: Set<number>|null, unitColorOf: (item: object) => string }} opts
 * @returns {ServiceBoardRow[]}
 */
export function buildServiceBoardRows(items, opts) {
  const { shownIds = null, unitColorOf } = opts;
  if (!items?.length) {
    return [{ label: 'STANDBY', color: 'dim', status: 'idle', units: [], complete: false, showLabel: true }];
  }

  const labelOf = (it) =>
    SERVICE_BOARD_LABELS[it.type] || String(it.type || '?').slice(0, 7);

  const order = [];
  /** @type {Map<string, { type: string, label: string, items: typeof items }>} */
  const byType = new Map();

  for (const it of items) {
    if (it.type === 'elevatorTransfer') continue;
    if (!byType.has(it.type)) {
      byType.set(it.type, { type: it.type, label: labelOf(it), items: [] });
      order.push(it.type);
    }
    byType.get(it.type).items.push(it);
  }

  /** @type {ServiceBoardRow[]} */
  const rows = [];
  for (const type of order) {
    const group = byType.get(type);
    const allItems = group.items;
    const totalInType = allItems.length;
    const typeComplete =
      totalInType > 0 &&
      allItems.every((it) => unitColorOf(it) === 'green');
    let gi = 0;
    while (gi < totalInType) {
      const maxChunk =
        gi === 0 ? SERVICE_BOARD_PIPS_PER_ROW : SERVICE_BOARD_CONTINUATION_PIPS;
      const chunkEnd = Math.min(gi + maxChunk, totalInType);
      /** @type {ServiceBoardUnit[]} */
      const units = [];
      for (let j = gi; j < chunkEnd; j++) {
        const it = allItems[j];
        if (shownIds && !shownIds.has(it.id)) continue;
        units.push({
          color: unitColorOf(it),
          status: it.status,
          serviceItemId: it.id,
          targetHardpointKey: it.targetHardpointKey || null,
          pipSlot: pipSlotForJobIndex(j, totalInType),
        });
      }
      if (units.length > 0) {
        rows.push({
          label: group.label,
          type: group.type,
          units,
          complete: typeComplete,
          showLabel: gi === 0,
          color: typeComplete ? 'green' : 'white',
          status: typeComplete ? 'done' : 'pending',
        });
      }
      gi = chunkEnd;
    }
  }

  if (!rows.length) {
    return [{ label: 'STANDBY', color: 'dim', status: 'idle', units: [], complete: false, showLabel: true }];
  }
  return rows;
}

export function createServiceScrollState() {
  return { offset: 0, userUntil: 0, drag: null };
}

/**
 * Auto-scroll target: pinned to top until any job completes; once completed rows
 * rise to the top, scroll at least past the first finished job, then pick the
 * highest offset that shows the most pending rows.
 * @param {ServiceBoardRow[]} rows
 * @param {number} visibleRowSlots
 */
export function serviceScrollTarget(rows, visibleRowSlots) {
  if (!rows?.length || rows[0]?.label === 'STANDBY') return 0;
  const maxOffset = Math.max(0, rows.length - visibleRowSlots);
  if (maxOffset === 0) return 0;

  const hasComplete = rows.some((r) => r.complete);
  const hasIncomplete = rows.some((r) => !r.complete);
  if (!hasComplete || !hasIncomplete) return 0;

  /** Scroll past the first completed job block once it sits at the top. */
  let minOffset = 0;
  if (rows[0].complete) {
    const firstType = rows[0].type;
    while (
      minOffset < rows.length &&
      rows[minOffset].complete &&
      rows[minOffset].type === firstType
    ) {
      minOffset++;
    }
  }

  let bestOffset = minOffset;
  let bestIncomplete = -1;
  for (let offset = minOffset; offset <= maxOffset; offset++) {
    let incomplete = 0;
    const end = Math.min(offset + visibleRowSlots, rows.length);
    for (let i = offset; i < end; i++) {
      if (!rows[i].complete) incomplete++;
    }
    if (incomplete > bestIncomplete || (incomplete === bestIncomplete && offset < bestOffset)) {
      bestIncomplete = incomplete;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

/**
 * @param {{ offset: number, userUntil: number, drag?: object|null }} state
 * @param {ServiceBoardRow[]} rows
 * @param {number} visibleRowSlots
 * @param {number} time
 * @param {number} dt
 */
export function tickServiceBoardScroll(state, rows, visibleRowSlots, time, dt) {
  if (state.drag) return;
  const maxOffset = Math.max(0, rows.length - visibleRowSlots);
  let target;
  if (time < state.userUntil) {
    target = clamp(state.offset, 0, maxOffset);
  } else {
    target = serviceScrollTarget(rows, visibleRowSlots);
  }
  if (Math.abs(state.offset - target) < 0.02) {
    state.offset = target;
    return;
  }
  const step = SERVICE_BOARD_SCROLL_LERP * dt;
  const delta = target - state.offset;
  state.offset += Math.sign(delta) * Math.min(step, Math.abs(delta));
  state.offset = clamp(state.offset, 0, maxOffset);
}

/**
 * @param {{ offset: number, userUntil: number }} state
 * @param {number} deltaRows
 * @param {number} time
 * @param {number} maxOffset
 */
export function applyServiceScrollWheel(state, deltaRows, time, maxOffset) {
  state.offset = clamp(state.offset + deltaRows, 0, maxOffset);
  state.userUntil = time + SERVICE_BOARD_USER_OVERRIDE_SEC;
}

export function notifyServiceScrollUser(state, time) {
  state.userUntil = time + SERVICE_BOARD_USER_OVERRIDE_SEC;
}

/**
 * @param {number} colX
 * @param {number} colW
 * @param {ReturnType<typeof serviceBoardFixedMetrics>} metrics
 * @param {ServiceBoardRow[]} rows
 * @param {number} offset
 */
export function serviceScrollbarMetrics(colX, colW, metrics, rows, offset) {
  const { listTop, listH, visibleRowSlots } = metrics;
  const trackX = colX + colW - SERVICE_BOARD_SCROLLBAR_W;
  const totalRows = Math.max(1, rows.length);
  const maxOffset = Math.max(0, rows.length - visibleRowSlots);
  const trackH = listH;
  const thumbH =
    maxOffset <= 0 || rows[0]?.label === 'STANDBY'
      ? trackH
      : Math.max(2, (visibleRowSlots / totalRows) * trackH);
  const thumbTravel = Math.max(0, trackH - thumbH);
  const thumbY =
    maxOffset <= 0 ? listTop : listTop + (offset / maxOffset) * thumbTravel;
  return {
    trackX,
    trackY: listTop,
    trackW: SERVICE_BOARD_SCROLLBAR_W,
    trackH,
    thumbX: trackX,
    thumbY,
    thumbW: SERVICE_BOARD_SCROLLBAR_W,
    thumbH,
    maxOffset,
  };
}

export function hitServiceColumn(wx, wy, colX, colW, listTop, listH) {
  return (
    wx >= colX &&
    wx <= colX + colW &&
    wy >= listTop &&
    wy <= listTop + listH
  );
}

export function hitServiceScrollbar(wx, wy, sb) {
  return (
    wx >= sb.trackX &&
    wx <= sb.trackX + sb.trackW &&
    wy >= sb.trackY &&
    wy <= sb.trackY + sb.trackH
  );
}

export function hitServiceScrollbarThumb(wx, wy, sb) {
  return (
    wx >= sb.thumbX &&
    wx <= sb.thumbX + sb.thumbW &&
    wy >= sb.thumbY &&
    wy <= sb.thumbY + sb.thumbH
  );
}

/** Map pointer Y to scroll offset (thumb top-aligned). */
export function offsetFromScrollbarY(wy, sb) {
  if (sb.maxOffset <= 0) return 0;
  const t = clamp((wy - sb.trackY) / Math.max(1, sb.trackH - sb.thumbH), 0, 1);
  return t * sb.maxOffset;
}

function drawRowPips(ctx, row, ty, layout, colorMap) {
  const cy = ty - 1.0;
  for (let i = 0; i < row.units.length; i++) {
    const u = row.units[i];
    const cxDot = layout.gridSlotX(u.pipSlot);
    ctx.fillStyle = colorMap[u.color] || colorMap.dim;
    ctx.beginPath();
    ctx.arc(cxDot, cy, CIRC_R, 0, Math.PI * 2);
    ctx.fill();
    if (u.color === 'grey' || u.color === 'yellow') {
      ctx.strokeStyle = 'rgba(180, 200, 220, 0.35)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} colX
 * @param {number} colW
 * @param {ReturnType<typeof serviceBoardFixedMetrics>} metrics
 * @param {ServiceBoardRow[]} rows
 * @param {{ headerLight: string, headerFlash?: number, colorMap?: Record<string, string>, scroll?: { offset: number } }} opts
 */
export function drawServiceChecklistColumn(ctx, colX, colW, metrics, rows, opts) {
  const colorMap = opts.colorMap || SERVICE_BOARD_COLORS;
  const { bodyTop, listTop, listH, visibleRowSlots } = metrics;
  const offset = opts.scroll?.offset ?? 0;
  const hl = opts.headerLight;

  let hc = '80,90,100';
  let hg = 0.15;
  if (hl === 'yellow') {
    hc = '232,192,64';
    hg = 0.7;
  } else if (hl === 'green') {
    hc = '60,224,112';
    hg = 0.75;
  } else if (hl === 'redFlash') {
    hc = '255,60,50';
    hg = opts.headerFlash != null ? opts.headerFlash : 0.9;
  }

  ctx.fillStyle = `rgba(${hc}, ${hg})`;
  ctx.beginPath();
  ctx.arc(colX + 4, bodyTop + 3.5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colorMap.white;
  ctx.font = '3.2px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Service', colX + 8, bodyTop + 4.5);

  const layout = servicePipLayout(ctx, colX);
  const sb = serviceScrollbarMetrics(colX, colW, metrics, rows, offset);

  ctx.save();
  ctx.beginPath();
  ctx.rect(colX, listTop, colW - SERVICE_BOARD_SCROLLBAR_W - 0.5, listH);
  ctx.clip();

  rows.forEach((row, ri) => {
    const slot = ri - offset;
    if (slot < -0.5 || slot > visibleRowSlots) return;
    const ty = listTop + SERVICE_BOARD_ROW0_DY - SERVICE_BOARD_HEADER_H + slot * SERVICE_BOARD_ROW_PITCH;
    ctx.font = ROW_FONT;
    ctx.textAlign = 'left';

    if (!row.units?.length) {
      ctx.fillStyle = colorMap[row.color] || colorMap.dim;
      ctx.fillText(row.label, colX + 1, ty);
      return;
    }

    if (row.complete && row.showLabel !== false) {
      ctx.fillStyle = colorMap.green;
      ctx.fillText('✓', colX + 0.4, ty);
    }

    if (row.showLabel !== false) {
      ctx.fillStyle = row.complete ? colorMap.green : colorMap.white;
      ctx.fillText(`${row.label}:`, layout.nameX, ty);
    }

    drawRowPips(ctx, row, ty, layout, colorMap);
  });
  ctx.restore();

  if (rows.length > visibleRowSlots && rows[0]?.label !== 'STANDBY') {
    ctx.strokeStyle = 'rgba(100, 120, 140, 0.55)';
    ctx.lineWidth = 0.45;
    ctx.strokeRect(sb.trackX, sb.trackY, sb.trackW, sb.trackH);
    ctx.fillStyle = 'rgba(140, 170, 200, 0.45)';
    ctx.fillRect(sb.thumbX, sb.thumbY, sb.thumbW, sb.thumbH);
    ctx.strokeStyle = 'rgba(180, 210, 230, 0.5)';
    ctx.strokeRect(sb.thumbX, sb.thumbY, sb.thumbW, sb.thumbH);
  }

  return sb;
}
