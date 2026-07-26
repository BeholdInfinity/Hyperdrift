/**
 * Baked sector layout v2 — Therissa Prime / Thera system (authoritative geography).
 * Dev Sector Map editor saves edits here via POST /dev/save.
 * orbitOmega on each site is derived from planet.gravityMu at bake time.
 */

export const SECTOR_LAYOUT = {
  "meta": {
    "name": "Thera System",
    "version": 2
  },
  "planet": {
    "nameOfficial": "Therissa Prime",
    "nameShort": "Thera",
    "center": {
      "x": 0,
      "y": 0
    },
    "radius": 60000,
    "visualSeed": 42,
    "palette": {
      "ocean": "#1a3a4a",
      "land": "#2d5a3a",
      "cloud": "rgba(220,230,240,0.15)"
    },
    "gravityMu": 1800000000000,
    "influenceRadius": 700000,
    "surfaceBlockRadius": 60000,
    "rotationPeriodHours": 30,
    "rotationAngle0": 0
  },
  "rings": [
    {
      "id": "inner_ore",
      "innerR": 349500,
      "outerR": 456500,
      "density": 1.1,
      "composition": {
        "iron": 0.45,
        "silicate": 0.35,
        "carbonaceous": 0.12,
        "ice": 0.05,
        "rare": 0.03
      },
      "postedSpeedLimit": 450,
      "enforcement": "sensor_auto"
    },
    {
      "id": "mid_mixed",
      "innerR": 586000,
      "outerR": 800000,
      "density": 0.85,
      "composition": {
        "iron": 0.2,
        "silicate": 0.25,
        "carbonaceous": 0.25,
        "ice": 0.2,
        "rare": 0.1
      },
      "postedSpeedLimit": 650,
      "enforcement": "patrol_witness"
    },
    {
      "id": "outer_ice",
      "innerR": 978500,
      "outerR": 1225500,
      "density": 0.7,
      "composition": {
        "iron": 0.08,
        "silicate": 0.12,
        "carbonaceous": 0.15,
        "ice": 0.55,
        "rare": 0.1
      },
      "postedSpeedLimit": 850,
      "enforcement": "patrol_witness"
    }
  ],
  "spacing": {
    "minOrbitalSep": 150000,
    "minFringeFromRing": 270000,
    "referenceTransitSpeed": 900,
    "softEdgeRadius": 750000,
    "siteExclusionRadius": 45000
  },
  "socialOrbitInner": {
    "military": 194000,
    "elite": 194000,
    "home": 543000,
    "upper": 514000,
    "mid": 843000,
    "guild": 711500,
    "poor": 1251000,
    "derelict": 942000,
    "pirate": 1351000
  },
  "trafficCorridors": {
    "halfWidth": 30000,
    "spawnMultiplier": 2.5,
    "clearMargin": 8000,
    "recomputePeriodSec": 3600
  },
  "trafficDefaults": {
    "finePerSecondOver": 12,
    "citationCooldownSec": 8,
    "sensorOverlapInnerRing": true,
    "stationTrafficZones": [
      {
        "maxDist": 2400,
        "postedSpeedLimit": 120,
        "enforcement": "sensor_auto"
      },
      {
        "maxDist": 5500,
        "postedSpeedLimit": 250,
        "enforcement": "patrol_witness"
      },
      {
        "maxDist": 9000,
        "postedSpeedLimit": 400,
        "enforcement": "patrol_witness"
      }
    ]
  },
  "sites": [
    {
      "id": "site.station.military",
      "kind": "station",
      "name": "Hard Country Command",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "military",
      "trafficPolicy": "strict",
      "patrolDensity": 2.5,
      "limitMultiplier": 0.75,
      "orbit": {
        "orbitR": 194000,
        "orbitAngle0": 0,
        "orbitOmega": 0.015701229357736376
      },
      "x": 194000,
      "y": 0,
      "tradePolicy": {
        "tradeBlockDebt": 4000,
        "outlawDebt": 20000,
        "brokerFee": 0.15
      }
    },
    {
      "id": "site.station.elite",
      "kind": "station",
      "name": "Whiskey Row Station",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "elite",
      "trafficPolicy": "standard",
      "patrolDensity": 2,
      "orbit": {
        "orbitR": 194000,
        "orbitAngle0": 3.141592653589793,
        "orbitOmega": 0.015701229357736376
      },
      "x": -194000,
      "y": 2.3758147903458653e-11,
      "tradePolicy": {
        "tradeBlockDebt": 5000,
        "outlawDebt": 25000,
        "brokerFee": 0.15
      }
    },
    {
      "id": "site.jennings",
      "kind": "station",
      "name": "Jennings Station",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "home",
      "trafficPolicy": "standard",
      "patrolDensity": 2,
      "placeId": "place.jennings",
      "orbit": {
        "orbitR": 543000,
        "orbitAngle0": -1.5707963267948966,
        "orbitOmega": 0.003353022812344776
      },
      "x": 3.324916059685064e-11,
      "y": -543000,
      "tradePolicy": {
        "tradeBlockDebt": 5000,
        "outlawDebt": 25000,
        "brokerFee": 0.12
      }
    },
    {
      "id": "site.station.upper",
      "kind": "station",
      "name": "Neon Moon Berth",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "upper",
      "trafficPolicy": "standard",
      "patrolDensity": 1.5,
      "orbit": {
        "orbitR": 514000,
        "orbitAngle0": 0.5235987755982988,
        "orbitOmega": 0.0036407560012751286
      },
      "x": 445137.0575452015,
      "y": 256999.99999999997
    },
    {
      "id": "site.station.guild.a",
      "kind": "station",
      "name": "Red Dirt Collective",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "guild",
      "trafficPolicy": "standard",
      "patrolDensity": 1,
      "orbit": {
        "orbitR": 539000,
        "orbitAngle0": 2.0943951023931953,
        "orbitOmega": 0.0033904169046744302
      },
      "x": -269499.9999999999,
      "y": 466787.6926398125
    },
    {
      "id": "site.station.mid",
      "kind": "station",
      "name": "Two-Lane Port",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "mid",
      "trafficPolicy": "standard",
      "patrolDensity": 1.25,
      "orbit": {
        "orbitR": 843000,
        "orbitAngle0": 1.5707963267948966,
        "orbitOmega": 0.0017333844275568791
      },
      "x": 5.1618862584060935e-11,
      "y": 843000
    },
    {
      "id": "site.station.guild.c",
      "kind": "station",
      "name": "Honky Tonk Berth",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "guild",
      "trafficPolicy": "standard",
      "patrolDensity": 1,
      "orbit": {
        "orbitR": 486000,
        "orbitAngle0": 2.6179938779914944,
        "orbitOmega": 0.0039598783895036065
      },
      "x": -420888.34623923723,
      "y": 242999.99999999997
    },
    {
      "id": "site.station.guild.b",
      "kind": "station",
      "name": "Lonesome Star Dock",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "guild",
      "trafficPolicy": "standard",
      "patrolDensity": 1,
      "orbit": {
        "orbitR": 884000,
        "orbitAngle0": 4.1887902047863905,
        "orbitOmega": 0.0016142019032392334
      },
      "x": -442000.0000000004,
      "y": -765566.4569454436
    },
    {
      "id": "site.station.guild.d",
      "kind": "station",
      "name": "Outlaw Junction",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "guild",
      "trafficPolicy": "standard",
      "patrolDensity": 1,
      "orbit": {
        "orbitR": 1308000,
        "orbitAngle0": 3.665191429188092,
        "orbitOmega": 0.000896859962162586
      },
      "x": -1132761.228150046,
      "y": -653999.9999999997
    },
    {
      "id": "site.station.poor",
      "kind": "station",
      "name": "Dry County Terminal",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "poor",
      "trafficPolicy": "standard",
      "patrolDensity": 1,
      "orbit": {
        "orbitR": 1251000,
        "orbitAngle0": 1.0471975511965976,
        "orbitOmega": 0.0009588491509257668
      },
      "x": 625500.0000000001,
      "y": 1083397.7801343326
    },
    {
      "id": "site.station.derelict",
      "kind": "station",
      "name": "Broken Spur Yard",
      "iff": "blue",
      "motion": "orbit",
      "socialTier": "derelict",
      "trafficPolicy": "standard",
      "patrolDensity": 0,
      "placeId": "place.derelict-home",
      "orbit": {
        "orbitR": 942000,
        "orbitAngle0": 5.759586531581287,
        "orbitOmega": 0.001467438463643603
      },
      "x": 815795.9303649409,
      "y": -471000.0000000004
    },
    {
      "id": "site.station.pirate",
      "kind": "station",
      "name": "Bootlegger's Rest",
      "iff": "red",
      "motion": "orbit",
      "socialTier": "pirate",
      "trafficPolicy": "none",
      "patrolDensity": 0,
      "orbit": {
        "orbitR": 1351000,
        "orbitAngle0": 5.235987755982989,
        "orbitOmega": 0.0008543842405324362
      },
      "x": 675500.0000000001,
      "y": -1170000.3205127765
    },
    {
      "id": "site.planet.farm",
      "kind": "planetary",
      "name": "Back Forty Settlement",
      "iff": "green",
      "motion": "surface",
      "trafficPolicy": "standard",
      "surfaceAngle": 0.6,
      "x": 49520.1368945807,
      "y": 33878.54840370212
    },
    {
      "id": "site.planet.tradingPort",
      "kind": "planetary",
      "name": "Crossroads Landing",
      "iff": "green",
      "motion": "surface",
      "trafficPolicy": "standard",
      "surfaceAngle": -3.0601956396713073,
      "x": -59801.345501781165,
      "y": -4878.429683473741
    },
    {
      "id": "site.planet.industrial",
      "kind": "planetary",
      "name": "Copperhead Works",
      "iff": "yellow",
      "motion": "surface",
      "trafficPolicy": "standard",
      "surfaceAngle": 2.4,
      "x": -44243.622932474726,
      "y": 40527.790833069055
    },
    {
      "id": "site.planet.city",
      "kind": "planetary",
      "name": "Neon Saloon City",
      "iff": "blue",
      "motion": "surface",
      "trafficPolicy": "standard",
      "surfaceAngle": 3.9,
      "x": -43555.93825200841,
      "y": -41265.969551038426
    },
    {
      "id": "site.planet.runDownFarm",
      "kind": "planetary",
      "name": "Ramshackle Hollow",
      "iff": "yellow",
      "motion": "surface",
      "trafficPolicy": "standard",
      "surfaceAngle": -0.7259026353339212,
      "x": 44874.032858735205,
      "y": -39828.6476671397
    },
    {
      "id": "site.warp.ring.inner.a",
      "kind": "warp_ring",
      "name": "Inner Ring Gate A",
      "iff": "blue",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 348500,
        "orbitAngle0": 0,
        "orbitOmega": 0.00652126845691739
      },
      "x": 348500,
      "y": 0,
      "pairId": "inner",
      "pairSide": "a",
      "pairTarget": "site.warp.ring.inner.b"
    },
    {
      "id": "site.warp.ring.inner.b",
      "kind": "warp_ring",
      "name": "Inner Ring Gate B",
      "iff": "blue",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 348500,
        "orbitAngle0": 3.141592653589793,
        "orbitOmega": 0.00652126845691739
      },
      "x": -348500,
      "y": 4.267894095028526e-11,
      "pairId": "inner",
      "pairSide": "b",
      "pairTarget": "site.warp.ring.inner.a"
    },
    {
      "id": "site.warp.ring.mid.a",
      "kind": "warp_ring",
      "name": "Mid Ring Gate A",
      "iff": "blue",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 585000,
        "orbitAngle0": 0,
        "orbitOmega": 0.0029984889548958266
      },
      "x": 585000,
      "y": 0,
      "pairId": "mid",
      "pairSide": "a",
      "pairTarget": "site.warp.ring.mid.b"
    },
    {
      "id": "site.warp.ring.mid.b",
      "kind": "warp_ring",
      "name": "Mid Ring Gate B",
      "iff": "blue",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 585000,
        "orbitAngle0": 3.141592653589793,
        "orbitOmega": 0.0029984889548958266
      },
      "x": -585000,
      "y": 7.164183775012016e-11,
      "pairId": "mid",
      "pairSide": "b",
      "pairTarget": "site.warp.ring.mid.a"
    },
    {
      "id": "site.warp.ring.outer.a",
      "kind": "warp_ring",
      "name": "Outer Ring Gate A",
      "iff": "blue",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 977500,
        "orbitAngle0": 0,
        "orbitOmega": 0.0013882289709418946
      },
      "x": 977500,
      "y": 0,
      "pairId": "outer",
      "pairSide": "a",
      "pairTarget": "site.warp.ring.outer.b"
    },
    {
      "id": "site.warp.ring.outer.b",
      "kind": "warp_ring",
      "name": "Outer Ring Gate B",
      "iff": "blue",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 977500,
        "orbitAngle0": 3.141592653589793,
        "orbitOmega": 0.0013882289709418946
      },
      "x": -977500,
      "y": 1.1970922461665377e-10,
      "pairId": "outer",
      "pairSide": "b",
      "pairTarget": "site.warp.ring.outer.a"
    },
    {
      "id": "site.landmark.capital.wreck",
      "kind": "landmark",
      "name": "Wreck of the Iron Crown",
      "iff": "red",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 1616000,
        "orbitAngle0": 0.12246105741734142,
        "orbitOmega": 0.0006530917803808402
      },
      "x": 1603897.7936364282,
      "y": 197402.8053706373,
      "fringeClearance": 390500.00000000023
    },
    {
      "id": "site.warp.instance.alpha",
      "kind": "warp_instance",
      "name": "Instance Gate Alpha",
      "iff": "blue",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 1726000,
        "orbitAngle0": 2.7173982456860264,
        "orbitOmega": 0.0005916638912831381
      },
      "x": -1573025.6550108725,
      "y": 710398.6829081364,
      "fringeClearance": 500500
    }
  ]
};

export default SECTOR_LAYOUT;
