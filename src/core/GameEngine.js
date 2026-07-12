import { Ship } from '../entities/Ship.js';
import { ShipController } from '../entities/ShipController.js';
import { EntityManager } from '../entities/EntityManager.js';
import { ParticleSystem } from '../entities/Particle.js';
import { InputSystem } from '../systems/InputSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { Renderer } from '../systems/Renderer.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { AsteroidSystem } from '../systems/AsteroidSystem.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';
import { Starfield } from '../world/Starfield.js';
import { NebulaField } from '../world/NebulaField.js';
import { SpeedStreaks } from '../world/SpeedStreaks.js';
import { HangarBay } from '../world/HangarBay.js';
import { Station } from '../world/Station.js';
import { PHYSICS, HANGAR, SHIP } from '../core/Constants.js';
import { Vec2, angleDifference } from '../utils/MathUtils.js';

/** Slow title-screen drift (world units / sec) */
const TITLE_DRIFT_SPEED = 52;
/** How quickly the drift heading turns (rad / sec) */
const TITLE_TURN_RATE = 0.12;

const PLAYER_BAY = 1; // B2

const MANEUVER_THRUSTER_KEYS = [
  'aftPort',
  'aftStarboard',
  'nosePort',
  'noseStarboard',
  'portFore',
  'portAft',
  'starboardFore',
  'starboardAft',
];

/** Match ShipController yaw couples for scripted align. */
const YAW_CCW = ['nosePort', 'portAft', 'aftStarboard', 'starboardFore'];
const YAW_CW = ['noseStarboard', 'starboardAft', 'aftPort', 'portFore'];

