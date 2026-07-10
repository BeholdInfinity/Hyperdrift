export class NebulaField {
  constructor() {
    this.depthLayers = [
      { parallax: 0.08, alphaMult: 0.6, driftMult: 0.4, sizeMult: 1.3 },
      { parallax: 0.25, alphaMult: 0.85, driftMult: 0.7, sizeMult: 1.0 },
      { parallax: 0.55, alphaMult: 1.1, driftMult: 1.0, sizeMult: 0.75 },
    ];
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
      const layer = this.depthLayers[(nebula.depth || 2) - 1];
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

        const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, size);
        gradient.addColorStop(0, `hsla(${hue}, 75%, 55%, ${alpha * 1.8})`);
        gradient.addColorStop(0.35, `hsla(${hue + 25}, 65%, 40%, ${alpha})`);
        gradient.addColorStop(0.7, `hsla(${hue + 50}, 55%, 25%, ${alpha * 0.4})`);
        gradient.addColorStop(1, `hsla(${hue + 70}, 50%, 15%, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bx, by, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  renderProcedural(ctx, cameraX, cameraY, time, viewportRadius, zoom) {
    const pseudoNebulae = this._generateAmbientNebulae(cameraX, cameraY, viewportRadius, zoom);
    for (const nebula of pseudoNebulae) {
      const layer = this.depthLayers[nebula.depth - 1];
      this._renderNebula(ctx, nebula, cameraX, cameraY, time, layer);
    }
  }

  _generateAmbientNebulae(cx, cy, radius, zoom) {
    const nebulae = [];
    const cellSize = 3000;
    const gridRadius = Math.ceil(radius * 2 / cellSize / zoom) + 1;

    for (let gx = -gridRadius; gx <= gridRadius; gx++) {
      for (let gy = -gridRadius; gy <= gridRadius; gy++) {
        const cellX = Math.floor(cx / cellSize) + gx;
        const cellY = Math.floor(cy / cellSize) + gy;
        const hash = ((cellX * 73856093) ^ (cellY * 19349663)) >>> 0;
        const rng = mulberry32(hash);

        if (rng() > 0.35) continue;

        const depth = 1 + Math.floor(rng() * 3);
        const baseX = cellX * cellSize + rng() * cellSize;
        const baseY = cellY * cellSize + rng() * cellSize;
        const nebRadius = 500 + rng() * 800;
        const hue = 180 + rng() * 140;

        nebulae.push({
          x: baseX,
          y: baseY,
          radius: nebRadius,
          hue,
          alpha: 0.03 + rng() * 0.06,
          driftX: (rng() - 0.5) * 8,
          driftY: (rng() - 0.5) * 8,
          phase: rng() * Math.PI * 2,
          depth,
          blobs: Array.from({ length: 4 + Math.floor(rng() * 5) }, () => ({
            offsetX: (rng() - 0.5) * nebRadius,
            offsetY: (rng() - 0.5) * nebRadius,
            size: nebRadius * (0.25 + rng() * 0.55),
            hueOffset: (rng() - 0.5) * 50,
          })),
        });
      }
    }
    return nebulae;
  }

  _renderNebula(ctx, nebula, cameraX, cameraY, time, layer) {
    const px = (nebula.x - cameraX) * layer.parallax;
    const py = (nebula.y - cameraY) * layer.parallax;

    const drift = Math.sin(time * 0.08 + nebula.phase) * 25 * layer.driftMult;
    const cx = px + nebula.driftX * time * layer.driftMult + drift;
    const cy = py + nebula.driftY * time * layer.driftMult;

    for (const blob of nebula.blobs) {
      const bx = cx + blob.offsetX * layer.parallax;
      const by = cy + blob.offsetY * layer.parallax;
      const pulse = 0.85 + 0.15 * Math.sin(time * 0.12 + blob.hueOffset);
      const size = blob.size * layer.sizeMult * pulse;
      const hue = nebula.hue + blob.hueOffset;
      const alpha = nebula.alpha * layer.alphaMult;

      const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, size);
      gradient.addColorStop(0, `hsla(${hue}, 75%, 55%, ${alpha * 1.8})`);
      gradient.addColorStop(0.35, `hsla(${hue + 25}, 65%, 40%, ${alpha})`);
      gradient.addColorStop(0.7, `hsla(${hue + 50}, 55%, 25%, ${alpha * 0.4})`);
      gradient.addColorStop(1, `hsla(${hue + 70}, 50%, 15%, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(bx, by, size, 0, Math.PI * 2);
      ctx.fill();
    }
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
