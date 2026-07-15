/**
 * Starter Generalist Mid Mk2 `a` — drawn as THREE section meshes + hardpoint items.
 * 2D top-down: flat footprint fills only.
 * 2.5D angled: screen-up deck lift + side-wall quads (heading-aware edge peek).
 */

import { SHIP } from '../core/Constants.js';
import { paintSectionSkin } from './ThemeSkin.js';
import {
  VIEW_ANGLED,
  activeShipView,
  angledLiftLocal,
  setLastDeckLift,
  withDeckLift,
} from './ShipViews.js';

export function shade(hex, amt) {
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

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function centroid(pts) {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  return [cx / pts.length, cy / pts.length];
}

/** Inset toward centroid only — keeps top-down / hangar view symmetric (no side-skew). */
function deckPoly(pts, inset) {
  const [cx, cy] = centroid(pts);
  return pts.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * inset, y + (dy / len) * inset];
  });
}

/**
 * Flat top-down fill — no side walls, bevels, or height shadow.
 * @returns {[number, number][]} footprint (unchanged)
 */
function extrudeFlat(ctx, footprint, cols) {
  setLastDeckLift(0, 0);
  ctx.fillStyle = cols.top;
  poly(ctx, footprint);
  ctx.fill();

  if (cols.panel) {
    const inner = deckPoly(footprint, 1.15);
    const inset = deckPoly(footprint, 1.55);
    ctx.fillStyle = shade(cols.panel, -10);
    poly(ctx, inner);
    ctx.fill();
    ctx.fillStyle = cols.panel;
    poly(ctx, inset);
    ctx.fill();
  }

  if (cols.trim) {
    ctx.strokeStyle = cols.trim;
    ctx.lineWidth = 0.55;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.8;
    poly(ctx, footprint);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  return footprint;
}

/**
 * Angled 2.5D: lift deck toward screen-up (heading-aware) and draw side quads.
 * Depth from fills; trim strokes stay thin (~0.45–0.75).
 * @param {number} h lift strength in px
 */
function extrudeAngled(ctx, footprint, h, cols, headingIndex) {
  const liftH = Math.max(1.2, h * 0.45);
  const lift = angledLiftLocal(headingIndex, liftH);
  setLastDeckLift(lift.x, lift.y);

  const outer = footprint;
  const top = footprint.map(([x, y]) => [x + lift.x, y + lift.y]);
  const [cx, cy] = centroid(outer);
  const liftLen = Math.hypot(lift.x, lift.y) || 1;
  const liftUx = lift.x / liftLen;
  const liftUy = lift.y / liftLen;
  // Visible walls face away from camera tilt (screen-down / −lift)
  const viewAwayX = -liftUx;
  const viewAwayY = -liftUy;

  // Soft drop shadow under the base, biased opposite the lift
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  poly(
    ctx,
    outer.map(([x, y]) => [x - liftUx * 2.4 + viewAwayX * 0.6, y - liftUy * 2.4 + viewAwayY * 0.6])
  );
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  poly(
    ctx,
    outer.map(([x, y]) => [x - liftUx * 1.2, y - liftUy * 1.2])
  );
  ctx.fill();

  // Underside / base plate
  ctx.fillStyle = cols.far || shade(cols.side, -28);
  poly(ctx, outer);
  ctx.fill();

  const n = outer.length;
  const farBase = cols.far || shade(cols.side, -30);
  const sideBase = cols.side || shade(cols.top, -16);
  const nearBase = cols.near || shade(cols.side, -8);

  /** @type {{ i: number, j: number, depth: number, facing: number }[]} */
  const faces = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (outer[i][0] + outer[j][0]) / 2;
    const my = (outer[i][1] + outer[j][1]) / 2;
    let ox = mx - cx;
    let oy = my - cy;
    const olen = Math.hypot(ox, oy) || 1;
    ox /= olen;
    oy /= olen;
    const facing = ox * viewAwayX + oy * viewAwayY;
    // Skip walls that face the camera tilt (hidden under the deck)
    if (facing < -0.08) continue;
    const depth = mx * liftUx + my * liftUy;
    faces.push({ i, j, depth, facing });
  }
  faces.sort((a, b) => a.depth - b.depth);

  for (const face of faces) {
    const { i, j, facing } = face;
    // Facing the peek direction → lighter near wall; grazing → darker far
    const amt = -4 - (1 - Math.max(0, facing)) * 22;
    let fill = shade(sideBase, amt);
    if (facing > 0.55) fill = shade(nearBase, amt * 0.4);
    else if (facing < 0.18) fill = shade(farBase, amt * 0.25);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(outer[i][0], outer[i][1]);
    ctx.lineTo(outer[j][0], outer[j][1]);
    ctx.lineTo(top[j][0], top[j][1]);
    ctx.lineTo(top[i][0], top[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  // Raised deck
  const rim = Math.max(0.85, h * 0.22);
  const deck = deckPoly(top, rim);
  ctx.fillStyle = cols.top;
  poly(ctx, deck);
  ctx.fill();
  ctx.strokeStyle = shade(cols.top, 32);
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.28;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (cols.trim) {
    ctx.strokeStyle = cols.trim;
    ctx.lineWidth = 0.55;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (cols.panel) {
    const inner = deckPoly(top, rim + 1.05);
    const inset = deckPoly(top, rim + 1.5);
    ctx.fillStyle = shade(cols.panel, -14);
    poly(ctx, inner);
    ctx.fill();
    ctx.fillStyle = cols.panel;
    poly(ctx, inset);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.45;
    ctx.stroke();
  }

  return deck;
}

/**
 * Shared hull extrude. Sides / lift only in angled 2.5D (hangar / Blueprint).
 * @param {number} h depth strength in px
 */
export function extrude(ctx, footprint, h, cols) {
  const view = activeShipView();
  if (view.mode !== VIEW_ANGLED) {
    return extrudeFlat(ctx, footprint, cols);
  }
  return extrudeAngled(ctx, footprint, h, cols, view.headingIndex ?? 0);
}

function rivets(ctx, pts, count = 6) {
  ctx.fillStyle = 'rgba(12,10,8,0.55)';
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const i0 = Math.floor(t * pts.length) % pts.length;
    const [x, y] = pts[i0];
    ctx.beginPath();
    ctx.arc(x, y, 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function palCols(base, trim, liftBias = 0) {
  return {
    far: shade(base, -32 + liftBias),
    side: shade(base, -12 + liftBias),
    near: shade(base, 6 + liftBias),
    top: shade(base, 22 + liftBias),
    panel: shade(base, 10 + liftBias),
    trim,
  };
}

/** Section: main body + dorsal strip + sponsons */
export function drawSectionBody(ctx, pal) {
  const c = pal.colors || {};
  const hull = c.hull || '#1e2d3d';
  const trim = c.trim || '#5a8ab0';
  const cols = palCols(hull, trim);

  const body = [
    [10, -7],
    [4, -9],
    [-6, -11],
    [-14, -13.5],
    [-16, -11],
    [-16, 11],
    [-14, 13.5],
    [-6, 11],
    [4, 9],
    [10, 7],
  ];
  const top = extrude(ctx, body, 4.2, cols);
  paintSectionSkin(ctx, body, pal, { role: 'body' });

  // Dorsal raised plate (owns turret hardpoint visually)
  const dorsal = [
    [6, -4],
    [-8, -5],
    [-8, 5],
    [6, 4],
  ];
  extrude(ctx, dorsal, 2.2, palCols('#2a3f52', shade(trim, -8), 4));
  withDeckLift(ctx, () => {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(5, -0.3);
    ctx.lineTo(-7.2, -0.3);
    ctx.stroke();
  });

  // Sponsons
  const sL = [
    [-2, -11],
    [-12, -13.5],
    [-12, -10.5],
    [-2, -9],
  ];
  const sR = [
    [-2, 11],
    [-12, 13.5],
    [-12, 10.5],
    [-2, 9],
  ];
  extrude(ctx, sL, 2.8, palCols('#253848', shade(trim, -20)));
  extrude(ctx, sR, 2.8, palCols('#253848', shade(trim, -20)));

  rivets(ctx, top, 8);
}

/** Section: bridge / cockpit */
export function drawSectionBridge(ctx, pal) {
  const c = pal.colors || {};
  const trim = c.trim || '#7eb6d8';
  const canopy = c.canopy || '#4a9fd4';
  const hull = c.hull || '#2c4558';

  const bridge = [
    [20, -4],
    [12, -6.5],
    [8, -5.5],
    [8, 5.5],
    [12, 6.5],
    [20, 4],
    [21.5, 0],
  ];
  extrude(ctx, bridge, 5.2, palCols(hull, trim, 6));
  paintSectionSkin(ctx, bridge, pal, { role: 'bridge' });

  // Canopy well (recessed)
  const canopyFoot = [
    [19, -2],
    [14, -3.2],
    [14, 3.2],
    [19, 2],
    [19.8, 0],
  ];
  extrude(ctx, canopyFoot, 1.8, {
    far: '#0a1820',
    side: '#122830',
    near: '#1a3848',
    top: shade(canopy, -50),
    panel: null,
    trim: shade(trim, -20),
  });
  // Glass top (centered inset) — follows canopy deck lift
  withDeckLift(ctx, () => {
    const glass = deckPoly(canopyFoot, 1.1);
    ctx.fillStyle = canopy;
    ctx.globalAlpha = 0.62;
    poly(ctx, glass);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#e8f8ff';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(18, -1.1);
    ctx.lineTo(15.2, -2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Frame
    ctx.strokeStyle = 'rgba(15,35,50,0.55)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(17.4, -2.3);
    ctx.lineTo(17.7, 2.1);
    ctx.moveTo(15.4, -2.7);
    ctx.lineTo(15.6, 2.5);
    ctx.stroke();
  });
}

/** Section: aft engineering bay only — engine bell/housing is the mainEngine item. */
export function drawSectionEngine(ctx, pal) {
  const c = pal.colors || {};
  const accent = c.accent || '#c47840';
  const trim = c.trim || '#6a90a8';
  const hull = c.hull || '#243646';

  const aft = [
    [-8, -12],
    [-14, -14],
    [-20, -7],
    [-20, 7],
    [-14, 14],
    [-8, 12],
  ];
  extrude(ctx, aft, 4.8, palCols(hull, trim));

  // Empty mount socket (no engine installed) — recessed ring on hardpoint centerline
  const ex = -19;
  const ey = 0;
  withDeckLift(ctx, () => {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 3.0, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(trim, -15);
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 2.6, 4.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Bolt circle on empty hardpoint
    ctx.fillStyle = 'rgba(20, 28, 36, 0.9)';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 1.4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(accent, -40);
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([2.2, 2]);
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 2.1, 3.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  });

  paintSectionSkin(ctx, aft, pal, { role: 'engine' });
}

/**
 * Draw starter section roles in caller-controlled Z-order.
 * Typical: engine → body → (laser under) → bridge on top.
 */
export function drawStarterSections(
  ctx,
  def,
  roles = ['engine', 'body', 'bridge'],
  sectionDx = null
) {
  for (const role of roles) {
    const sec = def.section(role);
    if (!sec) continue;
    const pal = def.paletteForSection(role);
    const dx = sectionDx?.[role] || 0;
    if (dx) ctx.save();
    if (dx) ctx.translate(dx, 0);
    if (role === 'engine') drawSectionEngine(ctx, pal);
    else if (role === 'body') drawSectionBody(ctx, pal);
    else if (role === 'bridge') drawSectionBridge(ctx, pal);
    if (dx) ctx.restore();
  }
}

export function drawStarterMainEngine(ctx, socket, morph = 0, pal = null) {
  const s = 1 + morph * 0.25;
  const x = socket.x;
  const y = socket.y ?? 0;
  const accent = pal?.colors?.accent || '#e09050';
  const trim = pal?.colors?.trim || '#8a7060';
  const metal = pal?.colors?.metal || '#1a2430';

  // Mount flange against the bay
  const flange = [
    [x + 3.4 * s, y - 5.4 * s],
    [x + 1.0 * s, y - 6.2 * s],
    [x + 1.0 * s, y + 6.2 * s],
    [x + 3.4 * s, y + 5.4 * s],
  ];
  extrude(ctx, flange, 2.4, palCols(metal, trim));

  // Housing ring (installed engine — not part of empty bay section)
  ctx.save();
  ctx.fillStyle = shade(metal, -10);
  ctx.beginPath();
  ctx.ellipse(x + 1.2 * s, y, 3.3 * s, 5.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Soft rim depth (fill ring + thin accent)
  ctx.strokeStyle = shade(metal, 18);
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(x + 1.2 * s, y, 3.05 * s, 5.15 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(x + 1.2 * s, y, 3.3 * s, 5.5 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = shade(accent, 25);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(x + 1.2 * s, y, 2.5 * s, 4.2 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const bell = [
    [x + 2.2 * s, y - 4.8 * s],
    [x - 1.8 * s, y - 6.6 * s],
    [x - 2.6 * s, y - 4.2 * s],
    [x - 2.6 * s, y + 4.2 * s],
    [x - 1.8 * s, y + 6.6 * s],
    [x + 2.2 * s, y + 4.8 * s],
  ];
  extrude(ctx, bell, 3.2, {
    far: '#0a1016',
    side: '#121820',
    near: metal,
    top: shade(metal, -20),
    panel: '#080c10',
    trim: accent,
  });

  ctx.fillStyle = '#040608';
  ctx.beginPath();
  ctx.ellipse(x - 1.0 * s, y, 1.35 * s, 4.0 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(accent, 30);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(x - 0.4 * s, y, 0.85 * s, 2.8 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawStarterThrusterCup(ctx, socket, trim = '#6aa0c8', morph = 0) {
  // Compact flush nozzle — no flared “claw” cup. Mk scales size (all tiers share SHIP.THRUSTER_CUP_SCALE).
  const mk = socket.mk ?? 2;
  const mkMul = (0.65 + (mk - 1) * 0.09) * SHIP.THRUSTER_CUP_SCALE; // Mk1≈0.65 … Mk5≈1.01, ×1.5
  const s = (0.42 + (morph || 0) * 0.05) * mkMul;
  ctx.save();
  ctx.translate(socket.x, socket.y);
  ctx.rotate(socket.angle);

  // Short housing block (exhaust along +X). Straight sides — no flare.
  const housing = [
    [-0.55 * s, -1.45 * s],
    [1.85 * s, -1.55 * s],
    [1.85 * s, 1.55 * s],
    [-0.55 * s, 1.45 * s],
  ];
  extrude(ctx, housing, 1.15 * s, palCols('#1a2430', shade(trim, -28)));

  // Oval face plate with bevel (drawn before bore)
  const fx = 1.55 * s;
  ctx.fillStyle = shade('#1a2430', -8);
  ctx.beginPath();
  ctx.ellipse(fx, 0, 0.72 * s, 1.35 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade('#243040', 10);
  ctx.beginPath();
  ctx.ellipse(fx, 0, 0.58 * s, 1.12 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(trim, -8);
  ctx.lineWidth = Math.max(0.4, 0.5 * s);
  ctx.globalAlpha = 0.75;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Bore: dark aperture + thin nozzle ring
  ctx.fillStyle = '#020508';
  ctx.beginPath();
  ctx.ellipse(fx, 0, 0.34 * s, 0.72 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner lip catchlight
  ctx.strokeStyle = shade(trim, 28);
  ctx.lineWidth = Math.max(0.35, 0.42 * s);
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.ellipse(fx - 0.08 * s, 0, 0.28 * s, 0.58 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = shade(trim, 12);
  ctx.lineWidth = Math.max(0.35, 0.48 * s);
  ctx.beginPath();
  ctx.ellipse(fx, 0, 0.34 * s, 0.72 * s, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export function drawStarterMiningLaser(ctx, socket, relAngle = 0) {
  ctx.save();
  ctx.translate(socket.x, socket.y);
  ctx.rotate(relAngle);

  // Mount stays under the bridge; barrel extends past the nose tip
  const collar = [
    [-4.2, -2.8],
    [-0.6, -3.0],
    [-0.6, 3.0],
    [-4.2, 2.8],
  ];
  extrude(ctx, collar, 2.2, palCols('#1a2830', '#5a7868'));

  const body = [
    [-3.6, -2.2],
    [4.6, -1.4],
    [4.6, 1.4],
    [-3.6, 2.2],
  ];
  extrude(ctx, body, 2.6, palCols('#2a4050', '#7ec8a0', 4));

  ctx.fillStyle = '#0a1814';
  ctx.beginPath();
  ctx.arc(4.8, 0, 1.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#90e0b0';
  ctx.lineWidth = 0.55;
  ctx.stroke();
  ctx.fillStyle = '#40c080';
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.arc(4.8, 0, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Empty chin hardpoint under the bridge (drawn before bridge when unequipped). */
export function drawStarterLaserSocket(ctx, socket) {
  const x = socket.x;
  const y = socket.y ?? 0;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y, 2.4, 2.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90, 120, 104, 0.5)';
  ctx.lineWidth = 0.55;
  ctx.setLineDash([2, 1.8]);
  ctx.beginPath();
  ctx.ellipse(x, y, 2.0, 1.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(16, 24, 28, 0.85)';
  ctx.beginPath();
  ctx.ellipse(x, y, 1.0, 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawStarterSmallTurret(ctx, ship, socket, trim = '#5a8ab0') {
  const ox = socket.x;
  const oy = socket.y;
  ctx.save();
  ctx.translate(ox, oy);

  const outer = SHIP.TURRET_BASE_OUTER;
  const mid = SHIP.TURRET_BASE_MID;
  const inner = SHIP.TURRET_BASE_INNER;
  const localAim = ship.getTurretLocalAngle?.() ?? 0;
  const recoil = (ship.turretRecoil || 0) * SHIP.TURRET_RECOIL_DIST;

  // Pedestal as extruded octagon-ish
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    ring.push([Math.cos(a) * outer, Math.sin(a) * outer]);
  }
  extrude(ctx, ring, 3.0, palCols('#1a242e', trim, 2));

  ctx.fillStyle = '#243040';
  ctx.beginPath();
  ctx.arc(0, 0, mid, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = trim;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, mid, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#141c24';
  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(trim, -20);
  ctx.lineWidth = 0.45;
  ctx.stroke();

  ctx.save();
  ctx.rotate(localAim);
  const sleeveInner = inner + 0.3;
  const sleeveOuter = outer - 0.8;
  const halfW = 2.5;
  const sleeve = [
    [sleeveInner, -halfW],
    [sleeveOuter, -halfW],
    [sleeveOuter, halfW],
    [sleeveInner, halfW],
  ];
  extrude(ctx, sleeve, 2.2, palCols('#5a6268', trim));

  const barrelStart = sleeveInner + 0.4;
  const barrelEnd = SHIP.TURRET_BARREL_LENGTH - recoil;
  const muzzleEnd = barrelEnd + SHIP.TURRET_MUZZLE_EXTRA;
  ctx.fillStyle = '#080a0c';
  ctx.fillRect(barrelStart, -1.4, Math.max(0.5, barrelEnd - barrelStart), 2.8);
  ctx.fillStyle = '#101418';
  ctx.fillRect(muzzleEnd - 3.4, -2.2, 3.4, 4.4);
  ctx.fillStyle = '#2a3238';
  ctx.fillRect(muzzleEnd - 3.0, -2.2, 0.55, 4.4);
  ctx.restore();

  ctx.restore();
}
