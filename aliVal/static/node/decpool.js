// decpool.js — extract the bundle's own string-pool decoder (`nc`) and evaluate pool
// entries, so encoded property names can be resolved exactly as the runtime does.
// usage: node decpool.js <bundle> <fnName> <idx:key> [<idx:key> ...]
const fs = require('fs');
const acorn = require('acorn');
const [file, fnName, ...pairs] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

let node = null;
(function w(n) {
  if (!n || typeof n.type !== 'string' || node) return;
  if (n.type === 'FunctionDeclaration' && n.id && n.id.name === fnName) { node = n; return; }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') w(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') w(v);
    if (node) return;
  }
})(ast);
if (!node) { console.log('decoder not found'); process.exit(1); }
const body = src.slice(node.start, node.end);
console.log(`decoder ${fnName} @ [${node.start},${node.end}) len=${body.length}`);
const fn = new Function('window', body + `\nreturn ${fnName};`)({});
for (const p of pairs) {
  const [i, k] = p.split(':').map(Number);
  let out;
  try { out = fn(i, k); } catch (e) { out = 'THROW ' + e.message; }
  console.log(`  ${fnName}(${i}, ${k}) = ${JSON.stringify(out)}`);
}
