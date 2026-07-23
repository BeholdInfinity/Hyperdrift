/**
 * CockpitPanels — dynamic content for the six recessed cockpit screens plus the
 * ship-status alert overlay. The static chrome/frames live in CockpitFrame;
 * this draws live data on top each frame and registers clickable hit-regions
 * (tabs, list rows, pip buttons, POI toggles, comms buttons).
 *
 * Panel order (from CockpitFrame layout): 0 CONTACT DETAILS, 1 CONTACTS, 2 COMMS,
 * 3 DESTINATION, 4 SECTOR MAP, 5 POWER.
 */

import { IFF, PIPS } from '../core/Constants.js';
import { drawModularShip } from '../ships/ShipRenderer.js';
import { topDownView } from '../ships/ShipViews.js';
import {
  drawSectorMapPanel,
  sectorMapClick,
  sectorMapRightClick,
  sectorMapMiddleClick,
  drawPoiPinContextMenu,
  drawPoiBookModal,
  travelLogArchiveRowSlots,
  updateSectorMapMarkerHover,
} from './SectorMapPanel.js';
import { stepTravelLogListScroll } from '../world/TravelLogTable.js';
import {
  drawPipLoadoutPanel,
  drawPipLoadoutPreview,
  drawPipLoadoutModal,
  PIP_LABELS,
  processPipLoadoutInput,
  pipLoadoutRightClick,
  closePipLoadoutModal,
} from './PipLoadoutPanel.js';
import {
  buildNavTelemetry,
  buildZoomRadarTelemetry,
  drawNavCorner,
  drawZoomCorner,
  drawNavRangeBearingRow,
} from './TelemetryCorner.js';

const FONT = "'Barlow Condensed', 'Segoe UI', sans-serif";
const TXT = 'rgba(200, 224, 246, 0.9)';
const DIM = 'rgba(150, 178, 202, 0.55)';
const COPPER = 'rgba(230, 171, 109, 0.92)';
const ACCENT = 'rgba(120, 200, 255, 0.85)';
const PIP_FLASH_GREEN = 'rgba(95, 224, 138, 0.95)';
const PIP_FLASH_RED = 'rgba(255, 120, 120, 0.95)';
/** Muted green for STATUS corner readout (less vivid than IFF.green). */
const STATUS_OK = 'rgba(108, 158, 128, 0.9)';
/** MODES corner switch — inactive segment label (readable on dark glass). */
const MODE_SEG_OFF = 'rgba(165, 192, 214, 0.72)';
/** MODES corner switch — active segment label. */
const MODE_SEG_ON = 'rgba(235, 248, 255, 0.96)';

function clipPanelRect(ctx, x, y, w, h, fn) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  fn();
  ctx.restore();
}

