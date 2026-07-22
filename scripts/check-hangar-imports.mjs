import fs from 'fs';
import path from 'path';

const dir = 'src/world/hangar';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

function parseImports(src) {
  const imported = new Set();
  for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gs)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) imported.add(name);
    }
  }
  return imported;
}

function localNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/(?:function|const|let|class)\s+([a-zA-Z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/HangarBay\.prototype\.([a-zA-Z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  return names;
}

// Known globals / params
const builtins = new Set([
  'Math', 'console', 'Object', 'Array', 'Number', 'String', 'Boolean', 'Date', 'Map', 'Set',
  'Infinity', 'NaN', 'undefined', 'null', 'true', 'false', 'ctx', 'dt', 'npc', 'pad', 'ship',
  'bay', 'col', 'row', 'i', 'j', 'k', 't', 'x', 'y', 'dx', 'dy', 'a', 'b', 'n', 'm', 'r', 'c',
  'ev', 'opts', 'hooks', 'weapons', 'space', 'deltaTime', 'hazard', 'bias', 'hold', 'block',
  'cargo', 'pile', 'item', 'svc', 'seq', 'ctrl', 'claim', 'lane', 'kind', 'extra', 'skin',
  'removed', 'cells', 'grid', 'spec', 'st', 'it', 'g', 's', 'e', 'd', 'p', 'f', 'w', 'h',
  'act', 'weaponPulse', 'hazardLevel', 'ox', 'oy', 'look', 'op', 'c', 'tx', 'ty', 'speed',
  'exceptBay', 'exceptNpc', 'floorMoves', 'agentMoves', 'craneBay', 'sidePadX', 'hangarBay',
  'delta', 'peerPadMk', 'bayIndex', 'bayId', 'visitorId', 'shipDef', 'meter01', 'hull01',
  'slotCount', 'fraction01', 'revealOrder', 'typeById', 'globalIndex', 'totalInType', 'arr',
  'lo', 'hi', 'need', 'frac', 'slots', 'cap', 'deficit', 'm', 'power', 'burst', 'pick',
  'pickVisitorId', // will flag if missing import
]);

for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const imported = parseImports(src);
  const local = localNames(src);
  const issues = [];

  // Check capitalized identifiers and common function calls
  for (const m of src.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
    const id = m[1];
    if (imported.has(id) || local.has(id)) continue;
    if (['HANGAR', 'SHIP', 'ROW', 'BAY', 'JSON', 'VISITOR_CATALOG', 'HARDPOINTS', 'SHIP_EXTENT', 'Settings', 'OFF', 'DONE'].includes(id)) continue;
    issues.push(id);
  }

  for (const m of src.matchAll(/\b(pickVisitorId|makeVisitorThrusters|equipPadVisitor|clearPadVisitor|createVisitorShipDef|drawVisitorShip|getVisitorPropulsion|createPlayerStarter|hangarShipView|getItem|placeRegistry|resolveHangarSkin|buildServiceBoardRows|drawServiceChecklistColumn|upgradeKindFromItemId|pickCatalogItemId|normalizeAngle|clamp|rand|pick|colXs|padCenters|bayLabels|rowRole|pileId|nextServiceSeq)\(/g)) {
    const id = m[1];
    if (!imported.has(id) && !local.has(id)) issues.push(id + '()');
  }

  const uniq = [...new Set(issues)];
  if (uniq.length) {
    console.log(f + ':');
    for (const u of uniq.sort()) console.log('  ' + u);
  }
}
