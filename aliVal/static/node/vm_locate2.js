// vm_locate2.js — parameterised: locate the stack-machine interpreter (D), the bytecode
// array (F) and the constants pool (W) in ANY pe.* bundle.
// usage: node vm_locate2.js <bundle>
const fs = require('fs');
const acorn = require('acorn');

const file = process.argv[2];
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

// D = the interpreter: a FunctionExpression with >=5 params that reads r[n++] and compares
const cand = fns.filter(f => f.node.params.length >= 5);
for (const f of cand) {
  const body = src.slice(f.node.start, f.node.end);
  if (/r\[n\+\+\]/.test(body)) {
    console.log(`interpreter candidate: ${f.name} @ [${f.node.start},${f.node.end}) len=${f.node.end - f.node.start}`);
  }
}
// arrays bigger than 2000 elements = bytecode
for (const a of arrays) {
  const len = a.node.elements.length;
  if (len > 500) console.log(`array ${a.name} @ [${a.node.start},${a.node.end}) elements=${len}`);
}
console.log('\nall function expr candidates:', cand.map(f => `${f.name}@${f.node.start}`).join(', '));
