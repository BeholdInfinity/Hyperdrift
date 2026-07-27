/**
 * Viewport ring annuli — above starfield, below playable entities.
 * Belt edges are not drawn in flight view (streaming uses invisible annuli).
 */

/** Draw ring annuli in world space (ctx already set up by Renderer.renderWorldLayer). */
export function drawRingBackdrop(_ctx, _camera) {
  // Intentionally empty — ring borders are gameplay/streaming bounds only.
}
