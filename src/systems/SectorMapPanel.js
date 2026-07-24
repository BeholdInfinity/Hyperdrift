/**
 * Sector map panel — live map + optional travel-log drawer, pan/zoom, travel log UI.
 */

import { IFF, NAV } from '../core/Constants.js';
import { getSectorLayout } from '../world/SectorLayout.js';
import { formatTripDate } from '../world/TravelLog.js';
import { trailDistance } from '../world/SectorMap.js';
import {
  applyTravelLogTable,
  cycleTravelLogFilter,
  cycleTravelLogSort,
  filterLabel,
  formatTripDuration,
  travelLogListMaxScroll,
  stepTravelLogListScroll,
  truncateText,
  tripDurationMs,
} from '../world/TravelLogTable.js';
import { drawSectorMapTelemetry } from './TelemetryCorner.js';

const FONT = "'Barlow Condensed', 'Segoe UI', sans-serif";
const TXT = 'rgba(200, 224, 246, 0.9)';
const DIM = 'rgba(150, 178, 202, 0.55)';
const COPPER = 'rgba(230, 171, 109, 0.92)';
const ACCENT = 'rgba(120, 200, 255, 0.85)';

export function drawSectorMapPanel(ctx, box, engine, panels) {
  const view = engine.sectorMapView;
  const btnH = 18;
  const btnW = 88;
  const footerPad = 2;
  const body = { x: box.x, y: box.y, w: box.w, h: box.h - btnH - footerPad };
  const travelLogOpen = view.tabs.sector === 1;
  const telemetryH = 12;
  const contentY = body.y + telemetryH;
  const contentH = body.h - telemetryH;
  const mapH = travelLogOpen ? Math.max(40, Math.floor(contentH * 0.45)) : contentH;
  const mapBox = { x: body.x, y: contentY, w: body.w, h: mapH };
  view.mapBody = mapBox;

  drawMapTelemetry(ctx, body.x, body.y + 10, body.w, engine, view);

  drawMapCanvas(ctx, mapBox, engine, view, { fog: true, liveTrail: true });
  drawMapOverlays(ctx, mapBox, engine, panels, { travelLogOpen });

  if (travelLogOpen) {
    const divY = contentY + mapH;
    ctx.strokeStyle = COPPER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(body.x, divY);
    ctx.lineTo(body.x + body.w, divY);
    ctx.stroke();
    const listBox = {
      x: body.x,
      y: divY + 4,
      w: body.w,
      h: body.y + body.h - divY - 4,
    };
    view.travelLogListBox = listBox;
    drawTravelLogList(ctx, listBox, engine, panels);
    if (view.travelLogMenu) {
      drawTravelLogContextMenu(ctx, listBox, engine, panels, view.travelLogMenu);
    }
  } else {
    view.travelLogListBox = null;
  }

  const footerY = box.y + box.h - btnH;
  const footerGap = 6;
  const toggleW = panels._drawFooterToggle(
    ctx,
    box.x,
    footerY,
    btnW,
    btnH,
    'TRAVEL LOG',
    travelLogOpen,
    (e) => panels._toggleTravelLog(e),
  );

  const minLeft = box.x + toggleW + footerGap;

  if (!view.followShip && !travelLogOpen) {
    const recW = panels._footerRecenterWidth(ctx);
    const recX = box.x + box.w - recW;
    if (recX >= minLeft) {
      panels._drawFooterRecenter(ctx, recX, footerY, recW, btnH, (e) =>
        e.sectorMapView.recenter(e.ship),
      );
    }
  }

  if (travelLogOpen) {
    panels._drawFooterDeleteAll(ctx, box, footerY, btnH, toggleW, footerGap, (e) => {
      const { renamedUnlocked } = e.travelLog.previewDeleteAllUnlocked();
      if (renamedUnlocked.length) {
        e.sectorMapView.modal = {
          phase: 'deleteAll',
          names: renamedUnlocked.map((x) => e.travelLog.expeditionTitle(x)),
        };
      } else {
        e.travelLog.deleteAllUnlocked();
        e.persistNavProfile();
      }
    });
  }

  if (view.modal) {
    drawConfirmModal(ctx, box, engine, panels, view.modal);
  } else if (engine.poiBookModal?.surface === 'sectorMap') {
    drawPoiBookModal(ctx, box, engine, panels);
  }
}

function drawMapTelemetry(ctx, x, y, w, engine, view) {
  drawSectorMapTelemetry(ctx, x, y, engine, view, { fs: 11, color: DIM });
}

