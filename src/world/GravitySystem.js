/**
 * Planetary gravity toward Planet Center (Thera).
 * Full inverse-square falloff everywhere in the overworld.
 * Deep instance flights set entity.affectedByGravity = false.
 */

import { getSectorLayout } from './SectorLayout.js';
import { gravityMu } from './OrbitKinematics.js';

export function gravityAccelAt(x, y, layout = getSectorLayout()) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const dx = cx - x;
  const dy = cy - y;
  const r = Math.hypot(dx, dy);
  if (r < 1) return { ax: 0, ay: 0, r: 0 };

  const surfaceR = layout.planet?.surfaceBlockRadius ?? layout.planet?.radius ?? 35000;
  const mu = gravityMu(layout);

  if (r < surfaceR) {
    const push = mu / (surfaceR * surfaceR) * 4;
    return { ax: (dx / r) * push, ay: (dy / r) * push, r };
  }

  const strength = mu / (r * r);
  return { ax: (dx / r) * strength, ay: (dy / r) * strength, r };
}

export function applyGravity(entity, deltaTime, layout = getSectorLayout()) {
  if (!entity?.affectedByGravity) return;
  const { ax, ay } = gravityAccelAt(entity.position.x, entity.position.y, layout);
  entity.velocity.x += ax * deltaTime;
  entity.velocity.y += ay * deltaTime;
}
