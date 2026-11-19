// listfns.js — list module-level function declarations of the inner SDK module,
// flag CFF (control-flow-flattened) bodies vs readable ones.
// usage: node listfns.js <bundle>
const fs = require('fs');
const acorn = require('acorn');
const src = fs.readFileSync(process.argv[2], 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

// find the module function that owns offset 265500 (module 4845)
function deepestContaining(node, off) {
  let best = null;
  (function walk(n) {
    if (!n || typeof n.type !== 'string' || n.start > off || n.end < off) return;
    best = n;
    for (const k of Object.keys(n)) {
      if (['type', 'start', 'end', 'loc'].includes(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x); }
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  })(node);
  return best;
}

// locate the module function: the FunctionExpression that starts near 194841
let modFn = null;
(function walk(n) {
  if (!n || typeof n.type !== 'string' || modFn) return;
  if (n.type === 'FunctionExpression' && Math.abs(n.start - 194841) < 5) { modFn = n; return; }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    if (modFn) return;
  }
})(ast);
if (!modFn) { console.error('module fn not found'); process.exit(1); }
console.error('module fn', modFn.start, modFn.end);

function text(n) { return src.slice(n.start, n.end); }

const rows = [];
modFn.body.body.forEach(st => {
  if (st.type === 'FunctionDeclaration' && st.id) {
    const body = text(st.body);
    const switches = (body.match(/switch\s*\(/g) || []).length;
    const returns = (body.match(/return /g) || []).length;
    rows.push({ name: st.id.name, start: st.start, end: st.end, len: st.end - st.start, switches, returns });
  } else if (st.type === 'VariableDeclaration') {
    st.declarations.forEach(d => {
      if (d.id.type === 'Identifier' && d.init && (d.init.type === 'FunctionExpression' || d.init.type === 'ArrowFunctionExpression')) {
        const body = text(d.init.body);
        rows.push({ name: d.id.name + '=' + d.init.type, start: st.start, end: st.end, len: st.end - st.start, switches: (body.match(/switch\s*\(/g) || []).length, returns: (body.match(/return /g) || []).length });
      }
    });
  }
});
rows.sort((a, b) => a.start - b.start);
for (const r of rows) {
  const tag = r.switches >= 2 ? 'CFF' : (r.len < 900 ? 'READABLE' : 'mixed');
  console.log(`${String(r.start).padStart(7)}  len=${String(r.len).padStart(6)}  sw=${String(r.switches).padStart(3)}  ret=${String(r.returns).padStart(4)}  ${tag.padEnd(8)}  ${r.name}`);
}
console.error('total', rows.length);
