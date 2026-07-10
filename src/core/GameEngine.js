import { Ship } from '../entities/Ship.js';
import { ShipController } from '../entities/ShipController.js';
import { EntityManager } from '../entities/EntityManager.js';
import { ParticleSystem } from '../entities/Particle.js';
import { InputSystem } from '../systems/InputSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { Renderer } from '../systems/Renderer.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { AsteroidSystem } from '../systems/AsteroidSystem.js';
import { Starfield } from '../world/Starfield.js';
import { NebulaField } from '../world/NebulaField.js';
import { SpeedStreaks } from '../world/SpeedStreaks.js';
import { Vec2 } from '../utils/MathUtils.js';
import { PHYSICS } from '../core/Constants.js';

/** Slow title-screen drift (world units / sec) */
const TITLE_DRIFT_SPEED = 52;
/** How quickly the drift heading turns (rad / sec) */
const TITLE_TURN_RATE = 0.12;

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.paused = false;
    this.mode = 'title'; // 'title' | 'playing'
    this.lastTime = 0;

    this.renderer = new Renderer(canvas);
    this.input = new InputSystem(canvas);
    this.camera = new CameraSystem();
    this.entityManager = new EntityManager();
    this.particleSystem = new ParticleSystem();
    this.shipController = new ShipController();
    this.weaponSystem = new WeaponSystem(this.entityManager, this.particleSystem);
    this.asteroidSystem = new AsteroidSystem(this.entityManager);
    this.starfield = new Starfield();
    this.nebulaField = new NebulaField();
    this.speedStreaks = new SpeedStreaks();

    this.ship = null;
    this.gameTime = 0;
    this._titleHeading = Math.random() * Math.PI * 2;
    this._titleFade = 0;
    this._titleHasDrawn = false;
    this._startScreen = document.getElementById('start-screen');
    this._buildStamp = document.getElementById('build-stamp');

    this._hudSpeed = document.getElementById('speed-value');
    this._hudCoords = document.getElementById('coords-value');
    this._hudZoom = document.getElementById('zoom-value');
    this._pauseMenu = document.getElementById('pause-menu');
    this._fullscreenBtn = document.getElementById('fullscreen-btn');
    this._pauseFullscreenBtn = document.getElementById('pause-fullscreen-btn');

    this.input.onFullscreenChange = (isFs) => this._updateFullscreenButtons(isFs);
    this._updateFullscreenButtons(!!document.fullscreenElement);

    window.addEventListener('resize', () => this.renderer.resize());
    this.renderer.resize();
    this._setTitleFade(0);
  }

  _setTitleFade(opacity) {
    this._titleFade = opacity;
    this.canvas.style.opacity = String(opacity);
    if (this._startScreen) this._startScreen.style.opacity = String(opacity);
    if (this._buildStamp) this._buildStamp.style.opacity = String(opacity);
  }

  /** Begin the title-screen loop (fullscreen starfield + nebula drift). */
  startTitle() {
    this.mode = 'title';
    this.running = true;
    this.paused = false;
    this._titleHasDrawn = false;
    this._setTitleFade(0);
    this.lastTime = performance.now();
    this.camera.position.set(0, 0);
    this.camera.offset.set(0, 0);
    this.camera.effectiveZoom = 1;
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    this.camera.speedZoom = 1;
    this.asteroidSystem.update(0, 0);
    requestAnimationFrame((t) => this._loop(t));
  }

  /** Transition from title into playable flight. */
  beginPlay() {
    const x = this.camera.position.x;
    const y = this.camera.position.y;
    this.ship = new Ship(x, y);
    this.entityManager.add(this.ship, 'ship');
    this.mode = 'playing';
    this.paused = false;
    this._setTitleFade(1);
    this.canvas.style.opacity = '1';
    this.input.enable();
    this.input.paused = false;
    this.asteroidSystem.update(x, y);
  }

  stop() {
    this.running = false;
  }

  togglePause() {
    if (this.mode !== 'playing') return;
    this.paused = !this.paused;
    this.input.paused = this.paused;
    if (this._pauseMenu) {
      this._pauseMenu.classList.toggle('hidden', !this.paused);
    }
    if (this.paused) {
      this.input.mouseDown = false;
    }
    this._updateFullscreenButtons(!!document.fullscreenElement);
  }

  async toggleFullscreen() {
    await this.input.toggleFullscreen();
    this._updateFullscreenButtons(!!document.fullscreenElement);
  }

  _updateFullscreenButtons(isFullscreen) {
    const label = isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen';
    if (this._fullscreenBtn) this._fullscreenBtn.textContent = label;
    if (this._pauseFullscreenBtn) this._pauseFullscreenBtn.textContent = label;
  }

  _loop(timestamp) {
    if (!this.running) return;

    const deltaTime = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (this.mode === 'playing' && this.input.consumePauseToggle()) {
      this.togglePause();
    }

    if (!this.paused) {
      this.gameTime += deltaTime;
      if (this.mode === 'title') {
        this._updateTitle(deltaTime);
      } else {
        this.update(deltaTime);
      }
    } else if (this.ship) {
      this._updateHUD();
    }

    this.render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _updateTitle(deltaTime) {
    this._titleHeading += TITLE_TURN_RATE * deltaTime;
    this.camera.position.x += Math.cos(this._titleHeading) * TITLE_DRIFT_SPEED * deltaTime;
    this.camera.position.y += Math.sin(this._titleHeading) * TITLE_DRIFT_SPEED * deltaTime;
    this.camera.offset.set(0, 0);
    this.camera.effectiveZoom = 1;

    this.asteroidSystem.update(this.camera.position.x, this.camera.position.y);

    if (this._titleHasDrawn && this._titleFade < 1) {
      this._setTitleFade(Math.min(1, this._titleFade + deltaTime / 0.7));
    }
  }

  /** Screen-corner cover radius so stars/nebulae fill the full window (not just the play circle). */
  _coverRadius() {
    return Math.hypot(this.renderer.centerX, this.renderer.centerY) + 40;
  }

  update(deltaTime) {
    if (!this.ship) return;

    const shipPos = new Vec2(this.ship.position.x, this.ship.position.y);
    const shipVel = new Vec2(this.ship.velocity.x, this.ship.velocity.y);
    const zoomWheel = this.input.consumeZoomDelta();

    this.asteroidSystem.update(shipPos.x, shipPos.y);

    const aimWorld = this.camera.screenToWorld(
      this.input.mouseScreen.x,
      this.input.mouseScreen.y,
      this.renderer.centerX,
      this.renderer.centerY
    );
    const targetAngle = Math.atan2(aimWorld.y - shipPos.y, aimWorld.x - shipPos.x);

    this.shipController.update(this.ship, this.input, targetAngle, deltaTime);
    this.ship.update(deltaTime);

    this.weaponSystem.update(this.ship, this.input, deltaTime);
    this.weaponSystem.checkCollisions(this.asteroidSystem.getActiveAsteroids());

    this.entityManager.update(deltaTime);
    this.particleSystem.update(deltaTime);

    this.camera.update(
      shipPos,
      shipVel,
      deltaTime,
      this.renderer.viewportRadius,
      zoomWheel
    );

    const speed = shipVel.length();
    this.speedStreaks.update(
      { x: this.ship.velocity.x, y: this.ship.velocity.y },
      speed,
      PHYSICS.MAX_SPEED,
      deltaTime,
      this.renderer.viewportRadius
    );

    this.renderer.emitThrusterParticles(this.ship, this.particleSystem);
    this._updateHUD();
  }

  _renderBackground({ fullscreen = false, includeWorldNebulae = true } = {}) {
    const cameraPos = this.camera.position;
    const time = this.gameTime;
    const zoom = this.camera.effectiveZoom;
    // Extra margin so edge glows / star tiles exist before they enter the clip
    const coverRadius = fullscreen
      ? this._coverRadius()
      : this.renderer.viewportRadius + 200;

    this.renderer.ctx.save();
    this.renderer.ctx.translate(
      this.renderer.centerX + this.camera.offset.x,
      this.renderer.centerY + this.camera.offset.y
    );

    this.nebulaField.renderProcedural(
      this.renderer.ctx,
      cameraPos.x,
      cameraPos.y,
      time,
      coverRadius,
      zoom
    );

    this.starfield.render(
      this.renderer.ctx,
      cameraPos.x,
      cameraPos.y,
      coverRadius,
      time,
      zoom
    );

    this.renderer.ctx.restore();

    if (includeWorldNebulae) {
      this.renderer.renderWorldLayer((ctx) => {
        this.nebulaField.renderWorldNebulae(ctx, this.asteroidSystem.getNebulae(), time);
      }, this.camera);
    }
  }

  render() {
    this.renderer.beginFrame();

    if (this.mode === 'title') {
      this._renderBackground({ fullscreen: true, includeWorldNebulae: true });
      this._titleHasDrawn = true;
      return;
    }

    this.renderer.setupCircularClip();
    this._renderBackground({ fullscreen: false, includeWorldNebulae: true });

    this.renderer.ctx.save();
    this.renderer.ctx.translate(
      this.renderer.centerX + this.camera.offset.x,
      this.renderer.centerY + this.camera.offset.y
    );
    this.speedStreaks.render(this.renderer.ctx);
    this.renderer.ctx.restore();

    this.renderer.renderAsteroids(
      this.asteroidSystem.getActiveAsteroids(),
      this.camera
    );

    this.renderer.renderProjectiles(
      [...this.entityManager.getByType('projectile')],
      this.camera
    );

    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera
    );

    if (this.ship) {
      this.renderer.renderShip(this.ship, this.camera);
    }

    this.renderer.endCircularClip();
  }

  _updateHUD() {
    if (!this._hudSpeed || !this.ship) return;
    const speed = Math.round(
      Math.hypot(this.ship.velocity.x, this.ship.velocity.y)
    );
    this._hudSpeed.textContent = speed;
    this._hudCoords.textContent = `${Math.round(this.ship.position.x)}, ${Math.round(this.ship.position.y)}`;
    if (this._hudZoom) {
      this._hudZoom.textContent = this.camera.effectiveZoom.toFixed(2);
    }
  }
}
