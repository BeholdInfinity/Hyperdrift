/**
 * POWER panel — loadout drawer, pip diff preview, delete/rename modals.
 */

import { PIPS } from '../core/Constants.js';

const FONT = "'Barlow Condensed', 'Segoe UI', sans-serif";
const TXT = 'rgba(200, 224, 246, 0.9)';
const DIM = 'rgba(150, 178, 202, 0.55)';
const COPPER = 'rgba(230, 171, 109, 0.92)';
const ACCENT = 'rgba(120, 200, 255, 0.85)';
const IFF_GREEN = 'rgba(95, 224, 138, 0.95)';
const IFF_RED = 'rgba(255, 120, 120, 0.95)';

export const PIP_LABELS = {
  radar: 'RADAR',
  scanner: 'SCANNER',
  engine: 'ENGINE',
  weapons: 'WEAPONS',
  shield: 'SHIELD',
};

const ROW_H = 18;
const LIST_SCROLL_STEP = 1;

/** @param {import('./CockpitPanels.js').CockpitPanels} panels */
export function drawPipLoadoutPanel(ctx, box, engine, panels) {
  const loadouts = engine.pipLoadouts;
  if (!loadouts) return;

  const listBox = { x: box.x, y: box.y + 2, w: box.w, h: box.h - 4 };
  engine.pipLoadoutListBox = listBox;
  engine.pipLoadoutRowHits = [];

  if (!loadouts.entries.length) {
    panels._text(ctx, 'NO SAVED LOADOUTS', listBox.x, listBox.y + 16, { color: DIM, size: 12 });
  } else {
    drawLoadoutRows(ctx, listBox, engine, panels);
  }
}

const DEL_BTN = 11;
const LOCK_BTN = 16;
const ROW_CTRL_GAP = 5;
const DEL_COL_INSET = 28;

function loadoutColumns(box) {
  const delX = box.x + box.w - DEL_COL_INSET;
  const lockX = delX - ROW_CTRL_GAP - LOCK_BTN;
  const nameW = lockX - box.x - 4;
  return { nameX: box.x, nameW, lockX, delX };
}

function drawLoadoutRows(ctx, listBox, engine, panels) {
  const loadouts = engine.pipLoadouts;
  const cols = loadoutColumns(listBox);
  const maxRows = Math.max(1, Math.floor(listBox.h / ROW_H));
  if (!engine.pipLoadoutListScroll) engine.pipLoadoutListScroll = 0;
  const maxScroll = Math.max(0, loadouts.entries.length - maxRows);
  engine.pipLoadoutListScroll = Math.min(engine.pipLoadoutListScroll, maxScroll);

  const scroll = engine.pipLoadoutListScroll;
  const slice = loadouts.entries.slice(scroll, scroll + maxRows);

  slice.forEach((entry, i) => {
    const ry = listBox.y + i * ROW_H;
    const active = entry.id === loadouts.activeId;
    if (active) {
      ctx.fillStyle = 'rgba(120, 200, 255, 0.14)';
      ctx.fillRect(listBox.x - 2, ry - 1, listBox.w + 4, ROW_H);
    }
    panels._text(ctx, loadouts.title(entry), cols.nameX, ry + 13, {
      size: 11,
      weight: 600,
      color: active ? ACCENT : TXT,
    });
    panels.registerPipLoadoutRowRightClick(cols.nameX, ry, cols.nameW, ROW_H, entry.id);
    panels._region(cols.nameX, ry - 1, cols.nameW, ROW_H, (e) => {
      applyLoadoutEntry(e, entry.id);
    });
    panels._btnPadlock(ctx, cols.lockX, ry + 1, entry.locked, (e) => {
      e.pipLoadouts.toggleLock(entry.id);
      e.persistNavProfile();
    });
    if (!entry.locked) {
      panels._btnDanger(
        ctx,
        cols.delX,
        ry + 4,
        'X',
        (e) => {
          deleteLoadoutEntry(e, entry.id);
        },
        { size: DEL_BTN, compact: true }
      );
    }
    engine.pipLoadoutRowHits.push({
      x: listBox.x - 2,
      y: ry - 1,
      w: listBox.w + 4,
      h: ROW_H,
      id: entry.id,
    });
  });
}

