// vmrun.js — extract the stack-machine interpreter D (pe.081:210257), its bytecode F
// and constants W, then EXECUTE them offline in Node.
//
// usage: node vmrun.js <inputString> [inputString2 ...]
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const P = '../bundles/pe.081.a2ede546e341a1b9.js';
const src = fs.readFileSync(P, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

// find the module-scope declarators D / F / W
let Dnode = null, Fnode = null, Wnode = null;
(function walk(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
    if (n.id.name === 'D' && n.init.type === 'FunctionExpression' && !Dnode) Dnode = n;
    if (n.id.name === 'F' && n.init.type === 'ArrayExpression' && !Fnode) Fnode = n;
    if (n.id.name === 'W' && n.init.type === 'ArrayExpression' && !Wnode) Wnode = n;
  }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
  }
})(ast);
console.log('D at', Dnode.start, 'F at', Fnode.start, 'W at', Wnode.start);

const dSrc = src.slice(Dnode.init.start, Dnode.init.end);
const fSrc = src.slice(Fnode.init.start, Fnode.init.end);
const wSrc = src.slice(Wnode.init.start, Wnode.init.end);

const F = JSON.parse(fSrc);
console.log('bytecode length', F.length);
const W = JSON.parse(wSrc.replace(/!1/g, 'false').replace(/!0/g, 'true'));
console.log('constants pool length', W.length);

// build the interpreter: D = function t(n,e,r,i,a,o){...}
const factory = new Function('window', 'globalThis_wrap',
  'var D = ' + dSrc + ';\nreturn D;');
const winShim = globalThis;   // u._ = window
const D = factory(winShim, winShim);
console.log('interpreter built:', typeof D);

function run(args, label) {
  // D(n, e, r, i, a, o): pc=0, stack=[], bytecode=F, ?, scope={}, arguments
  const out = D(0, [], F, W, {}, args);
  const t = typeof out;
  let preview = '';
  if (typeof out === 'string') preview = JSON.stringify(out.slice(0, 120));
  else preview = String(out);
  console.log(`  ${label}: type=${t} len=${typeof out === 'string' ? out.length : '-'} ${preview}`);
  return out;
}

const inputs = process.argv.slice(2);
if (!inputs.length) {
  inputs.push('eJzdlU1PHDEM9x');
}
for (const s of inputs) {
  run([s], JSON.stringify(s.slice(0, 24)));
  run([s, ''], JSON.stringify(s.slice(0, 24)) + ' +empty2');
}
