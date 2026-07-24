/**
 * Ambient + world nebulae. One recipe for title / hangar peepholes / space —
 * no per-view generation forks (zoom only affects caller framing).
 *
 * Soft baked sprites + LO plate blit: stacking live radial gradients at low
 * alpha dither into a “woven tapestry” on GPU/canvas.
 */

const PLATE_SCALE = 0.4;
const SPRITE_SIZE = 96;
const HUE_BUCKET = 12;

export class NebulaField {
  constructor() {
    this.depthLayers = [
      { parallax: 0.08, alphaMult: 0.75, driftMult: 0.4, sizeMult: 1.3 },
      { parallax: 0.25, alphaMult: 0.95, driftMult: 0.7, sizeMult: 1.0 },
      { parallax: 0.55, alphaMult: 1.15, driftMult: 1.0, sizeMult: 0.75 },
    ];
    /** Generation pad so glows exist before they enter the cover. */
    this._maxGlowPx = 1200;
    this._plate = null;
    this._plateCtx = null;
    this._plateSide = 0;
    this._spriteCache = new Map();
    /** Cached ambient blit — rebuild when camera cell / zoom / time bucket changes. */
    this._ambientCacheKey = '';
    this._ambientCachePlate = null;
    this._ambientCacheSide = 0;
  }

  /**
   * Shared ambient backdrop paint (caller: ctx already centered / clipped).
   * Used by title, hangar windows/doors, and flight.
   */
  paintAmbient(ctx, cameraX, cameraY, time, coverRadius, zoom = 1) {
    const glowPad = Math.min(this._maxGlowPx * 0.25, Math.max(160, coverRadius * 0.25));
    const worldSide = coverRadius * 2 + glowPad * 2;
    const plateSide = Math.max(64, Math.ceil(worldSide * PLATE_SCALE));
    const drawSide = plateSide / PLATE_SCALE;

    const cell = 2800;
    const timeBucket = Math.floor(time * 4);
    const cacheKey = `${Math.floor(cameraX / cell)},${Math.floor(cameraY / cell)}|${Math.round(zoom * 80)}|${Math.round(coverRadius / 250)}|${timeBucket}|${plateSide}`;

    if (this._ambientCacheKey === cacheKey && this._ambientCachePlate) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        this._ambientCachePlate,
        0,
        0,
        plateSide,
        plateSide,
        -drawSide / 2,
        -drawSide / 2,
        drawSide,
        drawSide
      );
      ctx.restore();
      return;
    }

    this._ensurePlate(plateSide);

    const pctx = this._plateCtx;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, this._plateSide, this._plateSide);
    pctx.setTransform(PLATE_SCALE, 0, 0, PLATE_SCALE, plateSide / 2, plateSide / 2);

    this.renderProcedural(pctx, cameraX, cameraY, time, coverRadius, zoom);

    if (!this._ambientCachePlate || this._ambientCacheSide < plateSide) {
      const s = Math.ceil(plateSide);
      this._ambientCachePlate = document.createElement('canvas');
      this._ambientCachePlate.width = s;
      this._ambientCachePlate.height = s;
      this._ambientCacheSide = s;
    }
    const blitCtx = this._ambientCachePlate.getContext('2d', { alpha: true });
    blitCtx.setTransform(1, 0, 0, 1, 0, 0);
    blitCtx.clearRect(0, 0, plateSide, plateSide);
    blitCtx.drawImage(this._plate, 0, 0, plateSide, plateSide);
    this._ambientCacheKey = cacheKey;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      this._ambientCachePlate,
      0,
      0,
      plateSide,
      plateSide,
      -drawSide / 2,
      -drawSide / 2,
      drawSide,
      drawSide
    );
    ctx.restore();
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
          alpha: 0.1 + rng() * 0.08,
          driftX: (rng() - 0.5) * 8,
          driftY: (rng() - 0.5) * 8,
          phase: rng() * Math.PI * 2,
          depth,
          blobs: Array.from({ length: blobCount }, () => ({
            offsetX: (rng() - 0.5) * nebRadius,
            offsetY: (rng() - 0.5) * nebRadius,
            size: nebRadius * (0.35 + rng() * 0.5),
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

  /** Shared blob paint for ambient + world nebulae (baked soft sprite). */
  _fillBlob(ctx, bx, by, size, hue, alpha) {
    if (size < 1 || alpha < 0.002) return;
    const sprite = this._blobSprite(hue);
    const a = Math.min(0.75, alpha * 1.55);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, bx - size, by - size, size * 2, size * 2);
    ctx.restore();
  }

  _blobSprite(hue) {
    const key = Math.round(hue / HUE_BUCKET) * HUE_BUCKET;
    let sprite = this._spriteCache.get(key);
    if (sprite) return sprite;

    sprite = document.createElement('canvas');
    sprite.width = SPRITE_SIZE;
    sprite.height = SPRITE_SIZE;
    const sctx = sprite.getContext('2d');
    const m = SPRITE_SIZE / 2;
    const g = sctx.createRadialGradient(m, m, 0, m, m, m);
    // Opaque-ish stops baked into pixels — modulate with globalAlpha at draw time
    g.addColorStop(0, `hsla(${key}, 72%, 52%, 1)`);
    g.addColorStop(0.4, `hsla(${key + 28}, 62%, 38%, 0.7)`);
    g.addColorStop(0.75, `hsla(${key + 48}, 55%, 22%, 0.22)`);
    g.addColorStop(1, `hsla(${key + 55}, 50%, 14%, 0)`);
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(m, m, m, 0, Math.PI * 2);
    sctx.fill();

    this._spriteCache.set(key, sprite);
    return sprite;
  }

  _ensurePlate(side) {
    if (this._plate && this._plateSide >= side) return;
    const s = Math.ceil(side);
    this._plate = document.createElement('canvas');
    this._plate.width = s;
    this._plate.height = s;
    this._plateCtx = this._plate.getContext('2d', { alpha: true });
    this._plateSide = s;
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
