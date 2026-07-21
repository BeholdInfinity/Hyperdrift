/**
 * Baked sector layout — planet + asteroid rings (authoritative for proc gen).
 * Dev Sector Map editor saves edits here via POST /dev/save.
 */

export const SECTOR_LAYOUT = {
  planet: {
    radius: 12000,
    visualSeed: 42,
    palette: { ocean: '#1a3a4a', land: '#2d5a3a', cloud: 'rgba(220,230,240,0.15)' },
  },
  rings: [
    {
      id: 'inner_ore',
      innerR: 14000,
      outerR: 22000,
      density: 1.1,
      composition: { iron: 0.45, silicate: 0.35, carbonaceous: 0.12, ice: 0.05, rare: 0.03 },
    },
    {
      id: 'mid_mixed',
      innerR: 23000,
      outerR: 38000,
      density: 0.85,
      composition: { iron: 0.2, silicate: 0.25, carbonaceous: 0.25, ice: 0.2, rare: 0.1 },
    },
    {
      id: 'outer_ice',
      innerR: 39000,
      outerR: 58000,
      density: 0.7,
      composition: { iron: 0.08, silicate: 0.12, carbonaceous: 0.15, ice: 0.55, rare: 0.1 },
    },
  ],
  fixedPois: [
    { id: 'poi.derelict_freighter', name: 'Derelict Freighter', x: 12800, y: -5600, kind: 'derelict', iff: 'yellow' },
    { id: 'poi.nav_kesta', name: 'Nav Beacon Kesta', x: -10400, y: 8800, kind: 'beacon', iff: 'blue' },
    { id: 'poi.ore_marker', name: 'Ore Field Marker', x: 3200, y: 14400, kind: 'resource', iff: 'green' },
  ],
  station: { x: 0, y: 0, placeId: 'place.jennings' },
};

export default SECTOR_LAYOUT;