function drawMapCanvas(ctx, box, engine, view, { fog, liveTrail }) {
  const map = engine.sectorMap;
  const ship = engine.ship;
  if (!ship) return;
  view.syncFollow(ship);
  const scale = view.scaleForBox(box.w, box.h);
  const span = view.worldSpan(box.w, box.h);
  const cell = map.cellSize;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.fillStyle = 'rgba(8, 16, 24, 0.6)';
  ctx.fillRect(box.x, box.y, box.w, box.h);

  const layout = getSectorLayout();
  const pr = layout.planet.radius;
  const ps = view.worldToScreen(0, 0, box);
  const prScreen = pr * scale;
  if (prScreen > 2) {
    ctx.fillStyle = layout.planet.palette?.ocean || '#1a3a4a';
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, prScreen, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 140, 160, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (const ring of layout.rings || []) {
    const ri = ring.innerR * scale;
    const ro = ring.outerR * scale;
    if (ro < 2) continue;
    ctx.strokeStyle = 'rgba(80, 100, 120, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, ri, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, ro, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (fog) {
    const half = span / 2;
    const c0x = Math.floor((view.panCenter.x - half) / cell);
    const c1x = Math.floor((view.panCenter.x + half) / cell);
    const c0y = Math.floor((view.panCenter.y - half) / cell);
    const c1y = Math.floor((view.panCenter.y + half) / cell);
    const cs = cell * scale;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        const lvl = map.cellLevel(cx, cy);
        if (!lvl) continue;
        const wx = cx * cell;
        const wy = cy * cell;
        const s = view.worldToScreen(wx, wy, box);
        ctx.fillStyle = lvl === 2 ? 'rgba(60, 120, 170, 0.28)' : 'rgba(50, 70, 90, 0.16)';
        ctx.fillRect(s.x, s.y, cs + 0.5, cs + 0.5);
      }
    }
  }

  for (const entry of engine.travelLog.visibleEntries()) {
    strokeTrail(ctx, entry.trail, box, view, engine.travelLog.colorForEntry(entry));
  }

  if (liveTrail && map.trail.length > 1) {
    strokeTrail(ctx, map.trail, box, view, 'rgba(120, 200, 255, 0.45)');
  }

  drawNavRouteOnMap(ctx, box, engine, view);

  for (const poi of engine.poiSystem.mapPois()) {
    const s = view.worldToScreen(poi.x, poi.y, box);
    const sel = poi.id === engine.poiSystem.selectedId;
    const isPin = engine.poiSystem.isUserPin(poi);
    if (isPin) {
      drawMapPinMarker(ctx, s.x, s.y, engine.poiSystem.color(poi), sel);
    } else {
      ctx.fillStyle = engine.poiSystem.color(poi);
      ctx.beginPath();
      ctx.arc(s.x, s.y, sel ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  const scan = engine.radarSystem;
  for (const c of scan.contacts) {
    if (!scan.passesContactFilter(c)) continue;
    if (c.scanX == null || c.scanY == null) continue;
    const s = view.worldToScreen(c.scanX, c.scanY, box);
    const sel = c.id === scan.selectedId;
    ctx.save();
    ctx.globalAlpha = c.alpha != null ? c.alpha : 1;
    ctx.fillStyle = IFF[c.iff] || IFF.yellow;
    ctx.fillRect(s.x - (sel ? 2 : 1), s.y - (sel ? 2 : 1), sel ? 4 : 2, sel ? 4 : 2);
    ctx.restore();
  }

  const ss = view.worldToScreen(ship.position.x, ship.position.y, box);
  ctx.save();
  ctx.translate(ss.x, ss.y);
  ctx.rotate((ship.angle || 0) + Math.PI / 2);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(3.5, 4);
  ctx.lineTo(-3.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function strokeTrail(ctx, trail, box, view, color) {
  if (!trail || trail.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  trail.forEach((pt, i) => {
    const s = view.worldToScreen(pt.x, pt.y, box);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
}

/** White chained legs: ship→#1, #1→#2, … plus numbered stop markers. */
function drawNavRouteOnMap(ctx, box, engine, view) {
  const route = engine.navRoute;
  const ship = engine.ship;
  if (!route?.stops?.length || !ship) return;
  route.resolvePosition(engine);
  const stops = route.stops;
  const chain = [{ x: ship.position.x, y: ship.position.y }, ...stops.map((s) => ({ x: s.x, y: s.y }))];

  ctx.save();
  ctx.strokeStyle = NAV.ROUTE_LINE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i < chain.length - 1; i++) {
    const a = view.worldToScreen(chain[i].x, chain[i].y, box);
    const b = view.worldToScreen(chain[i + 1].x, chain[i + 1].y, box);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  stops.forEach((stop, i) => {
    const s = view.worldToScreen(stop.x, stop.y, box);
    const active = i === 0;
    const color = route.stopColor(engine, stop);
    const r = active ? 5 : 3.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (active) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = `700 ${active ? 9 : 8}px ${FONT}`;
    ctx.fillStyle = active ? '#fff' : DIM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), s.x, s.y - (active ? 12 : 10));
  });
  ctx.restore();
}

function drawMapPinMarker(ctx, x, y, color, selected) {
  const h = selected ? 11 : 9;
  ctx.save();
  ctx.translate(x, y - h * 0.35);
  ctx.fillStyle = color;
  ctx.strokeStyle = selected ? ACCENT : 'rgba(20, 30, 40, 0.8)';
  ctx.lineWidth = selected ? 1.2 : 1;
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.38, Math.PI, 0);
  ctx.lineTo(0, h * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPinIcon(ctx, x, y, size, color = COPPER) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(20, 30, 40, 0.85)';
  ctx.lineWidth = 1;
  const r = size * 0.35;
  ctx.beginPath();
  ctx.arc(0, -size * 0.08, r, Math.PI, 0);
  ctx.lineTo(0, size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMapRecenterButton(ctx, mapBox, panels, action) {
  const btnH = 18;
  const pad = 4;
  const recW = panels._footerRecenterWidth(ctx);
  const recX = mapBox.x + mapBox.w - recW - pad;
  const recY = mapBox.y + mapBox.h - btnH - pad;
  if (recW <= 0 || recX < mapBox.x || recY < mapBox.y) return;
  if (recW > mapBox.w - pad * 2) return;
  panels._drawFooterRecenter(ctx, recX, recY, recW, btnH, action);
}

function drawMapOverlays(ctx, mapBox, engine, panels, { travelLogOpen = false } = {}) {
  const view = engine.sectorMapView;
  if (travelLogOpen && !view.followShip) {
    drawMapRecenterButton(ctx, mapBox, panels, (e) => e.sectorMapView.recenter(e.ship));
  }
  drawMapMarkerTooltip(ctx, mapBox, view, panels);
  if (view.sectorMapMenu) {
    drawSectorMapContextMenu(ctx, mapBox, engine, panels, view.sectorMapMenu);
  }
}

export function pickMapPoiAtScreen(engine, sx, sy, mapBox, view) {
  const hit = pickSectorMapMarkerAtScreen(engine, sx, sy, mapBox, view);
  if (!hit || hit.kind !== 'pin') return null;
  return engine.poiSystem.list.find((p) => p.id === hit.id) || null;
}

/** Nearest map marker under the cursor (POI, pin, contact; waypoints when added). */
export function pickSectorMapMarkerAtScreen(engine, sx, sy, mapBox, view) {
  let best = null;
  let bestD = Infinity;

  const tryHit = (anchorX, anchorY, radius, name, kind, id = null) => {
    const d = Math.hypot(sx - anchorX, sy - anchorY);
    if (d > radius || d >= bestD) return;
    bestD = d;
    best = { name, anchorX, anchorY, kind, id };
  };

  for (const poi of engine.poiSystem.mapPois()) {
    const s = view.worldToScreen(poi.x, poi.y, mapBox);
    const isPin = engine.poiSystem.isUserPin(poi);
    if (isPin) {
      tryHit(s.x, s.y - 3, 12, poi.name, 'pin', poi.id);
    } else {
      const sel = poi.id === engine.poiSystem.selectedId;
      tryHit(s.x, s.y, sel ? 10 : 8, poi.name, 'poi', poi.id);
    }
  }

  const scan = engine.radarSystem;
  for (const c of scan.contacts) {
    if (!scan.passesContactFilter(c)) continue;
    if (c.scanX == null || c.scanY == null) continue;
    const s = view.worldToScreen(c.scanX, c.scanY, mapBox);
    const sel = c.id === scan.selectedId;
    tryHit(s.x, s.y, sel ? 10 : 8, c.name || 'Contact', 'contact', c.id);
  }

  // Future: dedicated flight waypoints (distinct from manual POI pins).
  const waypoints = engine.sectorWaypoints;
  if (Array.isArray(waypoints)) {
    for (const wp of waypoints) {
      if (wp.x == null || wp.y == null) continue;
      const s = view.worldToScreen(wp.x, wp.y, mapBox);
      tryHit(s.x, s.y, wp.hitRadius ?? 10, wp.name || 'Waypoint', 'navStop', wp.id);
    }
  }

  return best;
}

export function updateSectorMapMarkerHover(engine, sx, sy) {
  const view = engine.sectorMapView;
  const box = view.mapBody;
  if (!box || !view.containsMapPoint(sx, sy) || view.modal || view.pointerDragging()) {
    view.mapHoverTooltip = null;
    return;
  }
  if (engine.poiBookModal?.surface === 'sectorMap') {
    view.mapHoverTooltip = null;
    return;
  }
  const hit = pickSectorMapMarkerAtScreen(engine, sx, sy, box, view);
  view.mapHoverTooltip = hit
    ? { text: hit.name, sx: hit.anchorX, sy: hit.anchorY }
    : null;
}

function drawMapMarkerTooltip(ctx, mapBox, view, panels) {
  const tip = view.mapHoverTooltip;
  if (!tip?.text) return;
  const maxLabelW = Math.min(140, mapBox.w - 16);
  ctx.font = `600 10px ${FONT}`;
  const label = truncateText(ctx, tip.text, maxLabelW);
  const tw = ctx.measureText(label).width;
  const padX = 6;
  const bw = tw + padX * 2;
  const bh = 18;
  let tx = tip.sx + 10;
  let ty = tip.sy - bh - 6;
  if (tx + bw > mapBox.x + mapBox.w - 2) tx = mapBox.x + mapBox.w - bw - 2;
  if (tx < mapBox.x + 2) tx = mapBox.x + 2;
  if (ty < mapBox.y + 2) ty = tip.sy + 10;
  if (ty + bh > mapBox.y + mapBox.h - 2) ty = mapBox.y + mapBox.h - bh - 2;

  ctx.fillStyle = 'rgba(10, 20, 32, 0.96)';
  ctx.fillRect(tx, ty, bw, bh);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1;
  ctx.strokeRect(tx, ty, bw, bh);
  panels._text(ctx, label, tx + padX, ty + 13, { size: 10, weight: 600, color: TXT });
}

export function closePoiBookModal(engine) {
  engine.poiBookModal = null;
  engine.input?.endModalTextCapture?.();
}

/** @param {'poiBook'|'sectorMap'} surface */
export function openRenamePoiModal(engine, poiId, surface) {
  const poi = engine.poiSystem.list.find((p) => p.id === poiId);
  if (!poi || !engine.poiSystem.isUserPin(poi)) return;
  engine.poiBookMenu = null;
  engine.sectorMapView.sectorMapMenu = null;
  engine.sectorMapView.travelLogMenu = null;
  engine.poiBookModal = {
    phase: 'rename',
    surface,
    poiId,
    draft: poi.name,
  };
  engine.input?.beginModalTextCapture?.();
}

function commitRenamePoi(engine) {
  const modal = engine.poiBookModal;
  if (!modal || modal.phase !== 'rename') return;
  engine.poiSystem.setPoiName(modal.poiId, modal.draft);
  engine.persistNavProfile();
  closePoiBookModal(engine);
}

const POI_RENAME_MAX_LEN = 32;

/** @returns {boolean} */
export function processPoiBookModalInput(engine) {
  const modal = engine.poiBookModal;
  if (!modal || modal.phase !== 'rename' || !engine.input) return false;
  let consumed = false;
  for (const ev of engine.input.consumeModalTextEvents()) {
    consumed = true;
    if (ev.type === 'escape') {
      closePoiBookModal(engine);
    } else if (ev.type === 'enter') {
      commitRenamePoi(engine);
    } else if (ev.type === 'backspace') {
      modal.draft = String(modal.draft || '').slice(0, -1);
    } else if (ev.type === 'char' && ev.char) {
      const draft = String(modal.draft || '');
      if (draft.length < POI_RENAME_MAX_LEN) modal.draft = draft + ev.char;
    }
  }
  return consumed;
}

export function drawPoiBookModal(ctx, box, engine, panels) {
  const modal = engine.poiBookModal;
  if (!modal) return;
  ctx.fillStyle = 'rgba(8, 14, 22, 0.5)';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  panels._region(box.x, box.y, box.w, box.h, () => {});
  if (modal.phase === 'rename') {
    drawRenamePoiModal(ctx, box, engine, panels, modal);
    return;
  }
  if (modal.phase === 'deleteAll') {
    drawPoiDeleteAllModal(ctx, box, engine, panels, modal);
  }
}

function drawRenamePoiModal(ctx, box, engine, panels, modal) {
  const w = Math.min(240, box.w - 12);
  const h = 108;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.fillStyle = 'rgba(12, 24, 36, 0.96)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  panels._text(ctx, 'RENAME PIN', x + 8, y + 16, { size: 12, weight: 700, color: COPPER });
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
  const display = truncateText(ctx, draft, fieldW - 14);
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
    closePoiBookModal(e);
  });
  panels._btnWide(ctx, x + w / 2 + 4, by, w / 2 - 12, 'OK', (e) => {
    commitRenamePoi(e);
  });
}

function drawPoiDeleteAllModal(ctx, box, engine, panels, modal) {
  const w = Math.min(280, box.w - 8);
  const h = 88;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.fillStyle = 'rgba(12, 24, 36, 0.96)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  panels._text(ctx, 'DELETE ALL?', x + 8, y + 16, { size: 12, weight: 700, color: COPPER });
  panels._text(ctx, `Includes renamed: ${(modal.names || []).join(', ')}`, x + 8, y + 36, {
    size: 11,
    color: TXT,
    weight: 400,
  });
  const by = y + h - 22;
  panels._btnWide(ctx, x + 8, by, w / 2 - 12, 'CANCEL', (e) => {
    closePoiBookModal(e);
  });
  panels._btnWide(ctx, x + w / 2 + 4, by, w / 2 - 12, 'DELETE', (e) => {
    e.poiSystem.deleteAllUnlocked();
    e.persistNavProfile();
    closePoiBookModal(e);
  });
}

export function deletePoiIfAllowed(engine, poiId) {
  if (engine.poiSystem.deletePoi(poiId)) engine.persistNavProfile();
}

/** @param {'sectorMap'|'poiBook'} menuTag */
export function drawPoiPinContextMenu(ctx, clampBox, engine, panels, menu, poiId, menuTag) {
  const poi = engine.poiSystem.list.find((p) => p.id === poiId);
  if (!poi) return;
  const menuOpt = menuTag === 'sectorMap' ? { sectorMapMenu: true } : { poiBookMenu: true };
  const userPin = engine.poiSystem.isUserPin(poi);
  const w = 96;
  const rowH = 18;
  const items = [
    {
      label: 'ADD STOP',
      color: ACCENT,
      action: (e) => {
        e.poiBookMenu = null;
        e.sectorMapView.sectorMapMenu = null;
        e.addNavRouteStopFromPoi(poiId);
      },
    },
  ];
  if (userPin) {
    items.push(
      {
        label: 'RENAME',
        color: ACCENT,
        action: (e) => {
          e.poiBookMenu = null;
          e.sectorMapView.sectorMapMenu = null;
          openRenamePoiModal(e, poiId, menuTag);
        },
      },
      {
        label: poi.locked ? 'UNLOCK' : 'LOCK',
        color: TXT,
        action: (e) => {
          e.poiSystem.togglePoiLock(poiId);
          e.persistNavProfile();
        },
      },
    );
    if (!poi.locked) {
      items.push({
        label: 'DELETE',
        color: 'rgba(255, 120, 120, 0.95)',
        action: (e) => deletePoiIfAllowed(e, poiId),
      });
    }
  }
  drawStackedContextMenu(ctx, clampBox, panels, menu.x, menu.y, w, rowH, items, menuOpt);
}

function drawStackedContextMenu(ctx, clampBox, panels, mx, my, w, rowH, items, regionOpts) {
  const h = items.length * rowH;
  let x = mx;
  let y = my;
  x = Math.max(clampBox.x, Math.min(x, clampBox.x + clampBox.w - w));
  y = Math.max(clampBox.y, Math.min(y, clampBox.y + clampBox.h - h));
  ctx.fillStyle = 'rgba(12, 24, 36, 0.97)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  items.forEach((item, i) => {
    const iy = y + i * rowH;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x + 4, iy);
      ctx.lineTo(x + w - 4, iy);
      ctx.stroke();
    }
    panels._text(ctx, item.label, x + w / 2, iy + 13, {
      size: 10,
      align: 'center',
      weight: 700,
      color: item.color,
    });
    panels._region(x, iy, w, rowH, item.action, regionOpts);
  });
}

function drawSectorMapContextMenu(ctx, mapBox, engine, panels, menu) {
  if (menu.kind === 'poi') {
    drawPoiPinContextMenu(ctx, mapBox, engine, panels, menu, menu.poiId, 'sectorMap');
    return;
  }
  const w = 108;
  const rowH = 20;
  const h = rowH * 2;
  let x = menu.x;
  let y = menu.y;
  x = Math.max(mapBox.x, Math.min(x, mapBox.x + mapBox.w - w));
  y = Math.max(mapBox.y, Math.min(y, mapBox.y + mapBox.h - h));
  ctx.fillStyle = 'rgba(12, 24, 36, 0.97)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  drawPinIcon(ctx, x + 14, y + 10, 10, COPPER);
  panels._text(ctx, 'DROP PIN', x + 58, y + 14, { size: 10, align: 'center', weight: 700, color: ACCENT });
  panels._region(
    x,
    y,
    w,
    rowH,
    (e) => {
      const poi = e.poiSystem.addManualPin(menu.worldX, menu.worldY);
      e.poiSystem.select(poi.id);
      e.persistNavProfile();
      e.sectorMapView.sectorMapMenu = null;
    },
    { sectorMapMenu: true },
  );
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.18)';
  ctx.beginPath();
  ctx.moveTo(x + 4, y + rowH);
  ctx.lineTo(x + w - 4, y + rowH);
  ctx.stroke();
  panels._text(ctx, 'ADD STOP', x + w / 2, y + rowH + 14, {
    size: 10,
    align: 'center',
    weight: 700,
    color: ACCENT,
  });
  panels._region(
    x,
    y + rowH,
    w,
    rowH,
    (e) => {
      e.addNavRouteStopWorld(menu.worldX, menu.worldY);
      e.sectorMapView.sectorMapMenu = null;
    },
    { sectorMapMenu: true },
  );
}

