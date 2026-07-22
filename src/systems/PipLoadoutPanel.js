/**
 * POWER panel — LOADOUTS tab (list, hover diff, delete modal).
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
const FOOTER_H = 18;
const LIST_SCROLL_STEP = 1;

/** @param {import('./CockpitPanels.js').CockpitPanels} panels */
export function drawPipLoadoutPanel(ctx, box, engine, panels) {
  const loadouts = engine.pipLoadouts;
  if (!loadouts) return;

  const footerY = box.y + box.h - FOOTER_H;
  const listBox = { x: box.x, y: box.y + 2, w: box.w, h: footerY - box.y - 4 };
  engine.pipLoadoutListBox = listBox;
  engine.pipLoadoutRowHits = [];

  if (!loadouts.entries.length) {
    panels._text(ctx, 'NO SAVED LOADOUTS', listBox.x, listBox.y + 16, { color: DIM, size: 12 });
  } else {
    drawLoadoutRows(ctx, listBox, engine, panels);
  }

  if (engine.pipLoadoutHover?.entryId) {
    drawHoverPopup(ctx, box, engine, panels);
  }

  panels._btnWide(ctx, box.x, footerY, box.w, 'DELETE ALL UNLOCKED', (e) => {
    const { renamedUnlocked } = e.pipLoadouts.previewDeleteAllUnlocked();
    if (renamedUnlocked.length) {
      e.pipLoadoutModal = {
        phase: 'deleteAll',
        names: renamedUnlocked.map((x) => e.pipLoadouts.title(x)),
      };
    } else {
      e.pipLoadouts.deleteAllUnlocked();
      e.persistNavProfile();
    }
  });
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

function drawHoverPopup(ctx, box, engine, panels) {
  const entry = engine.pipLoadouts.find(engine.pipLoadoutHover.entryId);
  if (!entry) return;
  const pw = Math.min(box.w - 8, 168);
  const ph = 6 + PIPS.CHANNELS.length * 14 + 8;
  let px = engine.pipLoadoutHover.x + 12;
  let py = engine.pipLoadoutHover.y;
  if (px + pw > box.x + box.w) px = box.x + box.w - pw - 4;
  if (py + ph > box.y + box.h) py = box.y + box.h - ph - 4;

  ctx.fillStyle = 'rgba(10, 20, 32, 0.96)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1;
  ctx.strokeRect(px, py, pw, ph);
  panels._text(ctx, engine.pipLoadouts.title(entry), px + 6, py + 12, {
    size: 10,
    weight: 700,
    color: COPPER,
  });

  let y = py + 22;
  for (const ch of PIPS.CHANNELS) {
    const label = PIP_LABELS[ch] || ch.toUpperCase();
    panels._text(ctx, label.slice(0, 4), px + 4, y + 8, { size: 8, color: DIM, weight: 600 });
    const slots = engine.pipSystem.diffSlots(ch, entry.alloc[ch]);
    for (let k = 0; k < PIPS.MAX_PER_CHANNEL; k++) {
      const sx = px + 38 + k * 10;
      const kind = slots[k];
      if (kind === 'keep') ctx.fillStyle = ACCENT;
      else if (kind === 'add') ctx.fillStyle = IFF_GREEN;
      else if (kind === 'remove') ctx.fillStyle = IFF_RED;
      else ctx.fillStyle = 'rgba(50, 64, 78, 0.5)';
      ctx.fillRect(sx, y, 8, 10);
      if (kind === 'empty' && kind !== 'keep') {
        ctx.strokeStyle = 'rgba(90, 110, 130, 0.35)';
        ctx.strokeRect(sx, y, 8, 10);
      }
    }
    y += 14;
  }
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
