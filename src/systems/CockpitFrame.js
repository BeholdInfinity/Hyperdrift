/**
 * Cockpit HUD frame — the pilot's-view 16:9 console housing drawn around the
 * radar ring. Renders a worn steel + copper industrial frame: an outer 16:9
 * border, a POI waypoint rim thickened out to the frame's top/bottom edge,
 * vertical dividers + horizontal thirds carving the left/right columns into six
 * recessed screen panels, and four corner sections around the ring reserved for
 * ship metadata.
 *
 * The whole frame is static per window size, so it's painted once into an
 * offscreen canvas and blitted each frame. A transparent hole over the radar
 * band lets the live radar display + viewport show through underneath.
 *
 * Geometry (all derived from the renderer):
 *   - hudRect ...... largest 16:9 rect fitting the window (letterbox otherwise)
 *   - circleR ...... POI rim outer radius = hudRect.h / 2 (touches top/bottom)
 *   - radarOuterR .... inner edge of the POI rim (outer edge of the radar band);
 *                    copper bezel is stroked fully outside this radius so it
 *                    does not cover the outermost radar range divider
 *   - dividers ..... vertical lines at centerX ± circleR (tangent to the rim)
 */

const TWO_PI = Math.PI * 2;

const STEEL = {
  housing0: '#20242a',
  housing1: '#14171b',
  plate0: '#40464e',
  plate1: '#2c3138',
  plate2: '#1b1f24',
  edgeHi: 'rgba(168, 182, 196, 0.55)',
  edgeLo: 'rgba(0, 0, 0, 0.6)',
  seam: 'rgba(0, 0, 0, 0.65)',
};

const COPPER = {
  base: '#b87333',
  hi: '#e6ab6d',
  lo: '#6e4118',
  line: 'rgba(206, 128, 66, 0.9)',
  glow: 'rgba(224, 164, 104, 0.35)',
};

const SCREEN = {
  glass0: '#0a1826',
  glass1: '#04090f',
  edge: 'rgba(120, 200, 255, 0.20)',
  glow: 'rgba(90, 200, 255, 0.10)',
  scan: 'rgba(120, 200, 255, 0.04)',
  label: 'rgba(230, 171, 109, 0.92)',
};

const PANEL_LABELS = {
  left: ['CONTACT DETAILS', 'CONTACTS', 'COMMS'],
  right: ['DESTINATION', 'SECTOR MAP', 'POWER'],
};
/** Index: 0=TL, 1=TR, 2=BL, 3=BR. */
const CORNER_LABELS = ['ZOOM', 'TELEMETRY', 'MODES', 'STATUS'];

export class CockpitFrame {
  constructor() {
    /** @type {HTMLCanvasElement|null} */
    this.cache = null;
    this._key = '';
    /** Computed layout (rects for panels/corners) for later wiring. */
    this.layout = null;
  }

  /**
   * Blit the cockpit frame. Rebuilds the cached chrome when geometry changes.
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Renderer.js').Renderer} r
   */
  render(ctx, r) {
    if (!r.hudRect || !r.radarBand) return;
    const key = `${r.width}x${r.height}|${Math.round(r.radarOuterRadius)}|cd16`;
    if (key !== this._key || !this.cache) {
      this._build(r);
      this._key = key;
    }
    if (this.cache) ctx.drawImage(this.cache, 0, 0);
  }

