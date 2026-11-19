// armour_test.js — test whether the observed keystream
//   ks[i] = b64(deflate)[i+3] ^ data_raw[i+3]
// comes from a standard construction with known key material.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CFG = path.join(__dirname, '..', '..', 'config');
const load = n => fs.readFileSync(path.join(CFG, n), 'utf8').trim();

const T = load('sample_deflate.b64');                 // base64(deflate), 852 ASCII chars
const dataRaw = Buffer.from(load('sample_data.b64'), 'base64');
const enc = dataRaw.subarray(3);
const deflate = Buffer.from(T, 'base64');
const payload = require('zlib').inflateSync(deflate);
const nonceHex = payload.subarray(0, 32).toString('latin1');
const nonce = Buffer.from(nonceHex, 'hex');

console.log(`T=${T.length} enc=${enc.length} deflate=${deflate.length} payload=${payload.length}`);
console.log(`nonce=${nonceHex}`);

const ks = Buffer.from(enc.map((b, i) => b ^ T.charCodeAt(i + 3)));

const keys = {
  REQ: '45f8ac1e1de14397', RES: '87f879f135f27da7', FLAG: 'c175a358550d02e2',
  UPLOAD: 'a549a55c60a39aa0', PREID: '75ae5c150d235802', ACCESS: 'FqJB6iRNVYdEGpwb',
  IVALPHA: '0123456789ABCDEF', IVHEX16: 'd35db7e39ebbf3d0',
  KEYID16: '111jdk439dJJIjd0', KEYSEC16: '222aiJodos2938JD',
  APPKEY16: 'ab034ec0643f9139', NONCE_ASCII16: nonceHex.slice(0, 16),
  NONCE_ASCII32: nonceHex,
  NONCE_RAW_AS_LATIN: nonce.toString('latin1'),
};
const ivs = {
  NONCE: nonce, NONCE_HEX16: Buffer.from(nonceHex.slice(0, 16), 'latin1'),
  NONCE_HEX16B: Buffer.from(nonceHex.slice(16), 'latin1'),
  NONCE_HEX32: Buffer.from(nonceHex, 'latin1'),
  ALPHA: Buffer.from('0123456789ABCDEF', 'latin1'),
  ZERO: Buffer.alloc(16), IVHEX: Buffer.from('d35db7e39ebbf3d0', 'latin1'),
  NONCE_REV: Buffer.from(nonce).reverse(),
};

function streamOf(mode, key, iv, len) {
  const alg = 'aes-128-' + mode;
  try {
    const c = crypto.createCipheriv(alg, key, iv);
    return Buffer.concat([c.update(Buffer.alloc(len)), c.final()]);
  } catch (e) { return null; }
}

function matches(s, off) {
  let n = 0, total = 0;
  for (let i = 0; i < ks.length && i + off < s.length; i++, total++) if (s[i + off] === ks[i]) n++;
  return { n, total, rate: n / total };
}

const results = [];
for (const [kl, kv] of Object.entries(keys)) {
  if (Buffer.byteLength(kv) !== 16) continue;
  for (const [il, iv] of Object.entries(ivs)) {
    if (iv.length !== 16) continue;
    for (const mode of ['ctr', 'ofb', 'cfb']) {
      const s = streamOf(mode, Buffer.from(kv, 'latin1'), iv, 1000);
      if (!s) continue;
      for (const off of [0, 3]) {
        const m = matches(s, off);
        results.push({ kl, il, mode, off, ...m });
      }
    }
  }
}
results.sort((a, b) => b.rate - a.rate);
console.log('\ntop AES candidates by keystream agreement:');
for (const r of results.slice(0, 12)) console.log(`  ${(r.rate * 100).toFixed(1)}%  ${r.mode} key=${r.kl} iv=${r.il} off=${r.off} (${r.n}/${r.total})`);

// ---- plain PRNG keystream tests (seed from nonce) -------------------------
function xorshift32(seed, len) {
  let x = seed >>> 0 || 1; const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}
function mulberry32(seed, len) {
  let a = seed >>> 0; const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
  }
  return out;
}
const seeds = [
  nonce.readUInt32LE(0), nonce.readUInt32BE(0), nonce.readUInt32LE(12), nonce.readUInt32BE(12),
  parseInt(nonceHex.slice(0, 8), 16), parseInt(nonceHex.slice(-8), 16),
];
console.log('\nPRNG keystreams:');
for (const seed of seeds) {
  for (const [name, gen] of [['xorshift32', xorshift32], ['mulberry32', mulberry32]]) {
    for (const off of [0, 3, 4]) {
      const s = gen(seed, 1000);
      const m = matches(s, off);
      if (m.rate > 0.02) console.log(`  ${name} seed=${seed} off=${off}: ${(m.rate * 100).toFixed(1)}%`);
    }
  }
}
console.log('  (only >2% shown; nothing printed means all near-random)');

// ---- structural checks on ks ---------------------------------------------
const hist = new Array(8).fill(0);
for (const b of ks) hist[b >> 5]++;
console.log('\nks distribution (8 buckets of 32):', hist.join(' '));
// is ks a function of the plaintext char only?
const map = new Map();
let inc = 0, tot = 0;
for (let i = 0; i < ks.length; i++) {
  const c = T[i + 3];
  if (map.has(c)) { tot++; if (map.get(c) !== ks[i]) inc++; } else map.set(c, ks[i]);
}
console.log(`ks as f(plaintext char): inconsistencies ${inc}/${tot}`);
fs.writeFileSync(path.join(__dirname, '..', 'work', 'ks.bin'), ks);
