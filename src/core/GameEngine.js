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
import { HangarBay } from '../world/HangarBay.js';
import { PHYSICS, HANGAR } from '../core/Constants.js';

/** Slow title-screen drift (world units / sec) */
const TITLE_DRIFT_SPEED = 52;
/** How quickly the drift heading turns (rad / sec) */
const TITLE_TURN_RATE = 0.12;

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.paused = false;
    this.mode = 'title'; // 'title' | 'playing' | 'hangar'
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
    this.hangarBay = new HangarBay();

    this.ship = null;
    this.precisionActive = false;
    this.gameTime = 0;
    this._titleHeading = Math.random() * Math.PI * 2;
    this._titleFade = 0;
    this._titleHasDrawn = false;
    this._dockPos = { x: 0, y: 0 };
    /** Continues title-screen space drift; shown through hangar bay doors */
    this._spaceCam = { x: 0, y: 0 };
    this._startScreen = document.getElementById('start-screen');
    this._buildStamp = document.getElementById('build-stamp');
    this._hangarHud = document.getElementById('hangar-hud');
    this._overlay = document.getElementById('overlay');

    this._hudSpeed = document.getElementById('speed-value');
    this._hudCoords = document.getElementById('coords-value');
    this._hudZoom = document.getElementById('zoom-value');
    this._hudPrecision = document.getElementById('precision-value');
    this._hudHangarZoom = document.getElementById('hangar-zoom-value');
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
    this.precisionActive = false;
    this.entityManager.add(this.ship, 'ship');
    this.mode = 'playing';
    this.paused = false;
    this._setTitleFade(1);
    this.canvas.style.opacity = '1';
    this.input.enable();
    this.input.paused = false;
    this.asteroidSystem.update(x, y);
  }

  /** Temporary docked ship inspection bay (from title). */
  beginHangar() {
    // Keep the live title-space chunk drifting behind bay doors
    this._spaceCam.x = this.camera.position.x;
    this._spaceCam.y = this.camera.position.y;

    this.entityManager.clear();
    this.particleSystem.clear();
    this._dockPos.x = HANGAR.PLAYER_PAD_X;
    this._dockPos.y = 0;
    this.ship = new Ship(this._dockPos.x, this._dockPos.y);
    this.precisionActive = false;
    this.entityManager.add(this.ship, 'ship');
    this.hangarBay.reset();

    this.camera.position.set(this._dockPos.x, this._dockPos.y);
    this.camera.offset.set(0, 0);
    this.camera.userZoom = HANGAR.ZOOM_DEFAULT;
    this.camera.targetUserZoom = HANGAR.ZOOM_DEFAULT;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = HANGAR.ZOOM_DEFAULT;

    this.mode = 'hangar';
    this.paused = false;
    this._setTitleFade(1);
    this.canvas.style.opacity = '1';
    this.input.enable();
    this.input.paused = false;

    if (this._hangarHud) this._hangarHud.classList.remove('hidden');
    if (this._buildStamp) this._buildStamp.classList.add('hidden');
  }

  /** Leave hangar and restore the title screen loop. */
  exitHangar() {
    if (this.mode !== 'hangar') return;
    this.input.disable();
    this.entityManager.clear();
    this.particleSystem.clear();
    this.ship = null;
    this.precisionActive = false;
    this.mode = 'title';
    this.paused = false;
    this._titleHasDrawn = true;
    this._setTitleFade(1);
    // Resume title drift from the same space chunk shown through the doors
    this.camera.position.set(this._spaceCam.x, this._spaceCam.y);
    this.camera.offset.set(0, 0);
    this.camera.effectiveZoom = 1;
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    this.camera.speedZoom = 1;
    this.asteroidSystem.update(this._spaceCam.x, this._spaceCam.y);

    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    if (this._buildStamp) this._buildStamp.classList.remove('hidden');
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
      this.input.mouseRightDown = false;
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
    } else if (this.mode === 'hangar' && this.input.consumePauseToggle()) {
      this.exitHangar();
      // Caller (main.js) restores title UI via onHangarExit if set
      if (typeof this.onHangarExit === 'function') this.onHangarExit();
    }

    if (!this.paused) {
      this.gameTime += deltaTime;
      if (this.mode === 'title') {
        this._updateTitle(deltaTime);
      } else if (this.mode === 'hangar') {
        this._updateHangar(deltaTime);
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
    this._spaceCam.x = this.camera.position.x;
    this._spaceCam.y = this.camera.position.y;

    this.asteroidSystem.update(this.camera.position.x, this.camera.position.y);

    if (this._titleHasDrawn && this._titleFade < 1) {
      this._setTitleFade(Math.min(1, this._titleFade + deltaTime / 0.7));
    }
  }

  /** Screen-corner cover radius so stars/nebulae fill the full window (not just the play circle). */
  _coverRadius() {
    return Math.hypot(this.renderer.centerX, this.renderer.centerY) + 40;
  }

  _updateHangar(deltaTime) {
    if (!this.ship) return;

    // Keep title-space chunk drifting (same systems as the title backdrop)
    this._titleHeading += TITLE_TURN_RATE * deltaTime;
    this._spaceCam.x += Math.cos(this._titleHeading) * TITLE_DRIFT_SPEED * deltaTime;
    this._spaceCam.y += Math.sin(this._titleHeading) * TITLE_DRIFT_SPEED * deltaTime;
    this.asteroidSystem.update(this._spaceCam.x, this._spaceCam.y);

    const zoomWheel = this.input.consumeZoomDelta();

    // Hangar: full thruster/engine authority (Precision off)
    this.precisionActive = false;

    const dx = this.input.mouseScreen.x - this.renderer.centerX;
    const dy = this.input.mouseScreen.y - this.renderer.centerY;
    const pointerInViewport =
      dx * dx + dy * dy <= this.renderer.viewportRadius * this.renderer.viewportRadius;

    const aimWorld = this.camera.screenToWorld(
      this.input.mouseScreen.x,
      this.input.mouseScreen.y,
      this.renderer.centerX,
      this.renderer.centerY
    );

    this.shipController.update(this.ship, this.input, false, deltaTime);

    // Anchored: thrusters/yaw light and spin for inspection, but no translation
    this.ship.position.x = this._dockPos.x;
    this.ship.position.y = this._dockPos.y;
    this.ship.velocity.set(0, 0);

    this.weaponSystem.update(
      this.ship,
      this.input,
      aimWorld,
      pointerInViewport,
      [],
      deltaTime
    );

    this.entityManager.update(deltaTime);
    this.particleSystem.update(deltaTime);

    this.hangarBay.update(deltaTime, this.ship, {
      firedTurret: this.ship.muzzleFlash > 0.02,
      laserOn: !!this.ship.miningLaserFiring,
    });

    this.camera.updateHangar(this.ship.position, deltaTime, zoomWheel);
    this.renderer.emitThrusterParticles(this.ship, this.particleSystem);

    if (this._hudHangarZoom) {
      this._hudHangarZoom.textContent = this.camera.effectiveZoom.toFixed(1);
    }
  }

  update(deltaTime) {
    if (!this.ship) return;

    const zoomWheel = this.input.consumeZoomDelta();

    this.asteroidSystem.update(this.ship.position.x, this.ship.position.y);

    const speed = this.ship.velocity.length();
    const capsDesired = this.input.capsLockDesired;
    if (!capsDesired) {
      this.precisionActive = false;
    } else if (this.precisionActive) {
      // Stay active until Caps off; speed is capped while active
    } else if (speed < PHYSICS.PRECISION_ENGAGE_SPEED) {
      this.precisionActive = true;
    }
    // else: Caps on but too fast to engage → standby (HUD only)

    const dx = this.input.mouseScreen.x - this.renderer.centerX;
    const dy = this.input.mouseScreen.y - this.renderer.centerY;
    const pointerInViewport =
      dx * dx + dy * dy <= this.renderer.viewportRadius * this.renderer.viewportRadius;

    const aimWorld = this.camera.screenToWorld(
      this.input.mouseScreen.x,
      this.input.mouseScreen.y,
      this.renderer.centerX,
      this.renderer.centerY
    );

    this.shipController.update(this.ship, this.input, this.precisionActive, deltaTime);
    this.ship.update(deltaTime);

    const asteroids = this.asteroidSystem.getActiveAsteroids();
    this.weaponSystem.update(
      this.ship,
      this.input,
      aimWorld,
      pointerInViewport,
      asteroids,
      deltaTime
    );
    this.weaponSystem.checkCollisions(asteroids);

    this.entityManager.update(deltaTime);
    this.particleSystem.update(deltaTime);

    // Camera must track post-physics ship pose; a stale position makes
    // ship-local exhaust appear ahead of the hull under camera lead.
    this.camera.update(
      this.ship.position,
      this.ship.velocity,
      deltaTime,
      this.renderer.viewportRadius,
      zoomWheel
    );

    const speedAfter = this.ship.velocity.length();
    this.speedStreaks.update(
      { x: this.ship.velocity.x, y: this.ship.velocity.y },
      speedAfter,
      PHYSICS.MAX_SPEED,
      deltaTime,
      this.renderer.viewportRadius
    );

    this.renderer.emitThrusterParticles(this.ship, this.particleSystem);
    this._updateHUD(capsDesired);
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

    if (this.mode === 'hangar') {
      this._renderHangar();
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
      this.camera,
      this.ship
    );

    if (this.ship) {
      this.renderer.renderShip(this.ship, this.camera);
    }

    this.renderer.endCircularClip();
  }

  _renderHangar() {
    this.renderer.setupCircularClip();

    // Same live space chunk as the title screen — visible through bay-door seams
    this._renderSpaceThroughDoors();

    this.renderer.renderWorldLayer((worldCtx) => {
      this.hangarBay.render(worldCtx, {
        starfield: this.starfield,
        nebulaField: this.nebulaField,
        spaceX: this._spaceCam.x,
        spaceY: this._spaceCam.y,
        time: this.gameTime,
        nebulae: this.asteroidSystem.getNebulae(),
      });
    }, this.camera);

    this.renderer.renderProjectiles(
      [...this.entityManager.getByType('projectile')],
      this.camera
    );

    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      this.ship
    );

    if (this.ship) {
      this.renderer.renderShip(this.ship, this.camera);
    }

    this.renderer.endCircularClip();
  }

  /** Title-identical starfield + nebulae at the drifting space camera (not hangar zoom). */
  _renderSpaceThroughDoors() {
    const ctx = this.renderer.ctx;
    const time = this.gameTime;
    const coverRadius = this.renderer.viewportRadius + 200;
    const sx = this._spaceCam.x;
    const sy = this._spaceCam.y;

    ctx.save();
    ctx.translate(this.renderer.centerX, this.renderer.centerY);

    this.nebulaField.renderProcedural(ctx, sx, sy, time, coverRadius, 1);
    this.starfield.render(ctx, sx, sy, coverRadius, time, 1);

    ctx.restore();

    // World nebulae in space-camera frame (zoom 1, no hangar offset)
    ctx.save();
    ctx.translate(this.renderer.centerX, this.renderer.centerY);
    ctx.translate(-sx, -sy);
    this.nebulaField.renderWorldNebulae(ctx, this.asteroidSystem.getNebulae(), time);
    ctx.restore();
  }

  _updateHUD(capsDesired = this.input?.capsLockDesired) {
    if (!this._hudSpeed || !this.ship) return;
    const speed = Math.round(
      Math.hypot(this.ship.velocity.x, this.ship.velocity.y)
    );
    this._hudSpeed.textContent = speed;
    this._hudCoords.textContent = `${Math.round(this.ship.position.x)}, ${Math.round(this.ship.position.y)}`;
    if (this._hudZoom) {
      this._hudZoom.textContent = this.camera.effectiveZoom.toFixed(2);
    }
    if (this._hudPrecision) {
      if (this.precisionActive) {
        this._hudPrecision.textContent = 'PRECISION';
        this._hudPrecision.className = 'precision-active';
      } else if (capsDesired) {
        this._hudPrecision.textContent = 'PRECISION STANDBY';
        this._hudPrecision.className = 'precision-standby';
      } else {
        this._hudPrecision.textContent = '';
        this._hudPrecision.className = '';
      }
    }
  }
}
