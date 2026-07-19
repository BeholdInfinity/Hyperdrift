/**
 * Modular ships — public API.
 */

export {
  SHIP_CLASSES,
  SWAP_GROUPS,
  SWAP_GROUP_ORDER,
  SWAP_GROUP_LABELS,
  SWAP_GROUP_PAD_MK,
  SWAP_GROUP_SOCKET_MK_CAP,
  SECTION_ROLES,
  getShipClass,
  classesInSwapGroup,
  normalizeSwapGroup,
  padMkForSwapGroup,
  socketMkCapForSwapGroup,
  padMkForClass,
  padAcceptsSwapGroup,
  padAcceptsClass,
  labelSwapGroup,
  cargoCapacityFor,
  seatCapacityFor,
} from './ShipClasses.js';

export {
  THEMES,
  THEME_IDS,
  VARIANTS,
  MK_TIERS,
  STARTER_THEME,
  STARTER_COLORWAY,
  getTheme,
  getColorway,
  listColorwayIds,
  getThemeFinish,
  resolvePalette,
  effectiveWear,
  hexToRgba,
  parseHexColor,
} from './Themes.js';

export { paintSectionSkin } from './ThemeSkin.js';
export {
  getSection,
  listSections,
  sectionCatalogSize,
  STARTER_SECTIONS,
  BELL_HARDPOINTS,
} from './SectionCatalog.js';

export {
  ITEM_CATEGORIES,
  getItem,
  listItems,
  itemCatalogSize,
  STARTER_ITEMS,
} from './ItemCatalog.js';

export { canAttachSection, canAttachItem } from './ShipAttach.js';
export { ShipDefinition } from './ShipDefinition.js';
export {
  createPlayerStarter,
  generateShip,
  generateVisitor,
  validateStarterBom,
  VISITOR_ROLE_TO_CLASS,
} from './ShipGenerator.js';

export {
  VIEW_TOP_DOWN,
  VIEW_ANGLED,
  ANGLED_HEADING_COUNT,
  COMPASS_LABELS,
  labelCompassHeading,
  headingIndexFromAngle,
  angledDepthScale,
  angledLiftLocal,
  angledPlumeMidLift,
  topDownView,
  angledView,
  hangarShipView,
  beginShipDraw,
  endShipDraw,
  setExtrudePhase,
  extrudePhase,
  isAngledShipDraw,
  lastDeckLift,
  withDeckLift,
} from './ShipViews.js';

export {
  CATEGORY_FREIGHT,
  categoryFromFreightLabel,
  freightMetaForCategory,
  upgradeKindFromItemId,
  pickCatalogItemId,
  pickAmbientCatalogUpgradeId,
  pickUpgradeInstallRequest,
  hardpointBoardLabel,
  unequipHardpoint,
  equipHardpoint,
  emptySocketsForCategory,
  equippedSocketsForCategory,
  pickStripKey,
  needsStripBeforeInstall,
  needsStripBeforeInstallKey,
  socketNeedsStrip,
  equippedKeys,
  shipDefSwapGroup,
  categoriesOnShip,
  maxSocketMkForCategory,
} from './HangarLoadout.js';

export {
  drawModularShip,
  drawShipSilhouette,
  getShipMounts,
  getShipHardpointsTable,
  getShipThrusterKeys,
} from './ShipRenderer.js';

export {
  drawMountPlumes,
  emitMountExhaust,
  listPropulsionMounts,
  hasActivePropulsion,
} from './PlumeDraw.js';

export {
  BlueprintSandbox,
  cloneShipDef,
  listBlueprintClassIds,
} from './BlueprintSandbox.js';
