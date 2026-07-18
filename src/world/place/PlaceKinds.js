/**
 * Place → Area → Feature identity vocabulary.
 * Stations, capital ships, outposts, and Mk2+ vessels share this spine.
 */

export const PLACE_KINDS = {
  station: 'station',
  capitalShip: 'capitalShip',
  outpost: 'outpost',
  vessel: 'vessel',
};

export const AREA_TYPES = {
  hangar: 'hangar',
  garage: 'garage',
  shop: 'shop',
  bar: 'bar',
  medical: 'medical',
  housing: 'housing',
  deck: 'deck',
  farm: 'farm',
  factory: 'factory',
  /** Vessel interior compartments */
  bridgeAccess: 'bridgeAccess',
  engineering: 'engineering',
  fuelBay: 'fuelBay',
  magazine: 'magazine',
  cargoHold: 'cargoHold',
  crewNook: 'crewNook',
};

export const FEATURE_TYPES = {
  bay: 'bay',
  hullRepair: 'hullRepair',
  fuelInput: 'fuelInput',
  gunInput: 'gunInput',
  cargoRack: 'cargoRack',
  seatHatch: 'seatHatch',
  plot: 'plot',
  productionLine: 'productionLine',
};

/** Discrete tech tiers (labels tunable; ids stable). */
export const TECH_LEVELS = ['broken', 'low', 'mid', 'high', 'elite'];

export const TECH_LEVEL_LABELS = {
  broken: 'Broken',
  low: 'Low',
  mid: 'Mid',
  high: 'High',
  elite: 'Elite',
};

/** Condition bands for Dev UI (source of truth is 0…1). */
export const CONDITION_BANDS = [
  { id: 'brokeDown', min: 0, max: 0.12, label: 'Broke down' },
  { id: 'runDown', min: 0.12, max: 0.28, label: 'Run-down' },
  { id: 'used', min: 0.28, max: 0.45, label: 'Used' },
  { id: 'maintained', min: 0.45, max: 0.65, label: 'Maintained' },
  { id: 'clean', min: 0.65, max: 0.85, label: 'Clean' },
  { id: 'pristine', min: 0.85, max: 1.01, label: 'Pristine' },
];

export function conditionBand(condition) {
  const c = Math.max(0, Math.min(1, Number(condition) || 0));
  return CONDITION_BANDS.find((b) => c >= b.min && c < b.max) || CONDITION_BANDS[0];
}

export function normalizeTechLevel(tech) {
  if (TECH_LEVELS.includes(tech)) return tech;
  return 'mid';
}