export function sectorMapRightClick(engine, sx, sy) {
  const view = engine.sectorMapView;
  if (!view.mapBody || !view.containsMapPoint(sx, sy)) return false;
  if (view.modal) return false;
  if (view.tabs.sector !== 0) return false;
  view.travelLogMenu = null;
  const mapBox = view.mapBody;
  const hit = pickSectorMapMarkerAtScreen(engine, sx, sy, mapBox, view);
  if (hit && (hit.kind === 'pin' || hit.kind === 'poi')) {
    view.sectorMapMenu = { kind: 'poi', poiId: hit.id, x: sx, y: sy };
  } else {
    const w = view.screenToWorld(sx, sy, mapBox);
    view.sectorMapMenu = { kind: 'map', worldX: w.x, worldY: w.y, x: sx, y: sy };
  }
  return true;
}

/** MMB on LIVE sector map — instant add stop (POI if hovering marker). */
export function sectorMapMiddleClick(engine, sx, sy) {
  const view = engine.sectorMapView;
  if (view.tabs.sector !== 0) return false;
  if (!view.mapBody || !view.containsMapPoint(sx, sy)) return false;
  if (view.modal || view.pointerDragging()) return false;
  const mapBox = view.mapBody;
  const hit = pickSectorMapMarkerAtScreen(engine, sx, sy, mapBox, view);
  if (hit && (hit.kind === 'pin' || hit.kind === 'poi')) {
    engine.addNavRouteStopFromPoi(hit.id);
    return true;
  }
  const w = view.screenToWorld(sx, sy, mapBox);
  engine.addNavRouteStopWorld(w.x, w.y);
  return true;
}

