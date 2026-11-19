// vm_struct.js — structure report for a pe.* bundle: interpreter / bytecode / constants
// pool offsets, plus the call site at a given offset.
// usage: node vm_struct.js <bundle> [callOffset]
const fs = require('fs');
const acorn = require('acorn');

const file = process.argv[2];
const callOff = process.argv[3] ? parseInt(process.argv[3], 10) : null;
const src = fs.readFileSync(file, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

const arrays = [];
const fns = [];
(function walk(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
    if (n.init.type === 'ArrayExpression') arrays.push({ name: n.id.name, node: n.init });
    if (n.init.type === 'FunctionExpression') fns.push({ name: n.id.name, node: n.init });
  }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
  }
})(ast);

const interp = fns.find(f => f.node.params.length >= 5 && /r\[n\+\+\]/.test(src.slice(f.node.start, f.node.end)));
console.log(`interpreter ${interp.name} @ [${interp.node.start},${interp.node.end})`);

// bytecode = the biggest array; pool = the next array after it
arrays.sort((a, b) => b.node.elements.length - a.node.elements.length);
const bc = arrays[0];
console.log(`bytecode    ${bc.name} @ [${bc.node.start},${bc.node.end}) elements=${bc.node.elements.length}`);
const after = arrays.filter(a => a.node.start > bc.node.end).sort((a, b) => a.node.start - b.node.start);
for (const a of after.slice(0, 3)) {
  const vals = a.node.elements;
  const strs = vals.filter(v => v && v.type === 'Literal' && typeof v.value === 'string').length;
  const nums = vals.filter(v => v && v.type === 'Literal' && typeof v.value === 'number').length;
  console.log(`  next array ${a.name} @ [${a.node.start},${a.node.end}) elements=${vals.length} str=${strs} num=${nums}`);
}
if (callOff) {
  console.log(`\n=== context around ${callOff}`);
  console.log(src.slice(Math.max(0, callOff - 700), callOff + 500));
}
