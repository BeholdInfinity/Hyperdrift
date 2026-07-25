/**
 * Uniform spatial grid broadphase for combat queries.
 */

export class SpatialGrid {
  /**
   * @param {number} cellSize world units per cell
   */
  constructor(cellSize = 400) {
    this.cellSize = cellSize;
    /** @type {Map<string, Array<{ id: string, payload: unknown }>>} */
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  _cell(x, y) {
    return [
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
    ];
  }

  /**
   * @param {string} id dedupe key per query
   * @param {number} x
   * @param {number} y
   * @param {number} radius envelope radius for cell coverage
   * @param {unknown} payload
   */
  insert(id, x, y, radius, payload) {
    const r = Math.max(0, radius);
    const [cx0, cy0] = this._cell(x - r, y - r);
    const [cx1, cy1] = this._cell(x + r, y + r);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = this._key(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push({ id, payload });
      }
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} radius search radius
   * @param {unknown[]} [out] reused output buffer
   */
  queryRadius(x, y, radius, out = []) {
    out.length = 0;
    const seen = new Set();
    const [cx0, cy0] = this._cell(x - radius, y - radius);
    const [cx1, cy1] = this._cell(x + radius, y + radius);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (const entry of bucket) {
          if (seen.has(entry.id)) continue;
          seen.add(entry.id);
          out.push(entry.payload);
        }
      }
    }
    return out;
  }

  /**
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX
   * @param {number} maxY
   * @param {unknown[]} [out]
   */
  queryAABB(minX, minY, maxX, maxY, out = []) {
    out.length = 0;
    const seen = new Set();
    const [cx0, cy0] = this._cell(minX, minY);
    const [cx1, cy1] = this._cell(maxX, maxY);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (const entry of bucket) {
          if (seen.has(entry.id)) continue;
          seen.add(entry.id);
          out.push(entry.payload);
        }
      }
    }
    return out;
  }
}