const TRIP_ROW_H = 16;
const TRIP_HEADER_H = 15;
const TRIP_FILTER_H = 13;
const TRIP_ACTIONS_W = 36;
const FONT_TABLE = `600 9px ${FONT}`;

/** Archived trip rows visible below optional CURRENT row (for list scroll). */
export function travelLogArchiveRowSlots(listBox, engine) {
  if (!listBox) return 0;
  const y0 = listBox.y + 2 + TRIP_HEADER_H + TRIP_FILTER_H + 2;
  const listH = listBox.h - (y0 - listBox.y);
  const maxRows = Math.max(0, Math.floor(listH / TRIP_ROW_H));
  const showCurrent = engine._expeditionActive ? 1 : 0;
  const usedCurrent = Math.min(showCurrent, maxRows);
  return Math.max(0, maxRows - usedCurrent);
}

function travelLogColumns(box) {
  const x0 = box.x;
  const w = box.w;
  const sW = 16;
  const poiW = 20;
  const timeW = 30;
  const kmW = 28;
  const dateW = 50;
  const right = x0 + w - TRIP_ACTIONS_W;
  const poiX = right - poiW;
  const timeX = poiX - timeW;
  const kmX = timeX - kmW;
  const dateX = kmX - dateW;
  const nameX = x0 + sW + 2;
  const nameW = Math.max(24, dateX - nameX - 2);
  return {
    sW,
    sX: x0,
    nameX,
    nameW,
    dateX,
    dateW,
    kmX,
    kmW,
    timeX,
    timeW,
    poiX,
    poiW,
    lockX: right,
    delX: right + 18,
    actionsX: right,
    actionsW: TRIP_ACTIONS_W,
  };
}

