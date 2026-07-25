/**
 * Fiery HUD breakup when the player ship is destroyed — shrapnel from cockpit
 * panels/rim flies outward, then yields to fullscreen space + death overlay.
 */

const DURATION = 1.05;
const FLASH_PEAK = 0.22;

const DEBRIS_COLORS = [
  '#2c3138',
  '#40464e',
  '#b87333',
  '#6e4118',
  '#1b1f24',
  '#e6ab6d',
  '#0a1826',
];

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pushShard(list, x, y, w, h, cx, cy) {
  if (w < 6 || h < 6) return;
  const mx = x + w * 0.5;
  const my = y + h * 0.5;
  const dx = mx - cx;
  const dy = my - cy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const speed = rand(140, 420) + dist * 0.08;
  list.push({
    x,
    y,
    w,
    h,
    vx: nx * speed + rand(-40, 40),
    vy: ny * speed + rand(-40, 40),
    rot: rand(0, Math.PI * 2),
    spin: rand(-9, 9),
    color: DEBRIS_COLORS[(Math.random() * DEBRIS_COLORS.length) | 0],
    glow: Math.random() < 0.35,
    life: 1,
  });
}

function shardRect(list, rect, cx, cy, splits = 2) {
  if (!rect || rect.w < 8 || rect.h < 8) return;
  const cols = splits;
  const rows = splits;
  const cw = rect.w / cols;
  const ch = rect.h / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      pushShard(
        list,
        rect.x + col * cw,
        rect.y + row * ch,
        cw,
        ch,
        cx,
        cy
      );
    }
  }
}

export class CockpitDeathBurst {
  /**
   * @param {import('./Renderer.js').Renderer} renderer
   * @param {object|null} layout CockpitFrame layout
   * @param {import('../entities/Particle.js').ParticleSystem} particles
   */
  constructor(renderer, layout, particles) {
    this.t = 0;
    this.done = false;
    this.debris = [];
    const cx = renderer.centerX;
    const cy = renderer.centerY;
    this.cx = cx;
    this.cy = cy;

    if (layout) {
      for (const panel of layout.panels || []) {
        shardRect(this.debris, panel.screen || panel, cx, cy, 2);
      }
      for (const corner of layout.corners || []) {
        shardRect(this.debris, corner.screen || corner, cx, cy, 2);
      }
      const hud = layout.hud;
      if (hud) {
        const band = Math.max(10, layout.screenInset || 12);
        pushShard(this.debris, hud.x, hud.y, hud.w, band, cx, cy);
        pushShard(this.debris, hud.x, hud.y + hud.h - band, hud.w, band, cx, cy);
        pushShard(this.debris, hud.x, hud.y, band, hud.h, cx, cy);
        pushShard(this.debris, hud.x + hud.w - band, hud.y, band, hud.h, cx, cy);
      }
      const inner = layout.radarOuterR ?? renderer.viewportRadius;
      const outer = layout.circleR ?? renderer.poiOuterRadius;
      const segments = 14;
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const mid = (a0 + a1) * 0.5;
        const rw = (outer - inner) * 0.85;
        const rh = ((outer * 2 * Math.PI) / segments) * 0.55;
        const px = cx + Math.cos(mid) * (inner + (outer - inner) * 0.5) - rw * 0.5;
        const py = cy + Math.sin(mid) * (inner + (outer - inner) * 0.5) - rh * 0.5;
        pushShard(this.debris, px, py, rw, rh, cx, cy);
      }
    }

    particles.emitBurst(cx, cy, 48, 360, 0.65, 'rgba(255, 150, 70, 0.95)', 6, 0.55);
    particles.emitBurst(cx, cy, 24, 220, 0.45, 'rgba(255, 220, 140, 0.85)', 4, 0.4);
    particles.emitBurst(cx, cy, 18, 160, 0.35, 'rgba(255, 80, 30, 0.75)', 5, 0.35);
  }

  update(deltaTime) {
    if (this.done) return;
    this.t += deltaTime;
    const drag = 1 - Math.min(1, deltaTime * 1.4);
    for (const d of this.debris) {
      d.x += d.vx * deltaTime;
      d.y += d.vy * deltaTime;
      d.vx *= drag;
      d.vy *= drag;
      d.rot += d.spin * deltaTime;
      d.life = Math.max(0, 1 - this.t / DURATION);
    }
    if (this.t >= DURATION) this.done = true;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    const fade = Math.min(1, this.t / (DURATION * 0.55));
    const flash =
      this.t < FLASH_PEAK
        ? this.t / FLASH_PEAK
        : Math.max(0, 1 - (this.t - FLASH_PEAK) / 0.35);

    if (flash > 0.01) {
      const g = ctx.createRadialGradient(
        this.cx,
        this.cy,
        0,
        this.cx,
        this.cy,
        Math.max(this.cx, this.cy) * 1.1
      );
      g.addColorStop(0, `rgba(255, 240, 200, ${0.55 * flash})`);
      g.addColorStop(0.25, `rgba(255, 130, 50, ${0.42 * flash})`);
      g.addColorStop(0.65, `rgba(180, 40, 10, ${0.18 * flash})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      ctx.save();
      ctx.translate(d.x + d.w * 0.5, d.y + d.h * 0.5);
      ctx.rotate(d.rot);
      ctx.globalAlpha = d.life * fade;
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.w * 0.5, -d.h * 0.5, d.w, d.h);
      if (d.glow) {
        ctx.shadowColor = 'rgba(255, 140, 50, 0.9)';
        ctx.shadowBlur = 12;
        ctx.fillRect(-d.w * 0.5, -d.h * 0.5, d.w, d.h);
      }
      ctx.restore();
    }
    ctx.restore();

    const smoke = Math.min(1, Math.max(0, (this.t - 0.08) / 0.5)) * (1 - this.t / DURATION);
    if (smoke > 0.02) {
      ctx.fillStyle = `rgba(20, 8, 4, ${0.35 * smoke})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }
}
