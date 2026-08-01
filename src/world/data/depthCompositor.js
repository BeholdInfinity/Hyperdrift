/**
 * Baked depth compositor tuning (authoritative for all players).
 * Dev Depth panel Save writes here via POST /dev/save.
 */

export const DEPTH_COMPOSITOR = {
  "globals": {
    "parallaxScale": 0.09,
    "starTwinkle": true,
    "forceStarLite": false,
    "referenceSpeed": 8840
  },
  "streamSpawnRateMult": 1.85,
  "layers": [
    {
      "id": "star-0",
      "type": "star",
      "label": "Star L1",
      "enabled": true,
      "depth": -14,
      "layerIndex": 0,
      "parallax": 0.003,
      "brightness": 0.28,
      "color": "#556677",
      "twinkle": 0.55
    },
    {
      "id": "star-1",
      "type": "star",
      "label": "Star L2",
      "enabled": true,
      "depth": -13,
      "layerIndex": 1,
      "parallax": 0.008,
      "brightness": 0.34,
      "color": "#667788",
      "twinkle": 0.48
    },
    {
      "id": "star-2",
      "type": "star",
      "label": "Star L3",
      "enabled": true,
      "depth": -12,
      "layerIndex": 2,
      "parallax": 0.018,
      "brightness": 0.4,
      "color": "#778899",
      "twinkle": 0.4
    },
    {
      "id": "star-3",
      "type": "star",
      "label": "Star L4",
      "enabled": true,
      "depth": -11,
      "layerIndex": 3,
      "parallax": 0.04,
      "brightness": 0.46,
      "color": "#8899aa",
      "twinkle": 0.32
    },
    {
      "id": "star-4",
      "type": "star",
      "label": "Star L5",
      "enabled": true,
      "depth": -10,
      "layerIndex": 4,
      "parallax": 0.08,
      "brightness": 0.52,
      "color": "#99aabb",
      "twinkle": 0.24
    },
    {
      "id": "star-5",
      "type": "star",
      "label": "Star L6",
      "enabled": true,
      "depth": -9,
      "layerIndex": 5,
      "parallax": 0.14,
      "brightness": 0.58,
      "color": "#bbccdd",
      "twinkle": 0.16
    },
    {
      "id": "star-6",
      "type": "star",
      "label": "Star L7",
      "enabled": true,
      "depth": -8,
      "layerIndex": 6,
      "parallax": 0.22,
      "brightness": 0.64,
      "color": "#ddeeff",
      "twinkle": 0.1
    },
    {
      "id": "nebulaAmbient-0",
      "type": "nebulaAmbient",
      "label": "Ambient Nebula 1",
      "enabled": false,
      "depth": -7,
      "layerIndex": 0,
      "parallax": 0.08,
      "brightness": 0.75,
      "driftMult": 0.4,
      "sizeMult": 1.3
    },
    {
      "id": "nebulaAmbient-1",
      "type": "nebulaAmbient",
      "label": "Ambient Nebula 2",
      "enabled": false,
      "depth": -6,
      "layerIndex": 1,
      "parallax": 0.25,
      "brightness": 0.95,
      "driftMult": 0.7,
      "sizeMult": 1
    },
    {
      "id": "nebulaAmbient-2",
      "type": "nebulaAmbient",
      "label": "Ambient Nebula 3",
      "enabled": true,
      "depth": -10,
      "layerIndex": 2,
      "parallax": 0.1,
      "brightness": 0.23,
      "driftMult": 1,
      "sizeMult": 0.61
    },
    {
      "id": "nebulaStream-1",
      "type": "nebulaStream",
      "label": "Nebula Stream D1",
      "enabled": false,
      "depth": -6,
      "streamDepth": 1,
      "brightness": 1,
      "sizeMult": 1
    },
    {
      "id": "nebulaStream-2",
      "type": "nebulaStream",
      "label": "Nebula Stream D2",
      "enabled": true,
      "depth": -5,
      "streamDepth": 2,
      "brightness": 1,
      "sizeMult": 0.5
    },
    {
      "id": "nebulaStream-3",
      "type": "nebulaStream",
      "label": "Nebula Stream D3",
      "enabled": true,
      "depth": -4,
      "streamDepth": 3,
      "brightness": 1,
      "sizeMult": 0.61
    },
    {
      "id": "speedStreaks",
      "type": "speedStreaks",
      "label": "Speed Streaks",
      "enabled": true,
      "depth": 2,
      "brightness": 1.96,
      "spawnRateMult": 1.53,
      "maxStreaks": 140,
      "lengthMult": 2.54,
      "widthMult": 0.65
    },
    {
      "id": "dust",
      "type": "dust",
      "label": "Dust",
      "enabled": true,
      "depth": 2,
      "parallax": 0.35,
      "brightness": 0.62,
      "density": 0.67,
      "driftSpeed": 1,
      "minSize": 0.4,
      "maxSize": 1.2,
      "color": "#887766"
    }
  ]
};

export default DEPTH_COMPOSITOR;
