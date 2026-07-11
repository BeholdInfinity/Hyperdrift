export class Particle {
  constructor(x, y, vx, vy, life, color, size, type = 'default', space = 'world') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
    this.type = type;
    /** 'world' = map space; 'ship' = ship-local (moves/rotates with the hull) */
    this.space = space;
    this.active = true;
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.life -= deltaTime;
    if (this.life <= 0) this.active = false;

    if (this.type === 'exhaust') {
      this.vx *= 0.92;
      this.vy *= 0.92;
    }
  }
}

export class ParticleSystem {
  constructor(maxParticles = 2000) {
    this.particles = [];
    this.maxParticles = maxParticles;
  }

  emit(x, y, vx, vy, life, color, size, type = 'default', space = 'world') {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    this.particles.push(new Particle(x, y, vx, vy, life, color, size, type, space));
  }

  emitBurst(x, y, count, speed, life, color, size, spread = Math.PI * 2) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * spread + (Math.random() - 0.5) * 0.3;
      const spd = speed * (0.5 + Math.random() * 0.5);
      this.emit(
        x, y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        life * (0.5 + Math.random() * 0.5),
        color,
        size * (0.5 + Math.random()),
        'burst',
        'world'
      );
    }
  }

  /**
   * Exhaust in ship-local space so plumes stay glued to nozzles
   * (no world-space tentacle trails when translating/rotating).
   */
  emitExhaustLocal(localX, localY, exhaustAngle, intensity, color, spread = 0.4, options = {}) {
    const speedScale = options.speedScale ?? 1;
    const lifeScale = options.lifeScale ?? 1;
    const leanAngle = options.leanAngle ?? 0;
    const count = Math.ceil(intensity * 3);
    for (let i = 0; i < count; i++) {
      const angle = exhaustAngle + leanAngle + (Math.random() - 0.5) * spread;
      const spd = (75 + Math.random() * 105 * intensity) * speedScale;
      this.emit(
        localX + (Math.random() - 0.5) * 3,
        localY + (Math.random() - 0.5) * 3,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        (0.15 + Math.random() * 0.18) * lifeScale,
        color,
        2.25 + intensity * 3.3,
        'exhaust',
        'ship'
      );
    }
  }

  update(deltaTime) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(deltaTime);
      if (!this.particles[i].active) {
        this.particles.splice(i, 1);
      }
    }
  }
}
