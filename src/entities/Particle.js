export class Particle {
  constructor(x, y, vx, vy, life, color, size, type = 'default') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
    this.type = type;
    this.active = true;
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.life -= deltaTime;
    if (this.life <= 0) this.active = false;

    if (this.type === 'exhaust') {
      this.vx *= 0.98;
      this.vy *= 0.98;
    }
  }
}

export class ParticleSystem {
  constructor(maxParticles = 2000) {
    this.particles = [];
    this.maxParticles = maxParticles;
  }

  emit(x, y, vx, vy, life, color, size, type = 'default') {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    this.particles.push(new Particle(x, y, vx, vy, life, color, size, type));
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
        'burst'
      );
    }
  }

  emitExhaust(x, y, dirX, dirY, intensity, color, spread = 0.4) {
    const count = Math.ceil(intensity * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const spd = 80 + Math.random() * 120 * intensity;
      this.emit(
        x + (Math.random() - 0.5) * 4,
        y + (Math.random() - 0.5) * 4,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        0.15 + Math.random() * 0.2,
        color,
        2 + intensity * 3,
        'exhaust'
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