function drawHeaderCell(ctx, panels, x, y, w, h, label, { align = 'left', active, dir, sortKey, filterKey, filterVal, table, engine } = {}) {
  ctx.fillStyle = 'rgba(30, 48, 64, 0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.2)';
  ctx.strokeRect(x, y, w, h);
  const filterW = filterKey ? 10 : 0;
  const textW = w - filterW - 2;
  let title = label;
  if (active && sortKey) title = `${label}${dir > 0 ? ' ▲' : ' ▼'}`;
  ctx.font = FONT_TABLE;
  ctx.fillStyle = active ? ACCENT : DIM;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const tx = align === 'right' ? x + textW : x + 2;
  ctx.fillText(title, tx, y + 11);
  if (filterKey) {
    const fx = x + w - filterW;
    ctx.fillStyle = filterVal && filterVal !== 'all' ? COPPER : 'rgba(100, 120, 140, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('▾', fx + filterW / 2, y + 11);
    const filterRegion = sortKey ? { x: fx, w: filterW } : { x, w };
    panels._region(filterRegion.x, y, filterRegion.w, h, (e) => {
      cycleTravelLogFilter(e.sectorMapView.travelLogTable, filterKey);
    });
  }
  if (sortKey) {
    panels._region(x, y, w - (filterKey ? 10 : 0), h, (e) => {
      cycleTravelLogSort(e.sectorMapView.travelLogTable, sortKey);
    });
  }
}