function applyLoadoutEntry(engine, entryId) {
  if (engine.pipLoadoutModal) return;
  const entry = engine.pipLoadouts.find(entryId);
  if (!entry) return;
  const result = engine.pipSystem.applyLoadout(entry.alloc);
  engine.pipLoadouts.activeId = entryId;
  engine.persistNavProfile();
  if (result.partial) {
    engine.pipLoadoutFlash = {
      until: (engine.gameTime || 0) + 1.2,
      missed: result.missed,
      shortBy: result.shortBy,
    };
  } else {
    engine.pipLoadoutFlash = null;
  }
}

function deleteLoadoutEntry(engine, entryId) {
  const entry = engine.pipLoadouts.find(entryId);
  if (!entry || entry.locked) return;
  if (engine.pipLoadouts.isRenamed(entry)) {
    engine.pipLoadoutModal = { phase: 'deleteOne', entryId };
  } else {
    engine.pipLoadouts.deleteEntry(entryId);
    engine.persistNavProfile();
  }
}

function previewPoolAfterLoadout(pips, targetAlloc) {
  const pool = pips.pool();
  /** @type {Record<string, number>} */
  const sim = {};
  for (const ch of PIPS.CHANNELS) sim[ch] = pips.get(ch);
  for (const ch of PIPS.CHANNELS) {
    const target = Math.max(0, Math.min(PIPS.MAX_PER_CHANNEL, targetAlloc[ch] | 0));
    if (sim[ch] > target) sim[ch] = target;
  }
  const simUsed = () => PIPS.CHANNELS.reduce((n, ch) => n + sim[ch], 0);
  const simFree = () => pool - simUsed();
  let guard = 0;
  while (simFree() > 0 && guard++ < 256) {
    let progressed = false;
    for (const ch of PIPS.CHANNELS) {
      const target = Math.max(0, Math.min(PIPS.MAX_PER_CHANNEL, targetAlloc[ch] | 0));
      if (sim[ch] < target && simFree() > 0) {
        sim[ch]++;
        progressed = true;
        if (simFree() <= 0) break;
      }
    }
    if (!progressed) break;
  }
  const used = simUsed();
  return { pool, free: pool - used, used };
}

