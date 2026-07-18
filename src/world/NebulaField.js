/**
 * Ambient + world nebulae. One recipe for title / hangar peepholes / space —
 * no per-view generation forks (zoom only affects caller framing).
 *
 * Sparse stronger blobs: dense stacks of tiny-alpha gradients dither into a
 * “woven tapestry” on GPU/canvas.
 */

export class NebulaField {
  constructor() {
    this.depthLayers = [
      { parallax: 0.08, alphaMult: 0.75, driftMult: 0.4, sizeMult: 1.3 },
      { parallax: 0.25, alphaMult: 0.95, driftMult: 0.7, sizeMult: 1.0 },
      { parallax: 0.55, alphaMult: 1.15, driftMult: 1.0, sizeMult: 0.75 },
    ];
    /** Generation pad so glows exist before they enter the cover. */
    this._maxGlowPx = 1200;
  }

  /**
   * Shared ambient backdrop paint (caller: ctx already centered / clipped).
   * Used by title, hangar windows/doors, and flight.
   */
  paintAmbient(ctx, cameraX, cameraY, time, coverRadius, zoom = 1) {
    this.renderProcedural(ctx, cameraX, cameraY, time, coverRadius, zoom);
  }

  render(ctx, nebulae, cameraX, cameraY, time) {
    for (const layer of this.depthLayers) {
      for (const nebula of nebulae) {
        if ((nebula.depth || 1) !== this.depthLayers.indexOf(layer) + 1) continue;
        this._renderNebula(ctx, nebula, cameraX, cameraY, time, layer);
      }
    }
  }

  renderWorldNebulae(ctx, nebulae, time) {
    for (const nebula of nebulae) {
      const layer = this.depthLayers[(nebula.depth || 2) - 1] || this.depthLayers[1];
      const drift = Math.sin(time * 0.08 + nebula.phase) * 25 * layer.driftMult;
      const cx = nebula.x + nebula.driftX * time * layer.driftMult + drift;
      const cy = nebula.y + nebula.driftY * time * layer.driftMult;

      for (const blob of nebula.blobs) {
        const bx = cx + blob.offsetX;
        const by = cy + blob.offsetY;
        const pulse = 0.85 + 0.15 * Math.sin(time * 0.12 + blob.hueOffset);
        const size = blob.size * layer.sizeMult * pulse;
        const hue = nebula.hue + blob.hueOffset;
        const alpha = nebula.alpha * layer.alphaMult;
        this._fillBlob(ctx, bx, by, size, hue, alpha);
      }
    }
  }

  renderProcedural(ctx, cameraX, cameraY, time, viewportRadius, zoom) {
    const pseudoNebulae = this._generateAmbientNebulae(
      cameraX,
      cameraY,
      viewportRadius,
      zoom
    );
    for (const nebula of pseudoNebulae) {
      const layer = this.depthLayers[nebula.depth - 1];
      this._renderNebula(ctx, nebula, cameraX, cameraY, time, layer, viewportRadius);
    }
  }

  /**
   * Same generation recipe at every zoom — cover radius drives how many cells
   * are considered; density/alpha/blob counts do not fork per view.
   */
  _generateAmbientNebulae(cx, cy, radius, _zoom = 1) {
    const nebulae = [];
    const cellSize = 4500;
    const spawnRate = 0.16;
    const minParallax = this.depthLayers[0].parallax;
    const glowPad = Math.min(this._maxGlowPx, Math.max(500, radius * 0.65));
    const screenCover = radius + glowPad;
    const worldCover = screenCover / minParallax;
    const gridRadius = Math.min(4, Math.ceil(worldCover / cellSize) + 1);

    for (let gx = -gridRadius; gx <= gridRadius; gx++) {
      for (let gy = -gridRadius; gy <= gridRadius; gy++) {
        const cellX = Math.floor(cx / cellSize) + gx;
        const cellY = Math.floor(cy / cellSize) + gy;
        const hash = ((cellX * 73856093) ^ (cellY * 19349663)) >>> 0;
        const rng = mulberry32(hash);

        if (rng() > spawnRate) continue;

        const depth = 1 + Math.floor(rng() * 3);
        const baseX = cellX * cellSize + rng() * cellSize;
        const baseY = cellY * cellSize + rng() * cellSize;
        const nebRadius = 520 + rng() * 780;
        const hue = 180 + rng() * 140;
        const blobCount = 2 + Math.floor(rng() * 2);

        nebulae.push({
          x: baseX,
          y: baseY,
          radius: nebRadius,
          hue,
          alpha: 0.08 + rng() * 0.07,
          driftX: (rng() - 0.5) * 8,
          driftY: (rng() - 0.5) * 8,
          phase: rng() * Math.PI * 2,
          depth,
          blobs: Array.from({ length: blobCount }, () => ({
            offsetX: (rng() - 0.5) * nebRadius,
            offsetY: (rng() - 0.5) * nebRadius,
            size: nebRadius * (0.3 + rng() * 0.5),
            hueOffset: (rng() - 0.5) * 50,
          })),
        });
      }
    }
    return nebulae;
  }

  _renderNebula(ctx, nebula, cameraX, cameraY, time, layer, viewportRadius = Infinity) {
    const px = (nebula.x - cameraX) * layer.parallax;
    const py = (nebula.y - cameraY) * layer.parallax;

    const drift = Math.sin(time * 0.08 + nebula.phase) * 25 * layer.driftMult;
    const cx = px + nebula.driftX * time * layer.driftMult + drift;
    const cy = py + nebula.driftY * time * layer.driftMult;

    const maxReach = nebula.radius * layer.sizeMult + this._maxGlowPx * 0.15;
    const dist = Math.hypot(cx, cy);
    if (dist - maxReach > viewportRadius + this._maxGlowPx) return;

    for (const blob of nebula.blobs) {
      const bx = cx + blob.offsetX * layer.parallax;
      const by = cy + blob.offsetY * layer.parallax;
      const pulse = 0.85 + 0.15 * Math.sin(time * 0.12 + blob.hueOffset);
      const size = blob.size * layer.sizeMult * pulse;
      const hue = nebula.hue + blob.hueOffset;
      const alpha = nebula.alpha * layer.alphaMult;
      this._fillBlob(ctx, bx, by, size, hue, alpha);
    }
  }

  /** Shared blob paint for ambient + world nebulae. */
  _fillBlob(ctx, bx, by, size, hue, alpha) {
    if (size < 1 || alpha < 0.002) return;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, size);
    // Three stops (not four) — less micro-banding / dither weave
    g.addColorStop(0, `hsla(${hue}, 72%, 52%, ${Math.min(0.55, alpha * 1.65)})`);
    g.addColorStop(0.45, `hsla(${hue + 28}, 62%, 38%, ${alpha})`);
    g.addColorStop(1, `hsla(${hue + 55}, 50%, 18%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
