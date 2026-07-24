/**
 * Baked sector layout v2 — Therissa Prime / Thera system (authoritative geography).
 * Dev Sector Map editor saves edits here via POST /dev/save.
 */

const TAU = Math.PI * 2;

function orbitSite(id, kind, name, opts = {}) {
  const orbitR = opts.orbitR;
  const orbitAngle0 = opts.orbitAngle0 ?? 0;
  const orbitOmega = opts.orbitOmega ?? null;
  return {
    id,
    kind,
    name,
    iff: opts.iff ?? 'blue',
    motion: opts.motion ?? (kind === 'planetary' ? 'surface' : kind === 'landmark' || kind === 'warp_instance' ? 'static' : 'orbit'),
    socialTier: opts.socialTier,
    trafficPolicy: opts.trafficPolicy ?? 'standard',
    patrolDensity: opts.patrolDensity,
    limitMultiplier: opts.limitMultiplier,
    placeId: opts.placeId,
    orbit: orbitR != null ? { orbitR, orbitAngle0, orbitOmega } : undefined,
    surfaceAngle: opts.surfaceAngle,
    x: opts.x ?? (orbitR != null ? Math.cos(orbitAngle0) * orbitR : 0),
    y: opts.y ?? (orbitR != null ? Math.sin(orbitAngle0) * orbitR : 0),
    pairId: opts.pairId,
    pairSide: opts.pairSide,
    pairTarget: opts.pairTarget,
    trafficZones: opts.trafficZones,
    tradePolicy: opts.tradePolicy,
  };
}