const FACE_SOUTH = Math.PI / 2;

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.paused = false;
    /** @type {'title'|'playing'|'hangar'|'controls'} */
    this.mode = 'title';
    this.lastTime = 0;

    this.renderer = new Renderer(canvas);
    this.input = new InputSystem(canvas);
    this.camera = new CameraSystem();
    this.entityManager = new EntityManager();
    this.particleSystem = new ParticleSystem();
    this.shipController = new ShipController();
    this.physics = new PhysicsSystem();
    this.weaponSystem = new WeaponSystem(this.entityManager, this.particleSystem);
    this.asteroidSystem = new AsteroidSystem(this.entityManager);
    this.starfield = new Starfield();
    this.nebulaField = new NebulaField();
    this.speedStreaks = new SpeedStreaks();
    this.hangarBay = new HangarBay();
    this.station = new Station();

    this.ship = null;
    this._sandboxShip = null;
    this.precisionActive = false;
    this.gameTime = 0;
    this._titleHeading = Math.random() * Math.PI * 2;
    this._titleFade = 0;
    this._titleHasDrawn = false;
    this._dockPos = { x: 0, y: 0 };
    /** Continues title-screen space drift; shown through hangar bay doors */
    this._spaceCam = { x: 0, y: 0 };
    /** @type {null|{kind:'launch'|'land', phase:string, t:number}} */
    this._hangarSeq = null;
    /** 0 = settled on pad, 1 = hovering (launch lift / land approach) */
    this._hangarHover = 0;
    this._dockLocked = true;
    this._controlsReturn = 'title';
    this._dockPrompt = false;
    this._dockKeyHeld = false;

    this._startScreen = document.getElementById('start-screen');
    this._buildStamp = document.getElementById('build-stamp');
    this._hangarHud = document.getElementById('hangar-hud');
    this._overlay = document.getElementById('overlay');
    this._controlsHud = document.getElementById('controls-hud');
    this._dockHud = document.getElementById('dock-hud');
    this._hangarLaunchBtn = document.getElementById('hangar-launch-btn');

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
    this._hangarSeq = null;
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

  /** Quick-launch into playable flight near Jennings Station. */
  beginPlay() {
    this._clearPlaySession();
    const spawn = this.station.getExitSpawn();
    this.ship = new Ship(spawn.x, spawn.y);
    this.ship.angle = spawn.angle;
    this.ship.turretAngle = spawn.angle;
    this.precisionActive = false;
    this.entityManager.add(this.ship, 'ship');
    this.mode = 'playing';
    this.paused = false;
    this._hangarSeq = null;
    this._setTitleFade(1);
    this.canvas.style.opacity = '1';
    this.input.enable();
    this.input.paused = false;
    this.camera.position.set(spawn.x, spawn.y);
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = 1;
    this.asteroidSystem.update(spawn.x, spawn.y);
    this._setDockHud(false);
  }

  /** Home Base hangar (Jennings Station bay). */
  beginHangar({ landing = false, entryAngle = null, entryTurret = null } = {}) {
    this._spaceCam.x = this.camera.position.x;
    this._spaceCam.y = this.camera.position.y;

    this._clearPlaySession();
    this._dockPos.x = HANGAR.PLAYER_PAD_X;
    this._dockPos.y = 0;
    this.ship = new Ship(this._dockPos.x, this._dockPos.y);
    this.precisionActive = false;
    this.entityManager.add(this.ship, 'ship');
    this.hangarBay.reset();
    this._dockLocked = true;
    this._hangarSeq = null;
    this._hangarHover = 0;
    this.hangarBay.setPlayerPadAngle(SHIP.SPAWN_ANGLE);

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
    this._setDockHud(false);
    this._positionLaunchBtn();

    if (landing) {
      this._startLandingSequence(entryAngle, entryTurret);
    } else {
      this._setLaunchBtnVisible(true);
    }
  }

  /** Leave hangar and restore the title screen loop. */
  exitHangar() {
    if (this.mode !== 'hangar') return;
    if (this._hangarSeq) return;
    this.input.disable();
    this._clearPlaySession();
    this.hangarBay.clearOps();
    this.mode = 'title';
    this.paused = false;
    this._titleHasDrawn = true;
    this._setTitleFade(1);
    this.camera.position.set(this._spaceCam.x, this._spaceCam.y);
    this.camera.offset.set(0, 0);
    this.camera.effectiveZoom = 1;
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    this.camera.speedZoom = 1;
    this.asteroidSystem.update(this._spaceCam.x, this._spaceCam.y);

    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    if (this._buildStamp) this._buildStamp.classList.remove('hidden');
    this._setLaunchBtnVisible(false);
  }

  /** Controls sandbox — ship only, no world. */
  beginControls(returnTo = 'title') {
    if (this.mode === 'playing' && this.paused) {
      this.paused = false;
      if (this._pauseMenu) this._pauseMenu.classList.add('hidden');
    }
    this._controlsReturn = returnTo;
    this._savedCam = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      userZoom: this.camera.userZoom,
      targetUserZoom: this.camera.targetUserZoom,
      speedZoom: this.camera.speedZoom,
      effectiveZoom: this.camera.effectiveZoom,
    };
    this._sandboxShip = new Ship(0, 0);
    this.precisionActive = false;
    this.mode = 'controls';
    this.input.enable();
    this.input.paused = false;
    this.camera.position.set(0, 0);
    this.camera.offset.set(0, 0);
    this.camera.userZoom = 2.4;
    this.camera.targetUserZoom = 2.4;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = 2.4;
    this._setTitleFade(1);
    this.canvas.style.opacity = '1';
    if (this._controlsHud) this._controlsHud.classList.remove('hidden');
    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    this._setLaunchBtnVisible(false);
    this._setDockHud(false);
  }

  exitControls() {
    if (this.mode !== 'controls') return;
    this._sandboxShip = null;
    if (this._controlsHud) this._controlsHud.classList.add('hidden');
    const ret = this._controlsReturn;
    if (ret === 'pause' && this.ship) {
      this.mode = 'playing';
      this.paused = true;
      this.input.paused = true;
      if (this._savedCam) {
        this.camera.position.set(this._savedCam.x, this._savedCam.y);
        this.camera.userZoom = this._savedCam.userZoom;
        this.camera.targetUserZoom = this._savedCam.targetUserZoom;
        this.camera.speedZoom = this._savedCam.speedZoom;
        this.camera.effectiveZoom = this._savedCam.effectiveZoom;
        this.camera.offset.set(0, 0);
      }
      if (this._pauseMenu) this._pauseMenu.classList.remove('hidden');
      this._updateFullscreenButtons(!!document.fullscreenElement);
      return 'pause';
    }
    this.input.disable();
    this.mode = 'title';
    this.paused = false;
    this._titleHasDrawn = true;
    this._setTitleFade(1);
    this.camera.position.set(this._spaceCam.x || 0, this._spaceCam.y || 0);
    this.camera.effectiveZoom = 1;
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    return 'title';
  }

  /** End run and return to title. */
  returnToMainMenu() {
    if (this.paused) {
      this.paused = false;
      this.input.paused = false;
      if (this._pauseMenu) this._pauseMenu.classList.add('hidden');
    }
    this.input.disable();
    this._clearPlaySession();
    this.hangarBay.clearOps();
    this._hangarSeq = null;
    this.mode = 'title';
    this._titleHasDrawn = true;
    this._setTitleFade(1);
    this.camera.position.set(this._spaceCam.x || 0, this._spaceCam.y || 0);
    this.camera.offset.set(0, 0);
    this.camera.effectiveZoom = 1;
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    this.camera.speedZoom = 1;
    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    if (this._controlsHud) this._controlsHud.classList.add('hidden');
    if (this._buildStamp) this._buildStamp.classList.remove('hidden');
    this._setLaunchBtnVisible(false);
    this._setDockHud(false);
  }

  _clearPlaySession() {
    this.entityManager.clear();
    this.particleSystem.clear();
    this.ship = null;
    this.precisionActive = false;
    this.speedStreaks = new SpeedStreaks();
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

  requestLaunch() {
    if (this.mode !== 'hangar' || this._hangarSeq) return;
    this._startLaunchSequence();
  }

  requestDock() {
    if (this.mode !== 'playing' || this.paused || !this.ship) return;
    const speed = this.ship.velocity.length();
    if (!this.station.canRequestDock(this.ship.position.x, this.ship.position.y, speed)) {
      return;
    }
    const entryAngle = this.ship.angle;
    const entryTurret = this.ship.turretAngle;
    this.beginHangar({ landing: true, entryAngle, entryTurret });
    if (typeof this.onEnterHangar === 'function') this.onEnterHangar();
  }

  _startLaunchSequence() {
    this._hangarSeq = { kind: 'launch', phase: 'warn', t: 0 };
    this._dockLocked = true;
    this._hangarHover = 0;
    this._setLaunchBtnVisible(false);
    this.hangarBay.beginOps(PLAYER_BAY, 'departing');
    this.hangarBay.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
    this.camera.targetUserZoom = HANGAR.ZOOM_LAUNCH;
  }

  _startLandingSequence(entryAngle = FACE_SOUTH, entryTurret = null) {
    const startAngle = Number.isFinite(entryAngle) ? entryAngle : FACE_SOUTH;
    const startTurret = Number.isFinite(entryTurret) ? entryTurret : startAngle;
    this._hangarSeq = { kind: 'land', phase: 'align', t: 0 };
    this._dockLocked = false;
    this._hangarHover = 1;
    this._setLaunchBtnVisible(false);
    this.ship.position.set(HANGAR.PLAYER_PAD_X, HANGAR.LAND_START_Y);
    this.ship.velocity.set(0, HANGAR.LAND_APPROACH_SPEED);
    this.ship.angle = startAngle;
    this.ship.turretAngle = startTurret;
    this.ship.angularVelocity = 0;
    this.ship.visualScale = HANGAR.HOVER_SCALE;
    this.hangarBay.beginOps(PLAYER_BAY, 'incoming');
    this.hangarBay.setDoorOpen(PLAYER_BAY, 1);
    this.hangarBay.setBeacon(PLAYER_BAY, 'open');
    // Pad waits facing south for the settle; ship yaws onto it
    this.hangarBay.setPlayerPadAngle(FACE_SOUTH);
    this.camera.targetUserZoom = HANGAR.ZOOM_LAUNCH;
    this.camera.userZoom = HANGAR.ZOOM_LAUNCH;
    this.camera.effectiveZoom = HANGAR.ZOOM_LAUNCH;
    this.camera.position.set(this.ship.position.x, this.ship.position.y * 0.5);
  }

  _finishLaunchToSpace() {
    const spawn = this.station.getExitSpawn();
    const vx = (this.ship?.velocity.x || 0) * 0.25;
    // Cap outbound speed so you stay near Jennings Station
    let vy = this.ship?.velocity.y ?? -160;
    if (vy > -80) vy = -80;
    if (vy < -220) vy = -220;
    this.hangarBay.clearOps(PLAYER_BAY);
    this._hangarSeq = null;
    this._hangarHover = 0;
    this._dockLocked = true;

    this.entityManager.clear();
    this.particleSystem.clear();
    this.ship = new Ship(spawn.x, spawn.y);
    this.ship.angle = spawn.angle;
    this.ship.turretAngle = spawn.angle;
    this.ship.velocity.set(vx, vy);
    this.entityManager.add(this.ship, 'ship');

    this.mode = 'playing';
    this.camera.position.set(spawn.x, spawn.y);
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = 1;
    this.asteroidSystem.update(spawn.x, spawn.y);

    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    this._setLaunchBtnVisible(false);
    if (typeof this.onLaunchComplete === 'function') this.onLaunchComplete();
  }

  _finishLanding() {
    this._hangarSeq = null;
    this._dockLocked = true;
    this._hangarHover = 0;
    this.ship.position.set(this._dockPos.x, this._dockPos.y);
    this.ship.velocity.set(0, 0);
    this.ship.angle = SHIP.SPAWN_ANGLE;
    this.ship.turretAngle = SHIP.SPAWN_ANGLE;
    this.ship.visualScale = 1;
    this._clearShipThrusters(this.ship);
    this.hangarBay.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
    this.hangarBay.clearOps(PLAYER_BAY);
    this.camera.targetUserZoom = HANGAR.ZOOM_DEFAULT;
    this._setLaunchBtnVisible(true);
  }

  _setLaunchBtnVisible(show) {
    if (!this._hangarLaunchBtn) return;
    this._hangarLaunchBtn.classList.toggle('hidden', !show);
  }

  _setDockHud(show) {
    this._dockPrompt = show;
    if (this._dockHud) this._dockHud.classList.toggle('hidden', !show);
  }

  _positionLaunchBtn() {
    if (!this._hangarLaunchBtn || this.mode !== 'hangar') return;
    if (this._hangarLaunchBtn.classList.contains('hidden')) return;
    const anchor = this.hangarBay.getBayDoorAnchor(PLAYER_BAY);
    const scr = this.camera.worldToScreen(
      anchor.x,
      anchor.y,
      this.renderer.centerX,
      this.renderer.centerY
    );
    const z = this.camera.effectiveZoom;
    const margin = 36;
    const x = Math.min(
      this.renderer.width - margin,
      Math.max(margin, scr.x)
    );
    // Pin to top when doors are off-screen (close zoom on pad)
    let y = scr.y;
    if (y < margin + 48) y = 72;
    if (y > this.renderer.height - margin) y = this.renderer.height - margin;
    this._hangarLaunchBtn.style.left = `${x}px`;
    this._hangarLaunchBtn.style.top = `${y}px`;
    this._hangarLaunchBtn.style.transform = `translate(-50%, -50%) scale(${Math.min(1.2, Math.max(0.85, z / 7))})`;
  }

  _loop(timestamp) {
    if (!this.running) return;

    const deltaTime = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (this.mode === 'playing' && this.input.consumePauseToggle()) {
      this.togglePause();
    } else if (this.mode === 'hangar' && this.input.consumePauseToggle()) {
      if (!this._hangarSeq) {
        this.exitHangar();
        if (typeof this.onHangarExit === 'function') this.onHangarExit();
      }
    } else if (this.mode === 'controls' && this.input.consumePauseToggle()) {
      const dest = this.exitControls();
      if (typeof this.onControlsExit === 'function') this.onControlsExit(dest);
    }

    if (!this.paused) {
      this.gameTime += deltaTime;
      if (this.mode === 'title') {
        this._updateTitle(deltaTime);
      } else if (this.mode === 'hangar') {
        this._updateHangar(deltaTime);
      } else if (this.mode === 'controls') {
        this._updateControls(deltaTime);
      } else {
        this.update(deltaTime);
      }
    } else if (this.ship) {
      this._updateHUD();
    }

    this.render();
    if (this.mode === 'hangar') this._positionLaunchBtn();
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

  _coverRadius() {
    return Math.hypot(this.renderer.centerX, this.renderer.centerY) + 40;
  }

  _updateHangar(deltaTime) {
    if (!this.ship) return;

    this._titleHeading += TITLE_TURN_RATE * deltaTime;
    this._spaceCam.x += Math.cos(this._titleHeading) * TITLE_DRIFT_SPEED * deltaTime;
    this._spaceCam.y += Math.sin(this._titleHeading) * TITLE_DRIFT_SPEED * deltaTime;
    this.asteroidSystem.update(this._spaceCam.x, this._spaceCam.y);

    const zoomWheel = this._hangarSeq ? 0 : this.input.consumeZoomDelta();
    this.precisionActive = false;

    if (this._hangarSeq) {
      this._updateHangarSequence(deltaTime);
    } else {
      const aimWorld = this.camera.screenToWorld(
        this.input.mouseScreen.x,
        this.input.mouseScreen.y,
        this.renderer.centerX,
        this.renderer.centerY
      );

      this.shipController.update(this.ship, this.input, false, deltaTime);
      this.ship.position.x = this._dockPos.x;
      this.ship.position.y = this._dockPos.y;
      this.ship.velocity.set(0, 0);

      this.weaponSystem.update(
        this.ship,
        this.input,
        aimWorld,
        true,
        [],
        deltaTime
      );
    }

    this.entityManager.update(deltaTime);
    this.particleSystem.update(deltaTime);

    this.hangarBay.update(deltaTime, this.ship, {
      firedTurret: this.ship.muzzleFlash > 0.02,
      laserOn: !!this.ship.miningLaserFiring,
    });

    if (!this._hangarSeq) {
      this.hangarBay.applyWeaponHits(
        this.ship,
        [...this.entityManager.getByType('projectile')],
        deltaTime
      );
    }

    this.camera.updateHangar(this.ship.position, deltaTime, zoomWheel);
    this.renderer.emitThrusterParticles(this.ship, this.particleSystem);

    if (this._hudHangarZoom) {
      this._hudHangarZoom.textContent = this.camera.effectiveZoom.toFixed(1);
    }
  }

  _clearShipThrusters(ship) {
    for (const key of Object.keys(ship.thrusters)) {
      if (typeof ship.thrusters[key] === 'number') ship.thrusters[key] = 0;
    }
    ship.thrusters.retroBurn = false;
  }

  /** Simultaneous 8-thruster burst (hover lift / lower cue). */
  _fireManeuverBurst(ship, power) {
    for (const key of MANEUVER_THRUSTER_KEYS) {
      ship.thrusters[key] = power;
    }
  }

  _applyHangarHoverVisual(hover) {
    this._hangarHover = Math.max(0, Math.min(1, hover));
    if (this.ship) {
      this.ship.visualScale =
        1 + this._hangarHover * (HANGAR.HOVER_SCALE - 1);
    }
  }

  _smoothstep(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  _updateHangarSequence(dt) {
    const s = this._hangarSeq;
    if (!s || !this.ship) return;
    s.t += dt;
    this._clearShipThrusters(this.ship);
    this.input.mouseDown = false;
    this.input.mouseRightDown = false;

    if (s.kind === 'launch') this._tickLaunch(s, dt);
    else this._tickLand(s, dt);
  }

  _tickLaunch(s, dt) {
    const ship = this.ship;
    switch (s.phase) {
      case 'warn':
        this.hangarBay.tickEvac(PLAYER_BAY);
        if (s.t > 1.4) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this.hangarBay.tickEvac(PLAYER_BAY);
        if (this.hangarBay.isBayDangerClear(PLAYER_BAY) || s.t > 3.5) {
          s.phase = 'doors';
          s.t = 0;
          this.hangarBay.setBeacon(PLAYER_BAY, 'open');
        }
        break;
      case 'doors':
        this.hangarBay.setDoorOpen(PLAYER_BAY, Math.min(1, s.t / 1.6));
        if (s.t > 1.75) {
          s.phase = 'lift';
          s.t = 0;
        }
        break;
      case 'lift': {
        // One short 8-thruster burst while the hull rises off the pad
        const burst = s.t < 0.38 ? HANGAR.HOVER_BURST_POWER : Math.max(0, 0.55 - (s.t - 0.38));
        if (burst > 0.02) this._fireManeuverBurst(ship, burst);
        this._applyHangarHoverVisual(this._smoothstep(s.t / HANGAR.HOVER_LIFT_TIME));
        ship.position.x = this._dockPos.x;
        ship.position.y = this._dockPos.y;
        ship.velocity.set(0, 0);
        ship.angle = SHIP.SPAWN_ANGLE;
        ship.angularVelocity = 0;
        if (s.t >= HANGAR.HOVER_LIFT_TIME) {
          this._applyHangarHoverVisual(1);
          s.phase = 'thrust';
          s.t = 0;
          this._dockLocked = false;
          ship.velocity.set(0, 0);
        }
        break;
      }
      case 'thrust': {
        ship.thrusters.mainEngine = Math.min(1.2, 0.45 + s.t * 0.5);
        const forward = Vec2.fromAngle(ship.angle);
        const force = forward.scale(PHYSICS.MAIN_ENGINE_THRUST * ship.thrusters.mainEngine);
        this.physics.applyForce(ship, force, dt);
        this.physics.integrate(ship, dt);
        ship.angle = SHIP.SPAWN_ANGLE;
        ship.angularVelocity = 0;
        this._applyHangarHoverVisual(1);
        if (ship.position.y < HANGAR.LAUNCH_EXIT_Y || s.t > 5) {
          this._finishLaunchToSpace();
        }
        break;
      }
      default:
        break;
    }
  }

  _tickLand(s, dt) {
    const ship = this.ship;
    switch (s.phase) {
      case 'align': {
        // Keep inbound southbound path while yaw couples swing nose to south
        ship.position.x += (HANGAR.PLAYER_PAD_X - ship.position.x) * Math.min(1, dt * 2.5);
        if (ship.velocity.y < HANGAR.LAND_APPROACH_SPEED * 0.55) {
          ship.velocity.y = Math.min(
            HANGAR.LAND_APPROACH_SPEED,
            ship.velocity.y + 40 * dt
          );
        }

        const err = angleDifference(ship.angle, FACE_SOUTH);
        const yawSign = Math.abs(err) < 0.04 ? 0 : Math.sign(err);
        const yawMult = 1.25;
        const maxRate = PHYSICS.MAX_ROTATION_SPEED * yawMult;
        const accel = PHYSICS.ROTATION_ACCEL * yawMult;
        this.physics.applyYawInput(ship, yawSign, maxRate, accel, dt);
        if (yawSign === 0) {
          this.physics.dampRotation(ship, dt);
          // Snap residual when nearly there so brake starts clean
          if (Math.abs(err) < 0.08 && Math.abs(ship.angularVelocity) < 0.35) {
            ship.angle = FACE_SOUTH;
            ship.angularVelocity = 0;
          }
        } else {
          const couple = yawSign > 0 ? YAW_CW : YAW_CCW;
          for (const key of couple) ship.thrusters[key] = 0.9;
        }

        this.physics.integrate(ship, dt);

        const aligned =
          Math.abs(angleDifference(ship.angle, FACE_SOUTH)) < 0.1 &&
          Math.abs(ship.angularVelocity) < 0.45;
        // Don't overshoot the pad while still swinging
        if (!aligned && ship.position.y > -50) {
          ship.position.y = Math.min(ship.position.y, -48);
          ship.velocity.y = Math.min(ship.velocity.y, 12);
        }

        this._applyHangarHoverVisual(1);

        if ((aligned && ship.position.y >= -55) || s.t > 7) {
          ship.angle = FACE_SOUTH;
          ship.angularVelocity = 0;
          s.phase = 'brake';
          s.t = 0;
        }
        break;
      }
      case 'brake': {
        // Nose-thruster retro only (no main-engine retroBurn plume)
        ship.angle = FACE_SOUTH;
        ship.angularVelocity = 0;
        ship.thrusters.nosePort = 0.95;
        ship.thrusters.noseStarboard = 0.95;
        {
          const forward = Vec2.fromAngle(ship.angle);
          const force = forward.scale(-PHYSICS.MANEUVER_THRUST * 2.2);
          this.physics.applyForce(ship, force, dt);
          if (ship.velocity.y < 0) ship.velocity.y = 0;
          this.physics.integrate(ship, dt);
          ship.position.x += (this._dockPos.x - ship.position.x) * Math.min(1, dt * 4);
          // Once nearly stopped, creep the rest of the way over B2
          if (ship.velocity.y < 14) {
            ship.position.y += (this._dockPos.y - ship.position.y) * Math.min(1, dt * 2.4);
            ship.velocity.y = 0;
          }
        }
        this._applyHangarHoverVisual(1);
        if (
          (Math.abs(ship.position.y - this._dockPos.y) < 3 && ship.velocity.y < 12) ||
          s.t > 4
        ) {
          ship.position.x = this._dockPos.x;
          ship.position.y = this._dockPos.y;
          ship.velocity.set(0, 0);
          s.phase = 'lower';
          s.t = 0;
        }
        break;
      }
      case 'lower': {
        const burst = s.t < 0.38 ? HANGAR.HOVER_BURST_POWER : Math.max(0, 0.55 - (s.t - 0.38));
        if (burst > 0.02) this._fireManeuverBurst(ship, burst);
        this._applyHangarHoverVisual(
          1 - this._smoothstep(s.t / HANGAR.HOVER_LIFT_TIME)
        );
        ship.position.x = this._dockPos.x;
        ship.position.y = this._dockPos.y;
        ship.velocity.set(0, 0);
        ship.angle = FACE_SOUTH;
        ship.angularVelocity = 0;
        this.hangarBay.setPlayerPadAngle(FACE_SOUTH);
        if (s.t >= HANGAR.HOVER_LIFT_TIME) {
          this._applyHangarHoverVisual(0);
          s.phase = 'turn';
          s.t = 0;
        }
        break;
      }
      case 'turn': {
        // Pad turntable + ship: south → north (180°) — rim stays on for pad motion
        this.hangarBay.setPadRim(PLAYER_BAY, 'on');
        const u = this._smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        const angle = FACE_SOUTH + (SHIP.SPAWN_ANGLE - FACE_SOUTH) * u;
        ship.angle = angle;
        ship.turretAngle = angle;
        ship.angularVelocity = 0;
        ship.position.x = this._dockPos.x;
        ship.position.y = this._dockPos.y;
        ship.velocity.set(0, 0);
        this.hangarBay.setPlayerPadAngle(angle);
        this._applyHangarHoverVisual(0);
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          ship.angle = SHIP.SPAWN_ANGLE;
          ship.turretAngle = SHIP.SPAWN_ANGLE;
          this.hangarBay.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
          s.phase = 'doors';
          s.t = 0;
        }
        break;
      }
      case 'doors':
        ship.position.x = this._dockPos.x;
        ship.position.y = this._dockPos.y;
        ship.velocity.set(0, 0);
        ship.angle = SHIP.SPAWN_ANGLE;
        this.hangarBay.setDoorOpen(PLAYER_BAY, Math.max(0, 1 - s.t / 1.4));
        if (s.t > 0.35) this.hangarBay.setBeacon(PLAYER_BAY, 'warning');
        if (s.t > 1.5) {
          this._finishLanding();
        }
        break;
      default:
        break;
    }
  }

  _updateControls(deltaTime) {
    const ship = this._sandboxShip;
    if (!ship) return;

    const zoomWheel = this.input.consumeZoomDelta();
    const speed = ship.velocity.length();
    const capsDesired = this.input.capsLockDesired;
    if (!capsDesired) this.precisionActive = false;
    else if (!this.precisionActive && speed < PHYSICS.PRECISION_ENGAGE_SPEED) {
      this.precisionActive = true;
    }

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

    this.shipController.update(ship, this.input, this.precisionActive, deltaTime);
    ship.position.x += (0 - ship.position.x) * Math.min(1, deltaTime * 0.15);
    ship.position.y += (0 - ship.position.y) * Math.min(1, deltaTime * 0.15);

    this.weaponSystem.update(ship, this.input, aimWorld, pointerInViewport, [], deltaTime);
    this.entityManager.update(deltaTime);
    this.particleSystem.update(deltaTime);

    this.camera.update(ship.position, ship.velocity, deltaTime, this.renderer.viewportRadius, zoomWheel);
    this.renderer.emitThrusterParticles(ship, this.particleSystem);
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
      // stay active
    } else if (speed < PHYSICS.PRECISION_ENGAGE_SPEED) {
      this.precisionActive = true;
    }

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

    const canDock = this.station.canRequestDock(
      this.ship.position.x,
      this.ship.position.y,
      speedAfter
    );
    const near = this.station.inApproach(this.ship.position.x, this.ship.position.y);
    this._setDockHud(near);
    if (this._dockHud) {
      this._dockHud.classList.toggle('ready', canDock);
      this._dockHud.textContent = canDock
        ? 'ENTER / CLICK — DOCK AT JENNINGS STATION'
        : 'APPROACH BAY MOUTH · SLOW TO DOCK';
    }
    // Enter also handled in main.js (reliable vs browser automation)
  }

  _renderBackground({ fullscreen = false, includeWorldNebulae = true } = {}) {
    const cameraPos = this.camera.position;
    const time = this.gameTime;
    const zoom = this.camera.effectiveZoom;
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

    if (this.mode === 'controls') {
      this._renderControls();
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

    this.renderer.renderWorldLayer((ctx) => {
      this.station.render(ctx);
    }, this.camera);

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

  _renderControls() {
    this.renderer.setupCircularClip();
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#050810';
    ctx.fillRect(
      this.renderer.centerX - this.renderer.viewportRadius,
      this.renderer.centerY - this.renderer.viewportRadius,
      this.renderer.viewportRadius * 2,
      this.renderer.viewportRadius * 2
    );

    const g = ctx.createRadialGradient(
      this.renderer.centerX,
      this.renderer.centerY,
      20,
      this.renderer.centerX,
      this.renderer.centerY,
      this.renderer.viewportRadius
    );
    g.addColorStop(0, 'rgba(20, 40, 60, 0.5)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(
      this.renderer.centerX,
      this.renderer.centerY,
      this.renderer.viewportRadius,
      0,
      Math.PI * 2
    );
    ctx.fill();

    this.renderer.renderProjectiles(
      [...this.entityManager.getByType('projectile')],
      this.camera
    );
    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      this._sandboxShip
    );
    if (this._sandboxShip) {
      this.renderer.renderShip(this._sandboxShip, this.camera);
    }
    this.renderer.endCircularClip();
  }

  _renderHangar() {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

    const space = {
      starfield: this.starfield,
      nebulaField: this.nebulaField,
      spaceX: this._spaceCam.x,
      spaceY: this._spaceCam.y,
      time: this.gameTime,
      nebulae: this.asteroidSystem.getNebulae(),
    };

    const doorLip = this.hangarBay.getDoorLipY();
    const shipOutside = !!(this.ship && this.ship.position.y < doorLip - 2);

    this.renderer.renderWorldLayer((worldCtx) => {
      this.hangarBay.renderDeck(worldCtx, space);
      this.hangarBay.renderCrew(worldCtx);
      this.hangarBay.renderElevatorTransits(worldCtx);
      this.hangarBay.renderVisitors(worldCtx, {
        beforeOcclusion: (wctx) => {
          if (this.ship && shipOutside) {
            this._drawHangarHoverShadow(wctx);
            this.renderer.drawShipInWorld(wctx, this.ship);
          }
        },
        afterOcclusion: (wctx) => {
          if (this.ship && !shipOutside) {
            this._drawHangarHoverShadow(wctx);
            this.renderer.drawShipInWorld(wctx, this.ship);
          }
        },
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

    this.renderer.renderWorldLayer((worldCtx) => {
      this.hangarBay.renderOverhead(worldCtx);
    }, this.camera);
  }

  _drawHangarHoverShadow(ctx) {
    const h = this._hangarHover;
    if (!this.ship || h < 0.02) return;
    const s = this.ship;
    const ox = 1.5 * h;
    const oy = 3 + h * 6;
    ctx.save();
    ctx.translate(s.position.x + ox, s.position.y + oy);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + h * 0.38})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16 + h * 6, 9 + h * 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
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