function drawPreviewPoolBar(ctx, x, y, w, h, total, currentFree, targetFree, diff) {
  if (w <= 0 || h <= 0) return;
  const segments = Math.max(1, total | 0);
  const curFree = Math.max(0, Math.min(segments, currentFree | 0));
  const tgtFree = Math.max(0, Math.min(segments, targetFree | 0));
  const segW = w / segments;
  ctx.save();
  for (let i = 0; i < segments; i++) {
    const sx = x + i * segW;
    const gap = i < segments - 1 ? 1 : 0;
    const sw = Math.max(1, segW - gap);
    const wasFree = i < curFree;
    const willFree = i < tgtFree;
    if (!diff) {
      ctx.fillStyle = wasFree ? ACCENT : 'rgba(50, 64, 78, 0.55)';
    } else if (wasFree && willFree) {
      ctx.fillStyle = ACCENT;
    } else if (!wasFree && !willFree) {
      ctx.fillStyle = 'rgba(50, 64, 78, 0.55)';
    } else if (wasFree && !willFree) {
      ctx.fillStyle = IFF_RED;
    } else {
      ctx.fillStyle = IFF_GREEN;
    }
    ctx.fillRect(sx, y, sw, h);
  }
  ctx.strokeStyle =
    (diff ? tgtFree : curFree) <= 0 ? 'rgba(255, 200, 80, 0.75)' : 'rgba(90, 110, 130, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (segments > 1) {
    ctx.strokeStyle = 'rgba(20, 28, 38, 0.85)';
    for (let i = 1; i < segments; i++) {
      const lx = x + i * segW;
      ctx.beginPath();
      ctx.moveTo(lx, y + 1);
      ctx.lineTo(lx, y + h - 1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPreviewSlot(ctx, x, y, w, h, kind) {
  if (kind === 'keep') ctx.fillStyle = ACCENT;
  else if (kind === 'add') ctx.fillStyle = IFF_GREEN;
  else if (kind === 'remove') ctx.fillStyle = IFF_RED;
  else ctx.fillStyle = 'rgba(50, 64, 78, 0.5)';
  ctx.fillRect(x, y, w, h);
  if (kind === 'empty') {
    ctx.strokeStyle = 'rgba(90, 110, 130, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }
}

/** Compact interactive pip grid — live edit + optional hover diff vs a loadout. */
export function drawPipLoadoutPreview(ctx, box, engine, panels) {
  const pips = engine.pipSystem;
  const loadouts = engine.pipLoadouts;
  const flash = engine.pipLoadoutFlash;
  const flashActive = flash && (engine.gameTime || 0) < flash.until;
  const pulse = flashActive ? 0.45 + 0.55 * Math.abs(Math.sin((engine.gameTime || 0) * 14)) : 0;
  const hoverId = engine.pipLoadoutHover?.entryId;
  const entry = hoverId ? loadouts?.find(hoverId) : null;

  panels._text(
    ctx,
    entry ? loadouts.title(entry) : 'CURRENT ALLOCATION',
    box.x,
    box.y + 11,
    { size: 9, color: entry ? COPPER : DIM, weight: 700 },
  );

  const poolTotal = pips.pool();
  const poolFree = pips.free();
  const targetPool = entry ? previewPoolAfterLoadout(pips, entry.alloc) : null;
  const displayFree = targetPool ? targetPool.free : poolFree;
  const ratioLabel = `${displayFree}/${poolTotal}`;
  const ratioSize = 7;
  ctx.font = `600 ${ratioSize}px ${FONT}`;
  const ratioW = ctx.measureText(ratioLabel).width;
  const ratioX = box.x + box.w;
  const ratioY = box.y + 10;
  const barH = 5;
  const barGap = 4;
  const barEndX = ratioX - ratioW - barGap;
  const barX = box.x + Math.floor(box.w * 0.5);
  const barW = barEndX - barX;
  const barY = ratioY - barH + 1;
  if (barW >= 8) {
    drawPreviewPoolBar(ctx, barX, barY, barW, barH, poolTotal, poolFree, displayFree, !!entry);
  }
  panels._text(ctx, ratioLabel, ratioX, ratioY, {
    size: ratioSize,
    align: 'right',
    color: entry ? COPPER : DIM,
    weight: 600,
  });

  const rowsTop = box.y + 16;
  const rowH = Math.max(14, Math.floor((box.h - 18) / PIPS.CHANNELS.length));
  const btnS = Math.max(10, Math.min(12, rowH - 2));
  const labelW = 32;
  const xBtn = box.x + labelW;
  const minusX = box.x + box.w - btnS * 2 - 2;
  const plusX = box.x + box.w - btnS - 2;
  const slotsX = xBtn + btnS + 4;
  const slotsEnd = minusX - 4;
  const slotGap = 2;
  const slotW = Math.max(
    7,
    Math.floor((slotsEnd - slotsX - slotGap * (PIPS.MAX_PER_CHANNEL - 1)) / PIPS.MAX_PER_CHANNEL),
  );
  const slotH = Math.max(7, rowH - 3);

  PIPS.CHANNELS.forEach((ch, i) => {
    const ry = rowsTop + i * rowH;
    const label = (PIP_LABELS[ch] || ch.toUpperCase()).slice(0, 4);
    panels._text(ctx, label, box.x + 2, ry + rowH - 3, { size: 8, color: DIM, weight: 600 });
    const n = pips.get(ch);
    const rowBtnY = ry + (rowH - btnS) / 2;
    panels._btnDanger(ctx, xBtn, rowBtnY, 'X', (e) => e.pipSystem.clear(ch), {
      size: btnS,
      compact: true,
      disabled: n <= 0,
    });
    const maxReach = n + pips.free();
    const slotY = ry + (rowH - slotH) / 2;
    const diff = entry ? pips.diffSlots(ch, entry.alloc[ch]) : null;
    for (let k = 0; k < PIPS.MAX_PER_CHANNEL; k++) {
      const sx = slotsX + k * (slotW + slotGap);
      const target = k + 1;
      const blocked = target > maxReach && target > n;
      const missed = flashActive && flash.missed?.[ch] > 0 && k >= n && k < n + flash.missed[ch];
      if (entry && !missed) {
        drawPreviewSlot(ctx, sx, slotY, slotW, slotH, diff[k]);
      } else {
        panels._drawPipSlot(ctx, sx, slotY, slotW, slotH, k < n, blocked, missed, pulse);
      }
      if (!blocked) {
        panels._region(sx, slotY - 1, slotW + 1, slotH + 2, (e) => e.pipSystem.set(ch, target));
      }
    }
    panels._btn(ctx, minusX, rowBtnY, '−', (e) => e.pipSystem.remove(ch), btnS);
    panels._btn(ctx, plusX, rowBtnY, '+', (e) => e.pipSystem.add(ch), btnS);
  });
}

const RENAME_MAX_LEN = 32;

export function closePipLoadoutModal(engine) {
  engine.pipLoadoutModal = null;
  engine.input?.endModalTextCapture?.();
}

export function openRenameLoadoutModal(engine, entryId) {
  const ent = engine.pipLoadouts?.find(entryId);
  if (!ent) return;
  engine.pipLoadoutModal = {
    phase: 'rename',
    entryId,
    draft: engine.pipLoadouts.title(ent),
  };
  engine.input?.beginModalTextCapture?.();
}

function commitRenameLoadout(engine) {
  const modal = engine.pipLoadoutModal;
  if (!modal || modal.phase !== 'rename') return;
  engine.pipLoadouts.setCustomName(modal.entryId, modal.draft);
  engine.persistNavProfile();
  closePipLoadoutModal(engine);
}

/** @returns {boolean} true if rename modal consumed input this frame */
export function processPipLoadoutModalInput(engine) {
  const modal = engine.pipLoadoutModal;
  if (!modal || modal.phase !== 'rename' || !engine.input) return false;
  let consumed = false;
  for (const ev of engine.input.consumeModalTextEvents()) {
    consumed = true;
    if (ev.type === 'escape') {
      closePipLoadoutModal(engine);
    } else if (ev.type === 'enter') {
      commitRenameLoadout(engine);
    } else if (ev.type === 'backspace') {
      modal.draft = String(modal.draft || '').slice(0, -1);
    } else if (ev.type === 'char' && ev.char) {
      const draft = String(modal.draft || '');
      if (draft.length < RENAME_MAX_LEN) modal.draft = draft + ev.char;
    }
  }
  return consumed;
}

export function drawPipLoadoutModal(ctx, box, engine, panels) {
  const modal = engine.pipLoadoutModal;
  if (!modal) return;
  ctx.fillStyle = 'rgba(8, 14, 22, 0.5)';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  panels._region(box.x, box.y, box.w, box.h, () => {});
  if (modal.phase === 'rename') {
    drawRenameModal(ctx, box, engine, panels, modal);
    return;
  }
  drawDeleteModal(ctx, box, engine, panels, modal);
}

function drawRenameModal(ctx, box, engine, panels, modal) {
  const w = Math.min(240, box.w - 12);
  const h = 108;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.fillStyle = 'rgba(12, 24, 36, 0.96)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  panels._text(ctx, 'RENAME LOADOUT', x + 8, y + 16, { size: 12, weight: 700, color: COPPER });
  panels._text(ctx, 'ENTER / OK · ESC / CANCEL', x + 8, y + 30, { size: 8, color: DIM, weight: 500 });

  const fieldX = x + 8;
  const fieldY = y + 40;
  const fieldW = w - 16;
  const fieldH = 18;
  ctx.fillStyle = 'rgba(30, 54, 76, 0.85)';
  ctx.fillRect(fieldX, fieldY, fieldW, fieldH);
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(fieldX, fieldY, fieldW, fieldH);

  const draft = String(modal.draft || '');
  ctx.font = `600 11px ${FONT}`;
  const display = truncateLoadoutTitle(ctx, draft, fieldW - 14);
  panels._text(ctx, display, fieldX + 6, fieldY + 13, { size: 11, weight: 600, color: TXT });
  const blinkOn = Math.floor((engine.gameTime || 0) * 2.5) % 2 === 0;
  if (blinkOn) {
    const tw = ctx.measureText(display).width;
    const cx = fieldX + 6 + Math.min(tw, fieldW - 14);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(cx + 1, fieldY + 4, 1, fieldH - 8);
  }

  const by = y + h - 22;
  panels._btnWide(ctx, x + 8, by, w / 2 - 12, 'CANCEL', (e) => {
    closePipLoadoutModal(e);
  });
  panels._btnWide(ctx, x + w / 2 + 4, by, w / 2 - 12, 'OK', (e) => {
    commitRenameLoadout(e);
  });
}

function drawDeleteModal(ctx, box, engine, panels, modal) {
  const w = Math.min(220, box.w - 16);
  const h = 88;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.fillStyle = 'rgba(12, 24, 36, 0.96)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  let title = 'CONFIRM';
  let body = '';
  if (modal.phase === 'deleteOne') {
    title = 'DELETE LOADOUT?';
    body = 'Remove this renamed preset?';
  } else if (modal.phase === 'deleteAll') {
    title = 'DELETE ALL?';
    body = `Includes renamed: ${(modal.names || []).join(', ')}`;
  }
  panels._text(ctx, title, x + 8, y + 16, { size: 12, weight: 700, color: COPPER });
  panels._text(ctx, body, x + 8, y + 36, { size: 10, color: TXT, weight: 400 });
  const by = y + h - 22;
  panels._btnWide(ctx, x + 8, by, w / 2 - 12, 'CANCEL', (e) => {
    closePipLoadoutModal(e);
  });
  panels._btnWide(ctx, x + w / 2 + 4, by, w / 2 - 12, 'DELETE', (e) => {
    const m = e.pipLoadoutModal;
    if (!m) return;
    if (m.phase === 'deleteOne' && m.entryId) {
      e.pipLoadouts.deleteEntry(m.entryId);
      e.persistNavProfile();
    } else if (m.phase === 'deleteAll') {
      e.pipLoadouts.deleteAllUnlocked();
      e.persistNavProfile();
    }
    closePipLoadoutModal(e);
  });
}

/** @returns {boolean} */
export function processPipLoadoutInput(engine, input, panels, zoomWheel) {
  if (panels.tabs.power !== 1) {
    engine.pipLoadoutHover = null;
    return false;
  }
  const mx = input.mouseScreen.x;
  const my = input.mouseScreen.y;
  const listBox = engine.pipLoadoutListBox;

  if (zoomWheel !== 0 && listBox && containsBox(mx, my, listBox)) {
    const maxRows = Math.max(1, Math.floor(listBox.h / ROW_H));
    const maxScroll = Math.max(0, (engine.pipLoadouts?.entries.length || 0) - maxRows);
    engine.pipLoadoutListScroll = Math.max(
      0,
      Math.min(maxScroll, (engine.pipLoadoutListScroll || 0) - Math.sign(zoomWheel) * LIST_SCROLL_STEP)
    );
    return true;
  }

  let hoverId = null;
  const hits = engine.pipLoadoutRowHits;
  if (listBox && hits?.length) {
    for (const r of hits) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        hoverId = r.id;
        break;
      }
    }
  }
  if (hoverId) {
    engine.pipLoadoutHover = { entryId: hoverId, x: mx, y: my };
  } else {
    engine.pipLoadoutHover = null;
  }
  return false;
}

function containsBox(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

export function pipLoadoutRightClick(engine, x, y, panels) {
  if (panels.tabs.power === 0) {
    for (const r of panels._pipLinkedLoadoutRightRegions || []) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        openRenameLoadoutModal(engine, r.entryId);
        return true;
      }
    }
    return false;
  }
  if (panels.tabs.power !== 1) return false;
  for (const r of panels._pipLoadoutRightRegions || []) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      openRenameLoadoutModal(engine, r.entryId);
      return true;
    }
  }
  return false;
}

export function truncateLoadoutTitle(ctx, title, maxW) {
  if (ctx.measureText(title).width <= maxW) return title;
  let s = title;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
