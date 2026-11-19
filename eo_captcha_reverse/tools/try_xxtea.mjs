// try_xxtea.mjs — XXTEA over the whole collect buffer with the eks blob (as a
// long key array) and other candidates. XXTEA uses the *whole* key array, which
// matches "16-byte-key TEA failed" while blocks still look ECB-ish near the
// stable region.
import fs from 'node:fs';
import crypto from 'node:crypto';

const collect = fs.readFileSync('src/collect_local_1.bin');
const rep = JSON.parse(fs.readFileSync('src/tdc_probe_report.json', 'utf8'));
const eksStr = rep.info?.info || '';
const eks = Buffer.from(eksStr, 'base64');
const DELTA = 0x9e3779b9;

function score(buf) {
  let p = 0;
  for (const b of buf) if ((b >= 0x20 && b < 0x7f) || b === 0x0a || b === 0x0d || b === 0x09) p++;
  return p / buf.length;
}
const printable = (b, n = 120) => b.slice(0, n).toString('latin1').replace(/[^\x20-\x7e]/g, '.');

function bufToWords(b, endian) {
  const n = Math.ceil(b.length / 4);
  const w = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    w[i] = endian === 'be'
      ? (((b[o] || 0) << 24) | ((b[o + 1] || 0) << 16) | ((b[o + 2] || 0) << 8) | (b[o + 3] || 0)) >>> 0
      : (((b[o + 3] || 0) << 24) | ((b[o + 2] || 0) << 16) | ((b[o + 1] || 0) << 8) | (b[o] || 0)) >>> 0;
  }
  return w;
}
function wordsToBuf(w, endian) {
  const b = Buffer.alloc(w.length * 4);
  for (let i = 0; i < w.length; i++) {
    const v = w[i] >>> 0, o = i * 4;
    if (endian === 'be') { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; }
    else { b[o + 3] = v >>> 24; b[o + 2] = (v >>> 16) & 255; b[o + 1] = (v >>> 8) & 255; b[o] = v & 255; }
  }
  return b;
}
const mx = (sum, y, z, p, e, k) =>
  ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (k[(p & 3) ^ e] ^ z))) >>> 0;

// standard XXTEA (corrected) decrypt
function xxteaDecrypt(v, k) {
  const n = v.length;
  if (n < 2) return v;
  let rounds = Math.floor(6 + 52 / n);
  let sum = (rounds * DELTA) >>> 0;
  let y = v[0];
  while (sum !== 0) {
    const e = (sum >>> 2) & 3;
    for (let p = n - 1; p > 0; p--) {
      const z = v[p - 1];
      y = v[p] = (v[p] - mx(sum, y, z, p, e, k)) >>> 0;
    }
    const z = v[n - 1];
    y = v[0] = (v[0] - mx(sum, y, z, 0, e, k)) >>> 0;
    sum = (sum - DELTA) >>> 0;
  }
  return v;
}

const keyCands = {
  'eks264': eks,
  'eks264.rev': Buffer.from(eks).reverse(),
  'ascii(eksStr)': Buffer.from(eksStr, 'latin1'),
  'md5(eks)16': crypto.createHash('md5').update(eks).digest(),
  'sha256(eks)32': crypto.createHash('sha256').update(eks).digest(),
  'sess': fs.existsSync('src/sess_sample.txt') ? Buffer.from(fs.readFileSync('src/sess_sample.txt', 'utf8').trim(), 'base64') : Buffer.alloc(16),
};

let best = { s: 0 };
for (const [kn, kb] of Object.entries(keyCands)) {
  for (const ke of ['be', 'le']) {
    const k = bufToWords(kb, ke);
    for (const de of ['be', 'le']) {
      const v = bufToWords(collect, de);
      const out = wordsToBuf(xxteaDecrypt(v.slice(), k), de);
      const s = score(out);
      if (s > best.s) best = { s, name: `xxtea key=${kn}/${ke} data=${de}`, out };
      if (s > 0.55) console.log(`*** ${s.toFixed(2)} xxtea key=${kn}/${ke} data=${de}\n    ${printable(out)}`);
    }
  }
}
console.log(`best=${best.s.toFixed(3)} ${best.name || ''}`);
if (best.out) console.log('head: ' + printable(best.out));
