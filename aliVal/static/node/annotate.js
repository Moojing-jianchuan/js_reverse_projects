// annotate.js — resolve obfuscated string-pool call sites using the brute-forced
// per-index key table, then emit an annotated source dump.
// usage: node annotate.js <bundle> <pool_decoded.json> <out.json> [rangeStart rangeEnd]
const fs = require('fs');
const acorn = require('acorn');

const [, , bundle, poolJson, outJson, rStart, rEnd] = process.argv;
const src = fs.readFileSync(bundle, 'utf8');
const pool = JSON.parse(fs.readFileSync(poolJson, 'utf8'));
const bestKey = {};
const bestStr = {};
for (const t of pool.table) { bestKey[t.index] = t.best.key; bestStr[t.index] = t.best.s; }

const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

function numOf(n) {
  if (!n) return null;
  switch (n.type) {
    case 'Literal': return typeof n.value === 'number' ? n.value : null;
    case 'UnaryExpression':
      if (n.operator === '-') { const v = numOf(n.argument); return v == null ? null : -v; }
      return null;
    case 'CallExpression': {
      const c = n.callee;
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Math' &&
          c.property.type === 'Identifier' && ['floor', 'ceil', 'round', 'abs'].includes(c.property.name)) {
        const v = numOf(n.arguments[0]);
        if (v == null) return null;
        return Math[c.property.name](v);
      }
      return null;
    }
    case 'BinaryExpression':
      if (['*', '+', '-', '/'].includes(n.operator)) {
        const a = numOf(n.left), b = numOf(n.right);
        if (a == null || b == null) return null;
        switch (n.operator) { case '*': return a * b; case '+': return a + b; case '-': return a - b; case '/': return a / b; }
      }
      return null;
  }
  return null;
}

const hits = [];
const seen = new Set();
function consider(node, keyArg, nArg) {
  const a = numOf(keyArg), b = numOf(nArg);
  if (a == null || b == null) return;
  for (let d = -30; d <= 30; d++) {
    const idx = b + d;
    if (idx < 1 || idx > pool.table.length) continue;
    if (bestKey[idx] !== a) continue;
    const id = node.start;
    if (seen.has(id)) return;
    seen.add(id);
    hits.push({ off: node.start, end: node.end, index: idx, key: a, delta: d, str: bestStr[idx] });
    return;
  }
}

(function walk(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'CallExpression' && n.arguments.length >= 2) {
    const args = n.arguments;
    consider(n, args[args.length - 2], args[args.length - 1]);
    consider(n, args[args.length - 1], args[args.length - 2]);
    if (args.length === 3) { consider(n, args[0], args[1]); consider(n, args[0], args[2]); }
  }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
  }
})(ast);

hits.sort((x, y) => x.off - y.off);
fs.writeFileSync(outJson, JSON.stringify({ count: hits.length, hits }, null, 1));
console.error(`annotated call sites: ${hits.length}`);

// --- emit annotated dump for a range
if (rStart) {
  const s = parseInt(rStart, 10), e = parseInt(rEnd || src.length, 10);
  let out = '', cur = s;
  for (const h of hits) {
    if (h.off < s || h.off > e) continue;
    out += src.slice(cur, h.off);
    out += `«${h.str}»`;
    cur = h.end;
  }
  out += src.slice(cur, e);
  console.log(out);
}