function drawFilterCell(ctx, panels, x, y, w, h, filterKey, table) {
  ctx.fillStyle = 'rgba(18, 32, 44, 0.65)';
  ctx.fillRect(x, y, w, h);
  const val = table.filter[filterKey];
  const active = val && val !== 'all';
  ctx.font = `500 8px ${FONT}`;
  ctx.fillStyle = active ? COPPER : 'rgba(120, 140, 160, 0.45)';
  ctx.textAlign = 'center';
  ctx.fillText(filterLabel(filterKey, val), x + w / 2, y + 9);
  panels._region(x, y, w, h, (e) => {
    cycleTravelLogFilter(e.sectorMapView.travelLogTable, filterKey);
  });
}

function drawTripRowCells(ctx, panels, cols, ry, row, log, { current = false, eid, entry, engine } = {}) {
  const yText = ry + 12;
  if (current) {
    ctx.fillStyle = 'rgba(120, 200, 255, 0.14)';
    ctx.fillRect(cols.sX - 2, ry - 1, cols.delX + 18 - cols.sX + 4, TRIP_ROW_H);
  }
  if (!current && entry) {
    panels._toggle(ctx, cols.sX, ry, 'S', entry.visibleOnMap, (e) => {
      e.travelLog.toggleVisible(eid);
      e.persistNavProfile();
    });
  } else {
    panels._text(ctx, '●', cols.sX + cols.sW / 2, yText, { size: 9, color: ACCENT, align: 'center' });
  }

  ctx.font = `600 9px ${FONT}`;
  const title = current
    ? `Exp #${engine.nextExpeditionId} · NOW`
    : log.expeditionTitle(entry);
  const nameColor = current ? ACCENT : TXT;
  ctx.fillStyle = nameColor;
  ctx.textAlign = 'left';
  ctx.fillText(truncateText(ctx, title, cols.nameW), cols.nameX, yText);

  const dateTs = current ? (engine.expeditionStartedAt ?? Date.now()) : (entry.endedAt ?? entry.startedAt);
  const km = current
    ? (trailDistance(engine.sectorMap.trail) / 100).toFixed(1)
    : ((entry.distanceTraveled ?? 0) / 100).toFixed(1);
  let durationMs;
  if (current) {
    durationMs = Date.now() - (engine.expeditionStartedAt ?? Date.now());
  } else {
    durationMs = tripDurationMs(entry);
  }
  const pois = current
    ? Math.max(0, engine.poiSystem.discovered().length - (engine._expeditionDiscoveredPoiCount ?? 0))
    : (entry.poisEncountered ?? 0);

  ctx.font = `500 9px ${FONT}`;
  ctx.fillStyle = current ? 'rgba(160, 210, 255, 0.85)' : DIM;
  ctx.textAlign = 'right';
  ctx.fillText(formatTripDate(dateTs), cols.dateX + cols.dateW - 2, yText);
  ctx.fillText(km, cols.kmX + cols.kmW - 2, yText);
  ctx.fillText(formatTripDuration(durationMs), cols.timeX + cols.timeW - 2, yText);
  ctx.fillText(String(pois), cols.poiX + cols.poiW - 2, yText);

  if (!current && entry) {
    panels.registerTravelLogRowRightClick(cols.sX, ry, cols.delX + 16 - cols.sX, TRIP_ROW_H, eid);
    panels._btnPadlock(ctx, cols.lockX, ry, entry.locked, (e) => {
      e.travelLog.toggleLock(eid);
      e.persistNavProfile();
    });
    if (!entry.locked) {
      panels._btnDanger(ctx, cols.delX, ry, 'X', (e) => {
        deleteTripEntry(e, eid);
      });
    }
  }
}

export function closeSectorMapModal(engine) {
  engine.sectorMapView.modal = null;
  engine.input?.endModalTextCapture?.();
}

export function openRenameTripModal(engine, entryId) {
  const ent = engine.travelLog.entries.find((x) => x.id === entryId);
  if (!ent) return;
  engine.sectorMapView.travelLogMenu = null;
  engine.sectorMapView.modal = {
    phase: 'rename',
    entryId,
    draft: engine.travelLog.expeditionTitle(ent),
  };
  engine.input?.beginModalTextCapture?.();
}

