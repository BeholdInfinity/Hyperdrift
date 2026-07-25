/**
 * Ship destruction — modular sections break apart using blueprint explode layout.
 */

import { COMBAT } from '../core/Constants.js';
import { computeExplodeLayout } from '../ships/ExplodeLayout.js';
import { drawCatalogSection } from '../ships/SectionDraw.js';

export class ShipBreakupSystem {
  constructor() {
    /** @type {Array<object>} */
    this.fragments = [];
  }

  /**
   * @param {object} ship — player entity or ambient traffic bag
   * @param {{ sectionGap?: number, itemGap?: number }} [opts]
   */
  breakShip(ship, opts = {}) {
    const def = ship?.shipDef;
    if (!def) return;

    const x = ship.position?.x ?? ship.x ?? 0;
    const y = ship.position?.y ?? ship.y ?? 0;
    const angle = ship.angle ?? 0;
    const vx = ship.velocity?.x ?? ship.vx ?? 0;
    const vy = ship.velocity?.y ?? ship.vy ?? 0;

    const layout = computeExplodeLayout(def, {
      sectionGap: opts.sectionGap ?? 48,
      itemGap: opts.itemGap ?? 24,
    });
    const roles =
      typeof def.sectionRoles === 'function'
        ? def.sectionRoles()
        : Object.keys(layout.sectionDx);

    const primaryRole = roles.includes('body')
      ? 'body'
      : roles.includes('hull')
        ? 'hull'
        : roles.includes('cockpit')
          ? 'cockpit'
          : roles[0];

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const life = COMBAT.BREAKUP_FRAGMENT_LIFE;

    for (const role of roles) {
      const sec = def.section(role);
      if (!sec) continue;

      const localDx = layout.sectionDx[role] || 0;
      const wx = x + localDx * cos;
      const wy = y + localDx * sin;

      const outward = localDx >= 0 ? 1 : -1;
      const burst = 90 + Math.random() * 140;
      const spread = (Math.random() - 0.5) * 0.6;
      const fvx = vx + Math.cos(angle + outward * spread) * burst;
      const fvy = vy + Math.sin(angle + outward * spread) * burst;

      this.fragments.push({
        x: wx,
        y: wy,
        vx: fvx,
        vy: fvy,
        angle: angle + (Math.random() - 0.5) * 0.9,
        angularVelocity: (Math.random() - 0.5) * 5,
        section: sec,
        palette: def.paletteForSection(role),
        role,
        isPrimary: role === primaryRole,
        life,
        maxLife: life,
      });
    }
  }

  /** Main hull chunk — body, else hull, else first section. */
  getPrimaryFragment() {
    return this.fragments.find((f) => f.isPrimary) ?? this.fragments[0] ?? null;
  }

  update(deltaTime) {
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.x += f.vx * deltaTime;
      f.y += f.vy * deltaTime;
      f.angle += f.angularVelocity * deltaTime;
      f.vx *= 1 - Math.min(1, deltaTime * 0.08);
      f.vy *= 1 - Math.min(1, deltaTime * 0.08);
      f.life -= deltaTime;
      if (f.life <= 0) this.fragments.splice(i, 1);
    }
  }

  /** @param {CanvasRenderingContext2D} ctx — world space, camera transform applied */
  render(ctx) {
    for (const f of this.fragments) {
      const alpha = Math.min(1, f.life / Math.max(0.001, f.maxLife * 0.35));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      drawCatalogSection(ctx, f.section, f.palette);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.fragments.length = 0;
  }
}
