export class Starfield {
  constructor() {
    this.layers = [
      { count: 500, parallax: 0.005, minSize: 0.3, maxSize: 0.7, brightness: 0.15, color: '#667788', twinkle: 0.1 },
      { count: 400, parallax: 0.015, minSize: 0.5, maxSize: 1.0, brightness: 0.25, color: '#778899', twinkle: 0.15 },
      { count: 300, parallax: 0.04, minSize: 0.8, maxSize: 1.5, brightness: 0.4, color: '#99aabb', twinkle: 0.2 },
      { count: 180, parallax: 0.1, minSize: 1.2, maxSize: 2.5, brightness: 0.6, color: '#bbccdd', twinkle: 0.25 },
      { count: 80, parallax: 0.22, minSize: 2, maxSize: 4.5, brightness: 0.85, color: '#ddeeff', twinkle: 0.3 },
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
          brightness: config.brightness * (0.6 + Math.random() * 0.4),
          layer,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.5 + Math.random() * 2,
        });
      }
    }
  }

  render(ctx, cameraX, cameraY, viewportRadius, time, zoom = 1) {
    for (const star of this.stars) {
      const config = this.layers[star.layer];
      const px = star.x - cameraX * config.parallax;
      const py = star.y - cameraY * config.parallax;

      const screenX = ((px % this.tileSize) + this.tileSize) % this.tileSize - this.tileSize / 2;
      const screenY = ((py % this.tileSize) + this.tileSize) % this.tileSize - this.tileSize / 2;

      const dist = Math.hypot(screenX, screenY);
      if (dist > (viewportRadius + 80) / zoom) continue;

      const twinkleAmount = config.twinkle * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
      const alpha = star.brightness + twinkleAmount;

      const drawSize = star.size * (0.8 + config.parallax * 8) * zoom;

      ctx.beginPath();
      ctx.arc(screenX * zoom, screenY * zoom, drawSize, 0, Math.PI * 2);
      ctx.fillStyle = config.color;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fill();

      if (config.parallax > 0.15 && drawSize > 2) {
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.arc(screenX * zoom, screenY * zoom, drawSize * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
