// nonce_vm_evidence.js — show that pe.081's bytecode VM (D/F/W) is the 32-hex nonce
// generator, and that it is fully reproducible offline.
const fs = require('fs');
const acorn = require('acorn');
const P = '../bundles/pe.081.a2ede546e341a1b9.js';
const src = fs.readFileSync(P, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
let Dn = null, Fn = null, Wn = null;
(function walk(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
    if (n.id.name === 'D' && n.init.type === 'FunctionExpression' && !Dn) Dn = n;
    if (n.id.name === 'F' && n.init.type === 'ArrayExpression' && !Fn) Fn = n;
    if (n.id.name === 'W' && n.init.type === 'ArrayExpression' && !Wn) Wn = n;
  }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
  }
})(ast);
const dSrc = src.slice(Dn.init.start, Dn.init.end);
const F = JSON.parse(src.slice(Fn.init.start, Fn.init.end));
const W = JSON.parse(src.slice(Wn.init.start, Wn.init.end).replace(/!1/g, 'false').replace(/!0/g, 'true'));
const g = {
  String, Number, Boolean, Math, Array, Object, JSON, Date, parseInt, isNaN,
  btoa: s => Buffer.from(s, 'latin1').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('latin1'),
};
g.window = g;
const D = new Function('window', 'var D = ' + dSrc + ';\nreturn D;')(g);

const lines = [];
lines.push(`interpreter D at pe.081:${Dn.init.start} (${dSrc.length} chars)`);
lines.push(`bytecode   F at pe.081:${Fn.init.start} (${F.length} words)`);
lines.push(`constants  W at pe.081:${Wn.init.start} (${W.length} entries)`);
lines.push(`call site  pe.081:289715   re = J.q( D(0,[],F,W,e5,[re, <str>]), re )`);
lines.push('');
lines.push('offline runs (a={r:1} so the program returns the stack top):');
for (let i = 0; i < 5; i++) {
  const out = D(0, [], F, W, { r: 1 }, ['f108d668874fd2950f66f503740c115d', 'x']);
  lines.push(`  run ${i}: ${JSON.stringify(out)}  (len=${out.length}, hex32=${/^[0-9a-f]{32}$/.test(out)})`);
}
lines.push('');
lines.push('input-independence check (different arg, same generator):');
for (const arg of ['', 'AAAA', 'eJzdlU1P']) {
  const out = D(0, [], F, W, { r: 1 }, [arg, 'x']);
  lines.push(`  arg=${JSON.stringify(arg)} -> ${out}`);
}
lines.push('');
lines.push('nonce actually observed in the captured payload:');
const zlib = require('zlib');
const T = fs.readFileSync('../../config/sample_deflate.b64', 'utf8').trim();
const payload = zlib.inflateSync(Buffer.from(T, 'base64'));
lines.push('  ' + payload.subarray(0, 32).toString('latin1'));
const txt = lines.join('\n');
fs.writeFileSync('../work/nonce_vm_evidence.txt', txt);
console.log(txt);
