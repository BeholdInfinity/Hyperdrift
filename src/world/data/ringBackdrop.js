/**
 * Baked overworld ring backdrop tuning (authoritative for all players).
 * Dev Ring Bands panel Save writes here via POST /dev/save.
 */

export const RING_BACKDROP = {
  "enabled": true,
  "showBaseFill": false,
  "showBands": true,
  "base": {
    "edgeFeatherFrac": 0.2,
    "alphaMin": 0,
    "alphaMax": 1,
    "color": {
      "r": 32,
      "g": 34,
      "b": 38
    }
  },
  "bands": {
    "edgeFeatherFrac": 0.22,
    "alphaMin": 0.49,
    "alphaMax": 1,
    "primaryColor": {
      "r": 145,
      "g": 118,
      "b": 95
    },
    "primaryMix": 0.65
  }
};

export default RING_BACKDROP;