export const SECTOR_LAYOUT = {
  meta: { name: 'Thera System', version: 2 },
  planet: {
    nameOfficial: 'Therissa Prime',
    nameShort: 'Thera',
    center: { x: 0, y: 0 },
    radius: 35000,
    visualSeed: 42,
    palette: { ocean: '#1a3a4a', land: '#2d5a3a', cloud: 'rgba(220,230,240,0.15)' },
    gravityMu: 1.8e12,
    influenceRadius: 700000,
    surfaceBlockRadius: 35000,
    rotationPeriodHours: 30,
    rotationAngle0: 0,
  },
  rings: [
    {
      id: 'inner_ore',
      innerR: 80000,
      outerR: 140000,
      density: 1.1,
      composition: { iron: 0.45, silicate: 0.35, carbonaceous: 0.12, ice: 0.05, rare: 0.03 },
      postedSpeedLimit: 450,
      enforcement: 'sensor_auto',
    },
    {
      id: 'mid_mixed',
      innerR: 160000,
      outerR: 240000,
      density: 0.85,
      composition: { iron: 0.2, silicate: 0.25, carbonaceous: 0.25, ice: 0.2, rare: 0.1 },
      postedSpeedLimit: 650,
      enforcement: 'patrol_witness',
    },
    {
      id: 'outer_ice',
      innerR: 280000,
      outerR: 380000,
      density: 0.7,
      composition: { iron: 0.08, silicate: 0.12, carbonaceous: 0.15, ice: 0.55, rare: 0.1 },
      postedSpeedLimit: 850,
      enforcement: 'patrol_witness',
    },
  ],
  spacing: {
    minOrbitalSep: 270000,
    minFringeFromRing: 270000,
    referenceTransitSpeed: 900,
    softEdgeRadius: 750000,
    siteExclusionRadius: 45000,
  },
  trafficCorridors: {
    halfWidth: 30000,
    spawnMultiplier: 2.5,
    clearMargin: 8000,
    recomputePeriodSec: 3600,
  },
  trafficDefaults: {
    finePerSecondOver: 12,
    citationCooldownSec: 8,
    sensorOverlapInnerRing: true,
    /** Local regulatory shells — radii in world u; postedSpeedLimit is delta over station orbit. */
    stationTrafficZones: [
      { maxDist: 2400, postedSpeedLimit: 120, enforcement: 'sensor_auto' },
      { maxDist: 5500, postedSpeedLimit: 250, enforcement: 'patrol_witness' },
      { maxDist: 9000, postedSpeedLimit: 400, enforcement: 'patrol_witness' },
    ],
  },
  sites: [
    orbitSite('site.station.military', 'station', 'Hard Country Command', {
      socialTier: 'military',
      trafficPolicy: 'strict',
      patrolDensity: 2.5,
      limitMultiplier: 0.75,
      orbitR: 440000,
      orbitAngle0: 0,
      tradePolicy: { tradeBlockDebt: 4000, outlawDebt: 20000, brokerFee: 0.15 },
    }),
    orbitSite('site.station.elite', 'station', 'Whiskey Row Station', {
      socialTier: 'elite',
      patrolDensity: 2.0,
      orbitR: 440000,
      orbitAngle0: Math.PI,
      tradePolicy: { tradeBlockDebt: 5000, outlawDebt: 25000, brokerFee: 0.15 },
    }),
    orbitSite('site.jennings', 'station', 'Jennings Station', {
      socialTier: 'home',
      patrolDensity: 2.0,
      placeId: 'place.jennings',
      orbitR: 480000,
      orbitAngle0: -Math.PI / 2,
      tradePolicy: { tradeBlockDebt: 5000, outlawDebt: 25000, brokerFee: 0.12 },
    }),
    orbitSite('site.station.upper', 'station', 'Neon Moon Berth', {
      socialTier: 'upper',
      patrolDensity: 1.5,
      orbitR: 505000,
      orbitAngle0: Math.PI / 6,
    }),
    orbitSite('site.station.guild.a', 'station', 'Red Dirt Collective', {
      socialTier: 'guild',
      patrolDensity: 1.0,
      orbitR: 525000,
      orbitAngle0: (2 * Math.PI) / 3,
    }),
    orbitSite('site.station.mid', 'station', 'Two-Lane Port', {
      socialTier: 'mid',
      patrolDensity: 1.25,
      orbitR: 535000,
      orbitAngle0: Math.PI / 2,
    }),
    orbitSite('site.station.guild.c', 'station', 'Honky Tonk Berth', {
      socialTier: 'guild',
      patrolDensity: 1.0,
      orbitR: 530000,
      orbitAngle0: (5 * Math.PI) / 6,
    }),
    orbitSite('site.station.guild.b', 'station', 'Lonesome Star Dock', {
      socialTier: 'guild',
      patrolDensity: 1.0,
      orbitR: 545000,
      orbitAngle0: (4 * Math.PI) / 3,
    }),
    orbitSite('site.station.guild.d', 'station', 'Outlaw Junction', {
      socialTier: 'guild',
      patrolDensity: 1.0,
      orbitR: 565000,
      orbitAngle0: (7 * Math.PI) / 6,
    }),
    orbitSite('site.station.poor', 'station', 'Dry County Terminal', {
      socialTier: 'poor',
      patrolDensity: 1.0,
      orbitR: 580000,
      orbitAngle0: Math.PI / 3,
    }),
    orbitSite('site.station.derelict', 'station', 'Broken Spur Yard', {
      socialTier: 'derelict',
      patrolDensity: 0,
      placeId: 'place.derelict-home',
      orbitR: 595000,
      orbitAngle0: (11 * Math.PI) / 6,
    }),
    orbitSite('site.station.pirate', 'station', "Bootlegger's Rest", {
      socialTier: 'pirate',
      iff: 'red',
      trafficPolicy: 'none',
      patrolDensity: 0,
      orbitR: 610000,
      orbitAngle0: (5 * Math.PI) / 3,
    }),
    orbitSite('site.planet.farm', 'planetary', 'Back Forty Settlement', {
      iff: 'green',
      surfaceAngle: 0.6,
      x: 0,
      y: 0,
    }),
    orbitSite('site.planet.tradingPort', 'planetary', 'Crossroads Landing', {
      iff: 'green',
      surfaceAngle: 1.2,
      x: 0,
      y: 0,
    }),
    orbitSite('site.planet.industrial', 'planetary', 'Copperhead Works', {
      iff: 'yellow',
      surfaceAngle: 2.4,
      x: 0,
      y: 0,
    }),
    orbitSite('site.planet.city', 'planetary', 'Neon Saloon City', {
      iff: 'blue',
      surfaceAngle: 3.9,
      x: 0,
      y: 0,
    }),
    orbitSite('site.planet.runDownFarm', 'planetary', 'Ramshackle Hollow', {
      iff: 'yellow',
      surfaceAngle: 5.1,
      x: 0,
      y: 0,
    }),
    orbitSite('site.warp.ring.inner.a', 'warp_ring', 'Inner Ring Gate A', {
      iff: 'blue',
      orbitR: 110000,
      orbitAngle0: 0,
      pairId: 'inner',
      pairSide: 'a',
      pairTarget: 'site.warp.ring.inner.b',
    }),
    orbitSite('site.warp.ring.inner.b', 'warp_ring', 'Inner Ring Gate B', {
      iff: 'blue',
      orbitR: 110000,
      orbitAngle0: Math.PI,
      pairId: 'inner',
      pairSide: 'b',
      pairTarget: 'site.warp.ring.inner.a',
    }),
    orbitSite('site.warp.ring.mid.a', 'warp_ring', 'Mid Ring Gate A', {
      iff: 'blue',
      orbitR: 200000,
      orbitAngle0: Math.PI / 2,
      pairId: 'mid',
      pairSide: 'a',
      pairTarget: 'site.warp.ring.mid.b',
    }),
    orbitSite('site.warp.ring.mid.b', 'warp_ring', 'Mid Ring Gate B', {
      iff: 'blue',
      orbitR: 200000,
      orbitAngle0: -Math.PI / 2,
      pairId: 'mid',
      pairSide: 'b',
      pairTarget: 'site.warp.ring.mid.a',
    }),
    orbitSite('site.warp.ring.outer.a', 'warp_ring', 'Outer Ring Gate A', {
      iff: 'blue',
      orbitR: 330000,
      orbitAngle0: Math.PI / 4,
      pairId: 'outer',
      pairSide: 'a',
      pairTarget: 'site.warp.ring.outer.b',
    }),
    orbitSite('site.warp.ring.outer.b', 'warp_ring', 'Outer Ring Gate B', {
      iff: 'blue',
      orbitR: 330000,
      orbitAngle0: (5 * Math.PI) / 4,
      pairId: 'outer',
      pairSide: 'b',
      pairTarget: 'site.warp.ring.outer.a',
    }),
    orbitSite('site.landmark.capital.wreck', 'landmark', 'Wreck of the Iron Crown', {
      iff: 'red',
      motion: 'static',
      x: 650000,
      y: 80000,
    }),
    orbitSite('site.warp.instance.alpha', 'warp_instance', 'Instance Gate Alpha', {
      iff: 'blue',
      motion: 'static',
      x: -620000,
      y: 280000,
    }),
  ],
};

export default SECTOR_LAYOUT;
