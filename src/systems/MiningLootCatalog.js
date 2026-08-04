/**
 * Mining loot types, visuals, and drop rolls.
 */

import { primaryComposition } from './AsteroidCatalog.js';
import { SeededRandom } from '../utils/SeededRandom.js';

export const ORE_LABELS = {
  stoneOre: 'Stone',
  ironOre: 'Iron',
  waterIce: 'Ice',
  carbonOre: 'Carbon',
  rareOre: 'Rare',
  titaniumOre: 'Titanium',
};

const ORE_TINT = {
  stoneOre: 'rgba(120, 115, 108, 0.95)',
  ironOre: 'rgba(155, 125, 100, 0.95)',
  waterIce: 'rgba(190, 210, 230, 0.95)',
  carbonOre: 'rgba(70, 65, 60, 0.95)',
  rareOre: 'rgba(170, 155, 110, 0.95)',
  titaniumOre: 'rgba(145, 150, 160, 0.95)',
};

/** Roll concrete drops from a module drop table. */
export function rollModuleDrops(dropTable, lootSeed) {
  const entries = dropTable?.entries;
  if (!entries?.length) {
    const tag = primaryComposition(dropTable?.composition ?? 'silicate');
    const oreType = tag === 'iron' ? 'ironOre' : tag === 'ice' ? 'waterIce' : 'stoneOre';
    return [{ oreType, amount: 1, composition: dropTable?.composition ?? { silicate: 1 } }];
  }
  const rng = new SeededRandom((lootSeed >>> 0) || 1);
  let sum = 0;
  for (const e of entries) sum += e.weight ?? 1;
  let roll = rng.next() * sum;
  for (const e of entries) {
    roll -= e.weight ?? 1;
    if (roll <= 0) {
      return [
        {
          oreType: e.oreType,
          amount: e.amount ?? 1,
          composition: dropTable.composition,
        },
      ];
    }
  }
  const e = entries[0];
  return [{ oreType: e.oreType, amount: e.amount ?? 1, composition: dropTable.composition }];
}

export function oreFillStyle(oreType) {
  return ORE_TINT[oreType] ?? ORE_TINT.stoneOre;
}

export function oreLabel(oreType) {
  return ORE_LABELS[oreType] ?? oreType;
}
