/**
 * Modular Place groundwork — public API.
 */

export {
  PLACE_KINDS,
  AREA_TYPES,
  FEATURE_TYPES,
  TECH_LEVELS,
  TECH_LEVEL_LABELS,
  CONDITION_BANDS,
  conditionBand,
  normalizeTechLevel,
} from './PlaceKinds.js';

export {
  defaultShell,
  cloneShell,
  mergeShells,
  inheritShell,
  resolveElementLook,
  isOperationalLook,
} from './Shell.js';

export {
  HANGAR_MODULES,
  BAY_MODULE_IDS,
  SHARED_MODULE_IDS,
  JENNINGS_BAY_MODULES,
  JENNINGS_SHARED_MODULES,
  hasModule,
  normalizeModuleList,
} from './HangarModules.js';

export {
  HANGAR_THEMES,
  HANGAR_THEME_IDS,
  getHangarTheme,
  getHangarColorway,
  listHangarColorwayIds,
} from './HangarThemes.js';

export {
  resolveSkin,
  resolveHangarSkin,
  effectiveHangarFinish,
  HANGAR_SKIN_ELEMENT_KEYS,
} from './HangarSkin.js';

export {
  createBayFeature,
  orderedBays,
  hangarRuntimeConfig,
  createJenningsHangarArea,
  createDerelictHangarArea,
  createPoorShedHangarArea,
} from './HangarArea.js';

export {
  PlaceRegistry,
  placeRegistry,
  createJenningsPlace,
  createDerelictHomePlace,
  createPoorShedPlace,
  createTraderStubPlace,
  createFlagCruiserStubPlace,
  createOutpostDustStubPlace,
  PRESET_BUILDERS,
} from './PlaceRegistry.js';

export {
  setPlaceShell,
  setAreaShell,
  setFeatureShell,
  setBayMechs,
  setBayPadMk,
  installBayModule,
  uninstallBayModule,
  installSharedModule,
  uninstallSharedModule,
  setForkliftCount,
  setPlayerCraneAuthority,
  interactFeature,
  clonePlace,
} from './PlaceMutate.js';

export {
  PLAYER_PAD_SERVICES,
  isTurretMountCategory,
  canPerformTurretCraneStage,
  canPlayerStartTurretSwap,
  canPlayerPerformPadService,
  TURRET_UNINSTALL_PHASES,
  TURRET_INSTALL_PHASES,
  isCraneTurretPhase,
  isWeldTurretPhase,
} from './DockServices.js';

export {
  HULL_CEILING_STEP,
  HULL_CEILING_FLOOR,
  shipHasInterior,
  ensureVesselSimState,
  applyHullScar,
  applyHullHeal,
  applyFuelFill,
  applyAmmoFill,
  applySimBinding,
  tickVesselInteriorCrew,
  canEnterInterior,
  unseatCaptainRoute,
  createVesselInteriorPlace,
} from './VesselInterior.js';
