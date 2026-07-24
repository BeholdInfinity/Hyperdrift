/**
 * Viewport ring annuli — above starfield, below playable entities.
 */

import { getSectorLayout } from './SectorLayout.js';

/** Draw ring annuli in world space (ctx already set up by Renderer.renderWorldLayer). */
export function drawRingBackdrop(ctx, camera) {
  const layout = getSectorLayout();
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const zoom = camera.effectiveZoom || 1;

  for (const ring of layout.rings || []) {
    const ri = ring.innerR;
    const ro = ring.outerR;
    ctx.strokeStyle = 'rgba(70, 95, 120, 0.14)';
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, ri, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, ro, 0, Math.PI * 2);
    ctx.stroke();
  }
}
