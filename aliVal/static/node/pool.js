// pool.js â€?decode the AAEncode-style string pool of pe.081 (rv/FE)
// usage: node pool.js <bundle> [outJson]
const fs = require('fs');
const acorn = require('acorn');

const file = process.argv[2];
const outJson = process.argv[3];
const src = fs.readFileSync(file, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

// --- locate function rv and its pool array ----------------------------------
let rvNode = null;
(function find(node) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'FunctionDeclaration' && node.id && node.id.name === 'rv') { rvNode = node; return; }
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') find(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') find(v);
    if (rvNode) return;
  }
})(ast);
if (!rvNode) { console.error('rv not found'); process.exit(1); }
console.error('rv at', rvNode.start);

// first statement: var e = [ ... ]
const decl = rvNode.body.body[0];
const arrNode = decl.declarations[0].init;
const pool = arrNode.elements.map(e => e.value);
console.error('pool size', pool.length);

// --- the FE table (40-56 bytes of hex) found inside rv ----------------------
const rvSrc = src.slice(rvNode.start, rvNode.end);
const hexMatch = rvSrc.match(/var a="([0-9a-f]+)"/);
if (!hexMatch) { console.error('FE table not found'); process.exit(1); }
const A = hexMatch[1].match(/.{1,2}/g).map(h => parseInt(h, 16));
console.error('FE table bytes', A.length);

// alphabet: position p decodes to the char c with (139 ^ c.charCodeAt(0)) === A[p]
const ALPHA = A.map(v => String.fromCharCode(139 ^ v)).join('');
console.error('alphabet =', JSON.stringify(ALPHA));

function b64customToBytes(text) {
  const out = [];
  let e = 0, u = 0;
  for (let s = 0; s < text.length; s++) {
    const r = ALPHA.indexOf(text.charAt(s));
    if (r < 0) continue;
    if (u % 4) e = 64 * e + r; else e = r;
    u++;
    if ((u % 4) !== 1) out.push(255 & (e >> ((-2 * u) & 6)));
  }
  return out;
}
function FE(t, n) {
  const bytes = b64customToBytes(t).map(b => b ^ n);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); }
  catch (e) { return Buffer.from(bytes).toString('latin1'); }
}

// --- decode with a given key ------------------------------------------------
function decodeAll(key) {
  return pool.map((s, i) => FE(s, key));
}

if (outJson) {
  // try the mode key: most likely the key making the most entries printable
  let best = null;
  for (let k = 0; k < 256; k++) {
    const d = decodeAll(k);
    let score = 0;
    for (const s of d) if (/^[\x20-\x7e]{1,60}$/.test(s)) score++;
    if (!best || score > best.score) best = { k, score, d };
  }
  console.error(`best single key = ${best.k} printable=${best.score}/${pool.length}`);
  fs.writeFileSync(outJson, JSON.stringify({ poolSize: pool.length, alphabet: ALPHA, singleKeyGuess: best.k, strings: best.d }, null, 1));
  console.log('wrote', outJson);
}

// --- brute force: find a pool entry containing the magic bytes 25 13 27 -----
let hits = [];
for (let i = 0; i < pool.length; i++) {
  for (let k = 0; k < 256; k++) {
    const s = FE(pool[i], k);
    const b = Buffer.from(s, 'latin1');
    if (b.includes(Buffer.from([0x25, 0x13, 0x27]))) hits.push({ idx: i + 1, key: k, s, hex: b.toString('hex') });
  }
}
console.log('magic-byte hits:', JSON.stringify(hits, null, 1));
