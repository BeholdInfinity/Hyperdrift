export class Particle {
  constructor(
    x,
    y,
    vx,
    vy,
    life,
    color,
    size,
    type = 'default',
    space = 'world',
    underStation = false,
    attachId = null
  ) {
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
    /** Draw under Jennings hangar roof / caution tape (set at emit) */
    this.underStation = !!underStation;
    /**
     * When space === 'ship': which hull to attach to.
     * null = primary/controlled ship passed to renderParticles;
     * string id = look up in opts.hulls (ambient / hangar visitors).
     */
    this.attachId = attachId ?? null;
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

  emit(
    x,
    y,
    vx,
    vy,
    life,
    color,
    size,
    type = 'default',
    space = 'world',
    underStation = false,
    attachId = null
  ) {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    this.particles.push(
      new Particle(
        x,
        y,
        vx,
        vy,
        life,
        color,
        size,
        type,
        space,
        underStation,
        attachId
      )
    );
  }

  emitBurst(x, y, count, speed, life, color, size, spread = Math.PI * 2) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * spread + (Math.random() - 0.5) * 0.3;
      const spd = speed * (0.5 + Math.random() * 0.5);
      this.emit(
        x,
        y,
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
   * @param {object} [options]
   * @param {string|null} [options.attachId] — multi-hull id; null = primary ship
   * @param {boolean} [options.underStation]
   */
  emitExhaustLocal(
    localX,
    localY,
    exhaustAngle,
    intensity,
    color,
    spread = 0.4,
    options = {}
  ) {
    const speedScale = options.speedScale ?? 1;
    const lifeScale = options.lifeScale ?? 1;
    const leanAngle = options.leanAngle ?? 0;
    const underStation = !!options.underStation;
    const attachId = options.attachId ?? null;
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
        'ship',
        underStation,
        attachId
      );
    }
  }

  /**
   * Legacy world-baked exhaust (prefer emitExhaustLocal + attachId).
   */
  emitExhaustWorld(
    ship,
    localX,
    localY,
    exhaustAngle,
    intensity,
    color,
    spread = 0.4,
    options = {}
  ) {
    const speedScale = options.speedScale ?? 1;
    const lifeScale = options.lifeScale ?? 1;
    const leanAngle = options.leanAngle ?? 0;
    const underStation = !!options.underStation;
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    const sx = ship.position.x;
    const sy = ship.position.y;
    const count = Math.ceil(intensity * 3);
    for (let i = 0; i < count; i++) {
      const localAngle = exhaustAngle + leanAngle + (Math.random() - 0.5) * spread;
      const spd = (75 + Math.random() * 105 * intensity) * speedScale;
      const lx = localX + (Math.random() - 0.5) * 3;
      const ly = localY + (Math.random() - 0.5) * 3;
      const worldAngle = ship.angle + localAngle;
      this.emit(
        sx + lx * cos - ly * sin,
        sy + lx * sin + ly * cos,
        Math.cos(worldAngle) * spd,
        Math.sin(worldAngle) * spd,
        (0.15 + Math.random() * 0.18) * lifeScale,
        color,
        2.25 + intensity * 3.3,
        'exhaust',
        'world',
        underStation
      );
    }
  }

  /**
   * Drop ship-local particles.
   * @param {string|null} [attachId=null] — null = primary hull only;
   *   string = that attachId; '*' = every ship-local particle.
   */
  clearShipSpace(attachId = null) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.space !== 'ship') continue;
      if (attachId === '*') {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.attachId !== attachId) continue;
      this.particles.splice(i, 1);
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

  clear() {
    this.particles.length = 0;
  }
}
