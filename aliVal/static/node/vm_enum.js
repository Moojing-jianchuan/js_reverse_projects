// vm_enum.js — enumerate every large numeric array literal in a bundle (bytecode /
// constant pools) and look for the armour magic 37,19,39 or 25,13,39 inside them.
const fs = require('fs');
const acorn = require('acorn');

const files = process.argv.slice(2);
if (!files.length) files.push('../bundles/pe.081.a2ede546e341a1b9.js');

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
  const found = [];
  (function walk(n, parent) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ArrayExpression' && n.elements.length >= 128) {
      const nums = n.elements.filter(e => e && e.type === 'Literal' && typeof e.value === 'number');
      if (nums.length === n.elements.length) {
        const vals = n.elements.map(e => e.value);
        // magic subsequence?
        const hits = [];
        for (let i = 0; i + 2 < vals.length; i++) {
          if (vals[i] === 37 && vals[i + 1] === 19 && vals[i + 2] === 39) hits.push(['37,19,39', i]);
          if (vals[i] === 25 && vals[i + 1] === 13 && vals[i + 2] === 39) hits.push(['25,13,39', i]);
        }
        found.push({ off: n.start, end: n.end, len: vals.length, min: Math.min(...vals), max: Math.max(...vals), hits });
      }
    }
    for (const k of Object.keys(n)) {
      if (['type', 'start', 'end', 'loc'].includes(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, n); }
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, n);
    }
  })(ast, null);
  console.log(`=== ${f}: ${found.length} numeric arrays >=128 elements`);
  for (const rec of found) {
    console.log(`  off=${rec.off}..${rec.end} len=${rec.len} range=[${rec.min}..${rec.max}] magic=${rec.hits.length ? JSON.stringify(rec.hits) : '-'}`);
  }
}
