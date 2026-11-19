// src/_probe_cap11_vm.mjs — 只读探针：验证 capture11 的 dispatcher patch + REGS 取样是否可用
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const tdcFile = path.resolve(process.argv[2]);
const { patchDispatcher } = await import(new URL('file://' + path.join(ROOT, 'tools', 'tdc_key2.mjs').replace(/\\/g, '/')).href);
const { buildEnv } = await import(new URL('file://' + path.join(ROOT, 'scripts', 'env.mjs').replace(/\\/g, '/')).href);

const original = fs.readFileSync(tdcFile, 'utf8');
const patched = patchDispatcher(original);
console.log('patched =', !!patched, patched ? { CODE: patched.CODE, REGS: patched.REGS } : null);

const w = buildEnv();
const arrays = new Map();
const bigInts = new Map();
const streamInfo = [];
let steps = 0;
let sawStream = false;
w.__TH = (ip, regs) => {
  steps++;
  if (!sawStream) {
    for (let i = 0; i < regs.length; i++) {
      const v = regs[i];
      if (Array.isArray(v) && v.length > 200) {
        streamInfo.push({ idx: i, len: v.length, head: v.slice(0, 8).join(',') });
        sawStream = true;
      }
    }
  }
  if (steps % 8) return 0;
  try {
    for (let i = 0; i < regs.length; i++) {
      const v = regs[i];
      if (!Array.isArray(v)) continue;
      if (v.length === 4 && [0, 1, 2, 3].every(j => Number.isInteger(v[j]) && Math.abs(v[j]) < 2 ** 32)) {
        const sig = Array.prototype.map.call(v, x => x >>> 0).join(',');
        const e = arrays.get(sig);
        if (e) e.count++; else arrays.set(sig, { words: Array.from(v, x => x | 0), ip, count: 1 });
      }
      // 大整数（盐候选）：从 int 流里刮
      if (v.length > 200) {
        for (let j = 0; j < v.length; j++) {
          const n = v[j];
          if (typeof n === 'number' && Number.isInteger(n) && n >= 100000 && n <= 10000000) bigInts.set(n, (bigInts.get(n) || 0) + 1);
        }
      }
    }
  } catch { }
  return 0;
};

const ctx = vm.createContext(w);
try {
  vm.runInContext(patched ? patched.src : original, ctx, { filename: path.basename(tdcFile), timeout: 120000 });
} catch (e) {
  console.log('VM ERROR:', e.message);
}
await new Promise(r => setTimeout(r, 700));
let collect = null;
try { collect = w.TDC.getData(true); } catch (e) { console.log('getData ERROR:', e.message); }
const buf = collect ? Buffer.from(decodeURIComponent(collect), 'base64') : Buffer.alloc(0);
console.log('steps =', steps, 'streams =', JSON.stringify(streamInfo));
console.log('collect chars =', collect ? collect.length : -1, 'bytes =', buf.length, 'blocks =', buf.length / 8);
if (buf.length) console.log('ct head', buf.subarray(0, 16).toString('hex'));
console.log('4-arrays =', arrays.size);
for (const a of [...arrays.values()].sort((x, y) => y.count - x.count).slice(0, 20)) console.log('  ', JSON.stringify(a.words), 'x' + a.count, 'ip=' + a.ip);
const bi = [...bigInts.entries()].sort((a, b) => b[1] - a[1]);
console.log('bigInts(1e5..1e7) =', bi.length);
console.log('  top:', bi.slice(0, 30).map(([v, c]) => v + '(' + c + ')').join(' '));
fs.writeFileSync(path.join(ROOT, 'src', '_probe_cap11_vm.json'), JSON.stringify({
  collect: collect || null, steps, arrays: [...arrays.values()], bigInts: bi, streamInfo,
}, null, 1));
