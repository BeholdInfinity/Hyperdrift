/**
 * Parametric section silhouettes keyed by geometryKey / class×role×variant.
 * Bell (generalist a) stays in StarterBellDraw.
 */

import {
  drawSectionBridge,
  drawSectionBody,
  drawSectionEngine,
  extrude,
  shade,
  palCols,
} from './StarterBellDraw.js';
import { getShipClass } from './ShipClasses.js';
import { sectionScale, ULTRA_FEET } from './SectionGeometry.js';
import { paintSectionSkin } from './ThemeSkin.js';
import { withDeckLift } from './ShipViews.js';

function footprintScale(pts, s) {
  return pts.map(([x, y]) => [x * s, y * s]);
}

function windows(ctx, x0, x1, y, n, color) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    ctx.fillRect(x - 0.7, y - 1.1, 1.4, 2.2);
  }
  ctx.globalAlpha = 1;
}

/** UltraLight single-hull silhouettes */
function drawHull(ctx, classId, pal, morph, classScale) {
  const c = pal.colors || {};
  const hull = c.hull || '#304050';
  const trim = c.trim || '#6890b0';
  const canopy = c.canopy || '#50a0d0';
  const cols = palCols(hull, trim);
  const s = sectionScale(classScale, morph);
  const unit = ULTRA_FEET[classId] || ULTRA_FEET.lightFighter;
  const foot = footprintScale(unit, s);
  extrude(ctx, foot, (classId === 'drone' ? 2.4 : 3.4) * Math.min(1, s), cols);
  paintSectionSkin(ctx, foot, pal, { role: 'hull' });
  withDeckLift(ctx, () => {
    ctx.fillStyle = canopy;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(
      (classId === 'drone' ? 3 : 8) * s,
      0,
      3.5 * s,
      2 * s,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/** Light fighter / transport cockpit + aft */
function drawLightRole(ctx, classId, role, pal, morph, classScale) {
  const c = pal.colors || {};
  const hull = c.hull || '#2c4558';
  const trim = c.trim || '#7eb6d8';
  const canopy = c.canopy || '#4a9fd4';
  const cols = palCols(hull, trim);
  const s = sectionScale(classScale, morph);
  let foot;
  let depth = 4.2;
  if (role === 'cockpit') {
    if (classId === 'fighter') {
      foot = [
        [16, -4],
        [8, -6],
        [4, -5],
        [4, 5],
        [8, 6],
        [16, 4],
        [17, 0],
      ];
      depth = 4.2;
    } else {
      foot = [
        [14, -5],
        [6, -7],
        [2, -6],
        [2, 6],
        [6, 7],
        [14, 5],
        [15.5, 0],
      ];
      depth = 4.5;
    }
  } else if (classId === 'fighter') {
    foot = [
      [2, -7],
      [-8, -9],
      [-14, -5],
      [-14, 5],
      [-8, 9],
      [2, 7],
    ];
    depth = 4;
  } else {
    foot = [
      [2, -8],
      [-6, -10],
      [-14, -7],
      [-14, 7],
      [-6, 10],
      [2, 8],
    ];
    depth = 4.2;
  }
  const scaled = footprintScale(foot, s);
  extrude(ctx, scaled, depth * Math.min(1.2, s + 0.2), cols);
  withDeckLift(ctx, () => {
    if (role === 'cockpit' && classId !== 'fighter') {
      windows(ctx, 5 * s, 12 * s, 0, 4, canopy);
    }
    if (role !== 'cockpit' && classId !== 'fighter') {
      windows(ctx, -10 * s, 0, -5 * s, 3, shade(canopy, -20));
      windows(ctx, -10 * s, 0, 5 * s, 3, shade(canopy, -20));
    }
  });
  paintSectionSkin(ctx, scaled, pal, { role });
}

function drawStandardRole(ctx, classId, role, pal, morph, theme, classScale) {
  const c = pal.colors || {};
  const hull = c.hull || '#1e2d3d';
  const trim = c.trim || '#5a8ab0';
  const canopy = c.canopy || '#4a9fd4';
  const accent = c.accent || '#c08040';
  const cols = palCols(hull, trim);
  const s = sectionScale(classScale, morph);
  const h = Math.min(1.35, 0.85 + s * 0.35);
  const isTank = classId === 'standardFighter';
  const isHauler = classId === 'hauler';
  const isTransport = classId === 'standardTransport';
  const isScience = classId === 'science';
  const isMiner = classId === 'miner';

  if (role === 'bridge') {
    let foot;
    if (isTank) {
      foot = [
        [18, -6],
        [10, -8],
        [6, -7],
        [6, 7],
        [10, 8],
        [18, 6],
        [20, 0],
      ];
    } else if (isTransport) {
      foot = [
        [18, -5],
        [10, -7],
        [6, -6],
        [6, 6],
        [10, 7],
        [18, 5],
        [19, 0],
      ];
    } else if (isScience) {
      foot = [
        [22, -3],
        [12, -5],
        [6, -4.5],
        [6, 4.5],
        [12, 5],
        [22, 3],
        [24, 0],
      ];
    } else {
      foot = [
        [20, -4],
        [12, -6],
        [8, -5],
        [8, 5],
        [12, 6],
        [20, 4],
        [21.5, 0],
      ];
    }
    const scaled = footprintScale(foot, s);
    extrude(ctx, scaled, (isTank ? 5.5 : 4.8) * h, cols);
    withDeckLift(ctx, () => {
      if (isTransport) windows(ctx, 8 * s, 16 * s, 0, 5, canopy);
      if (isScience) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.arc(14 * s, 0, 3.2 * s, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    paintSectionSkin(ctx, scaled, pal, { role });
  } else if (role === 'body') {
    let foot;
    if (isTank) {
      foot = [
        [10, -10],
        [2, -12],
        [-10, -13],
        [-14, -10],
        [-14, 10],
        [-10, 13],
        [2, 12],
        [10, 10],
      ];
    } else if (isHauler) {
      foot = [
        [10, -9],
        [2, -12],
        [-12, -14],
        [-16, -11],
        [-16, 11],
        [-12, 14],
        [2, 12],
        [10, 9],
      ];
    } else if (isTransport) {
      foot = [
        [10, -8],
        [2, -10],
        [-10, -11],
        [-14, -9],
        [-14, 9],
        [-10, 11],
        [2, 10],
        [10, 8],
      ];
    } else if (isMiner) {
      foot = [
        [10, -8],
        [2, -10],
        [-8, -12],
        [-14, -10],
        [-14, 10],
        [-8, 12],
        [2, 10],
        [10, 8],
      ];
    } else {
      foot = [
        [10, -7],
        [4, -9],
        [-6, -11],
        [-14, -13],
        [-16, -11],
        [-16, 11],
        [-14, 13],
        [-6, 11],
        [4, 9],
        [10, 7],
      ];
    }
    const scaled = footprintScale(foot, s);
    extrude(ctx, scaled, (isTank || isHauler ? 5 : 4.2) * h, cols);
    withDeckLift(ctx, () => {
      if (isTransport) {
        windows(ctx, -10 * s, 6 * s, -6 * s, 6, canopy);
        windows(ctx, -10 * s, 6 * s, 6 * s, 6, canopy);
      }
      if (isHauler) {
        ctx.strokeStyle = shade(accent, -10);
        ctx.lineWidth = 0.55;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(-12 * s, -8 * s, 16 * s, 16 * s);
        ctx.setLineDash([]);
      }
    });
    paintSectionSkin(ctx, scaled, pal, { role });
  } else {
    const foot =
      isHauler || isTank
        ? [
            [-6, -12],
            [-14, -14],
            [-20, -8],
            [-20, 8],
            [-14, 14],
            [-6, 12],
          ]
        : [
            [-8, -12],
            [-14, -14],
            [-20, -7],
            [-20, 7],
            [-14, 14],
            [-8, 12],
          ];
    const scaled = footprintScale(foot, s);
    extrude(ctx, scaled, 4.6 * h, cols);
    paintSectionSkin(ctx, scaled, pal, { role });
  }
}

function drawHeavyRole(ctx, classId, role, pal, morph, theme, classScale) {
  // Unit footprints match Standard beam; class.scale (~2×) provides capital size.
  const c = pal.colors || {};
  const hull = c.hull || '#243646';
  const trim = c.trim || '#6a90a8';
  const canopy = c.canopy || '#4a9fd4';
  const accent = c.accent || '#c08040';
  const cols = palCols(hull, trim, 2);
  const s = sectionScale(classScale, morph);
  const h = Math.min(1.5, 0.9 + s * 0.2);
  const isTransport = classId === 'heavyTransport';
  const isHauler = classId === 'heavyHauler';
  const isFighter = classId === 'heavyFighter';
  const eliteYacht = isTransport && theme === 'elite';
  const cruise = isTransport && (theme === 'civMid' || theme === 'civUpper');

  if (role === 'bridge') {
    let foot;
    if (eliteYacht) {
      foot = [
        [20, -5],
        [12, -7],
        [6, -6],
        [6, 6],
        [12, 7],
        [20, 5],
        [22, 0],
      ];
    } else if (cruise) {
      foot = [
        [19, -6],
        [11, -8],
        [6, -7],
        [6, 7],
        [11, 8],
        [19, 6],
        [21, 0],
      ];
    } else if (isFighter) {
      foot = [
        [18, -7],
        [10, -9],
        [6, -8],
        [6, 8],
        [10, 9],
        [18, 7],
        [20, 0],
      ];
    } else {
      foot = [
        [20, -5],
        [12, -7],
        [6, -6],
        [6, 6],
        [12, 7],
        [20, 5],
        [21.5, 0],
      ];
    }
    const scaled = footprintScale(foot, s);
    extrude(ctx, scaled, (eliteYacht ? 6.2 : 5.8) * h, cols);
    withDeckLift(ctx, () => {
      if (isTransport) {
        const n = eliteYacht ? 4 : cruise ? 8 : 6;
        windows(ctx, 8 * s, 18 * s, 0, n, canopy);
      }
    });
    paintSectionSkin(ctx, scaled, pal, { role });
  } else if (role === 'body') {
    let foot;
    if (eliteYacht) {
      foot = [
        [10, -10],
        [2, -12],
        [-10, -13],
        [-16, -11],
        [-16, 11],
        [-10, 13],
        [2, 12],
        [10, 10],
      ];
    } else if (cruise) {
      foot = [
        [10, -11],
        [2, -13],
        [-10, -14],
        [-16, -12],
        [-16, 12],
        [-10, 14],
        [2, 13],
        [10, 11],
      ];
    } else if (isHauler) {
      foot = [
        [10, -12],
        [2, -14],
        [-12, -15],
        [-16, -13],
        [-16, 13],
        [-12, 15],
        [2, 14],
        [10, 12],
      ];
    } else if (isFighter) {
      foot = [
        [10, -12],
        [2, -14],
        [-10, -15],
        [-16, -12],
        [-16, 12],
        [-10, 15],
        [2, 14],
        [10, 12],
      ];
    } else {
      foot = [
        [10, -11],
        [2, -13],
        [-10, -14],
        [-16, -12],
        [-16, 12],
        [-10, 14],
        [2, 13],
        [10, 11],
      ];
    }
    const scaled = footprintScale(foot, s);
    extrude(ctx, scaled, (isHauler ? 6.5 : 5.5) * h, cols);
    withDeckLift(ctx, () => {
      if (isTransport) {
        windows(ctx, -12 * s, 6 * s, -7 * s, cruise ? 10 : 7, canopy);
        windows(ctx, -12 * s, 6 * s, 7 * s, cruise ? 10 : 7, canopy);
        if (cruise) {
          ctx.strokeStyle = shade(accent, 20);
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(-12 * s, -9 * s);
          ctx.lineTo(6 * s, -9 * s);
          ctx.moveTo(-12 * s, 9 * s);
          ctx.lineTo(6 * s, 9 * s);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      if (isHauler) {
        ctx.strokeStyle = shade(accent, -15);
        ctx.lineWidth = 0.55;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(-14 * s, -10 * s, 20 * s, 20 * s);
        ctx.setLineDash([]);
      }
    });
    paintSectionSkin(ctx, scaled, pal, { role });
  } else {
    const foot = [
      [-6, -13],
      [-14, -15],
      [-20, -8],
      [-20, 8],
      [-14, 15],
      [-6, 13],
    ];
    const scaled = footprintScale(foot, s);
    extrude(ctx, scaled, 5.5 * h, cols);
    paintSectionSkin(ctx, scaled, pal, { role });
  }
}

/**
 * Draw one section mesh.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sec section catalog row
 * @param {object} pal palette from ShipDefinition
 */
export function drawCatalogSection(ctx, sec, pal) {
  if (!sec) return;
  const classId = sec.classId;
  const cls = getShipClass(classId);
  const classScale = cls?.scale ?? 1;

  if (sec.geometryKey === 'bell') {
    // Bell mesh is authored at unit scale; match hardpoints via class.scale.
    const s = classScale || 1;
    ctx.save();
    if (s !== 1) ctx.scale(s, s);
    if (sec.role === 'bridge') drawSectionBridge(ctx, pal);
    else if (sec.role === 'body') drawSectionBody(ctx, pal);
    else if (sec.role === 'engine') drawSectionEngine(ctx, pal);
    ctx.restore();
    return;
  }

  const group = cls?.swapGroup || sec.swapGroup;
  const morph = sec.morph || 0;
  const theme = sec.theme || pal.theme;

  if (group === 'ultraLight' || sec.role === 'hull') {
    drawHull(ctx, classId, pal, morph, classScale);
    return;
  }
  if (group === 'light') {
    drawLightRole(ctx, classId, sec.role, pal, morph, classScale);
    return;
  }
  if (group === 'heavy') {
    drawHeavyRole(ctx, classId, sec.role, pal, morph, theme, classScale);
    return;
  }
  drawStandardRole(ctx, classId, sec.role, pal, morph, theme, classScale);
}

/**
 * Draw all sections for a ship def in aft→fore order with optional X offsets.
 */
export function drawCatalogSections(ctx, def, sectionDx = null) {
  const roles = def.sectionRoles();
  const drawOrder = [...roles].reverse(); // engine/aft first
  for (const role of drawOrder) {
    const sec = def.section(role);
    if (!sec) continue;
    const pal = def.paletteForSection(role);
    const dx = sectionDx?.[role] || 0;
    if (dx) ctx.save();
    if (dx) ctx.translate(dx, 0);
    drawCatalogSection(ctx, sec, pal);
    if (dx) ctx.restore();
  }
}
