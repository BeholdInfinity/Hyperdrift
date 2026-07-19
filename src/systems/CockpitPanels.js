/**
 * CockpitPanels — dynamic content for the six recessed cockpit screens plus the
 * ship-status alert overlay. The static chrome/frames live in CockpitFrame;
 * this draws live data on top each frame and registers clickable hit-regions
 * (tabs, list rows, pip buttons, POI toggles, comms buttons).
 *
 * Panel order (from CockpitFrame layout): 0 CONTACT, 1 CONTACTS, 2 COMMS,
 * 3 DESTINATION, 4 SECTOR MAP, 5 POWER.
 */

import { IFF, PIPS } from '../core/Constants.js';
import { drawModularShip } from '../ships/ShipRenderer.js';
import { topDownView } from '../ships/ShipViews.js';

const FONT = "'Barlow Condensed', 'Segoe UI', sans-serif";
const TXT = 'rgba(200, 224, 246, 0.9)';
const DIM = 'rgba(150, 178, 202, 0.55)';
const COPPER = 'rgba(230, 171, 109, 0.92)';
const ACCENT = 'rgba(120, 200, 255, 0.85)';

export class CockpitPanels {
  constructor() {
    this.tabs = { destination: 0, power: 0 };
    /** @type {Array<{x:number,y:number,w:number,h:number,action:Function}>} */
    this._regions = [];
  }

  render(ctx, engine) {
    const layout = engine.cockpitFrame.layout;
    if (!layout || !layout.panels || layout.panels.length < 6) return;
    this._regions = [];
    const p = layout.panels;
    this._contact(ctx, this._content(p[0]), engine);
    this._contactsList(ctx, this._content(p[1]), engine);
    this._comms(ctx, this._content(p[2]), engine);
    this._destination(ctx, this._content(p[3]), engine);
    this._sectorMap(ctx, this._content(p[4]), engine);
    this._power(ctx, this._content(p[5]), engine);
    this._modeSwitches(ctx, engine);
    this._alertOverlay(ctx, engine);
  }

  // ---- MODES switch stack (bottom-right corner) --------------------------
  /**
   * A tidy stack of two-position mode switches filling the bottom-right corner
   * (baked title "MODES"). Each row is a labelled slide switch; the list is
   * built to leave headroom for future toggles. Rows register click regions
   * routed through handleClick.
   */
  _modeSwitches(ctx, engine) {
    const corner = engine.cockpitFrame?.layout?.corners?.[3];
    if (!corner) return;

    const pad = Math.max(6, Math.min(corner.w, corner.h) * 0.09);
    const ix = corner.x + pad;
    const iw = corner.w - pad * 2;
    // Rows fill the area below the baked "MODES" title (top ~40%).
    const top = corner.y + corner.h * 0.42;
    const bottom = corner.y + corner.h - pad;
    const rowH = Math.max(20, Math.min(30, (bottom - top) / 4));

    // PREC is desire-based (OFF → STBY → ON): it's a two-position switch that
    // reflects the desire (OFF vs. armed), with the ON-side label swapping
    // between STBY (armed, waiting for slow enough speed) and ON (engaged).
    const precColor = engine.precisionActive
      ? { fill: 'rgba(95, 224, 138, 0.30)', line: IFF.green }
      : engine.precisionDesired
        ? { fill: 'rgba(230, 190, 110, 0.28)', line: 'rgba(230, 190, 110, 0.95)' }
        : { fill: 'rgba(90, 110, 130, 0.20)', line: 'rgba(150, 178, 202, 0.6)' };
    const accent = { fill: 'rgba(120, 200, 255, 0.28)', line: ACCENT };

    // Extend this list to add future mode switches; the stack self-lays out.
    const rows = [
      {
        cap: 'PREC',
        off: 'OFF',
        on: engine.precisionActive ? 'ON' : 'STBY',
        active: engine.precisionDesired,
        color: precColor,
        click: (e) => e.togglePrecision(),
      },
      {
        // ORIENT = display stabilization, the marine radar "Head-Up vs
        // North-Up" convention. SHIP keeps the hull pointing up so the world
        // rotates around it (default); NORTH keeps world-north up. Bound to R.
        cap: 'ORIENT',
        off: 'SHIP',
        on: 'NORTH',
        active: engine.viewMode === 'world',
        color: accent,
        click: (e) => e.toggleViewMode(),
      },
      {
        // VIEW = ship viewport (world through the circle) vs. one full radar
        // scope. SHIP is the default flight view; SCAN is the scope. Bound to V.
        cap: 'VIEW',
        off: 'SHIP',
        on: 'SCAN',
        active: engine.scanView === 'scan',
        color: accent,
        click: (e) => e.toggleScanView(),
      },
    ];

    rows.forEach((row, i) => this._modeSwitchRow(ctx, ix, top + i * rowH, iw, rowH, row));
  }

