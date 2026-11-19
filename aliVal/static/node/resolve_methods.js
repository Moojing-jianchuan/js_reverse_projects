// resolve_methods.js — resolve obfuscated method calls whose name is <poolString>+"e"
// (or +"t"), and match them against the known AliyunCaptcha prototype methods.
// Target: find the call site of initEmbed / initFloat / initPopup / loading …
const fs = require('fs');
const acorn = require('acorn');

const P = '../bundles/pe.081.a2ede546e341a1b9.js';
const src = fs.readFileSync(P, 'utf8');

// ---- pool + decoder (pe.081: table XOR 139) --------------------------------
const i = src.indexOf('function rv(t,n){var e=[');
const seg = src.slice(i, i + 400000);
const hex = seg.match(/var a="([0-9a-f]+)"/)[1];
const poolText = seg.slice(seg.indexOf('['), seg.indexOf('];') + 1);
const pool = JSON.parse(poolText);
const A = hex.match(/.{1,2}/g).map(h => parseInt(h, 16));
const ALPHA = A.map(v => String.fromCharCode(139 ^ v)).join('');
const CACHE = pool.map(t => {
  const out = []; let e = 0, u = 0;
  for (const ch of t) {
    const r = ALPHA.indexOf(ch); if (r < 0) continue;
    e = u % 4 ? 64 * e + r : r; u++;
    if ((u % 4) !== 1) out.push(255 & (e >> ((-2 * u) & 6)));
  }
  return out;
});
const FE = (idx, key) => {
  const b = CACHE[idx - 1].map(x => x ^ key);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(b)); }
  catch (e) { return Buffer.from(b).toString('latin1'); }
};

const TARGETS = ['initEmbed', 'initFloat', 'initPopup', 'init', 'loading', 'refresh',
  'destroyCaptcha', 'bindEvents', 'onBizSuccess', 'onBizFail', 'initDom',
  'startTracelessVerification', 'onCloseClick', 'startPOWCalculation'];

// ---- numeric evaluation ----------------------------------------------------
function numOf(n) {
  if (!n) return null;
  switch (n.type) {
    case 'Literal': return typeof n.value === 'number' ? n.value : null;
    case 'UnaryExpression': { const v = numOf(n.argument); return n.operator === '-' && v != null ? -v : null; }
    case 'CallExpression': {
      const c = n.callee;
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Math' &&
          c.property.type === 'Identifier') {
        const v = numOf(n.arguments[0]); if (v == null) return null;
        const f = c.property.name;
        return f === 'floor' ? Math.floor(v) : f === 'ceil' ? Math.ceil(v) : f === 'round' ? Math.round(v) : f === 'abs' ? Math.abs(v) : null;
      }
      return null;
    }
    case 'BinaryExpression': {
      const a = numOf(n.left), b = numOf(n.right);
      if (a == null || b == null) return null;
      switch (n.operator) { case '*': return a * b; case '+': return a + b; case '-': return a - b; case '/': return a / b; }
      return null;
    }
    case 'ConditionalExpression': {
      // (~f ? A : B) — f is a local function ⇒ ~f is truthy ⇒ A
      const t = numOf(n.consequent), f2 = numOf(n.alternate);
      return t != null ? t : f2;
    }
    case 'LogicalExpression': {
      const a = numOf(n.left), b = numOf(n.right);
      return a != null ? a : b;
    }
  }
  return null;
}

const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
const hits = [];
(function walk(n) {
  if (!n || typeof n.type !== 'string') return;
  // pattern: MemberExpression[ computed ] whose property is <expr> + "e"/"t", then called
  if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression' && n.callee.computed) {
    const prop = n.callee.property;
    const cands = [];
    if (prop.type === 'BinaryExpression' && prop.operator === '+') {
      for (const side of [prop.left, prop.right]) {
        if (side.type === 'Literal' && typeof side.value === 'string' && side.value.length === 1) {
          cands.push({ inner: prop.left === side ? prop.right : prop.left, suffix: side.value });
        }
      }
    }
    // helper form:  obj[ tu.a(<poolExpr>, "e") ]  — tu.a / J.a / h.L etc. are concat helpers
    if (prop.type === 'CallExpression' && prop.arguments.length === 2) {
      const last = prop.arguments[1];
      if (last.type === 'Literal' && typeof last.value === 'string' && last.value.length === 1) {
        cands.push({ inner: prop.arguments[0], suffix: last.value });
      }
    }
    for (const c of cands) {
        // c.inner should be a CallExpression with 2 numeric args
        if (c.inner.type !== 'CallExpression' || c.inner.arguments.length !== 2) continue;
        for (const swap of [false, true]) {
          const key = numOf(c.inner.arguments[swap ? 1 : 0]);
          const n2 = numOf(c.inner.arguments[swap ? 0 : 1]);
          if (key == null || n2 == null) continue;
          for (let d = -60; d <= 60; d++) {
            const idx = n2 + d;
            if (idx < 1 || idx > pool.length || key < 0 || key > 255) continue;
            const s = FE(idx, key) + c.suffix;
            if (TARGETS.includes(s)) {
              hits.push({ off: n.start, name: s, idx, key, delta: d, swap, nArgs: n.arguments.length, text: src.slice(n.start, Math.min(n.end, n.start + 90)) });
            }
          }
        }
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

const uniq = new Map();
for (const h of hits) if (!uniq.has(h.off)) uniq.set(h.off, h);
console.log(`resolved method call sites: ${uniq.size}`);
for (const h of [...uniq.values()].sort((a, b) => a.off - b.off)) {
  console.log(`  @${h.off}  ${h.name}()  [idx=${h.idx} key=${h.key} d=${h.delta} args=${h.nArgs}]`);
  console.log(`      ${h.text}`);
}
