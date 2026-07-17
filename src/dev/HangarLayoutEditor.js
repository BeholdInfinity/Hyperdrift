/**
 * Hangar flavor layout editor — props, linger, gossip, bay spacing.
 */

import { DevTools } from './DevTools.js';
import {
  HANGAR_LAYOUT,
  HANGAR_PROP_CATEGORY_KINDS,
  HANGAR_BAY_UNIT_HALF,
  categoryForPropKind,
  resolveLingerBays,
  cloneHangarLayout,
  setHangarLayout,
  getHangarSidePadX,
  setHangarSidePadX,
} from '../world/hangar-layout.js';
import {
  applyHangarSidePadX,
  hangarPadX,
  syncHangarSidePadFromLayout,
} from '../world/HangarBay.js';

let _uid = 1;
function nextId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${_uid++}`;
}

function faceToward(fromX, fromY, toX, toY) {
  const deg = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
  return Math.round(deg);
}

function bayRef(bayIndex) {
  const x = hangarPadX(bayIndex);
  return { x, y: 0, bayIndex };
}

export const HangarLayoutEditor = {
  placeKind: null,
  drag: null,
  /** @type {object|null} */
  host: null,

  enter(host = null) {
    this.host = host;
    DevTools.hangarEdit = true;
    DevTools.hangarSel = null;
    this.placeKind = null;
    this.drag = null;
    syncHangarSidePadFromLayout(host?.hangarBay ?? null);
  },

  exit() {
    DevTools.hangarEdit = false;
    DevTools.hangarSel = null;
    this.placeKind = null;
    this.drag = null;
    this.host = null;
  },

  isActive() {
    return !!DevTools.hangarEdit;
  },

  get layout() {
    return HANGAR_LAYOUT;
  },

  select(sel) {
    DevTools.hangarSel = sel;
  },

  _syncHostDock() {
    const host = this.host;
    if (!host?._dockPos) return;
    const pb = host.playerBayIndex ?? host.hangarBay?.playerBayIndex ?? 1;
    host._dockPos.x = hangarPadX(pb);
    host._dockPos.y = 0;
  },

  /**
   * Set symmetric B1/B3 spacing; shifts bay-unit flavor + live sim.
   * @param {number} sidePadX
   */
  setBaySpacing(sidePadX) {
    const { next, delta } = setHangarSidePadX(sidePadX, { shiftFlavor: true });
    applyHangarSidePadX(next, this.host?.hangarBay ?? null, delta);
    this._syncHostDock();
    this._refreshBaySelection();
    if (delta) DevTools.markHangarDirty();
    return delta !== 0;
  },

  /**
   * Nudge outer-bay spacing. Positive = farther from center.
   * @param {number} deltaPx
   */
  nudgeBaySpacing(deltaPx) {
    return this.setBaySpacing(getHangarSidePadX() + (deltaPx | 0));
  },

  _refreshBaySelection() {
    const sel = DevTools.hangarSel;
    if (sel?.type !== 'bay') return;
    const ref = bayRef(sel.bayIndex);
    sel.ref = ref;
    sel.id = `bay${sel.bayIndex}`;
  },

  /**
   * @param {number} wx
   * @param {number} wy
   */
  /**
   * Pad-center / door-header grips only (high priority so ships/props don't steal).
   * @param {number} wx
   * @param {number} wy
   */
  hitTestBayGrip(wx, wy) {
    if (!DevTools.hangarLayers.bays) return null;
    const side = getHangarSidePadX();
    const halfH = 200;
    const doorH = 42;
    for (const bayIndex of [0, 1, 2]) {
      const cx = bayIndex === 0 ? -side : bayIndex === 2 ? side : 0;
      // Pad disc grip
      if (Math.hypot(wx - cx, wy - 0) < 36) {
        return { type: 'bay', bayIndex, id: `bay${bayIndex}`, ref: bayRef(bayIndex) };
      }
      // Door-header label bar (drawn near north wall)
      if (Math.abs(wx - cx) <= HANGAR_BAY_UNIT_HALF && wy >= -halfH + 4 && wy <= -halfH + doorH + 18) {
        return { type: 'bay', bayIndex, id: `bay${bayIndex}`, ref: bayRef(bayIndex) };
      }
    }
    return null;
  },

  /**
   * Broader bay-unit strip (used after prop/linger misses).
   * @param {number} wx
   * @param {number} wy
   */
  hitTestBay(wx, wy) {
    if (!DevTools.hangarLayers.bays) return null;
    const grip = this.hitTestBayGrip(wx, wy);
    if (grip) return grip;
    const side = getHangarSidePadX();
    const halfH = 200;
    const doorH = 42;
    for (const bayIndex of [0, 1, 2]) {
      const cx = bayIndex === 0 ? -side : bayIndex === 2 ? side : 0;
      if (Math.abs(wx - cx) <= 36 && wy >= -halfH + doorH && wy <= 120) {
        return { type: 'bay', bayIndex, id: `bay${bayIndex}`, ref: bayRef(bayIndex) };
      }
    }
    return null;
  },

  /**
   * @param {number} wx
   * @param {number} wy
   */
  hitTest(wx, wy) {
    const layers = DevTools.hangarLayers;
    const hitR = 14;
    // Bay grips win first — otherwise the ship / pad clutter makes them unclickable.
    const bayGrip = this.hitTestBayGrip(wx, wy);
    if (bayGrip) return bayGrip;
    if (layers.gossip) {
      for (const g of HANGAR_LAYOUT.gossip) {
        if (Math.hypot(g.x - wx, g.y - wy) < hitR) {
          return { type: 'gossip', id: g.id, ref: g };
        }
      }
    }
    if (layers.linger) {
      for (const p of HANGAR_LAYOUT.props) {
        for (const L of p.linger || []) {
          if (Math.hypot(L.x - wx, L.y - wy) < hitR - 2) {
            return { type: 'linger', propId: p.id, standId: L.id, ref: L, prop: p };
          }
        }
      }
    }
    if (layers.props) {
      for (const p of HANGAR_LAYOUT.props) {
        if (p.kind === 'computer') continue;
        if (Math.hypot(p.x - wx, p.y - wy) < hitR + 4) {
          return { type: 'prop', id: p.id, ref: p };
        }
      }
    }
    return this.hitTestBay(wx, wy);
  },

  onPointerDown(wx, wy) {
    if (!this.isActive()) return false;
    if (this.placeKind) {
      this.placeAt(this.placeKind, wx, wy);
      this.placeKind = null;
      return true;
    }
    const hit = this.hitTest(wx, wy);
    if (!hit) {
      this.select(null);
      return true;
    }
    this.select(hit);
    if (hit.type === 'bay') {
      this.drag = {
        type: 'bay',
        bayIndex: hit.bayIndex,
        ref: hit.ref,
        startSide: getHangarSidePadX(),
      };
      return true;
    }
    this.drag = {
      ...hit,
      ox: wx - hit.ref.x,
      oy: wy - hit.ref.y,
    };
    return true;
  },

  onPointerMove(wx, wy) {
    if (!this.drag) return false;
    if (this.drag.type === 'bay') {
      // B2 is the symmetry anchor — outer bays only move left/right as a pair.
      if (this.drag.bayIndex === 1) return true;
      const side = Math.abs(Math.round(wx));
      this.setBaySpacing(side);
      return true;
    }
    const ref = this.drag.ref;
    ref.x = Math.round(wx - this.drag.ox);
    ref.y = Math.round(wy - this.drag.oy);
    DevTools.markHangarDirty();
    return true;
  },

  onPointerUp() {
    const was = !!this.drag;
    this.drag = null;
    return was;
  },

  placeAt(kind, x, y) {
    if (kind === 'gossip') {
      const g = {
        id: nextId('gossip'),
        x: Math.round(x),
        y: Math.round(y),
        capacity: 3,
      };
      HANGAR_LAYOUT.gossip.push(g);
      this.select({ type: 'gossip', id: g.id, ref: g });
      DevTools.markHangarDirty();
      return;
    }

    const category = categoryForPropKind(kind);
    const prop = {
      id: nextId(kind),
      kind,
      category,
      variant: 0,
      x: Math.round(x),
      y: Math.round(y),
      facing: 0,
    };

    // Yard / decor are set-dressing — no bay linger by default.
    if (category !== 'yard' && category !== 'decor') {
      const half = getHangarSidePadX() * 0.5;
      const bay = x < -half ? 0 : x > half ? 2 : 1;
      prop.bay = bay;
      prop.linger = [
        {
          id: nextId('linger'),
          x: Math.round(x + 14),
          y: Math.round(y + 12),
          bays: [bay],
          faceDeg: faceToward(x + 14, y + 12, x, y),
          faceSlackDeg: 25,
        },
      ];
    } else if (category === 'decor') {
      const half = getHangarSidePadX() * 0.5;
      prop.bay = x < -half ? 0 : x > half ? 2 : 1;
      prop.linger = [];
    }

    HANGAR_LAYOUT.props.push(prop);
    this.select({ type: 'prop', id: prop.id, ref: prop });
    DevTools.markHangarDirty();
  },

  addLingerToSelected() {
    const sel = DevTools.hangarSel;
    if (!sel || (sel.type !== 'prop' && sel.type !== 'linger')) return;
    const prop =
      sel.type === 'prop'
        ? sel.ref
        : HANGAR_LAYOUT.props.find((p) => p.id === sel.propId);
    if (!prop || prop.kind === 'computer') {
      // allow computer linger add
    }
    if (!prop) return;
    if (!prop.linger) prop.linger = [];
    const stand = {
      id: nextId('linger'),
      x: Math.round(prop.x + 12),
      y: Math.round(prop.y + 14),
      bays: typeof prop.bay === 'number' ? [prop.bay] : [0, 1, 2],
      faceDeg: faceToward(prop.x + 12, prop.y + 14, prop.x, prop.y),
      faceSlackDeg: 25,
    };
    prop.linger.push(stand);
    this.select({ type: 'linger', propId: prop.id, standId: stand.id, ref: stand, prop });
    DevTools.markHangarDirty();
  },

  rotateSelected(dir = 1) {
    const sel = DevTools.hangarSel;
    if (!sel) return;
    if (sel.type === 'bay') return;
    if (sel.type === 'prop') {
      sel.ref.facing = (((sel.ref.facing | 0) + dir) % 8 + 8) % 8;
      DevTools.markHangarDirty();
    } else if (sel.type === 'linger') {
      sel.ref.faceDeg = ((sel.ref.faceDeg ?? 90) + dir * 15 + 360) % 360;
      DevTools.markHangarDirty();
    }
  },

  deleteSelected() {
    const sel = DevTools.hangarSel;
    if (!sel || sel.type === 'bay') return;
    if (sel.type === 'prop') {
      HANGAR_LAYOUT.props = HANGAR_LAYOUT.props.filter((p) => p.id !== sel.id);
    } else if (sel.type === 'gossip') {
      HANGAR_LAYOUT.gossip = HANGAR_LAYOUT.gossip.filter((g) => g.id !== sel.id);
    } else if (sel.type === 'linger') {
      const prop = HANGAR_LAYOUT.props.find((p) => p.id === sel.propId);
      if (prop?.linger) {
        prop.linger = prop.linger.filter((L) => L.id !== sel.standId && L !== sel.ref);
      }
    }
    this.select(null);
    DevTools.markHangarDirty();
  },

  duplicateSelected() {
    const sel = DevTools.hangarSel;
    if (!sel || sel.type === 'bay') return;
    if (sel.type === 'prop') {
      const copy = JSON.parse(JSON.stringify(sel.ref));
      copy.id = nextId(copy.kind);
      if (!copy.category) copy.category = categoryForPropKind(copy.kind);
      copy.x += 16;
      copy.y += 12;
      if (copy.linger) {
        for (const L of copy.linger) {
          L.id = nextId('linger');
          L.x += 16;
          L.y += 12;
        }
      }
      HANGAR_LAYOUT.props.push(copy);
      this.select({ type: 'prop', id: copy.id, ref: copy });
      DevTools.markHangarDirty();
    } else if (sel.type === 'gossip') {
      const copy = { ...sel.ref, id: nextId('gossip'), x: sel.ref.x + 16, y: sel.ref.y + 12 };
      HANGAR_LAYOUT.gossip.push(copy);
      this.select({ type: 'gossip', id: copy.id, ref: copy });
      DevTools.markHangarDirty();
    }
  },

  setLingerBays(bays) {
    const sel = DevTools.hangarSel;
    if (sel?.type !== 'linger') return;
    const cleaned = [...new Set(bays)].filter((b) => b === 0 || b === 1 || b === 2);
    if (!cleaned.length) return;
    sel.ref.bays = cleaned;
    DevTools.markHangarDirty();
  },

  setFaceSlack(deg) {
    const sel = DevTools.hangarSel;
    if (sel?.type !== 'linger') return;
    sel.ref.faceSlackDeg = Math.max(0, Math.min(90, deg | 0));
    DevTools.markHangarDirty();
  },

  setGossipCapacity(n) {
    const sel = DevTools.hangarSel;
    if (sel?.type !== 'gossip') return;
    sel.ref.capacity = Math.max(1, Math.min(8, n | 0));
    DevTools.markHangarDirty();
  },

  /**
   * Draw editor markers in hangar world space (caller already in hangar transform).
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (!this.isActive()) return;
    const layers = DevTools.hangarLayers;
    const sel = DevTools.hangarSel;
    const side = getHangarSidePadX();

    if (layers.bays) {
      const halfH = 200;
      const doorH = 42;
      for (let bayIndex = 0; bayIndex < 3; bayIndex++) {
        const cx = bayIndex === 0 ? -side : bayIndex === 2 ? side : 0;
        const on = sel?.type === 'bay' && sel.bayIndex === bayIndex;
        ctx.save();
        ctx.strokeStyle = on ? 'rgba(255, 210, 90, 0.95)' : 'rgba(120, 180, 220, 0.45)';
        ctx.lineWidth = on ? 2.2 : 1.2;
        ctx.setLineDash(on ? [6, 4] : [4, 5]);
        ctx.strokeRect(
          cx - HANGAR_BAY_UNIT_HALF,
          -halfH + doorH,
          HANGAR_BAY_UNIT_HALF * 2,
          120 - (-halfH + doorH)
        );
        ctx.setLineDash([]);
        // Pad-center drag grip (matches hitTestBayGrip radius cue)
        ctx.fillStyle = on ? 'rgba(255, 220, 100, 0.35)' : 'rgba(140, 200, 230, 0.2)';
        ctx.beginPath();
        ctx.arc(cx, 0, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = on ? 'rgba(255, 220, 100, 0.95)' : 'rgba(140, 200, 230, 0.7)';
        ctx.beginPath();
        ctx.arc(cx, 0, on ? 9 : 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = on ? 'rgba(255, 240, 160, 0.95)' : 'rgba(200, 230, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 18, 0);
        ctx.lineTo(cx + 18, 0);
        ctx.stroke();
        if (bayIndex !== 1) {
          ctx.beginPath();
          ctx.moveTo(cx - 12, -5);
          ctx.lineTo(cx - 18, 0);
          ctx.lineTo(cx - 12, 5);
          ctx.moveTo(cx + 12, -5);
          ctx.lineTo(cx + 18, 0);
          ctx.lineTo(cx + 12, 5);
          ctx.stroke();
        }
        ctx.fillStyle = on ? 'rgba(255, 230, 140, 0.95)' : 'rgba(180, 210, 230, 0.8)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`B${bayIndex + 1}`, cx, -halfH + doorH + 14);
        ctx.restore();
      }
    }

    if (layers.warn) {
      // Soft warn bands: forklift road
      ctx.fillStyle = 'rgba(255, 80, 60, 0.06)';
      ctx.fillRect(-340, 148 - 18, 680, 36);
    }

    if (layers.props || layers.linger) {
      for (const p of HANGAR_LAYOUT.props) {
        if (p.kind === 'computer' && !layers.linger) continue;
        if (layers.props && p.kind !== 'computer') {
          const on = sel?.type === 'prop' && sel.id === p.id;
          ctx.strokeStyle = on ? 'rgba(255,220,80,0.95)' : 'rgba(180,200,220,0.45)';
          ctx.lineWidth = on ? 2 : 1;
          ctx.strokeRect(p.x - 10, p.y - 10, 20, 20);
        }
        if (layers.linger) {
          for (const L of p.linger || []) {
            const on =
              sel?.type === 'linger' &&
              (sel.standId === L.id || sel.ref === L);
            const bays = resolveLingerBays(L, p);
            const col =
              bays.length === 3
                ? 'rgba(200,200,210,0.9)'
                : bays[0] === 0
                  ? 'rgba(200,120,60,0.95)'
                  : bays[0] === 1
                    ? 'rgba(80,180,200,0.95)'
                    : 'rgba(140,180,80,0.95)';
            ctx.fillStyle = on ? 'rgba(255,230,100,0.95)' : col;
            ctx.beginPath();
            ctx.arc(L.x, L.y, on ? 5 : 3.5, 0, Math.PI * 2);
            ctx.fill();
            const face = ((L.faceDeg ?? 90) * Math.PI) / 180;
            const slack = ((L.faceSlackDeg ?? 0) * Math.PI) / 180;
            ctx.strokeStyle = 'rgba(255,240,160,0.55)';
            ctx.beginPath();
            ctx.moveTo(L.x, L.y);
            ctx.arc(L.x, L.y, 16, face - slack, face + slack);
            ctx.closePath();
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,220,100,0.9)';
            ctx.beginPath();
            ctx.moveTo(L.x, L.y);
            ctx.lineTo(L.x + Math.cos(face) * 18, L.y + Math.sin(face) * 18);
            ctx.stroke();
          }
        }
      }
    }

    if (layers.gossip) {
      for (const g of HANGAR_LAYOUT.gossip) {
        const on = sel?.type === 'gossip' && sel.id === g.id;
        ctx.strokeStyle = on ? 'rgba(255,200,255,0.95)' : 'rgba(200,140,255,0.7)';
        ctx.lineWidth = on ? 2 : 1.2;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 2;
          const px = g.x + Math.cos(a) * 8;
          const py = g.y + Math.sin(a) * 8;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        const n = Math.max(1, g.capacity | 0);
        ctx.strokeStyle = 'rgba(200,140,255,0.35)';
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(g.x + Math.cos(a) * 12, g.y + Math.sin(a) * 12, 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(230,200,255,0.85)';
        ctx.font = '9px monospace';
        ctx.fillText(`×${g.capacity}`, g.x + 10, g.y - 8);
      }
    }
  },

  paletteKinds() {
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const [cat, kinds] of Object.entries(HANGAR_PROP_CATEGORY_KINDS)) {
      if (cat === 'anchor') continue;
      out[cat] = kinds;
    }
    out.special = ['gossip'];
    return out;
  },

  revertFromClone(snapshot) {
    if (!snapshot) return;
    setHangarLayout(cloneHangarLayout(snapshot));
    applyHangarSidePadX(getHangarSidePadX(), this.host?.hangarBay ?? null, 0);
    this._syncHostDock();
    DevTools.dirty.hangar = false;
  },
};
