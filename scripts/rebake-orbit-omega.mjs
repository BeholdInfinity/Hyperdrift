/**
 * One-shot: rebake sectorLayout.js orbitOmega from planet.gravityMu.
 * Usage: node scripts/rebake-orbit-omega.mjs
 */
import { writeFileSync } from 'fs';
import { hydrateOrbitParams } from '../src/world/SectorLayout.js';
import { SECTOR_LAYOUT } from '../src/world/data/sectorLayout.js';

const layout = JSON.parse(JSON.stringify(SECTOR_LAYOUT));
hydrateOrbitParams(layout);

const text = `/**
 * Baked sector layout v2 — Therissa Prime / Thera system (authoritative geography).
 * Dev Sector Map editor saves edits here via POST /dev/save.
 * orbitOmega on each site is derived from planet.gravityMu at bake time.
 */

export const SECTOR_LAYOUT = ${JSON.stringify(layout, null, 2)};

export default SECTOR_LAYOUT;
`;

writeFileSync(new URL('../src/world/data/sectorLayout.js', import.meta.url), text);

const j = layout.sites.find((s) => s.id === 'site.jennings');
const mu = layout.planet.gravityMu;
const v = Math.sqrt(mu / j.orbit.orbitR);
console.log('Rebaked sectorLayout.js');
console.log('Jennings orbitOmega:', j.orbit.orbitOmega);
console.log('Jennings circular v:', v.toFixed(2), 'u/s');
console.log('omega * R:', (j.orbit.orbitOmega * j.orbit.orbitR).toFixed(2), 'u/s');
