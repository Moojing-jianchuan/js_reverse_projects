// try_cipher.mjs — try TEA / XTEA in ECB mode on the locally produced `collect`
// blob with key material taken from the eks blob (and other candidates).
// Rationale: collect has 8-byte block granularity, ECB (identical blocks at
// identical offsets) and the TDC bootstrap passes TEA delta constants
// 0x9e3779b9 / 0x13c6ef3720 and FNV-1a 0x811c9dc5.
//   node tools/try_cipher.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';

const collect = fs.readFileSync('src/collect_local_1.bin');
const eksB64 = JSON.parse(fs.readFileSync('src/tdc_probe_report.json', 'utf8')).info?.info
  || fs.readFileSync('src/sess_sample.txt', 'utf8');
const eks = Buffer.from(String(eksB64), 'base64');

const DELTA = 0x9e3779b9;

function u32be(b, i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; }
function u32le(b, i) { return ((b[i + 3] << 24) | (b[i + 2] << 16) | (b[i + 1] << 8) | b[i]) >>> 0; }
function w32be(v, out, o) { out[o] = (v >>> 24) & 255; out[o + 1] = (v >>> 16) & 255; out[o + 2] = (v >>> 8) & 255; out[o + 3] = v & 255; }
function w32le(v, out, o) { out[o + 3] = (v >>> 24) & 255; out[o + 2] = (v >>> 16) & 255; out[o + 1] = (v >>> 8) & 255; out[o] = v & 255; }

function teaDecryptBlock(v0, v1, k) {
  let sum = (DELTA * 32) >>> 0;
  for (let i = 0; i < 32; i++) {
    v1 = (v1 - (((v0 << 4) + k[2]) ^ (v0 + sum) ^ ((v0 >>> 5) + k[3]))) >>> 0;
    v0 = (v0 - (((v1 << 4) + k[0]) ^ (v1 + sum) ^ ((v1 >>> 5) + k[1]))) >>> 0;
    sum = (sum - DELTA) >>> 0;
  }
  return [v0 >>> 0, v1 >>> 0];
}
function xteaDecryptBlock(v0, v1, k) {
  let sum = (DELTA * 32) >>> 0;
  for (let i = 0; i < 32; i++) {
    v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k[(sum >>> 11) & 3]))) >>> 0;
    sum = (sum - DELTA) >>> 0;
    v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k[sum & 3]))) >>> 0;
  }
  return [v0 >>> 0, v1 >>> 0];
}

function printable(buf, n = 64) {
  return buf.slice(0, n).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
}
function score(buf) {
  let p = 0;
  for (const b of buf) if ((b >= 0x20 && b < 0x7f) || b === 0x0a || b === 0x09) p++;
  return p / buf.length;
}

const candidates = [];
function addKey(name, buf) {
  if (buf.length >= 16) candidates.push([name, buf.slice(0, 16)]);
}
addKey('eks[0:16]', eks);
addKey('eks[16:32]', eks.slice(16));
addKey('eks[32:48]', eks.slice(32));
addKey('eks[-16:]', eks.slice(-16));
addKey('eks.rev', Buffer.from(eks).reverse());
addKey('eks[0:16].rev', Buffer.from(eks.slice(0, 16)).reverse());
addKey('md5(eks)', crypto.createHash('md5').update(eks).digest());
addKey('md5(eksB64str)', crypto.createHash('md5').update(String(eksB64)).digest());
addKey('sha256(eks)[0:16]', crypto.createHash('sha256').update(eks).digest());
addKey('sha1(eksB64)[0:16]', crypto.createHash('sha1').update(String(eksB64)).digest());
addKey('ascii(eksB64)[0:16]', Buffer.from(String(eksB64).slice(0, 16), 'latin1'));

function tryDecrypt(label, buf, kBytes, decryptBlock, endian) {
  const k = [];
  for (let i = 0; i < 4; i++) k.push(endian === 'be' ? u32be(kBytes, i * 4) : u32le(kBytes, i * 4));
  const out = Buffer.alloc(buf.length);
  for (let o = 0; o + 8 <= buf.length; o += 8) {
    let v0 = endian === 'be' ? u32be(buf, o) : u32le(buf, o);
    let v1 = endian === 'be' ? u32be(buf, o + 4) : u32le(buf, o + 4);
    const [a, b] = decryptBlock(v0, v1, k);
    if (endian === 'be') { w32be(a, out, o); w32be(b, out, o + 4); } else { w32le(a, out, o); w32le(b, out, o + 4); }
  }
  const s = score(out);
  if (s > 0.6) console.log(`\n*** ${label} score=${s.toFixed(2)} : ${printable(out, 96)}`);
  return { s, out };
}

let best = { s: 0 };
for (const [kname, kb] of candidates) {
  for (const [cname, fn] of [['tea', teaDecryptBlock], ['xtea', xteaDecryptBlock]]) {
    for (const endian of ['be', 'le']) {
      const r = tryDecrypt(`${cname}/${kname}/${endian}`, collect, kb, fn, endian);
      if (r.s > best.s) best = { s: r.s, name: `${cname}/${kname}/${endian}`, out: r.out };
    }
  }
}
console.log(`\nbest printable score=${best.s?.toFixed(3)} via ${best.name || 'none'}`);
if (best.out) console.log('head: ' + printable(best.out, 128));

// also: is the raw blob maybe just XOR'd with a short key? look for repeats
console.log('\nfirst 64 raw bytes: ' + collect.slice(0, 64).toString('hex'));
console.log('last 32 raw bytes: ' + collect.slice(-32).toString('hex'));
