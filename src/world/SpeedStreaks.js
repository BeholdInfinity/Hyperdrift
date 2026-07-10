export class SpeedStreaks {
  constructor() {
    this.streaks = [];
    this.maxStreaks = 120;
  }

  update(shipVelocity, shipSpeed, maxSpeed, deltaTime, viewportRadius) {
    const speedRatio = shipSpeed / maxSpeed;

    if (speedRatio < 0.05 || shipSpeed < 10) {
      this.streaks = [];
      return;
    }

    const velAngle = Math.atan2(shipVelocity.y, shipVelocity.x);
    const streakAngle = velAngle + Math.PI;
    const streakSpeed = shipSpeed * 1.2;

    const spawnRate = speedRatio * 60;
    if (Math.random() < spawnRate * deltaTime && this.streaks.length < this.maxStreaks) {
      const spawnDist = viewportRadius * (0.6 + Math.random() * 0.5);
      const perpAngle = velAngle + Math.PI / 2;
      const lateral = (Math.random() - 0.5) * viewportRadius * 1.2;

      this.streaks.push({
        x: Math.cos(perpAngle) * lateral + Math.cos(velAngle) * spawnDist * 0.3,
        y: Math.sin(perpAngle) * lateral + Math.sin(velAngle) * spawnDist * 0.3,
        vx: Math.cos(streakAngle) * streakSpeed,
        vy: Math.sin(streakAngle) * streakSpeed,
        length: (40 + speedRatio * 180) * (0.7 + Math.random() * 0.3),
        width: 1 + speedRatio * 3,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.6,
        angle: streakAngle,
        alpha: 0.25 + speedRatio * 0.65,
      });
    }

    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.x += s.vx * deltaTime;
      s.y += s.vy * deltaTime;
      s.life -= deltaTime;
      if (s.life <= 0) {
        this.streaks.splice(i, 1);
      }
    }
  }

  render(ctx, zoom = 1) {
    for (const streak of this.streaks) {
      const lifeRatio = streak.life / streak.maxLife;
      const alpha = streak.alpha * lifeRatio;
      const length = streak.length * zoom;

      ctx.save();
      ctx.translate(streak.x * zoom, streak.y * zoom);
      ctx.rotate(streak.angle);
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';

      const gradient = ctx.createLinearGradient(-length * 0.1, 0, length, 0);
      gradient.addColorStop(0, 'rgba(120, 170, 220, 0)');
      gradient.addColorStop(0.2, `rgba(160, 200, 240, ${alpha * 0.5})`);
      gradient.addColorStop(0.6, `rgba(200, 230, 255, ${alpha * 0.85})`);
      gradient.addColorStop(1, `rgba(240, 250, 255, ${alpha})`);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = streak.width * zoom;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