/** Shrink font until `text` fits `maxW` (px). */
function fitTextFs(ctx, text, maxW, preferFs, weight, minFs = 7) {
  for (let fs = preferFs; fs >= minFs; fs--) {
    ctx.font = `${weight} ${fs}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) return fs;
  }
  return minFs;
}

export class CockpitPanels {
  constructor() {
    this.tabs = { destination: 0, power: 0, sector: 0 };
    this._mapDragTracking = false;
    /** @type {Array<{x:number,y:number,w:number,h:number,action:Function}>} */
    this._regions = [];
    /** @type {Array<{x:number,y:number,w:number,h:number,entryId:string}>} */
    this._travelLogRightRegions = [];
    /** @type {Array<{x:number,y:number,w:number,h:number,poiId:string}>} */
    this._poiBookRightRegions = [];
    /** @type {Array<{x:number,y:number,w:number,h:number,entryId:string}>} */
    this._pipLoadoutRightRegions = [];
    /** @type {Array<{x:number,y:number,w:number,h:number,entryId:string}>} */
    this._pipLinkedLoadoutRightRegions = [];
    /** @type {null | { poiId: string, x: number, y: number }} */
    this.poiBookMenu = null;
    /** @type {null | { poiId: string, time: number }} */
    this._poiBookLastClick = null;
    this._routeListScroll = 0;
  }

  render(ctx, engine) {
    const layout = engine.cockpitFrame.layout;
    if (!layout || !layout.panels || layout.panels.length < 6) return;
    this._regions = [];
    this._travelLogRightRegions = [];
    this._poiBookRightRegions = [];
    this._pipLoadoutRightRegions = [];
    this._pipLinkedLoadoutRightRegions = [];
    const p = layout.panels;
    this._contact(ctx, this._content(p[0]), engine);
    this._contactsList(ctx, this._content(p[1]), engine);
    this._comms(ctx, this._content(p[2]), engine);
    this._destination(ctx, this._content(p[3]), engine);
    this._sectorMap(ctx, this._content(p[4]), engine);
    this._power(ctx, this._content(p[5]), engine);
    this._shipStatusCorner(ctx, engine);
    this._telemetryCorner(ctx, engine);
    this._zoomCorner(ctx, engine);
    this._modeSwitches(ctx, engine);
    this._alertOverlay(ctx, engine);
  }

  // ---- MODES switch stack (bottom-left corner) ---------------------------
  /**
   * A tidy stack of two-position mode switches filling the MODES corner screen
   * (baked title "MODES"). Each row is a labelled slide switch; the list is
   * built to leave headroom for future toggles. Rows register click regions
   * routed through handleClick.
   */
  _modeSwitches(ctx, engine) {
    const g = engine.cockpitFrame?.cornerScreen('MODES');
    if (!g) return;

    const pad = Math.max(3, Math.min(g.w, g.h) * 0.04);
    const titleBand = Math.max(14, g.h * 0.18);
    const box = {
      x: g.x + pad,
      y: g.y + titleBand,
      w: g.w - pad * 2,
      h: g.h - titleBand - pad,
    };
    if (box.w < 8 || box.h < 8) return;

    const precAccent = engine.precisionActive
      ? { fill: 'rgba(95, 224, 138, 0.34)', line: IFF.green }
      : { fill: 'rgba(120, 200, 255, 0.26)', line: ACCENT };
    const accent = { fill: 'rgba(120, 200, 255, 0.30)', line: ACCENT };

    const rows = [
      {
        cap: 'PREC',
        off: 'OFF',
        on: 'ON',
        active: engine.precisionActive,
        color: precAccent,
        click: (e) => e.togglePrecision(),
      },
      {
        cap: 'ORIENT',
        off: 'SHIP',
        on: 'NORTH',
        active: engine.viewMode === 'world',
        color: accent,
        click: (e) => e.toggleViewMode(),
      },
      {
        cap: 'VIEW',
        off: 'SHIP',
        on: 'SCAN',
        active: engine.scanView === 'scan',
        color: accent,
        click: (e) => e.toggleScanView(),
      },
    ];

    const rowCount = rows.length;
    const rowGap = Math.max(2, Math.floor(box.h * 0.04));
    const rowH = (box.h - rowGap * (rowCount - 1)) / rowCount;
    if (rowH < 12) return;

    const layout = this._modeSwitchLayout(ctx, box, rows, rowH);
    if (layout.switchW < 24) return;

    clipPanelRect(ctx, box.x, box.y, box.w, box.h, () => {
      rows.forEach((row, i) => {
        const y = box.y + i * (rowH + rowGap);
        if (y + rowH > box.y + box.h + 0.5) return;
        clipPanelRect(ctx, box.x, y, box.w, rowH, () => {
          this._modeSwitchRow(ctx, box, y, rowH, row, layout);
        });
      });
    });
  }

  /** Shared cap column + switch width so every MODES row aligns. */
  _modeSwitchLayout(ctx, box, rows, rowH) {
    const capFs = Math.max(8, Math.min(11, Math.floor(rowH * 0.44)));
    ctx.font = `700 ${capFs}px ${FONT}`;
    const capColW = rows.reduce(
      (max, row) => Math.max(max, Math.ceil(ctx.measureText(row.cap).width)),
      0,
    );
    const labelGap = 4;
    const switchH = Math.max(14, Math.min(20, rowH - 2));
    const segPad = 3;
    let labelFs = Math.max(7, Math.min(10, Math.floor(switchH * 0.46)));

    const ref = rows.find((row) => row.cap === 'ORIENT') || rows[0];
    labelFs = Math.min(
      labelFs,
      fitTextFs(ctx, ref.off, 999, labelFs, 700),
      fitTextFs(ctx, ref.on, 999, labelFs, 700),
    );
    const switchW = Math.max(0, box.w - capColW - labelGap);

    return { capColW, labelGap, switchW, switchH, capFs, labelFs, segPad };
  }

  _modeSwitchRow(ctx, box, y, h, row, layout) {
    const { capColW, labelGap, switchW, switchH, capFs, labelFs, segPad } = layout;
    if (switchW < 24) return;

    const midY = y + h / 2;
    const capX = box.x;
    clipPanelRect(ctx, capX, y, capColW, h, () => {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${capFs}px ${FONT}`;
      ctx.fillStyle = COPPER;
      ctx.fillText(row.cap, capX, midY);
    });

    const sx = box.x + capColW + labelGap;
    const sy = y + (h - switchH) / 2;
    this._modeSwitch(ctx, sx, sy, switchW, switchH, row.off, row.on, row.active, row.color, {
      labelFs,
      segPad,
    });
    this._region(sx, sy, switchW, switchH, row.click);
  }

  /** One slide switch: track + lit half on the active side + segment labels. */
  _modeSwitch(ctx, x, y, w, h, leftLabel, rightLabel, rightActive, color, opts = {}) {
    const r = h / 2;
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(18, 32, 48, 0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const half = w / 2;
    const knobX = rightActive ? x + half : x;
    this._roundRect(ctx, knobX + 1, y + 1, half - 2, h - 2, Math.max(1, r - 1));
    ctx.fillStyle = color.fill;
    ctx.fill();
    ctx.strokeStyle = color.line;
    ctx.lineWidth = 1.25;
    ctx.stroke();

    const pad = opts.segPad ?? 3;
    const halfInner = Math.max(0, half - pad * 2);
    let fs = opts.labelFs ?? Math.max(7, Math.min(10, Math.floor(h * 0.46)));
    fs = Math.min(
      fs,
      fitTextFs(ctx, leftLabel, halfInner, fs, 700),
      fitTextFs(ctx, rightLabel, halfInner, fs, 700),
    );

    const ty = y + h / 2;
    ctx.font = `700 ${fs}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    clipPanelRect(ctx, x, y, half, h, () => {
      ctx.fillStyle = rightActive ? MODE_SEG_OFF : MODE_SEG_ON;
      ctx.fillText(leftLabel, x + half / 2, ty);
    });

    clipPanelRect(ctx, x + half, y, half, h, () => {
      ctx.fillStyle = rightActive ? MODE_SEG_ON : MODE_SEG_OFF;
      ctx.fillText(rightLabel, x + half + half / 2, ty);
    });
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** Inner content box of a panel screen (below its baked title header). */
  _content(rect) {
    const s = rect.screen;
    if (s) {
      return {
        x: s.x + 6,
        y: s.y + 22,
        w: s.w - 12,
        h: s.h - 28,
      };
    }
    const pad = Math.max(4, Math.min(rect.w, rect.h) * 0.1);
    return {
      x: rect.x + pad + 8,
      y: rect.y + pad + 26,
      w: rect.w - pad * 2 - 16,
      h: rect.h - pad * 2 - 34,
    };
  }

  _region(x, y, w, h, action, opts = {}) {
    this._regions.push({
      x,
      y,
      w,
      h,
      action,
      anyPointer: !!opts.anyPointer,
      travelLogMenu: !!opts.travelLogMenu,
      sectorMapMenu: !!opts.sectorMapMenu,
      poiBookMenu: !!opts.poiBookMenu,
    });
  }

  _dismissContextMenus(engine, x, y) {
    const view = engine.sectorMapView;
    const menuTags = [
      { open: view?.sectorMapMenu, key: 'sectorMapMenu', clear: () => {
        view.sectorMapMenu = null;
      } },
      { open: view?.travelLogMenu, key: 'travelLogMenu', clear: () => {
        view.travelLogMenu = null;
      } },
      { open: this.poiBookMenu, key: 'poiBookMenu', clear: () => {
        this.poiBookMenu = null;
      } },
    ];
    for (const m of menuTags) {
      if (!m.open) continue;
      for (let i = this._regions.length - 1; i >= 0; i--) {
        const r = this._regions[i];
        if (!r[m.key]) continue;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          r.action(engine);
          m.clear();
          return true;
        }
      }
      m.clear();
    }
    return false;
  }

  /** Route a screen-space click; returns true if consumed. */
  handleClick(x, y, engine) {
    return this._handlePointer(x, y, engine, 'primary');
  }

  /** Route a middle-click on contact-list rows (and other anyPointer regions). */
  handleMiddleClick(x, y, engine) {
    return this._handlePointer(x, y, engine, 'middle');
  }

  _handlePointer(x, y, engine, pointer) {
    if (this._dismissContextMenus(engine, x, y)) return true;
    for (let i = this._regions.length - 1; i >= 0; i--) {
      const r = this._regions[i];
      if (pointer === 'middle' && !r.anyPointer) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        r.action(engine);
        return true;
      }
    }
    return false;
  }

  /** Right-click on travel log rows opens rename menu. */
  handleRightClick(x, y, engine) {
    if (pipLoadoutRightClick(engine, x, y, this)) {
      engine.sectorMapView.travelLogMenu = null;
      this.poiBookMenu = null;
      return true;
    }
    if (engine.sectorMapView?.tabs?.sector === 1) {
      for (const r of this._travelLogRightRegions) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          engine.sectorMapView.sectorMapMenu = null;
          engine.sectorMapView.travelLogMenu = { entryId: r.entryId, x, y };
          this.poiBookMenu = null;
          return true;
        }
      }
    }
    if (sectorMapRightClick(engine, x, y)) {
      engine.sectorMapView.travelLogMenu = null;
      this.poiBookMenu = null;
      return true;
    }
    if (this._tryPoiBookRightClick(engine, x, y)) {
      engine.sectorMapView.sectorMapMenu = null;
      engine.sectorMapView.travelLogMenu = null;
      return true;
    }
    if (engine.sectorMapView?.sectorMapMenu) engine.sectorMapView.sectorMapMenu = null;
    if (engine.sectorMapView?.travelLogMenu) engine.sectorMapView.travelLogMenu = null;
    if (this.poiBookMenu) this.poiBookMenu = null;
    return false;
  }

  _tryPoiBookRightClick(engine, x, y) {
    if (this.tabs.destination !== 1) return false;
    for (const r of this._poiBookRightRegions) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.poiBookMenu = { poiId: r.poiId, x, y };
        return true;
      }
    }
    return false;
  }

  registerPoiBookRowRightClick(x, y, w, h, poiId) {
    this._poiBookRightRegions.push({ x, y, w, h, poiId });
  }

  registerTravelLogRowRightClick(x, y, w, h, entryId) {
    this._travelLogRightRegions.push({ x, y, w, h, entryId });
  }

  registerPipLoadoutRowRightClick(x, y, w, h, entryId) {
    this._pipLoadoutRightRegions.push({ x, y, w, h, entryId });
  }

  registerPipLinkedLoadoutRightClick(x, y, w, h, entryId) {
    this._pipLinkedLoadoutRightRegions.push({ x, y, w, h, entryId });
  }

  _text(ctx, s, x, y, { size = 14, color = TXT, align = 'left', weight = 600 } = {}) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  }

  /** @returns {number} row height consumed */
  _drawNavRangeBearing(ctx, box, y, rngKm, bearingRad, { fs = 10, weight = 500 } = {}) {
    const rowH = fs + 4;
    return drawNavRangeBearingRow(ctx, box, y, rowH, rngKm, bearingRad, { fs, weight });
  }

  /**
   * Bounded nav target block: optional header, name, RNG/BRG row, optional meta footer.
   * Lays out top-down within `box` — caller should clip to `box`.
   * @returns {number} pixels used from box top
   */
  _drawNavTargetSection(ctx, box, spec) {
    const density = spec.density || 'full';
    const headerFs = density === 'full' ? 10 : 9;
    const nameFs = density === 'full' ? 13 : 10;
    const statsFs = density === 'full' ? 11 : 10;
    const topPad = density === 'split' ? 3 : density === 'compact' ? 4 : 6;
    let y = box.y + topPad;

    if (spec.header) {
      this._text(ctx, spec.header, box.x, y + headerFs, {
        size: headerFs,
        color: COPPER,
        weight: 700,
      });
      y += headerFs + (density === 'split' ? 3 : 5);
    }

    ctx.font = `700 ${nameFs}px ${FONT}`;
    let name = (spec.name || '').toUpperCase();
    const maxW = Math.max(8, box.w - 2);
    if (ctx.measureText(name).width > maxW) {
      while (name.length > 1 && ctx.measureText(`${name}…`).width > maxW) name = name.slice(0, -1);
      name += '…';
    }
    this._text(ctx, name, box.x, y + nameFs, {
      color: spec.nameColor || TXT,
      size: nameFs,
      weight: 700,
    });
    y += nameFs + (density === 'split' ? 5 : 7);

    const rowH = this._drawNavRangeBearing(ctx, box, y, spec.rng, spec.bearing, {
      fs: statsFs,
      weight: 500,
    });
    y += rowH + 2;

    if (spec.meta) {
      const metaFs = 9;
      if (y + metaFs + 1 <= box.y + box.h) {
        this._text(ctx, spec.meta, box.x, y + metaFs, {
          size: metaFs,
          weight: 500,
          color: DIM,
        });
        y += metaFs + 2;
      }
    }

    return y - box.y;
  }

  _clip(ctx, box, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    fn();
    ctx.restore();
  }

  // ---- 0 CONTACT DETAILS ------------------------------------------------
  _contact(ctx, box, engine) {
    const c = engine.scannerSystem.getSelected();
    if (!c) {
      this._text(ctx, 'NO CONTACT SELECTED', box.x, box.y + 16, { color: DIM, size: 13 });
      this._text(ctx, 'LMB/MMB blip or list; MMB hull', box.x, box.y + 34, {
        color: DIM,
        size: 12,
        weight: 400,
      });
      return;
    }
    const color = IFF[c.iff] || IFF.yellow;
    this._text(ctx, c.name.toUpperCase(), box.x, box.y + 14, { color, size: 16, weight: 700 });
    const km = (c.dist / 100).toFixed(1);
    const closing = c.closing < 0 ? `${Math.abs(c.closing).toFixed(0)} closing` : `${c.closing.toFixed(0)} opening`;
    const rows = [
      `TYPE  ${c.type.toUpperCase()}`,
      `IFF   ${c.iff.toUpperCase()}`,
      `RANGE ${km} km`,
      `REL V ${closing}`,
    ];
    rows.forEach((s, i) => this._text(ctx, s, box.x, box.y + 34 + i * 15, { size: 12, weight: 500 }));

    // Top-down render of the contact's hull (if any) in the lower half.
    const shipDef = c.ref?.shipDef;
    const renderBox = { x: box.x + box.w * 0.5, y: box.y + 20, w: box.w * 0.5, h: box.h - 40 };
    if (shipDef && c.ref) {
      this._clip(ctx, renderBox, () => {
        const fit = Math.min(renderBox.w, renderBox.h) / 90;
        ctx.save();
        ctx.translate(renderBox.x + renderBox.w / 2, renderBox.y + renderBox.h / 2);
        ctx.scale(fit, fit);
        ctx.rotate(-Math.PI / 2);
        try {
          drawModularShip(ctx, c.ref, topDownView());
        } catch (_) {
          /* ignore render errors on exotic defs */
        }
        ctx.restore();
      });
    }

    // Forward Looking Scanner pip gates cargo detail.
    const scannerPips = engine.pipSystem.get('scanner');
    const y = box.y + box.h - 4;
    if (scannerPips > 0) {
      const cargo = c.type === 'civilian' ? 'ORE, ALLOY (est.)' : c.type === 'station' ? 'TRADE HUB' : '—';
      this._text(ctx, `CARGO ${cargo}`, box.x, y, { size: 12, color: ACCENT, weight: 500 });
    } else {
      this._text(ctx, 'CARGO — scanner offline', box.x, y, { size: 11, color: DIM, weight: 400 });
    }
  }

  // ---- 1 CONTACTS --------------------------------------------------------
  _contactsList(ctx, box, engine) {
    const scan = engine.scannerSystem;
    const f = scan.contactFilters;
    const allOn = f.ship && f.station && f.other;

    // Filter chip row — also gates scanner blips / pick / selection.
    const chips = [
      { key: 'all', label: 'ALL', on: allOn },
      { key: 'ship', label: 'SHIP', on: f.ship },
      { key: 'station', label: 'STN', on: f.station },
      { key: 'other', label: 'OTHER', on: f.other },
    ];
    const gap = 3;
    const chipH = 16;
    const chipW = (box.w - gap * (chips.length - 1)) / chips.length;
    chips.forEach((chip, i) => {
      const bx = box.x + i * (chipW + gap);
      const by = box.y;
      ctx.fillStyle = chip.on ? 'rgba(40, 70, 100, 0.85)' : 'rgba(20, 32, 48, 0.7)';
      ctx.fillRect(bx, by, chipW, chipH);
      ctx.strokeStyle = chip.on ? 'rgba(120, 200, 255, 0.55)' : 'rgba(80, 110, 140, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, chipW, chipH);
      this._text(ctx, chip.label, bx + chipW / 2, by + 12, {
        size: 10,
        align: 'center',
        weight: 600,
        color: chip.on ? ACCENT : DIM,
      });
      const key = chip.key;
      this._region(bx, by, chipW, chipH, () => {
        if (key === 'all') {
          const next = !(f.ship && f.station && f.other);
          f.ship = next;
          f.station = next;
          f.other = next;
        } else {
          f[key] = !f[key];
        }
      });
    });

    const listY = box.y + chipH + 6;
    const listH = box.h - chipH - 6;
    if (!scan.on) {
      this._text(ctx, 'RADAR OFFLINE', box.x, listY + 16, { color: DIM, size: 13 });
      return;
    }
    const list = scan.contacts.filter((c) => scan.passesContactFilter(c));
    if (!list.length) {
      this._text(
        ctx,
        scan.contacts.length ? 'NO MATCHING CONTACTS' : 'NO CONTACTS IN RANGE',
        box.x,
        listY + 16,
        { color: DIM, size: 13 }
      );
      return;
    }
    const rowH = 18;
    const max = Math.floor(listH / rowH);
    const listBox = { x: box.x, y: listY, w: box.w, h: listH };
    this._clip(ctx, listBox, () => {
      for (let i = 0; i < Math.min(list.length, max); i++) {
        const c = list[i];
        const ry = listY + i * rowH;
        const sel = c.id === scan.selectedId;
        if (sel) {
          ctx.fillStyle = 'rgba(120, 200, 255, 0.14)';
          ctx.fillRect(box.x - 4, ry, box.w + 8, rowH);
        }
        const color = IFF[c.iff] || IFF.yellow;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(box.x + 4, ry + rowH / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        this._text(ctx, c.name, box.x + 14, ry + 13, { size: 12, weight: 500 });
        this._text(ctx, `${(c.dist / 100).toFixed(1)}km`, box.x + box.w, ry + 13, {
          size: 12,
          align: 'right',
          color: DIM,
          weight: 400,
        });
        const id = c.id;
        this._region(box.x - 4, ry, box.w + 8, rowH, (e) => e.toggleContact(id), {
          anyPointer: true,
        });
      }
    });
  }

  // ---- 2 COMMS -----------------------------------------------------------
  _comms(ctx, box, engine) {
    const c = engine.scannerSystem.getSelected();
    const inRange = c && (c.state === 'visual' || c.state === 'in');
    if (!inRange) {
      this._text(ctx, 'NO COMMS TARGET', box.x, box.y + 16, { color: DIM, size: 13 });
      this._text(ctx, 'Select an in-range contact', box.x, box.y + 34, {
        color: DIM,
        size: 11,
        weight: 400,
      });
      return;
    }
    // Caller "video" placeholder.
    const av = { x: box.x, y: box.y, w: Math.min(48, box.h - 24), h: Math.min(48, box.h - 24) };
    ctx.fillStyle = 'rgba(20, 40, 60, 0.8)';
    ctx.fillRect(av.x, av.y, av.w, av.h);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.strokeRect(av.x, av.y, av.w, av.h);
    this._text(ctx, '◊', av.x + av.w / 2, av.y + av.h / 2 + 6, {
      size: 22,
      color: DIM,
      align: 'center',
    });
    this._text(ctx, c.name, av.x + av.w + 8, box.y + 14, { size: 13, color: COPPER, weight: 700 });
    this._text(ctx, '"Standby, transmitting…"', av.x + av.w + 8, box.y + 30, {
      size: 11,
      color: TXT,
      weight: 400,
    });
    // Action buttons.
    const btns = ['HAIL', 'DOCK', 'TRADE', 'END'];
    const bw = (box.w - 6 * 3) / 4;
    const by = box.y + box.h - 20;
    btns.forEach((label, i) => {
      const bx = box.x + i * (bw + 6);
      ctx.fillStyle = label === 'END' ? 'rgba(120, 40, 40, 0.6)' : 'rgba(30, 54, 76, 0.7)';
      ctx.fillRect(bx, by, bw, 18);
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.3)';
      ctx.strokeRect(bx, by, bw, 18);
      this._text(ctx, label, bx + bw / 2, by + 13, { size: 11, align: 'center', weight: 600 });
      this._region(bx, by, bw, 18, () => {});
    });
  }

  // ---- 3 DESTINATION -----------------------------------------------------
  _destination(ctx, box, engine) {
    const btnH = 18;
    const btnW = 72;
    const footerPad = 2;
    const body = { x: box.x, y: box.y, w: box.w, h: box.h - btnH - footerPad };
    const poiBookOpen = this.tabs.destination === 1;
    if (poiBookOpen) {
      const navH = Math.max(52, Math.floor(body.h * 0.4));
      const navBox = { x: body.x, y: body.y, w: body.w, h: navH };
      this._drawNavSummary(ctx, navBox, engine, { compact: true });
      const divY = body.y + navH;
      ctx.strokeStyle = COPPER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(body.x, divY);
      ctx.lineTo(body.x + body.w, divY);
      ctx.stroke();
      const drawer = { x: body.x, y: divY + 2, w: body.w, h: body.h - navH - 2 };
      this._drawPoiBookPanel(ctx, drawer, engine);
    } else {
      this._drawNavSummary(ctx, body, engine, { compact: false });
    }
    const footerY = box.y + box.h - btnH;
    const toggleW = this._drawFooterToggle(
      ctx,
      box.x,
      footerY,
      btnW,
      btnH,
      'POI BOOK',
      poiBookOpen,
      (e) => this._togglePoiBook(e),
    );
    if (poiBookOpen) {
      this._drawFooterDeleteAll(ctx, box, footerY, btnH, toggleW, 8, (e) => {
        const { renamedUnlocked } = e.poiSystem.previewDeleteAllUnlocked();
        if (renamedUnlocked.length) {
          e.poiBookModal = {
            phase: 'deleteAll',
            surface: 'poiBook',
            names: renamedUnlocked.map((p) => p.name),
          };
        } else {
          e.poiSystem.deleteAllUnlocked();
          e.persistNavProfile();
        }
      });
    }
    if (engine.poiBookModal?.surface === 'poiBook') {
      drawPoiBookModal(ctx, box, engine, this);
    }
  }

  /** @returns {number} drawn button width */
  _drawFooterToggle(ctx, x, y, minW, h, label, active, action) {
    const displayLabel = active ? `CLOSE ${label}` : label;
    const fs = 10;
    ctx.font = `700 ${fs}px ${FONT}`;
    const w = Math.max(minW, Math.ceil(ctx.measureText(displayLabel).width) + 14);
    ctx.fillStyle = active ? 'rgba(120, 200, 255, 0.22)' : 'rgba(30, 54, 76, 0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = active ? ACCENT : 'rgba(120, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    this._text(ctx, displayLabel, x + w / 2, y + h - 4, {
      size: fs,
      align: 'center',
      weight: 700,
      color: active ? ACCENT : TXT,
    });
    this._region(x, y, w, h, action);
    return w;
  }

  /** @returns {number} button width, or 0 if it would not fit */
  _footerDeleteAllWidth(ctx, maxW) {
    const label = 'DELETE ALL UNLOCKED';
    const fs = 9;
    ctx.font = `700 ${fs}px ${FONT}`;
    const delW = Math.min(maxW - 4, Math.ceil(ctx.measureText(label).width) + 12);
    return delW >= 48 ? delW : 0;
  }

  /** Right-aligned **DELETE ALL UNLOCKED**; `minLeftOffset` is min x from panel left edge. */
  _drawFooterDeleteAll(ctx, panelBox, footerY, btnH, minLeftOffset, gap, action) {
    const label = 'DELETE ALL UNLOCKED';
    const fs = 9;
    ctx.font = `700 ${fs}px ${FONT}`;
    const delW = Math.min(
      panelBox.w - minLeftOffset - gap - 4,
      Math.ceil(ctx.measureText(label).width) + 12,
    );
    const delX = panelBox.x + panelBox.w - delW;
    if (delW < 48 || delX < panelBox.x + minLeftOffset + gap) return;
    this._btnWide(ctx, delX, footerY, delW, label, action, btnH);
  }

  /** @returns {number} footer **RECENTER** button width */
  _footerRecenterWidth(ctx) {
    const label = 'RECENTER';
    const fs = 10;
    ctx.font = `700 ${fs}px ${FONT}`;
    return Math.max(62, Math.ceil(ctx.measureText(label).width) + 14);
  }

  _drawFooterRecenter(ctx, x, y, w, h, action) {
    this._btnWide(ctx, x, y, w, 'RECENTER', action, h);
  }

  _togglePoiBook(engine) {
    if (this.tabs.destination === 1) {
      this.tabs.destination = 0;
      this.poiBookMenu = null;
      if (engine.poiBookModal?.surface === 'poiBook') engine.poiBookModal = null;
    } else {
      this.tabs.destination = 1;
    }
  }

  _toggleTravelLog(engine) {
    const view = engine.sectorMapView;
    if (view.tabs.sector === 1) {
      view.tabs.sector = 0;
      view.travelLogMenu = null;
      view.modal = null;
      if (engine.poiBookModal?.surface === 'sectorMap') engine.poiBookModal = null;
    } else {
      view.tabs.sector = 1;
    }
  }

  _toggleLoadouts(engine) {
    if (this.tabs.power === 1) {
      this.tabs.power = 0;
      engine.pipLoadoutHover = null;
      closePipLoadoutModal(engine);
    } else {
      this.tabs.power = 1;
    }
  }

  _drawNavSummary(ctx, box, engine, { compact }) {
    const midX = box.x + Math.floor(box.w * 0.58);
    ctx.strokeStyle = 'rgba(230, 171, 109, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, box.y);
    ctx.lineTo(midX, box.y + box.h);
    ctx.stroke();

    const left = { x: box.x, y: box.y, w: midX - box.x - 3, h: box.h };
    const right = { x: midX + 3, y: box.y, w: box.x + box.w - midX - 3, h: box.h };
    this._clip(ctx, left, () => this._drawLeftNavColumn(ctx, left, engine, compact));
    this._drawRouteList(ctx, right, engine, compact);
  }

  /** Left column: next nav stop + optional selected POI (copper divider). */
  _drawLeftNavColumn(ctx, box, engine, compact) {
    const poi = engine.poiSystem.getSelected();
    const stop = engine.navRoute.activeStop();
    const samePoi = poi && stop?.kind === 'poi' && stop.poiId === poi.id;
    const showSelected = poi && !samePoi && !compact;

    if (!showSelected) {
      this._drawNextDestination(ctx, box, engine, compact);
      return;
    }

    const minSectionH = 54;
    let splitY = box.y + Math.floor(box.h / 2);
    if (box.h < minSectionH * 2) {
      splitY = box.y + Math.max(minSectionH, box.h - minSectionH);
    }
    const nextBox = { x: box.x, y: box.y, w: box.w, h: splitY - box.y - 1 };
    const selBox = {
      x: box.x,
      y: splitY + 2,
      w: box.w,
      h: box.y + box.h - splitY - 2,
    };

    this._clip(ctx, nextBox, () => this._drawNextDestination(ctx, nextBox, engine, compact, true));

    ctx.strokeStyle = COPPER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, splitY);
    ctx.lineTo(box.x + box.w, splitY);
    ctx.stroke();

    this._clip(ctx, selBox, () =>
      this._drawSelectedPoi(ctx, selBox, engine, compact, { split: true }),
    );
  }

  _drawNextDestination(ctx, box, engine, compact, split = false) {
    const route = engine.navRoute;
    route.resolvePosition(engine);
    const stop = route.activeStop();
    const tight = compact && !split && box.h < 42;
    const density = split ? 'split' : compact ? 'compact' : 'full';

    if (!stop) {
      const headerLabel = tight ? 'NEXT' : split ? 'NEXT' : compact ? 'NEXT DEST' : 'NEXT DESTINATION';
      this._text(ctx, headerLabel, box.x, box.y + (tight ? 9 : 10), {
        size: tight ? 8 : split ? 9 : 10,
        color: COPPER,
        weight: 700,
      });
      this._text(ctx, 'NO ACTIVE STOP', box.x, box.y + (tight ? 18 : 22), {
        color: DIM,
        size: tight ? 10 : 11,
      });
      return;
    }

    const color = route.stopColor(engine, stop);
    const { range, bearing } = route.rangeBearing(engine.ship, stop);
    const rng = (range / 100).toFixed(0);
    const headerLabel = tight ? 'NEXT' : split ? 'NEXT' : compact ? 'NEXT DEST' : 'NEXT DESTINATION';

    if (tight) {
      this._text(ctx, headerLabel, box.x, box.y + 9, { size: 8, color: COPPER, weight: 700 });
      this._text(ctx, stop.label.toUpperCase(), box.x, box.y + 18, { color, size: 10, weight: 700 });
      return;
    }

    this._drawNavTargetSection(ctx, box, {
      header: headerLabel,
      name: stop.label,
      nameColor: color,
      rng,
      bearing,
      meta: !compact && !split && stop.kind === 'poi' ? 'POI' : null,
      density,
    });
  }

  _drawSelectedPoi(ctx, box, engine, compact, { skipHeader = false, split = false } = {}) {
    const poi = engine.poiSystem.getSelected();
    if (!poi) return;

    const density = split ? 'split' : compact ? 'compact' : 'full';
    const color = engine.poiSystem.color(poi);
    const rng = (engine.poiSystem.range(engine.ship, poi) / 100).toFixed(0);
    const poiBearing = engine.poiSystem.bearing(engine.ship, poi);
    const headerLabel =
      skipHeader ? null : split ? 'SEL POI' : compact && box.h < 36 ? 'SEL POI' : 'SELECTED POI';

    this._drawNavTargetSection(ctx, box, {
      header: headerLabel,
      name: poi.name,
      nameColor: color,
      rng,
      bearing: poiBearing,
      meta: poi.source ? poi.source.toUpperCase() : null,
      density,
    });
  }

  _drawRouteList(ctx, box, engine, compact) {
    const route = engine.navRoute;
    const stops = route.stops;
    const rowH = compact ? 16 : 18;
    const btnS = compact ? 12 : 14;
    const headerY = box.y + (compact ? 11 : 13);

    this._text(ctx, 'ROUTE', box.x, headerY, { size: compact ? 9 : 10, color: COPPER, weight: 700 });
    const countLabel = stops.length ? `${stops.length}` : '0';
    this._text(ctx, countLabel, box.x + 36, headerY, { size: compact ? 9 : 10, color: DIM, weight: 600 });

    const clearLabel = compact ? 'CLR' : 'CLEAR ALL';
    const clearW = compact ? 28 : 52;
    const clearX = box.x + box.w - clearW;
    const clearY = box.y + (compact ? 0 : 0);
    this._btnWide(
      ctx,
      clearX,
      clearY,
      clearW,
      clearLabel,
      (e) => {
        e.navRoute.clearAll();
        e.persistNavProfile();
        this._routeListScroll = 0;
      },
      compact ? 14 : 16,
      stops.length === 0,
    );

    const listY = box.y + (compact ? 18 : 22);
    const listH = box.h - (listY - box.y) - (compact ? 0 : 2);
    const maxRows = Math.max(1, Math.floor(listH / rowH));
    const start = compact ? 0 : Math.min(this._routeListScroll, Math.max(0, stops.length - maxRows));

    this._clip(ctx, { x: box.x, y: listY, w: box.w, h: listH }, () => {
      const visible = compact ? stops.slice(0, maxRows) : stops.slice(start, start + maxRows);
      visible.forEach((stop, vi) => {
        const idx = compact ? vi : start + vi;
        const ry = listY + vi * rowH;
        const active = idx === 0;
        if (active) {
          ctx.fillStyle = 'rgba(120, 200, 255, 0.1)';
          ctx.fillRect(box.x - 2, ry, box.w + 4, rowH);
        }
        const dotColor = route.stopColor(engine, stop);
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(box.x + 6, ry + rowH / 2, active ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
        const labelMax = box.w - btnS * 3 - 28;
        ctx.font = `600 ${compact ? 10 : 11}px ${FONT}`;
        let label = stop.label;
        if (ctx.measureText(label).width > labelMax) {
          while (label.length > 1 && ctx.measureText(`${label}…`).width > labelMax) label = label.slice(0, -1);
          label += '…';
        }
        this._text(ctx, `${idx + 1}. ${label}`, box.x + 14, ry + rowH - 4, {
          size: compact ? 10 : 11,
          weight: 600,
        });
        const bx = box.x + box.w - btnS * 3 - 2;
        this._routeRowBtn(ctx, bx, ry + 1, btnS, '↑', idx > 0, (e) => {
          e.navRoute.moveStop(stop.id, idx - 1);
          e.persistNavProfile();
        });
        this._routeRowBtn(ctx, bx + btnS + 1, ry + 1, btnS, '↓', idx < stops.length - 1, (e) => {
          e.navRoute.moveStop(stop.id, idx + 1);
          e.persistNavProfile();
        });
        this._btnDanger(ctx, bx + (btnS + 1) * 2, ry + 1, 'X', (e) => {
          e.navRoute.removeStop(stop.id);
          e.persistNavProfile();
        });
      });
      if (compact && stops.length > maxRows) {
        this._text(ctx, `+${stops.length - maxRows}`, box.x + box.w - 20, listY + maxRows * rowH - 2, {
          size: 9,
          align: 'right',
          color: DIM,
        });
      }
    });
  }

  _routeRowBtn(ctx, x, y, s, label, enabled, action) {
    ctx.fillStyle = enabled ? 'rgba(30, 54, 76, 0.8)' : 'rgba(20, 28, 36, 0.5)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = enabled ? 'rgba(120, 200, 255, 0.35)' : 'rgba(80, 90, 100, 0.25)';
    ctx.strokeRect(x, y, s, s);
    this._text(ctx, label, x + s / 2, y + s - 2, {
      size: 9,
      align: 'center',
      weight: 700,
      color: enabled ? TXT : DIM,
    });
    if (enabled) this._region(x, y, s, s, action);
  }

  _drawPoiBookPanel(ctx, box, engine) {
    const splitX = box.x + Math.floor(box.w * 0.42);
    const left = { x: box.x, y: box.y, w: splitX - box.x - 2, h: box.h };
    const right = { x: splitX + 2, y: box.y, w: box.x + box.w - splitX - 2, h: box.h };

    ctx.strokeStyle = COPPER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(splitX, box.y);
    ctx.lineTo(splitX, box.y + box.h);
    ctx.stroke();

    this._clip(ctx, left, () => this._drawSelectedPoiPanel(ctx, left, engine, { inDrawer: true }));

    this._text(ctx, 'POI BOOK', right.x, right.y + 12, { size: 10, color: COPPER, weight: 700 });
    const listBox = { x: right.x, y: right.y + 14, w: right.w, h: right.h - 14 };
    this._drawPoiBookList(ctx, listBox, engine);
    if (this.poiBookMenu) {
      drawPoiPinContextMenu(ctx, box, engine, this, this.poiBookMenu, this.poiBookMenu.poiId, 'poiBook');
    }
  }

  /** Selected POI inspect block (DEST left column or POI Book drawer left). */
  _drawSelectedPoiPanel(ctx, box, engine, { inDrawer = false } = {}) {
    const compact = inDrawer && box.w < 120;
    const headerFs = compact ? 8 : 10;
    const headerY = compact ? 10 : 13;
    this._text(ctx, 'SELECTED POI', box.x, box.y + headerY, {
      size: headerFs,
      color: COPPER,
      weight: 700,
    });
    const poi = engine.poiSystem.getSelected();
    const bodyY = box.y + headerY + (compact ? 6 : 8);
    const bodyBox = {
      x: box.x,
      y: bodyY,
      w: box.w,
      h: Math.max(0, box.y + box.h - bodyY),
    };
    if (!poi) {
      this._text(ctx, 'NO POI SELECTED', bodyBox.x, bodyBox.y + 14, {
        color: DIM,
        size: compact ? 10 : 12,
      });
      return;
    }
    const color = engine.poiSystem.color(poi);
    const rng = (engine.poiSystem.range(engine.ship, poi) / 100).toFixed(0);
    const bearing = engine.poiSystem.bearing(engine.ship, poi);
    this._clip(ctx, bodyBox, () => {
      this._drawNavTargetSection(ctx, bodyBox, {
        name: poi.name,
        nameColor: color,
        rng,
        bearing,
        meta: poi.source ? poi.source.toUpperCase() : null,
        density: compact ? 'compact' : 'full',
      });
    });
  }

  _drawPoiBookList(ctx, box, engine) {
    const pois = engine.poiSystem.discovered();
    const rowH = 18;
    this._clip(ctx, box, () => {
      pois.forEach((poi, i) => {
        const ry = box.y + i * rowH;
        const sel = poi.id === engine.poiSystem.selectedId;
        if (sel) {
          ctx.fillStyle = 'rgba(120, 200, 255, 0.12)';
          ctx.fillRect(box.x - 4, ry, box.w + 8, rowH);
        }
        const color = engine.poiSystem.color(poi);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(box.x + 4, ry + rowH / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        this._text(ctx, poi.name, box.x + 14, ry + 13, { size: 12, weight: 500 });
        this.registerPoiBookRowRightClick(box.x, ry, box.w - 78, rowH, poi.id);
        const userPin = engine.poiSystem.isUserPin(poi);
        if (userPin) {
          this._btnPadlock(ctx, box.x + box.w - 62, ry + 1, poi.locked, (e) => {
            e.poiSystem.togglePoiLock(poi.id);
            e.persistNavProfile();
          });
          if (!poi.locked) {
            this._btnDanger(ctx, box.x + box.w - 44, ry + 1, 'X', (e) => {
              if (e.poiSystem.deletePoi(poi.id)) e.persistNavProfile();
            });
          }
        }
        this._toggle(ctx, box.x + box.w - 26, ry + 3, 'R', poi.onRing, (e) => {
          e.poiSystem.toggleRing(poi.id);
          e.persistNavProfile();
        });
        this._toggle(ctx, box.x + box.w - 12, ry + 3, 'M', poi.onMap, (e) => {
          e.poiSystem.toggleMap(poi.id);
          e.persistNavProfile();
        });
        this._region(box.x - 4, ry, box.w - 78, rowH, (e) => this._poiBookRowClick(e, poi.id));
      });
    });
  }

  _poiBookRowClick(engine, poiId) {
    const now = (engine.gameTime || 0) * 1000;
    const last = this._poiBookLastClick;
    if (last && last.poiId === poiId && now - last.time < 350) {
      this._poiBookLastClick = null;
      engine.addNavRouteStopFromPoi(poiId);
      return;
    }
    this._poiBookLastClick = { poiId, time: now };
    engine.selectPoi(poiId);
  }

  _toggle(ctx, x, y, label, on, action) {
    const s = 14;
    ctx.fillStyle = on ? 'rgba(95, 224, 138, 0.28)' : 'rgba(40, 50, 60, 0.6)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = on ? IFF.green : 'rgba(120, 140, 160, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, s, s);
    this._text(ctx, label, x + s / 2, y + 11, {
      size: 10,
      align: 'center',
      color: on ? IFF.green : DIM,
      weight: 700,
    });
    this._region(x, y, s, s, action);
  }

  // ---- 4 SECTOR MAP ------------------------------------------------------
  _sectorMap(ctx, box, engine) {
    drawSectorMapPanel(ctx, box, engine, this);
  }

  /** @returns {boolean} true if wheel was consumed */
  processPowerPanelInput(engine, input, zoomWheel) {
    if (engine.pipLoadoutModal) return zoomWheel !== 0;
    return processPipLoadoutInput(engine, input, this, zoomWheel);
  }

  /** @returns {boolean} true if wheel was consumed for map zoom */
  processSectorMapInput(engine, input, zoomWheel) {
    const view = engine.sectorMapView;
    if (view.modal || engine.poiBookModal?.surface === 'sectorMap') {
      view.mapHoverTooltip = null;
      return zoomWheel !== 0;
    }
    const mx = input.mouseScreen.x;
    const my = input.mouseScreen.y;
    if (
      zoomWheel !== 0 &&
      view.tabs.sector === 1 &&
      view.containsTravelLogList(mx, my)
    ) {
      const slots = travelLogArchiveRowSlots(view.travelLogListBox, engine);
      stepTravelLogListScroll(engine, zoomWheel, slots);
      return true;
    }
    if (view.mapBody && view.containsMapPoint(mx, my)) {
      view.hoverWorld = view.screenToWorld(mx, my, view.mapBody);
      updateSectorMapMarkerHover(engine, mx, my);
      if (zoomWheel !== 0) {
        view.stepZoom(zoomWheel);
        return true;
      }
    } else {
      view.hoverWorld = null;
      view.mapHoverTooltip = null;
    }
    if (engine.mode !== 'playing' || !view.mapBody || view.modal) {
      if (!input.mouseDown) this._mapDragTracking = false;
      return false;
    }
    const over = view.containsMapPoint(mx, my);
    if (input.mouseDown && over) {
      if (!this._mapDragTracking) {
        view.beginPointer(mx, my);
        this._mapDragTracking = true;
      } else {
        view.movePointer(mx, my, view.mapBody);
      }
    } else if (!input.mouseDown && this._mapDragTracking) {
      view.endPointer();
      this._mapDragTracking = false;
    }
    return false;
  }

  /** Map click after panels; returns true if handled. */
  trySectorMapClick(engine, sx, sy, shiftKey) {
    const view = engine.sectorMapView;
    if (!view.mapBody || !view.containsMapPoint(sx, sy)) return false;
    if (view.suppressClick || view.pointerDragging()) return false;
    const w = view.screenToWorld(sx, sy, view.mapBody);
    sectorMapClick(engine, w.x, w.y, shiftKey);
    return true;
  }

  /** MMB on LIVE sector map — add nav stop. */
  trySectorMapMiddleClick(engine, sx, sy) {
    return sectorMapMiddleClick(engine, sx, sy);
  }

  _btnWide(ctx, x, y, w, label, action, h = 16, disabled = false) {
    if (disabled) {
      ctx.fillStyle = 'rgba(24, 32, 42, 0.55)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(70, 85, 100, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      const fs = h >= 20 ? 10 : 9;
      this._text(ctx, label, x + w / 2, y + h - 4, {
        size: fs,
        align: 'center',
        weight: 700,
        color: 'rgba(110, 120, 132, 0.45)',
      });
      return;
    }
    ctx.fillStyle = 'rgba(30, 54, 76, 0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    const fs = h >= 20 ? 10 : 9;
    this._text(ctx, label, x + w / 2, y + h - 4, { size: fs, align: 'center', weight: 700 });
    this._region(x, y, w, h, action);
  }

  // ---- 5 POWER (pips + loadouts) -----------------------------------------
  _power(ctx, box, engine) {
    const btnH = 18;
    const btnW = 88;
    const footerPad = 2;
    const body = { x: box.x, y: box.y, w: box.w, h: box.h - btnH - footerPad };
    const loadoutsOpen = this.tabs.power === 1;

    if (loadoutsOpen) {
      const previewH = Math.max(88, Math.floor(body.h * 0.42));
      const previewBox = { x: body.x, y: body.y, w: body.w, h: previewH };
      drawPipLoadoutPreview(ctx, previewBox, engine, this);
      const divY = body.y + previewH;
      ctx.strokeStyle = COPPER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(body.x, divY);
      ctx.lineTo(body.x + body.w, divY);
      ctx.stroke();
      const drawer = { x: body.x, y: divY + 2, w: body.w, h: body.y + body.h - divY - 2 };
      drawPipLoadoutPanel(ctx, drawer, engine, this);
    } else {
      this._pips(ctx, body, engine);
    }

    const footerY = box.y + box.h - btnH;
    const footerGap = 8;
    const toggleW = this._drawFooterToggle(
      ctx,
      box.x,
      footerY,
      btnW,
      btnH,
      'LOADOUTS',
      loadoutsOpen,
      (e) => this._toggleLoadouts(e),
    );
    const actionX = box.x + toggleW + footerGap;
    let actionRight = box.x + box.w;
    if (loadoutsOpen) {
      const delReserve = this._footerDeleteAllWidth(ctx, box.w - (toggleW + footerGap));
      if (delReserve > 0) actionRight = box.x + box.w - delReserve - footerGap;
    }
    const actionW = actionRight - actionX;
    if (actionW >= 48) {
      this._drawPipActionRow(ctx, actionX, footerY, actionW, btnH, engine);
    }
    if (loadoutsOpen) {
      const deleteMinOffset =
        actionW >= 48 ? toggleW + footerGap + actionW + footerGap : toggleW + footerGap;
      this._drawFooterDeleteAll(ctx, box, footerY, btnH, deleteMinOffset, 0, (e) => {
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
    if (engine.pipLoadoutModal) {
      drawPipLoadoutModal(ctx, box, engine, this);
    }
  }

  _drawPipActionRow(ctx, x, y, w, h, engine) {
    const gap = 4;
    const btnW = (w - gap * 2) / 3;
    if (btnW < 20) return;
    const active = engine.pipLoadouts?.active;
    const canUpdate = active && !active.locked;
    const canSaveNew = !engine.pipLoadouts?.atCapacity();
    const labels = ['SAVE (NEW)', 'UPDATE', 'CLEAR PIPS'];
    labels.forEach((label, i) => {
      const bx = x + i * (btnW + gap);
      if (label === 'SAVE (NEW)') {
        if (canSaveNew) {
          this._btnWide(ctx, bx, y, btnW, label, (e) => {
            if (e.pipLoadouts.saveNew(e.pipSystem)) e.persistNavProfile();
          }, h);
        } else {
          this._btnWideDisabled(ctx, bx, y, btnW, label, h);
        }
      } else if (label === 'UPDATE') {
        if (canUpdate) {
          this._btnWide(ctx, bx, y, btnW, label, (e) => {
            if (e.pipLoadouts.updateActive(e.pipSystem)) e.persistNavProfile();
          }, h);
        } else {
          this._btnWideDisabled(ctx, bx, y, btnW, label, h);
        }
      } else if (label === 'CLEAR PIPS') {
        this._btnWide(ctx, bx, y, btnW, label, (e) => {
          e.pipSystem.clearAll();
        }, h);
      }
    });
  }

  _pips(ctx, box, engine) {
    const pips = engine.pipSystem;
    const flash = engine.pipLoadoutFlash;
    const flashActive = flash && (engine.gameTime || 0) < flash.until;
    const pulse = flashActive ? 0.45 + 0.55 * Math.abs(Math.sin((engine.gameTime || 0) * 14)) : 0;
    const active = engine.pipLoadouts?.active;

    const padY = 2;
    const loadoutH = active ? 22 : 0;
    const headerH = 18;
    const rowsTop = box.y + padY + headerH;
    const rowsBottom = box.y + box.h - padY - loadoutH;
    const rowsAreaH = Math.max(PIPS.CHANNELS.length * 18, rowsBottom - rowsTop);
    const rowH = Math.max(20, Math.min(34, Math.floor(rowsAreaH / PIPS.CHANNELS.length)));
    const blockH = rowH * PIPS.CHANNELS.length;
    const blockY = rowsTop + Math.max(0, rowsBottom - rowsTop - blockH) / 2;

    const pipScale = 0.7;
    const btnS = Math.max(11, Math.floor(Math.max(16, Math.min(22, rowH - 2)) * pipScale));
    const labelW = 58;
    const labelSize = Math.max(10, Math.min(12, rowH - 7));
    const xBtn = box.x + labelW;
    const minusX = box.x + box.w - btnS * 2 - 2;
    const plusX = box.x + box.w - btnS - 2;
    const slotsX = xBtn + btnS + 6;
    const slotsEnd = minusX - 6;
    const slotCount = PIPS.MAX_PER_CHANNEL;
    const slotGap = 1;
    const slotsTrackW = slotsEnd - slotsX;
    const slotW = Math.max(
      12,
      Math.floor((slotsTrackW - slotGap * (slotCount - 1)) / slotCount)
    );
    const slotH = Math.max(
      8,
      Math.floor(Math.min(rowH - 4, slotW) * pipScale)
    );

    // Header — pool readout + segmented availability bar (+ optional partial warning).
    const headerY = box.y + padY;
    const poolTotal = pips.pool();
    const poolFree = pips.free();
    this._text(ctx, `POOL ${poolFree}/${poolTotal}`, box.x, headerY + 13, {
      size: 11,
      color: DIM,
      weight: 700,
    });
    const barX = box.x + 50;
    const warnW = flashActive && flash.shortBy > 0 ? 88 : 0;
    const barW = Math.max(24, box.w - 50 - warnW - 4);
    const barY = headerY + 4;
    const barH = 9;
    this._drawSegmentedPoolBar(ctx, barX, barY, barW, barH, poolTotal, poolFree);
    if (flashActive && flash.shortBy > 0) {
      this._text(ctx, `−${flash.shortBy} SHORT`, box.x + box.w, headerY + 13, {
        size: 9,
        align: 'right',
        color: PIP_FLASH_RED,
        weight: 700,
      });
    }

    PIPS.CHANNELS.forEach((ch, i) => {
      const ry = blockY + i * rowH;
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(28, 44, 62, 0.28)';
        ctx.fillRect(box.x, ry, box.w, rowH);
      }
      const label = PIP_LABELS[ch] || ch.toUpperCase();
      const textY = ry + rowH / 2 + 4;
      this._text(ctx, label, box.x + 2, textY, { size: labelSize, weight: 600 });
      const n = pips.get(ch);
      const rowBtnY = ry + (rowH - btnS) / 2;
      this._btnDanger(
        ctx,
        xBtn,
        rowBtnY,
        'X',
        (e) => {
          e.pipSystem.clear(ch);
        },
        { size: btnS, compact: true, disabled: n <= 0 }
      );
      const maxReach = n + pips.free();
      const slotY = ry + (rowH - slotH) / 2;
      for (let k = 0; k < PIPS.MAX_PER_CHANNEL; k++) {
        const sx = slotsX + k * (slotW + slotGap);
        const target = k + 1;
        const blocked = target > maxReach && target > n;
        const missed = flashActive && flash.missed?.[ch] > 0 && k >= n && k < n + flash.missed[ch];
        this._drawPipSlot(ctx, sx, slotY, slotW, slotH, k < n, blocked, missed, pulse);
        if (!blocked) {
          this._region(sx, slotY - 1, slotW + 1, slotH + 2, (e) => e.pipSystem.set(ch, target));
        }
      }
      const stepBtnY = ry + (rowH - btnS) / 2;
      this._btn(ctx, minusX, stepBtnY, '−', (e) => e.pipSystem.remove(ch), btnS);
      this._btn(ctx, plusX, stepBtnY, '+', (e) => e.pipSystem.add(ch), btnS);
    });

    if (active) {
      const ly = box.y + box.h - padY - loadoutH;
      ctx.fillStyle = 'rgba(30, 48, 68, 0.32)';
      ctx.fillRect(box.x, ly, box.w, loadoutH);
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x, ly, box.w, loadoutH);
      this._btnPadlock(ctx, box.x + 2, ly + 3, active.locked, (e) => {
        e.pipLoadouts.toggleLock(active.id);
        e.persistNavProfile();
      });
      const nameX = box.x + 22;
      const clearW = 72;
      const nameW = box.w - 22 - clearW - 4;
      this._text(ctx, engine.pipLoadouts.title(active), nameX, ly + 15, {
        size: 10,
        weight: 600,
        color: COPPER,
      });
      this.registerPipLinkedLoadoutRightClick(nameX, ly + 2, nameW, loadoutH - 4, active.id);
      this._btnWide(ctx, box.x + box.w - clearW - 2, ly + 3, clearW, 'CLEAR LOADOUT', (e) => {
        e.pipLoadouts.clearActiveLink();
        e.persistNavProfile();
      }, loadoutH - 6);
    }
  }

  _drawSegmentedPoolBar(ctx, x, y, w, h, total, available) {
    if (w <= 0 || h <= 0) return;
    const segments = Math.max(1, total | 0);
    const remaining = Math.max(0, Math.min(segments, available | 0));
    const segW = w / segments;
    ctx.save();
    for (let i = 0; i < segments; i++) {
      const sx = x + i * segW;
      const gap = i < segments - 1 ? 1 : 0;
      const sw = Math.max(1, segW - gap);
      ctx.fillStyle = i < remaining ? ACCENT : 'rgba(50, 64, 78, 0.55)';
      ctx.fillRect(sx, y, sw, h);
    }
    ctx.strokeStyle = remaining <= 0 ? IFF.yellow : 'rgba(90, 110, 130, 0.45)';
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

  _drawPipSlot(ctx, x, y, w, h, filled, blocked, flashMiss, pulse) {
    if (flashMiss) {
      ctx.fillStyle = `rgba(95, 224, 138, ${0.35 + 0.55 * pulse})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = PIP_FLASH_GREEN;
      ctx.strokeRect(x, y, w, h);
      return;
    }
    if (filled) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x, y, w, h);
      return;
    }
    if (blocked) {
      ctx.fillStyle = 'rgba(40, 48, 58, 0.35)';
      ctx.fillRect(x, y, w, h);
      return;
    }
    ctx.fillStyle = 'rgba(50, 64, 78, 0.45)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(90, 110, 130, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  _btn(ctx, x, y, label, action, size = 16) {
    const s = size;
    ctx.fillStyle = 'rgba(30, 54, 76, 0.8)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, s, s);
    this._text(ctx, label, x + s / 2, y + s - 3, { size: size > 14 ? 13 : 11, align: 'center', weight: 700 });
    this._region(x, y, s, s, action);
  }

  _btnWideDisabled(ctx, x, y, w, label, h = 16) {
    ctx.fillStyle = 'rgba(24, 32, 42, 0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(70, 85, 100, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    const fs = h >= 20 ? 10 : 9;
    this._text(ctx, label, x + w / 2, y + h - 4, { size: fs, align: 'center', weight: 700, color: DIM });
  }

  _shipStatusCorner(ctx, engine) {
    const s = engine.cockpitFrame?.cornerScreen('STATUS');
    if (!s) return;
    const box = { x: s.x + 2, y: s.y + 14, w: s.w - 4, h: s.h - 16 };
    this._shipStatus(ctx, box, engine, { compact: true });
  }

  /** TELEMETRY corner — SPD, HDG/CRS, POS. */
  _telemetryCorner(ctx, engine) {
    const s = engine.cockpitFrame?.cornerScreen('TELEMETRY');
    if (!s) return;
    drawNavCorner(ctx, s, buildNavTelemetry(engine));
  }

  /** ZOOM corner — zoom %, view radius, radar pip rings. */
  _zoomCorner(ctx, engine) {
    const s = engine.cockpitFrame?.cornerScreen('ZOOM');
    if (!s) return;
    drawZoomCorner(ctx, s, buildZoomRadarTelemetry(engine));
  }

  /**
   * @param {object} [opts]
   * @param {number} [opts.size=16]
   * @param {boolean} [opts.disabled=false]
   * @param {boolean} [opts.compact=false] HUD blue-gray tile; muted red glyph (loadout delete)
   */
  _btnDanger(ctx, x, y, label, action, opts = {}) {
    const s = opts.size ?? 16;
    const disabled = !!opts.disabled;
    const compact = !!opts.compact;

    if (disabled) {
      ctx.fillStyle = 'rgba(24, 32, 42, 0.55)';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(70, 85, 100, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, s, s);
      this._text(ctx, label, x + s / 2, y + s - (s > 12 ? 3 : 2), {
        size: s > 12 ? 13 : 9,
        align: 'center',
        weight: 700,
        color: 'rgba(110, 120, 132, 0.45)',
      });
      return;
    }

    if (compact) {
      ctx.fillStyle = 'rgba(30, 54, 76, 0.8)';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, s, s);
      this._text(ctx, label, x + s / 2, y + s - (s > 12 ? 3 : 2), {
        size: s > 12 ? 11 : 9,
        align: 'center',
        weight: 700,
        color: 'rgba(190, 110, 110, 0.72)',
      });
      this._region(x, y, s, s, action);
      return;
    }

    ctx.fillStyle = 'rgba(80, 24, 28, 0.92)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, s, s);
    this._text(ctx, label, x + s / 2, y + 12, {
      size: 13,
      align: 'center',
      weight: 700,
      color: 'rgba(255, 120, 120, 0.95)',
    });
    this._region(x, y, s, s, action);
  }

  _btnPadlock(ctx, x, y, locked, action) {
    const s = 16;
    ctx.fillStyle = 'rgba(30, 54, 76, 0.8)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = locked ? 'rgba(95, 224, 138, 0.55)' : 'rgba(150, 178, 202, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, s, s);
    this._drawPadlockIcon(ctx, x + s / 2, y + s / 2 - 1, locked, 7);
    this._region(x, y, s, s, action);
  }

  _drawPadlockIcon(ctx, cx, cy, locked, size) {
    const bodyW = size * 0.9;
    const bodyH = size * 0.65;
    const bodyY = cy + size * 0.05;
    ctx.strokeStyle = locked ? 'rgba(95, 224, 138, 0.9)' : 'rgba(180, 200, 220, 0.75)';
    ctx.fillStyle = locked ? 'rgba(40, 90, 60, 0.5)' : 'rgba(40, 54, 68, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(cx - bodyW / 2, bodyY, bodyW, bodyH);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    const r = bodyW * 0.38;
    if (locked) {
      ctx.arc(cx, bodyY, r, Math.PI, 0);
    } else {
      ctx.arc(cx + r * 0.35, bodyY, r, Math.PI * 1.05, Math.PI * 1.55);
    }
    ctx.stroke();
  }

  _shipStatus(ctx, box, engine, opts = {}) {
    const compact = !!opts.compact;
    const st = engine.ship?.status;
    if (!st) {
      this._text(ctx, 'STATUS UNAVAILABLE', box.x, box.y + box.h / 2, {
        color: DIM,
        size: compact ? 11 : 13,
      });
      return;
    }

    const systems = st.systems || [];
    const weapons = st.weapons || [];
    const barRows = 2;
    const rowCount = systems.length + weapons.length + barRows;
    const padTop = compact ? 2 : 4;
    const rowStep = Math.max(
      compact ? 11 : 13,
      Math.min(compact ? 16 : 18, Math.floor((box.h - padTop) / Math.max(1, rowCount)))
    );
    const rowSize = Math.max(compact ? 9 : 10, Math.min(compact ? 11 : 12, rowStep - 2));
    const meterBarH = Math.max(compact ? 6 : 7, Math.min(10, rowStep - 3));
    const meterLabelW = compact ? 28 : 34;

    let y = box.y + padTop + rowSize;

    for (const sys of systems) {
      const col = this._statusStateColor(sys.state);
      this._text(ctx, sys.name.toUpperCase(), box.x, y, { size: rowSize, weight: 600 });
      this._text(ctx, sys.state.toUpperCase(), box.x + box.w, y, {
        size: rowSize,
        align: 'right',
        color: col,
        weight: 700,
      });
      y += rowStep;
    }

    for (const w of weapons) {
      this._drawStatusWeaponRow(ctx, box, y, w, rowSize);
      y += rowStep;
    }

    y += compact ? 1 : 2;
    y = this._drawStatusMeterRow(
      ctx,
      box,
      y,
      'FUEL',
      meterLabelW,
      rowSize,
      meterBarH,
      st.fuel ?? 0,
      (frac) => this._statusMeterColor(frac)
    );
    y += rowStep;
    this._drawStatusMeterRow(
      ctx,
      box,
      y,
      'HULL',
      meterLabelW,
      rowSize,
      meterBarH,
      st.hull ?? st.fuel ?? 1,
      (frac) => this._statusMeterColor(frac)
    );
  }

  _statusStateColor(state) {
    if (state === 'ok' || state === 'ready') return STATUS_OK;
    if (state === 'damaged' || state === 'reloading') return IFF.yellow;
    return IFF.red;
  }

  _statusMeterColor(frac) {
    if (frac < 0.25) return IFF.red;
    if (frac < 0.5) return IFF.yellow;
    return STATUS_OK;
  }

  _drawStatusWeaponRow(ctx, box, y, w, rowSize) {
    const col = this._statusStateColor(w.state);
    this._text(ctx, w.name.toUpperCase(), box.x, y, { size: rowSize, weight: 600 });
    const readyText = `${w.ammo}  ${w.state.toUpperCase()}`.replace(/\s+/g, ' ').trim();
    const okLabel = w.state === 'ready' ? 'OK' : w.state.toUpperCase();
    ctx.font = `${700} ${rowSize}px ${FONT}`;
    const okW = ctx.measureText(okLabel).width;
    const gap = 6;
    this._text(ctx, okLabel, box.x + box.w, y, {
      size: rowSize,
      align: 'right',
      color: col,
      weight: 700,
    });
    this._text(ctx, readyText, box.x + box.w - okW - gap, y, {
      size: rowSize,
      align: 'right',
      color: col,
      weight: 600,
    });
  }

  _drawStatusMeterRow(ctx, box, y, label, labelW, rowSize, barH, frac, colorFn) {
    const n = Math.max(0, Math.min(1, Number(frac) || 0));
    this._text(ctx, label, box.x, y, { size: rowSize, weight: 600 });
    const bx = box.x + labelW;
    const bw = box.w - labelW;
    const barY = y - barH + 1;
    ctx.fillStyle = 'rgba(50, 64, 78, 0.6)';
    ctx.fillRect(bx, barY, bw, barH);
    ctx.fillStyle = colorFn(n);
    ctx.fillRect(bx, barY, bw * n, barH);
    ctx.strokeStyle = 'rgba(90, 110, 130, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, barY, bw, barH);
    const pct = `${Math.round(n * 100)}%`;
    this._text(ctx, pct, bx + bw - 2, y, {
      size: Math.max(8, rowSize - 1),
      align: 'right',
      weight: 700,
      color: TXT,
    });
    return y;
  }

  _tabBar(ctx, box, labels, active, onPick) {
    const tw = (box.w - (labels.length - 1) * 4) / labels.length;
    labels.forEach((label, i) => {
      const x = box.x + i * (tw + 4);
      const on = i === active;
      ctx.fillStyle = on ? 'rgba(120, 200, 255, 0.18)' : 'rgba(30, 42, 54, 0.6)';
      ctx.fillRect(x, box.y, tw, 16);
      ctx.strokeStyle = on ? ACCENT : 'rgba(90, 110, 130, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, box.y, tw, 16);
      this._text(ctx, label, x + tw / 2, box.y + 12, {
        size: 10,
        align: 'center',
        color: on ? ACCENT : DIM,
        weight: 700,
      });
      this._region(x, box.y, tw, 16, () => onPick(i));
    });
  }

  // ---- Alert overlay -----------------------------------------------------
  _alertOverlay(ctx, engine) {
    const st = engine.ship?.status;
    if (!st || !st.fires || !st.fires.length) return;
    const layout = engine.cockpitFrame.layout;
    if (!layout) return;
    const pulse = 0.5 + 0.5 * Math.sin((engine.gameTime || 0) * 6);
    const w = 260;
    const h = 26;
    const x = layout.cx - w / 2;
    const y = layout.hud.y + 8;
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fillStyle = 'rgba(120, 20, 20, 0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = IFF.red;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    this._text(ctx, `⚠ ${st.fires[0]}`, layout.cx, y + 18, {
      size: 15,
      align: 'center',
      color: '#ffdede',
      weight: 700,
    });
    ctx.restore();
  }
}