  /**
   * Draw POI waypoint dots on the rim (bearing-only, no sweep). Highlights the
   * selected POI. Bearings are world-space + camera rotation (north-up ring).
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Renderer.js').Renderer} r
   * @param {import('../world/PoiSystem.js').PoiSystem} poiSystem
   * @param {object} ship
   * @param {number} camRot
   */
  drawPoiDots(ctx, r, poiSystem, ship, camRot = 0) {
    if (!this.layout || !ship) return;
    const { cx, cy, radarOuterR, circleR } = this.layout;
    const rimR = (radarOuterR + circleR) / 2;
    ctx.save();
    for (const poi of poiSystem.ringPois()) {
      const bearing = Math.atan2(poi.y - ship.position.y, poi.x - ship.position.x) + camRot;
      const dx = cx + Math.cos(bearing) * rimR;
      const dy = cy + Math.sin(bearing) * rimR;
      const color = poiSystem.color(poi);
      const sel = poi.id === poiSystem.selectedId;
      ctx.beginPath();
      ctx.arc(dx, dy, sel ? 4.5 : 3, 0, TWO_PI);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = sel ? 8 : 4;
      ctx.fill();
      if (sel) {
        ctx.beginPath();
        ctx.arc(dx, dy, 7.5, 0, TWO_PI);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Next nav-route stop on the POI rim (chevron; white or POI IFF).
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Renderer.js').Renderer} r
   * @param {import('../world/NavRoute.js').NavRoute} navRoute
   * @param {object} ship
   * @param {object} engine GameEngine (POI color lookup)
   * @param {number} camRot
   */
  drawNavRouteDot(ctx, r, navRoute, ship, engine, camRot = 0) {
    if (!this.layout || !ship || !navRoute) return;
    const stop = navRoute.activeStop();
    if (!stop) return;
    navRoute.resolvePosition(engine);
    const { cx, cy, radarOuterR, circleR } = this.layout;
    const rimR = (radarOuterR + circleR) / 2;
    const bearing = Math.atan2(stop.y - ship.position.y, stop.x - ship.position.x) + camRot;
    const dx = cx + Math.cos(bearing) * rimR;
    const dy = cy + Math.sin(bearing) * rimR;
    const color = navRoute.stopColor(engine, stop);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(bearing + Math.PI / 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, 4);
    ctx.lineTo(0, 1);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** POI rim geometry for hit-testing waypoint-dot clicks. */
  poiRimGeometry() {
    if (!this.layout) return null;
    const { cx, cy, radarOuterR, circleR } = this.layout;
    return { cx, cy, rimR: (radarOuterR + circleR) / 2, inner: radarOuterR, outer: circleR };
  }

  /** @param {string} title */
  cornerScreen(title) {
    const corner = this.layout?.corners?.find((c) => c.title === title);
    return corner?.screen || null;
  }

  /**
   * Draw live values into the four corner readout screens (ZOOM, etc.),
   * on top of the cached chrome. Keyed by the corner title.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Record<string, { text: string, color?: string }>} values
   */
  drawCorners(ctx, values) {
    if (!this.layout) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const rect of this.layout.corners) {
      const v = values[rect.title];
      if (!v || !v.text) continue;
      const g = rect.screen || rect;
      const pad = Math.max(4, Math.min(g.w, g.h) * 0.06);
      const x = g.x + pad;
      const w = g.w - pad * 2;
      const cxv = x + w / 2;
      const yv = g.y + pad + (g.h - pad * 2) * 0.64;
      // Auto-fit so long values (e.g. POS coords) stay inside the screen.
      let fs = Math.max(12, Math.min(g.h * 0.26, 22));
      ctx.font = `700 ${fs}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
      let tw = ctx.measureText(v.text).width;
      const maxW = w * 0.9;
      if (tw > maxW) {
        fs = Math.max(9, fs * (maxW / tw));
        ctx.font = `700 ${fs}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
      }
      ctx.fillStyle = v.color || 'rgba(200, 226, 248, 0.92)';
      ctx.shadowColor = 'rgba(90, 200, 255, 0.35)';
      ctx.shadowBlur = 4;
      ctx.fillText(v.text, cxv, yv);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  _computeLayout(r) {
    const cx = r.centerX;
    const cy = r.centerY;
    const hud = r.hudRect;
    const circleR = r.poiOuterRadius;
    const radarOuterR = r.radarOuterRadius;

    // Vertical dividers tangent to the rim → edges of the square center column.
    const colLX = cx - circleR;
    const colRX = cx + circleR;
    const leftW = colLX - hud.x;
    const rightW = hud.x + hud.w - colRX;
    const third = hud.h / 3;
    const cell = Math.min(leftW, rightW, third);
    const screwInset = Math.max(4, Math.round(cell * 0.024));
    const screwR = Math.max(3.5, cell * 0.022);
    const screwGap = 2;
    const screenInset = Math.round(screwInset + screwR + screwGap);

    const addPanel = (x, y, w, h, title) => {
      const region = { x, y, w, h, title, screwR };
      const s = {
        x: x + screenInset,
        y: y + screenInset,
        w: w - screenInset * 2,
        h: h - screenInset * 2,
      };
      region.screen = s;
      region.screwPts = this._screwCentersForPanel(x, y, w, h, s);
      return region;
    };

    const panels = [];
    for (let i = 0; i < 3; i++) {
      panels.push(addPanel(hud.x, hud.y + i * third, leftW, third, PANEL_LABELS.left[i]));
    }
    for (let i = 0; i < 3; i++) {
      panels.push(
        addPanel(colRX, hud.y + i * third, rightW, third, PANEL_LABELS.right[i]),
      );
    }

    // Four corner readouts in the center column — same metal band as side panels.
    const corners = this._layoutCornerScreens(
      hud,
      cx,
      cy,
      colLX,
      colRX,
      circleR,
      screenInset,
    );

    return {
      cx,
      cy,
      hud,
      circleR,
      radarOuterR,
      colLX,
      colRX,
      panels,
      corners,
      screenInset,
    };
  }

  /**
   * Max square glass size in a center-column quadrant with `band` inset from
   * area borders and from the POI ring (outer radius `circleR`).
   */
  _maxCornerScreenSize(circleR, band) {
    const byBox = circleR - band * 2;
    const byRing = circleR - band - (circleR + band) / Math.SQRT2;
    return Math.max(8, Math.floor(Math.min(byBox, byRing)));
  }

  _layoutCornerScreens(hud, cx, cy, colLX, colRX, circleR, band) {
    const S = this._maxCornerScreenSize(circleR, band);
    const bottom = hud.y + hud.h;
    const mk = (regionX, regionY, screen, title) => ({
      x: regionX,
      y: regionY,
      w: circleR,
      h: circleR,
      title,
      screen,
    });
    return [
      mk(
        colLX,
        hud.y,
        { x: colLX + band, y: hud.y + band, w: S, h: S },
        CORNER_LABELS[0],
      ),
      mk(
        cx,
        hud.y,
        { x: colRX - band - S, y: hud.y + band, w: S, h: S },
        CORNER_LABELS[1],
      ),
      mk(
        colLX,
        cy,
        { x: colLX + band, y: bottom - band - S, w: S, h: S },
        CORNER_LABELS[2],
      ),
      mk(
        cx,
        cy,
        { x: colRX - band - S, y: bottom - band - S, w: S, h: S },
        CORNER_LABELS[3],
      ),
    ];
  }

  _build(r) {
    const L = this._computeLayout(r);
    this.layout = L;

    const cv = this.cache || document.createElement('canvas');
    cv.width = r.width;
    cv.height = r.height;
    this.cache = cv;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, r.width, r.height);

    const { cx, cy, hud, circleR, radarOuterR } = L;

    // 1. Housing plate over the whole canvas (fills any letterbox bars).
    this._plate(c, 0, 0, r.width, r.height, STEEL.housing0, STEEL.housing1, STEEL.housing1);

    // 2. Lighter brushed console plate inside the 16:9 frame.
    this._plate(c, hud.x, hud.y, hud.w, hud.h, STEEL.plate0, STEEL.plate1, STEEL.plate2);
    this._brush(c, hud.x, hud.y, hud.w, hud.h);

    // 3. Side panel glass (max size, thin brushed-metal margin).
    for (const p of L.panels) this._panelScreen(c, p);
    for (const q of L.corners) this._panelScreen(c, q);

    // 4. Structural seams between panel regions (no extra inset from viewport).
    const third = hud.h / 3;
    for (let i = 1; i < 3; i++) {
      const y = hud.y + i * third;
      this._seam(c, hud.x, y, L.colLX - hud.x, 0);
      this._seam(c, L.colRX, y, hud.x + hud.w - L.colRX, 0);
    }
    this._seam(c, L.colLX, hud.y, 0, hud.h);
    this._seam(c, L.colRX, hud.y, 0, hud.h);

    // 5. POI waypoint rim (annulus radarOuterR → circleR) with a dot track.
    this._poiRim(c, cx, cy, radarOuterR, circleR);

    // 6. Outer 16:9 copper stroke (disabled — may revert).
    // this._border(c, hud);

    // 7. Thumb screws on the four corners of each side panel region (on top of seams).
    for (const p of L.panels) this._panelThumbScrews(c, p);

    // 8. Punch the radar/viewport hole so the live scope shows through.
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(cx, cy, radarOuterR, 0, TWO_PI);
    c.fill();
    c.restore();

    // 9. Copper bezel around the punched hole — stroke fully outside so it
    // does not eat the outer radar band (outermost pip range / divider).
    const bezelW = Math.max(2, circleR * 0.012);
    c.beginPath();
    c.arc(cx, cy, radarOuterR + bezelW / 2, 0, TWO_PI);
    c.lineWidth = bezelW;
    c.strokeStyle = COPPER.line;
    c.stroke();
  }

  _plate(c, x, y, w, h, c0, c1, c2) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c0);
    g.addColorStop(0.5, c1);
    g.addColorStop(1, c2);
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
  }

  _brush(c, x, y, w, h) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    const n = Math.round(h / 6);
    for (let i = 0; i < n; i++) {
      const yy = y + (i / n) * h;
      const dark = i % 2 === 0;
      c.strokeStyle = dark ? 'rgba(0,0,0,0.10)' : 'rgba(180,195,210,0.05)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, yy + 0.5);
      c.lineTo(x + w, yy + 0.5);
      c.stroke();
    }
    c.restore();
  }

