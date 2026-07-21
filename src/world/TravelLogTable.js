/**
 * Travel log list — sort / filter (Excel-style table helpers).
 */

/** @param {object} entry */
export function tripDurationMs(entry) {
  const start = entry.startedAt ?? entry.endedAt ?? 0;
  const end = entry.endedAt ?? Date.now();
  return Math.max(0, end - start);
}

/** @param {number} ms */
export function formatTripDuration(ms) {
  if (ms == null || ms < 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

const FILTER_CYCLES = {
  map: ['all', 'on', 'off'],
  named: ['all', 'renamed', 'default'],
  dist: ['all', 'yes'],
  poi: ['all', 'yes'],
  locked: ['all', 'locked', 'unlocked'],
};

export function createTravelLogTableState() {
  return {
    sort: { key: 'date', dir: -1 },
    filter: {
      map: 'all',
      named: 'all',
      dist: 'all',
      poi: 'all',
      locked: 'all',
    },
    listScroll: 0,
  };
}

export function cycleTravelLogFilter(table, column) {
  const cycle = FILTER_CYCLES[column];
  if (!cycle) return;
  const f = table.filter;
  const i = cycle.indexOf(f[column]);
  f[column] = cycle[(i + 1) % cycle.length];
  table.listScroll = 0;
}

export function cycleTravelLogSort(table, key) {
  if (table.sort.key === key) {
    table.sort.dir *= -1;
  } else {
    table.sort.key = key;
    table.sort.dir = key === 'date' || key === 'number' ? -1 : 1;
  }
  table.listScroll = 0;
}

export function filterLabel(column, value) {
  const labels = {
    map: { all: '·', on: 'ON', off: 'OFF' },
    named: { all: '·', renamed: '★', default: '#' },
    dist: { all: '·', yes: '>' },
    poi: { all: '·', yes: '>' },
    locked: { all: '·', locked: 'L', unlocked: 'U' },
  };
  return labels[column]?.[value] ?? '·';
}

/**
 * @param {object[]} entries
 * @param {object} table
 * @param {import('./TravelLog.js').TravelLog} log
 */
export function applyTravelLogTable(entries, table, log) {
  const f = table.filter;
  let list = entries.filter((e) => {
    if (f.locked === 'locked' && !e.locked) return false;
    if (f.locked === 'unlocked' && e.locked) return false;
    if (f.map === 'on' && !e.visibleOnMap) return false;
    if (f.map === 'off' && e.visibleOnMap) return false;
    if (f.named === 'renamed' && !log.isRenamed(e)) return false;
    if (f.named === 'default' && log.isRenamed(e)) return false;
    if (f.dist === 'yes' && !(e.distanceTraveled > 0)) return false;
    if (f.poi === 'yes' && !(e.poisEncountered > 0)) return false;
    return true;
  });

  const { key, dir } = table.sort;
  list = list.slice().sort((a, b) => compareTrips(a, b, key, dir, log));
  return list;
}

function compareTrips(a, b, key, dir, log) {
  let cmp = 0;
  switch (key) {
    case 'date':
      cmp = (a.endedAt ?? a.startedAt ?? 0) - (b.endedAt ?? b.startedAt ?? 0);
      if (cmp === 0) cmp = (a.expeditionNumber ?? 0) - (b.expeditionNumber ?? 0);
      break;
    case 'number':
      cmp = (a.expeditionNumber ?? 0) - (b.expeditionNumber ?? 0);
      break;
    case 'name':
      cmp = log.expeditionTitle(a).localeCompare(log.expeditionTitle(b), undefined, { sensitivity: 'base' });
      if (cmp === 0) cmp = (a.expeditionNumber ?? 0) - (b.expeditionNumber ?? 0);
      break;
    case 'dist':
      cmp = (a.distanceTraveled ?? 0) - (b.distanceTraveled ?? 0);
      break;
    case 'time':
      cmp = tripDurationMs(a) - tripDurationMs(b);
      break;
    case 'poi':
      cmp = (a.poisEncountered ?? 0) - (b.poisEncountered ?? 0);
      break;
    default:
      cmp = 0;
  }
  return cmp * dir;
}

/** @returns {number} max listScroll for archived rows (excludes pinned CURRENT row). */
export function travelLogListMaxScroll(engine, archiveRowSlots) {
  if (archiveRowSlots <= 0) return 0;
  const table = engine.sectorMapView.travelLogTable;
  const sorted = applyTravelLogTable(engine.travelLog.entries, table, engine.travelLog);
  return Math.max(0, sorted.length - archiveRowSlots);
}

export function stepTravelLogListScroll(engine, wheelDelta, archiveRowSlots) {
  const table = engine.sectorMapView.travelLogTable;
  if (!wheelDelta) return;
  const max = travelLogListMaxScroll(engine, archiveRowSlots);
  const next = (table.listScroll || 0) - Math.sign(wheelDelta);
  table.listScroll = Math.max(0, Math.min(max, next));
}

export function truncateText(ctx, text, maxW) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
