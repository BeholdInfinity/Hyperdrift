import { Ship } from '../entities/Ship.js';
import { ShipController } from '../entities/ShipController.js';
import { EntityManager } from '../entities/EntityManager.js';
import { ParticleSystem } from '../entities/Particle.js';
import { InputSystem } from '../systems/InputSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { Renderer } from '../systems/Renderer.js';
import { RadarDisplay } from '../systems/RadarDisplay.js';
import { RadarSystem } from '../systems/RadarSystem.js';
import {
  contactScreenAabb,
  drawCornerBrackets,
  pickContactAtScreen,
} from '../systems/ContactSelectionDraw.js';
import { renderViewportTelemetry } from '../systems/ViewportTelemetry.js';
import { CockpitFrame } from '../systems/CockpitFrame.js';
import { CockpitPanels } from '../systems/CockpitPanels.js';
import { PipSystem } from '../systems/PipSystem.js';
import { PipLoadouts } from '../systems/PipLoadouts.js';
import { processPipLoadoutModalInput } from '../systems/PipLoadoutPanel.js';
import { processSectorMapModalInput, processPoiBookModalInput } from '../systems/SectorMapPanel.js';
import { PoiSystem, setPoiIdCounter } from '../world/PoiSystem.js';
import { SectorMap, trailDistance } from '../world/SectorMap.js';
import { TravelLog } from '../world/TravelLog.js';
import { loadNavProfile, saveNavProfile, clearNavProfileStorage } from '../world/NavPersistence.js';
import { bootstrapSectorWorld, syncStationAnchor, syncStationToPlace } from '../world/SectorBootstrap.js';
import { StationField, DEFAULT_BAY_SIGNALS } from '../world/StationField.js';
import { finiteGameTime, circularOrbitVelocityAtWorld } from '../world/OrbitKinematics.js';
import { WarpGateSystem } from '../world/WarpGateSystem.js';
import { TrafficRecord } from '../world/TrafficRecord.js';
import { TrafficEnforcement } from '../world/TrafficEnforcement.js';
import { drawRingBackdrop } from '../world/RingBackdrop.js';
import {
  getSiteById,
  getSectorLayout,
  siteWorldPosition,
  listSites,
} from '../world/SectorLayout.js';
import { NavRoute } from '../world/NavRoute.js';
import { SectorMapView } from '../systems/SectorMapView.js';
import { drawSectorEditorFrame, processSectorEditorInput } from '../systems/SectorEditorPanel.js';
import { setSectorEditorActive } from '../dev/DevSectorEditor.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import {
  formatTurretAmmoLabel,
  formatTurretAmmoStatus,
} from '../combat/AmmoSystem.js';
import { AsteroidSystem } from '../systems/AsteroidSystem.js';
import { MiningDropSystem } from '../systems/MiningDropSystem.js';
import { GrappleSystem } from '../systems/GrappleSystem.js';
import { ContactOcclusion } from '../systems/ContactOcclusion.js';
import { ForwardScanSystem } from '../systems/ForwardScanSystem.js';
import { OcclusionShadowPass } from '../systems/OcclusionShadowPass.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';
import { Starfield } from '../world/Starfield.js';
import { NebulaField } from '../world/NebulaField.js';
import { SpeedStreaks } from '../world/SpeedStreaks.js';
import { DustLayer } from '../world/DustLayer.js';
import { DepthCompositor } from '../world/DepthCompositor.js';
import { InteriorSession } from './InteriorSession.js';
import { HangarPresence } from '../world/hangar/HangarPresence.js';
import {
  hangarDefaultZoom,
  hangarElevatorZoom,
  hangarZoomMax,
  hangarZoomMin,
  hangarPadX,
  syncHangarSidePadFromLayout,
} from '../world/HangarBay.js';
import { makeVisitorThrusters } from '../world/HangarVisitorShips.js';
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
  NAV,
  FLS,
} from '../core/Constants.js';
import { drawHangarStyleScan, drawIdleSeekBeams, contactScanTarget } from '../systems/ScanVisual.js';
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
  applyHullHeal,
  applyFuelFill,
  applyAmmoFill,
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
    /** @type {'title'|'playing'|'hangar'|'settings'|'blueprint'|'sectorEditor'} */
    this.mode = 'title';
    this.lastTime = 0;

    this.renderer = new Renderer(canvas);
    this.radarDisplay = new RadarDisplay();
    this.radarSystem = new RadarSystem();
    this.pipSystem = new PipSystem();
    this.pipLoadouts = new PipLoadouts();
    this.pipLoadoutModal = null;
    this.poiBookModal = null;
    this.pipLoadoutHover = null;
    this.pipLoadoutFlash = null;
    this.pipLoadoutListScroll = 0;
    this.poiSystem = new PoiSystem();
    this.navRoute = new NavRoute();
    this._navArrivalFlashUntil = 0;
    this._navArrivalFlashText = '';
    this._lastFineToast = '';
    this.sectorMap = new SectorMap();
    this.travelLog = new TravelLog();
    this.sectorMapView = new SectorMapView();
    this._sectorEditorView = new SectorMapView();
    this._sectorEditorReturn = 'title';
    /** @type {'pan'|'site'|null} */
    this._sectorEditorPointer = null;
    this.nextExpeditionId = 1;
    this.expeditionStartedAt = 0;
    this._expeditionActive = false;
    this._archiveExpeditionOnSettle = false;
    this.cockpitFrame = new CockpitFrame();
    this.cockpitPanels = new CockpitPanels();
    this.input = new InputSystem(canvas);
    this.camera = new CameraSystem();
    this.entityManager = new EntityManager();
    this.particleSystem = new ParticleSystem();
    this.miningDropSystem = new MiningDropSystem(this.entityManager);
    this.grappleSystem = new GrappleSystem();
    this.contactOcclusion = new ContactOcclusion();
    this.forwardScanSystem = new ForwardScanSystem();
    this.occlusionShadowPass = new OcclusionShadowPass();
    this.shipLog = [];
    this.shipController = new ShipController();
    this.physics = new PhysicsSystem();
    this.weaponSystem = new WeaponSystem(
      this.entityManager,
      this.particleSystem,
      this.miningDropSystem
    );
    this.asteroidSystem = new AsteroidSystem(this.entityManager);
    this.starfield = new Starfield();
    this.nebulaField = new NebulaField();
    this.speedStreaks = new SpeedStreaks();
    this.dustLayer = new DustLayer();
    this._initDepthCompositor();
    this.titleScreen = new TitleScreen();
    this.titleScreen.bindSpacer(document.getElementById('title-art-spacer'));
    /** Active station interior instance (hangar); null in exterior space/title. */
    this.interior = null;
    /** Lightweight bay mirror while the pilot is in space (no full hangar tick). */
    this.hangarPresence = new HangarPresence();
    this.stationField = new StationField();
    this.stationField.bootstrap();
    this.station = this.stationField.getJenningsStation();
    /** Place → Area → Feature registry (Jennings default hangar) */
    this.placeRegistry = placeRegistry;
    bootstrapSectorWorld({ poiSystem: this.poiSystem, station: this.station, placeRegistry: this.placeRegistry });
    /** Static layout sites — positions refreshed each frame via siteWorldPosition. */
    this._shepherdMoonSites = listSites('shepherd_moon');
    this._shepherdMoonBuf = [];
    this.trafficRecord = new TrafficRecord();
    this.trafficEnforcement = new TrafficEnforcement(this.trafficRecord);
    this.warpGateSystem = new WarpGateSystem();
    this.ambientTraffic = new AmbientTrafficSystem();
    this.combat = new CombatSystem();
    /** Stub: player entered vessel interior graph (walker TBD) */
    this.interiorActive = false;
    this.interiorPlaceId = null;
    /** Instance gate flight — Thera gravity off until return to overworld. */
    this.deepInstanceActive = false;

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
     * thin radar ring around it (default); 'scan' replaces both with one
     * full-disc radar scope (ship at center, blips plotted by range). The POI
     * rim ring is unchanged. Toggled from the cockpit MODES switch or the V key.
     */
    this.scanView = 'ship';
    this.gameTime = 0;
    /** Dev sim clock scale: 0=pause; otherwise multiplier vs real time. */
    this.simSpeed = 1;
    /** Configured multiplier (dev UI; kept while paused). */
    this.simSpeedTarget = 1;
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
    /** Last docked place for combat respawn quick launch (defaults Jennings). */
    this._lastDockPlaceId = 'place.jennings';
    this._lastDockBayIndex = 1;

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
    /** Cosmetic peephole vista lives on InteriorSession when active. */

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
    /** gameTime until egress grace ends (blocks dock after hangar/quick launch). */
    this._exitIngressBlockedUntil = 0;
    this._dockLocked = true;
    this._settingsReturn = 'title';
    this._settingsSandboxActive = false;
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
    this._hangarPlaceTitle = document.getElementById('hangar-place-title');
    this._overlay = document.getElementById('overlay');
    this._controlsHud = document.getElementById('controls-hud');
    this._blueprintHud = document.getElementById('blueprint-hud');
    this._sectorEditorHud = document.getElementById('sector-editor-hud');
    this._dockHud = document.getElementById('dock-hud');
    this._hangarLaunchBtn = document.getElementById('hangar-launch-btn');

    this._hudEl = document.getElementById('hud');
    this._hudSpeed = document.getElementById('speed-value');
    this._hudCoords = document.getElementById('coords-value');
    this._hudZoom = document.getElementById('zoom-value');
    this._hudPrecision = document.getElementById('precision-value');
    this._hudHangarZoom = document.getElementById('hangar-zoom-value');
    this._fpsCounter = document.getElementById('fps-counter');
    this._sandboxSpeedHud = document.getElementById('settings-sandbox-speed');
    this._sandboxSpeedValue = document.getElementById('settings-sandbox-speed-value');
    this._fpsFrames = 0;
    this._fpsAccumMs = 0;
    this._fpsLastTs = 0;
    this._pauseMenu = document.getElementById('pause-menu');
    this._deathMenu = document.getElementById('death-menu');
    this._deathDockLabel = document.getElementById('death-dock-label');
    this._fullscreenBtn = document.getElementById('fullscreen-btn');
    this._pauseFullscreenBtn = document.getElementById('pause-fullscreen-btn');

    this.input.onFullscreenChange = (isFs) => this._updateFullscreenButtons(isFs);
    this._updateFullscreenButtons(!!document.fullscreenElement);

    window.addEventListener('resize', () => this.renderer.resize());
    this.renderer.resize();
    this._setTitleFade(0);
    this._loadNavProfile();
  }

  _loadNavProfile() {
    const { profile: data, staleVersion } = loadNavProfile();
    if (staleVersion) {
      this._navArrivalFlashText = 'NAV PROFILE RESET (v4)';
      this._navArrivalFlashUntil = 4;
    }
    if (!data) {
      this.pipLoadouts.seedDefaultIfEmpty();
      return;
    }
    if (data.nextExpeditionId) this.nextExpeditionId = data.nextExpeditionId;
    if (data.pois?.length) this.poiSystem.hydrateFromSave(data.pois);
    if (data.travelLog) this.travelLog.fromJSON(data.travelLog);
    if (data.pipLoadouts) {
      this.pipLoadouts.fromJSON(data.pipLoadouts);
    } else {
      this.pipLoadouts.seedDefaultIfEmpty();
    }
    if (data.activeLoadoutId) {
      this.pipLoadouts.activeId = data.activeLoadoutId;
      if (!this.pipLoadouts.find(data.activeLoadoutId)) {
        this.pipLoadouts.activeId = null;
      }
    }
    if (data.navRoute) this.navRoute.hydrateFromSave(data.navRoute);
    if (data.trafficRecord) this.trafficRecord.fromJSON(data.trafficRecord);
  }

  persistNavProfile() {
    saveNavProfile({
      nextExpeditionId: this.nextExpeditionId,
      pois: this.poiSystem.exportForSave(),
      travelLog: this.travelLog.toJSON(),
      pipLoadouts: this.pipLoadouts.toJSON(),
      nextLoadoutId: this.pipLoadouts._nextId,
      activeLoadoutId: this.pipLoadouts.activeId,
      navRoute: this.navRoute.exportForSave(),
      trafficRecord: this.trafficRecord.toJSON(),
    });
  }

  /** Wipe browser nav save and restore layout-default POIs + default pip loadout. */
  resetNavProfile() {
    clearNavProfileStorage();
    this.nextExpeditionId = 1;
    this.travelLog.fromJSON({ nextId: 1, entries: [] });
    this.navRoute.clearAll();
    this.pipLoadouts.fromJSON(null);
    this.pipLoadouts.entries = [];
    this.pipLoadouts._nextId = 1;
    this.pipLoadouts.activeId = null;
    this.pipLoadouts.seedDefaultIfEmpty();
    this.trafficRecord = new TrafficRecord();
    this.trafficEnforcement = new TrafficEnforcement(this.trafficRecord);
    setPoiIdCounter(1);
    this.poiSystem.bootstrapFromLayout(getSectorLayout());
    this.persistNavProfile();
    return true;
  }

  _computeSyncAssist() {
    const contact = this.radarSystem?.getSelected?.();
    if (!contact || !this.ship) return { score: 0, target: null };

    let tvx = contact.vx ?? 0;
    let tvy = contact.vy ?? 0;
    if (contact.type === 'station' && this.station) {
      tvx = this.station.vx ?? 0;
      tvy = this.station.vy ?? 0;
      const slip = this.station.relativeSpeed(
        this.ship.velocity.x,
        this.ship.velocity.y
      );
      const score = Math.max(0, 100 * (1 - slip / STATION.DOCK_MAX_SPEED));
      return {
        score,
        target: { vx: tvx, vy: tvy },
        enabled: score >= 95,
      };
    }

    const targetSpeed = Math.hypot(tvx, tvy);
    if (targetSpeed < 8) return { score: 0, target: null };
    const playerSpeed = this.ship.velocity.length();
    const speedMatch =
      targetSpeed > 0 ? Math.max(0, 1 - Math.abs(playerSpeed - targetSpeed) / targetSpeed) : 0;
    let headingMatch = 0;
    if (playerSpeed > 10 && targetSpeed > 10) {
      const pH = Math.atan2(this.ship.velocity.y, this.ship.velocity.x);
      const tH = Math.atan2(tvy, tvx);
      headingMatch = Math.max(0, (Math.cos(pH - tH) + 1) * 0.5);
    }
    const score = (speedMatch * 0.5 + headingMatch * 0.5) * 100;
    return {
      score,
      target: { vx: tvx, vy: tvy },
      enabled: score >= 95,
    };
  }

  /** Advance all station orbits; pick active dock target + Place. */
  _syncStationWorldFrame() {
    const t = finiteGameTime(this.gameTime);
    this.stationField.syncAll(t);

    if (this.mode === 'playing' && this.ship) {
      this.station = this.stationField.resolveDockTarget(
        this.ship,
        this._lastDockPlaceId
      );
      const entry = this.stationField.getEntryForStation(this.station);
      if (entry?.placeId) placeRegistry.setActive(entry.placeId);
    } else {
      this.station = this.stationField.getJenningsStation();
    }

    if (this.station) {
      STATION.WORLD_X = this.station.x;
      STATION.WORLD_Y = this.station.y;
      STATION.WORLD_VX = this.station.vx ?? 0;
      STATION.WORLD_VY = this.station.vy ?? 0;
    }

    this.poiSystem.syncPositions(t);
  }

  /** Overworld station name plate + hangar HUD banner from active Place. */
  _stationLabelOpts(station) {
    const entry = this.stationField?.getEntryForStation(station);
    const place = entry ? placeRegistry.get(entry.placeId) : null;
    const label = place?.label || entry?.site?.name || 'Station';
    let subtitle = '';
    const tier = entry?.site?.socialTier;
    if (tier === 'home') subtitle = 'Home Base';
    else if (tier === 'pirate') subtitle = 'Outlaw Port';
    else if (tier === 'derelict') subtitle = 'Derelict Yard';
    else if (tier === 'military') subtitle = 'Military';
    else if (tier) subtitle = tier.charAt(0).toUpperCase() + tier.slice(1);
    return { stationLabel: label, stationSubtitle: subtitle };
  }

  _syncHangarPlaceTitle() {
    if (!this._hangarPlaceTitle) return;
    const place = placeRegistry.getActive();
    const name = (place?.label || 'Station').toUpperCase();
    this._hangarPlaceTitle.textContent = `${name}: HANGAR BAY · SHIP MAINTENANCE`;
  }

  /** Station co-moving frame for brake / zero-hold while in the approach shell. */
  _stationMotionFrame() {
    if (!this.ship?.position || !this.station) return null;
    if (!this.station.inApproach(this.ship.position.x, this.ship.position.y)) return null;
    return { vx: this.station.vx ?? 0, vy: this.station.vy ?? 0 };
  }

  /** SYNC target: station always assists on X hold; other contacts need ≥95%. */
  _resolveSyncTarget(syncAssist) {
    if (!this.input.getFlightInput().syncHold || !syncAssist?.target) return null;
    const contact = this.radarSystem?.getSelected?.();
    if (contact?.type === 'station') return syncAssist.target;
    return syncAssist.enabled ? syncAssist.target : null;
  }

  _tickIronCrownStub() {
    if (!this.ship || this.mode !== 'playing') return;
    const site = getSiteById('site.landmark.capital.wreck');
    if (!site) return;
    const pos = siteWorldPosition(site, this.gameTime);
    const d = Math.hypot(this.ship.position.x - pos.x, this.ship.position.y - pos.y);
    if (d > 12000) {
      this._ironCrownNotified = false;
      return;
    }
    if (!this._ironCrownNotified) {
      this._ironCrownNotified = true;
      this._navArrivalFlashText = 'IRON CROWN — DERELICT CAPITAL (stub)';
      this._navArrivalFlashUntil = (this.gameTime || 0) + 3;
    }
  }

  /** @deprecated use navRoute — sector map tooltip hook */
  get sectorWaypoints() {
    return this.navRoute.getMapMarkers(this);
  }

  addNavRouteStop(spec) {
    const stop = this.navRoute.addStop(spec, this);
    if (stop) this.persistNavProfile();
    return stop;
  }

  addNavRouteStopFromPoi(poiId) {
    const poi = this.poiSystem.list.find((p) => p.id === poiId);
    if (!poi) return null;
    return this.addNavRouteStop({ kind: 'poi', poiId: poi.id, label: poi.name });
  }

  addNavRouteStopWorld(x, y) {
    return this.addNavRouteStop({ kind: 'world', x, y });
  }

  /** Dev-only: jump ship to world position on a prograde circular orbit. */
  devJumpToOrbit(worldX, worldY) {
    if (!Settings.isDevMode() || this.mode !== 'playing' || !this.ship) return false;
    const t = finiteGameTime(this.gameTime);
    const vel = circularOrbitVelocityAtWorld(worldX, worldY, t);
    const ship = this.ship;
    ship.position.set(worldX, worldY);
    ship.velocity.set(vel.vx, vel.vy);
    ship.angle = vel.heading;
    ship.turretAngle = vel.heading;
    ship.angularVelocity = 0;
    ship.exitBurn = false;
    this._approachHoldAI = null;
    this.input.cancelZeroHold();
    this.deepInstanceActive = false;
    ship.affectedByGravity = true;
    this.camera.position.set(worldX, worldY);
    this.asteroidSystem.update(worldX, worldY, t, this._asteroidStreamOpts({ materializeInView: true }));
    this.sectorMapView.recenter(ship, this);
    return true;
  }

  /** Enter a warp-instance flight volume — Thera gravity off until exit. */
  enterDeepInstance() {
    this.deepInstanceActive = true;
    if (this.ship) this.ship.affectedByGravity = false;
  }

  /** Return to Thera overworld flight — restore planetary gravity. */
  exitDeepInstance() {
    this.deepInstanceActive = false;
    if (this.ship) this.ship.affectedByGravity = true;
  }

  _flashNavArrivalStatus() {
    const next = this.navRoute.activeStop();
    this._navArrivalFlashText = next ? `NEXT: ${next.label}` : 'WAYPOINT REACHED';
    this._navArrivalFlashUntil = (this.gameTime || 0) + 1.2;
  }

  beginExpedition() {
    this.expeditionStartedAt = Date.now();
    this._expeditionActive = true;
    this._expeditionDiscoveredPoiCount = this.poiSystem.discovered().length;
    this.sectorMap.reset();
    this.sectorMapView.recenter(this.ship, this);
  }

  endExpedition() {
    if (!this._expeditionActive) return;
    const poisNow = this.poiSystem.discovered().length;
    const poisStart = this._expeditionDiscoveredPoiCount ?? poisNow;
    this.travelLog.archiveExpedition({
      trail: this.sectorMap.trail,
      startedAt: this.expeditionStartedAt,
      endedAt: Date.now(),
      expeditionNumber: this.nextExpeditionId++,
      distanceTraveled: trailDistance(this.sectorMap.trail),
      poisEncountered: Math.max(0, poisNow - poisStart),
    });
    this.sectorMap.reset();
    this._expeditionActive = false;
    this.persistNavProfile();
  }

  toggleContact(id) {
    if (!this.radarSystem) return;
    if (!id || id === this.radarSystem.selectedId) {
      this.radarSystem.clearSelection();
      return;
    }
    this.radarSystem.select(id);
  }

  selectContact(id) {
    if (id) this.radarSystem.select(id);
    else this.radarSystem.clearSelection();
  }

  selectPoi(id) {
    if (id) this.poiSystem.select(id);
    else this.poiSystem.clearSelection();
  }

  pickOnSectorMap(worldX, worldY) {
    const tolWorld = 1200 / Math.max(0.25, this.sectorMapView.zoom);
    let bestPoi = null;
    let bestPd = tolWorld;
    for (const poi of this.poiSystem.mapPois()) {
      const pos = this.poiSystem.worldPosition(poi, this.gameTime || 0);
      const d = Math.hypot(pos.x - worldX, pos.y - worldY);
      if (d < bestPd) {
        bestPd = d;
        bestPoi = poi;
      }
    }
    if (bestPoi) {
      this.selectPoi(bestPoi.id);
      return;
    }
    const scan = this.radarSystem;
    let bestC = null;
    let bestCd = tolWorld;
    for (const c of scan.contacts) {
      if (!scan.passesContactFilter(c)) continue;
      if (c.scanX == null || c.scanY == null) continue;
      const d = Math.hypot(c.scanX - worldX, c.scanY - worldY);
      if (d < bestCd) {
        bestCd = d;
        bestC = c;
      }
    }
    if (bestC) this.selectContact(bestC.id);
  }

  dropMapWaypoint(worldX, worldY) {
    const poi = this.poiSystem.addManualPin(worldX, worldY);
    this.poiSystem.select(poi.id);
    this.persistNavProfile();
  }

  /** Dev tool: scale simulation clock (0 pauses sim; render still runs). */
  setSimSpeed(speed) {
    const n = Number(speed);
    if (!Number.isFinite(n) || n < 0) return this.simSpeed;
    this.simSpeed = n;
    if (n > 0) this.simSpeedTarget = n;
    return this.simSpeed;
  }

  getSimSpeed() {
    return this.simSpeed;
  }

  getSimSpeedTarget() {
    return this.simSpeedTarget;
  }

  /** Set multiplier; applies immediately unless sim is paused. */
  setSimSpeedTarget(speed) {
    const n = Number(speed);
    if (!Number.isFinite(n) || n < 0) return this.simSpeedTarget;
    this.simSpeedTarget = n;
    if (this.simSpeed > 0) this.simSpeed = n;
    return this.simSpeedTarget;
  }

  pauseSim() {
    if (this.simSpeed > 0) this.simSpeedTarget = this.simSpeed;
    this.simSpeed = 0;
    return this.simSpeed;
  }

  /** Paused → resume at target; running → reset target and speed to 1×. */
  playSim() {
    if (this.simSpeed <= 0) {
      const resume = this.simSpeedTarget > 0 ? this.simSpeedTarget : 1;
      this.simSpeedTarget = resume;
      this.simSpeed = resume;
    } else {
      this.simSpeedTarget = 1;
      this.simSpeed = 1;
    }
    return this.simSpeed;
  }

  /** Multiply configured speed (÷2 slow, ×2 fast). Applies when not paused. */
  nudgeSimSpeed(factor) {
    const base = this.simSpeed > 0 ? this.simSpeed : this.simSpeedTarget;
    const next = Math.max(0.0625, Math.min(256, base * factor));
    this.setSimSpeedTarget(next);
    return this.simSpeedTarget;
  }

  /** Reset sim clock unless Dev Mode is keeping a custom speed. */
  _resetSimSpeedUnlessDev() {
    if (!Settings.isDevMode()) {
      this.simSpeed = 1;
      this.simSpeedTarget = 1;
    }
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

  /** Copy-friendly runtime error panel (see loadErrorOverlay.js). */
  _reportTransitionError(label, err) {
    const seq = this._hangarSeq;
    const seqBit = seq ? ` seq=${seq.kind}/${seq.phase}` : '';
    const intBit = this.interior ? ' interior=active' : ' interior=null';
    window.__hyperdriftReportRuntimeError?.(
      `${label} (mode=${this.mode}${seqBit}${intBit})`,
      err
    );
  }

  /** Recover ship/camera/map when pose becomes non-finite (hangar launch handoff). */
  _sanitizeShipPose() {
    const ship = this.ship;
    if (!ship?.position || !ship?.velocity) return;
    const px = ship.position.x;
    const py = ship.position.y;
    const vx = ship.velocity.x;
    const vy = ship.velocity.y;
    if (
      Number.isFinite(px) &&
      Number.isFinite(py) &&
      Number.isFinite(vx) &&
      Number.isFinite(vy)
    ) {
      return;
    }
    const bay = this.playerBayIndex ?? 1;
    this._commitSpaceEgressHandoff(ship, bay);
    this.camera.position.set(ship.position.x, ship.position.y);
    this.camera.offset.set(0, 0);
    this.camera.targetOffset.set(0, 0);
    if (!Number.isFinite(this.camera.userZoom)) this.camera.userZoom = 1;
    if (!Number.isFinite(this.camera.targetUserZoom)) this.camera.targetUserZoom = 1;
    if (!Number.isFinite(this.camera.speedZoom)) this.camera.speedZoom = 1;
    this.camera.effectiveZoom = this.camera.userZoom * this.camera.speedZoom;
    this.sectorMapView.recenter(ship, this);
  }

  _armExitGrace(seconds = STATION.EXIT_INGRESS_GRACE_SEC) {
    this._exitIngressBlockedUntil =
      finiteGameTime(this.gameTime) + Math.max(0, seconds);
  }

  _inExitGrace() {
    return finiteGameTime(this.gameTime) < this._exitIngressBlockedUntil;
  }

  /**
   * Apply bay egress pose: station co-orbit + EXIT_REL_SPEED out through the mouth.
   * @returns {{ spawn: { x: number, y: number, angle: number }, exitVel: { vx: number, vy: number } }}
   */
  _commitSpaceEgressHandoff(ship, bayIndex = this.playerBayIndex ?? 1) {
    const placeId = this._lastDockPlaceId || placeRegistry.activePlaceId || 'place.jennings';
    syncStationToPlace(this.station, placeId, finiteGameTime(this.gameTime));
    let spawn = this.station.getExitSpawn(bayIndex);
    if (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.y)) {
      syncStationToPlace(this.station, placeId, 0);
      spawn = this.station.getExitSpawn(bayIndex);
    }
    if (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.y)) {
      const fb = this.station.laneCenterWorld(bayIndex);
      spawn = {
        x: fb.x,
        y: fb.y,
        angle: this.station.runwayEgressAngle(),
      };
    }
    const exitVel = this.station.exitVelocityWorld();
    const evx = exitVel.vx ?? 0;
    const evy = exitVel.vy ?? 0;
    ship.position.set(spawn.x, spawn.y);
    ship.velocity.set(
      Number.isFinite(evx) ? evx : 0,
      Number.isFinite(evy) ? evy : 0
    );
    ship.angle = Number.isFinite(spawn.angle)
      ? spawn.angle
      : this.station.runwayEgressAngle();
    ship.turretAngle = ship.angle;
    ship.angularVelocity = 0;
    ship.exitBurn = false;
    this.input.cancelZeroHold();
    this._armExitGrace();
    return { spawn, exitVel };
  }

  /**
   * Unified entry into playable space after bay egress (quick launch, hangar launch, combat respawn).
   * @param {Ship} ship
   * @param {number} bayIndex
   * @param {{
   *   source?: 'quick'|'hangar'|'respawn',
   *   fromHangar?: boolean,
   *   beginExpedition?: boolean,
   *   resetAmbientTraffic?: boolean,
   * }} [opts]
   */
  _activateSpaceEgress(ship, bayIndex, opts = {}) {
    const {
      source = opts.fromHangar ? 'hangar' : 'quick',
      fromHangar = source === 'hangar',
      beginExpedition = true,
      resetAmbientTraffic = source === 'quick',
    } = opts;

    const { spawn, exitVel } = this._commitSpaceEgressHandoff(ship, bayIndex);

    ship.visualScale = 1;
    ship.affectedByGravity = true;
    ship.exitBurn = false;
    this.deepInstanceActive = false;
    this._clearShipThrusters(ship);
    this.playerBayIndex = bayIndex | 0;
    this.ship = ship;

    this.entityManager.clear();
    this.particleSystem.clear();
    this.entityManager.add(ship, 'ship');

    this.camera.rotation = 0;
    this.camera.position.set(spawn.x, spawn.y);
    this.camera.offset.set(0, 0);
    this.camera.targetOffset.set(0, 0);
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = 1;

    this.precisionActive = false;
    this._approachHoldAI = null;
    this._hangarSeq = null;
    this._hangarSeqZoomPlayer = false;
    this._hangarHover = 0;
    this._dockLocked = true;
    this._exitBurn = false;
    this._exitBurnFailsafe = 0;

    this.input.hangarPanEnabled = false;
    this.input.enable();
    this.input.paused = false;
    this.paused = false;

    this.mode = 'playing';
    this.interiorActive = false;
    this._resetSimSpeedUnlessDev();

    syncHangarSidePadFromLayout(null);
    this._bindPlayerVessel(ship);

    if (resetAmbientTraffic) {
      this.ambientTraffic.reset();
    } else if (!this.ambientTraffic.ships?.length) {
      this.ambientTraffic.reset();
    }

    if (
      !this.hangarPresence.active &&
      (this._lastDockPlaceId === 'place.jennings' ||
        placeRegistry.activePlaceId === 'place.jennings')
    ) {
      this.hangarPresence.seedDefault(bayIndex);
    }

    this.asteroidSystem.update(spawn.x, spawn.y, this.gameTime || 0, this._asteroidStreamOpts());
    this._setDockHud(false);

    if (fromHangar) {
      if (this._hangarHud) this._hangarHud.classList.add('hidden');
      this._setLaunchBtnVisible(false);
      if (typeof this.onLaunchComplete === 'function') this.onLaunchComplete();
    }

    if (beginExpedition) {
      this.beginExpedition();
    }

    return spawn;
  }

  _guardTransition(label, fn) {
    try {
      return fn();
    } catch (err) {
      this._reportTransitionError(label, err);
      throw err;
    }
  }

  /** Begin the title-screen loop (live Jennings space sim + wordmark). */
  startTitle() {
    this.mode = 'title';
    this.running = true;
    this.paused = false;
    this.simSpeed = 1;
    this.simSpeedTarget = 1;
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
    return this._guardTransition('Enter title sim', () => this._enterTitleSimBody({ fadeIn }));
  }

  _enterTitleSimBody({ fadeIn = false } = {}) {
    this._destroyInterior();
    this._clearPlaySession();
    this._hangarSeq = null;
    HangarLayoutEditor.exit();
    this.simSpeed = 1;
    this.simSpeedTarget = 1;
    this.paused = false;

    syncHangarSidePadFromLayout(null);
    this.playerBayIndex = 1;
    this.hangarPresence.reset();
    this.station.setBaySignals(['green', 'green', 'green']);

    this.ambientTraffic.reset();

    this.camera.rotation = TITLE_LAYOUT.rotation;
    this.camera.offset.set(0, 0);
    this.camera.speedZoom = 1;
    this._applyTitleCamera(this.gameTime || 0);
    this._spaceCam.x = this.camera.position.x;
    this._spaceCam.y = this.camera.position.y;
    this.asteroidSystem.update(
      this.camera.position.x,
      this.camera.position.y,
      this.gameTime || 0,
      this._asteroidStreamOpts()
    );

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
      hangarBay: null,
      asteroids: this.asteroidSystem.getActiveAsteroids(),
      particles: this.particleSystem,
      camera: view,
      layout: getSectorLayout(),
      gameTime: this.gameTime || 0,
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
    syncStationAnchor(this.station, this.gameTime || 0);
    const anchorX = this.station.x;
    const anchorY = this.station.y;
    this.camera.position.set(
      anchorX + V.lookX + bob * V.bobAmpX,
      anchorY + V.lookY + bob2 * V.bobAmpY
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
    return this._guardTransition('Quick launch → playing', () => this._beginPlayBody());
  }

  _beginPlayBody() {
    this._clearPlaySession();
    placeRegistry.setActive('place.jennings');
    this._lastDockPlaceId = 'place.jennings';
    this.station = this.stationField.getJenningsStation();
    // Pick exit bay first — spawn lane + departing pad light must match
    this.playerBayIndex = (Math.random() * 3) | 0;
    this.ship = new Ship(0, 0);
    this._applyPendingBlueprint(this.ship);
    this._activateSpaceEgress(this.ship, this.playerBayIndex, { source: 'quick' });
    this._setTitleFade(1);
    this.canvas.style.opacity = '1';
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
    return this._guardTransition('Enter hangar (new InteriorSession)', () =>
      this._beginHangarBody({ landing, fromMenu, entryAngle, entryTurret, targetBay })
    );
  }

  _beginHangarBody({
    landing = false,
    fromMenu = false,
    entryAngle = null,
    entryTurret = null,
    targetBay = null,
  } = {}) {
    if (!landing && fromMenu) {
      placeRegistry.setActive('place.jennings');
      this.station = this.stationField.getJenningsStation();
    }
    if (landing && this._expeditionActive) {
      this._archiveExpeditionOnSettle = true;
    }
    this.camera.rotation = 0;
    this._destroyInterior();
    if (!landing) {
      this.hangarPresence.reset();
    }
    this.interior = new InteriorSession();
    this.interior.freezeExterior(this);
    this.interior.resetBackdrop();
    this.input.consumeZoomDelta();

    const hb = this.interior.hangarBay;
    const carried = this.ship;
    const carriedDef = carried?.shipDef ? cloneShipDef(carried.shipDef) : null;

    this.entityManager.clear();
    this.particleSystem.clear();
    this.interior.entityManager.clear();
    this.interior.particleSystem.clear();
    this.precisionActive = false;
    this.speedStreaks = new SpeedStreaks();
    this._initDepthCompositor();
    this._exitBurn = false;
    this._exitBurnFailsafe = 0;
    this._approachHoldAI = null;

    syncHangarSidePadFromLayout(hb);

    const bayFromLane =
      targetBay != null && Number.isFinite(targetBay)
        ? ((targetBay | 0) + 3) % 3
        : null;

    if (landing && carried) {
      const prefer = bayFromLane ?? this.playerBayIndex ?? 1;
      this.ship = carried;
      if (carriedDef) this.ship.shipDef = carriedDef;
      this._bindPlayerVessel(this.ship);
      hb.reset(this.ship, {
        playerBayIndex: prefer,
        placeId: placeRegistry.activePlaceId,
      });
      const atJennings = placeRegistry.activePlaceId === 'place.jennings';
      if (!atJennings) this.hangarPresence.reset();
      const presenceActive = this.hangarPresence.active;
      if (presenceActive && atJennings) {
        this.hangarPresence.captureInboundFromAmbient(this.ambientTraffic);
        this.hangarPresence.applyToHangar(hb);
        this.hangarPresence.handoffInboundToHangar(hb, this.ambientTraffic, this.station);
      } else {
        hb.warmStartHeadless();
      }
      if (
        !hb.claimEmptyBayForControlled(prefer, this.ship)
      ) {
        const free = hb.getBaySignals().findIndex((s) => s === 'green');
        if (free >= 0) hb.claimEmptyBayForControlled(free, this.ship);
      }
      this.playerBayIndex = hb.getPlayerBayIndex();
    } else {
      this.playerBayIndex =
        bayFromLane != null ? bayFromLane : ((Math.random() * 3) | 0);
      this._dockPos.x = hangarPadX(this.playerBayIndex);
      this._dockPos.y = 0;
      this.ship =
        carried && !fromMenu
          ? carried
          : new Ship(this._dockPos.x, this._dockPos.y);
      if (carriedDef) this.ship.shipDef = carriedDef;
      else if (!carried || fromMenu) this._applyPendingBlueprint(this.ship);
      this._bindPlayerVessel(this.ship);
      hb.reset(this.ship, {
        playerBayIndex: this.playerBayIndex,
        placeId: placeRegistry.activePlaceId,
      });
      hb.warmStartHeadless();
    }

    this._dockPos.x = hangarPadX(this.playerBayIndex);
    this._dockPos.y = 0;
    this.ship.position.set(this._dockPos.x, this._dockPos.y);
    this.ship.affectedByGravity = false;
    this.interior.entityManager.add(this.ship, 'ship');
    this._dockLocked = true;
    this._hangarSeq = null;
    this._hangarHover = 0;
    this.hangarControlTarget = { kind: 'player' };
    this._hangarSelectPress = null;
    hb.setDevControlBay(this.playerBayIndex);
    hb.setPlayerPadAngle(SHIP.SPAWN_ANGLE);

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
    this._syncHangarPlaceTitle();
    if (this._buildStamp) this._buildStamp.classList.add('hidden');
    this._setDockHud(false);
    this._positionLaunchBtn();

    if (landing) {
      hb.abortPlayerSpaceApproachForLanding();
      this._startLandingSequence(entryAngle, entryTurret);
    } else if (fromMenu) {
      this._startElevatorArrivalSequence();
    } else {
      this._setLaunchBtnVisible(true);
    }
  }

  /** Leave hangar and restore the title screen loop. */
  exitHangar() {
    return this._guardTransition('Exit hangar → title', () => this._exitHangarBody());
  }

  _exitHangarBody() {
    if (this.mode !== 'hangar') return;
    if (this._hangarSeq) return;
    this.input.hangarPanEnabled = false;
    this.input.disable();
    this.input.consumeZoomDelta();
    this._destroyInterior();
    this.mode = 'title';
    this.paused = false;
    this._titleHasDrawn = true;
    this._enterTitleSim({ fadeIn: false });
  }

  /** Settings overlay — optional live controls sandbox on Controls tab only. */
  beginSettings(returnTo = 'title') {
    this._stopSettingsSandbox();
    this._settingsReturn = returnTo;
    this._savedCam = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      userZoom: this.camera.userZoom,
      targetUserZoom: this.camera.targetUserZoom,
      speedZoom: this.camera.speedZoom,
      effectiveZoom: this.camera.effectiveZoom,
    };
    this.mode = 'settings';
    this.renderer.setLayoutMode('default');
    if (returnTo === 'pause') {
      this.paused = true;
      this.input.paused = true;
      this.input.disable();
      this.canvas.style.opacity = '1';
    } else {
      if (this._pauseMenu) this._pauseMenu.classList.add('hidden');
      this.input.disable();
      this.paused = false;
      this._setTitleFade(1);
      this.canvas.style.opacity = '1';
    }
    if (this._controlsHud) this._controlsHud.classList.remove('hidden');
    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    this._setLaunchBtnVisible(false);
    this._setDockHud(false);
  }

  /** Live ship sandbox beside the Controls tab. */
  setSettingsSandbox(active) {
    const want = !!active;
    if (want === this._settingsSandboxActive) return want;
    if (want) this._startSettingsSandbox();
    else this._stopSettingsSandbox();
    return this._settingsSandboxActive;
  }

  _startSettingsSandbox() {
    if (this.mode !== 'settings' || this._settingsSandboxActive) return;
    this._sandboxShip = new Ship(0, 0);
    this._sandboxShip.affectedByGravity = false;
    this.precisionActive = false;
    this.entityManager.clear();
    this.particleSystem.clear();
    this.input.enable();
    this.input.paused = false;
    this.camera.position.set(0, 0);
    this.camera.offset.set(0, 0);
    this.camera.targetOffset.set(0, 0);
    this.camera.rotation = 0;
    this.camera.userZoom = 1;
    this.camera.targetUserZoom = 1;
    this.camera.speedZoom = 1;
    this.camera.effectiveZoom = 1;
    this.renderer.setLayoutMode('settings');
    this._settingsSandboxActive = true;
    if (this._sandboxSpeedHud) this._sandboxSpeedHud.classList.remove('hidden');
  }

  _stopSettingsSandbox() {
    if (!this._settingsSandboxActive && !this._sandboxShip) return;
    this._sandboxShip = null;
    this._settingsSandboxActive = false;
    this.entityManager.clear();
    this.particleSystem.clear();
    this.camera.offset.set(0, 0);
    this.camera.targetOffset.set(0, 0);
    this.camera.rotation = 0;
    if (this._sandboxSpeedHud) this._sandboxSpeedHud.classList.add('hidden');
    this.camera.rotation = 0;
    if (this._sandboxSpeedHud) this._sandboxSpeedHud.classList.add('hidden');
    if (this.mode === 'settings') {
      this.input.disable();
      this.input.paused = this._settingsReturn === 'pause';
      this.renderer.setLayoutMode('default');
      if (this._settingsReturn === 'pause' && this._savedCam) {
        this.camera.position.set(this._savedCam.x, this._savedCam.y);
        this.camera.userZoom = this._savedCam.userZoom;
        this.camera.targetUserZoom = this._savedCam.targetUserZoom;
        this.camera.speedZoom = this._savedCam.speedZoom;
        this.camera.effectiveZoom = this._savedCam.effectiveZoom;
        this.camera.offset.set(0, 0);
      }
    }
  }

  exitSettings() {
    if (this.mode !== 'settings') return;
    this._stopSettingsSandbox();
    if (this._controlsHud) this._controlsHud.classList.add('hidden');
    const ret = this._settingsReturn;
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

  /** @deprecated use beginSettings */
  beginControls(returnTo = 'title') {
    this.beginSettings(returnTo);
  }

  /** @deprecated use exitSettings */
  exitControls() {
    return this.exitSettings();
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
      rotation: this.camera.rotation,
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
    // Blueprint is always world-north up; do not inherit flight SHIP-up rotation
    // or the title vignette tilt (grid + heading readout assume rotation 0).
    this.camera.rotation = 0;
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

  /**
   * Dev full-screen Thera sector map editor.
   * @param {'title'|'hangar'|'playing'} [returnTo]
   */
  beginSectorEditor(returnTo = 'title') {
    if (!Settings.isDevMode()) return false;
    if (this.mode === 'sectorEditor') return true;
    this._sectorEditorReturn =
      returnTo === 'hangar' ? 'hangar' : returnTo === 'playing' ? 'playing' : 'title';

    if (this.mode === 'playing' || this.mode === 'hangar') {
      this._savedCam = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        userZoom: this.camera.userZoom,
        targetUserZoom: this.camera.targetUserZoom,
        speedZoom: this.camera.speedZoom,
        effectiveZoom: this.camera.effectiveZoom,
        rotation: this.camera.rotation,
      };
    }

    setSectorEditorActive(true);
    const view = this._sectorEditorView;
    view.followShip = false;
    view.panCenter.x = 0;
    view.panCenter.y = 0;
    view.zoom = 0.55;
    view.mapBody = null;
    view.mapHoverTooltip = null;
    this._sectorEditorPointer = null;

    this.mode = 'sectorEditor';
    this.input.enable();
    this.input.paused = false;
    this.canvas.style.opacity = '1';
    if (this._sectorEditorHud) this._sectorEditorHud.classList.remove('hidden');
    if (this._blueprintHud) this._blueprintHud.classList.add('hidden');
    if (this._controlsHud) this._controlsHud.classList.add('hidden');
    if (this._hangarHud) this._hangarHud.classList.add('hidden');
    this._setLaunchBtnVisible(false);
    this._setDockHud(false);
    if (typeof this.onSectorEditorEnter === 'function') this.onSectorEditorEnter();
    return true;
  }

  exitSectorEditor() {
    if (this.mode !== 'sectorEditor') return null;
    setSectorEditorActive(false);
    this._sectorEditorPointer = null;
    if (this._sectorEditorHud) this._sectorEditorHud.classList.add('hidden');
    const ret = this._sectorEditorReturn;

    if (ret === 'playing') {
      this.mode = 'playing';
      this.input.enable();
      this.input.paused = false;
      if (this._savedCam) {
        this.camera.position.set(this._savedCam.x, this._savedCam.y);
        this.camera.userZoom = this._savedCam.userZoom;
        this.camera.targetUserZoom = this._savedCam.targetUserZoom;
        this.camera.speedZoom = this._savedCam.speedZoom;
        this.camera.effectiveZoom = this._savedCam.effectiveZoom;
        this.camera.rotation = this._savedCam.rotation || 0;
        this.camera.offset.set(0, 0);
      }
      this._setDockHud(false);
      return 'playing';
    }

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
        this.camera.rotation = this._savedCam.rotation || 0;
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

  getSectorEditorView() {
    return this._sectorEditorView;
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
    if (this.mode === 'hangar' && this.interior) {
      placeRegistry.setActive(
        this.interior.hangarBay.placeId || 'place.jennings',
        this.interior.hangarBay.areaId || null
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

  /** Dev: full exterior hull restore (works in hangar and space). */
  restoreExteriorHull() {
    if (!this.ship) return;
    applyHullHeal(this.ship, 1, 'exterior');
  }

  /** Switch active Place preset and rebuild hangar if live. */
  applyPlacePreset(placeId) {
    const place = placeRegistry.applyPreset(placeId);
    if (!place) return false;
    if (this.mode === 'hangar' && this.interior) {
      this.interior.hangarBay.reset(this.ship, {
        playerBayIndex: this.playerBayIndex,
        placeId: place.id,
      });
      this.interior.hangarBay.warmStartHeadless();
      this._syncHangarPlaceTitle();
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
        this.camera.rotation = this._savedCam.rotation || 0;
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
    this._setDeathOverlay(false);
    this.combat.clear();
    this.input.disable();
    this.input.consumeZoomDelta();
    this._destroyInterior();
    this._hangarSeq = null;
    this.mode = 'title';
    this._titleHasDrawn = true;
    this._enterTitleSim({ fadeIn: false });
  }

  _clearPlaySession() {
    this._destroyInterior();
    this.entityManager.clear();
    this.particleSystem.clear();
    this.ship = null;
    this.precisionActive = false;
    this.speedStreaks = new SpeedStreaks();
    this._initDepthCompositor();
    this._exitBurn = false;
    this._exitBurnFailsafe = 0;
    this._approachHoldAI = null;
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
    const frameOpts = { frameVx: station.vx ?? 0, frameVy: station.vy ?? 0 };
    const signals = station._padOccupancy || station.baySignals;
    station.setBaySignals(signals);
    const greens = [0, 1, 2].filter((i) => station.padAvailable(i, ship));

    ai.t += dt;

    if (ai.phase === 'hold') {
      // Never stay in hold while a pad is open
      if (greens.length) {
        let best = greens[0];
        let bestD = Infinity;
        for (const g of greens) {
          const d = station.lateralLocalDistance(ship.position.x, ship.position.y, g);
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
          ...frameOpts,
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
          const d = station.lateralLocalDistance(ship.position.x, ship.position.y, g);
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
          ...frameOpts,
        });
        return;
      }
    }

    const target = station.approachTargetWorld(
      lane,
      station.isNearRunwayMouth(ship.position.x, ship.position.y, lane)
    );
    const approachSpd = Math.min(STATION.DOCK_MAX_SPEED * 0.8, 95);
    cruiseTo(ship, target.x, target.y, approachSpd, dt, {
      arrivalR: 40,
      brakeForArrival: true,
      yawMult: station.isNearRunwayMouth(ship.position.x, ship.position.y, lane) ? 1.35 : 1.15,
      speedBand: AMBIENT.COAST_SPEED_BAND,
      headingTol: station.isNearRunwayMouth(ship.position.x, ship.position.y, lane)
        ? 0.35
        : AMBIENT.COAST_HEADING_TOL,
      ...frameOpts,
    });
    if (station.shouldAutoIngress(ship) && !this._inExitGrace()) {
      this._releaseHoldingPattern();
      this.requestDock({ force: true });
    }
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
    if (this.mode !== 'playing' || this.combat.playerDead(this.ship)) return;
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
    for (const id of ['settings-fullscreen-btn', 'settings-fullscreen-inline-btn']) {
      const el = document.getElementById(id);
      if (el) el.textContent = label;
    }
  }

  requestLaunch() {
    return this._guardTransition('Hangar launch request', () => this._requestLaunchBody());
  }

  /** Relaunch from last dock after combat destruction (keeps loadout). */
  requestCombatRespawn() {
    return this._guardTransition('Combat respawn quick launch', () => this._combatRespawnBody());
  }

  _recordLastDock(placeId, bayIndex) {
    if (placeId) this._lastDockPlaceId = placeId;
    if (Number.isFinite(bayIndex)) this._lastDockBayIndex = bayIndex | 0;
  }

  _setDeathOverlay(show) {
    if (!this._deathMenu) return;
    this._deathMenu.classList.toggle('hidden', !show);
    if (show && this._deathDockLabel) {
      const place = placeRegistry.get(this._lastDockPlaceId || 'place.jennings');
      const label = place?.label || 'Jennings Station';
      this._deathDockLabel.textContent = `Relaunch from ${label}`;
    }
  }

  _combatRespawnBody() {
    if (this.mode !== 'playing' || !this.combat.playerDead(this.ship)) return;

    const placeId = this._lastDockPlaceId || 'place.jennings';
    placeRegistry.setActive(placeId);
    syncStationToPlace(this.station, placeId, this.gameTime || 0);
    this.poiSystem.syncPositions(this.gameTime || 0);

    const bay = Number.isFinite(this._lastDockBayIndex)
      ? this._lastDockBayIndex
      : this.playerBayIndex ?? 1;
    const ship = this.ship;
    const carriedDef = ship.shipDef ? cloneShipDef(ship.shipDef) : null;

    this.combat.clear();
    this.entityManager.clear();
    this.particleSystem.clear();

    ship.combatDestroyed = false;
    if (carriedDef) ship.shipDef = carriedDef;
    ensureVesselSimState(ship);
    applyHullHeal(ship, 1, 'exterior');
    applyFuelFill(ship, 1);
    applyAmmoFill(ship, 1);

    this._activateSpaceEgress(ship, bay, {
      source: 'respawn',
      beginExpedition: !this._expeditionActive,
    });
    this._setDeathOverlay(false);
  }

  _requestLaunchBody() {
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
    if (this._inExitGrace()) return;
    if (this._approachHoldAI) return; // AI already working the approach
    this._syncStationWorldFrame();
    const vx = this.ship.velocity.x;
    const vy = this.ship.velocity.y;
    // Station full → Enter/Click engages AI holding pattern (then land when open)
    if (this.station.allBaysBlocked(this.ship)) {
      if (this.station.inApproach(this.ship.position.x, this.ship.position.y)) {
        this._engageHoldingPattern();
      }
      return;
    }
    if (!opts.force) {
      if (!this.station.canRequestDock(this.ship.position.x, this.ship.position.y, vx, vy)) {
        return;
      }
    } else if (
      !this.station.isSafeDockSpeed(
        vx,
        vy,
        this.ship.position.x,
        this.ship.position.y
      )
    ) {
      return;
    }
    const edge = this.station.ingressEdgeWorld(this.ship);
    const lane = this.station.laneIndexFromWorld(edge.x, edge.y);
    if (!this.station.padAvailable(lane, this.ship)) return;
    const dockEntry = this.stationField.getEntryForStation(this.station);
    if (dockEntry?.placeId) {
      placeRegistry.setActive(dockEntry.placeId);
      this._recordLastDock(dockEntry.placeId, lane);
    }
    const entryAngle =
      this.station.worldHeadingToHangar(this.ship.angle) ?? this.ship.angle;
    const entryTurret =
      this.station.worldHeadingToHangar(this.ship.turretAngle) ??
      this.ship.turretAngle;
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
    this.ship.affectedByGravity = false;
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
    this._recordLastDock(placeRegistry.activePlaceId, this.playerBayIndex);
  }

  _finishLaunchToSpace() {
    return this._guardTransition('Hangar launch → space handoff', () =>
      this._finishLaunchToSpaceBody()
    );
  }

  _finishLaunchToSpaceBody() {
    const ship = this.ship;
    if (!ship) return;

    const launchBay = this.playerBayIndex;
    if (this.interior) {
      this.hangarPresence.exportFromHangar(this.interior.hangarBay);
      this.interior.hangarBay.clearOps(launchBay);
      this.interior.hangarBay.clearControlledPadAfterLaunch();
    }

    const t = finiteGameTime(this.gameTime);
    if (this.interior?.spaceFrozen) {
      this.interior.catchUpExterior(this);
    } else {
      const placeId = placeRegistry.activePlaceId || this._lastDockPlaceId || 'place.jennings';
      syncStationToPlace(this.station, placeId, t);
      this.poiSystem.syncPositions(t);
    }

    this._destroyInterior();
    this._activateSpaceEgress(ship, launchBay, { source: 'hangar' });
  }

  _finishLanding() {
    return this._guardTransition('Space landing → hangar settle', () => this._finishLandingBody());
  }

  _finishLandingBody() {
    this._hangarSeq = null;
    this._dockLocked = true;
    this._hangarHover = 0;
    this.ship.position.set(this._dockPos.x, this._dockPos.y);
    this.ship.velocity.set(0, 0);
    this.ship.angle = SHIP.SPAWN_ANGLE;
    this.ship.turretAngle = SHIP.SPAWN_ANGLE;
    this.ship.affectedByGravity = false;
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
    this._recordLastDock(placeRegistry.activePlaceId, this.playerBayIndex);
    if (this._archiveExpeditionOnSettle) {
      this.endExpedition();
      this._archiveExpeditionOnSettle = false;
    }
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

    try {
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
      } else if (this.mode === 'settings' && this.input.consumePauseToggle()) {
        const dest = this.exitSettings();
        if (typeof this.onSettingsExit === 'function') this.onSettingsExit(dest);
      } else if (this.mode === 'blueprint' && this.input.consumePauseToggle()) {
        const dest = this.exitBlueprint();
        if (typeof this.onBlueprintExit === 'function') this.onBlueprintExit(dest);
      } else if (this.mode === 'sectorEditor' && this.input.consumePauseToggle()) {
        const dest = this.exitSectorEditor();
        if (typeof this.onSectorEditorExit === 'function') this.onSectorEditorExit(dest);
      }

      const speed = this.simSpeed;
      // Title always ticks (sim-speed pause must not leave a hangar zoom stuck on the backdrop).
      if (this.mode === 'title') {
        const deltaTime = Math.min(rawDt, 0.05);
        this._lastFrameDt = deltaTime;
        this.gameTime += deltaTime;
        this._updateTitle(deltaTime);
      } else if (
        this.mode === 'settings' &&
        !this._settingsSandboxActive &&
        this._settingsReturn !== 'pause'
      ) {
        const deltaTime = Math.min(rawDt, 0.05);
        this._lastFrameDt = deltaTime;
        this.gameTime += deltaTime;
        this._updateTitle(deltaTime);
      } else if (!this.paused && speed > 0) {
        const deltaTime = Math.min(rawDt * speed, 0.05 * Math.max(1, speed));
        if (!Number.isFinite(this.gameTime)) {
          this.gameTime = 0;
        }
        this.gameTime += deltaTime;
        if (!Number.isFinite(this.gameTime)) this.gameTime = 0;
        if (this.mode === 'hangar') {
          this._updateHangar(deltaTime);
        } else if (this.mode === 'settings' && this._settingsSandboxActive) {
          this._updateControls(deltaTime);
        } else if (this.mode === 'blueprint') {
          this._updateBlueprint(deltaTime);
        } else if (this.mode === 'sectorEditor') {
          this._updateSectorEditor(deltaTime);
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
    } catch (err) {
      console.error('[Hyperdrift] frame error', err);
      this._reportTransitionError('Frame tick', err);
    }
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

    this.depthCompositor.update(deltaTime, {
      shipVelocity: { x: 0, y: 0 },
      shipSpeed: 0,
      viewportRadius: this.renderer.viewportRadius,
    });

    this.asteroidSystem.update(
      this.camera.position.x,
      this.camera.position.y,
      this.gameTime || 0,
      this._asteroidStreamOpts()
    );
    const asteroids = this.asteroidSystem.getActiveAsteroids();
    this._frameAsteroids = asteroids;
    this._frameAsteroids = asteroids;

    this.ambientTraffic.update(deltaTime, {
      player: null,
      station: this.station,
      hangarBay: null,
      asteroids,
      particles: this.particleSystem,
      layout: getSectorLayout(),
      gameTime: this.gameTime || 0,
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

  /** Hangar bay sim when an interior instance is loaded; null in exterior space. */
  get hangarBay() {
    return this.interior?.hangarBay ?? null;
  }

  /**
   * Hangar manifest API for exterior space: full HangarBay in hangar mode,
   * otherwise HangarPresence (pad beacons, getSpaceArrivalRequests, acceptSpaceArrival, drainSpaceEgress).
   */
  get spaceHangarBridge() {
    return this.hangarBay ?? (this.hangarPresence.active ? this.hangarPresence : null);
  }

  _destroyInterior() {
    if (!this.interior) return;
    this.interior.destroy();
    this.interior = null;
  }

  /** @returns {InteriorSession|null} */
  _activeInterior() {
    return this.interior;
  }

  _initDepthCompositor() {
    this.depthCompositor = new DepthCompositor(
      this.starfield,
      this.nebulaField,
      this.speedStreaks,
      this.dustLayer,
      () => this.asteroidSystem.getNebulae()
    );
  }

  _depthPaintParams(fullscreen = false) {
    return {
      cameraX: this.camera.position.x,
      cameraY: this.camera.position.y,
      time: this.gameTime,
      coverRadius: fullscreen
        ? this._coverRadius()
        : this.renderer.viewportRadius + 200,
      zoom: this.camera.effectiveZoom,
      renderer: this.renderer,
      camera: this.camera,
    };
  }

  _coverRadius() {
    return Math.hypot(this.renderer.centerX, this.renderer.centerY) + 40;
  }

  _updateHangar(deltaTime) {
    if (!this.ship || !this.interior) return;
    this.interior.applyFrozenAnchor(this.station);
    const intEm = this.interior.entityManager;
    const intPs = this.interior.particleSystem;

    const editing = HangarLayoutEditor.isActive();
    const seqLock = !!this._hangarSeq;
    // LMB drag pans (empty space in edit); LMB also fires when a ship is selected.
    // While dragging a layout item, pan is suppressed. Enter/exit sequences lock pan
    // (but still allow scroll zoom).
    this.input.hangarPanEnabled =
      !seqLock &&
      (!editing || !HangarLayoutEditor.drag) &&
      !this.hangarBay.isServiceScrollDragging();
    const mw = this._mouseWorld();
    if (!editing && !seqLock) {
      if (this.hangarBay.handleServiceScrollPointer(this.input.mouseDown, mw.x, mw.y)) {
        this.input.cancelHangarPan();
      }
    }
    const zoomPending = this.input.zoomDelta;
    const svcBay =
      !editing && !seqLock ? this.hangarBay.pickServiceColumnAt(mw.x, mw.y) : -1;
    let zoomWheel = 0;
    if (svcBay >= 0 && Math.abs(zoomPending) > 0) {
      this.hangarBay.applyServiceWheel(svcBay, zoomPending);
      this.input.consumeZoomDelta();
    } else {
      zoomWheel = this.input.consumeZoomDelta();
    }
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

    intEm.update(deltaTime);
    intPs.update(deltaTime);

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

      if (!this._hangarSeq) {
        this._syncPlayerHangarPose();
      }

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
          [...intEm.getByType('projectile')],
          deltaTime
        );
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
      this.interior?.weaponSystem.update(this.ship, this.input, aimWorld, true, [], deltaTime, {
        gravityEnabled: false,
        consumeAmmo: false,
      });
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
    this.interior?.particleSystem.clearShipSpace(null);
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
    this.interior?.weaponSystem.update(puppet, this.input, aimWorld, true, [], deltaTime, {
      gravityEnabled: false,
      consumeAmmo: false,
    });
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
    const intPs = this.interior?.particleSystem;
    if (!intPs) return;
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
      this.renderer.emitThrusterParticles(this.ship, intPs);
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
      this.renderer.emitThrusterParticles(shipLike, intPs, {
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
          // Once nearly stopped, creep the rest of the way over the pad
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

    this.weaponSystem.update(ship, this.input, aimWorld, pointerInViewport, [], deltaTime, {
      gravityEnabled: false,
      consumeAmmo: false,
    });
    ship.update(deltaTime);
    this.entityManager.update(deltaTime);
    this.particleSystem.update(deltaTime);

    this._applyViewRotation(ship);
    this.camera.update(
      ship.position,
      ship.velocity,
      deltaTime,
      this.renderer.viewportRadius,
      zoomWheel
    );

    const speed = ship.velocity.length();
    this.depthCompositor.update(deltaTime, {
      shipVelocity: { x: ship.velocity.x, y: ship.velocity.y },
      shipSpeed: speed,
      viewportRadius: this.renderer.viewportRadius,
    });

    this.renderer.emitThrusterParticles(ship, this.particleSystem);
    this._syncSandboxSpeedHud(speed);
  }

  _syncSandboxSpeedHud(speed = 0) {
    if (!this._settingsSandboxActive) return;
    if (this._sandboxSpeedValue) {
      this._sandboxSpeedValue.textContent = String(Math.round(speed));
    }
    if (!this._sandboxSpeedHud) return;
    const r = this.renderer;
    if (!r?.width) return;
    const pad = 10;
    const left = r.centerX + r.viewportRadius + pad;
    const top = r.centerY - r.viewportRadius + pad;
    this._sandboxSpeedHud.style.left = `${left}px`;
    this._sandboxSpeedHud.style.top = `${top}px`;
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
      this.weaponSystem.update(ship, this.input, aimWorld, true, [], deltaTime, {
        gravityEnabled: false,
        consumeAmmo: false,
      });
      ship.update(deltaTime);
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
    this.camera.rotation = 0;
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
    if (!this.ship || this.mode !== 'playing') return;
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
    if (!Number.isFinite(this.gameTime)) this.gameTime = 0;
    this._sanitizeShipPose();
    this._lastFrameDt = deltaTime;

    const zoomWheel = this.input.consumeZoomDelta();
    // Full SCAN: wheel steps one pip-ring of scope zoom (camera zoom unchanged).
    let camZoomWheel = zoomWheel;
    if (this.scanView === 'scan' && zoomWheel !== 0) {
      this.radarSystem.stepPlotZoom(zoomWheel);
      camZoomWheel = 0;
    }
    if (
      this.mode === 'playing' &&
      zoomWheel !== 0 &&
      this.cockpitPanels.processPowerPanelInput(this, this.input, zoomWheel)
    ) {
      camZoomWheel = 0;
    } else if (this.mode === 'playing') {
      this.cockpitPanels.processPowerPanelInput(this, this.input, 0);
    }
    if (
      this.mode === 'playing' &&
      zoomWheel !== 0 &&
      this.cockpitPanels.processSectorMapInput(this, this.input, zoomWheel)
    ) {
      camZoomWheel = 0;
    } else if (
      this.mode === 'playing' &&
      (zoomWheel !== 0 ||
        this.input.mouseDown ||
        this.cockpitPanels._mapDragTracking)
    ) {
      this.cockpitPanels.processSectorMapInput(this, this.input, 0);
    }

    if (
      this.pipLoadoutFlash &&
      (this.gameTime || 0) >= this.pipLoadoutFlash.until
    ) {
      this.pipLoadoutFlash = null;
    }

    if (this.mode === 'playing') {
      processPipLoadoutModalInput(this);
      processSectorMapModalInput(this);
      processPoiBookModalInput(this);
    }

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
    this._syncShipStatusWeapons();
    this._processCockpitClicks();
    this._processCockpitMiddleClicks();
    this._processCockpitRightClicks();
    this._processGrappleClick();

    this._syncStationWorldFrame();

    if (this.ship) {
      const motionFrame = this._stationMotionFrame();
      const relSpeedForHold = motionFrame
        ? this.station.relativeSpeed(this.ship.velocity.x, this.ship.velocity.y)
        : this.ship.velocity.length();
      this.input.tryToggleZeroHold(relSpeedForHold);
      const fi = this.input.getFlightInput();
      if (
        this.input.zeroHoldActive &&
        (fi.forward ||
          fi.reverse ||
          fi.left ||
          fi.right ||
          fi.mainEngine ||
          fi.afterburner)
      ) {
        this.input.cancelZeroHold();
      } else if (
        this.input.zeroHoldActive &&
        relSpeedForHold > PHYSICS.ZERO_HOLD_CANCEL_SPEED
      ) {
        this.input.cancelZeroHold();
      } else if (this.input.zeroHoldBlurRecover && this.input.zeroHoldActive && this.ship) {
        this.input.zeroHoldBlurRecover = false;
        if (motionFrame) {
          this.ship.velocity.set(motionFrame.vx, motionFrame.vy);
        } else {
          this.ship.velocity.set(0, 0);
        }
      }
    }

    const syncAssist = this._computeSyncAssist();
    this._syncAssistScore = syncAssist.score;
    this._syncAssistEnabled = syncAssist.enabled;
    const syncTarget = this._resolveSyncTarget(syncAssist);
    const motionFrame = this._stationMotionFrame();

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
          deltaTime,
          syncTarget,
          motionFrame
        );
      }
    } else if (this.combat.playerDead(this.ship)) {
      this._clearShipThrusters(this.ship);
      this.ship.velocity.set(0, 0);
      this.ship.angularVelocity = 0;
    } else {
      this.shipController.update(
        this.ship,
        this.input,
        this.precisionActive,
        deltaTime,
        syncTarget,
        motionFrame
      );
    }
    this.ship.update(deltaTime);

    if (this.mode === 'playing') {
      this.warpGateSystem.update(this.ship, this.gameTime || 0, deltaTime);
      this.trafficEnforcement.update(this, deltaTime);
      const fineToast = this.trafficEnforcement.getToast();
      if (fineToast && fineToast !== this._lastFineToast) {
        this._lastFineToast = fineToast;
        this._navArrivalFlashText = fineToast;
        this._navArrivalFlashUntil = (this.gameTime || 0) + 3;
      } else if (!fineToast) {
        this._lastFineToast = '';
      }
      this._tickIronCrownStub();
      this.poiSystem.update({
        ship: this.ship,
        gameTime: this.gameTime || 0,
        onDiscover: () => this.persistNavProfile(),
      });
      this.sectorMap.update({
        ship: this.ship,
        scanRange: this.radarSystem.on ? this.radarSystem.range : 0,
      });
    }

    const asteroids = this._frameAsteroids || this.asteroidSystem.getActiveAsteroids();

    // Pose rocks for this frame before weapons so laser contact matches render.
    this.asteroidSystem.syncKinematics(this.gameTime || 0, deltaTime);

    if (this.hangarPresence.active) {
      this.hangarPresence.tick(deltaTime, this.gameTime || 0);
    }

    const spaceHangar = this.spaceHangarBridge;
    const zoomPreCombat = Math.max(0.001, this.camera.effectiveZoom);
    this.ambientTraffic.update(deltaTime, {
      player: this.ship,
      station: this.station,
      hangarBay: spaceHangar,
      asteroids,
      particles: this.particleSystem,
      gameTime: this.gameTime || 0,
      layout: getSectorLayout(),
      camera: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        viewRadius: this.renderer.viewportRadius / zoomPreCombat,
      },
    });

    this.combat.updateSpaceflight({
      ship: this.ship,
      weaponSystem: this.weaponSystem,
      input: this.input,
      aimWorld,
      pointerInViewport,
      asteroids,
      ambientTraffic: this.ambientTraffic,
      entityManager: this.entityManager,
      particles: this.particleSystem,
      renderer: this.renderer,
      cockpitFrame: this.cockpitFrame,
      deltaTime,
      onDeathOverlayReady: () => this._setDeathOverlay(true),
      onPlayerDeathUi: () => {
        if (this._pauseMenu) this._pauseMenu.classList.add('hidden');
        this.paused = false;
        this.input.paused = false;
      },
    });

    // Cool cracks after laser heat so active modules aren't double-penalized.
    for (const ast of asteroids) {
      ast.tickCrackCooldown?.(deltaTime);
    }

    const logHooks = { pushShipLog: (m) => this.pushShipLog(m) };
    this.miningDropSystem.update(this.ship, deltaTime, logHooks);
    this.grappleSystem.update(
      this.ship,
      deltaTime,
      this.miningDropSystem,
      logHooks
    );

    // Interior crew sim only while the player is inside the vessel graph (not during spaceflight).
    if (this.interiorActive && this.ship?.interiorPlaceId) {
      const vPlace = placeRegistry.get(this.ship.interiorPlaceId);
      if (vPlace) tickVesselInteriorCrew(this.ship, vPlace, deltaTime);
    }

    this.particleSystem.update(deltaTime);

    this._applyViewRotation();
    const wreckPose = this.combat.playerDead(this.ship)
      ? this.combat.getWreckCameraPose(this.ship)
      : null;
    this.camera.update(
      wreckPose ? wreckPose.pos : this.ship.position,
      wreckPose ? wreckPose.vel : this.ship.velocity,
      deltaTime,
      this.renderer.viewportRadius,
      camZoomWheel
    );

    const speedForStream = this.ship.velocity.length();
    this.asteroidSystem.update(
      this.ship.position.x,
      this.ship.position.y,
      this.gameTime || 0,
      this._asteroidStreamOpts({
        shipSpeed: speedForStream,
        shipVx: this.ship.velocity.x,
        shipVy: this.ship.velocity.y,
        deltaTime,
        skipKinematicSync: true,
      })
    );
    this._frameAsteroids = this.asteroidSystem.getActiveAsteroids();

    if (this.mode === 'playing') {
      this.navRoute.resolvePosition(this);
      const arrSpeed = this.ship.velocity.length();
      const arrRadius = NAV.effectiveArrivalRadius(arrSpeed);
      if (this.navRoute.checkArrival(this.ship, arrRadius, this)) {
        this.persistNavProfile();
        this._flashNavArrivalStatus();
      }
    }

    const speedAfter = this.ship.velocity.length();
    const shipVx = this.ship.velocity.x;
    const shipVy = this.ship.velocity.y;
    this.depthCompositor.update(
      deltaTime,
      {
        shipVelocity: { x: shipVx, y: shipVy },
        shipSpeed: speedAfter,
        viewportRadius: this.renderer.viewportRadius,
      }
    );

    this.renderer.emitThrusterParticles(this.ship, this.particleSystem);

    const baySignals = spaceHangar?.getBaySignals?.() ?? ['green', 'green', 'green'];
    this.station.setBaySignals(baySignals);

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

    this._updateHUD();

    // Ingress/dock queries run after ship physics — re-sync station so roof
    // volumes track the live anchor (avoids one-frame lag on orbital motion).
    this._syncStationWorldFrame();

    if (this.mode === 'playing' && this.radarSystem && this.renderer.radarBand) {
      const geo = this._radarGeometry();
      this.radarSystem.update(deltaTime, {
        ship: this.ship,
        station: this.station,
        stationName: placeRegistry.getActive()?.label || 'Station',
        ambientTraffic: this.ambientTraffic,
        asteroids,
        miningDrops: this.miningDropSystem.getDrops(),
        occlusion: this.contactOcclusion,
        occlusionOn: Settings.isOcclusion(),
        camera: this.camera,
        gameTime: this.gameTime || 0,
        radarPips: this.pipSystem.get('radar'),
        centerX: this.renderer.centerX,
        centerY: this.renderer.centerY,
        innerR: geo.innerR,
        outerR: geo.outerR,
        band: geo.band,
        plotPad: geo.plotPad,
        fullScope: geo.fullScope,
      });

      // Forward scanner (sweep arm shows even with an empty contact list).
      if (this.mode === 'playing') {
        this.forwardScanSystem.update(deltaTime, {
          ship: this.ship,
          contacts: this.radarSystem.contacts,
          occlusion: this.contactOcclusion,
          input: this.input,
          pipSystem: this.pipSystem,
          radarSystem: this.radarSystem,
          scanView: this.scanView,
          gameTime: this.gameTime || 0,
        });
      }
    }

    const stationFull = this.station.allBaysBlocked(this.ship);
    const dockState = this.station.dockApproachState(this.ship);
    const canDock = !stationFull && dockState.canDock;
    const near = dockState.inDockZone;
    const canEngageHold = stationFull && near && !this._approachHoldAI;
    this.station.updateApproachLights(this.ship);
    if (!this.combat.playerDead(this.ship)) {
      this._setDockHud(near || !!this._approachHoldAI || this._inExitGrace());
    }
    if (this._dockHud) {
      this._dockHud.classList.toggle('ready', (canDock || canEngageHold) && !this._inExitGrace());
      if (this._inExitGrace()) {
        const left = Math.max(0, this._exitIngressBlockedUntil - finiteGameTime(this.gameTime));
        this._dockHud.textContent = `EXIT IN PROGRESS · ${left.toFixed(1)}s`;
      } else if (this._approachHoldAI) {
        this._dockHud.textContent =
          'HOLDING PATTERN · MOVE TO RESUME CONTROL';
      } else if (canEngageHold) {
        this._dockHud.textContent =
          'ENTER / CLICK — ENGAGE HOLDING PATTERN';
      } else if (canDock) {
        this._dockHud.textContent = 'ENTER / CLICK — DOCK IN GREEN BAY';
      } else if (stationFull) {
        this._dockHud.textContent = 'STATION FULL — APPROACH TO HOLD';
      } else if (dockState.reason === 'speed') {
        this._dockHud.textContent =
          `SLOW TO < ${STATION.DOCK_MAX_SPEED} STN REL · NOW ${Math.round(dockState.relSpeed)}`;
      } else if (dockState.reason === 'position') {
        this._dockHud.textContent =
          `ALIGN GREEN PAD · ${Math.round(dockState.relSpeed)} stn rel`;
      } else if (dockState.reason === 'pad') {
        this._dockHud.textContent =
          `WAIT FOR GREEN PAD · ${Math.round(dockState.relSpeed)} stn rel`;
      } else {
        this._dockHud.textContent =
          'FOLLOW APPROACH LIGHTS · LAND ON A GREEN PAD';
      }
    }
    // Hull-edge under roof into a green lane (not while AI is holding or egress grace)
    if (!this._approachHoldAI && this.ship && !this._inExitGrace()) {
      const autoDiag = this.station.autoIngressDiag(this.ship);
      if (autoDiag.pass) {
        this.requestDock({ force: true });
      }
    }
  }

  _renderBackground({ fullscreen = false } = {}) {
    this.depthCompositor.paintBelowPlayable(
      this.renderer.ctx,
      this._depthPaintParams(fullscreen)
    );
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
      if (this.station.shouldOccludeShip(pose)) ambientOccluded.push(a);
      else ambientClear.push(a);
    }
    const anyOccluded = ambientOccluded.length > 0;

    const titleLabels = this._stationLabelOpts(this.station);
    this.renderer.renderWorldLayer((ctx) => {
      this.station.render(ctx, {
        time: this.gameTime,
        ship: null,
        speed: 0,
        baySignals,
        layer: anyOccluded ? 'under' : 'all',
        ...titleLabels,
      });
    }, this.camera);

    this.renderer.renderAsteroids(
      this._frameAsteroids || this.asteroidSystem.getActiveAsteroids(),
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
          ...titleLabels,
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
        ...titleLabels,
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
      this._renderBackground({ fullscreen: true });
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

    if (this.mode === 'settings') {
      if (this._settingsSandboxActive) {
        this.renderer.beginFrame();
        this._renderControls();
        return;
      }
      if (this._settingsReturn === 'pause' && this.ship) {
        this.renderer.beginFrame();
        this._renderPlayingCockpit();
        return;
      }
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
      return;
    }

    this.renderer.beginFrame();

    if (this.mode === 'hangar') {
      this._renderHangar();
      return;
    }

    if (this.mode === 'blueprint') {
      this._renderBlueprint();
      return;
    }

    if (this.mode === 'sectorEditor') {
      this._renderSectorEditor();
      return;
    }

    const playerDead = this.combat.playerDead(this.ship);
    const hudBursting = this.combat.hudBursting(this.ship);

    if (playerDead && !hudBursting) {
      this._renderDeathView();
    } else {
      this._renderPlayingCockpit();
    }
  }

  /** Normal in-flight cockpit frame (also used frozen behind Settings from pause). */
  _renderPlayingCockpit() {
    const hudBursting = this.combat.hudBursting(this.ship);

    this.renderer.setupCircularClip();
    if (this.scanView === 'scan') {
      this._renderScanBackdrop();
      this._renderScanScopeShadow();
    } else this._renderPlayWorld();
    this.renderer.endCircularClip();

    this._renderRadar();
    this._renderViewportTelemetry();
    this.cockpitFrame.render(this.renderer.ctx, this.renderer);
    this.cockpitFrame.drawPoiDots(
      this.renderer.ctx,
      this.renderer,
      this.poiSystem,
      this.ship,
      this.camera.rotation || 0,
      this.gameTime || 0
    );
    this.cockpitFrame.drawNavRouteDot(
      this.renderer.ctx,
      this.renderer,
      this.navRoute,
      this.ship,
      this,
      this.camera.rotation || 0
    );
    this.cockpitPanels.render(this.renderer.ctx, this);
    this._renderCornerReadouts();
    if (hudBursting) this.combat.renderHudBurst(this.renderer.ctx);
  }

  /** Full-window space view after the HUD breakup — wreck + traffic, no cockpit chrome. */
  _renderDeathView() {
    this._renderBackground({ fullscreen: true });
    this._renderPlayWorldLayers();
  }

  /** The normal flight world drawn inside the viewport circle (PORT view). */
  _renderPlayWorld() {
    this._renderBackground({ fullscreen: false });
    this._renderPlayWorldLayers();
  }

  /** World entities shared by the circular viewport and fullscreen death view. */
  _renderPlayWorldLayers() {

    this.renderer.renderWorldLayer((ctx) => {
      drawRingBackdrop(ctx, this.camera, this.renderer.viewportRadius);
    }, this.camera);

    this.depthCompositor.paintAtPlayable(
      this.renderer.ctx,
      this._depthPaintParams(false)
    );

    const activeStation = this.station;
    const camPos = this.camera.position;
    const zoom = this.camera.effectiveZoom || 1;
    const viewR =
      (this.renderer.viewportRadius + 200) / Math.max(zoom, 0.05);

    // Background stations (green pads, no player occlusion)
    for (const { station } of this.stationField.listEntries()) {
      if (station === activeStation) continue;
      if (!this.stationField.isNearCamera(station, camPos, viewR)) continue;
      this.renderer.renderWorldLayer((ctx) => {
        station.render(ctx, {
          time: this.gameTime,
          ship: null,
          baySignals: DEFAULT_BAY_SIGNALS,
          layer: 'all',
          ...this._stationLabelOpts(station),
        });
      }, this.camera);
    }

    const baySignals = activeStation?.baySignals ?? DEFAULT_BAY_SIGNALS;
    const playerOccluded =
      !!this.ship &&
      !!activeStation &&
      activeStation.shouldOccludeShip(this.ship, {
        egressGrace: this._inExitGrace(),
      });
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
      if (activeStation?.shouldOccludeShip(pose)) ambientOccluded.push(a);
      else ambientClear.push(a);
    }
    const anyOccluded = playerOccluded || ambientOccluded.length > 0;

    const activeLabels = activeStation ? this._stationLabelOpts(activeStation) : {};
    if (activeStation) {
      this.renderer.renderWorldLayer((ctx) => {
        activeStation.render(ctx, {
          time: this.gameTime,
          ship: this.ship,
          baySignals,
          layer: anyOccluded ? 'under' : 'all',
          ...activeLabels,
        });
      }, this.camera);
    }

    const shepherdMoons = this._shepherdMoonBuf;
    shepherdMoons.length = 0;
    const moonSites = this._shepherdMoonSites;
    const moonT = this.gameTime;
    for (let i = 0; i < moonSites.length; i++) {
      const site = moonSites[i];
      const pos = siteWorldPosition(site, moonT);
      shepherdMoons.push({
        x: pos.x,
        y: pos.y,
        radius: site.radius ?? 8000,
      });
    }
    this.renderer.renderShepherdMoons(shepherdMoons, this.camera);

    this.renderer.renderAsteroids(
      this._frameAsteroids || this.asteroidSystem.getActiveAsteroids(),
      this.camera
    );

    this.renderer.renderMiningDrops(this.miningDropSystem.getDrops(), this.camera);

    this.renderer.renderWorldLayer((ctx) => {
      this.ambientTraffic.render(ctx, { only: ambientOccluded });
    }, this.camera);

    if (playerOccluded && this.ship && !this.combat.playerDead(this.ship)) {
      this.renderer.renderShip(this.ship, this.camera);
    }

    const exhaustHulls = this._exhaustHullPoses();
    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      this.ship,
      { layer: 'under', shipLocalUnder: playerOccluded, hulls: exhaustHulls }
    );

    if (anyOccluded && activeStation) {
      this.renderer.renderWorldLayer((ctx) => {
        activeStation.render(ctx, {
          time: this.gameTime,
          ship: this.ship,
          baySignals,
          layer: 'over',
          ...activeLabels,
        });
      }, this.camera);
    }

    this.renderer.renderWorldLayer((ctx) => {
      this.ambientTraffic.render(ctx, { only: ambientClear });
    }, this.camera);

    // Occlusion umbra — pitch-black shadows behind nearer contacts (SHIP view only).
    if (this.scanView !== 'scan') this._renderWorldOcclusionShadow();

    // Grapple cable below the ship hull — belly port.
    this.renderer.renderGrappleCable(
      this.grappleSystem.cableSegment(this.ship),
      this.camera
    );

    if (this.ship && !playerOccluded && !this.combat.playerDead(this.ship)) {
      this.renderer.renderShip(this.ship, this.camera);
    }

    this.renderer.renderWorldLayer((ctx) => {
      this.combat.renderBreakup(ctx);
    }, this.camera);

    // Floating bay beacons above all ships (lane-centered runway overhead lights)
    if (activeStation) {
      this.renderer.renderWorldLayer((ctx) => {
        activeStation.render(ctx, {
          time: this.gameTime,
          ship: this.ship,
          baySignals,
          layer: 'bayBeacons',
          ...activeLabels,
        });
      }, this.camera);
    }

    this.renderer.renderProjectiles(
      this.entityManager.getByType('projectile'),
      this.camera
    );

    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      this.ship,
      { layer: 'over', shipLocalUnder: playerOccluded, hulls: exhaustHulls }
    );

    this.depthCompositor.paintAbovePlayable(
      this.renderer.ctx,
      this._depthPaintParams(false)
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

    this._renderForwardScan();
    this._renderSelectedContactViewport();
  }

  /**
   * FLS viewport FX — SEEK / ACQUIRE / SCAN / RELEASE.
   * SEEK: 6 desynced nose beams. ACQUIRE/RELEASE: beams lerp to/from target.
   * SCAN: hangar rasters + beams on the focus target.
   */
  _renderForwardScan() {
    if (this.scanView === 'scan') return;
    const fls = this.forwardScanSystem;
    if (!fls?.active || !fls.origin || !(fls.range > 0) || !this.ship) return;

    const origin = fls.origin;
    const zoom = this.camera.effectiveZoom || 1;
    const viewR = this.renderer.viewportRadius / zoom;
    const beamR = Math.min(fls.range, viewR * 1.4);
    const bore = fls.bore;
    const scanT = fls.clock;
    const lineScale = 1 / zoom;
    const mode = fls.mode || 'seek';

    const shipExt = this.ship.shipDef?.hullExtents?.();
    const noseFwd = shipExt?.forward ?? 22;
    const noseLat = Math.max(6, (shipExt?.forward ?? 22) * 0.22);
    const cosB = Math.cos(bore);
    const sinB = Math.sin(bore);
    const noseX = origin.x + cosB * noseFwd;
    const noseY = origin.y + sinB * noseFwd;
    const emitters = [
      { x: noseX - sinB * noseLat, y: noseY + cosB * noseLat, side: 0 },
      { x: noseX + sinB * noseLat, y: noseY - cosB * noseLat, side: 1 },
    ];

    const focus = fls.focus;
    const tgt = focus ? contactScanTarget(focus) : null;
    const ac = fls.activeContacts?.[0];
    const amp = ac
      ? Math.max(0.45, Math.min(1, (ac.scanPct ?? 0) / Math.max(1, ac.maxScanPct ?? 100) || 0.85))
      : 0.85;

    this.renderer.renderWorldLayer((ctx) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const em of emitters) {
        ctx.beginPath();
        ctx.arc(em.x, em.y, 2.2 * lineScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120, 255, 170, 0.55)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(em.x, em.y, 5.5 * lineScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(60, 220, 120, 0.12)';
        ctx.fill();
      }
      ctx.restore();

      if (mode === 'seek' || !tgt) {
        drawIdleSeekBeams(ctx, {
          emitters,
          bore,
          halfArc: FLS.HALF_ARC ?? Math.PI / 4,
          beamR,
          scanT,
          lineScale,
        });
        return;
      }

      const overshoot = Math.max(4, 8 * lineScale);
      if (mode === 'acquire') {
        const blend = fls.modeBlend ?? 0;
        drawHangarStyleScan(ctx, {
          emitters,
          cx: tgt.cx,
          cy: tgt.cy,
          halfLen: tgt.halfLen,
          halfBeam: tgt.halfBeam,
          angle: tgt.angle,
          scanT,
          amp,
          lineScale,
          overshoot,
          contact: focus.contact,
          rasterAmp: amp * Math.max(0, (blend - 0.45) / 0.55),
          beamBlend: blend,
          seekAngles: fls.blendSeekAngles,
          beamR,
        });
      } else if (mode === 'scan') {
        drawHangarStyleScan(ctx, {
          emitters,
          cx: tgt.cx,
          cy: tgt.cy,
          halfLen: tgt.halfLen,
          halfBeam: tgt.halfBeam,
          angle: tgt.angle,
          scanT,
          amp,
          lineScale,
          overshoot,
          contact: focus.contact,
        });
      } else if (mode === 'release') {
        // Reverse blend: scan → seek (modeBlend 0 at start of release, 1 at end).
        const blend = 1 - (fls.modeBlend ?? 0);
        drawHangarStyleScan(ctx, {
          emitters,
          cx: tgt.cx,
          cy: tgt.cy,
          halfLen: tgt.halfLen,
          halfBeam: tgt.halfBeam,
          angle: tgt.angle,
          scanT,
          amp: amp * Math.max(0.25, blend),
          lineScale,
          overshoot,
          contact: focus.contact,
          rasterAmp: amp * Math.max(0, blend - 0.2),
          beamBlend: blend,
          seekAngles: fls.blendSeekAngles,
          beamR,
        });
      }
    }, this.camera);
  }

  /** Radar-sourced contacts as raw occlusion candidates (world x/y top level). */
  _occlusionCandidates() {
    const out = [];
    for (const c of this.radarSystem?.contacts || []) {
      const x = c.ref?.position?.x ?? c.ref?.x ?? c.wx;
      const y = c.ref?.position?.y ?? c.ref?.y ?? c.wy;
      if (x == null || y == null) continue;
      out.push({ id: c.id, type: c.type, ref: c.ref, x, y, angle: c.ref?.angle ?? 0 });
    }
    return out;
  }

  /** Pitch-black umbra behind nearer contacts (SHIP viewport). */
  _renderWorldOcclusionShadow() {
    if (!Settings.isOcclusion()) return;
    if (!this.ship || !this.radarSystem?.contacts?.length) return;
    const zoom = this.camera.effectiveZoom || 1;
    const vr = this.renderer.viewportRadius / zoom;
    const origin = { x: this.ship.position.x, y: this.ship.position.y };
    const polys = this.contactOcclusion.buildShadowPolygons(
      origin,
      this._occlusionCandidates(),
      {
        minX: origin.x - vr * 1.2,
        minY: origin.y - vr * 1.2,
        maxX: origin.x + vr * 1.2,
        maxY: origin.y + vr * 1.2,
      },
      { sensorRange: this.radarSystem.range }
    );
    if (!polys.length) return;
    this.renderer.renderWorldLayer((ctx) => {
      this.occlusionShadowPass.renderWorldShadow(ctx, polys);
    }, this.camera);
  }

  /** Darkened occluded wedges on the full-disc SCAN backdrop. */
  _renderScanScopeShadow() {
    if (!Settings.isOcclusion()) return;
    if (!this.ship || !this.radarSystem?.contacts?.length) return;
    const geo = this._radarGeometry();
    const origin = { x: this.ship.position.x, y: this.ship.position.y };
    const polys = this.contactOcclusion.buildShadowPolygons(
      origin,
      this._occlusionCandidates(),
      {
        minX: origin.x - this.radarSystem.plotRange,
        minY: origin.y - this.radarSystem.plotRange,
        maxX: origin.x + this.radarSystem.plotRange,
        maxY: origin.y + this.radarSystem.plotRange,
      },
      { sensorRange: this.radarSystem.range }
    );
    if (!polys.length) return;
    const wedges = this.contactOcclusion.shadowPolysToScopeWedges(
      polys,
      origin,
      geo.outerR,
      this.radarSystem.plotRange,
      this.camera.rotation || 0
    );
    this.occlusionShadowPass.renderScopeShadow(
      this.renderer.ctx,
      wedges,
      this.renderer.centerX,
      this.renderer.centerY,
      geo.outerR,
      0.7
    );
  }

  /** Corner brackets on the in-viewport hull when a contact is in visual range. */
  _renderSelectedContactViewport() {    if (this.scanView === 'scan' || !this.radarSystem?.on) return;
    const sel = this.radarSystem.getSelected();
    if (!sel || sel.state !== 'visual') return;
    if (sel.type === 'asteroid' && sel.ref && !sel.ref.active) return;

    const r = this.renderer;
    const box = contactScreenAabb(sel, this.camera, r.centerX, r.centerY);
    if (!box) return;

    const pulse = this.radarSystem.selectionPulse || 0;
    drawCornerBrackets(r.ctx, box.cx, box.cy, box.halfW, box.halfH, { pulse });
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

  /** STATUS corner flash (nav arrival); TELEMETRY/ZOOM drawn in CockpitPanels. */
  _renderCornerReadouts() {
    if (!this.cockpitFrame.layout || !this.ship) return;
    this.cockpitFrame.drawCorners(this.renderer.ctx, {
      STATUS:
        (this.gameTime || 0) < this._navArrivalFlashUntil && this._navArrivalFlashText
          ? {
              text: this._navArrivalFlashText.toUpperCase(),
              color: 'rgba(95, 224, 138, 0.95)',
            }
          : undefined,
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

  /** Append a ship-computer line to the COMMS message log. */
  pushShipLog(message) {
    if (!message) return;
    if (!this.shipLog) this.shipLog = [];
    this.shipLog.push(String(message));
    const max = 48;
    if (this.shipLog.length > max) {
      this.shipLog.splice(0, this.shipLog.length - max);
    }
  }

  /** Extra opts for asteroid streaming (viewport trim, teleport fill, debug speed). */
  _asteroidStreamOpts(extra = {}) {
    const r = this.renderer;
    const cam = this.camera;
    const zoom = Math.max(cam?.effectiveZoom ?? 1, 0.001);
    const ship = this.ship;
    const speed = extra.shipSpeed ?? ship?.velocity.length() ?? 0;
    const vx = extra.shipVx ?? ship?.velocity.x ?? 0;
    const vy = extra.shipVy ?? ship?.velocity.y ?? 0;
    const sx = ship?.position.x ?? cam?.position.x ?? 0;
    const sy = ship?.position.y ?? cam?.position.y ?? 0;
    const center = cam?.screenToWorld(r.centerX, r.centerY, r.centerX, r.centerY);
    return {
      visualRadius: r.viewportRadius / zoom + 140 / zoom,
      viewCenterX: center?.x ?? sx,
      viewCenterY: center?.y ?? sy,
      ...extra,
    };
  }

  /** Radar ring geometry for the active VIEW (thin port ring vs full scope). */
  _radarGeometry() {
    const r = this.renderer;
    if (this.scanView === 'scan') {
      return {
        innerR: 0,
        outerR: r.radarOuterRadius,
        band: r.radarOuterRadius,
        plotPad: 0.02,
        fullScope: true,
        chevronBand: r.radarBand || 40,
      };
    }
    return {
      innerR: r.viewportRadius,
      outerR: r.radarOuterRadius,
      band: r.radarBand,
      // Full blue→orange band; edge blips get occluded by the ring strokes / POI rim.
      plotPad: 0,
      fullScope: false,
      chevronBand: r.radarBand,
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
   * @param {import('../entities/Ship.js').Ship|null} [ship]
   */
  _applyViewRotation(ship = this.ship) {
    if (this.viewMode === 'ship' && ship) {
      const angle =
        ship === this.ship && this.combat.playerDead(this.ship)
          ? (this.combat.getWreckCameraPose(this.ship)?.angle ?? ship.angle)
          : ship.angle;
      this.camera.rotation = -Math.PI / 2 - angle;
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
        { name: 'Radar', state: 'ok' },
        { name: 'Scanner', state: 'ok' },
        { name: 'Life Support', state: 'ok' },
      ],
      fuel: 1,
      hull: 1,
      fires: [],
      weapons: [
        { name: 'Turret', ammo: '100%', state: 'ready' },
        { name: 'Mining Laser', ammo: '\u221E', state: 'ready' },
        { name: 'Grapple Arm', ammo: '—', state: 'ready' },
      ],
    };
  }

  /** Refresh STATUS tab weapon readouts from live vessel sim. */
  _syncShipStatusWeapons() {
    if (!this.ship?.status?.weapons?.length) return;
    const turret = this.ship.status.weapons.find((w) => w.name === 'Turret');
    if (turret) {
      turret.ammo = formatTurretAmmoLabel(this.ship);
      turret.state = formatTurretAmmoStatus(this.ship);
    }
    const grapple = this.ship.status.weapons.find((w) => w.name === 'Grapple Arm');
    if (grapple && this.grappleSystem) {
      const st = this.grappleSystem.state;
      grapple.state =
        st === 'idle' ? 'ready' : st === 'reelingEmpty' ? 'reeling' : st;
      grapple.ammo = st === 'idle' ? '—' : 'CABLE';
    }
    if (this.ship.hull != null) this.ship.status.hull = this.ship.hull;
  }

  /** Route space-cockpit LMB clicks: panels → radar band → POI rim. */
  _processCockpitClicks() {
    const click = this.input.consumeClickPos();
    if (!click) return;
    const { x, y } = click;
    const dx = x - this.renderer.centerX;
    const dy = y - this.renderer.centerY;
    const distC = Math.hypot(dx, dy);
    // PORT view: the inner disc is the world — leave LMB to gameplay.
    if (this.scanView !== 'scan' && distC <= this.renderer.viewportRadius) return;

    if (this.cockpitPanels.handleClick(x, y, this)) return;

    if (this.cockpitPanels.trySectorMapClick(this, x, y, !!click.shiftKey)) return;

    if (distC <= this.renderer.radarOuterRadius) {
      this._selectContactRadarClick(x, y);
      return;
    }

    if (distC <= this.renderer.poiOuterRadius) {
      this._selectPoiAt(x, y);
    }
  }

  /** Route space-cockpit RMB on cockpit panels (travel log rename menu). */
  _processCockpitRightClicks() {
    const click = this.input.consumeRightClickPos();
    if (!click) return;
    const { x, y } = click;
    const dx = x - this.renderer.centerX;
    const dy = y - this.renderer.centerY;
    const distC = Math.hypot(dx, dy);
    if (this.scanView !== 'scan' && distC <= this.renderer.viewportRadius) return;
    this.cockpitPanels.handleRightClick(x, y, this);
  }

  /** Middle-click — contacts list rows + viewport hull + radar blips. */
  _processCockpitMiddleClicks() {    const click = this.input.consumeMiddleClickPos();
    if (!click) return;
    const { x, y } = click;
    const dx = x - this.renderer.centerX;
    const dy = y - this.renderer.centerY;
    const distC = Math.hypot(dx, dy);

    if (this.cockpitPanels.handleMiddleClick(x, y, this)) return;

    if (this.cockpitPanels.trySectorMapMiddleClick(this, x, y)) return;

    if (this.scanView !== 'scan' && distC <= this.renderer.viewportRadius) {
      const hit = pickContactAtScreen(
        this.radarSystem.contacts,
        this.camera,
        this.renderer.centerX,
        this.renderer.centerY,
        x,
        y,
        (c) => this.radarSystem.passesContactFilter(c)
      );
      if (hit) {
        this.radarSystem.selectedId = hit.id;
        return;
      }
    }

    if (distC <= this.renderer.radarOuterRadius) {
      this._selectContactRadarClick(x, y);
    }
  }

  /** Mouse 3 (back) — grapple arm click in the play viewport. */
  _processGrappleClick() {
    const click = this.input.consumeGrappleClickPos();
    if (!click) return;
    if (this.mode !== 'playing' || !this.ship) return;
    if (this.scanView === 'scan') return;
    const dx = click.x - this.renderer.centerX;
    const dy = click.y - this.renderer.centerY;
    if (Math.hypot(dx, dy) > this.renderer.viewportRadius) return;
    const aimWorld = this.camera.screenToWorld(
      click.x,
      click.y,
      this.renderer.centerX,
      this.renderer.centerY
    );
    this.grappleSystem.tryFire(this.ship, aimWorld, this.miningDropSystem);
  }

  _selectContactRadarClick(sx, sy) {
    if (!this.radarSystem?.on) {
      this.selectContact(null);
      return;
    }
    const tol =
      this.scanView === 'scan'
        ? Math.max(18, this.renderer.viewportRadius * 0.12)
        : Math.max(18, this.renderer.radarBand);
    this.radarSystem.toggleNearestScreen(sx, sy, tol);
  }

  _selectContactViewportClick(sx, sy) {
    if (!this.radarSystem?.on) {
      this.selectContact(null);
      return;
    }
    this.radarSystem.toggleViewportSelect(
      sx,
      sy,
      this.camera,
      this.renderer.centerX,
      this.renderer.centerY
    );
  }

  _selectPoiAt(x, y) {
    const rim = this.cockpitFrame.poiRimGeometry();
    if (!rim || !this.ship) return;
    const camRot = this.camera.rotation || 0;
    let best = null;
    let bestD = 16;
    for (const poi of this.poiSystem.ringPois()) {
      const pos = this.poiSystem.worldPosition(poi, this.gameTime || 0);
      const b =
        Math.atan2(pos.y - this.ship.position.y, pos.x - this.ship.position.x) + camRot;
      const px = rim.cx + Math.cos(b) * rim.rimR;
      const py = rim.cy + Math.sin(b) * rim.rimR;
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) {
        bestD = d;
        best = poi;
      }
    }
    this.selectPoi(best ? best.id : null);
  }

  _renderRadar() {
    const r = this.renderer;
    if (!r.radarBand || !this.ship) return;

    const geo = this._radarGeometry();

    this.radarDisplay.render(r.ctx, {
      centerX: r.centerX,
      centerY: r.centerY,
      innerR: geo.innerR,
      outerR: geo.outerR,
      band: geo.band,
      plotPad: geo.plotPad,
      fullScope: geo.fullScope,
      chevronBand: geo.chevronBand,
      ship: this.ship,
      model: this.radarSystem,
      cameraRotation: this.camera.rotation || 0,
      time: this.gameTime,
      referenceCruiseSpeed: PHYSICS.REFERENCE_CRUISE_SPEED,
    });
  }

  /** Speed + target distance labels laid out inside the viewport / scope. */
  _renderViewportTelemetry() {
    const r = this.renderer;
    if (!r.radarBand || !this.ship) return;
    const geo = this._radarGeometry();
    renderViewportTelemetry(r.ctx, {
      centerX: r.centerX,
      centerY: r.centerY,
      innerR: geo.innerR,
      outerR: geo.outerR,
      band: geo.band,
      plotPad: geo.plotPad,
      fullScope: geo.fullScope,
      ship: this.ship,
      cameraRotation: this.camera.rotation || 0,
      referenceCruiseSpeed: PHYSICS.REFERENCE_CRUISE_SPEED,
      radarSystem: this.radarSystem,
      poiSystem: this.poiSystem,
      navRoute: this.navRoute,
      engine: this,
      camera: this.camera,
    });
  }

  _renderControls() {
    this.renderer.setupCircularClip();
    this._renderBackground({ fullscreen: false });

    this.depthCompositor.paintAtPlayable(
      this.renderer.ctx,
      this._depthPaintParams(false)
    );

    const ship = this._sandboxShip;
    if (ship) {
      this.renderer.renderShip(ship, this.camera);
    }

    this.renderer.renderProjectiles(
      this.entityManager.getByType('projectile'),
      this.camera
    );
    this.renderer.renderParticles(
      this.particleSystem.particles,
      this.camera,
      ship
    );

    this.depthCompositor.paintAbovePlayable(
      this.renderer.ctx,
      this._depthPaintParams(false)
    );
    this.renderer.endCircularClip();
    this._syncSandboxSpeedHud(ship?.velocity?.length?.() ?? 0);
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

  _updateSectorEditor(deltaTime) {
    processSectorEditorInput(this, this.input, this._sectorEditorView);
  }

  _renderSectorEditor() {
    this.renderer.beginFrame();
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#020508';
    ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);
    drawSectorEditorFrame(ctx, this.renderer, this, this._sectorEditorView);
    const tip = this._sectorEditorView.mapHoverTooltip;
    if (tip?.text) {
      ctx.save();
      ctx.font = "600 11px 'Barlow Condensed', 'Segoe UI', sans-serif";
      const tw = ctx.measureText(tip.text).width + 14;
      const tx = tip.sx - tw / 2;
      const ty = tip.sy - 20;
      ctx.fillStyle = 'rgba(6, 12, 22, 0.92)';
      ctx.strokeStyle = 'rgba(255, 154, 80, 0.4)';
      ctx.lineWidth = 1;
      ctx.fillRect(tx, ty, tw, 16);
      ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, 15);
      ctx.fillStyle = 'rgba(200, 224, 246, 0.95)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tip.text, tip.sx, ty + 8);
      ctx.restore();
    }
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
   * Mk2 radius matches hangar pad; active group’s pad is emphasized.
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
    if (!this.interior?.hangarBay) return;
    this._syncHangarDevControlPad();
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

    const bd = this.interior?.backdrop || { x: 0, y: -68000 };
    const space = {
      depthCompositor: this.depthCompositor,
      spaceX: bd.x,
      spaceY: bd.y,
      time: this.gameTime,
      backdropSession: this.interior?.backdropSession | 0,
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
      this.interior.entityManager.getByType('projectile'),
      this.camera
    );

    this.renderer.renderParticles(
      this.interior.particleSystem.particles,
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
    // Lift the SPD/ZOOM/PRECISION row above the radar ring band (POS lives in
    // the ring). Sits just inside the lower edge of the space viewport.
    if (this._hudEl && this.renderer.radarBand) {
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
