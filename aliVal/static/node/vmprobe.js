// vmprobe.js — probe the interpreter's calling convention: try several scope/config
// objects and argument shapes, print whatever comes back.
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

const globalObj = {
  String, Number, Boolean, Math, Array, Object, JSON, Date, parseInt, parseFloat,
  isNaN, encodeURIComponent, decodeURIComponent, unescape, escape,
  atob: (s) => Buffer.from(s, 'base64').toString('latin1'),
  btoa: (s) => Buffer.from(s, 'latin1').toString('base64'),
  console,
  navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0' },
  document: {}, screen: { width: 1920, height: 1080 }, location: { href: 'https://x/' },
};
globalObj.window = globalObj;
const factory = new Function('window', 'var D = ' + dSrc + ';\nreturn D;');
const D = factory(globalObj);

const T = fs.readFileSync('../../config/sample_deflate.b64', 'utf8').trim();
const inputs = [
  ['T', T],
  ['T[3:]', T.slice(3)],
  ['short', 'eJzdlU1P'],
];

const scopes = [
  [{}, 'a={}'],
  [{ r: 1 }, 'a={r:1}'],
  [{ s: globalObj }, 'a={s:window}'],
  [{ s: {}, r: 1 }, 'a={s:{},r:1}'],
];
function show(v) {
  if (typeof v === 'string') {
    return `string len=${v.length} head=${JSON.stringify(v.slice(0, 40))} ` +
      `codes=[${[...v.slice(0, 12)].map(c => c.charCodeAt(0)).join(',')}]`;
  }
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'object') return 'object ' + JSON.stringify(v).slice(0, 120);
  return `${typeof v} ${String(v).slice(0, 80)}`;
}
for (const [nm, inp] of inputs) {
  for (const [a, al] of scopes) {
    for (const args of [[inp], [inp, ''], [inp, 'x'], ['', inp]]) {
      try {
        const out = D(0, [], F, W, a, args);
        console.log(`${nm.padEnd(7)} ${al.padEnd(12)} args=${args.length} -> ${show(out)}`);
      } catch (e) {
        console.log(`${nm.padEnd(7)} ${al.padEnd(12)} args=${args.length} -> THROW ${e.message}`);
      }
    }
  }
}
