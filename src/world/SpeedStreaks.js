export class SpeedStreaks {
  constructor() {
    this.streaks = [];
    this.maxStreaks = 140;
  }

  /**
   * Screen-space streaks (not scaled by camera zoom) so they fill the
   * circular viewport and stay visible at any zoom level.
   */
  update(shipVelocity, shipSpeed, maxSpeed, deltaTime, viewportRadius) {
    const speedRatio = shipSpeed / maxSpeed;

    if (speedRatio < 0.05 || shipSpeed < 10) {
      this.streaks = [];
      return;
    }

    const velAngle = Math.atan2(shipVelocity.y, shipVelocity.x);
    const streakAngle = velAngle + Math.PI;
    // Screen px/sec — scales with perceived speed, not world units under zoom
    const streakSpeed = (140 + speedRatio * 420) * (0.85 + Math.random() * 0.3);

    const spawnRate = speedRatio * 70;
    if (Math.random() < spawnRate * deltaTime && this.streaks.length < this.maxStreaks) {
      const spawnDist = viewportRadius * (0.08 + Math.random() * 0.92);
      const spawnAngle = Math.random() * Math.PI * 2;

      this.streaks.push({
        x: Math.cos(spawnAngle) * spawnDist,
        y: Math.sin(spawnAngle) * spawnDist,
        vx: Math.cos(streakAngle) * streakSpeed,
        vy: Math.sin(streakAngle) * streakSpeed,
        length: (10 + speedRatio * 36) * (0.65 + Math.random() * 0.45),
        width: 0.9 + speedRatio * 1.1,
        life: 0.35 + Math.random() * 0.4,
        maxLife: 0.55,
        angle: streakAngle,
        alpha: 0.12 + speedRatio * 0.28,
      });
    }

    const cullRadius = viewportRadius * 1.12;
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.x += s.vx * deltaTime;
      s.y += s.vy * deltaTime;
      s.life -= deltaTime;
      if (s.life <= 0 || Math.hypot(s.x, s.y) > cullRadius) {
        this.streaks.splice(i, 1);
      }
    }
  }

  render(ctx) {
    for (const streak of this.streaks) {
      const lifeRatio = streak.life / streak.maxLife;
      const alpha = streak.alpha * lifeRatio;
      const length = streak.length;

      ctx.save();
      ctx.translate(streak.x, streak.y);
      ctx.rotate(streak.angle);
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';

      const gradient = ctx.createLinearGradient(-length * 0.1, 0, length, 0);
      gradient.addColorStop(0, 'rgba(120, 170, 220, 0)');
      gradient.addColorStop(0.25, `rgba(160, 200, 240, ${alpha * 0.45})`);
      gradient.addColorStop(0.65, `rgba(200, 230, 255, ${alpha * 0.75})`);
      gradient.addColorStop(1, `rgba(240, 250, 255, ${alpha})`);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = streak.width;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
