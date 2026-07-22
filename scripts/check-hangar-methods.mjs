import fs from 'fs';
import path from 'path';

const dir = 'src/world/hangar';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

const protoMethods = new Set();
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of src.matchAll(/HangarBay\.prototype\.([a-zA-Z_$][\w$]*)\s*=/g)) {
    protoMethods.add(m[1]);
  }
  if (f === 'HangarBay.js') {
    for (const m of src.matchAll(/^\s{2}([a-zA-Z_$][\w$]*)\(/gm)) {
      protoMethods.add(m[1]);
    }
  }
}

const called = new Map();
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of src.matchAll(/this\.(_?[a-zA-Z][\w$]*)\(/g)) {
    const name = m[1];
    if (!called.has(name)) called.set(name, []);
    if (!called.get(name).includes(f)) called.get(name).push(f);
  }
}

const missing = [];
for (const [name, callers] of called) {
  if (!protoMethods.has(name) && name !== 'constructor') {
    missing.push({ name, callers });
  }
}
missing.sort((a, b) => a.name.localeCompare(b.name));
console.log(`Missing methods (${missing.length}):`);
for (const { name, callers } of missing) {
  console.log(`  ${name} <- ${callers.join(', ')}`);
}
