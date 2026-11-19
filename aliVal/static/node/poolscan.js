// poolscan.js — scan the pe.081 string pool over ALL (index,key) pairs for
// entries of cryptographic interest (hex keys, alphabets, algorithm names).
const fs = require('fs');
const acorn = require('acorn');
const [, , bundle] = process.argv;
const src = fs.readFileSync(bundle, 'utf8');
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
const A = src.slice(rvNode.start, rvNode.end).match(/var a="([0-9a-f]+)"/)[1].match(/.{1,2}/g).map(h => parseInt(h, 16));
const ALPHA = A.map(v => String.fromCharCode(139 ^ v)).join('');
const CACHE = pool.map(text => {
  const out = []; let e = 0, u = 0;
  for (const ch of text) {
    const r = ALPHA.indexOf(ch); if (r < 0) continue;
    e = u % 4 ? 64 * e + r : r; u++;
    if ((u % 4) !== 1) out.push(255 & (e >> ((-2 * u) & 6)));
  }
  return out;
});
const FE = (i, key) => {
  const b = CACHE[i].map(x => x ^ key);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(b)); }
  catch (e) { return Buffer.from(b).toString('latin1'); }
};

const tests = [
  ['hex16', /^[0-9a-f]{16}$/],
  ['hex32', /^[0-9a-f]{32}$/],
  ['hex64', /^[0-9a-f]{64}$/],
  ['alpha64', /^[A-Za-z0-9+/=]{60,70}$/],
  ['crypto-word', /(aes|AES|encrypt|decrypt|Cipher|cipher|cbc|CBC|ctr|CTR|magic|salt|nonce|random)/],
  ['long-text', /^[\x20-\x7e]{20,200}$/],
];
const seen = new Set();
for (let i = 0; i < pool.length; i++) {
  for (let k = 0; k < 256; k++) {
    const s = FE(i, k);
    if (!s || !/^[\x20-\x7e\u4e00-\u9fa5]+$/.test(s)) continue;
    for (const [name, rx] of tests) {
      if (rx.test(s)) {
        const key = `${i + 1}|${k}|${s}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (name === 'crypto-word' || name === 'hex16' || name === 'hex32' || name === 'hex64' || name === 'alpha64') {
          console.log(`${name.padEnd(11)} idx=${i + 1} key=${k}  ${JSON.stringify(s)}`);
        }
      }
    }
  }
}
console.log('\n--- long-text (idx/key/len <= 200 chars) ---');
for (let i = 0; i < pool.length; i++) {
  for (let k = 0; k < 256; k++) {
    const s = FE(i, k);
    if (s && s.length >= 20 && /^[\x20-\x7e\u4e00-\u9fa5]+$/.test(s) && /[a-zA-Z]{4,}/.test(s))
      console.log(`idx=${i + 1} key=${k} len=${s.length} ${JSON.stringify(s.slice(0, 140))}`);
  }
}
