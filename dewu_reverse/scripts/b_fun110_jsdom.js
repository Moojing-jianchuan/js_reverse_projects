/**
 * B-1：在 jsdom（src/env_patch.js）里调 Fun110 五参（带 keyMap），看能否产出 {data} 信封
 * 依据：jsdom 是独立 realm，若 Node vm 的 CryptoJS 自旋是 realm 问题，这里应当能跑通。
 * 用法: node scripts/b_fun110_jsdom.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const { md5 } = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const PLAIN = JSON.stringify({ sign: 'f2b6b4c666227d52fdadf251f307445d', pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
const TARGET_HEX = 'df74e6521fc1ea3752eddb701c5453b8';

const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: SM } });
const w = env.window;

for (const f of ['pceptor.js', 'preinforce2.js']) {
  try { env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js', f), 'utf8'), f); console.log('[load]', f, 'OK'); }
  catch (e) { console.log('[load]', f, 'THROW:', String(e.message).slice(0, 160)); }
}
const fun = w.fun;
console.log('fun:', typeof fun, '| proto:', fun && Object.getOwnPropertyNames(Object.getPrototypeOf(fun)));
if (!fun) { env.dispose(); process.exit(0); }

const F110 = fun.Fun110 || Object.getPrototypeOf(fun).Fun110;
const keyMap = { SK: SK, Sk: SK, sk: SK, ShumeiId: SM, shumeiId: SM, shumeiid: SM };
const combos = [
  ['plain,post,"",false,keyMap', [PLAIN, 'post', '', false, keyMap]],
  ['plain,post,"",true ,keyMap', [PLAIN, 'post', '', true, keyMap]],
];
for (const [label, args] of combos) {
  const t0 = Date.now();
  let out = null, err = null;
  try { out = F110.apply(fun, args); } catch (e) { err = String(e && e.message).slice(0, 160); }
  const dt = Date.now() - t0;
  console.log(`\n[${label}] ${dt}ms`, err ? 'THROW:' + err : '');
  if (!out) { console.log('  (no return)'); continue; }
  console.log('  keys:', Object.keys(out), '| c:', out.c, '| a.len', out.a && out.a.length, '| e.len', out.e && out.e.length);
  const d = out.d;
  if (typeof d === 'string') {
    console.log('  d.len:', d.length, '| head:', d.slice(0, 100));
    try {
      const j = JSON.parse(d);
      if (j && typeof j.data === 'string') {
        console.log('  *** ENVELOPE data.len:', j.data.length);
        console.log('      hex32:', j.data.slice(0, 32), '| == md5(plain):', j.data.slice(0, 32) === md5(PLAIN));
        console.log('      b64:', j.data.slice(32, 100));
        fs.writeFileSync(path.join(ROOT, 'artifacts/b_envelope_' + (label.includes('true') ? 'q' : 'nq') + '.json'),
          JSON.stringify({ plain: PLAIN, data: j.data, c: out.c, a: out.a, b: out.b, e: out.e }, null, 1));
      }
    } catch (e) { }
  }
}
env.dispose();
process.exit(0);