function commitRenameTrip(engine) {
  const modal = engine.sectorMapView.modal;
  if (!modal || modal.phase !== 'rename') return;
  engine.travelLog.setCustomName(modal.entryId, modal.draft);
  engine.persistNavProfile();
  closeSectorMapModal(engine);
}

const TRIP_RENAME_MAX_LEN = 32;

/** @returns {boolean} */
export function processSectorMapModalInput(engine) {
  const modal = engine.sectorMapView?.modal;
  if (!modal || modal.phase !== 'rename' || !engine.input) return false;
  let consumed = false;
  for (const ev of engine.input.consumeModalTextEvents()) {
    consumed = true;
    if (ev.type === 'escape') {
      closeSectorMapModal(engine);
    } else if (ev.type === 'enter') {
      commitRenameTrip(engine);
    } else if (ev.type === 'backspace') {
      modal.draft = String(modal.draft || '').slice(0, -1);
    } else if (ev.type === 'char' && ev.char) {
      const draft = String(modal.draft || '');
      if (draft.length < TRIP_RENAME_MAX_LEN) modal.draft = draft + ev.char;
    }
  }
  return consumed;
}

function deleteTripEntry(engine, eid) {
  const entry = engine.travelLog.entries.find((x) => x.id === eid);
  if (!entry || entry.locked) return;
  if (engine.travelLog.isRenamed(entry)) {
    engine.sectorMapView.modal = { phase: 'deleteOne', entryId: eid };
  } else {
    engine.travelLog.deleteEntry(eid);
    engine.persistNavProfile();
  }
}

function drawTravelLogContextMenu(ctx, listBox, engine, panels, menu) {
  const entry = engine.travelLog.entries.find((x) => x.id === menu.entryId);
  if (!entry) return;

  const w = 96;
  const rowH = 18;
  const items = [
    {
      label: 'RENAME',
      color: ACCENT,
      action: (e) => {
        e.sectorMapView.travelLogMenu = null;
        openRenameTripModal(e, menu.entryId);
      },
    },
    {
      label: entry.locked ? 'UNLOCK' : 'LOCK',
      color: TXT,
      action: (e) => {
        e.travelLog.toggleLock(menu.entryId);
        e.persistNavProfile();
      },
    },
  ];
  if (!entry.locked) {
    items.push({
      label: 'DELETE',
      color: 'rgba(255, 120, 120, 0.95)',
      action: (e) => deleteTripEntry(e, menu.entryId),
    });
  }

  const h = items.length * rowH;
  let x = menu.x;
  let y = menu.y;
  x = Math.max(listBox.x, Math.min(x, listBox.x + listBox.w - w));
  y = Math.max(listBox.y, Math.min(y, listBox.y + listBox.h - h));

  ctx.fillStyle = 'rgba(12, 24, 36, 0.97)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  items.forEach((item, i) => {
    const iy = y + i * rowH;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x + 4, iy);
      ctx.lineTo(x + w - 4, iy);
      ctx.stroke();
    }
    panels._text(ctx, item.label, x + w / 2, iy + 13, {
      size: 10,
      align: 'center',
      weight: 700,
      color: item.color,
    });
    panels._region(x, iy, w, rowH, item.action, { travelLogMenu: true });
  });
}

function drawTravelLogList(ctx, box, engine, panels) {
  const log = engine.travelLog;
  const view = engine.sectorMapView;
  const table = view.travelLogTable;
  const cols = travelLogColumns(box);
  const sort = table.sort;

  let y = box.y + 2;
  const headerY = y;
  y += TRIP_HEADER_H;

  drawHeaderCell(ctx, panels, cols.sX, headerY, cols.sW, TRIP_HEADER_H, 'S', {
    filterKey: 'map',
    filterVal: table.filter.map,
    table,
    engine,
  });
  drawHeaderCell(ctx, panels, cols.nameX, headerY, cols.nameW, TRIP_HEADER_H, 'NAME', {
    sortKey: 'name',
    active: sort.key === 'name',
    dir: sort.dir,
    filterKey: 'named',
    filterVal: table.filter.named,
    table,
    engine,
  });
  drawHeaderCell(ctx, panels, cols.dateX, headerY, cols.dateW, TRIP_HEADER_H, 'DATE', {
    sortKey: 'date',
    active: sort.key === 'date',
    dir: sort.dir,
    align: 'right',
    table,
    engine,
  });
  drawHeaderCell(ctx, panels, cols.kmX, headerY, cols.kmW, TRIP_HEADER_H, 'KM', {
    sortKey: 'dist',
    active: sort.key === 'dist',
    dir: sort.dir,
    align: 'right',
    filterKey: 'dist',
    filterVal: table.filter.dist,
    table,
    engine,
  });
  drawHeaderCell(ctx, panels, cols.timeX, headerY, cols.timeW, TRIP_HEADER_H, 'TIME', {
    sortKey: 'time',
    active: sort.key === 'time',
    dir: sort.dir,
    align: 'right',
    table,
    engine,
  });
  drawHeaderCell(ctx, panels, cols.poiX, headerY, cols.poiW, TRIP_HEADER_H, 'POI', {
    sortKey: 'poi',
    active: sort.key === 'poi',
    dir: sort.dir,
    align: 'right',
    filterKey: 'poi',
    filterVal: table.filter.poi,
    table,
    engine,
  });
  drawHeaderCell(ctx, panels, cols.actionsX, headerY, cols.actionsW, TRIP_HEADER_H, 'LK', {
    align: 'center',
    filterKey: 'locked',
    filterVal: table.filter.locked,
    table,
    engine,
  });

  const filterY = y;
  y += TRIP_FILTER_H;
  drawFilterCell(ctx, panels, cols.sX, filterY, cols.sW, TRIP_FILTER_H, 'map', table);
  drawFilterCell(ctx, panels, cols.nameX, filterY, cols.nameW, TRIP_FILTER_H, 'named', table);
  ctx.fillStyle = 'rgba(18, 32, 44, 0.35)';
  ctx.fillRect(cols.dateX, filterY, cols.dateW + cols.kmW + cols.timeW, TRIP_FILTER_H);
  drawFilterCell(ctx, panels, cols.kmX, filterY, cols.kmW, TRIP_FILTER_H, 'dist', table);
  drawFilterCell(ctx, panels, cols.poiX, filterY, cols.poiW, TRIP_FILTER_H, 'poi', table);
  drawFilterCell(ctx, panels, cols.actionsX, filterY, cols.actionsW, TRIP_FILTER_H, 'locked', table);

  const y0 = box.y + 2 + TRIP_HEADER_H + TRIP_FILTER_H + 2;
  const listH = box.h - (y0 - box.y);
  const maxRows = Math.max(0, Math.floor(listH / TRIP_ROW_H));
  let rowIndex = 0;

  const showCurrent = !!engine._expeditionActive;
  if (showCurrent && rowIndex < maxRows) {
    const ry = y0 + rowIndex * TRIP_ROW_H;
    rowIndex++;
    drawTripRowCells(ctx, panels, cols, ry, null, log, { current: true, engine });
  }

  const archiveSlots = Math.max(0, maxRows - rowIndex);
  const scroll = Math.min(table.listScroll || 0, travelLogListMaxScroll(engine, archiveSlots));
  table.listScroll = scroll;
  const sorted = applyTravelLogTable(log.entries, table, log).slice(scroll, scroll + archiveSlots);
  sorted.forEach((entry) => {
    const ry = y0 + rowIndex * TRIP_ROW_H;
    rowIndex++;
    drawTripRowCells(ctx, panels, cols, ry, entry, log, { eid: entry.id, entry, engine });
  });
}

