// vmtry.js â€?run the REAL pe.069 VM program F (bytecode F + pool q) offline and brute
// force which (input, seed) pair reproduces the captured `data`.
const fs = require('fs');
const acorn = require('acorn');
const zlib = require('zlib');

const P = '../bundles/pe.069.bcf01ca00f5bd260.js';
const src = fs.readFileSync(P, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

const obj = { arrays: {}, fns: {} };
(function w(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
    if (n.init.type === 'ArrayExpression') obj.arrays[n.id.name] = n.init;
    if (n.init.type === 'FunctionExpression') obj.fns[n.id.name] = n.init;
  }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') w(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') w(v);
  }
})(ast);

const valOf = el => {
  if (!el) return undefined;
  if (el.type === 'Literal') return el.value;
  if (el.type === 'UnaryExpression' && el.operator === '-' && el.argument.type === 'Literal') return -el.argument.value;
  if (el.type === 'UnaryExpression' && el.operator === '!' && el.argument.type === 'Literal') return !el.argument.value;
  return null;
};
const F = obj.arrays.F.elements.map(valOf);
const q = obj.arrays.q.elements.map(valOf);
const lSrc = src.slice(obj.fns.L.start, obj.fns.L.end);
console.log(`interpreter L: ${lSrc.length} chars | F: ${F.length} words | q: ${q.length} entries`);

const win = {
  String, Number, Boolean, Object, Array, Math, JSON, Date, parseInt, parseFloat, isNaN,
  encodeURIComponent, decodeURIComponent, escape, unescape,
  atob: s => Buffer.from(s, 'base64').toString('latin1'),
  btoa: s => Buffer.from(s, 'latin1').toString('base64'),
  console,
};
win.window = win;
const L = new Function('window', 'var L = ' + lSrc + ';\nreturn L;')(win);

// ---------------------------------------------------------------------------
const b64 = s => Buffer.from(s, 'base64');
function trySample(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const T = d.deflate_b64.trim();
  const blob = d.cvp_blob.trim();
  const raw = b64(blob);
  const payload = zlib.inflateSync(b64(T));
  const nonce = payload.subarray(0, 32).toString('latin1');
  const deflate = b64(T);
  console.log(`\n=== ${file}`);
  console.log(`  T=${T.length} data=${blob.length} raw=${raw.length} nonce=${nonce}`);
  console.log(`  data[0:3]=${raw.subarray(0,3).toString('hex')}`);

  const inputs = {
    T: T,
    'T.slice(3)': T.slice(3),
    'deflate(latin1)': deflate.toString('latin1'),
    'payload(latin1)': payload.toString('latin1'),
  };
  const seeds = {
    nonce: nonce,
    key_43d41aa61352f672: '43d41aa61352f672',
    device_config: d.device_config,
    empty: '',
    nonceHexTwice: nonce + nonce,
  };
  for (const [inm, inp] of Object.entries(inputs)) {
    for (const [snm, sd] of Object.entries(seeds)) {
      let got;
      try { got = L(0, [], F, q, { r: 1 }, [inp, sd]); }
      catch (e) { console.log(`  in=${inm} seed=${snm} THROW ${e.message}`); continue; }
      if (typeof got !== 'string') { console.log(`  in=${inm} seed=${snm} -> ${typeof got} ${String(got).slice(0,40)}`); continue; }
      const eq = got === blob;
      const tailEq = got.length === blob.length && got.slice(4) === blob.slice(4);
      const flag = eq ? ' *** FULL MATCH ***' : tailEq ? ' ** TAIL MATCH **' : '';
      console.log(`  in=${inm.padEnd(16)} seed=${snm.padEnd(22)} len=${String(got.length).padStart(4)} eq=${eq} tail=${tailEq}${flag}`);
      if (eq || tailEq) return { got, blob };
    }
  }
  return null;
}

const files = process.argv.slice(2);
if (!files.length) files.push('../../config/cvp_sample_1.json', '../../config/cvp_sample_2.json');
for (const f of files) trySample(f);