  _modeSwitchRow(ctx, x, y, w, h, row) {
    const capW = Math.min(w * 0.42, 42);
    this._text(ctx, row.cap, x, y + h / 2 + 4, { size: 10, color: COPPER, weight: 700 });
    const sh = Math.min(16, h - 6);
    const sw = w - capW - 2;
    const sx = x + capW + 2;
    const sy = y + (h - sh) / 2;
    this._modeSwitch(ctx, sx, sy, sw, sh, row.off, row.on, row.active, row.color);
    this._region(sx, sy, sw, sh, row.click);
  }

  /** One slide switch: track + lit half on the active side + segment labels. */
  _modeSwitch(ctx, x, y, w, h, leftLabel, rightLabel, rightActive, color) {
    const r = h / 2;
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(16, 28, 40, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const half = w / 2;
    const knobX = rightActive ? x + half : x;
    this._roundRect(ctx, knobX + 1, y + 1, half - 2, h - 2, Math.max(1, r - 1));
    ctx.fillStyle = color.fill;
    ctx.fill();
    ctx.strokeStyle = color.line;
    ctx.lineWidth = 1;
    ctx.stroke();

    const ty = y + h - Math.max(4, h * 0.28);
    this._text(ctx, leftLabel, x + half / 2, ty, {
      size: 9,
      align: 'center',
      color: rightActive ? DIM : color.line,
      weight: 700,
    });
    this._text(ctx, rightLabel, x + half + half / 2, ty, {
      size: 9,
      align: 'center',
      color: rightActive ? color.line : DIM,
      weight: 700,
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
    const pad = Math.max(4, Math.min(rect.w, rect.h) * 0.1);
    return {
      x: rect.x + pad + 8,
      y: rect.y + pad + 26,
      w: rect.w - pad * 2 - 16,
      h: rect.h - pad * 2 - 34,
    };
  }

  _region(x, y, w, h, action) {
    this._regions.push({ x, y, w, h, action });
  }

  /** Route a screen-space click; returns true if consumed. */
  handleClick(x, y, engine) {
    for (let i = this._regions.length - 1; i >= 0; i--) {
      const r = this._regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        r.action(engine);
        return true;
      }
    }
    return false;
  }

  _text(ctx, s, x, y, { size = 14, color = TXT, align = 'left', weight = 600 } = {}) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  }

  _clip(ctx, box, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    fn();
    ctx.restore();
  }

  // ---- 0 CONTACT ---------------------------------------------------------
  _contact(ctx, box, engine) {
    const c = engine.scannerSystem.getSelected();
    if (!c) {
      this._text(ctx, 'NO CONTACT SELECTED', box.x, box.y + 16, { color: DIM, size: 13 });
      this._text(ctx, 'Click a blip on the scanner', box.x, box.y + 34, {
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

    // Science-gated cargo readout.
    const science = engine.pipSystem.get('science');
    const y = box.y + box.h - 4;
    if (science > 0) {
      const cargo = c.type === 'civilian' ? 'ORE, ALLOY (est.)' : c.type === 'station' ? 'TRADE HUB' : '—';
      this._text(ctx, `CARGO ${cargo}`, box.x, y, { size: 12, color: ACCENT, weight: 500 });
    } else {
      this._text(ctx, 'CARGO — science offline', box.x, y, { size: 11, color: DIM, weight: 400 });
    }
  }

  // ---- 1 CONTACTS --------------------------------------------------------
  _contactsList(ctx, box, engine) {
    const list = engine.scannerSystem.contacts;
    if (!engine.scannerSystem.on) {
      this._text(ctx, 'SENSOR OFFLINE', box.x, box.y + 16, { color: DIM, size: 13 });
      return;
    }
    if (!list.length) {
      this._text(ctx, 'NO CONTACTS IN RANGE', box.x, box.y + 16, { color: DIM, size: 13 });
      return;
    }
    const rowH = 18;
    const max = Math.floor(box.h / rowH);
    this._clip(ctx, box, () => {
      for (let i = 0; i < Math.min(list.length, max); i++) {
        const c = list[i];
        const ry = box.y + i * rowH;
        const sel = c.id === engine.scannerSystem.selectedId;
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
        this._region(box.x - 4, ry, box.w + 8, rowH, (e) => e.scannerSystem.select(id));
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
    const tab = this.tabs.destination;
    this._tabBar(ctx, box, ['DEST', 'POI BOOK'], tab, (i) => (this.tabs.destination = i));
    const body = { x: box.x, y: box.y + 22, w: box.w, h: box.h - 22 };
    if (tab === 0) {
      const poi = engine.poiSystem.getSelected();
      if (!poi) {
        this._text(ctx, 'NO DESTINATION SET', body.x, body.y + 16, { color: DIM, size: 13 });
        return;
      }
      const color = engine.poiSystem.color(poi);
      this._text(ctx, poi.name.toUpperCase(), body.x, body.y + 14, { color, size: 15, weight: 700 });
      const rng = (engine.poiSystem.range(engine.ship, poi) / 100).toFixed(0);
      const brg = ((engine.poiSystem.bearing(engine.ship, poi) * 180) / Math.PI + 360) % 360;
      const rows = [
        `RANGE  ${rng} km`,
        `BEARING ${brg.toFixed(0)}°`,
        `SOURCE ${poi.source.toUpperCase()}`,
      ];
      rows.forEach((s, i) => this._text(ctx, s, body.x, body.y + 34 + i * 15, { size: 12, weight: 500 }));
    } else {
      const pois = engine.poiSystem.discovered();
      const rowH = 18;
      this._clip(ctx, body, () => {
        pois.forEach((poi, i) => {
          const ry = body.y + i * rowH;
          const sel = poi.id === engine.poiSystem.selectedId;
          if (sel) {
            ctx.fillStyle = 'rgba(120, 200, 255, 0.12)';
            ctx.fillRect(body.x - 4, ry, body.w + 8, rowH);
          }
          const color = engine.poiSystem.color(poi);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(body.x + 4, ry + rowH / 2, 3, 0, Math.PI * 2);
          ctx.fill();
          this._text(ctx, poi.name, body.x + 14, ry + 13, { size: 12, weight: 500 });
          // Ring / Map toggles.
          this._toggle(ctx, body.x + body.w - 44, ry + 3, 'R', poi.onRing, (e) => e.poiSystem.toggleRing(poi.id));
          this._toggle(ctx, body.x + body.w - 22, ry + 3, 'M', poi.onMap, (e) => e.poiSystem.toggleMap(poi.id));
          const id = poi.id;
          this._region(body.x - 4, ry, body.w - 50, rowH, (e) => e.poiSystem.select(id));
        });
      });
    }
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
    const map = engine.sectorMap;
    const ship = engine.ship;
    const span = 70000; // world units across the panel
    const scale = Math.min(box.w, box.h) / span;
    const ccx = box.x + box.w / 2;
    const ccy = box.y + box.h / 2;
    const cell = map.cellSize;
    this._clip(ctx, box, () => {
      // Fog cells.
      const half = span / 2;
      const c0x = Math.floor((ship.position.x - half) / cell);
      const c1x = Math.floor((ship.position.x + half) / cell);
      const c0y = Math.floor((ship.position.y - half) / cell);
      const c1y = Math.floor((ship.position.y + half) / cell);
      const cs = cell * scale;
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let cy = c0y; cy <= c1y; cy++) {
          const lvl = map.cellLevel(cx, cy);
          if (!lvl) continue;
          const wx = cx * cell;
          const wy = cy * cell;
          const sx = ccx + (wx - ship.position.x) * scale;
          const sy = ccy + (wy - ship.position.y) * scale;
          ctx.fillStyle = lvl === 2 ? 'rgba(60, 120, 170, 0.28)' : 'rgba(50, 70, 90, 0.16)';
          ctx.fillRect(sx, sy, cs + 0.5, cs + 0.5);
        }
      }
      // Trail.
      if (map.trail.length > 1) {
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        map.trail.forEach((pt, i) => {
          const sx = ccx + (pt.x - ship.position.x) * scale;
          const sy = ccy + (pt.y - ship.position.y) * scale;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
      // POIs on map.
      for (const poi of engine.poiSystem.mapPois()) {
        const sx = ccx + (poi.x - ship.position.x) * scale;
        const sy = ccy + (poi.y - ship.position.y) * scale;
        ctx.fillStyle = engine.poiSystem.color(poi);
        ctx.beginPath();
        ctx.arc(sx, sy, poi.id === engine.poiSystem.selectedId ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Live contacts.
      for (const c of engine.scannerSystem.contacts) {
        const sx = ccx + (c.x - ship.position.x) * scale;
        const sy = ccy + (c.y - ship.position.y) * scale;
        ctx.fillStyle = IFF[c.iff] || IFF.yellow;
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
      // Ship marker.
      ctx.save();
      ctx.translate(ccx, ccy);
      ctx.rotate((ship.angle || 0) + Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(3.5, 4);
      ctx.lineTo(-3.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  // ---- 5 POWER (pips + ship status) --------------------------------------
  _power(ctx, box, engine) {
    const tab = this.tabs.power;
    this._tabBar(ctx, box, ['PIPS', 'STATUS'], tab, (i) => (this.tabs.power = i));
    const body = { x: box.x, y: box.y + 22, w: box.w, h: box.h - 22 };
    if (tab === 0) this._pips(ctx, body, engine);
    else this._shipStatus(ctx, body, engine);
  }

  _pips(ctx, box, engine) {
    const pips = engine.pipSystem;
    this._text(ctx, `POOL ${pips.used()}/${pips.pool()}${pips.precision ? '  +PREC' : ''}`, box.x, box.y + 12, {
      size: 12,
      color: pips.precision ? IFF.green : DIM,
      weight: 600,
    });
    const rowH = 20;
    PIPS.CHANNELS.forEach((ch, i) => {
      const ry = box.y + 22 + i * rowH;
      this._text(ctx, ch.toUpperCase(), box.x, ry + 12, { size: 12, weight: 500 });
      // pip cells
      const n = pips.get(ch);
      const cellX = box.x + box.w * 0.42;
      for (let k = 0; k < PIPS.MAX_PER_CHANNEL; k++) {
        const x = cellX + k * 12;
        ctx.fillStyle = k < n ? ACCENT : 'rgba(60, 74, 88, 0.5)';
        ctx.fillRect(x, ry + 2, 9, 12);
      }
      // - / + buttons
      const minusX = box.x + box.w - 40;
      const plusX = box.x + box.w - 18;
      this._btn(ctx, minusX, ry, '−', (e) => e.pipSystem.remove(ch));
      this._btn(ctx, plusX, ry, '+', (e) => e.pipSystem.add(ch));
    });
  }

  _btn(ctx, x, y, label, action) {
    const s = 16;
    ctx.fillStyle = 'rgba(30, 54, 76, 0.8)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, s, s);
    this._text(ctx, label, x + s / 2, y + 12, { size: 13, align: 'center', weight: 700 });
    this._region(x, y, s, s, action);
  }

  _shipStatus(ctx, box, engine) {
    const st = engine.ship?.status;
    if (!st) {
      this._text(ctx, 'STATUS UNAVAILABLE', box.x, box.y + 16, { color: DIM, size: 13 });
      return;
    }
    // Systems damage.
    let y = box.y + 12;
    for (const sys of st.systems) {
      const col = sys.state === 'ok' ? IFF.green : sys.state === 'damaged' ? IFF.yellow : IFF.red;
      ctx.fillStyle = col;
      ctx.fillRect(box.x, y - 8, 6, 6);
      this._text(ctx, sys.name.toUpperCase(), box.x + 12, y, { size: 11, weight: 500 });
      this._text(ctx, sys.state.toUpperCase(), box.x + box.w, y, {
        size: 11,
        align: 'right',
        color: col,
        weight: 600,
      });
      y += 14;
    }
    // Fuel bar.
    y += 4;
    this._text(ctx, 'FUEL', box.x, y, { size: 11, weight: 500 });
    const bx = box.x + 34;
    const bw = box.w - 34;
    ctx.fillStyle = 'rgba(50, 64, 78, 0.6)';
    ctx.fillRect(bx, y - 8, bw, 7);
    ctx.fillStyle = st.fuel < 0.25 ? IFF.red : IFF.green;
    ctx.fillRect(bx, y - 8, bw * st.fuel, 7);
    y += 16;
    // Weapons readiness.
    for (const w of st.weapons) {
      const col = w.state === 'ready' ? IFF.green : w.state === 'reloading' ? IFF.yellow : IFF.red;
      this._text(ctx, w.name.toUpperCase(), box.x, y, { size: 11, weight: 500 });
      this._text(ctx, `${w.ammo}  ${w.state.toUpperCase()}`, box.x + box.w, y, {
        size: 11,
        align: 'right',
        color: col,
        weight: 600,
      });
      y += 14;
    }
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
