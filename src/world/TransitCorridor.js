/**
 * Inter-station shipping lanes — elevated ambient spawn weight.
 */

import { listSites, siteWorldPosition, getSectorLayout } from './SectorLayout.js';

function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(px - nx, py - ny);
}

function chordClear(x1, y1, x2, y2, layout) {
  const pr = (layout.planet?.radius ?? 35000) + (layout.trafficCorridors?.clearMargin ?? 8000);
  const mx = (x1 + x2) * 0.5;
  const my = (y1 + y2) * 0.5;
  return Math.hypot(mx, my) > pr || distPointToSegment(0, 0, x1, y1, x2, y2) > pr;
}

export function buildTransitCorridors(gameTime = 0, layout = getSectorLayout()) {
  const stations = listSites('station', layout);
  const corridors = [];
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = siteWorldPosition(stations[i], gameTime, layout);
      const b = siteWorldPosition(stations[j], gameTime, layout);
      if (!chordClear(a.x, a.y, b.x, b.y, layout)) continue;
      corridors.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return corridors;
}

export function corridorSpawnFactor(x, y, gameTime = 0, layout = getSectorLayout()) {
  const cfg = layout.trafficCorridors || {};
  const half = cfg.halfWidth ?? 30000;
  const mult = cfg.spawnMultiplier ?? 2.5;
  let best = 0;
  for (const c of buildTransitCorridors(gameTime, layout)) {
    const d = distPointToSegment(x, y, c.x1, c.y1, c.x2, c.y2);
    if (d >= half) continue;
    const f = 1 - d / half;
    if (f > best) best = f;
  }
  return best > 0 ? 1 + (mult - 1) * best : 1;
}
