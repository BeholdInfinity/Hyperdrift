/**
 * Scan stroke visuals — green raster lines clipped to a contact silhouette.
 * Extracted from hangar scan helpers (HangarRender._strokeScanSegment).
 */

/** Two-pass glow stroke used by scanner sweep lines. */
export function strokeScanSegment(ctx, x0, y0, x1, y1, amp, width) {
  if (amp < 0.02) return;
  ctx.strokeStyle = `rgba(70, 230, 130, ${0.22 * amp})`;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(180, 255, 210, ${0.35 * amp})`;
  ctx.lineWidth = Math.max(0.45, width * 0.28);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function pingPong01(t) {
  const u = t % 2;
  return u < 1 ? u : 2 - u;
}

/**
 * Draw scanner raster lines clipped to the current clip path (target silhouette).
 * Caller must set up ctx.save() + silhouette clip + world transform first.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx target center x (world)
 * @param {number} cy target center y (world)
 * @param {number} halfLen half-length along target axis (world)
 * @param {number} halfBeam half-width perpendicular (world)
 * @param {number} angle target facing (rad)
 * @param {number} scanT clock driving the sweep (s)
 * @param {number} amp 0..1 intensity (scanPct / maxScanPct)
 */
export function drawScanLinesClipped(ctx, cx, cy, halfLen, halfBeam, angle, scanT, amp) {
  if (amp < 0.02) return;
  ctx.globalCompositeOperation = 'lighter';
  const u = pingPong01(scanT * 1.15);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const along = (u * 2 - 1) * halfLen;
  const rx = cx + c * along;
  const ry = cy + s * along;
  const bx = -s * halfBeam * 1.15;
  const by = c * halfBeam * 1.15;
  strokeScanSegment(ctx, rx - bx, ry - by, rx + bx, ry + by, amp * 0.85, 2.4);
  strokeScanSegment(ctx, rx - bx, ry - by, rx + bx, ry + by, amp, 0.85);
  for (const trail of [-0.12, 0.12]) {
    const u2 = pingPong01(scanT * 1.15 + trail);
    const along2 = (u2 * 2 - 1) * halfLen;
    const rx2 = cx + c * along2;
    const ry2 = cy + s * along2;
    strokeScanSegment(ctx, rx2 - bx, ry2 - by, rx2 + bx, ry2 + by, amp * 0.28, 1.4);
  }
}