  /** Match `_panelScreen` corner radius so layout tracks visible glass. */
  _panelScreenRadius(s) {
    return Math.min(8, s.w * 0.04, s.h * 0.04);
  }

  /**
   * Shortest distance from (x,y) to the outline of an axis-aligned round-rect
   * (exterior — point is assumed outside the glass).
   */
  _distToRoundRectBoundary(x, y, sx, sy, sw, sh, rad) {
    const rr = Math.min(rad, sw / 2, sh / 2);
    const left = sx;
    const right = sx + sw;
    const top = sy;
    const bottom = sy + sh;

    if (x < left + rr && y < top + rr) {
      return Math.hypot(x - (left + rr), y - (top + rr)) - rr;
    }
    if (x > right - rr && y < top + rr) {
      return Math.hypot(x - (right - rr), y - (top + rr)) - rr;
    }
    if (x < left + rr && y > bottom - rr) {
      return Math.hypot(x - (left + rr), y - (bottom - rr)) - rr;
    }
    if (x > right - rr && y > bottom - rr) {
      return Math.hypot(x - (right - rr), y - (bottom - rr)) - rr;
    }
    if (x < left && y >= top + rr && y <= bottom - rr) return left - x;
    if (x > right && y >= top + rr && y <= bottom - rr) return x - right;
    if (y < top && x >= left + rr && x <= right - rr) return top - y;
    if (y > bottom && x >= left + rr && x <= right - rr) return y - bottom;
    return 0;
  }

