// magic_hunt.js — search every decoded pool entry (every key) in BOTH bundles for a
// string containing 0x25 0x13 0x27, and for compact 3-byte control-char strings.
const fs = require('fs');

function alphabetOf(tableHex, xorKey) {
  const A = tableHex.match(/.{1,2}/g).map(h => parseInt(h, 16));
  return A.map(v => String.fromCharCode(xorKey ^ v)).join('');
}
function dec(ALPHA) {
  return function (text, key) {
    const out = []; let e = 0, u = 0;
    for (const ch of text) {
      const r = ALPHA.indexOf(ch);
      if (r < 0) continue;
      e = u % 4 ? 64 * e + r : r; u++;
      if ((u % 4) !== 1) out.push(((e >> ((-2 * u) & 6)) & 0xff) ^ key);
    }
    return Buffer.from(out);
  };
}

const jobs = [];

// --- pe.081: single pool, key 139
{
  const src = fs.readFileSync('../bundles/pe.081.a2ede546e341a1b9.js', 'utf8');
  const i = src.indexOf('function rv(t,n){var e=[');
  const seg = src.slice(i, i + 400000);
  const hex = seg.match(/var a="([0-9a-f]+)"/)[1];
  const arrEnd = seg.indexOf('];');
  const arrText = seg.slice(seg.indexOf('['), arrEnd + 1);
  jobs.push({ name: 'pe081', pool: JSON.parse(arrText), ALPHA: alphabetOf(hex, 139) });
}
// --- feilin076: 44 pools
{
  const src = fs.readFileSync('../bundles/feilin076.dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1.js', 'utf8');
  const re = /indexOf\((\d+)\^(\w+)\.charCodeAt\(0\)\)/g;
  let m, n = 0;
  while ((m = re.exec(src))) {
    const key = parseInt(m[1], 10);
    const back = src.slice(Math.max(0, m.index - 1200), m.index);
    const tm = [...back.matchAll(/="([0-9a-f]{64,})"/g)].pop();
    if (!tm) continue;
    const back2 = src.slice(Math.max(0, m.index - 6000), m.index);
    const arrM = [...back2.matchAll(/=\[((?:"(?:[^"\\]|\\.)*"\s*,\s*){5,}"(?:[^"\\]|\\.)*")\]/g)].pop();
    if (!arrM) continue;
    jobs.push({ name: 'feilin076@' + m.index, pool: JSON.parse('[' + arrM[1] + ']'), ALPHA: alphabetOf(tm[1], key) });
    n++;
  }
  console.log('feilin076 pools loaded:', n);
}

const MAGIC = Buffer.from([0x25, 0x13, 0x27]);
let hits = 0, ctrl = [];
for (const job of jobs) {
  const f = dec(job.ALPHA);
  for (let i = 0; i < job.pool.length; i++) {
    for (let k = 0; k < 256; k++) {
      const b = f(job.pool[i], k);
      if (b.includes(MAGIC)) { console.log('MAGIC HIT', job.name, 'idx', i + 1, 'key', k, b.toString('hex')); hits++; }
      // compact strings made only of control chars (possible raw byte payloads)
      if (b.length >= 2 && b.length <= 8 && [...b].every(x => x < 0x20)) ctrl.push({ job: job.name, idx: i + 1, key: k, hex: b.toString('hex') });
    }
  }
}
console.log('magic hits:', hits);
console.log('control-char-only entries:', ctrl.length);
for (const c of ctrl.slice(0, 20)) console.log('  ', c.job, 'idx', c.idx, 'key', c.key, c.hex);
