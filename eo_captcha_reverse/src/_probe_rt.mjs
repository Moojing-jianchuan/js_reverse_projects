// src/_probe_rt.mjs — 纯运行期提取：REGS 采样 4 元数组 + int 流大整数 → 位置排列 → 明文前缀 oracle
// 用法: node src/_probe_rt.mjs <tdc.js> [--max-salt 2] [--salt-cap 60]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const fileUrl = p => new URL('file://' + path.join(ROOT, p).replace(/\\/g, '/')).href;
const { patchDispatcher, xteaDecryptBlock } = await import(fileUrl('tools/tdc_key2.mjs'));
const { buildEnv } = await import(fileUrl('scripts/env.mjs'));

const argv = process.argv.slice(2);
const tdcFile = path.resolve(argv[0]);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? Number(argv[i + 1]) : d; };
const MAXSALT = opt('max-salt', 2), SALTCAP = opt('salt-cap', 60), ROUNDS = opt('rounds', 32);

const original = fs.readFileSync(tdcFile, 'utf8');
const patched = patchDispatcher(original);
const w = buildEnv();
const arrays = new Map(), ints = new Map();
let steps = 0, streamIdx = -1;
w.__TH = (ip, regs) => {
  steps++;
  if (streamIdx < 0) for (let i = 0; i < regs.length; i++) if (Array.isArray(regs[i]) && regs[i].length > 200) { streamIdx = i; break; }
  if (steps % 4) return 0;
  try {
    for (let i = 0; i < regs.length; i++) {
      const v = regs[i];
      if (!Array.isArray(v)) continue;
      if (v.length === 4 && [0, 1, 2, 3].every(j => Number.isInteger(v[j]) && Math.abs(v[j]) < 2 ** 32)) {
        const sig = Array.prototype.map.call(v, x => x >>> 0).join(',');
        const e = arrays.get(sig); if (e) e.count++; else arrays.set(sig, { words: Array.from(v, x => x | 0), ip, count: 1 });
      }
      if (v.length > 200) for (let j = 0; j < v.length; j++) { const n = v[j]; if (Number.isInteger(n) && n >= 100000 && n <= 10000000) ints.set(n, (ints.get(n) || 0) + 1); }
    }
  } catch { }
  return 0;
};
const ctx = vm.createContext(w);
vm.runInContext(patched ? patched.src : original, ctx, { filename: path.basename(tdcFile), timeout: 180000 });
await new Promise(r => setTimeout(r, 700));
const collect = w.TDC.getData(true);
const buf = Buffer.from(decodeURIComponent(collect), 'base64');

const PREFIX = Buffer.from('{"cd":[');
const b0 = buf.readUInt32LE(0), b1 = buf.readUInt32LE(4);
function tryBlock(ek, rounds, swap) {
  const [x, y] = swap ? xteaDecryptBlock(b1, b0, ek, rounds) : xteaDecryptBlock(b0, b1, ek, rounds);
  const h = Buffer.alloc(8);
  if (swap) { h.writeUInt32LE(y, 0); h.writeUInt32LE(x, 4); } else { h.writeUInt32LE(x, 0); h.writeUInt32LE(y, 4); }
  return h;
}
const keys = [...arrays.values()].filter(a => a.words.some(v => v !== 0)).sort((a, b) => b.count - a.count);
const saltPool = [...ints.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, SALTCAP);
console.log(`[rt] ${path.basename(tdcFile)} steps=${steps} streamIdx=${streamIdx} collect=${buf.length}B keys=${keys.length} ints=${ints.size} saltPool=${saltPool.length}`);
for (const k of keys.slice(0, 6)) console.log('   key', JSON.stringify(k.words), 'x' + k.count, 'ip=' + k.ip);

// 位置组合：每位 ∈ {0, ±salt}，非零位 ≤ MAXSALT
const vals = [0]; for (const s of saltPool) { vals.push(s); vals.push(-s); }
const combos = [];
(function rec(i, cur, nz) { if (i === 4) { combos.push(cur.slice()); return; } for (const v of vals) { const n = nz + (v !== 0 ? 1 : 0); if (n > MAXSALT) continue; cur.push(v); rec(i + 1, cur, n); cur.pop(); } })(0, [], 0);
console.log(`[rt] combos(${combos.length}) = 位置0-3 × 至多 ${MAXSALT} 非零 × ${saltPool.length} 盐 ±`);

const t0 = Date.now();
let tried = 0, hit = null;
outer:
for (const k of keys) {
  for (const swap of [false, true]) {
    for (const cd of combos) {
      const ek = k.words.map((v, i) => (v + cd[i]) | 0);
      tried++;
      const h = tryBlock(ek, ROUNDS, swap);
      if (h.subarray(0, 7).equals(PREFIX)) { hit = { k, cd, ek, swap }; break outer; }
    }
  }
}
console.log(`[rt] tried=${tried} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!hit) { console.log('[rt] NO HIT'); process.exit(1); }
console.log('[rt] HIT swap=' + hit.swap, 'key', JSON.stringify(hit.k.words), 'S', JSON.stringify(hit.cd), 'EK', JSON.stringify(hit.ek));
const out = Buffer.alloc(buf.length);
for (let o = 0; o + 8 <= buf.length; o += 8) {
  const a = buf.readUInt32LE(o), b = buf.readUInt32LE(o + 4);
  const [x, y] = hit.swap ? xteaDecryptBlock(b, a, hit.ek, ROUNDS) : xteaDecryptBlock(a, b, hit.ek, ROUNDS);
  if (hit.swap) { out.writeUInt32LE(y, o); out.writeUInt32LE(x, o + 4); } else { out.writeUInt32LE(x, o); out.writeUInt32LE(y, o + 4); }
}
const txt = out.toString('utf8').replace(/\u0000+$/, '');
try { const j = JSON.parse(txt); console.log('[rt] JSON OK keys', Object.keys(j), 'cd', Array.isArray(j.cd) ? j.cd.length : '-', 'bytes', Buffer.byteLength(txt)); }
catch (e) { console.log('[rt] JSON FAIL', e.message, JSON.stringify(txt.slice(0, 80))); }
