/**
 * Blueprint exploded-view layout — section gaps + item pull-outs + guide links.
 */

/** Ship-local gap between adjacent section centers when exploded. */
export const EXPLODE_SECTION_GAP = 30;
/** Extra pull from mount socket when exploding hardpoint items. */
export const EXPLODE_ITEM_GAP = 14;

/** Visual mating faces by role (catalog join* is approximate). */
const ROLE_JOINS = {
  bridge: { fore: 21, aft: 8 },
  cockpit: { fore: 16, aft: 4 },
  body: { fore: 10, aft: -15 },
  hull: { fore: 12, aft: -10 },
  engine: { fore: -9, aft: -22 },
  aft: { fore: -2, aft: -16 },
};

/**
 * @param {string[]} roles section roles fore → aft
 * @param {number} gap
 * @returns {Record<string, number>} role → ship-local +X offset
 */
export function sectionExplodeOffsets(roles, gap = EXPLODE_SECTION_GAP) {
  /** @type {Record<string, number>} */
  const out = {};
  const n = roles.length;
  const heavyGap = gap * (n >= 3 ? 1.15 : 1);
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : (n - 1) / 2 - i;
    out[roles[i]] = t * heavyGap;
  }
  return out;
}

function joinAftX(sec, role) {
  if (ROLE_JOINS[role]) return ROLE_JOINS[role].aft;
  if (sec?.joinAft != null) return sec.joinAft;
  return 0;
}

function joinForeX(sec, role) {
  if (ROLE_JOINS[role]) return ROLE_JOINS[role].fore;
  if (sec?.joinFore != null) return sec.joinFore;
  return 0;
}

/**
 * Extra offset for an item away from its socket (on top of section shift).
 * @param {{ x: number, y: number, angle?: number, category?: string }} socket
 * @param {number} itemGap
 */
export function itemExplodeExtra(socket, itemGap = EXPLODE_ITEM_GAP) {
  const cat = socket.category || '';
  if (cat === 'mainEngine') {
    return { dx: -itemGap * 1.4, dy: (socket.y || 0) * 0.15 };
  }
  if (cat === 'forwardLaser' || cat === 'forwardGun' || cat === 'miningLaser') {
    return { dx: itemGap * 1.15, dy: 0 };
  }
  if (
    cat === 'smallTurret' ||
    cat === 'cannonTurret' ||
    cat === 'turret' ||
    cat === 'scienceArray'
  ) {
    return { dx: itemGap * 0.35, dy: 0 };
  }
  if (cat === 'maneuverThruster') {
    const a = socket.angle ?? 0;
    return { dx: Math.cos(a) * itemGap, dy: Math.sin(a) * itemGap };
  }
  const len = Math.hypot(socket.x, socket.y) || 1;
  return {
    dx: (socket.x / len) * itemGap,
    dy: (socket.y / len) * itemGap,
  };
}

/**
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} ExplodeLink
 * @typedef {{
 *   sectionDx: Record<string, number>,
 *   seams: ExplodeLink[],
 *   itemLinks: ExplodeLink[],
 *   itemOffset: Record<string, { dx: number, dy: number }>,
 * }} ExplodeLayout
 */

/**
 * Build explode offsets + dotted-line endpoints for a ship definition.
 * @param {import('./ShipDefinition.js').ShipDefinition} def
 * @param {{ sectionGap?: number, itemGap?: number }} [opts]
 * @returns {ExplodeLayout}
 */
export function computeExplodeLayout(def, opts = {}) {
  const sectionGap = opts.sectionGap ?? EXPLODE_SECTION_GAP;
  const itemGap = opts.itemGap ?? EXPLODE_ITEM_GAP;
  const roles =
    typeof def.sectionRoles === 'function'
      ? def.sectionRoles()
      : Object.keys(def.sectionIds || {});
  const sectionDx = sectionExplodeOffsets(roles, sectionGap);

  /** @type {ExplodeLink[]} */
  const seams = [];
  for (let i = 0; i < roles.length - 1; i++) {
    const foreRole = roles[i];
    const aftRole = roles[i + 1];
    const foreSec = def.section?.(foreRole);
    const aftSec = def.section?.(aftRole);
    const x0 = joinAftX(foreSec, foreRole) + (sectionDx[foreRole] || 0);
    const x1 = joinForeX(aftSec, aftRole) + (sectionDx[aftRole] || 0);
    seams.push({ x0, y0: 0, x1, y1: 0 });
  }

  /** @type {Record<string, { dx: number, dy: number }>} */
  const itemOffset = {};
  /** @type {ExplodeLink[]} */
  const itemLinks = [];
  const mounts = def.resolveMounts?.() || {};
  for (const [key, m] of Object.entries(mounts)) {
    if (!m?.socket) continue;
    const sdx = sectionDx[m.sectionRole] || 0;
    if (!m.item) {
      // Empty socket rides with its section (no pull-out link)
      itemOffset[key] = { dx: sdx, dy: 0 };
      continue;
    }
    const extra = itemExplodeExtra(m.socket, itemGap);
    const dx = sdx + extra.dx;
    const dy = extra.dy;
    itemOffset[key] = { dx, dy };
    // Mount home rides with the section; item floats further out
    itemLinks.push({
      x0: m.socket.x + sdx,
      y0: m.socket.y,
      x1: m.socket.x + dx,
      y1: m.socket.y + dy,
    });
  }

  return { sectionDx, seams, itemLinks, itemOffset };
}

/**
 * Faded dotted guides between mating faces / sockets and pulled parts.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ExplodeLayout} layout
 */
export function drawExplodeGuides(ctx, layout) {
  if (!layout) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([3.2, 3.2]);
  ctx.lineWidth = 1.15;
  ctx.strokeStyle = 'rgba(170, 205, 235, 0.38)';

  for (const link of layout.seams) {
    ctx.beginPath();
    ctx.moveTo(link.x0, link.y0);
    ctx.lineTo(link.x1, link.y1);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(170, 205, 235, 0.28)';
  ctx.lineWidth = 1;
  for (const link of layout.itemLinks) {
    ctx.beginPath();
    ctx.moveTo(link.x0, link.y0);
    ctx.lineTo(link.x1, link.y1);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(190, 220, 245, 0.42)';
  const dots = [...layout.seams, ...layout.itemLinks];
  for (const link of dots) {
    ctx.beginPath();
    ctx.arc(link.x0, link.y0, 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(link.x1, link.y1, 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** @param {object} socket @param {{ dx: number, dy: number }|null} off */
export function offsetSocket(socket, off) {
  if (!off) return socket;
  return {
    ...socket,
    x: socket.x + off.dx,
    y: socket.y + off.dy,
  };
}