  /**
   * Screw center: equal distance to the two area border lines and to the
   * rounded screen outline (bisector of the two borders, not square midpoint).
   */
  _screwEquidistant(corner, px, py, pw, ph, s) {
    const rad = this._panelScreenRadius(s);
    const rx = px + pw;
    const by = py + ph;
    let maxD;
    /** @param {number} d */
    const at = (d) => {
      switch (corner) {
        case 'tl':
          return [px + d, py + d];
        case 'tr':
          return [rx - d, py + d];
        case 'bl':
          return [px + d, by - d];
        default:
          return [rx - d, by - d];
      }
    };
    switch (corner) {
      case 'tl':
        maxD = Math.min(s.x - px, s.y - py);
        break;
      case 'tr':
        maxD = Math.min(rx - (s.x + s.w), s.y - py);
        break;
      case 'bl':
        maxD = Math.min(s.x - px, by - (s.y + s.h));
        break;
      default:
        maxD = Math.min(rx - (s.x + s.w), by - (s.y + s.h));
        break;
    }
    maxD = Math.max(0.5, maxD * 0.98);
    const distAt = (d) => {
      const [x, y] = at(d);
      return this._distToRoundRectBoundary(x, y, s.x, s.y, s.w, s.h, rad);
    };
    let lo = 0;
    let hi = maxD;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) * 0.5;
      if (distAt(mid) - mid > 0) lo = mid;
      else hi = mid;
    }
    const d = (lo + hi) * 0.5;
    return at(d);
  }

  _screwCentersForPanel(px, py, pw, ph, s) {
    return [
      this._screwEquidistant('tl', px, py, pw, ph, s),
      this._screwEquidistant('tr', px, py, pw, ph, s),
      this._screwEquidistant('bl', px, py, pw, ph, s),
      this._screwEquidistant('br', px, py, pw, ph, s),
    ];
  }

  /** Large centered glass for one of the six side panel regions. */
  _panelScreen(c, panel) {
    const s = panel.screen;
    if (!s || s.w <= 8 || s.h <= 8) return;
    const x = s.x;
    const y = s.y;
    const w = s.w;
    const h = s.h;
    const rad = this._panelScreenRadius(s);

    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, SCREEN.glass0);
    g.addColorStop(1, SCREEN.glass1);
    this._roundRect(c, x, y, w, h, rad);
    c.fillStyle = g;
    c.fill();

    c.save();
    this._roundRect(c, x, y, w, h, rad);
    c.clip();
    const rg = c.createRadialGradient(x + w / 2, y, 0, x + w / 2, y, h * 1.1);
    rg.addColorStop(0, SCREEN.glow);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg;
    c.fillRect(x, y, w, h);
    c.strokeStyle = SCREEN.scan;
    c.lineWidth = 1;
    for (let yy = y + 3; yy < y + h; yy += 4) {
      c.beginPath();
      c.moveTo(x, yy + 0.5);
      c.lineTo(x + w, yy + 0.5);
      c.stroke();
    }
    c.restore();

    this._roundRect(c, x, y, w, h, rad);
    c.strokeStyle = SCREEN.edge;
    c.lineWidth = 1;
    c.stroke();

    if (panel.title) {
      let fs = Math.max(10, Math.min(14, w * (panel.title.length > 12 ? 0.07 : 0.085)));
      c.font = `600 ${fs}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
      let tw = c.measureText(panel.title).width;
      const maxW = w - 12;
      if (tw > maxW) {
        fs = Math.max(9, fs * (maxW / tw));
        c.font = `600 ${fs}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
      }
      c.fillStyle = SCREEN.label;
      c.shadowColor = COPPER.glow;
      c.shadowBlur = 3;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillText(panel.title, x + w / 2, y + 5);
      c.shadowBlur = 0;
    }
  }

  _panelThumbScrews(c, panel) {
    const r = panel.screwR ?? Math.max(3.5, Math.min(panel.w, panel.h) * 0.022);
    let pts = panel.screwPts;
    if (!pts?.length && panel.screen) {
      pts = this._screwCentersForPanel(panel.x, panel.y, panel.w, panel.h, panel.screen);
    }
    if (!pts?.length) return;
    for (const [px, py] of pts) this._thumbScrew(c, px, py, r);
  }

  _thumbScrew(c, x, y, r) {
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
    g.addColorStop(0, '#d8dde3');
    g.addColorStop(0.45, '#7a848e');
    g.addColorStop(1, '#2a3038');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TWO_PI);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 1;
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.65)';
    c.lineWidth = Math.max(1, r * 0.22);
    c.beginPath();
    c.moveTo(x - r * 0.55, y);
    c.lineTo(x + r * 0.55, y);
    c.moveTo(x, y - r * 0.55);
    c.lineTo(x, y + r * 0.55);
    c.stroke();
  }

  /** Inset recessed glass screen with cyan glow + copper title tab (corner readouts). */
  _screen(c, rect, inset, compact = false) {
    const pad = Math.max(4, Math.min(rect.w, rect.h) * inset);
    const x = rect.x + pad;
    const y = rect.y + pad;
    const w = rect.w - pad * 2;
    const h = rect.h - pad * 2;
    if (w <= 6 || h <= 6) return;
    const rad = Math.min(10, w * 0.06, h * 0.06);

    // Bevel: dark outer + light inner lip so the screen reads as recessed.
    this._roundRect(c, x - 2, y - 2, w + 4, h + 4, rad + 2);
    c.fillStyle = STEEL.edgeLo;
    c.fill();
    this._roundRect(c, x - 1, y - 1, w + 2, h + 2, rad + 1);
    c.strokeStyle = STEEL.edgeHi;
    c.lineWidth = 1;
    c.stroke();

    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, SCREEN.glass0);
    g.addColorStop(1, SCREEN.glass1);
    this._roundRect(c, x, y, w, h, rad);
    c.fillStyle = g;
    c.fill();

    // Soft interior glow from the top.
    c.save();
    this._roundRect(c, x, y, w, h, rad);
    c.clip();
    const rg = c.createRadialGradient(x + w / 2, y, 0, x + w / 2, y, h * 1.1);
    rg.addColorStop(0, SCREEN.glow);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg;
    c.fillRect(x, y, w, h);
    // Scanlines.
    c.strokeStyle = SCREEN.scan;
    c.lineWidth = 1;
    for (let yy = y + 3; yy < y + h; yy += 4) {
      c.beginPath();
      c.moveTo(x, yy + 0.5);
      c.lineTo(x + w, yy + 0.5);
      c.stroke();
    }
    c.restore();

    this._roundRect(c, x, y, w, h, rad);
    c.strokeStyle = SCREEN.edge;
    c.lineWidth = 1;
    c.stroke();

    // Title label (copper) — centered header on every panel/corner screen.
    if (rect.title) {
      const fs = compact
        ? Math.max(10, Math.min(h * 0.34, w * 0.3))
        : Math.max(10, Math.min(15, w * (rect.title && rect.title.length > 12 ? 0.072 : 0.09)));
      c.font = `600 ${fs}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
      c.fillStyle = SCREEN.label;
      c.shadowColor = COPPER.glow;
      c.shadowBlur = 4;
      c.textAlign = 'center';
      c.textBaseline = compact ? 'middle' : 'top';
      const ty = compact ? y + h * 0.27 : y + 6;
      c.fillText(rect.title, x + w / 2, ty);
      c.shadowBlur = 0;
    }
  }

  /** A recessed steel seam (horizontal if h==0, vertical if w==0). */
  _seam(c, x, y, w, h) {
    c.strokeStyle = STEEL.seam;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y + h);
    c.stroke();
    c.strokeStyle = STEEL.edgeHi;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + (h ? 1 : 0), y + (w ? 1 : 0));
    c.lineTo(x + w + (h ? 1 : 0), y + h + (w ? 1 : 0));
    c.stroke();
  }

  _poiRim(c, cx, cy, innerR, outerR) {
    // Steel ring body.
    c.beginPath();
    c.arc(cx, cy, outerR, 0, TWO_PI, false);
    c.arc(cx, cy, innerR, 0, TWO_PI, true);
    const g = c.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    g.addColorStop(0, STEEL.plate2);
    g.addColorStop(0.5, STEEL.plate1);
    g.addColorStop(1, STEEL.plate0);
    c.fillStyle = g;
    c.fill('evenodd');

    // Copper edges.
    c.lineWidth = Math.max(1.5, (outerR - innerR) * 0.12);
    c.strokeStyle = COPPER.line;
    c.beginPath();
    c.arc(cx, cy, outerR - c.lineWidth / 2, 0, TWO_PI);
    c.stroke();

    // Faint waypoint dot track at the rim mid-radius (bearing ticks).
    const midR = (innerR + outerR) / 2;
    c.fillStyle = 'rgba(120, 200, 255, 0.12)';
    for (let a = 0; a < 360; a += 30) {
      const rad = (a * Math.PI) / 180;
      const dx = cx + Math.cos(rad) * midR;
      const dy = cy + Math.sin(rad) * midR;
      c.beginPath();
      c.arc(dx, dy, 1.5, 0, TWO_PI);
      c.fill();
    }
  }

  _border(c, hud) {
    const copperW = 2;
    c.strokeStyle = COPPER.line;
    c.lineWidth = copperW;
    c.strokeRect(
      hud.x + copperW / 2,
      hud.y + copperW / 2,
      hud.w - copperW,
      hud.h - copperW,
    );
  }

  _rivet(c, x, y, r) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, '#c9d2db');
    g.addColorStop(0.5, '#6b757f');
    g.addColorStop(1, '#20242a');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TWO_PI);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 1;
    c.stroke();
  }

  _roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
}
