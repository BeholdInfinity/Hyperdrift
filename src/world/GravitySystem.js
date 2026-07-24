/**
 * Planetary gravity toward Planet Center (Thera).
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
  const influence = layout.planet?.influenceRadius ?? 700000;
  const mu = gravityMu(layout);

  if (r < surfaceR) {
    const push = mu / (surfaceR * surfaceR) * 4;
    return { ax: (dx / r) * push, ay: (dy / r) * push, r };
  }

  let strength = mu / (r * r);
  if (r > influence) {
    const fade = Math.max(0, 1 - (r - influence) / (influence * 0.35));
    strength *= fade * fade;
  }
  return { ax: (dx / r) * strength, ay: (dy / r) * strength, r };
}

export function applyGravity(entity, deltaTime, layout = getSectorLayout()) {
  if (!entity?.affectedByGravity) return;
  const { ax, ay } = gravityAccelAt(entity.position.x, entity.position.y, layout);
  entity.velocity.x += ax * deltaTime;
  entity.velocity.y += ay * deltaTime;
}
