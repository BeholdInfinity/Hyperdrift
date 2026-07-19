/**
 * Cockpit HUD frame — the pilot's-view 16:9 console housing drawn around the
 * scanner ring. Renders a worn steel + copper industrial frame: an outer 16:9
 * border, a POI waypoint rim thickened out to the frame's top/bottom edge,
 * vertical dividers + horizontal thirds carving the left/right columns into six
 * recessed screen panels, and four corner sections around the ring reserved for
 * ship metadata.
 *
 * The whole frame is static per window size, so it's painted once into an
 * offscreen canvas and blitted each frame. A transparent hole over the scanner
 * band lets the live scanner + viewport show through underneath.
 *
 * Geometry (all derived from the renderer):
 *   - hudRect ...... largest 16:9 rect fitting the window (letterbox otherwise)
 *   - circleR ...... POI rim outer radius = hudRect.h / 2 (touches top/bottom)
 *   - scannerOuterR  inner edge of the POI rim (outer edge of the scanner band)
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
  left: ['CONTACT', 'CONTACTS', 'COMMS'],
  right: ['DESTINATION', 'SECTOR MAP', 'POWER'],
};
const CORNER_LABELS = ['SPD', 'POS', 'ZOOM', 'MODES'];

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
    if (!r.hudRect || !r.scannerBand) return;
    const key = `${r.width}x${r.height}|${Math.round(r.scannerOuterRadius)}`;
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
    const { cx, cy, scannerOuterR, circleR } = this.layout;
    const rimR = (scannerOuterR + circleR) / 2;
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

  /** POI rim geometry for hit-testing waypoint-dot clicks. */
  poiRimGeometry() {
    if (!this.layout) return null;
    const { cx, cy, scannerOuterR, circleR } = this.layout;
    return { cx, cy, rimR: (scannerOuterR + circleR) / 2, inner: scannerOuterR, outer: circleR };
  }

  /**
   * Draw live values into the four corner readout screens (SPD/POS/ZOOM/PREC),
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
      const pad = Math.max(4, Math.min(rect.w, rect.h) * 0.06);
      const x = rect.x + pad;
      const w = rect.w - pad * 2;
      const cxv = x + w / 2;
      const yv = rect.y + pad + (rect.h - pad * 2) * 0.64;
      // Auto-fit so long values (e.g. POS coords) stay inside the screen.
      let fs = Math.max(12, Math.min(rect.h * 0.26, 22));
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
    const scannerOuterR = r.scannerOuterRadius;

    // Vertical dividers tangent to the rim → edges of the square center column.
    const colLX = cx - circleR;
    const colRX = cx + circleR;
    const leftW = colLX - hud.x;
    const rightW = hud.x + hud.w - colRX;
    const third = hud.h / 3;

    const panels = [];
    for (let i = 0; i < 3; i++) {
      panels.push({
        x: hud.x,
        y: hud.y + i * third,
        w: leftW,
        h: third,
        title: PANEL_LABELS.left[i],
      });
    }
    for (let i = 0; i < 3; i++) {
      panels.push({
        x: colRX,
        y: hud.y + i * third,
        w: rightW,
        h: third,
        title: PANEL_LABELS.right[i],
      });
    }

    // Four corner screens tucked into the corners of the center square, sized
    // to stay fully outside the ring circle (s ≤ circleR·(1 − 1/√2)).
    const cs = circleR * 0.26;
    const m = Math.max(6, circleR * 0.03);
    const corners = [
      { x: colLX + m, y: hud.y + m, w: cs, h: cs, title: CORNER_LABELS[0] },
      { x: colRX - m - cs, y: hud.y + m, w: cs, h: cs, title: CORNER_LABELS[1] },
      { x: colLX + m, y: hud.y + hud.h - m - cs, w: cs, h: cs, title: CORNER_LABELS[2] },
      { x: colRX - m - cs, y: hud.y + hud.h - m - cs, w: cs, h: cs, title: CORNER_LABELS[3] },
    ];

    return { cx, cy, hud, circleR, scannerOuterR, colLX, colRX, panels, corners };
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

    const { cx, cy, hud, circleR, scannerOuterR } = L;

    // 1. Housing plate over the whole canvas (fills any letterbox bars).
    this._plate(c, 0, 0, r.width, r.height, STEEL.housing0, STEEL.housing1, STEEL.housing1);

    // 2. Lighter brushed console plate inside the 16:9 frame.
    this._plate(c, hud.x, hud.y, hud.w, hud.h, STEEL.plate0, STEEL.plate1, STEEL.plate2);
    this._brush(c, hud.x, hud.y, hud.w, hud.h);

    // 3. Recessed screens for the six side panels + four corner readouts.
    for (const p of L.panels) this._screen(c, p, 0.1);
    for (const q of L.corners) this._screen(c, q, 0.06, true);

    // 4. Structural seams: column dividers + horizontal thirds (drawn once).
    const third = hud.h / 3;
    for (let i = 1; i < 3; i++) {
      const y = hud.y + i * third;
      this._seam(c, hud.x, y, L.colLX - hud.x, 0); // left column
      this._seam(c, L.colRX, y, hud.x + hud.w - L.colRX, 0); // right column
    }
    this._seam(c, L.colLX, hud.y, 0, hud.h); // left divider
    this._seam(c, L.colRX, hud.y, 0, hud.h); // right divider

    // 5. POI waypoint rim (annulus scannerOuterR → circleR) with a dot track.
    this._poiRim(c, cx, cy, scannerOuterR, circleR);

    // 6. Outer 16:9 border frame with copper inlay + corner rivets.
    this._border(c, hud);

    // 7. Punch the scanner/viewport hole so the live radar shows through.
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(cx, cy, scannerOuterR, 0, TWO_PI);
    c.fill();
    c.restore();

    // 8. Copper bezel ring around the punched scanner hole.
    c.beginPath();
    c.arc(cx, cy, scannerOuterR + 1, 0, TWO_PI);
    c.lineWidth = Math.max(2, circleR * 0.012);
    c.strokeStyle = COPPER.line;
    c.stroke();
    c.beginPath();
    c.arc(cx, cy, scannerOuterR - 1, 0, TWO_PI);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(0,0,0,0.5)';
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

  /** Inset recessed glass screen with cyan glow + copper title tab. */
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

    // Title label (copper) — a header for panels, centered for corner readouts.
    if (rect.title) {
      const fs = compact
        ? Math.max(10, Math.min(h * 0.34, w * 0.3))
        : Math.max(11, Math.min(16, w * 0.09));
      c.font = `600 ${fs}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
      c.fillStyle = SCREEN.label;
      c.shadowColor = COPPER.glow;
      c.shadowBlur = 4;
      if (compact) {
        // Label only; the live value is drawn each frame by drawCorners().
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(rect.title, x + w / 2, y + h * 0.27);
      } else {
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.fillText(rect.title, x + 8, y + 6);
      }
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
    const t = Math.max(10, Math.round(hud.h * 0.018));
    // Beveled steel frame: bright top/left plate, dark bottom/right.
    c.save();
    // Outer dark line.
    c.strokeStyle = STEEL.housing1;
    c.lineWidth = t + 4;
    c.strokeRect(hud.x, hud.y, hud.w, hud.h);
    // Steel plate frame.
    c.strokeStyle = STEEL.plate0;
    c.lineWidth = t;
    c.strokeRect(hud.x, hud.y, hud.w, hud.h);
    // Highlight + shadow bevel lines.
    c.strokeStyle = STEEL.edgeHi;
    c.lineWidth = 1.5;
    c.strokeRect(hud.x + t / 2, hud.y + t / 2, hud.w - t, hud.h - t);
    // Copper inlay just inside the frame.
    c.strokeStyle = COPPER.line;
    c.lineWidth = 2;
    c.strokeRect(hud.x + t + 2, hud.y + t + 2, hud.w - 2 * (t + 2), hud.h - 2 * (t + 2));
    c.restore();

    // Corner rivets.
    const rv = Math.max(3, t * 0.32);
    const off = t * 0.9;
    const pts = [
      [hud.x + off, hud.y + off],
      [hud.x + hud.w - off, hud.y + off],
      [hud.x + off, hud.y + hud.h - off],
      [hud.x + hud.w - off, hud.y + hud.h - off],
    ];
    for (const [px, py] of pts) this._rivet(c, px, py, rv);
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
