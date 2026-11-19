// pooldump.js â€?decode the pe.081 string pool via corpus scoring.
// usage: node pooldump.js <bundle> <outJson>
const fs = require('fs');
const acorn = require('acorn');

const file = process.argv[2];
const outJson = process.argv[3] || 'pool_decoded.json';
const src = fs.readFileSync(file, 'utf8');

// ---------- corpus: every identifier-ish token literally present in the bundle
const corpus = new Set();
for (const m of src.matchAll(/[A-Za-z_$][A-Za-z0-9_$]{1,40}/g)) corpus.add(m[0]);
// plus siblings
for (const f of fs.readdirSync('../bundles')) {
  if (!f.endsWith('.js')) continue;
  for (const m of fs.readFileSync('../bundles/' + f, 'utf8').matchAll(/[A-Za-z_$][A-Za-z0-9_$]{1,40}/g)) corpus.add(m[0]);
}
console.error('corpus size', corpus.size);

// ---------- pool + alphabet
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
const A = hexMatch[1].match(/.{1,2}/g).map(h => parseInt(h, 16)).filter(v => v >= 0xa0);
const ALPHA = A.map(v => String.fromCharCode(139 ^ v)).join('');

function bytesOf(text) {
  const out = [];
  let e = 0, u = 0;
  for (const ch of text) {
    const r = ALPHA.indexOf(ch);
    if (r < 0) continue;
    e = u % 4 ? 64 * e + r : r; u++;
    if ((u % 4) !== 1) out.push(255 & (e >> ((-2 * u) & 6)));
  }
  return out;
}
const CACHE = pool.map(bytesOf);
function FE(i, key) {
  const bytes = CACHE[i].map(b => b ^ key);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); }
  catch (e) { return Buffer.from(bytes).toString('latin1'); }
}

// ---------- score candidates
const GOOD = /^[\x20-\x7e\u4e00-\u9fa5]+$/;
function score(s) {
  let sc = 0;
  if (!s.length) return -1e9;
  if (!GOOD.test(s)) sc -= 400;
  if (corpus.has(s)) sc += 300;
  // reward identifier-like / word-like shapes
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) sc += 60;
  if (/^[a-z][A-Za-z0-9]*$/.test(s)) sc += 10;
  if (/\s/.test(s) && /^[A-Za-z0-9 _\-.,:;!?'"()\[\]{}\/+=*&%#@<>~|\\^]+$/.test(s)) sc += 40;
  sc += Math.min(s.length, 30);
  // penalise unusual punctuation density
  const odd = (s.match(/[^\w\s\u4e00-\u9fa5$.:\-/]/g) || []).length;
  sc -= odd * 8;
  return sc;
}

const table = [];
for (let i = 0; i < pool.length; i++) {
  const cands = [];
  for (let k = 0; k < 256; k++) {
    const s = FE(i, k);
    if (!s) continue;
    const sc = score(s);
    cands.push({ key: k, s, sc });
  }
  cands.sort((a, b) => b.sc - a.sc);
  table.push({ index: i + 1, encoded: pool[i], best: cands[0], top: cands.slice(0, 4) });
}

fs.writeFileSync(outJson, JSON.stringify({ alphabet: ALPHA, poolSize: pool.length, table }, null, 1));
const certain = table.filter(t => t.top[0].sc - t.top[1].sc > 60).length;
console.error(`decoded ${table.length} entries; high-confidence ${certain}`);
for (const t of table.slice(0, 40)) {
  console.error(`#${t.index} key=${t.best.key} ${JSON.stringify(t.best.s)} (gap ${t.best.sc - t.top[1].sc})`);
}
