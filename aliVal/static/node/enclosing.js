// enclosing.js <bundle> <offset>  -> print ancestor chain + nearest function
const fs = require('fs');
const acorn = require('acorn');
const src = fs.readFileSync(process.argv[2], 'utf8');
const off = parseInt(process.argv[3], 10);
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
const chain = [];
(function walk(node, stack) {
  if (!node || typeof node.type !== 'string') return;
  if (node.start > off || node.end < off) return;
  stack.push(node);
  for (const k of Object.keys(node)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, stack); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, stack);
  }
  if (!chain.length || chain[chain.length - 1] !== node) {
    // record deepest-only path: we rebuild below
  }
  stack.pop();
})(ast, chain);

// rebuild properly: find deepest node containing off
let best = [];
(function walk(node, stack) {
  if (!node || typeof node.type !== 'string' || node.start > off || node.end < off) return;
  stack.push(node);
  if (node.end - node.start > best.reduce((a, n) => a + (n.end - n.start), 0) === false) { }
  best = stack.slice();
  for (const k of Object.keys(node)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, stack); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, stack);
  }
  stack.pop();
})(ast, []);

for (const n of best) {
  const id = n.id && n.id.name ? ' ' + n.id.name : '';
  console.log(`${n.type}${id} [${n.start}..${n.end}]`);
}
