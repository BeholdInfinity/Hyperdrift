import { Ship } from '../entities/Ship.js';
import { ShipController } from '../entities/ShipController.js';
import { EntityManager } from '../entities/EntityManager.js';
import { ParticleSystem } from '../entities/Particle.js';
import { InputSystem } from '../systems/InputSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { Renderer } from '../systems/Renderer.js';
import { Scanner } from '../systems/Scanner.js';
import { ScannerSystem } from '../systems/ScannerSystem.js';
import { CockpitFrame } from '../systems/CockpitFrame.js';
import { CockpitPanels } from '../systems/CockpitPanels.js';
import { PipSystem } from '../systems/PipSystem.js';
import { PoiSystem } from '../world/PoiSystem.js';
import { SectorMap } from '../world/SectorMap.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { AsteroidSystem } from '../systems/AsteroidSystem.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';
import { Starfield } from '../world/Starfield.js';
import { NebulaField } from '../world/NebulaField.js';
import { SpeedStreaks } from '../world/SpeedStreaks.js';
import {
  HangarBay,
  hangarDefaultZoom,
  hangarElevatorZoom,
  hangarZoomMax,
  hangarZoomMin,
  hangarPadX,
  syncHangarSidePadFromLayout,
} from '../world/HangarBay.js';
import { makeVisitorThrusters } from '../world/HangarVisitorShips.js';
import { Station } from '../world/Station.js';
import { AmbientTrafficSystem } from '../world/AmbientTrafficSystem.js';
import {
  cruiseTo,
  followWaypointRing,
  holdRacetrackCorners,
  initHoldLeg,
} from '../world/NpcPilot.js';
import {
  PHYSICS,
  HANGAR,
  SHIP,
  BLUEPRINT,
  PAD_MK_RADIUS,
  PAD_MK4_TEASE_RADIUS,
  STATION,
  AMBIENT,
  SCANNER,
} from '../core/Constants.js';
import { Vec2, angleDifference, clamp } from '../utils/MathUtils.js';
import {
  BlueprintSandbox,
  cloneShipDef,
} from '../ships/BlueprintSandbox.js';
import { padMkForClass } from '../ships/ShipClasses.js';
import { hangarShipView } from '../ships/ShipViews.js';
import { Settings } from './Settings.js';
import { DevTools } from '../dev/DevTools.js';
import { drawDevOverlays } from '../dev/DevOverlay.js';
import { HangarLayoutEditor } from '../dev/HangarLayoutEditor.js';
import { blueprintAuthoring } from '../dev/BlueprintAuthoring.js';
import { TITLE_LAYOUT } from '../ui/title-layout.js';
import {
  placeRegistry,
  ensureVesselSimState,
  shipHasInterior,
  canEnterInterior,
  unseatCaptainRoute,
  tickVesselInteriorCrew,
  applyHullScar,
  interactFeature,
} from '../world/place/index.js';
import { TitleScreen } from '../ui/TitleScreen.js';

/** Slow space-cam drift behind hangar bay doors (world units / sec) */
const TITLE_DRIFT_SPEED = 52;
/** How quickly the hangar-door space drift heading turns (rad / sec) */
const TITLE_TURN_RATE = 0.12;
/**
 * Title DoF backdrop resolution vs screen.
 * Full-res CSS blur was ~15 FPS; too-low LO without enough blur shows a pixel weave.
 */
