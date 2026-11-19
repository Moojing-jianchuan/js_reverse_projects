// pools.js — print the constants pools (q for program F, X for program H) of a pe bundle.
const fs = require('fs');
const acorn = require('acorn');
const [file, which] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
const arrs = {};
(function w(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'ArrayExpression')
    arrs[n.id.name] = n.init.elements;
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') w(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') w(v);
  }
})(ast);
function valOf(el) {
  if (!el) return '<hole>';
  if (el.type === 'Literal') return el.value;
  if (el.type === 'UnaryExpression' && el.operator === '-' && el.argument.type === 'Literal') return -el.argument.value;
  if (el.type === 'UnaryExpression' && el.operator === '!' && el.argument.type === 'Literal') return !el.argument.value;
  return '<' + el.type + '>';
}
for (const name of which.split(',')) {
  const p = (arrs[name] || []).map(valOf);
  console.log(`=== pool ${name}: ${p.length} entries`);
  const strs = p.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'string');
  console.log('strings:', JSON.stringify(strs));
  console.log('numbers:', JSON.stringify(p.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'number')));
  console.log();
}
