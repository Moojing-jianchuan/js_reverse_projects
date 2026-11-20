/**
 * 验证假设：info 的 {data} 信封由 fun.Fun110 生成
 * 加载 preinforce2（提供 fun）+ pceptor（拦截器/上下文），调用 Fun110 看输出结构
 * 用法: node scripts/probe_fun110.js
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const { md5, signD } = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';

// id 87 的明文与信封（对照目标）
const PLAIN = JSON.stringify({
  sign: 'f2b6b4c666227d52fdadf251f307445d',
  pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true
});
const TARGET_HEX = 'df74e6521fc1ea3752eddb701c5453b8';
const TARGET_B64_HEAD = 'w6bDlcK3F37Dv1AyGcK5';

const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: DWSM } });
const w = env.window;

for (const f of ['pceptor.js', 'preinforce2.js']) {
  try {
    env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js', f), 'utf8'), f);
    console.log(`[load] ${f} OK`);
  } catch (e) {
    console.log(`[load] ${f} THROW:`, String(e.message).slice(0, 150));
  }
}

const fun = w.fun;
console.log('\nfun:', typeof fun, '| proto:', fun && Object.getOwnPropertyNames(Object.getPrototypeOf(fun)));
if (!fun) { env.dispose(); process.exit(0); }

const proto = Object.getPrototypeOf(fun);
const F110 = fun.Fun110 || (proto && proto.Fun110);
console.log('Fun110:', typeof F110, 'arity', F110 && F110.length);
if (typeof F110 !== 'function') { env.dispose(); process.exit(0); }

const bcv = '1.3.1.20260331';
const calls = [
  ['(plain, bcv, sk, sm)', [PLAIN, bcv, SK, DWSM]],
  ['(plain, bcv, sk)', [PLAIN, bcv, SK]],
  ['(plain)', [PLAIN]],
  ['(plain, bcv, sk, sm, {})', [PLAIN, bcv, SK, DWSM, {}]],
];
for (const [label, args] of calls) {
  try {
    const r = F110.apply(fun, args);
    let shape;
    if (r && typeof r === 'object') {
      shape = {};
      for (const k of Object.keys(r)) {
        const v = r[k];
        shape[k] = typeof v === 'string' ? { len: v.length, head: v.slice(0, 40), isHex32: /^[0-9a-f]{32}$/.test(v), isB64: /^[A-Za-z0-9+/=]+$/.test(v.slice(0, 40)) } : typeof v;
      }
      // 关键对照
      const flat = JSON.stringify(r);
      shape.__containsTargetHex = flat.includes(TARGET_HEX);
      shape.__containsTargetB64Head = flat.includes(TARGET_B64_B64_HEAD_SAFE());
    } else {
      shape = { type: typeof r, value: String(r).slice(0, 80) };
    }
    console.log(`\nFun110${label} →`, JSON.stringify(shape, null, 1));
  } catch (e) {
    console.log(`\nFun110${label} THROW:`, String(e.message).slice(0, 200));
  }
}

function TARGET_B64_B64_HEAD_SAFE() { return 'w6bDlcK3F37Dv1AyGcK5'; }
console.log('\n目标 hex:', TARGET_HEX, '| md5(明文):', md5(PLAIN), '| 一致:', md5(PLAIN) === TARGET_HEX);
env.dispose();
