/**
 * Baked sector layout v2 — Therissa Prime / Thera system (authoritative geography).
 * Dev Sector Map editor saves edits here via POST /dev/save.
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
    "surfaceBlockRadius": 60000,
    "rotationPeriodHours": 30,
    "rotationAngle0": 0
  },
  "rings": [
    {
      "id": "inner_ore",
      "innerR": 377963.7960116412,
      "outerR": 456500,
      "warpPairId": "inner",
      "density": 3,
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
      "warpPairId": "mid",
      "density": 5,
      "composition": {
        "iron": 0.2,
        "silicate": 0.25,
        "carbonaceous": 0.25,
        "ice": 0.2,
        "rare": 0.1
      },
      "postedSpeedLimit": 650,
      "enforcement": "patrol_witness",
      "subBelts": [
        {
          "id": "mid_ice_core",
          "t0": 0,
          "t1": 0.45,
          "theta0": null,
          "theta1": null,
          "composition": {
            "ice": 0.75,
            "iron": 0.15,
            "silicate": 0.1
          }
        },
        {
          "id": "mid_iron_pocket",
          "t0": 0.25,
          "t1": 0.75,
          "theta0": -0.4,
          "theta1": 0.4,
          "composition": {
            "iron": 0.8,
            "ice": 0.1,
            "silicate": 0.1
          }
        }
      ]
    },
    {
      "id": "outer_ice",
      "innerR": 978500,
      "outerR": 1225500,
      "warpPairId": "outer",
      "density": 8,
      "composition": {
        "iron": 0.08,
        "silicate": 0.12,
        "carbonaceous": 0.15,
        "ice": 0.55,
        "rare": 0.1
      },
      "postedSpeedLimit": 850,
      "enforcement": "patrol_witness"
    },
    {
      "id": "fringe_ice",
      "innerR": 1525250.5390933151,
      "outerR": 1961728.525710642,
      "warpPairId": null,
      "density": 4,
      "composition": {
        "ice": 0.62,
        "silicate": 0.14,
        "carbonaceous": 0.1,
        "iron": 0.08,
        "rare": 0.06
      },
      "postedSpeedLimit": 950,
      "enforcement": "patrol_witness",
      "subBelts": []
    }
  ],
  "spacing": {
    "minOrbitalSep": 150000,
    "minFringeFromRing": 270000,
    "referenceTransitSpeed": 900,
    "softEdgeRadius": 2462229,
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
    "pirate": 1473000
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
      "y": -765566.4569454435
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
        "orbitR": 1473000,
        "orbitAngle0": 5.235987755982989,
        "orbitOmega": 0.0007504679199169247
      },
      "x": 736500.0000000001,
      "y": -1275655.419774478
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
        "orbitR": 376963.7960116412,
        "orbitAngle0": 0,
        "orbitOmega": 0.005796779613905466
      },
      "x": 376963.7960116412,
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
        "orbitR": 376963.7960116412,
        "orbitAngle0": 3.141592653589793,
        "orbitOmega": 0.005796779613905466
      },
      "x": -376963.7960116412,
      "y": 4.616475061800922e-11,
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
        "orbitR": 2462228.5257106423,
        "orbitAngle0": 0.12246105741734142,
        "orbitOmega": 0.00034725116775780973
      },
      "x": 2443788.9231534493,
      "y": 300774.02131119376,
      "fringeClearance": 500500.00000000023
    },
    {
      "id": "site.warp.instance.alpha",
      "kind": "warp_instance",
      "name": "Instance Gate Alpha",
      "iff": "blue",
      "motion": "orbit",
      "trafficPolicy": "standard",
      "orbit": {
        "orbitR": 2462228.5257106423,
        "orbitAngle0": 2.7173982456860264,
        "orbitOmega": 0.00034725116775780973
      },
      "x": -2244002.6879736027,
      "y": 1013420.5687622728,
      "fringeClearance": 500500
    },
    {
      "id": "site.moon.gap.inner_mid",
      "kind": "shepherd_moon",
      "name": "Shepherd A",
      "iff": "blue",
      "motion": "orbit",
      "orbit": {
        "orbitR": 514152.6824728074,
        "orbitAngle0": -0.9174379250120871,
        "orbitOmega": 0.003639134386594369
      },
      "x": 312531.0793683184,
      "y": -408261.31989555096,
      "radius": 7000,
      "shepherds": {
        "innerRingId": "inner_ore",
        "outerRingId": "mid_mixed"
      }
    },
    {
      "id": "site.moon.gap.mid_outer",
      "kind": "shepherd_moon",
      "name": "Shepherd B",
      "iff": "blue",
      "motion": "orbit",
      "orbit": {
        "orbitR": 889523.1616646653,
        "orbitAngle0": 0.5273909215334932,
        "orbitOmega": 0.001599191089463862
      },
      "x": 768657.5195274856,
      "y": 447679.6542302938,
      "radius": 9000,
      "shepherds": {
        "innerRingId": "mid_mixed",
        "outerRingId": "outer_ice"
      }
    },
    {
      "id": "site.moon.gap.outer_fringe",
      "kind": "shepherd_moon",
      "name": "Shepherd C",
      "iff": "blue",
      "motion": "orbit",
      "orbit": {
        "orbitR": 1362730.6777094586,
        "orbitAngle0": 2.5621858268681765,
        "orbitOmega": 0.000843375932382807
      },
      "x": -1140316.1003979184,
      "y": 746132.7570504897,
      "radius": 10000,
      "shepherds": {
        "innerRingId": "outer_ice",
        "outerRingId": "fringe_ice"
      }
    },
    {
      "id": "site.asteroid.mid.cluster_a",
      "kind": "asteroid_field",
      "name": "Iron Needle Cluster",
      "iff": "yellow",
      "motion": "orbit",
      "orbit": {
        "orbitR": 693000,
        "orbitAngle0": 0.8,
        "orbitOmega": 0.002325607399784647
      },
      "x": 482817.7495775856,
      "y": 497127.7709933693,
      "fieldRadius": 2800,
      "rocks": [
        {
          "id": "r0",
          "orbitR": 692353,
          "orbitAngle0": 0.8085,
          "sizeTier": "very_large",
          "volume": 21,
          "capacityMax": 12,
          "capacityRemaining": 12,
          "radius": 107,
          "hp": 51,
          "seed": 23834,
          "composition": {
            "iron": 0.55,
            "ice": 0.25,
            "silicate": 0.2
          },
          "compositionTag": "iron",
          "lootSeed": 3098279049,
          "allowHeroTiers": true
        },
        {
          "id": "r1",
          "orbitR": 691437,
          "orbitAngle0": 0.8116,
          "sizeTier": "large",
          "volume": 13,
          "capacityMax": 11,
          "capacityRemaining": 11,
          "radius": 50,
          "hp": 35,
          "seed": 40037,
          "composition": {
            "iron": 0.55,
            "ice": 0.25,
            "silicate": 0.2
          },
          "compositionTag": "iron",
          "lootSeed": 3407198724,
          "allowHeroTiers": true
        },
        {
          "id": "r2",
          "orbitR": 693925,
          "orbitAngle0": 0.8095,
          "sizeTier": "small_medium",
          "volume": 3,
          "capacityMax": 2,
          "capacityRemaining": 2,
          "radius": 22,
          "hp": 10,
          "seed": 82903,
          "composition": {
            "iron": 0.55,
            "ice": 0.25,
            "silicate": 0.2
          },
          "compositionTag": "iron",
          "lootSeed": 1921580354,
          "allowHeroTiers": true
        },
        {
          "id": "r3",
          "orbitR": 692062,
          "orbitAngle0": 0.8008,
          "sizeTier": "medium",
          "volume": 5,
          "capacityMax": 4,
          "capacityRemaining": 4,
          "radius": 30,
          "hp": 16,
          "seed": 39915,
          "composition": {
            "iron": 0.55,
            "ice": 0.25,
            "silicate": 0.2
          },
          "compositionTag": "iron",
          "lootSeed": 1921883864,
          "allowHeroTiers": true
        },
        {
          "id": "r4",
          "orbitR": 692387,
          "orbitAngle0": 0.7981,
          "sizeTier": "large_medium",
          "volume": 8,
          "capacityMax": 6,
          "capacityRemaining": 6,
          "radius": 40,
          "hp": 22,
          "seed": 74456,
          "composition": {
            "iron": 0.55,
            "ice": 0.25,
            "silicate": 0.2
          },
          "compositionTag": "iron",
          "lootSeed": 607560558,
          "allowHeroTiers": true
        },
        {
          "id": "r5",
          "orbitR": 691551,
          "orbitAngle0": 0.8044,
          "sizeTier": "small",
          "volume": 2,
          "capacityMax": 1,
          "capacityRemaining": 1,
          "radius": 15,
          "hp": 6,
          "seed": 89374,
          "composition": {
            "iron": 0.55,
            "ice": 0.25,
            "silicate": 0.2
          },
          "compositionTag": "iron",
          "lootSeed": 237674728,
          "allowHeroTiers": true
        },
        {
          "id": "r6",
          "orbitR": 693155,
          "orbitAngle0": 0.7977,
          "sizeTier": "medium",
          "volume": 5,
          "capacityMax": 3,
          "capacityRemaining": 3,
          "radius": 28,
          "hp": 14,
          "seed": 4756,
          "composition": {
            "iron": 0.55,
            "ice": 0.25,
            "silicate": 0.2
          },
          "compositionTag": "iron",
          "lootSeed": 4163714360,
          "allowHeroTiers": true
        },
        {
          "id": "r7",
          "orbitR": 694366,
          "orbitAngle0": 0.8096,
          "sizeTier": "small_medium",
          "volume": 3,
          "capacityMax": 2,
          "capacityRemaining": 2,
          "radius": 20,
          "hp": 9,
          "seed": 10761,
          "composition": {
            "iron": 0.55,
            "ice": 0.25,
            "silicate": 0.2
          },
          "compositionTag": "iron",
          "lootSeed": 3638443621,
          "allowHeroTiers": true
        }
      ]
    }
  ]
};

export default SECTOR_LAYOUT;
