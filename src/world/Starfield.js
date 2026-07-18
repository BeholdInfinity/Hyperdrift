export class Starfield {
  constructor() {
    // Far → near. Dense field of small stars; size/brightness barely change with depth.
    this.layers = [
      { count: 700, parallax: 0.003, minSize: 0.55, maxSize: 0.85, brightness: 0.28, color: '#556677', twinkle: 0.55 },
      { count: 580, parallax: 0.008, minSize: 0.6, maxSize: 0.9, brightness: 0.34, color: '#667788', twinkle: 0.48 },
      { count: 480, parallax: 0.018, minSize: 0.65, maxSize: 0.95, brightness: 0.4, color: '#778899', twinkle: 0.4 },
      { count: 380, parallax: 0.04, minSize: 0.7, maxSize: 1.05, brightness: 0.46, color: '#8899aa', twinkle: 0.32 },
      { count: 280, parallax: 0.08, minSize: 0.75, maxSize: 1.15, brightness: 0.52, color: '#99aabb', twinkle: 0.24 },
      { count: 180, parallax: 0.14, minSize: 0.85, maxSize: 1.25, brightness: 0.58, color: '#bbccdd', twinkle: 0.16 },
      { count: 110, parallax: 0.22, minSize: 0.95, maxSize: 1.4, brightness: 0.64, color: '#ddeeff', twinkle: 0.1 },
    ];
    this.stars = [];
    this.tileSize = 5000;

    for (let layer = 0; layer < this.layers.length; layer++) {
      const config = this.layers[layer];
      for (let i = 0; i < config.count; i++) {
        this.stars.push({
          x: Math.random() * this.tileSize - this.tileSize / 2,
          y: Math.random() * this.tileSize - this.tileSize / 2,
          size: config.minSize + Math.random() * (config.maxSize - config.minSize),
          brightness: config.brightness * (0.85 + Math.random() * 0.3),
          layer,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 2.5 + Math.random() * 4.5,
          hash: Math.random(),
        });
      }
    }
  }

  render(ctx, cameraX, cameraY, viewportRadius, time, zoom = 1) {
    const z = Math.max(zoom, 0.01);
    const margin = 160;
    const cover = viewportRadius + margin;
    const coverSq = cover * cover;
    const halfTile = this.tileSize / 2;
    const tileScreen = this.tileSize * z;
    // Cap tile stamps — extreme zoom-out repeating the same field reads as a lattice
    const tilesOut = Math.min(
      2,
      Math.max(0, Math.ceil(cover / Math.max(tileScreen, 1) - 0.5))
    );

    /**
     * Mid/low zoom (title + hangar door/window peepholes at 0.55) packs
     * thousands of dots into a woven mesh — thin far layers.
     */
    const farCut = z < 0.22 ? 4 : z < 0.35 ? 2 : z < 0.65 ? 1 : 0;
    const dens =
      z >= 0.75 ? 1 : Math.max(0.08, Math.pow(z / 0.75, 1.4));

    for (const star of this.stars) {
      if (star.layer < farCut) continue;
      if (dens < 1) {
        const layerKeep = 0.2 + 0.8 * (star.layer / (this.layers.length - 1));
        if (star.hash > dens * layerKeep) continue;
      }

      const config = this.layers[star.layer];
      const px = star.x - cameraX * config.parallax;
      const py = star.y - cameraY * config.parallax;

      const baseX = ((px % this.tileSize) + this.tileSize) % this.tileSize - halfTile;
      const baseY = ((py % this.tileSize) + this.tileSize) % this.tileSize - halfTile;

      const wave = Math.sin(time * star.twinkleSpeed + star.twinklePhase);
      const blink = Math.pow(Math.max(0, wave), 16);
      const alpha = clamp(star.brightness * (1 - config.twinkle * blink), 0, 1);
      const r = star.size;

      for (let ox = -tilesOut; ox <= tilesOut; ox++) {
        for (let oy = -tilesOut; oy <= tilesOut; oy++) {
          const drawX = (baseX + ox * this.tileSize) * z;
          const drawY = (baseY + oy * this.tileSize) * z;
          if (drawX * drawX + drawY * drawY > coverSq) continue;

          ctx.beginPath();
          ctx.arc(drawX, drawY, r, 0, Math.PI * 2);
          ctx.fillStyle = config.color;
          ctx.globalAlpha = alpha;
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
