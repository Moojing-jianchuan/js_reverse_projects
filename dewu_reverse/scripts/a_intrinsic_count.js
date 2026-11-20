/**
 * A-3：用 vm 内真intrinsics 计数，定位 Fun110 五参分支的自旋位置
 * 关键：env.js 的 sandbox.String/RegExp 是宿主(Node)的，vm 里的字面量用的是 context 内建，
 *       必须用 vm.runInContext 取出内建原型来打点，否则计数恒为 0（A-1 的教训）。
 * 用法: node scripts/a_intrinsic_count.js [ms]
 */
'use strict';
const vm = require('vm');
const { load } = require('../src/pceptor_loader');

const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';
const MS = Number(process.argv[2] || 1500);

(async () => {
  const api = load({ sk: SK, shumeiid: SM });
  const w = api.sandbox;
  const ctx = api.sdk.ctx;
  await new Promise(r => setTimeout(r, 400));

  const inst = vm.runInContext(`({
    StringProto: String.prototype,
    StringCtor: String,
    RegExpProto: RegExp.prototype,
    ArrayProto: Array.prototype,
  })`, ctx);

  const cnt = { cca: 0, fcc: 0, rexec: 0, push: 0, slice: 0, split: 0, join: 0, map: 0, md5: 0 };
  const wrap = (obj, key, name) => {
    const o = obj[key];
    obj[key] = function () { cnt[name]++; return o.apply(this, arguments); };
  };
  wrap(inst.StringProto, 'charCodeAt', 'cca');
  wrap(inst.StringCtor, 'fromCharCode', 'fcc');
  wrap(inst.RegExpProto, 'exec', 'rexec');
  wrap(inst.ArrayProto, 'push', 'push');
  wrap(inst.StringProto, 'slice', 'slice');
  wrap(inst.StringProto, 'split', 'split');
  wrap(inst.ArrayProto, 'join', 'join');
  wrap(inst.ArrayProto, 'map', 'map');

  // 采样：分段计数（用 setTimeout 无法在同步循环内触发，只能事后看总量）
  w.__PLAIN = PLAIN;
  w.__MAP = { SK: SK, ShumeiId: SM };
  const t0 = Date.now();
  let err = null;
  try {
    vm.runInContext(`window.__out = fun.Fun110(window.__PLAIN,'post','',false,window.__MAP)`, ctx, { timeout: MS });
  } catch (e) { err = String(e.message).slice(0, 80); }
  console.log(`ran ${Date.now() - t0}ms err=${err}`);
  console.log('counters:', JSON.stringify(cnt));
  process.stdout.write('');
  process.exit(0);
})();
