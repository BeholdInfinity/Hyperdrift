/**
 * Baked overworld ring backdrop tuning (authoritative for all players).
 * Dev Ring Bands panel Save writes here via POST /dev/save.
 */

export const RING_BACKDROP = {
  "enabled": true,
  "showBaseFill": true,
  "showBands": false,
  "base": {
    "edgeFeatherFrac": 0.02,
    "alphaMin": 0,
    "alphaMax": 0.88,
    "color": {
      "r": 20,
      "g": 20,
      "b": 20
    }
  },
  "bands": {
    "edgeFeatherFrac": 0.12,
    "alphaMin": 0,
    "alphaMax": 0.15,
    "primaryColor": {
      "r": 5,
      "g": 5,
      "b": 5
    },
    "primaryMix": 1
  }
};

export default RING_BACKDROP;
