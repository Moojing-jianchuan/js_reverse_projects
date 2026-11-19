// calibrate.js — per-call-site-group calibration of the string-pool wrappers.
// For a group of call sites sharing the same callee shape, the wrapper has a fixed
// offset d with index = (second numeric arg) + d and key = (first numeric arg).
// We pick d that maximises the aggregate plausibility of the decoded strings.
// usage: node calibrate.js <bundle> <outJson>
const fs = require('fs');
const acorn = require('acorn');

const [, , bundle, outJson] = process.argv;
const src = fs.readFileSync(bundle, 'utf8');

// ---------- corpus ----------
const corpus = new Set();
for (const f of fs.readdirSync('../bundles')) {
  if (!f.endsWith('.js')) continue;
  for (const m of fs.readFileSync('../bundles/' + f, 'utf8').matchAll(/[A-Za-z_$][A-Za-z0-9_$]{1,40}/g)) corpus.add(m[0]);
}

// ---------- pool ----------
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
let rvNode = null;
(function find(n) {
  if (!n || typeof n.type !== 'string' || rvNode) return;
  if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'rv') { rvNode = n; return; }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') find(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') find(v);
    if (rvNode) return;
  }
})(ast);
const pool = rvNode.body.body[0].declarations[0].init.elements.map(e => e.value);
const hexMatch = src.slice(rvNode.start, rvNode.end).match(/var a="([0-9a-f]+)"/);
const A = hexMatch[1].match(/.{1,2}/g).map(h => parseInt(h, 16));
const ALPHA = A.map(v => String.fromCharCode(139 ^ v)).join('');
function bytesOf(text) {
  const out = []; let e = 0, u = 0;
  for (const ch of text) {
    const r = ALPHA.indexOf(ch); if (r < 0) continue;
    e = u % 4 ? 64 * e + r : r; u++;
    if ((u % 4) !== 1) out.push(255 & (e >> ((-2 * u) & 6)));
  }
  return out;
}
const CACHE = pool.map(bytesOf);
const FE = (i, key) => {
  const b = CACHE[i].map(x => x ^ key);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(b)); }
  catch (e) { return Buffer.from(b).toString('latin1'); }
};

// ---------- scoring ----------
function score(s) {
  if (!s) return -1e6;
  let sc = 0;
  if (!/^[\x20-\x7e\u4e00-\u9fa5]+$/.test(s)) return -1e6; // must be printable / CJK
  if (corpus.has(s)) sc += 120;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) sc += 25;
  if (/^[A-Za-z][a-z]+$/.test(s)) sc += 8;
  if (/^[\x20-\x7e]+$/.test(s)) sc += 3;
  const odd = (s.match(/[^A-Za-z0-9_$\s.:\-/\u4e00-\u9fa5]/g) || []).length;
  sc -= odd * 4;
  return sc;
}

// ---------- numeric eval ----------
function numOf(n) {
  if (!n) return null;
  switch (n.type) {
    case 'Literal': return typeof n.value === 'number' ? n.value : null;
    case 'UnaryExpression': { const v = numOf(n.argument); return n.operator === '-' && v != null ? -v : null; }
    case 'CallExpression': {
      const c = n.callee;
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Math' &&
          c.property.type === 'Identifier' && ['floor', 'ceil', 'round', 'abs'].includes(c.property.name)) {
        const v = numOf(n.arguments[0]); if (v == null) return null;
        return Math[c.property.name](v);
      }
      return null;
    }
    case 'BinaryExpression': {
      if (!['*', '+', '-', '/'].includes(n.operator)) return null;
      const a = numOf(n.left), b = numOf(n.right); if (a == null || b == null) return null;
      return n.operator === '*' ? a * b : n.operator === '+' ? a + b : n.operator === '-' ? a - b : a / b;
    }
  }
  return null;
}

function calleeShape(n) {
  const c = n.callee;
  if (c.type === 'Identifier') return 'fn:' + c.name + '/' + n.arguments.length;
  if (c.type === 'MemberExpression' && !c.computed) {
    const obj = c.object.type === 'Identifier' ? c.object.name : (c.object.type === 'MemberExpression' && !c.object.computed && c.object.object.type === 'Identifier' ? c.object.object.name + '.' + c.object.property.name : '?');
    return obj + '.' + c.property.name + '/' + n.arguments.length;
  }
  if (c.type === 'SequenceExpression') return 'seq/' + n.arguments.length;
  return null;
}

// ---------- collect candidate sites ----------
const groups = new Map();
(function walk(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'CallExpression' && n.arguments.length >= 2) {
    const args = n.arguments;
    const shape = calleeShape(n);
    if (shape) {
      const a = numOf(args[args.length - 2]), b = numOf(args[args.length - 1]);
      if (a != null && b != null && Number.isInteger(a) && Number.isInteger(b)) {
        if (!groups.has(shape)) groups.set(shape, []);
        groups.get(shape).push({ off: n.start, end: n.end, a, b });
      }
    }
  }
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
  }
})(ast);

// ---------- calibrate each group ----------
const N = pool.length;
const report = [];
const sites = []; // resolved annotations
for (const [shape, list] of groups) {
  if (list.length < 3) continue;
  let best = null;
  for (const swap of [false, true]) {
    for (let d = -60; d <= 60; d++) {
      let total = 0, ok = 0;
      for (const s of list) {
        const key = swap ? s.b : s.a;
        const n2 = swap ? s.a : s.b;
        const idx = n2 + d;
        if (idx < 1 || idx > N || key < 0 || key > 255) { total -= 30; continue; }
        const sc = score(FE(idx - 1, key));
        total += sc;
        if (sc > 30) ok++;
      }
      const cand = { d, swap, total, ok, n: list.length };
      if (!best || cand.total > best.total) best = cand;
    }
  }
  report.push({ shape, n: list.length, best });
  if (best && best.ok / best.n > 0.55) {
    for (const s of list) {
      const key = best.swap ? s.b : s.a;
      const n2 = best.swap ? s.a : s.b;
      const idx = n2 + best.d;
      if (idx < 1 || idx > N || key < 0 || key > 255) continue;
      const str = FE(idx - 1, key);
      if (score(str) > 30) sites.push({ off: s.off, end: s.end, shape, index: idx, key, str });
    }
  }
}
sites.sort((a, b) => a.off - b.off);
// de-duplicate overlapping (keep the innermost/longest)
const final = [];
for (const s of sites) if (!final.length || s.off >= final[final.length - 1].end) final.push(s);

fs.writeFileSync(outJson, JSON.stringify({ poolSize: N, report, count: final.length, sites: final }, null, 1));
console.error('groups calibrated:', report.filter(r => r.best.ok / r.n > 0.55).length, '/', report.length);
console.error('resolved call sites:', final.length);
for (const r of report.filter(x => x.n >= 5).sort((a, b) => b.n - a.n).slice(0, 25)) {
  console.error(`  ${r.shape} n=${r.n} d=${r.best.d} swap=${r.best.swap} ok=${r.best.ok} score=${r.best.total}`);
}
