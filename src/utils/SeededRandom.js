export class SeededRandom {
  constructor(seed = 1) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(array) {
    return array[this.int(0, array.length - 1)];
  }

  fork(salt) {
    const newSeed = ((this.seed * 31 + salt) | 0) % 2147483647;
    return new SeededRandom(newSeed || 1);
  }
}

export function hashCoords(x, y, seed = 0) {
  let h = seed + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return h >>> 0;
}
