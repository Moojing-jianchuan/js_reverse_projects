// analyze_collect.mjs — inspect a real `collect` / `eks` / `sess` triple from a
// captured verify POST. Reports encoding, entropy, block-repeat structure.
//   node tools/analyze_collect.mjs [file=with postData json]
import fs from 'node:fs';

const file = process.argv[2] || 'samples/capture2/128_verify.meta.json';
const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
const params = new URLSearchParams(meta.postData);

function entropy(buf) {
  const f = new Array(256).fill(0);
  for (const b of buf) f[b]++;
  let h = 0;
  for (const c of f) if (c) { const p = c / buf.length; h -= p * Math.log2(p); }
  return h;
}
function b64(s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

for (const k of ['collect', 'eks', 'sess', 'ans']) {
  const v = params.get(k);
  if (v == null) continue;
  const isUrlSafe = /[-_]/.test(v) && !/\+|\//.test(v);
  const looksB64 = /^[A-Za-z0-9+/_\-=\*]+$/.test(v);
  const buf = looksB64 ? b64(v) : Buffer.from(v, 'utf8');
  console.log(`\n=== ${k} ===`);
  console.log(`len=${v.length}  charset=${looksB64 ? (isUrlSafe ? 'base64url' : 'base64') : 'other'}`);
  console.log(`decoded=${buf.length}B entropy=${entropy(buf).toFixed(3)} bits/byte`);
  console.log(`head hex=${buf.slice(0, 24).toString('hex')}`);
  console.log(`head asc=${JSON.stringify(buf.slice(0, 24).toString('latin1'))}`);
  console.log(`tail hex=${buf.slice(-16).toString('hex')}`);
  // 8-byte block repeat analysis (TEA family block size)
  if (k === 'collect' && buf.length > 64) {
    const blocks = new Map();
    for (let i = 0; i + 8 <= buf.length; i += 8) {
      const key = buf.slice(i, i + 8).toString('hex');
      blocks.set(key, (blocks.get(key) || 0) + 1);
    }
    const rep = [...blocks.entries()].filter(([, n]) => n > 1);
    console.log(`8B blocks=${blocks.size} repeated=${rep.length}`);
    console.log('top repeats: ' + rep.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h, n]) => `${h}x${n}`).join(' '));
    // printable-ratio after simple XOR guesses
    const printable = (b) => { let c = 0; for (const x of b) if (x >= 0x20 && x < 0x7f) c++; return (c / b.length).toFixed(3); };
    console.log(`printable ratio raw=${printable(buf)}`);
  }
  if (k === 'eks') {
    fs.writeFileSync('src/eks_sample.bin', buf);
    console.log(`eks raw hex(first 64)=${buf.slice(0, 64).toString('hex')}`);
  }
  if (k === 'collect') fs.writeFileSync('src/collect_sample.bin', buf);
  if (k === 'sess') fs.writeFileSync('src/sess_sample.txt', v);
}

// compare eks with the blob baked into tdc.js (window[TDC_NAME])
const tdc = fs.readFileSync('scripts/tdc.decomp.js', 'utf8');
const m = tdc.match(/window\.MEZKDNVimSjOSBkjVVBFQXaYMTGhAmeJ='([^']*)'/);
if (m) {
  const baked = m[1];
  const eks = params.get('eks') || '';
  console.log('\n=== eks vs window[TDC_NAME] baked in tdc.js ===');
  console.log(`baked len=${baked.length} eks len=${eks.length} identical=${baked === eks}`);
  console.log(`baked head=${baked.slice(0, 48)}`);
  console.log(`eks   head=${eks.slice(0, 48)}`);
}
