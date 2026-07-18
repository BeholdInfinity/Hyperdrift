/**
 * Drag Dev pop-out panels by their title bar; positions persist on Save.
 */

const STORAGE_KEY = 'hyperdrift.devPanelPos';

/** @type {Map<string, HTMLElement>} */
const panels = new Map();

function clampPanel(panel, left, top) {
  const w = panel.offsetWidth || 200;
  const h = panel.offsetHeight || 120;
  return {
    left: Math.max(0, Math.min(window.innerWidth - w, left)),
    top: Math.max(0, Math.min(window.innerHeight - h, top)),
  };
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/**
 * @param {HTMLElement} panel
 * @param {{ left: number, top: number, width?: number }} pos
 */
function applyPosition(panel, pos) {
  if (!panel || !pos) return;
  const left = Number(pos.left);
  const top = Number(pos.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return;
  const clamped = clampPanel(panel, left, top);
  panel.classList.add('dev-panel-floating');
  panel.style.left = `${clamped.left}px`;
  panel.style.top = `${clamped.top}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.margin = '0';
  const width = Number(pos.width);
  if (Number.isFinite(width) && width > 40) {
    panel.style.width = `${width}px`;
  }
}

function capturePosition(panel) {
  if (!panel?.id || !panel.classList.contains('dev-panel-floating')) return null;
  const left = parseFloat(panel.style.left);
  const top = parseFloat(panel.style.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  const width = parseFloat(panel.style.width);
  const pos = { left, top };
  if (Number.isFinite(width) && width > 40) pos.width = width;
  return pos;
}

/**
 * Persist current floating positions (merge with prior store).
 * Call from Title Layout / Hangar Save.
 */
export function saveDevPanelPositions() {
  const next = { ...readStored() };
  for (const [id, panel] of panels) {
    const pos = capturePosition(panel);
    if (pos) next[id] = pos;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

/** Restore saved positions onto registered panels. */
export function restoreDevPanelPositions() {
  const data = readStored();
  for (const [id, pos] of Object.entries(data)) {
    const panel = panels.get(id) || document.getElementById(id);
    if (panel) applyPosition(panel, pos);
  }
}

/**
 * @param {HTMLElement|null} panel
 * @param {string} [handleSelector]
 */
export function enableDevPanelDrag(
  panel,
  handleSelector = '.dev-bay-panel-head, .hangar-edit-head'
) {
  if (!panel?.id) return;
  const handle = panel.querySelector(handleSelector);
  if (!handle) return;

  panels.set(panel.id, panel);
  handle.classList.add('dev-panel-drag-handle');

  const stored = readStored()[panel.id];
  if (stored) applyPosition(panel, stored);

  let dragging = false;
  let pid = 0;
  let grabX = 0;
  let grabY = 0;

  const onMove = (e) => {
    if (!dragging || e.pointerId !== pid) return;
    const { left, top } = clampPanel(
      panel,
      e.clientX - grabX,
      e.clientY - grabY
    );
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const onUp = (e) => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false;
    panel.classList.remove('dev-panel-dragging');
    try {
      handle.releasePointerCapture(pid);
    } catch {
      /* ignore */
    }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('button, input, select, textarea, a, label')) return;

    const rect = panel.getBoundingClientRect();
    panel.classList.add('dev-panel-floating');
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.margin = '0';

    dragging = true;
    pid = e.pointerId;
    grabX = e.clientX - rect.left;
    grabY = e.clientY - rect.top;
    panel.classList.add('dev-panel-dragging');
    try {
      handle.setPointerCapture(pid);
    } catch {
      /* ignore */
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.preventDefault();
  });
}
