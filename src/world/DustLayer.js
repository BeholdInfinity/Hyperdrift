/**
 * Optional screen-parallax dust grains for DepthCompositor.
 */

export class DustLayer {
  constructor() {
    this.motes = [];
    this.tileSize = 4000;
    this._seeded = false;
  }

  _ensureMotes(count = 420) {
    if (this._seeded) return;
    this._seeded = true;
    for (let i = 0; i < count; i++) {
      this.motes.push({
        x: Math.random() * this.tileSize - this.tileSize / 2,
        y: Math.random() * this.tileSize - this.tileSize / 2,
        size: 0.4 + Math.random() * 0.8,
        alpha: 0.15 + Math.random() * 0.35,
        hash: Math.random(),
      });
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} layerCfg — depth config entry (type dust)
   * @param {object} params
   */
  render(ctx, layerCfg, cameraX, cameraY, viewportRadius, time, zoom = 1, globals = {}) {
    if (!layerCfg?.enabled) return;

    const parallax = (layerCfg.parallax ?? 0.35) * (globals.parallaxScale ?? 1);
    const density = layerCfg.density ?? 0.65;
    const alphaBase = layerCfg.brightness ?? layerCfg.alpha ?? 0.22;
    const minSize = layerCfg.minSize ?? 0.4;
    const maxSize = layerCfg.maxSize ?? 1.2;
    const color = layerCfg.color || '#887766';
    const drift = (layerCfg.driftSpeed ?? 1) * time * 0.02;

    this._ensureMotes();
    const z = Math.max(zoom, 0.01);
    const cover = viewportRadius + 120;
    const coverSq = cover * cover;
    const halfTile = this.tileSize / 2;
    const px = -cameraX * parallax + drift;
    const py = -cameraY * parallax + drift * 0.7;

    ctx.fillStyle = color;
    for (const mote of this.motes) {
      if (mote.hash > density) continue;

      const bx = ((mote.x + px) % this.tileSize + this.tileSize) % this.tileSize - halfTile;
      const by = ((mote.y + py) % this.tileSize + this.tileSize) % this.tileSize - halfTile;
      const drawX = bx * z;
      const drawY = by * z;
      if (drawX * drawX + drawY * drawY > coverSq) continue;

      const size = (minSize + (maxSize - minSize) * (mote.size / 1.2)) * (0.85 + mote.alpha * 0.3);
      ctx.globalAlpha = alphaBase * mote.alpha;
      ctx.fillRect(drawX - size * 0.5, drawY - size * 0.5, size, size);
    }
    ctx.globalAlpha = 1;
  }
}
