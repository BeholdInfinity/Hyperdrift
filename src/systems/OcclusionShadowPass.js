/**
 * Occlusion shadow render passes — shared occluder geometry from ContactOcclusion.
 *
 * A) SHIP viewport: pitch-black #000 umbra after world, before player ship.
 * B) Full-disc SCAN: darkened wedges on scope backdrop before radar blips.
 */
export class OcclusionShadowPass {
  /**
   * Render world-space umbra polygons (SHIP view, pitch black).
   * Called inside the world layer (already world-transformed).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{verts:Array<{x:number,y:number}>}>} shadowPolys
   */
  renderWorldShadow(ctx, shadowPolys) {
    if (!shadowPolys?.length) return;
    ctx.save();
    ctx.fillStyle = '#000';
    for (const p of shadowPolys) {
      if (!p.verts || p.verts.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(p.verts[0].x, p.verts[0].y);
      for (let i = 1; i < p.verts.length; i++) {
        ctx.lineTo(p.verts[i].x, p.verts[i].y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Render darkened occluded wedges on full-disc SCAN backdrop.
   * @param {CanvasRenderingContext2D} ctx screen-space
   * @param {Array<{ a0: number, a1: number }>} wedges bearings (screen, rad)
   * @param {number} cx scope center x
   * @param {number} cy scope center y
   * @param {number} outerR scope outer radius (px)
   * @param {number} alpha darken strength 0..1
   */
  renderScopeShadow(ctx, wedges, cx, cy, outerR, alpha = 0.7) {
    if (!wedges?.length) return;
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (const w of wedges) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, w.a0, w.a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
