/**
 * Flight / Blueprint debug overlays — mounts, velocity, axes.
 */

import { DevTools } from './DevTools.js';

/**
 * Draw inside a world-space layer (after camera transform), ship-local.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {object} opts.ship
 * @param {number} [opts.zoom=1] for line widths
 * @param {() => Record<string, {x:number,y:number,angle:number}>} [opts.getHardpoints]
 */
export function drawDevOverlays(ctx, opts) {
  const flags = DevTools.overlay;
  if (!flags.mounts && !flags.velocity && !flags.axes) return;
  const ship = opts.ship;
  if (!ship) return;
  const zoom = opts.zoom || 1;

  ctx.save();
  ctx.translate(ship.x ?? ship.position?.x ?? 0, ship.y ?? ship.position?.y ?? 0);
  ctx.rotate(ship.angle);

  if (flags.axes) {
    ctx.strokeStyle = 'rgba(255,80,80,0.85)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,220,120,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 28);
    ctx.stroke();
  }

  if (flags.velocity) {
    const vx = ship.velocity?.x ?? ship.vx ?? 0;
    const vy = ship.velocity?.y ?? ship.vy ?? 0;
    const c = Math.cos(-ship.angle);
    const s = Math.sin(-ship.angle);
    const lx = vx * c - vy * s;
    const ly = vx * s + vy * c;
    const scale = 0.04;
    ctx.strokeStyle = 'rgba(120,200,255,0.9)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(lx * scale, ly * scale);
    ctx.stroke();
  }

  if (flags.mounts) {
    const table =
      opts.getHardpoints?.() ||
      ship.shipDef?.hardpointsTable?.() ||
      {};
    const keys = Object.keys(table);
    const sel = DevTools.selectedMount?.key;
    for (const key of keys) {
      const hp = table[key];
      if (!hp) continue;
      const active = key === sel;
      ctx.save();
      ctx.translate(hp.x, hp.y);
      ctx.rotate(hp.angle || 0);
      ctx.strokeStyle = active ? 'rgba(255,220,80,0.95)' : 'rgba(255,160,60,0.75)';
      ctx.fillStyle = active ? 'rgba(255,220,80,0.35)' : 'rgba(255,160,60,0.2)';
      ctx.lineWidth = (active ? 2 : 1.2) / zoom;
      ctx.beginPath();
      ctx.arc(0, 0, active ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,230,180,0.85)';
      ctx.font = `${10 / zoom}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(key, hp.x + 4, hp.y - 4);
    }
  }

  ctx.restore();
}