function drawConfirmModal(ctx, box, engine, panels, modal) {
  ctx.fillStyle = 'rgba(8, 14, 22, 0.5)';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  panels._region(box.x, box.y, box.w, box.h, () => {});
  if (modal.phase === 'rename') {
    drawRenameTripModal(ctx, box, engine, panels, modal);
    return;
  }
  const w = Math.min(280, box.w - 8);
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
    title = 'DELETE TRIP?';
    body = 'Remove this renamed expedition?';
  } else if (modal.phase === 'deleteAll') {
    title = 'DELETE ALL?';
    body = `Includes renamed: ${(modal.names || []).join(', ')}`;
  }
  panels._text(ctx, title, x + 8, y + 16, { size: 12, weight: 700, color: COPPER });
  panels._text(ctx, body, x + 8, y + 36, { size: 11, color: TXT, weight: 400 });
  const by = y + h - 22;
  panels._btnWide(ctx, x + 8, by, w / 2 - 12, 'CANCEL', (e) => {
    closeSectorMapModal(e);
  });
  const okLabel = 'DELETE';
  panels._btnWide(ctx, x + w / 2 + 4, by, w / 2 - 12, okLabel, (e) => {
    const m = e.sectorMapView.modal;
    if (!m) return;
    if (m.phase === 'deleteOne' && m.entryId) {
      e.travelLog.deleteEntry(m.entryId);
      e.persistNavProfile();
    } else if (m.phase === 'deleteAll') {
      e.travelLog.deleteAllUnlocked();
      e.persistNavProfile();
    }
    closeSectorMapModal(e);
  });
}

function drawRenameTripModal(ctx, box, engine, panels, modal) {
  const w = Math.min(260, box.w - 12);
  const h = 108;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.fillStyle = 'rgba(12, 24, 36, 0.96)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  panels._text(ctx, 'RENAME EXPEDITION', x + 8, y + 16, { size: 12, weight: 700, color: COPPER });
  panels._text(ctx, 'Date and stats stay fixed', x + 8, y + 30, { size: 8, color: DIM, weight: 500 });
  panels._text(ctx, 'ENTER / OK · ESC / CANCEL', x + 8, y + 40, { size: 8, color: DIM, weight: 500 });

  const fieldX = x + 8;
  const fieldY = y + 48;
  const fieldW = w - 16;
  const fieldH = 18;
  ctx.fillStyle = 'rgba(30, 54, 76, 0.85)';
  ctx.fillRect(fieldX, fieldY, fieldW, fieldH);
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(fieldX, fieldY, fieldW, fieldH);

  const draft = String(modal.draft || '');
  ctx.font = `600 11px ${FONT}`;
  const display = truncateText(ctx, draft, fieldW - 14);
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
    closeSectorMapModal(e);
  });
  panels._btnWide(ctx, x + w / 2 + 4, by, w / 2 - 12, 'OK', (e) => {
    commitRenameTrip(e);
  });
}

export function sectorMapClick(engine, worldX, worldY, shiftKey) {
  if (engine.sectorMapView.modal || engine.poiBookModal?.surface === 'sectorMap') return true;
  engine.sectorMapView.sectorMapMenu = null;
  if (shiftKey) {
    engine.dropMapWaypoint(worldX, worldY);
    return true;
  }
  engine.pickOnSectorMap(worldX, worldY);
  return true;
}
