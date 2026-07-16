/**
 * Hangar flavor layout editor — props, linger, gossip.
 */

import { DevTools } from './DevTools.js';
import {
  HANGAR_LAYOUT,
  HANGAR_PROP_KINDS,
  HANGAR_YARD_KINDS,
  resolveLingerBays,
  cloneHangarLayout,
  setHangarLayout,
} from '../world/hangar-layout.js';

let _uid = 1;
function nextId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${_uid++}`;
}

function faceToward(fromX, fromY, toX, toY) {
  const deg = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
  return Math.round(deg);
}

export const HangarLayoutEditor = {
  placeKind: null,
  drag: null,

  enter() {
    DevTools.hangarEdit = true;
    DevTools.hangarSel = null;
    this.placeKind = null;
    this.drag = null;
  },

  exit() {
    DevTools.hangarEdit = false;
    DevTools.hangarSel = null;
    this.placeKind = null;
    this.drag = null;
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

  /**
   * @param {number} wx
   * @param {number} wy
   */
  hitTest(wx, wy) {
    const layers = DevTools.hangarLayers;
    const hitR = 14;
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
    if (layers.yard) {
      for (const p of HANGAR_LAYOUT.yardProps) {
        if (Math.hypot(p.x - wx, p.y - wy) < hitR + 4) {
          return { type: 'yard', id: p.id, ref: p };
        }
      }
    }
    return null;
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
    this.drag = {
      ...hit,
      ox: wx - hit.ref.x,
      oy: wy - hit.ref.y,
    };
    return true;
  },

  onPointerMove(wx, wy) {
    if (!this.drag) return false;
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
    const isYard = HANGAR_YARD_KINDS.includes(kind);
    if (isYard) {
      const prop = {
        id: nextId(kind),
        kind,
        variant: 0,
        x: Math.round(x),
        y: Math.round(y),
        facing: 0,
      };
      HANGAR_LAYOUT.yardProps.push(prop);
      this.select({ type: 'yard', id: prop.id, ref: prop });
    } else if (kind === 'gossip') {
      const g = {
        id: nextId('gossip'),
        x: Math.round(x),
        y: Math.round(y),
        capacity: 3,
      };
      HANGAR_LAYOUT.gossip.push(g);
      this.select({ type: 'gossip', id: g.id, ref: g });
    } else {
      const bay = x < -80 ? 0 : x > 80 ? 2 : 1;
      const prop = {
        id: nextId(kind),
        kind,
        variant: 0,
        x: Math.round(x),
        y: Math.round(y),
        bay,
        facing: 0,
        linger: [
          {
            id: nextId('linger'),
            x: Math.round(x + 14),
            y: Math.round(y + 12),
            bays: [bay],
            faceDeg: faceToward(x + 14, y + 12, x, y),
            faceSlackDeg: 25,
          },
        ],
      };
      HANGAR_LAYOUT.props.push(prop);
      this.select({ type: 'prop', id: prop.id, ref: prop });
    }
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
    if (sel.type === 'prop' || sel.type === 'yard') {
      sel.ref.facing = (((sel.ref.facing | 0) + dir) % 8 + 8) % 8;
      DevTools.markHangarDirty();
    } else if (sel.type === 'linger') {
      sel.ref.faceDeg = ((sel.ref.faceDeg ?? 90) + dir * 15 + 360) % 360;
      DevTools.markHangarDirty();
    }
  },

  deleteSelected() {
    const sel = DevTools.hangarSel;
    if (!sel) return;
    if (sel.type === 'prop') {
      HANGAR_LAYOUT.props = HANGAR_LAYOUT.props.filter((p) => p.id !== sel.id);
    } else if (sel.type === 'yard') {
      HANGAR_LAYOUT.yardProps = HANGAR_LAYOUT.yardProps.filter((p) => p.id !== sel.id);
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
    if (!sel) return;
    if (sel.type === 'prop' || sel.type === 'yard') {
      const copy = JSON.parse(JSON.stringify(sel.ref));
      copy.id = nextId(copy.kind);
      copy.x += 16;
      copy.y += 12;
      if (copy.linger) {
        for (const L of copy.linger) {
          L.id = nextId('linger');
          L.x += 16;
          L.y += 12;
        }
      }
      if (sel.type === 'prop') HANGAR_LAYOUT.props.push(copy);
      else HANGAR_LAYOUT.yardProps.push(copy);
      this.select({ type: sel.type, id: copy.id, ref: copy });
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

    if (layers.yard) {
      for (const p of HANGAR_LAYOUT.yardProps) {
        const on = sel?.type === 'yard' && sel.id === p.id;
        ctx.strokeStyle = on ? 'rgba(255,220,80,0.95)' : 'rgba(160,180,140,0.5)';
        ctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
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
    return {
      deck: HANGAR_PROP_KINDS,
      yard: HANGAR_YARD_KINDS,
      special: ['gossip'],
    };
  },

  revertFromClone(snapshot) {
    if (!snapshot) return;
    setHangarLayout(cloneHangarLayout(snapshot));
    DevTools.dirty.hangar = false;
  },
};