const TITLE_DOF_RES = 0.5;

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
    /** @type {'title'|'playing'|'hangar'|'controls'|'blueprint'} */
    this.mode = 'title';
    this.lastTime = 0;

    this.renderer = new Renderer(canvas);
    this.scanner = new Scanner();
    this.scannerSystem = new ScannerSystem();
    this.pipSystem = new PipSystem();
    this.poiSystem = new PoiSystem();
    this.sectorMap = new SectorMap();
    this.cockpitFrame = new CockpitFrame();
    this.cockpitPanels = new CockpitPanels();
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
    this.titleScreen = new TitleScreen();
    this.titleScreen.bindSpacer(document.getElementById('title-art-spacer'));
    this.hangarBay = new HangarBay();
    this.station = new Station();
    this.ambientTraffic = new AmbientTrafficSystem();
    /** Place → Area → Feature registry (Jennings default hangar) */
    this.placeRegistry = placeRegistry;
    /** Stub: player entered vessel interior graph (walker TBD) */
    this.interiorActive = false;
    this.interiorPlaceId = null;

    this.ship = null;
    this._sandboxShip = null;
    /** @type {BlueprintSandbox|null} */
    this._blueprint = null;
    this._blueprintReturn = 'title';
    this._pendingBlueprintDef = null;
    this.precisionActive = false;
    /**
     * Precision request. Driven by Caps Lock or the cockpit MODES switch;
     * `precisionActive` mirrors it instantly. Decoupled from the raw Caps Lock
     * LED so a click toggle can own it too.
     */
    this.precisionDesired = false;
    this._prevCapsLED = false;
    /**
     * Pilot ORIENT lock: 'ship' locks the hull pointing screen-up and rotates
     * the world around it (default); 'world' keeps world-north up and rotates
     * the ship inside it. Toggled from the cockpit MODES switch or the R key.
     */
    this.viewMode = 'ship';
    /**
     * Cockpit VIEW mode: 'ship' shows the world through the viewport with the
     * thin scanner ring around it (default); 'scan' replaces both with one
     * full-disc radar scope (ship at center, blips plotted by range). The POI
     * rim ring is unchanged. Toggled from the cockpit MODES switch or the V key.
     */
    this.scanView = 'ship';
    this.gameTime = 0;
    /** Dev sim clock scale: 0=pause, 0.5=slow, 1=normal, 2=fast, 4=fast2x */
    this.simSpeed = 1;
    this._titleHeading = Math.random() * Math.PI * 2;
    this._titleFade = 0;
    this._titleHasDrawn = false;
    this._lastFrameDt = 1 / 60;
    /** Title DoF: full-res capture + LO blur working buffers */
    this._titleDof = null;
    this._titleDofCtx = null;
    this._titleDofLo = null;
    this._titleDofLoCtx = null;
    this._titleDofBlur = null;
    this._titleDofBlurCtx = null;
    this._titleDofScale = TITLE_DOF_RES;
    /** Soft out-of-focus orbs over the blurred title sim */
    this._titleBokeh = null;
    this._dockPos = { x: 0, y: 0 };
    /** Bay index 0/1/2 where the controlled ship is seated */
    this.playerBayIndex = 1;
    /** Hangar sim stays live across space flights (pad lights / AI handoff) */
    this._hangarLive = false;
    /** Accumulated hangar sim time under distance LOD (space only) */
    this._hangarLodAccum = 0;
    /**
     * Dev hangar control target — who receives thruster/weapon input.
     * @type {null|{ kind:'player' }|{ kind:'visitor', bayIndex:number }}
     */
    this.hangarControlTarget = { kind: 'player' };
    /**
     * Hangar ship under LMB press (Dev select); suppresses fire until release.
     * @type {null|{ kind:'player' }|{ kind:'visitor', bayIndex:number }}
     */
    this._hangarSelectPress = null;
    /** Puppet Ship used to drive visitor thrusters in the hangar */
    this._hangarPuppet = null;
    /** Continues title-screen space drift; shown through hangar bay doors */
    this._spaceCam = { x: 0, y: 0 };
    /** @type {null|{kind:'launch'|'land', phase:string, t:number}} */
    this._hangarSeq = null;
    /** 0 = settled on pad, 1 = hovering (launch lift / land approach) */
    this._hangarHover = 0;
    /**
     * During enter/exit sequences, cinematic zoom plays until the player
     * scrolls — then they own zoom for the rest of the sequence.
     */
    this._hangarSeqZoomPlayer = false;
    /**
     * Forced main-engine plume after hangar→space handoff.
     * Stays on until the ship nears the outer approach lights (failsafe timer).
     */
    this._exitBurn = false;
    this._exitBurnFailsafe = 0;
    this._dockLocked = true;
    this._controlsReturn = 'title';
    this._dockPrompt = false;
    this._dockKeyHeld = false;
    /**
     * AI approach hold when station is full — released on any flight movement input.
     * @type {null|{ phase:'hold'|'approach', t:number, targetLane:number|null }}
     */
    this._approachHoldAI = null;

    this._startScreen = document.getElementById('start-screen');
    this._buildMeta =
      document.getElementById('build-meta') || document.getElementById('build-stamp');
    this._hangarHud = document.getElementById('hangar-hud');
    this._overlay = document.getElementById('overlay');
    this._controlsHud = document.getElementById('controls-hud');
    this._blueprintHud = document.getElementById('blueprint-hud');
    this._dockHud = document.getElementById('dock-hud');
    this._hangarLaunchBtn = document.getElementById('hangar-launch-btn');

    this._hudEl = document.getElementById('hud');
    this._hudSpeed = document.getElementById('speed-value');
    this._hudCoords = document.getElementById('coords-value');
    this._hudZoom = document.getElementById('zoom-value');
    this._hudPrecision = document.getElementById('precision-value');
    this._hudHangarZoom = document.getElementById('hangar-zoom-value');
    this._fpsCounter = document.getElementById('fps-counter');
    this._fpsFrames = 0;
    this._fpsAccumMs = 0;
    this._fpsLastTs = 0;
    this._pauseMenu = document.getElementById('pause-menu');
    this._fullscreenBtn = document.getElementById('fullscreen-btn');
    this._pauseFullscreenBtn = document.getElementById('pause-fullscreen-btn');

    this.input.onFullscreenChange = (isFs) => this._updateFullscreenButtons(isFs);
    this._updateFullscreenButtons(!!document.fullscreenElement);

    window.addEventListener('resize', () => this.renderer.resize());
    this.renderer.resize();
    this._setTitleFade(0);
  }

  /** Dev tool: scale simulation clock (0 pauses sim; render still runs). */
  setSimSpeed(speed) {
    const n = Number(speed);
    if (!Number.isFinite(n) || n < 0) return this.simSpeed;
    this.simSpeed = n;
    return this.simSpeed;
  }

  getSimSpeed() {
    return this.simSpeed;
  }

  /** Reset sim clock unless Dev Mode is keeping a custom speed. */
  _resetSimSpeedUnlessDev() {
    if (!Settings.isDevMode()) this.simSpeed = 1;
  }

  _mouseWorld() {
    return this.camera.screenToWorld(
      this.input.mouseScreen.x,
      this.input.mouseScreen.y,
      this.renderer.centerX,
      this.renderer.centerY
    );
  }

  _setTitleFade(opacity) {
    this._titleFade = opacity;
    this.canvas.style.opacity = String(opacity);
    if (this._startScreen) this._startScreen.style.opacity = String(opacity);
    if (this._buildMeta) this._buildMeta.style.opacity = String(opacity);
  }

  /**
   * ENTER HANGAR / QUICK LAUNCH — immediate mode switch from title.
   * @param {'hangar'|'play'} dest
   * @returns {boolean}
   */
  requestTitleExit(dest) {
    if (this.mode !== 'title') return false;
    if (dest === 'hangar') {
      this.beginHangar({ fromMenu: true });
      if (typeof this.onEnterHangar === 'function') this.onEnterHangar();
      return true;
    }
    if (dest === 'play') {
      this.beginPlay();
      if (typeof this.onLaunchComplete === 'function') this.onLaunchComplete();
      return true;
    }
    return false;
  }

  _ensureTitleDof() {
    const fullW = this.renderer.width | 0;
    const fullH = this.renderer.height | 0;
    if (!fullW || !fullH) return;
    const scale = TITLE_DOF_RES;
    const loW = Math.max(2, Math.round(fullW * scale));
    const loH = Math.max(2, Math.round(fullH * scale));
    this._titleDofScale = scale;
    if (!this._titleDof || this._titleDof.width !== fullW || this._titleDof.height !== fullH) {
      this._titleDof = document.createElement('canvas');
      this._titleDof.width = fullW;
      this._titleDof.height = fullH;
      this._titleDofCtx = this._titleDof.getContext('2d', { alpha: false });
    }
    if (!this._titleDofLo || this._titleDofLo.width !== loW || this._titleDofLo.height !== loH) {
      this._titleDofLo = document.createElement('canvas');
      this._titleDofLo.width = loW;
      this._titleDofLo.height = loH;
      this._titleDofLoCtx = this._titleDofLo.getContext('2d', { alpha: false });
      this._titleDofBlur = document.createElement('canvas');
      this._titleDofBlur.width = loW;
      this._titleDofBlur.height = loH;
      this._titleDofBlurCtx = this._titleDofBlur.getContext('2d', { alpha: false });
    }
  }

  _seedTitleBokeh() {
    const orbs = [];
    const colors = [
      ['rgba(255,210,140,0.22)', 'rgba(255,160,80,0.06)'],
      ['rgba(160,210,255,0.2)', 'rgba(80,140,220,0.05)'],
      ['rgba(255,240,200,0.18)', 'rgba(200,160,100,0.04)'],
      ['rgba(180,240,255,0.16)', 'rgba(60,160,220,0.04)'],
    ];
    for (let i = 0; i < 28; i++) {
      const c = colors[i % colors.length];
      orbs.push({
        x: Math.random(),
        y: Math.random(),
        r: 18 + Math.random() * 70,
        drift: 8 + Math.random() * 28,
        spd: 0.12 + Math.random() * 0.28,
        ph: Math.random() * Math.PI * 2,
        core: c[0],
        mid: c[1],
      });
    }
    return orbs;
  }

  _drawTitleBokeh(ctx, time) {
    if (!this._titleBokeh) this._titleBokeh = this._seedTitleBokeh();
    const w = this.renderer.width;
    const h = this.renderer.height;
    const scale = Number.isFinite(TITLE_LAYOUT.bokehScale)
      ? Math.max(0, TITLE_LAYOUT.bokehScale)
      : 1;
    if (scale <= 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const o of this._titleBokeh) {
      const x = o.x * w + Math.sin(time * o.spd + o.ph) * o.drift * scale;
      const y = o.y * h + Math.cos(time * o.spd * 0.73 + o.ph) * o.drift * 0.65 * scale;
      const r = Math.max(1, o.r * scale);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, o.core);
      g.addColorStop(0.4, o.mid);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Begin the title-screen loop (live Jennings space sim + wordmark). */
  startTitle() {
    this.mode = 'title';
    this.running = true;
    this.paused = false;
    this.simSpeed = 1;
    this._titleHasDrawn = false;
    this._hangarSeq = null;
    this._setTitleFade(0);
    this.lastTime = performance.now();
    this.input.consumeZoomDelta();
    this._enterTitleSim({ fadeIn: true });
    requestAnimationFrame((t) => this._loop(t));
  }

  /**
   * Live Jennings Station backdrop for the title screen.
   * Ambient traffic + hangar LOD run; no player ship.
   * @param {{ fadeIn?: boolean }} [opts]
   */
  _enterTitleSim({ fadeIn = false } = {}) {
    this._clearPlaySession();
    this._hangarSeq = null;
    HangarLayoutEditor.exit();
    this.simSpeed = 1;
    this.paused = false;

    syncHangarSidePadFromLayout(null);
    this.playerBayIndex = 1;
    this.hangarBay.reset(null, {
      playerBayIndex: this.playerBayIndex,
      placeId: placeRegistry.activePlaceId,
    });
    this.hangarBay.warmStartHeadless();
    this.hangarBay.clearControlledPadAfterLaunch();
    this.hangarBay.preferExternalDoorTraffic = true;
    this._hangarLive = true;
    this._hangarLodAccum = 0;

    this.ambientTraffic.reset();
    this.station.setBaySignals(this.hangarBay.getBaySignals());

    this.camera.rotation = TITLE_LAYOUT.rotation;
    this.camera.offset.set(0, 0);
    this.camera.speedZoom = 1;
    this._applyTitleCamera(this.gameTime || 0);
    this._spaceCam.x = this.camera.position.x;
    this._spaceCam.y = this.camera.position.y;
    this.asteroidSystem.update(this.camera.position.x, this.camera.position.y);

    // Seed a freighter on the runway so the title vignette always has motion
    const view = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      viewRadius: TITLE_LAYOUT.trafficViewRadius,
    };
    this.ambientTraffic.spawnBayApproach(
      this.station,
      1,
      null,
      this.station.x,
      this.station.y + 800,
      { runwayLocal: true } // title vignette — start on the north corridor
    );
    // Kick one update so seed bubble + approach exist on first paint
    this.ambientTraffic.update(1 / 60, {
      player: null,
      station: this.station,
      hangarBay: this.hangarBay,
      asteroids: this.asteroidSystem.getActiveAsteroids(),
      particles: this.particleSystem,
      camera: view,
    });

    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    if (this._controlsHud) this._controlsHud.classList.add('hidden');
    if (this._blueprintHud) this._blueprintHud.classList.add('hidden');
    if (this._buildStamp) this._buildStamp.classList.remove('hidden');
    this._setLaunchBtnVisible(false);
    this._setDockHud(false);

    if (fadeIn) this._setTitleFade(0);
    else this._setTitleFade(1);
  }

  /** Sine-bob look-at + zoom for the title vignette (reads TITLE_LAYOUT live). */
  _applyTitleCamera(time) {
    const V = TITLE_LAYOUT;
    const period = Math.max(0.5, V.bobPeriod || 10.5);
    const w = (Math.PI * 2) / period;
    const bob = Math.sin(time * w);
    const bob2 = Math.sin(time * w * 0.73 + 1.1);
    this.camera.position.set(
      V.lookX + bob * V.bobAmpX,
      V.lookY + bob2 * V.bobAmpY
    );
    this.camera.offset.set(0, 0);
    const z = V.zoom + Math.sin(time * w * 0.55 + 0.4) * V.bobZoom;
    this.camera.userZoom = z;
    this.camera.targetUserZoom = z;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = z;
    this.camera.rotation = V.rotation;
  }

  /** Quick-launch into playable flight near Jennings Station. */
  beginPlay() {
    this.camera.rotation = 0;
    this._clearPlaySession();
    // Pick exit bay first — spawn lane + departing pad light must match
    this.playerBayIndex = (Math.random() * 3) | 0;
    const spawn = this.station.getExitSpawn(this.playerBayIndex);
    this.ship = new Ship(spawn.x, spawn.y);
    this._applyPendingBlueprint(this.ship);
    this.ship.angle = spawn.angle;
    this.ship.turretAngle = spawn.angle;
    // Match hangar-exit feel: engine already engaged northbound
    this.ship.velocity.set(0, -220);
    this.ship.thrusters.mainEngine = 1;
    this.ship.exitBurn = true;
    this._beginExitBurn();
    this.precisionActive = false;
    this.entityManager.add(this.ship, 'ship');
    this.mode = 'playing';
    this.paused = false;
    this._resetSimSpeedUnlessDev();
    this._hangarSeq = null;

    // Live hangar behind the station (LOD by distance) so visitors land/leave in space
    syncHangarSidePadFromLayout(null);
    this._bindPlayerVessel(this.ship);
    this.hangarBay.reset(this.ship, {
      playerBayIndex: this.playerBayIndex,
      placeId: placeRegistry.activePlaceId,
    });
    this.hangarBay.warmStartHeadless();
    this.hangarBay.clearControlledPadAfterLaunch();
    this.hangarBay.preferExternalDoorTraffic = true;
    this._hangarLive = true;
    this._hangarLodAccum = 0;

    this.ambientTraffic.reset();
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

  /**
   * Home Base hangar (Jennings Station bay).
   * @param {{ landing?: boolean, fromMenu?: boolean, entryAngle?: number|null, entryTurret?: number|null, targetBay?: number|null }} [opts]
   *   targetBay — choose-your-bay lane (0–2); required for space landings
   */
  beginHangar({
    landing = false,
    fromMenu = false,
    entryAngle = null,
    entryTurret = null,
    targetBay = null,
  } = {}) {
    this.camera.rotation = 0;
    this._spaceCam.x = this.camera.position.x;
    this._spaceCam.y = this.camera.position.y;
    this.input.consumeZoomDelta();

    // Keep the live controlled hull across space → hangar (no starter reload)
    const carried = this.ship;
    const carriedDef = carried?.shipDef ? cloneShipDef(carried.shipDef) : null;

    this.entityManager.clear();
    this.particleSystem.clear();
    this.precisionActive = false;
    this.speedStreaks = new SpeedStreaks();
    this._exitBurn = false;
    this._exitBurnFailsafe = 0;
    this._approachHoldAI = null;

    syncHangarSidePadFromLayout(null);

    const bayFromLane =
      targetBay != null && Number.isFinite(targetBay)
        ? ((targetBay | 0) + 3) % 3
        : null;

    if (!this._hangarLive || fromMenu) {
      // Fresh hangar (title Home Base / first enter)
      this.playerBayIndex =
        bayFromLane != null ? bayFromLane : ((Math.random() * 3) | 0);
      this._dockPos.x = hangarPadX(this.playerBayIndex);
      this._dockPos.y = 0;
      this.ship = new Ship(this._dockPos.x, this._dockPos.y);
      if (carriedDef) this.ship.shipDef = carriedDef;
      else this._applyPendingBlueprint(this.ship);
      this._bindPlayerVessel(this.ship);
      this.hangarBay.reset(this.ship, {
        playerBayIndex: this.playerBayIndex,
        placeId: placeRegistry.activePlaceId,
      });
      this.hangarBay.warmStartHeadless();
      this._hangarLive = true;
    } else {
      // Returning from space — hangar already running; seat on chosen green bay
      const prefer =
        bayFromLane != null ? bayFromLane : this.playerBayIndex;
      this.ship =
        carried ||
        new Ship(hangarPadX(prefer), 0);
      if (carriedDef && this.ship) this.ship.shipDef = carriedDef;
      this._bindPlayerVessel(this.ship);
      const seated = this.hangarBay.claimEmptyBayForControlled(
        prefer,
        this.ship
      );
      if (!seated) {
        // Hold should have prevented this; fall back to any green
        const signals = this.hangarBay.getBaySignals();
        const free = signals.findIndex((s) => s === 'green');
        if (free >= 0) {
          this.hangarBay.claimEmptyBayForControlled(free, this.ship);
        }
      }
      this.playerBayIndex = this.hangarBay.getPlayerBayIndex();
    }

    this._dockPos.x = hangarPadX(this.playerBayIndex);
    this._dockPos.y = 0;
    this.ship.position.set(this._dockPos.x, this._dockPos.y);
    this.entityManager.add(this.ship, 'ship');
    this._dockLocked = true;
    this._hangarSeq = null;
    this._hangarHover = 0;
    this.hangarControlTarget = { kind: 'player' };
    this._hangarSelectPress = null;
    this.hangarBay.setDevControlBay(this.playerBayIndex);
    this.hangarBay.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
    // Inside hangar: door fills play locally (not as space approaches)
    this.hangarBay.preferExternalDoorTraffic = false;

    this.resetHangarCameraToDock();

    this.mode = 'hangar';
    this.paused = false;
    this._resetSimSpeedUnlessDev();
    this._setTitleFade(1);
    this.canvas.style.opacity = '1';
    this.input.enable();
    this.input.hangarPanEnabled = true;
    this.input.paused = false;

    if (this._hangarHud) this._hangarHud.classList.remove('hidden');
    if (this._buildStamp) this._buildStamp.classList.add('hidden');
    this._setDockHud(false);
    this._positionLaunchBtn();

    if (landing) {
      // Headless runway prep may have opened doors / started doorArrive — never
      // skip the on-screen land cinematic (that caused instant pad settle).
      this.hangarBay.abortPlayerSpaceApproachForLanding();
      this._startLandingSequence(entryAngle, entryTurret);
    } else if (fromMenu) {
      this._startElevatorArrivalSequence();
    } else {
      this._setLaunchBtnVisible(true);
    }
  }

  /** Leave hangar and restore the title screen loop. */
  exitHangar() {
    if (this.mode !== 'hangar') return;
    if (this._hangarSeq) return;
    this.input.hangarPanEnabled = false;
    this.input.disable();
    this.input.consumeZoomDelta();
    this.hangarBay.clearOps();
    this.mode = 'title';
    this.paused = false;
    this._titleHasDrawn = true;
    this._enterTitleSim({ fadeIn: false });
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
    this._enterTitleSim({ fadeIn: false });
    return 'title';
  }

  /**
   * Dev blueprint mode — instant modular ship sandbox.
   * @param {'title'|'hangar'} [returnTo]
   */
  beginBlueprint(returnTo = 'title') {
    this._blueprintReturn = returnTo === 'hangar' ? 'hangar' : 'title';
    this._savedCam = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      userZoom: this.camera.userZoom,
      targetUserZoom: this.camera.targetUserZoom,
      speedZoom: this.camera.speedZoom,
      effectiveZoom: this.camera.effectiveZoom,
    };

    this._blueprint = new BlueprintSandbox();
    if (this.ship?.shipDef) {
      this._blueprint.syncFromDef(this.ship.shipDef);
      this._sandboxShip = new Ship(0, 0);
      this._sandboxShip.shipDef = cloneShipDef(this.ship.shipDef);
    } else {
      this._sandboxShip = new Ship(0, 0);
      this._sandboxShip.shipDef = this._blueprint.resetStarter();
    }
    this._sandboxShip.angle = this._blueprint.shipAngle();
    this._sandboxShip.turretAngle = this._sandboxShip.angle;
    this._sandboxShip.velocity.set(0, 0);
    this._sandboxShip.angularVelocity = 0;

    this.mode = 'blueprint';
    this.input.enable();
    this.input.paused = false;
    this.renderer.setLayoutMode('blueprint');
    this.camera.position.set(0, 0);
    this.camera.offset.set(0, 0);
    const z = BLUEPRINT.ZOOM_DEFAULT;
    this.camera.userZoom = z;
    this.camera.targetUserZoom = z;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = z;
    this._setTitleFade(1);
    this.canvas.style.opacity = '1';
    if (this._blueprintHud) this._blueprintHud.classList.remove('hidden');
    if (this._controlsHud) this._controlsHud.classList.add('hidden');
    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    this._setLaunchBtnVisible(false);
    this._setDockHud(false);
    if (typeof this.onBlueprintEnter === 'function') this.onBlueprintEnter();
  }

  /** Rebuild sandbox ship from current blueprint selectors. */
  blueprintApplySpec(rebuildFn) {
    if (!this._blueprint || !this._sandboxShip) return null;
    const def = rebuildFn.call(this._blueprint);
    this._sandboxShip.shipDef = def;
    this._sandboxShip.angle = this._blueprint.shipAngle();
    this._sandboxShip.turretAngle = this._sandboxShip.angle;
    return this._blueprint;
  }

  getBlueprint() {
    return this._blueprint;
  }

  /** Copy current blueprint onto the live player ship (hangar / next flight). */
  applyBlueprintToPlayer() {
    if (!this._blueprint || !this._sandboxShip?.shipDef) return false;
    const def = cloneShipDef(this._sandboxShip.shipDef);
    if (this.ship) {
      this.ship.shipDef = def;
      this._bindPlayerVessel(this.ship);
      return true;
    }
    // Cache for next hangar / play session
    this._pendingBlueprintDef = def;
    return true;
  }

  /**
   * Attach vessel sim state + interior Place graph (Mk2+).
   * @param {import('../entities/Ship.js').Ship|null} ship
   */
  _bindPlayerVessel(ship) {
    if (!ship) return;
    ship.isPlayerManned = true;
    ensureVesselSimState(ship);
    if (shipHasInterior(ship.shipDef, ship)) {
      const vp = placeRegistry.ensureVesselPlace('player');
      this.interiorPlaceId = vp.id;
      ship.interiorPlaceId = vp.id;
    } else {
      ship.interiorPlaceId = null;
    }
  }

  canEnterPlayerInterior() {
    return canEnterInterior(this.ship, { isPlayerManned: true });
  }

  /**
   * Enter Mk2+ vessel interior from space, hangar, or unseat (walker stub).
   * @returns {boolean}
   */
  enterPlayerInterior(opts = {}) {
    if (!this.canEnterPlayerInterior()) return false;
    const place = placeRegistry.ensureVesselPlace('player');
    this.interiorActive = true;
    this.interiorPlaceId = place.id;
    placeRegistry.interiorMode = 'shipInterior';
    placeRegistry.setActive(place.id, opts.areaId || 'area.bridge-access');
    DevTools.status = `Interior: ${place.label} (${opts.areaId || 'bridge'})`;
    return true;
  }

  exitPlayerInterior() {
    this.interiorActive = false;
    placeRegistry.interiorMode = 'none';
    // Restore hangar/station place focus when leaving vessel interior
    if (this.mode === 'hangar' || this._hangarLive) {
      placeRegistry.setActive(
        this.hangarBay.placeId || 'place.jennings',
        this.hangarBay.areaId || null
      );
    }
    return true;
  }

  /** Unseat captain — Mk2+ → interior; Mk1 → exterior stub. */
  unseatCaptain() {
    const route = unseatCaptainRoute(this.ship, { isPlayerManned: true });
    if (route === 'shipInterior') return this.enterPlayerInterior();
    DevTools.status = 'Unseat → exterior (Mk1 / no interior)';
    return false;
  }

  /**
   * Dev / future walker: interact with a vessel feature (hull/fuel/ammo bindings).
   */
  interactVesselFeature(areaId, featureId, opts = {}) {
    const place = placeRegistry.ensureVesselPlace('player');
    return interactFeature(place, areaId, featureId, this.ship, opts);
  }

  /** Record a space hull scar (interior heal ceiling drops). */
  scarPlayerHull() {
    if (!this.ship) return;
    applyHullScar(this.ship);
  }

  /** Switch active Place preset and rebuild hangar if live. */
  applyPlacePreset(placeId) {
    const place = placeRegistry.applyPreset(placeId);
    if (!place) return false;
    if (this.mode === 'hangar' || this._hangarLive) {
      this.hangarBay.reset(this.ship, {
        playerBayIndex: this.playerBayIndex,
        placeId: place.id,
      });
      if (this.mode === 'hangar') this.hangarBay.warmStartHeadless();
    }
    DevTools.status = `Place: ${place.label}`;
    return true;
  }

  exitBlueprint() {
    if (this.mode !== 'blueprint') return null;
    this._sandboxShip = null;
    this._blueprint = null;
    if (this._blueprintHud) this._blueprintHud.classList.add('hidden');
    this.renderer.setLayoutMode('default');
    const ret = this._blueprintReturn;

    if (ret === 'hangar') {
      this.mode = 'hangar';
      this.input.enable();
      this.input.paused = false;
      if (this._savedCam) {
        this.camera.position.set(this._savedCam.x, this._savedCam.y);
        this.camera.userZoom = this._savedCam.userZoom;
        this.camera.targetUserZoom = this._savedCam.targetUserZoom;
        this.camera.speedZoom = this._savedCam.speedZoom;
        this.camera.effectiveZoom = this._savedCam.effectiveZoom;
        this.camera.offset.set(0, 0);
      }
      if (this._hangarHud) this._hangarHud.classList.remove('hidden');
      this._setLaunchBtnVisible(true);
      return 'hangar';
    }

    this.input.disable();
    this.mode = 'title';
    this.paused = false;
    this._titleHasDrawn = true;
    this._enterTitleSim({ fadeIn: false });
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
    this.input.consumeZoomDelta();
    this.hangarBay.clearOps();
    this._hangarSeq = null;
    this.mode = 'title';
    this._titleHasDrawn = true;
    this._enterTitleSim({ fadeIn: false });
  }

  _clearPlaySession() {
    this.entityManager.clear();
    this.particleSystem.clear();
    this.ship = null;
    this.precisionActive = false;
    this.speedStreaks = new SpeedStreaks();
    this._exitBurn = false;
    this._exitBurnFailsafe = 0;
    this._approachHoldAI = null;
    this._hangarLodAccum = 0;
  }

  /**
   * World positions of real human pilots (local player today; multiplayer later).
   * NPCs / ambient must not wake the hangar LOD.
   * @returns {{ x: number, y: number }[]}
   */
  _humanPilotPositions() {
    const out = [];
    if (this.ship?.position && this.mode === 'playing') {
      out.push({ x: this.ship.position.x, y: this.ship.position.y });
    }
    return out;
  }

  /** Distance from station center to the closest human pilot (∞ if none). */
  _closestHumanDistToStation() {
    const humans = this._humanPilotPositions();
    if (!humans.length) return Infinity;
    const sx = this.station.x;
    const sy = this.station.y;
    let best = Infinity;
    for (const h of humans) {
      const d = Math.hypot(h.x - sx, h.y - sy);
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * Hangar sim tick rate from distance LOD: 1 at/inside FULL, 0 at/beyond PAUSE.
   * @param {number} dist
   */
  _hangarLodRateForDist(dist) {
    const full = STATION.HANGAR_LOD_FULL_DIST;
    const pause = STATION.HANGAR_LOD_PAUSE_DIST;
    if (!(dist < Infinity)) return 0;
    if (dist <= full) return 1;
    if (dist >= pause) return 0;
    const u = (dist - full) / Math.max(1e-6, pause - full);
    return clamp(1 - u, 0, 1);
  }

  /**
   * Space-only: tick live hangar at a distance-scaled rate (pause when far).
   * Hangar mode always runs at full rate elsewhere.
   */
  _tickHangarLiveLod(deltaTime) {
    if (!this._hangarLive) return;

    const rate = this._hangarLodRateForDist(this._closestHumanDistToStation());
    this.hangarBay.spaceTrafficActive = rate > 0;
    if (rate <= 0) {
      // Frozen — keep last pad/door/crew state for lights when you return
      this._hangarLodAccum = 0;
      return;
    }

    if (rate >= 0.999) {
      this.hangarBay.update(deltaTime, null, {});
      this._hangarLodAccum = 0;
      return;
    }

    // Slow band: accumulate sim time; fewer/heavier updates as rate drops
    this._hangarLodAccum += deltaTime * rate;
    const maxStep = 0.05;
    while (this._hangarLodAccum >= 1 / 120) {
      const step = Math.min(this._hangarLodAccum, maxStep);
      this.hangarBay.update(step, null, {});
      this._hangarLodAccum -= step;
    }
  }

  /** True when captain is commanding thrusters / engine / brake / yaw. */
  _playerWantsFlightControl() {
    const f = this.input.getFlightInput();
    return !!(
      f.forward ||
      f.reverse ||
      f.left ||
      f.right ||
      f.yawLeft ||
      f.yawRight ||
      f.mainEngine ||
      f.afterburner ||
      f.brake ||
      f.forwardBurst ||
      f.reverseBurst ||
      f.leftBurst ||
      f.rightBurst ||
      f.yawLeftBurst ||
      f.yawRightBurst
    );
  }

  _engageHoldingPattern() {
    if (!this.ship || this._approachHoldAI) return;
    this._approachHoldAI = { phase: 'hold', t: 0, targetLane: null };
    this._clearShipThrusters(this.ship);
    const corners = holdRacetrackCorners(this.station, AMBIENT);
    initHoldLeg(this.ship, corners);
  }

  _releaseHoldingPattern() {
    this._approachHoldAI = null;
  }

  /**
   * AI racetrack hold north of the runway until a green bay opens, then
   * thruster-approach that lane and dock. Captain movement input cancels.
   */
  _tickApproachHoldAI(dt) {
    const ai = this._approachHoldAI;
    const ship = this.ship;
    if (!ai || !ship) return;

    if (this._playerWantsFlightControl()) {
      this._releaseHoldingPattern();
      return;
    }

    const station = this.station;
    const signals = this._hangarLive
      ? this.hangarBay.getBaySignals()
      : station._padOccupancy || station.baySignals;
    station.setBaySignals(signals);
    const greens = [0, 1, 2].filter((i) => station.padAvailable(i, ship));

    ai.t += dt;

    if (ai.phase === 'hold') {
      // Never stay in hold while a pad is open
      if (greens.length) {
        let best = greens[0];
        let bestD = Infinity;
        for (const g of greens) {
          const d = Math.abs(ship.position.x - station.laneCenterWorldX(g));
          if (d < bestD) {
            bestD = d;
            best = g;
          }
        }
        ai.targetLane = best;
        ai.phase = 'approach';
        ai.t = 0;
      } else {
        const corners = holdRacetrackCorners(station, AMBIENT);
        if (ship.holdLeg == null) initHoldLeg(ship, corners);
        followWaypointRing(ship, corners, AMBIENT.HOLD_CRUISE_SPEED, dt, {
          legKey: 'holdLeg',
          reverse: !!ship.holdReverse,
          arrivalR: AMBIENT.HOLD_ARRIVAL_R,
          speedBand: AMBIENT.COAST_SPEED_BAND,
          headingTol: AMBIENT.COAST_HEADING_TOL,
        });
        return;
      }
    }

    // approach — commit into the chosen green lane (thruster cruise)
    let lane = ai.targetLane ?? greens[0];
    if (lane == null || !station.padAvailable(lane, ship)) {
      if (greens.length) {
        lane = greens[0];
        let bestD = Infinity;
        for (const g of greens) {
          const d = Math.abs(ship.position.x - station.laneCenterWorldX(g));
          if (d < bestD) {
            bestD = d;
            lane = g;
          }
        }
        ai.targetLane = lane;
      } else {
        ai.phase = 'hold';
        ai.targetLane = null;
        const corners = holdRacetrackCorners(station, AMBIENT);
        initHoldLeg(ship, corners);
        followWaypointRing(ship, corners, AMBIENT.HOLD_CRUISE_SPEED, dt, {
          legKey: 'holdLeg',
          reverse: !!ship.holdReverse,
          arrivalR: AMBIENT.HOLD_ARRIVAL_R,
          speedBand: AMBIENT.COAST_SPEED_BAND,
          headingTol: AMBIENT.COAST_HEADING_TOL,
        });
        return;
      }
    }

    const tx = station.laneCenterWorldX(lane);
    const nearMouth =
      Math.hypot(ship.position.x - tx, ship.position.y - station.stripeWorldY()) <
      STATION.DOCK_RADIUS * 0.9;
    const targetY = nearMouth
      ? station.stripeWorldY() + STATION.SCALE * 20
      : station.furthestApproachLightY() + STATION.SCALE * 15;
    const approachSpd = Math.min(STATION.DOCK_MAX_SPEED * 0.8, 95);
    cruiseTo(ship, tx, targetY, approachSpd, dt, {
      arrivalR: 40,
      brakeForArrival: true,
      yawMult: nearMouth ? 1.35 : 1.15,
      speedBand: AMBIENT.COAST_SPEED_BAND,
      headingTol: nearMouth ? 0.35 : AMBIENT.COAST_HEADING_TOL,
    });
    const speed = ship.velocity.length();
    if (station.shouldAutoIngress(ship, speed)) {
      this._releaseHoldingPattern();
      this.requestDock({ force: true });
    }
  }

  /** Hangar→space / quick-launch: plume until outer runway lights (failsafe cap). */
  _beginExitBurn() {
    this._exitBurn = true;
    this._exitBurnFailsafe = STATION.EXIT_BURN_MAX_SEC;
    if (this.ship) this.ship.exitBurn = true;
  }

  _applyPendingBlueprint(ship) {
    if (!ship || !this._pendingBlueprintDef) return;
    ship.shipDef = cloneShipDef(this._pendingBlueprintDef);
    this._pendingBlueprintDef = null;
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
    // Dev hijack: launch whichever pad ship the pilot seat selected
    const ctrl = this.hangarControlTarget;
    if (ctrl?.kind === 'visitor' && Number.isFinite(ctrl.bayIndex)) {
      this._adoptPadShipForLaunch(ctrl.bayIndex);
    }
    this._startLaunchSequence();
  }

  /** Move pilot seat onto a pad hull (Dev) and make it the controlled ship. */
  _adoptPadShipForLaunch(bayIndex) {
    const pad = this.hangarBay.sidePads?.find((p) => p.bayIndex === bayIndex);
    if (!pad?.shipDef || !this.ship) return;
    this.ship.shipDef = cloneShipDef(pad.shipDef);
    this.hangarBay.claimEmptyBayForControlled(bayIndex, this.ship, {
      force: true,
    });
    this.playerBayIndex = this.hangarBay.getPlayerBayIndex();
    this._dockPos.x = hangarPadX(this.playerBayIndex);
    this._dockPos.y = 0;
    this.ship.position.set(this._dockPos.x, this._dockPos.y);
    this.hangarControlTarget = { kind: 'player' };
    this.hangarBay.setDevControlBay(this.playerBayIndex);
    // claimEmptyBay clears arrivalPending — hold service/scan until after launch
    this.hangarBay.playerArrivalPending = true;
    if (this.hangarBay.playerBay) {
      this.hangarBay.playerBay.service = null;
      this.hangarBay.playerBay.shipState = null;
    }
  }

  /**
   * @param {{ force?: boolean }} [opts] force — skip Enter-ready circle (auto-ingress at sill)
   */
  requestDock(opts = {}) {
    if (this.mode !== 'playing' || this.paused || !this.ship) return;
    if (this._approachHoldAI) return; // AI already working the approach
    const speed = this.ship.velocity.length();
    if (this._hangarLive) {
      this.station.setBaySignals(this.hangarBay.getBaySignals());
    }
    // Station full → Enter/Click engages AI holding pattern (then land when open)
    if (this.station.allBaysBlocked(this.ship)) {
      if (this.station.inApproach(this.ship.position.x, this.ship.position.y)) {
        this._engageHoldingPattern();
      }
      return;
    }
    if (!opts.force) {
      if (!this.station.canRequestDock(this.ship.position.x, this.ship.position.y, speed)) {
        return;
      }
    } else if (!this.station.isSafeDockSpeed(speed)) {
      return;
    }
    const edge = this.station.ingressEdgeWorld(this.ship);
    const lane = this.station.laneIndexFromWorldX(edge.x);
    if (!this.station.padAvailable(lane, this.ship)) return;
    const entryAngle = this.ship.angle;
    const entryTurret = this.ship.turretAngle;
    this.beginHangar({
      landing: true,
      entryAngle,
      entryTurret,
      targetBay: lane,
    });
    if (typeof this.onEnterHangar === 'function') this.onEnterHangar();
  }

  _startLaunchSequence() {
    this._hangarSeq = { kind: 'launch', phase: 'warn', t: 0 };
    this._hangarSeqZoomPlayer = false;
    this._dockLocked = true;
    this._hangarHover = 0;
    this._setLaunchBtnVisible(false);
    // Keep dock X in sync with live pad centers (B1/B3 after sidePad edits)
    this._dockPos.x = hangarPadX(this.playerBayIndex);
    this._dockPos.y = 0;
    // Pad must stay "occupied" through lift so plume paths stay live
    this.hangarBay.playerPadOccupied = true;
    // No board reveal / scan during exit (esp. Dev hijack adopt)
    this.hangarBay.playerArrivalPending = true;
    if (this.hangarBay.playerBay) {
      this.hangarBay.playerBay.service = null;
      this.hangarBay.playerBay.shipState = null;
    }
    this.hangarBay.beginOps(this.playerBayIndex, 'departing');
    this.hangarBay.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
    this.camera.setHangarAnchor(this._dockPos.x, this._dockPos.y);
    this._applyHangarSeqZoom(HANGAR.ZOOM_LAUNCH);
  }

  _startLandingSequence(entryAngle = FACE_SOUTH, entryTurret = null) {
    const startAngle = Number.isFinite(entryAngle) ? entryAngle : FACE_SOUTH;
    const startTurret = Number.isFinite(entryTurret) ? entryTurret : startAngle;
    this._hangarSeq = { kind: 'land', phase: 'align', t: 0 };
    this._hangarSeqZoomPlayer = false;
    this._dockLocked = false;
    this._hangarHover = 1;
    this._setLaunchBtnVisible(false);
    this._dockPos.x = hangarPadX(this.playerBayIndex);
    this._dockPos.y = 0;
    this.ship.position.set(this._dockPos.x, HANGAR.LAND_START_Y);
    this.ship.velocity.set(0, HANGAR.LAND_APPROACH_SPEED);
    this.ship.angle = startAngle;
    this.ship.turretAngle = startTurret;
    this.ship.angularVelocity = 0;
    this.ship.visualScale = HANGAR.HOVER_SCALE;
    // Hold captain checklist / deck work until the full land settle finishes
    this.hangarBay.playerArrivalPending = true;
    // abortPlayerSpaceApproach clears occupied — restore so the land hull draws
    this.hangarBay.playerPadOccupied = true;
    if (this.hangarBay.playerBay) {
      this.hangarBay.playerBay.visitorId = 'player';
      this.hangarBay.playerBay.service = null;
      this.hangarBay.playerBay.shipState = null;
    }
    this.hangarBay.beginOps(this.playerBayIndex, 'incoming');
    this.hangarBay.setDoorOpen(this.playerBayIndex, 1);
    this.hangarBay.setBeacon(this.playerBayIndex, 'open');
    // Pad waits facing south for the settle; ship yaws onto it
    this.hangarBay.setPlayerPadAngle(FACE_SOUTH);
    this._applyHangarSeqZoom(HANGAR.ZOOM_LAUNCH, { immediate: true });
    this.camera.position.set(this.ship.position.x, this.ship.position.y * 0.5);
  }

  /** Title Home Base: ship was stored below the player bay — rise on pad before service begins. */
  _startElevatorArrivalSequence() {
    this._hangarSeq = { kind: 'elevate', phase: 'below', t: 0 };
    this._hangarSeqZoomPlayer = false;
    this._dockLocked = true;
    this._hangarHover = 0;
    this._setLaunchBtnVisible(false);
    this.hangarBay.playerArrivalPending = true;
    this.hangarBay.playerPadDrop = 1;
    this.hangarBay.beginOps(this.playerBayIndex, 'elevator');
    this.hangarBay.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
    this.ship.position.set(this._dockPos.x, this._dockPos.y);
    this.ship.velocity.set(0, 0);
    this.ship.angle = SHIP.SPAWN_ANGLE;
    this.ship.turretAngle = SHIP.SPAWN_ANGLE;
    this.ship.angularVelocity = 0;
    this.ship.visualScale = 1;
    this._applyHangarSeqZoom(this._hangarElevatorZoom(), { immediate: true });
  }

  _finishElevatorArrival() {
    this._hangarSeq = null;
    this._dockLocked = true;
    this._hangarHover = 0;
    this.hangarBay.playerPadDrop = 0;
    this.hangarBay.playerArrivalPending = false;
    this.ship.position.set(this._dockPos.x, this._dockPos.y);
    this.ship.velocity.set(0, 0);
    this.ship.angle = SHIP.SPAWN_ANGLE;
    this.ship.turretAngle = SHIP.SPAWN_ANGLE;
    this.ship.visualScale = 1;
    this._clearShipThrusters(this.ship);
    this.hangarBay.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
    this.hangarBay.clearOps(this.playerBayIndex);
    this.camera.setHangarAnchor(this._dockPos.x, this._dockPos.y);
    // Don't yank zoom if the player took it during the sequence
    if (!this._hangarSeqZoomPlayer) {
      this._setHangarZoomImmediate(this._hangarDefaultZoom());
    }
    this._hangarSeqZoomPlayer = false;
    this._setLaunchBtnVisible(true);
  }

  _finishLaunchToSpace() {
    const ship = this.ship;
    if (!ship) return;

    const launchBay = this.playerBayIndex;
    const spawn = this.station.getExitSpawn(launchBay);
    // Hangar thrust is north (−Y). Emerge from the open bay mouth with a
    // clear outbound push so the handoff reads as leaving the station.
    const hangarSpeed = Math.abs(ship.velocity?.y || 0);
    const speed = clamp(Math.max(hangarSpeed, 180), 180, 280);
    const nose = Number.isFinite(spawn.angle) ? spawn.angle : SHIP.SPAWN_ANGLE;
    const exitVel = Vec2.fromAngle(nose, speed);

    this.hangarBay.clearOps(launchBay);
    this.hangarBay.clearControlledPadAfterLaunch();
    this.hangarBay.preferExternalDoorTraffic = true;
    this._hangarLive = true;
    this._hangarLodAccum = 0;
    this._hangarSeq = null;
    this._hangarSeqZoomPlayer = false;
    this._hangarHover = 0;
    this._dockLocked = true;
    this.entityManager.clear();
    this.particleSystem.clear();
    // Relocate the live ship (keep loadout) — don't respawn a fresh hull
    ship.position.set(spawn.x, spawn.y);
    ship.velocity.set(exitVel.x, exitVel.y);
    ship.angle = nose;
    ship.turretAngle = nose;
    ship.angularVelocity = 0;
    ship.visualScale = 1;
    this._clearShipThrusters(ship);
    ship.thrusters.mainEngine = 1;
    ship.exitBurn = true;
    this._beginExitBurn();
    this.ship = ship;
    this.entityManager.add(ship, 'ship');

    this.input.hangarPanEnabled = false;
    this.mode = 'playing';
    this._resetSimSpeedUnlessDev();
    // Keep ambient; hangar stays live so pad lights / AI traffic persist
    if (!this.ambientTraffic.ships?.length) this.ambientTraffic.reset();
    this.camera.position.set(spawn.x, spawn.y);
    this.camera.offset.set(0, 0);
    this.camera.targetOffset.set(0, 0);
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
    this.hangarBay.clearOps(this.playerBayIndex);
    this.hangarBay.playerPadOccupied = true;
    if (this.hangarBay.playerBay) {
      this.hangarBay.playerBay.visitorId = 'player';
    }
    // Services / checklist roll only after the full land settle
    this.hangarBay.playerArrivalPending = false;
    this.camera.setHangarAnchor(this._dockPos.x, this._dockPos.y);
    if (!this._hangarSeqZoomPlayer) {
      this._setHangarZoomImmediate(this._hangarDefaultZoom());
    }
    this._hangarSeqZoomPlayer = false;
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

  /** Bay whose door shows LAUNCH — selected pad ship, else the seated pilot bay. */
  _launchButtonBayIndex() {
    const ctrl = this.hangarControlTarget;
    if (ctrl?.kind === 'visitor' && Number.isFinite(ctrl.bayIndex)) {
      return ((ctrl.bayIndex | 0) + 3) % 3;
    }
    return this.playerBayIndex;
  }

  _positionLaunchBtn() {
    if (!this._hangarLaunchBtn || this.mode !== 'hangar') return;
    if (this._hangarLaunchBtn.classList.contains('hidden')) return;
    const anchor = this.hangarBay.getBayDoorAnchor(this._launchButtonBayIndex());
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

    this._updateFps(timestamp);

    const rawDt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
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
    } else if (this.mode === 'blueprint' && this.input.consumePauseToggle()) {
      const dest = this.exitBlueprint();
      if (typeof this.onBlueprintExit === 'function') this.onBlueprintExit(dest);
    }

    const speed = this.simSpeed;
    // Title always ticks (sim-speed pause must not leave a hangar zoom stuck on the backdrop).
    if (this.mode === 'title') {
      const deltaTime = Math.min(rawDt, 0.05);
      this._lastFrameDt = deltaTime;
      this.gameTime += deltaTime;
      this._updateTitle(deltaTime);
    } else if (!this.paused && speed > 0) {
      const deltaTime = Math.min(rawDt * speed, 0.05 * Math.max(1, speed));
      this.gameTime += deltaTime;
      if (this.mode === 'hangar') {
        this._updateHangar(deltaTime);
      } else if (this.mode === 'controls') {
        this._updateControls(deltaTime);
      } else if (this.mode === 'blueprint') {
        this._updateBlueprint(deltaTime);
      } else {
        this.update(deltaTime);
      }
    } else if (this.paused || speed <= 0) {
      // Menu pause or sim-speed pause — keep HUD/readouts, freeze sim.
      // Hangar layout edit freezes crew via simSpeed 0 but still needs pointer + camera.
      if (this.mode === 'hangar' && HangarLayoutEditor.isActive()) {
        this._tickHangarEditFrozen(rawDt);
      } else if (this.ship && this.mode === 'playing') {
        this._updateHUD();
      }
    }

    this.render();
    if (this.mode === 'hangar') this._positionLaunchBtn();
    requestAnimationFrame((t) => this._loop(t));
  }

  /** Snap hangar free-look back to the player pad (edit pan/zoom are session-only). */
  resetHangarCameraToDock() {
    const x = this._dockPos?.x ?? hangarPadX(this.playerBayIndex ?? 1);
    const y = this._dockPos?.y ?? 0;
    this.camera.setHangarAnchor(x, y);
    const hangarZoom = this._hangarDefaultZoom();
    this.camera.userZoom = hangarZoom;
    this.camera.targetUserZoom = hangarZoom;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = hangarZoom;
    if (this._hudHangarZoom) {
      this._hudHangarZoom.textContent = this.camera.effectiveZoom.toFixed(1);
    }
  }

  _updateTitle(deltaTime) {
    this._applyTitleCamera(this.gameTime);
    this._spaceCam.x = this.camera.position.x;
    this._spaceCam.y = this.camera.position.y;

    this.asteroidSystem.update(this.camera.position.x, this.camera.position.y);
    const asteroids = this.asteroidSystem.getActiveAsteroids();

    // Keep hangar + ambient alive so bay traffic flies the runway
    if (this._hangarLive) {
      this.hangarBay.preferExternalDoorTraffic = true;
      this.hangarBay.spaceTrafficActive = true;
      this.hangarBay.update(deltaTime, null, {});
      this.station.setBaySignals(this.hangarBay.getBaySignals());
    }

    this.ambientTraffic.update(deltaTime, {
      player: null,
      station: this.station,
      hangarBay: this._hangarLive ? this.hangarBay : null,
      asteroids,
      particles: this.particleSystem,
      camera: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        // Tight interest bubble so traffic seeds near Jennings (not deep space)
        viewRadius: TITLE_LAYOUT.trafficViewRadius,
      },
    });

    const reserveEntries = [];
    for (const a of this.ambientTraffic.ships || []) {
      if (a.state !== 'bayApproach' && a.state !== 'bayIngress') continue;
      const pose = this.ambientTraffic.asStationPose?.(a) || {
        position: { x: a.x, y: a.y },
        angle: a.angle,
        velocity: { x: a.vx, y: a.vy },
        id: a.id,
        shipDef: a.shipDef,
      };
      reserveEntries.push({
        ship: pose,
        speed: Math.hypot(a.vx || 0, a.vy || 0),
        shipDef: a.shipDef,
        isPlayer: false,
        visitorId: a.classId || a.visitorId || 'hauler',
      });
    }
    this.station.refreshLaneReservations(reserveEntries);
    if (this._hangarLive) {
      const claims = this.station.getLaneReservationClaims().map((c) => ({
        ...c,
        playerShip: null,
      }));
      this.hangarBay.syncSpaceApproachReservations(claims);
    }

    this.particleSystem.update(deltaTime);

    // Keep a runway approach ship in the vignette when the mouth is free
    const hasApproach = (this.ambientTraffic.ships || []).some(
      (s) =>
        s.state === 'bayApproach' ||
        s.state === 'bayIngress' ||
        s.state === 'bayInbound'
    );
    if (!hasApproach && Math.random() < deltaTime * 0.12) {
      this.ambientTraffic.spawnBayApproach(
        this.station,
        (Math.random() * 3) | 0,
        null,
        this.station.x,
        this.station.y + 800,
        { runwayLocal: true }
      );
    }

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

    const editing = HangarLayoutEditor.isActive();
    const seqLock = !!this._hangarSeq;
    // LMB drag pans (empty space in edit); LMB also fires when a ship is selected.
    // While dragging a layout item, pan is suppressed. Enter/exit sequences lock pan
    // (but still allow scroll zoom).
    this.input.hangarPanEnabled =
      !seqLock && (!editing || !HangarLayoutEditor.drag);
    const zoomWheel = this.input.consumeZoomDelta();
    // Scroll during a sequence = player takes zoom; stop cinematic zoom overrides
    if (seqLock && Math.abs(zoomWheel) > 0) {
      this._hangarSeqZoomPlayer = true;
    }
    this.precisionActive = false;

    if (editing) {
      this._tickHangarLayoutEditor();
      if (HangarLayoutEditor.drag) this.input.cancelHangarPan();
      this.ship.position.x = this._dockPos.x;
      this.ship.position.y = this._dockPos.y;
      this.ship.velocity.set(0, 0);
      this.ship.angularVelocity = 0;
      this.ship.angle = this.hangarBay.playerPadAngle ?? SHIP.SPAWN_ANGLE;
      this._clearShipThrusters(this.ship);
    } else if (this._hangarSeq) {
      this._updateHangarSequence(deltaTime);
      // Launch handoff switches mode mid-tick — don't keep running hangar sim.
      if (this.mode !== 'hangar') return;
    } else {
      this._updateHangarIdleControl(deltaTime);
    }

    if (seqLock) this.input.cancelHangarPan();
    const panDelta =
      seqLock || (editing && HangarLayoutEditor.drag)
        ? { x: 0, y: 0 }
        : this.input.consumePanDelta();

    this.entityManager.update(deltaTime);
    this.particleSystem.update(deltaTime);

    if (!editing) {
      const ctrl = this.hangarControlTarget;
      const playerLive =
        ctrl?.kind === 'player' && this.hangarBay.isPlayerPadOccupied();
      const visitorLive = ctrl?.kind === 'visitor' && !!this._hangarPuppet;
      const weaponShip = playerLive
        ? this.ship
        : visitorLive
          ? this._hangarPuppet
          : null;
      const firedTurret = !!(weaponShip && weaponShip.muzzleFlash > 0.02);
      const laserOn = !!(weaponShip && weaponShip.miningLaserFiring);
      let muzzleX;
      let muzzleY;
      if (weaponShip && (firedTurret || laserOn)) {
        const tip = firedTurret
          ? weaponShip.getTurretMuzzle()
          : weaponShip.getMiningLaserOrigin();
        muzzleX = tip.x;
        muzzleY = tip.y;
      }
      this.hangarBay.update(deltaTime, this.ship, {
        firedTurret,
        laserOn,
        muzzleX,
        muzzleY,
      });

      // Dev door/elev owns pose via playerFlight. Launch/land/elevate
      // sequences write ship.position directly — do not snap them back to the pad.
      if (!this._hangarSeq) {
        this._syncPlayerHangarPose();
      }

      // Keep player plumes cold unless this ship is live, in a Dev scene, or
      // mid launch/land/elevate (seq owns thruster cues — never wipe those).
      if (
        !this._hangarSeq &&
        !playerLive &&
        !this.hangarBay.isPlayerDevSceneActive()
      ) {
        this._clearShipThrusters(this.ship);
        this.ship.miningLaserFiring = false;
        this.ship.muzzleFlash = 0;
      }

      if (!this._hangarSeq && weaponShip) {
        this.hangarBay.applyWeaponHits(
          weaponShip,
          [...this.entityManager.getByType('projectile')],
          deltaTime
        );
        // Visitor draw reads pad state — sync laser beam length after hits
        if (visitorLive && ctrl?.kind === 'visitor') {
          const pad = this.hangarBay._sidePadForBay?.(ctrl.bayIndex);
          if (pad) {
            pad.miningLaserBeamLength = weaponShip.miningLaserBeamLength;
            pad.muzzleFlash = weaponShip.muzzleFlash;
            pad.turretRecoil = weaponShip.turretRecoil;
          }
        }
      }
    }

    const zoomLim = this._hangarZoomLimits();
    this.camera.updateHangar(deltaTime, zoomWheel, panDelta, zoomLim.min, zoomLim.max);
    // Follow the player through launch/land/elevator; free-look resumes on settle.
    if (seqLock && this.ship) {
      this.camera.setHangarAnchor(this.ship.position.x, this.ship.position.y);
    }
    if (!editing) this._emitHangarThrusterParticles();
    this._syncHangarDevControlPad();

    if (this._hudHangarZoom) {
      this._hudHangarZoom.textContent = this.camera.effectiveZoom.toFixed(1);
    }
  }

  /** Idle hangar: Dev ship select + control player or visitor thrusters. */
  _updateHangarIdleControl(deltaTime) {
    const aimWorld = this._mouseWorld();
    const dev = Settings.isDevMode();
    const sceneBusy = this.hangarBay.isPlayerDevSceneActive();

    if (dev && !sceneBusy) {
      const over = this.hangarBay.pickShipAt(aimWorld.x, aimWorld.y);
      if (this.input.mouseDown && over && !this.input.isPanDragging() && !this._hangarSelectPress) {
        this._hangarSelectPress = { ...over };
      }
      if (this.input.consumeClick()) {
        if (this._hangarSelectPress && !this.input.wasPanDrag()) {
          this._toggleHangarControl(this._hangarSelectPress);
        }
        this._hangarSelectPress = null;
      }
      if (!this.input.mouseDown) this._hangarSelectPress = null;
    } else {
      this.input.consumeClick();
      this._hangarSelectPress = null;
      if (!dev) this.hangarControlTarget = { kind: 'player' };
    }

    // While a Dev door/elev scene runs, HangarBay owns thruster cues
    if (sceneBusy) {
      this._syncPlayerHangarPose();
      return;
    }

    const ctrl = this.hangarControlTarget;
    const blockFire = !!this._hangarSelectPress;

    if (ctrl?.kind === 'player' && this.hangarBay.isPlayerPadOccupied()) {
      // Lock pose before controller so residual velocity cannot light brakes
      this.ship.position.x = this._dockPos.x;
      this.ship.position.y = this._dockPos.y;
      this.ship.velocity.set(0, 0);
      this.ship.angularVelocity = 0;
      this.ship.angle = this.hangarBay.playerPadAngle ?? SHIP.SPAWN_ANGLE;
      this.shipController.update(this.ship, this.input, false, deltaTime);
      this.ship.position.x = this._dockPos.x;
      this.ship.position.y = this._dockPos.y;
      this.ship.velocity.set(0, 0);
      this.ship.angularVelocity = 0;
      this.ship.angle = this.hangarBay.playerPadAngle ?? SHIP.SPAWN_ANGLE;
      const savedDown = this.input.mouseDown;
      if (blockFire) this.input.mouseDown = false;
      this.weaponSystem.update(this.ship, this.input, aimWorld, true, [], deltaTime);
      this.input.mouseDown = savedDown;
      this._applyHangarHoverVisual(0);
    } else if (ctrl?.kind === 'visitor') {
      this._clearShipThrusters(this.ship);
      this.ship.miningLaserFiring = false;
      this.ship.muzzleFlash = 0;
      this._controlHangarVisitor(ctrl.bayIndex, deltaTime, aimWorld, blockFire);
      this.ship.position.x = this._dockPos.x;
      this.ship.position.y = this._dockPos.y;
      this.ship.velocity.set(0, 0);
      this.ship.angularVelocity = 0;
      this.ship.angle = this.hangarBay.playerPadAngle ?? SHIP.SPAWN_ANGLE;
      this._applyHangarHoverVisual(0);
    } else {
      // Unselected — no control; mute player FX
      this._clearShipThrusters(this.ship);
      this.ship.miningLaserFiring = false;
      this.ship.muzzleFlash = 0;
      this.ship.position.x = this._dockPos.x;
      this.ship.position.y = this._dockPos.y;
      this.ship.velocity.set(0, 0);
      this.ship.angularVelocity = 0;
      this.ship.angle = this.hangarBay.playerPadAngle ?? SHIP.SPAWN_ANGLE;
      this._applyHangarHoverVisual(0);
    }
  }

  _toggleHangarControl(hit) {
    if (!hit) return;
    const cur = this.hangarControlTarget;
    const same =
      cur &&
      cur.kind === hit.kind &&
      (hit.kind === 'player' || cur.bayIndex === hit.bayIndex);
    // Drop primary (no-attachId) ship-local exhaust on retarget
    this.particleSystem.clearShipSpace(null);
    if (cur?.kind === 'visitor') this._muteHangarVisitorWeapons(cur.bayIndex);
    if (same) {
      this.hangarControlTarget = null;
      this._clearShipThrusters(this.ship);
      this.ship.miningLaserFiring = false;
      this.ship.muzzleFlash = 0;
    } else {
      this.hangarControlTarget = { ...hit };
      if (hit.kind !== 'player') {
        this._clearShipThrusters(this.ship);
        this.ship.miningLaserFiring = false;
        this.ship.muzzleFlash = 0;
      }
    }
  }

  _muteHangarVisitorWeapons(bayIndex) {
    const pad = this.hangarBay._sidePadForBay?.(bayIndex);
    if (!pad) return;
    pad.miningLaserFiring = false;
    pad.muzzleFlash = 0;
    if (pad.thrusters) {
      for (const key of Object.keys(pad.thrusters)) {
        if (typeof pad.thrusters[key] === 'number') pad.thrusters[key] = 0;
      }
      pad.thrusters.retroBurn = false;
    }
  }

  _controlHangarVisitor(bayIndex, deltaTime, aimWorld, blockFire) {
    const pad = this.hangarBay._sidePadForBay?.(bayIndex);
    if (!pad?.visitorId || pad.seq) {
      this._muteHangarVisitorWeapons(bayIndex);
      this.hangarControlTarget = null;
      return;
    }
    const def = pad.shipDef || this.hangarBay._ensurePadShipDef?.(pad);
    if (!def) return;
    // Pad thrusters stay visitor-scoped (only mounted keys). Never alias player.
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(def);

    if (!this._hangarPuppet) this._hangarPuppet = new Ship(pad.x, pad.shipY || 0);
    const puppet = this._hangarPuppet;
    // Puppet keeps its own full thruster bag for ShipController; we copy
    // results onto pad.thrusters afterward so the player ship cannot share state.
    if (!puppet._visitorControlBag) {
      puppet.thrusters = {
        aftPort: 0,
        aftStarboard: 0,
        nosePort: 0,
        noseStarboard: 0,
        portFore: 0,
        portAft: 0,
        starboardFore: 0,
        starboardAft: 0,
        mainEngine: 0,
        afterburner: 0,
        retroBurn: false,
      };
      puppet._visitorControlBag = true;
    }
    puppet.shipDef = def;
    const hullAngle = pad.shipAngle ?? SHIP.SPAWN_ANGLE;
    puppet.angle = hullAngle;
    if (typeof pad.turretAngle !== 'number') pad.turretAngle = hullAngle;
    if (typeof pad.miningLaserRelAngle !== 'number') pad.miningLaserRelAngle = 0;
    puppet.turretAngle = pad.turretAngle;
    puppet.miningLaserRelAngle = pad.miningLaserRelAngle;
    puppet.fireCooldown = pad.fireCooldown || 0;
    puppet.muzzleFlash = pad.muzzleFlash || 0;
    puppet.turretRecoil = pad.turretRecoil || 0;
    puppet.miningLaserFiring = false;
    puppet.position.set(pad.x, pad.shipY || 0);
    puppet.velocity.set(0, 0);
    puppet.angularVelocity = 0;

    this.shipController.update(puppet, this.input, false, deltaTime);
    puppet.position.set(pad.x, pad.shipY || 0);
    puppet.velocity.set(0, 0);
    puppet.angularVelocity = 0;

    const savedDown = this.input.mouseDown;
    if (blockFire) this.input.mouseDown = false;
    this.weaponSystem.update(puppet, this.input, aimWorld, true, [], deltaTime);
    this.input.mouseDown = savedDown;
    puppet.update(deltaTime);

    // Copy only keys the visitor actually mounts (+ engine)
    for (const key of Object.keys(pad.thrusters)) {
      if (typeof pad.thrusters[key] === 'number') pad.thrusters[key] = 0;
    }
    pad.thrusters.retroBurn = false;
    for (const key of Object.keys(pad.thrusters)) {
      if (typeof puppet.thrusters[key] === 'number') {
        pad.thrusters[key] = puppet.thrusters[key];
      }
    }
    if (puppet.thrusters.retroBurn) pad.thrusters.retroBurn = true;

    pad.shipAngle = puppet.angle;
    pad.turretAngle = puppet.turretAngle;
    pad.miningLaserRelAngle = puppet.miningLaserRelAngle;
    pad.miningLaserFiring = !!puppet.miningLaserFiring;
    pad.miningLaserBeamLength = puppet.miningLaserBeamLength;
    pad.muzzleFlash = puppet.muzzleFlash;
    pad.turretRecoil = puppet.turretRecoil;
    pad.fireCooldown = puppet.fireCooldown;

    puppet.position.set(pad.x, pad.shipY || 0);
    puppet.velocity.set(0, 0);
    puppet.angularVelocity = 0;

    // Player hull must stay cold while piloting a visitor
    this._clearShipThrusters(this.ship);
  }

  /** Apply Dev door/elev flight offsets onto the live player ship pose. */
  _syncPlayerHangarPose() {
    const hb = this.hangarBay;
    const f = hb.playerFlight || {};
    const angle = f.shipAngle ?? hb.playerPadAngle ?? SHIP.SPAWN_ANGLE;
    this.ship.position.x = this._dockPos.x;
    this.ship.position.y = this._dockPos.y + (f.shipY || 0);
    this.ship.velocity.set(0, 0);
    this.ship.angularVelocity = 0;
    this.ship.angle = angle;
    // WeaponSystem owns mouse aim while selected; lock to hull only for Dev scenes
    if (hb.isPlayerDevSceneActive()) this.ship.turretAngle = angle;
    if (f.shipScale != null && f.shipScale > 0) {
      this.ship.visualScale = f.shipScale;
      this._hangarHover = f.shipHover || 0;
    } else {
      this._applyHangarHoverVisual(f.shipHover || 0);
    }
  }

  /**
   * Pose map for multi-hull ship-local exhaust (ambient + hangar visitors).
   * Primary/controlled ship uses attachId null and the `ship` arg to renderParticles.
   */
  _exhaustHullPoses() {
    /** @type {Record<string, { x: number, y: number, angle: number }>} */
    const hulls = Object.create(null);
    for (const s of this.ambientTraffic?.ships || []) {
      hulls[`a${s.id}`] = {
        x: s.x,
        y: s.y,
        angle: s.angle ?? 0,
      };
    }
    if (this.state === 'hangar') {
      for (const pad of this.hangarBay?.sidePads || []) {
        if (!pad?.visitorId || pad.bayIndex == null) continue;
        hulls[`v${pad.bayIndex}`] = {
          x: pad.x,
          y: pad.shipY || 0,
          angle: pad.shipAngle ?? SHIP.SPAWN_ANGLE,
        };
      }
    }
    return hulls;
  }

  _emitHangarThrusterParticles() {
    const sceneBusy = this.hangarBay.isPlayerDevSceneActive();
    const playerLive =
      this.hangarControlTarget?.kind === 'player' &&
      this.hangarBay.isPlayerPadOccupied();
    const seqCue =
      !!this._hangarSeq &&
      (this._hangarSeq.phase === 'lift' ||
        this._hangarSeq.phase === 'thrust' ||
        this._hangarSeq.phase === 'lower' ||
        this._hangarSeq.phase === 'approach');

    if (
      seqCue ||
      (sceneBusy && this.hangarBay.isPlayerShipVisible()) ||
      playerLive
    ) {
      this.renderer.emitThrusterParticles(this.ship, this.particleSystem);
    }

    // Hangar visitors — same ship-local exhaust as the player (per-hull attachId)
    for (const pad of this.hangarBay.sidePads || []) {
      if (!pad?.visitorId || !pad.shipDef || !pad.thrusters) continue;
      const shipLike = {
        shipDef: pad.shipDef,
        thrusters: pad.thrusters,
        position: { x: pad.x, y: pad.shipY || 0 },
        angle: pad.shipAngle ?? SHIP.SPAWN_ANGLE,
        velocity: { x: pad.shipVx || 0, y: pad.shipVy || 0 },
        angularVelocity: 0,
      };
      this.renderer.emitThrusterParticles(shipLike, this.particleSystem, {
        attachId: `v${pad.bayIndex}`,
      });
    }
  }

  _tickHangarLayoutEditor() {
    const w = this._mouseWorld();
    if (!this._hangarEditPointer) this._hangarEditPointer = { down: false };
    const down = this.input.mouseDown;
    if (down && !this._hangarEditPointer.down) {
      HangarLayoutEditor.onPointerDown(w.x, w.y);
    } else if (down && this._hangarEditPointer.down) {
      HangarLayoutEditor.onPointerMove(w.x, w.y);
    } else if (!down && this._hangarEditPointer.down) {
      HangarLayoutEditor.onPointerUp();
    }
    this._hangarEditPointer.down = down;
  }

  /**
   * Layout edit while simSpeed is 0 — pointer + camera; crew/bay sim stay frozen.
   * @param {number} [rawDt]
   */
  _tickHangarEditFrozen(rawDt = 1 / 60) {
    this.input.hangarPanEnabled = !HangarLayoutEditor.drag;
    const zoomWheel = this.input.consumeZoomDelta();
    this._tickHangarLayoutEditor();
    if (HangarLayoutEditor.drag) this.input.cancelHangarPan();
    const panDelta = HangarLayoutEditor.drag
      ? { x: 0, y: 0 }
      : this.input.consumePanDelta();
    const zoomLim = this._hangarZoomLimits();
    this.camera.updateHangar(
      Math.max(rawDt, 1 / 120),
      zoomWheel,
      panDelta,
      zoomLim.min,
      zoomLim.max
    );
    if (this.ship && this._dockPos) {
      this.ship.position.x = this._dockPos.x;
      this.ship.position.y = this._dockPos.y;
      this.ship.velocity.set(0, 0);
      this.ship.angularVelocity = 0;
    }
    if (this._hudHangarZoom) {
      this._hudHangarZoom.textContent = this.camera.effectiveZoom.toFixed(1);
    }
    this._syncHangarDevControlPad();
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

  _hangarDefaultZoom() {
    return hangarDefaultZoom(this.renderer.viewportRadius);
  }

  _hangarElevatorZoom() {
    return hangarElevatorZoom(this.renderer.viewportRadius);
  }

  _hangarZoomLimits() {
    const r = this.renderer.viewportRadius;
    return { min: hangarZoomMin(r), max: hangarZoomMax(r) };
  }

  _setHangarZoomImmediate(zoom) {
    const { min, max } = this._hangarZoomLimits();
    const z = clamp(zoom, min, max);
    this.camera.userZoom = z;
    this.camera.targetUserZoom = z;
    this.camera.effectiveZoom = z;
  }

  /**
   * Cinematic sequence zoom — no-op once the player scrolls during the sequence.
   * @param {number} zoom
   * @param {{ immediate?: boolean }} [opts]
   */
  _applyHangarSeqZoom(zoom, opts = {}) {
    if (this._hangarSeqZoomPlayer) return;
    if (opts.immediate) this._setHangarZoomImmediate(zoom);
    else this.camera.targetUserZoom = zoom;
  }

  /** Landing settle: wide launch zoom → board-framed default (lower → doors). */
  _landSettleZoomProgress(settleT) {
    if (this._hangarSeqZoomPlayer) return;
    const def = this._hangarDefaultZoom();
    const dur = HANGAR.HOVER_LIFT_TIME + HANGAR.PAD_TURN_TIME + 1.5;
    const u = this._smoothstep(settleT / dur);
    this.camera.targetUserZoom =
      HANGAR.ZOOM_LAUNCH + (def - HANGAR.ZOOM_LAUNCH) * u;
  }

  _updateHangarSequence(dt) {
    const s = this._hangarSeq;
    if (!s || !this.ship) return;
    s.t += dt;
    this._clearShipThrusters(this.ship);
    this.input.mouseDown = false;
    this.input.mouseRightDown = false;

    if (s.kind === 'launch') this._tickLaunch(s, dt);
    else if (s.kind === 'elevate') this._tickElevate(s, dt);
    else this._tickLand(s, dt);
  }

  _tickLaunch(s, dt) {
    const ship = this.ship;
    switch (s.phase) {
      case 'warn':
        this.hangarBay.tickEvac(this.playerBayIndex);
        if (s.t > 1.4) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this.hangarBay.tickEvac(this.playerBayIndex);
        if (this.hangarBay.isBayDangerClear(this.playerBayIndex) || s.t > 3.5) {
          s.phase = 'doors';
          s.t = 0;
          this.hangarBay.setBeacon(this.playerBayIndex, 'open');
        }
        break;
      case 'doors':
        this.hangarBay.setDoorOpen(this.playerBayIndex, Math.min(1, s.t / 1.6));
        if (s.t > 1.75) {
          s.phase = 'lift';
          s.t = 0;
        }
        break;
      case 'lift': {
        // Full-duration 8-thruster burst while the hull rises off the pad
        const u = this._smoothstep(s.t / HANGAR.HOVER_LIFT_TIME);
        const burst =
          s.t < HANGAR.HOVER_LIFT_TIME * 0.72
            ? HANGAR.HOVER_BURST_POWER
            : HANGAR.HOVER_BURST_POWER *
              Math.max(
                0,
                1 - (s.t - HANGAR.HOVER_LIFT_TIME * 0.72) / (HANGAR.HOVER_LIFT_TIME * 0.28)
              );
        if (burst > 0.02) this._fireManeuverBurst(ship, burst);
        this._applyHangarHoverVisual(u);
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
        ship.angle = SHIP.SPAWN_ANGLE;
        ship.angularVelocity = 0;
        const forward = Vec2.fromAngle(ship.angle);
        const force = forward.scale(PHYSICS.MAIN_ENGINE_THRUST * ship.thrusters.mainEngine);
        this.physics.applyForce(ship, force, dt);
        this.physics.integrate(ship, dt);
        // Stay on the departure bay centerline while exiting through the doors
        ship.position.x = this._dockPos.x;
        ship.velocity.x = 0;
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

  _tickElevate(s, dt) {
    const hb = this.hangarBay;
    const ship = this.ship;
    const elevZ = this._hangarElevatorZoom();
    switch (s.phase) {
      case 'below':
        hb.tickEvac(this.playerBayIndex);
        hb.playerPadDrop = 1;
        ship.position.set(this._dockPos.x, this._dockPos.y);
        ship.velocity.set(0, 0);
        ship.angle = SHIP.SPAWN_ANGLE;
        this.camera.setHangarAnchor(this._dockPos.x, this._dockPos.y);
        this._applyHangarSeqZoom(elevZ);
        if (s.t >= HANGAR.PLAYER_ELEVATOR_BELOW_TIME) {
          s.phase = 'rise';
          s.t = 0;
        }
        break;
      case 'rise': {
        hb.tickEvac(this.playerBayIndex);
        const u = this._smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        hb.playerPadDrop = 1 - u;
        hb.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
        ship.position.set(this._dockPos.x, this._dockPos.y);
        ship.velocity.set(0, 0);
        ship.angle = SHIP.SPAWN_ANGLE;
        this.camera.setHangarAnchor(this._dockPos.x, this._dockPos.y);
        this._applyHangarSeqZoom(elevZ, { immediate: true });
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          hb.playerPadDrop = 0;
          s.phase = 'settleZoom';
          s.t = 0;
        }
        break;
      }
      case 'settleZoom': {
        hb.playerPadDrop = 0;
        hb.setPlayerPadAngle(SHIP.SPAWN_ANGLE);
        ship.position.set(this._dockPos.x, this._dockPos.y);
        ship.velocity.set(0, 0);
        ship.angle = SHIP.SPAWN_ANGLE;
        this.camera.setHangarAnchor(this._dockPos.x, this._dockPos.y);
        if (!this._hangarSeqZoomPlayer) {
          const def = this._hangarDefaultZoom();
          const u = this._smoothstep(s.t / HANGAR.PLAYER_ELEVATOR_ZOOM_TIME);
          const zoom = elevZ + (def - elevZ) * u;
          this._setHangarZoomImmediate(zoom);
        }
        if (s.t >= HANGAR.PLAYER_ELEVATOR_ZOOM_TIME) {
          this._finishElevatorArrival();
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
        ship.position.x += (this._dockPos.x - ship.position.x) * Math.min(1, dt * 2.5);
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
        this._applyHangarSeqZoom(HANGAR.ZOOM_LAUNCH);

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
        this._applyHangarSeqZoom(HANGAR.ZOOM_LAUNCH);
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
        const liftT = HANGAR.HOVER_LIFT_TIME;
        const burst =
          s.t < liftT * 0.72
            ? HANGAR.HOVER_BURST_POWER
            : HANGAR.HOVER_BURST_POWER *
              Math.max(0, 1 - (s.t - liftT * 0.72) / (liftT * 0.28));
        if (burst > 0.02) this._fireManeuverBurst(ship, burst);
        this._applyHangarHoverVisual(1 - this._smoothstep(s.t / liftT));
        ship.position.x = this._dockPos.x;
        ship.position.y = this._dockPos.y;
        ship.velocity.set(0, 0);
        ship.angle = FACE_SOUTH;
        ship.angularVelocity = 0;
        this.hangarBay.setPlayerPadAngle(FACE_SOUTH);
        this._landSettleZoomProgress(s.t);
        if (s.t >= HANGAR.HOVER_LIFT_TIME) {
          this._applyHangarHoverVisual(0);
          s.phase = 'turn';
          s.t = 0;
        }
        break;
      }
      case 'turn': {
        // Pad turntable + ship: south → north (180°) — rim stays on for pad motion
        this.hangarBay.setPadRim(this.playerBayIndex, 'on');
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
        this._landSettleZoomProgress(HANGAR.HOVER_LIFT_TIME + s.t);
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
        this._landSettleZoomProgress(
          HANGAR.HOVER_LIFT_TIME + HANGAR.PAD_TURN_TIME + s.t
        );
        this.hangarBay.setDoorOpen(this.playerBayIndex, Math.max(0, 1 - s.t / 1.4));
        if (s.t > 0.35) this.hangarBay.setBeacon(this.playerBayIndex, 'warning');
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
    this.precisionActive = this.input.capsLockDesired;

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

  _updateBlueprint(deltaTime) {
    const ship = this._sandboxShip;
    const bp = this._blueprint;
    if (!ship || !bp) return;

    const authoring = Settings.isDevMode() && blueprintAuthoring.syncEnabled();
    let zoomWheel = this.input.consumeZoomDelta();
    if (authoring && DevTools.selectedMount && Math.abs(zoomWheel) > 0) {
      blueprintAuthoring.rotateSelected(this, Math.sign(zoomWheel) * 0.08);
      zoomWheel = 0;
    }

    if (authoring) {
      this._tickBlueprintAuthoring();
    }

    if (bp.liveControls && !(authoring && blueprintAuthoring.dragging)) {
      // Hangar-style: thruster / engine / weapon FX from ShipController.
      // Position locked at origin (no flight). Yaw is allowed so BP can rotate.
      // Auto-spin is cleared when live controls turn on — do not re-apply here.
      this.precisionActive = false;
      this.shipController.update(ship, this.input, false, deltaTime);
      ship.position.set(0, 0);
      ship.velocity.set(0, 0);

      const aimWorld = this.camera.screenToWorld(
        this.input.mouseScreen.x,
        this.input.mouseScreen.y,
        this.renderer.centerX,
        this.renderer.centerY
      );
      this.weaponSystem.update(ship, this.input, aimWorld, true, [], deltaTime);
      this.entityManager.update(deltaTime);
      this.particleSystem.update(deltaTime);
      this.renderer.emitThrusterParticles(ship, this.particleSystem);
    } else {
      // Inspect mode: Q/E yaw + optional auto-spin; no thruster / weapon sim.
      let yaw = 0;
      if (this.input.isKeyDown('q')) yaw -= 1.6 * deltaTime;
      if (this.input.isKeyDown('e')) yaw += 1.6 * deltaTime;
      if (bp.autoSpin) yaw += bp.spinRadPerSec * deltaTime;
      if (yaw !== 0) {
        ship.angle += yaw;
      } else {
        ship.angle = bp.shipAngle();
      }
      ship.turretAngle = ship.angle;
      ship.position.set(0, 0);
      ship.velocity.set(0, 0);
      ship.angularVelocity = 0;
      this._clearShipThrusters(ship);
    }

    const prevHeading = bp.headingIndex;
    bp.syncHeadingFromAngle(ship.angle);
    if (bp.headingIndex !== prevHeading) {
      if (typeof this.onBlueprintHeadingChange === 'function') {
        this.onBlueprintHeadingChange();
      }
    }

    this.camera.position.set(0, 0);
    this.camera.offset.set(0, 0);
    this.camera.updateBlueprint(ship.position, deltaTime, zoomWheel);
  }

  _tickBlueprintAuthoring() {
    const w = this._mouseWorld();
    if (!this._bpAuthorPointer) this._bpAuthorPointer = { down: false };
    const down = this.input.mouseDown;
    if (down && !this._bpAuthorPointer.down) {
      blueprintAuthoring.onPointerDown(this, w.x, w.y);
    } else if (down && this._bpAuthorPointer.down) {
      blueprintAuthoring.onPointerMove(this, w.x, w.y);
    } else if (!down && this._bpAuthorPointer.down) {
      blueprintAuthoring.onPointerUp();
    }
    this._bpAuthorPointer.down = down;
  }

  update(deltaTime) {
    if (!this.ship) return;

    const zoomWheel = this.input.consumeZoomDelta();
    // Full SCAN: wheel steps one pip-ring of scope zoom (camera zoom unchanged).
    let camZoomWheel = zoomWheel;
    if (this.scanView === 'scan' && zoomWheel !== 0) {
      this.scannerSystem.stepPlotZoom(zoomWheel);
      camZoomWheel = 0;
    }

    this.asteroidSystem.update(this.ship.position.x, this.ship.position.y);

    // Caps Lock LED edge sets the desire; the MODES switch can also flip it.
    const capsLED = this.input.capsLockDesired;
    if (capsLED !== this._prevCapsLED) {
      this.precisionDesired = capsLED;
      this._prevCapsLED = capsLED;
    }
    this.precisionActive = this.precisionDesired;

    const dx = this.input.mouseScreen.x - this.renderer.centerX;
    const dy = this.input.mouseScreen.y - this.renderer.centerY;
    // In SCAN view the disc is a radar scope, not the world — don't let the
    // pointer aim/fire weapons blind through it.
    const pointerInViewport =
      this.scanView !== 'scan' &&
      dx * dx + dy * dy <= this.renderer.viewportRadius * this.renderer.viewportRadius;

    const aimWorld = this.camera.screenToWorld(
      this.input.mouseScreen.x,
      this.input.mouseScreen.y,
      this.renderer.centerX,
      this.renderer.centerY
    );

    this._ensureShipStatus();
    this._processCockpitClicks();

    // Cockpit MODES keybinds: R flips ORIENT (ship/north), V flips VIEW (ship/scan).
    if (this.input.consumeTap('r')) this.toggleViewMode();
    if (this.input.consumeTap('v')) this.toggleScanView();

    // AI holding pattern owns thrusters until the captain moves
    if (this._approachHoldAI) {
      this._tickApproachHoldAI(deltaTime);
      if (this._approachHoldAI) {
        // Still AI-controlled — skip player ShipController this frame
      } else if (this.ship) {
        this.shipController.update(
          this.ship,
          this.input,
          this.precisionActive,
          deltaTime
        );
      }
    } else {
      this.shipController.update(this.ship, this.input, this.precisionActive, deltaTime);
    }
    // Hangar→space: hold main-engine plume until near the outer approach lights
    if (this._exitBurn) {
      this._exitBurnFailsafe = Math.max(0, this._exitBurnFailsafe - deltaTime);
      this.ship.thrusters.mainEngine = Math.max(this.ship.thrusters.mainEngine || 0, 1);
      this.ship.exitBurn = true;
      if (
        this.station.isExitBurnFinished(this.ship) ||
        this._exitBurnFailsafe <= 0
      ) {
        this._exitBurn = false;
        this.ship.exitBurn = false;
      }
    }
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

    // Crew-driven vessel interior sim (background while flying)
    if (this.ship?.interiorPlaceId) {
      const vPlace = placeRegistry.get(this.ship.interiorPlaceId);
      if (vPlace) tickVesselInteriorCrew(this.ship, vPlace, deltaTime);
    }

    this.entityManager.update(deltaTime);
    this.particleSystem.update(deltaTime);

    this._applyViewRotation();
    this.camera.update(
      this.ship.position,
      this.ship.velocity,
      deltaTime,
      this.renderer.viewportRadius,
      camZoomWheel
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

    // Hangar sim LOD: full near station → slow with distance → pause far out
    if (this._hangarLive) {
      this.hangarBay.preferExternalDoorTraffic = true;
    }
    this._tickHangarLiveLod(deltaTime);
    const baySignals = this._hangarLive
      ? this.hangarBay.getBaySignals()
      : ['green', 'green', 'green'];
    // Exit burn: departing light follows the lane the ship is actually in
    if (this._exitBurn && this.ship?.position) {
      const lane = this.station.laneIndexFromWorldX(this.ship.position.x);
      this.playerBayIndex = lane;
      baySignals[lane] = 'departing';
    }
    this.station.setBaySignals(baySignals);

    const zoom = Math.max(0.001, this.camera.effectiveZoom);
    this.ambientTraffic.update(deltaTime, {
      player: this.ship,
      station: this.station,
      hangarBay: this._hangarLive ? this.hangarBay : null,
      asteroids: asteroids,
      particles: this.particleSystem,
      camera: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        // World-space radius of the circular play viewport
        viewRadius: this.renderer.viewportRadius / zoom,
      },
    });

    // Runway at safe speed + in a pad lane → reserve (pulse-green) + hangar arrive
    const reserveEntries = [];
    if (this.ship) {
      reserveEntries.push({
        ship: this.ship,
        speed: speedAfter,
        shipDef: this.ship.shipDef,
        isPlayer: true,
      });
    }
    for (const a of this.ambientTraffic.ships || []) {
      if (a.state !== 'bayApproach' && a.state !== 'bayIngress') continue;
      const pose = this.ambientTraffic.asStationPose?.(a) || {
        position: { x: a.x, y: a.y },
        angle: a.angle,
        velocity: { x: a.vx, y: a.vy },
        id: a.id,
        shipDef: a.shipDef,
      };
      reserveEntries.push({
        ship: pose,
        speed: Math.hypot(a.vx || 0, a.vy || 0),
        shipDef: a.shipDef,
        isPlayer: false,
        visitorId: a.classId || a.visitorId || 'hauler',
      });
    }
    this.station.refreshLaneReservations(reserveEntries);
    if (this._hangarLive) {
      const claims = this.station.getLaneReservationClaims().map((c) => ({
        ...c,
        playerShip: c.isPlayer ? this.ship : null,
      }));
      this.hangarBay.syncSpaceApproachReservations(claims);
    }

    this._updateHUD();

    const stationFull = this.station.allBaysBlocked(this.ship);
    const canDock =
      !stationFull &&
      this.station.canRequestDock(
        this.ship.position.x,
        this.ship.position.y,
        speedAfter
      ) &&
      this.station.padAvailable(
        this.station.laneIndexFromWorldX(
          this.station.ingressEdgeWorld(this.ship).x
        ),
        this.ship
      );
    const near = this.station.inApproach(this.ship.position.x, this.ship.position.y);
    const canEngageHold = stationFull && near && !this._approachHoldAI;
    this.station.updateApproachLights(this.ship, speedAfter);
    this._setDockHud(near || !!this._approachHoldAI);
    if (this._dockHud) {
      this._dockHud.classList.toggle('ready', canDock || canEngageHold);
      if (this._approachHoldAI) {
        this._dockHud.textContent =
          'HOLDING PATTERN · MOVE TO RESUME CONTROL';
      } else if (canEngageHold) {
        this._dockHud.textContent =
          'ENTER / CLICK — ENGAGE HOLDING PATTERN';
      } else if (canDock) {
        this._dockHud.textContent = 'ENTER / CLICK — DOCK IN GREEN BAY';
      } else if (stationFull) {
        this._dockHud.textContent = 'STATION FULL — APPROACH TO HOLD';
      } else {
        this._dockHud.textContent =
          'FOLLOW APPROACH LIGHTS · LAND ON A GREEN PAD';
      }
    }
    // Hull-edge past caution sill into a green lane (not while AI is holding)
    if (!this._approachHoldAI && this.station.shouldAutoIngress(this.ship, speedAfter)) {
      this.requestDock({ force: true });
    }
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
    if (this.camera.rotation) this.renderer.ctx.rotate(this.camera.rotation);

    this.nebulaField.paintAmbient(
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

  /** Fullscreen Jennings space vignette used by the title screen. */
  _renderTitleWorld() {
    const baySignals = this.station.baySignals;
    const ambientOccluded = [];
    const ambientClear = [];
    for (const a of this.ambientTraffic.ships || []) {
      const pose = this.ambientTraffic.asStationPose?.(a) || {
        position: { x: a.x, y: a.y },
        angle: a.angle,
        velocity: { x: a.vx, y: a.vy },
        shipDef: a.shipDef,
        id: a.id,
      };
      const spd = Math.hypot(a.vx || 0, a.vy || 0);
      if (this.station.shouldOccludeShip(pose, spd)) ambientOccluded.push(a);
      else ambientClear.push(a);
    }
    const anyOccluded = ambientOccluded.length > 0;

    this.renderer.renderWorldLayer((ctx) => {
      this.station.render(ctx, {
        time: this.gameTime,
        ship: null,
        speed: 0,
        baySignals,
        layer: anyOccluded ? 'under' : 'all',
      });
    }, this.camera);

    this.renderer.renderAsteroids(
      this.asteroidSystem.getActiveAsteroids(),
      this.camera
    );

    this.renderer.renderWorldLayer((ctx) => {
      this.ambientTraffic.render(ctx, { only: ambientOccluded });
    }, this.camera);

    const exhaustHulls = this._exhaustHullPoses();
    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      null,
      { layer: 'under', hulls: exhaustHulls }
    );

    if (anyOccluded) {
      this.renderer.renderWorldLayer((ctx) => {
        this.station.render(ctx, {
          time: this.gameTime,
          ship: null,
          speed: 0,
          baySignals,
          layer: 'over',
        });
      }, this.camera);
    }

    this.renderer.renderWorldLayer((ctx) => {
      this.ambientTraffic.render(ctx, { only: ambientClear });
    }, this.camera);

    this.renderer.renderWorldLayer((ctx) => {
      this.station.render(ctx, {
        time: this.gameTime,
        ship: null,
        speed: 0,
        baySignals,
        layer: 'bayBeacons',
      });
    }, this.camera);

    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      null,
      { layer: 'over', hulls: exhaustHulls }
    );
  }

  /** Live sim backdrop + optional DoF blur; bokeh orbs; wordmark/ship stay sharp. */
  _blitTitleDofBackdrop() {
    const blurAmt = Math.max(0, TITLE_LAYOUT.dofBlur ?? 0);
    const ctx = this.renderer.ctx;
    const w = this.renderer.width;
    const h = this.renderer.height;

    const paintSharp = () => {
      this.renderer.beginFrame();
      this._renderBackground({ fullscreen: true, includeWorldNebulae: true });
      this._renderTitleWorld();
    };

    // Blur 0 → sharp full-res direct to screen
    if (blurAmt <= 0.05) {
      paintSharp();
      this._drawTitleBokeh(ctx, this.gameTime);
      ctx.fillStyle = 'rgba(0,4,12,0.18)';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    this._ensureTitleDof();
    if (
      !this._titleDofCtx ||
      !this._titleDofLoCtx ||
      !this._titleDofBlurCtx
    ) {
      paintSharp();
      this._drawTitleBokeh(ctx, this.gameTime);
      ctx.fillStyle = 'rgba(0,4,12,0.18)';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    // Capture at full resolution (same centers/zoom as sharp path — station stays)
    const prevCtx = this.renderer.ctx;
    this.renderer.ctx = this._titleDofCtx;
    try {
      paintSharp();
    } finally {
      this.renderer.ctx = prevCtx;
    }

    const scale = this._titleDofScale || TITLE_DOF_RES;
    const dw = this._titleDofLo.width;
    const dh = this._titleDofLo.height;
    const blur = Math.max(0.5, blurAmt * scale);

    const lo = this._titleDofLoCtx;
    lo.setTransform(1, 0, 0, 1, 0, 0);
    lo.imageSmoothingEnabled = true;
    if (lo.imageSmoothingQuality) lo.imageSmoothingQuality = 'high';
    lo.fillStyle = '#000';
    lo.fillRect(0, 0, dw, dh);
    lo.drawImage(this._titleDof, 0, 0, dw, dh);

    const bctx = this._titleDofBlurCtx;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.imageSmoothingEnabled = true;
    if (bctx.imageSmoothingQuality) bctx.imageSmoothingQuality = 'high';
    bctx.fillStyle = '#000';
    bctx.fillRect(0, 0, dw, dh);
    bctx.save();
    bctx.filter = `blur(${blur.toFixed(2)}px)`;
    bctx.drawImage(this._titleDofLo, 0, 0);
    bctx.filter = 'none';
    bctx.restore();

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this._titleDofBlur, 0, 0, dw, dh, 0, 0, w, h);

    this._drawTitleBokeh(ctx, this.gameTime);

    // Slight darken so the sharp showcase ship / wordmark read on top
    ctx.fillStyle = 'rgba(0,4,12,0.18)';
    ctx.fillRect(0, 0, w, h);
  }

  render() {
    if (this.mode === 'title') {
      this._blitTitleDofBackdrop();
      {
        const spacer = document.getElementById('title-art-spacer');
        const r = spacer?.getBoundingClientRect?.();
        const rect = r
          ? { x: r.left, y: r.top, width: r.width, height: r.height }
          : null;
        this.titleScreen.render(
          this.renderer.ctx,
          rect,
          this.gameTime,
          this._lastFrameDt
        );
      }
      this._titleHasDrawn = true;
      return;
    }

    this.renderer.beginFrame();

    if (this.mode === 'hangar') {
      this._renderHangar();
      return;
    }

    if (this.mode === 'controls') {
      this._renderControls();
      return;
    }

    if (this.mode === 'blueprint') {
      this._renderBlueprint();
      return;
    }

    this.renderer.setupCircularClip();
    if (this.scanView === 'scan') this._renderScanBackdrop();
    else this._renderPlayWorld();
    this.renderer.endCircularClip();

    this._renderScanner();
    this.cockpitFrame.render(this.renderer.ctx, this.renderer);
    this.cockpitFrame.drawPoiDots(
      this.renderer.ctx,
      this.renderer,
      this.poiSystem,
      this.ship,
      this.camera.rotation || 0
    );
    this.cockpitPanels.render(this.renderer.ctx, this);
    this._renderCornerReadouts();
  }

  /** The normal flight world drawn inside the viewport circle (PORT view). */
  _renderPlayWorld() {
    this._renderBackground({ fullscreen: false, includeWorldNebulae: true });

    this.renderer.ctx.save();
    this.renderer.ctx.translate(
      this.renderer.centerX + this.camera.offset.x,
      this.renderer.centerY + this.camera.offset.y
    );
    if (this.camera.rotation) this.renderer.ctx.rotate(this.camera.rotation);
    this.speedStreaks.render(this.renderer.ctx);
    this.renderer.ctx.restore();

    const playSpeed = this.ship?.velocity?.length?.() ?? 0;
    const baySignals = this.station.baySignals;
    // Tape + hangar roof over any ship in the mouth (controlled + ambient)
    const playerOccluded =
      !!this.ship && this.station.shouldOccludeShip(this.ship, playSpeed);
    const ambientOccluded = [];
    const ambientClear = [];
    for (const a of this.ambientTraffic.ships || []) {
      const pose = this.ambientTraffic.asStationPose?.(a) || {
        position: { x: a.x, y: a.y },
        angle: a.angle,
        velocity: { x: a.vx, y: a.vy },
        shipDef: a.shipDef,
        id: a.id,
      };
      const spd = Math.hypot(a.vx || 0, a.vy || 0);
      if (this.station.shouldOccludeShip(pose, spd)) ambientOccluded.push(a);
      else ambientClear.push(a);
    }
    const anyOccluded = playerOccluded || ambientOccluded.length > 0;

    this.renderer.renderWorldLayer((ctx) => {
      this.station.render(ctx, {
        time: this.gameTime,
        ship: this.ship,
        speed: playSpeed,
        baySignals,
        layer: anyOccluded ? 'under' : 'all',
      });
    }, this.camera);

    this.renderer.renderAsteroids(
      this.asteroidSystem.getActiveAsteroids(),
      this.camera
    );

    this.renderer.renderWorldLayer((ctx) => {
      this.ambientTraffic.render(ctx, { only: ambientOccluded });
    }, this.camera);

    if (playerOccluded && this.ship) {
      this.renderer.renderShip(this.ship, this.camera);
    }

    const exhaustHulls = this._exhaustHullPoses();
    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      this.ship,
      { layer: 'under', shipLocalUnder: playerOccluded, hulls: exhaustHulls }
    );

    if (anyOccluded) {
      this.renderer.renderWorldLayer((ctx) => {
        this.station.render(ctx, {
          time: this.gameTime,
          ship: this.ship,
          speed: playSpeed,
          baySignals,
          layer: 'over',
        });
      }, this.camera);
    }

    this.renderer.renderWorldLayer((ctx) => {
      this.ambientTraffic.render(ctx, { only: ambientClear });
    }, this.camera);

    if (this.ship && !playerOccluded) {
      this.renderer.renderShip(this.ship, this.camera);
    }

    // Floating bay beacons above all ships (lane-centered runway overhead lights)
    this.renderer.renderWorldLayer((ctx) => {
      this.station.render(ctx, {
        time: this.gameTime,
        ship: this.ship,
        speed: playSpeed,
        baySignals,
        layer: 'bayBeacons',
      });
    }, this.camera);

    this.renderer.renderProjectiles(
      [...this.entityManager.getByType('projectile')],
      this.camera
    );

    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      this.ship,
      { layer: 'over', shipLocalUnder: playerOccluded, hulls: exhaustHulls }
    );

    if (Settings.isDevMode() && this.ship) {
      this.renderer.renderWorldLayer((ctx) => {
        drawDevOverlays(ctx, {
          ship: this.ship,
          zoom: this.camera.effectiveZoom || 1,
          getHardpoints: () => this.ship.shipDef?.hardpointsTable?.() || {},
        });
      }, this.camera);
    }
  }

  /** Dark radar-scope backdrop that fills the viewport disc in SCAN view. */
  _renderScanBackdrop() {
    const ctx = this.renderer.ctx;
    const { centerX: cx, centerY: cy, viewportRadius: vr } = this.renderer;
    const g = ctx.createRadialGradient(cx, cy, vr * 0.04, cx, cy, vr);
    g.addColorStop(0, 'rgba(8, 20, 30, 0.98)');
    g.addColorStop(1, 'rgba(3, 8, 14, 0.98)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, vr, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Live ship metadata in the cockpit frame's four corner screens. */
  _renderCornerReadouts() {
    if (!this.cockpitFrame.layout || !this.ship) return;
    const speed = Math.round(
      Math.hypot(this.ship.velocity.x, this.ship.velocity.y)
    );
    // PREC corner is now the MODES switch stack, drawn by CockpitPanels.
    const kmScale = SCANNER.KM_SCALE || 100;
    const scanZoomText =
      this.scanView === 'scan' && this.scannerSystem?.on
        ? `${Math.round((this.scannerSystem.plotRange || 0) / kmScale)}km`
        : `${this.camera.displayZoom().toFixed(2)}x`;
    this.cockpitFrame.drawCorners(this.renderer.ctx, {
      SPD: { text: `${speed}` },
      POS: {
        text: `${Math.round(this.ship.position.x)}, ${Math.round(
          this.ship.position.y
        )}`,
      },
      ZOOM: { text: scanZoomText },
    });
  }

  /** Flip the pilot view lock between world-locked and ship-locked. */
  toggleViewMode() {
    this.viewMode = this.viewMode === 'ship' ? 'world' : 'ship';
  }

  /** Flip the cockpit VIEW between the ship viewport and the full radar scope. */
  toggleScanView() {
    this.scanView = this.scanView === 'scan' ? 'ship' : 'scan';
  }

  /** Scanner ring geometry for the active VIEW (thin port ring vs full scope). */
  _scannerGeometry() {
    const r = this.renderer;
    if (this.scanView === 'scan') {
      return {
        innerR: 0,
        outerR: r.scannerOuterRadius,
        band: r.scannerOuterRadius,
        plotPad: 0.02,
        fullScope: true,
        chevronBand: r.scannerBand || 40,
      };
    }
    return {
      innerR: r.viewportRadius,
      outerR: r.scannerOuterRadius,
      band: r.scannerBand,
      // Full blue→orange band; edge blips get occluded by the ring strokes / POI rim.
      plotPad: 0,
      fullScope: false,
      chevronBand: r.scannerBand,
    };
  }

  /** Request/cancel Precision from the cockpit switch (mirrors Caps Lock). */
  togglePrecision() {
    this.precisionDesired = !this.precisionDesired;
    this.precisionActive = this.precisionDesired;
  }

  /**
   * Apply the pilot view lock to the camera. World-locked keeps rotation at 0
   * (ship spins inside a fixed world); ship-locked counter-rotates the world so
   * the hull always points screen-up, matching the spawn pose.
   */
  _applyViewRotation() {
    if (this.viewMode === 'ship' && this.ship) {
      this.camera.rotation = -Math.PI / 2 - this.ship.angle;
    } else {
      this.camera.rotation = 0;
    }
  }

  /** Scaffold the ship-status shape read by the HUD status tab + alert overlay. */
  _ensureShipStatus() {
    if (!this.ship || this.ship.status) return;
    this.ship.status = {
      systems: [
        { name: 'Engines', state: 'ok' },
        { name: 'Thrusters', state: 'ok' },
        { name: 'Scanner', state: 'ok' },
        { name: 'Weapons', state: 'ok' },
        { name: 'Life Support', state: 'ok' },
      ],
      fuel: 1,
      fires: [],
      weapons: [
        { name: 'Turret', ammo: '\u221E', state: 'ready' },
        { name: 'Mining Laser', ammo: '\u221E', state: 'ready' },
      ],
    };
  }

  /** Route space-cockpit LMB clicks: panels → scanner band → POI rim. */
  _processCockpitClicks() {
    const click = this.input.consumeClickPos();
    if (!click) return;
    const { x, y } = click;
    const dx = x - this.renderer.centerX;
    const dy = y - this.renderer.centerY;
    const distC = Math.hypot(dx, dy);
    // PORT view: the inner disc is the world → leave clicks to gameplay. SCAN
    // view: the whole disc is the scope → let clicks fall through to blip pick.
    if (this.scanView !== 'scan' && distC <= this.renderer.viewportRadius) return;

    if (this.cockpitPanels.handleClick(x, y, this)) return;

    if (distC <= this.renderer.scannerOuterRadius) {
      if (this.scannerSystem.on) {
        const tol = this.scanView === 'scan'
          ? Math.max(18, this.renderer.viewportRadius * 0.12)
          : Math.max(18, this.renderer.scannerBand);
        this.scannerSystem.selectNearestScreen(x, y, tol);
      }
      return;
    }

    if (distC <= this.renderer.poiOuterRadius) {
      this._selectPoiAt(x, y);
    }
  }

  _selectPoiAt(x, y) {
    const rim = this.cockpitFrame.poiRimGeometry();
    if (!rim || !this.ship) return;
    const camRot = this.camera.rotation || 0;
    let best = null;
    let bestD = 16;
    for (const poi of this.poiSystem.ringPois()) {
      const b =
        Math.atan2(poi.y - this.ship.position.y, poi.x - this.ship.position.x) + camRot;
      const px = rim.cx + Math.cos(b) * rim.rimR;
      const py = rim.cy + Math.sin(b) * rim.rimR;
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) {
        bestD = d;
        best = poi;
      }
    }
    this.poiSystem.selectedId = best ? best.id : null;
  }

  /** Scanner Output Screen ring: model update + radar render. */
  _renderScanner() {
    const r = this.renderer;
    if (!r.scannerBand || !this.ship) return;

    const dt = this._lastFrameDt || 1 / 60;
    const scannerPips = this.pipSystem.get('scanner');
    const geo = this._scannerGeometry();

    this.scannerSystem.update(dt, {
      ship: this.ship,
      station: this.station,
      ambientTraffic: this.ambientTraffic,
      asteroids: this.asteroidSystem.getActiveAsteroids(),
      camera: this.camera,
      scannerPips,
      centerX: r.centerX,
      centerY: r.centerY,
      innerR: geo.innerR,
      outerR: geo.outerR,
      band: geo.band,
      plotPad: geo.plotPad,
      fullScope: geo.fullScope,
    });

    // POI discovery (proximity) + sector-map fog reveal ride the scan.
    this.poiSystem.update({
      ship: this.ship,
      station: this.station,
      scanRange: this.scannerSystem.on ? this.scannerSystem.range : 0,
    });
    this.sectorMap.update({
      ship: this.ship,
      scanRange: this.scannerSystem.on ? this.scannerSystem.range : 0,
      contacts: this.scannerSystem.contacts,
      pois: this.poiSystem.list,
    });

    this.scanner.render(r.ctx, {
      centerX: r.centerX,
      centerY: r.centerY,
      innerR: geo.innerR,
      outerR: geo.outerR,
      band: geo.band,
      plotPad: geo.plotPad,
      fullScope: geo.fullScope,
      chevronBand: geo.chevronBand,
      ship: this.ship,
      model: this.scannerSystem,
      cameraRotation: this.camera.rotation || 0,
      time: this.gameTime,
      maxSpeed: PHYSICS.MAX_SPEED,
    });
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

  _renderBlueprint() {
    this.renderer.setupCircularClip();
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#060a12';
    ctx.fillRect(
      this.renderer.centerX - this.renderer.viewportRadius,
      this.renderer.centerY - this.renderer.viewportRadius,
      this.renderer.viewportRadius * 2,
      this.renderer.viewportRadius * 2
    );

    const g = ctx.createRadialGradient(
      this.renderer.centerX,
      this.renderer.centerY,
      16,
      this.renderer.centerX,
      this.renderer.centerY,
      this.renderer.viewportRadius
    );
    g.addColorStop(0, 'rgba(30, 55, 80, 0.55)');
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

    this._drawBlueprintField(ctx);
    this._drawBlueprintPadRings(ctx);

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
      this.renderer.renderShip(
        this._sandboxShip,
        this.camera,
        this._blueprint?.shipView()
      );
    }
    if (
      Settings.isDevMode() &&
      this._sandboxShip &&
      (DevTools.overlay.mounts || DevTools.selectedMount || blueprintAuthoring.dragging)
    ) {
      const prev = DevTools.overlay.mounts;
      DevTools.overlay.mounts = true;
      this.renderer.renderWorldLayer((ctx) => {
        drawDevOverlays(ctx, {
          ship: this._sandboxShip,
          zoom: this.camera.effectiveZoom || 1,
          getHardpoints: () => this._sandboxShip.shipDef?.hardpointsTable?.() || {},
        });
      }, this.camera);
      DevTools.overlay.mounts = prev;
    }
    this.renderer.endCircularClip();
  }

  /**
   * Blueprint drafting field — fine/major grid + radial construction lines.
   * Full-strength outside the outermost pad disc; a fainter, wider-spaced
   * echo continues inside the pads so the field reads as one continuous
   * sheet (pad Mk rings redraw on top in `_drawBlueprintPadRings` and stay
   * the dominant read).
   */
  _drawBlueprintField(ctx) {
    const cx = this.renderer.centerX;
    const cy = this.renderer.centerY;
    const zoom = this.camera.effectiveZoom;
    const yScale = this._blueprint?.viewMode === 'angled' ? 0.72 : 1;
    const padOuter = Math.max(
      PAD_MK_RADIUS[1] || 0,
      PAD_MK_RADIUS[2] || 0,
      PAD_MK_RADIUS[3] || 0
    );
    const viewR = this.renderer.viewportRadius;
    // World extent: enough to cover the play circle at current zoom
    const extent = Math.max(viewR / Math.max(0.001, zoom), padOuter + 24) * 1.35;
    const minor = 12;
    const majorEvery = 4; // every 48 world units

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom * yScale);

    // Clip to exterior of the outermost pad (donut: big square minus pad disc)
    ctx.beginPath();
    ctx.rect(-extent, -extent, extent * 2, extent * 2);
    ctx.ellipse(0, 0, padOuter, padOuter, 0, 0, Math.PI * 2, true);
    ctx.clip('evenodd');

    // Soft fade so the field dies toward the viewport rim
    const fade = ctx.createRadialGradient(0, 0, padOuter * 0.9, 0, 0, extent);
    fade.addColorStop(0, 'rgba(60, 110, 160, 0.22)');
    fade.addColorStop(0.55, 'rgba(40, 80, 120, 0.12)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)');

    // Minor grid
    ctx.strokeStyle = 'rgba(70, 115, 155, 0.16)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    const n = Math.ceil(extent / minor);
    for (let i = -n; i <= n; i++) {
      const p = i * minor;
      ctx.moveTo(p, -extent);
      ctx.lineTo(p, extent);
      ctx.moveTo(-extent, p);
      ctx.lineTo(extent, p);
    }
    ctx.stroke();

    // Major grid
    ctx.strokeStyle = 'rgba(100, 160, 210, 0.28)';
    ctx.lineWidth = 1.25 / zoom;
    ctx.beginPath();
    for (let i = -n; i <= n; i++) {
      if (i % majorEvery !== 0) continue;
      const p = i * minor;
      ctx.moveTo(p, -extent);
      ctx.lineTo(p, extent);
      ctx.moveTo(-extent, p);
      ctx.lineTo(extent, p);
    }
    ctx.stroke();

    // Radial construction lines (16 headings) — read as “out into the distance”
    ctx.strokeStyle = 'rgba(120, 180, 220, 0.2)';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([6 / zoom, 5 / zoom]);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.moveTo(c * (padOuter + 1.5), s * (padOuter + 1.5));
      ctx.lineTo(c * extent, s * extent);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Light wash over the field (clipped)
    ctx.fillStyle = fade;
    ctx.fillRect(-extent, -extent, extent * 2, extent * 2);

    ctx.restore();

    // Interior echo — same grid continuing inside the pad discs, but faint
    // and wide-spaced so the Mk rings (drawn after, in _drawBlueprintPadRings)
    // stay the clear, dominant read.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom * yScale);
    ctx.beginPath();
    ctx.ellipse(0, 0, padOuter, padOuter, 0, 0, Math.PI * 2);
    ctx.clip();

    const minorIn = minor * 2;
    const nIn = Math.ceil(padOuter / minorIn);

    ctx.strokeStyle = 'rgba(70, 115, 155, 0.07)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let i = -nIn; i <= nIn; i++) {
      const p = i * minorIn;
      ctx.moveTo(p, -padOuter);
      ctx.lineTo(p, padOuter);
      ctx.moveTo(-padOuter, p);
      ctx.lineTo(padOuter, p);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(100, 160, 210, 0.12)';
    ctx.lineWidth = 1.1 / zoom;
    ctx.beginPath();
    for (let i = -nIn; i <= nIn; i++) {
      if (i % majorEvery !== 0) continue;
      const p = i * minorIn;
      ctx.moveTo(p, -padOuter);
      ctx.lineTo(p, padOuter);
      ctx.moveTo(-padOuter, p);
      ctx.lineTo(padOuter, p);
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Concentric pad Mk rings under the sandbox ship.
   * Mk2 radius matches hangar B2; active group’s pad is emphasized.
   * Drawn after the drafting field (`_drawBlueprintField`) so the ring
   * strokes stay crisp over the faint interior grid echo.
   */
  _drawBlueprintPadRings(ctx) {
    const cx = this.renderer.centerX;
    const cy = this.renderer.centerY;
    const zoom = this.camera.effectiveZoom;
    const yScale = this._blueprint?.viewMode === 'angled' ? 0.72 : 1;
    const activeMk = padMkForClass(this._blueprint?.classId);
    const mks = [1, 2, 3].filter((mk) => PAD_MK_RADIUS[mk]);

    const drawRing = (mk, active) => {
      const worldR = PAD_MK_RADIUS[mk];
      const rx = worldR * zoom;
      const ry = worldR * zoom * yScale;

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (active) {
        ctx.fillStyle = 'rgba(70, 120, 170, 0.07)';
        ctx.fill();
      }
      ctx.strokeStyle = active
        ? 'rgba(140, 200, 240, 0.62)'
        : 'rgba(80, 120, 160, 0.22)';
      ctx.lineWidth = active ? 1.75 : 1;
      ctx.setLineDash(active ? [] : [5, 4]);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.font = active
        ? '600 11px "Segoe UI", system-ui, sans-serif'
        : '500 10px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = active
        ? 'rgba(170, 215, 245, 0.75)'
        : 'rgba(110, 150, 185, 0.38)';
      ctx.fillText(`Mk${mk}`, cx + rx + 8, cy);
    };

    ctx.save();
    ctx.lineCap = 'round';
    for (const mk of mks) {
      if (mk !== activeMk) drawRing(mk, false);
    }
    if (mks.includes(activeMk)) drawRing(activeMk, true);
    this._drawBlueprintMk4Tease(ctx, cx, cy, zoom, yScale);
    ctx.restore();
  }

  /**
   * Easter egg: faint Mk4 circumference that only peeks near the play-circle
   * rim when zoomed out. Decorative only — not in PAD_MK_RADIUS gameplay.
   */
  _drawBlueprintMk4Tease(ctx, cx, cy, zoom, yScale) {
    const worldR = PAD_MK4_TEASE_RADIUS;
    if (!worldR) return;
    const rx = worldR * zoom;
    const ry = worldR * zoom * yScale;
    const viewR = this.renderer.viewportRadius;
    // Only bother when the arc can peek into the play circle
    if (rx < viewR * 0.55 || rx > viewR * 1.45) return;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(70, 105, 140, 0.13)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 7]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label just inside the east rim so it stays in the circular clip
    const labelInset = 12;
    const lx = cx + rx - labelInset;
    const ly = cy;
    if (Math.hypot(lx - cx, ly - cy) < viewR - 6) {
      ctx.font = '500 9px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(100, 140, 175, 0.26)';
      ctx.fillText('Mk4', lx, ly);
    }
  }

  _renderHangar() {
    this._syncHangarDevControlPad();
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
    const playerInShaft = (this.hangarBay.playerPadDrop || 0) >= 0.02;
    const playerVisible = this.hangarBay.isPlayerShipVisible?.() !== false;

    this.renderer.renderWorldLayer((worldCtx) => {
      this.hangarBay.renderDeck(worldCtx, space);
      this.hangarBay.renderCrew(worldCtx);
      this.hangarBay.renderWeldUnder(worldCtx);
      const playerView = this.ship
        ? hangarShipView(this.ship.angle)
        : null;
      this.hangarBay.renderElevatorTransits(worldCtx, {
        drawPlayerShip: (ctx) => {
          if (this.ship && playerVisible) {
            this.renderer.drawShipBodyAt(ctx, this.ship, 0, 0, playerView);
          }
        },
      });
      this.hangarBay.renderVisitors(worldCtx, {
        beforeOcclusion: (wctx) => {
          if (this.ship && playerVisible && shipOutside) {
            this._drawHangarHoverShadow(wctx);
            this.renderer.drawShipInWorld(wctx, this.ship, playerView);
          }
        },
        afterOcclusion: (wctx) => {
          if (this.ship && playerVisible && !shipOutside && !playerInShaft) {
            this._drawHangarHoverShadow(wctx);
            this.renderer.drawShipInWorld(wctx, this.ship, playerView);
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
      this.ship,
      { hulls: this._exhaustHullPoses() }
    );

    this.renderer.renderWorldLayer((worldCtx) => {
      this.hangarBay.renderOverhead(worldCtx);
      if (HangarLayoutEditor.isActive()) {
        HangarLayoutEditor.draw(worldCtx);
      }
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

  /** Sync pad “active” highlight to the Dev control target. */
  _syncHangarDevControlPad() {
    const ctrl = this.hangarControlTarget;
    if (!Settings.isDevMode() || !ctrl) {
      this.hangarBay.setDevControlBay(null);
      return;
    }
    if (ctrl.kind === 'player') {
      this.hangarBay.setDevControlBay(this.playerBayIndex);
    } else if (ctrl.kind === 'visitor') {
      this.hangarBay.setDevControlBay(ctrl.bayIndex);
    } else {
      this.hangarBay.setDevControlBay(null);
    }
  }

  _updateHUD() {
    if (!this._hudSpeed || !this.ship) return;
    // Lift the SPD/ZOOM/PRECISION row above the scanner ring band (POS lives in
    // the ring). Sits just inside the lower edge of the space viewport.
    if (this._hudEl && this.renderer.scannerBand) {
      const bottom = Math.round(
        this.renderer.height -
          (this.renderer.centerY + this.renderer.viewportRadius) +
          6
      );
      if (this._hudBottom !== bottom) {
        this._hudEl.style.bottom = `${bottom}px`;
        this._hudBottom = bottom;
      }
    }
    const speed = Math.round(
      Math.hypot(this.ship.velocity.x, this.ship.velocity.y)
    );
    this._hudSpeed.textContent = speed;
    if (this._hudCoords) {
      this._hudCoords.textContent = `${Math.round(this.ship.position.x)}, ${Math.round(this.ship.position.y)}`;
    }
    if (this._hudZoom) {
      this._hudZoom.textContent = this.camera.displayZoom().toFixed(2);
    }
    if (this._hudPrecision) {
      if (this.precisionActive) {
        this._hudPrecision.textContent = 'PRECISION';
        this._hudPrecision.className = 'precision-active';
      } else {
        this._hudPrecision.textContent = '';
        this._hudPrecision.className = '';
      }
    }
  }

  /** Real rAF frame rate (unclamped; ignores sim-speed / pause). */
  _updateFps(timestamp) {
    if (!this._fpsCounter) return;
    if (this._fpsLastTs > 0) {
      const frameMs = timestamp - this._fpsLastTs;
      // Ignore huge gaps (tab backgrounded / first frames after focus).
      if (frameMs > 0 && frameMs < 1000) {
        this._fpsFrames += 1;
        this._fpsAccumMs += frameMs;
        if (this._fpsAccumMs >= 500) {
          const fps = Math.round((this._fpsFrames * 1000) / this._fpsAccumMs);
          this._fpsCounter.textContent = `${fps} FPS`;
          this._fpsFrames = 0;
          this._fpsAccumMs = 0;
        }
      }
    }
    this._fpsLastTs = timestamp;
  }
}
