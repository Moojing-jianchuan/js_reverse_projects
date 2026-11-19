// src/_probe_cap11_try.mjs — 只读试算：直接用 REGS 候选 + 明文前缀 oracle 撞 EK
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const { decryptBuffer, xteaDecryptBlock } = await import(new URL('file://' + path.join(ROOT, 'tools', 'tdc_key2.mjs').replace(/\\/g, '/')).href);

const probe = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', '_probe_cap11_vm.json'), 'utf8'));
const buf = Buffer.from(decodeURIComponent(probe.collect), 'base64');
const PREFIX = Buffer.from('{"cd":[');
console.log('ct', buf.length, 'prefix', PREFIX.toString());

const keys = probe.arrays.filter(a => a.words.some(w => w !== 0));
const salts = probe.bigInts.map(x => x[0]).filter(v => v !== 0);
console.log('keys', keys.length, 'salts', salts.length);

function block0(ek, rounds, swap) {
  const a = buf.readUInt32LE(0), b = buf.readUInt32LE(4);
  const [x, y] = swap ? xteaDecryptBlock(b, a, ek, rounds) : xteaDecryptBlock(a, b, ek, rounds);
  const h = Buffer.alloc(8);
  if (swap) { h.writeUInt32LE(y, 0); h.writeUInt32LE(x, 4); } else { h.writeUInt32LE(x, 0); h.writeUInt32LE(y, 4); }
  return h;
}
const hit = h => h.subarray(0, 7).equals(PREFIX);
const print = h => h.toString('latin1').replace(/[^\x20-\x7e]/g, '·');

let tested = 0;
// level 0: key as-is / negated / swapped order / byteswapped
for (const k of keys) {
  const variants = [
    ['asis', k.words],
    ['rev', k.words.slice().reverse()],
    ['bswap', k.words.map(w => ((w & 0xff) << 24 | (w & 0xff00) << 8 | (w >>> 8 & 0xff00) | w >>> 24) | 0)],
  ];
  for (const [vn, w] of variants) {
    for (const rounds of [32]) for (const swap of [false, true]) {
      tested++;
      const h = block0(w, rounds, swap);
      if (hit(h)) console.log('*** HIT', vn, JSON.stringify(w), rounds, swap, print(h));
    }
  }
}
console.log('level0 tested', tested);

// level 1: key + salt (1..2 非零位)
let t1 = 0, best = null;
const pool = salts;
outer:
for (const k of keys) {
  for (const rounds of [32]) for (const swap of [false, true]) {
    for (let i = 0; i < 4; i++) {
      for (const s of pool) for (const sg of [1, -1]) {
        const ek = k.words.slice(); ek[i] = (ek[i] + sg * s) | 0;
        t1++;
        const h = block0(ek, rounds, swap);
        if (hit(h)) { console.log('*** HIT1', JSON.stringify(k.words), 'pos', i, 'salt', sg * s, 'ek', JSON.stringify(ek)); break outer; }
      }
    }
  }
}
console.log('level1 tested', t1);
