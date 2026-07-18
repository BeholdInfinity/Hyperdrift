/**
 * Procedural STRANGER title bronze plate — drawn into a canvas, not a PNG.
 * Letter faces in TitleScreen are windows into this plate.
 */

export const STRANGER_BRONZE_STYLE = 4;
export const STRANGER_BRONZE_HEIGHT = 360;
export const STRANGER_BRONZE_MIN_WIDTH = 640;

/**
 * Resize `canvas` if needed and paint the brushed bronze gradient plate.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [needW]
 * @returns {{ width: number, height: number }}
 */
export function paintStrangerBronzePlate(canvas, needW = STRANGER_BRONZE_MIN_WIDTH) {
  const w = Math.max(STRANGER_BRONZE_MIN_WIDTH, Math.ceil(needW));
  const h = STRANGER_BRONZE_HEIGHT;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const c = canvas.getContext('2d');
  c.clearRect(0, 0, w, h);

  // Brighter at top → darker at bottom (single plate; no vertical tile seam)
  const base = c.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#ffe8b8');
  base.addColorStop(0.22, '#f0d090');
  base.addColorStop(0.4, '#c49a58');
  base.addColorStop(0.55, '#5a3a1a');
  base.addColorStop(0.78, '#1a0e06');
  base.addColorStop(1, '#070304');
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);

  // Coarse brush — thick + high contrast (readable in letter windows)
  const brushCount = Math.round(95 * (h / 360));
  for (let i = 0; i < brushCount; i++) {
    const y = ((i + 0.5) / brushCount) * h + ((i * 13) % 5) * 0.35 - 0.7;
    const dark = i % 2 === 0;
    const a = dark ? 0.42 + (i % 5) * 0.04 : 0.32 + (i % 5) * 0.035;
    c.strokeStyle = dark ? `rgba(32,14,4,${a})` : `rgba(255,220,150,${a})`;
    c.lineWidth = 2.4 + (i % 4 === 0 ? 1.6 : 0) + (i % 7 === 0 ? 1.2 : 0);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y + ((i % 3) - 1) * 0.45);
    c.stroke();
  }

  const fineCount = Math.round(140 * (h / 360));
  for (let i = 0; i < fineCount; i++) {
    const y = ((i + 0.25) / fineCount) * h + ((i * 19) % 3) * 0.2;
    const a = 0.16 + (i % 4) * 0.03;
    c.strokeStyle = i % 2 === 0 ? `rgba(20,8,2,${a})` : `rgba(240,200,130,${a})`;
    c.lineWidth = 1.1 + (i % 3 === 0 ? 0.5 : 0);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y + ((i % 3) - 1) * 0.25);
    c.stroke();
  }

  const dirt = [
    { u: 0.08, v: 0.18, r: 70, a: 0.12 },
    { u: 0.28, v: 0.42, r: 90, a: 0.1 },
    { u: 0.48, v: 0.28, r: 75, a: 0.11 },
    { u: 0.62, v: 0.72, r: 65, a: 0.1 },
    { u: 0.78, v: 0.58, r: 55, a: 0.09 },
    { u: 0.92, v: 0.8, r: 50, a: 0.1 },
    { u: 0.18, v: 0.88, r: 70, a: 0.09 },
    { u: 0.55, v: 0.9, r: 85, a: 0.08 },
  ];
  c.globalCompositeOperation = 'multiply';
  for (const d of dirt) {
    const x = w * d.u;
    const y = h * d.v;
    const rg = c.createRadialGradient(x, y, 0, x, y, d.r);
    rg.addColorStop(0, `rgba(70,40,16,${d.a})`);
    rg.addColorStop(0.6, `rgba(90,60,30,${d.a * 0.35})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg;
    c.beginPath();
    c.arc(x, y, d.r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = 'source-over';

  return { width: w, height: h };
}
