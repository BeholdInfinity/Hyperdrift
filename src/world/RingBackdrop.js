/**
 * Viewport ring annuli — above starfield, below playable entities.
 */

import { getRingBackdropConfig } from './RingBackdropConfig.js';
import { getSectorLayout } from './SectorLayout.js';
import { drawRingBeltFillOverworld } from './RingBeltVisual.js';

/** World-space distance from (px, py) to the nearest point on an annulus. */
function distToAnnulus(px, py, cx, cy, innerR, outerR) {
  const d = Math.hypot(px - cx, py - cy);
  if (d < innerR) return innerR - d;
  if (d > outerR) return d - outerR;
  return 0;
}

/** Draw ring annuli in world space (ctx already set up by Renderer.renderWorldLayer). */
export function drawRingBackdrop(ctx, camera, viewportRadius = 0) {
  const cfg = getRingBackdropConfig();
  if (!cfg.enabled) return;

  const layout = getSectorLayout();
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const zoom = Math.max(0.001, camera.effectiveZoom || 1);
  const camX = camera.position?.x ?? 0;
  const camY = camera.position?.y ?? 0;
  const viewR = viewportRadius > 0 ? (viewportRadius + 400) / zoom : Infinity;

  for (const ring of layout.rings || []) {
    const ri = ring.innerR;
    const ro = ring.outerR;
    if (ro * zoom < 3) continue;

    if (viewR < Infinity) {
      const gap = distToAnnulus(camX, camY, cx, cy, ri, ro);
      if (gap > viewR + (ro - ri) * 0.5) continue;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 / zoom, 1 / zoom);
    drawRingBeltFillOverworld(ctx, 0, 0, ri * zoom, ro * zoom, ring, 1, {
      showBaseFill: cfg.showBaseFill,
      showBands: cfg.showBands,
      base: cfg.base,
      bands: cfg.bands,
    });
    ctx.restore();
  }
}
