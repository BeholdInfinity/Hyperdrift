/**
 * Therissa Prime (Thera) — planetary rotation (30 game-hour period).
 */

import { getSectorLayout } from './SectorLayout.js';

export function planetSpinPeriodSec(layout = getSectorLayout()) {
  const hours = layout.planet?.rotationPeriodHours ?? 30;
  return hours * 3600;
}

export function planetSpinAngle(gameTime, layout = getSectorLayout()) {
  const period = planetSpinPeriodSec(layout);
  if (period <= 0) return layout.planet?.rotationAngle0 ?? 0;
  const omega = (Math.PI * 2) / period;
  return (layout.planet?.rotationAngle0 ?? 0) + omega * gameTime;
}

/** Surface-fixed site on the rotating disc. */
export function surfacePositionAt(site, gameTime, layout = getSectorLayout()) {
  const r = layout.planet?.radius ?? 35000;
  const angle = (site.surfaceAngle ?? 0) + planetSpinAngle(gameTime, layout);
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}
