/**
 * 诊断：加载 pceptor，定位构造包装 XHR 失败的原因（Cannot redefine property: undefined）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('../src/env');

const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
const code = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');

const env = makeEnv({});
const { sandbox, ctx } = env;
const baseline = new Set(Object.keys(sandbox));
const g = vm.runInContext('globalThis', ctx);

// trace defineProperty（沙箱与宿主同 realm，共享 Object）
const origDP = Object.defineProperty;
const evs = [];
Object.defineProperty = function (target, key, desc) {
  if (evs.length < 60) {
    let tn = 'other';
    try {
      if (target === g || target === sandbox) tn = 'GLOBAL';
      else if (target === Object.prototype) tn = 'Object.prototype';
      else if (target && target.__id) tn = 'NativeXHR#' + target.__id;
      else if (target && target.constructor) tn = target.constructor.name || 'anon';
      else tn = typeof target;
    } catch (e) { tn = 'err'; }
    evs.push([String(key), tn, typeof desc === 'object' && desc ? Object.keys(desc).join('+') : typeof desc]);
  }
  return origDP(target, key, desc);
};

try {
  vm.runInContext(code, ctx, { filename: 'pceptor.000.eval.js', timeout: 20000 });
  console.log('[OK] executed');
} catch (e) {
  console.log('[THROW]', String(e && e.message).slice(0, 160));
}
Object.defineProperty = origDP;

console.log('\n[defineProperty events]');
for (const e of evs) console.log('   ', JSON.stringify(e));
console.log('\n[new globals]', Object.keys(sandbox).filter(k => !baseline.has(k)).join(', '));
console.log('[storage]', [...env.store.entries()].map(([k, v]) => k + '=' + String(v).slice(0, 60)));
console.log('[cookie writes]', env.jar.writes);
console.log('[console]'); for (const [l, t] of env.consoleLog) console.log('   ', l, t.slice(0, 200));
console.log('[req log]', env.recorder.log.slice(0, 10));
console.log('\n[try new XMLHttpRequest]');
try {
  const x = new sandbox.XMLHttpRequest();
  console.log(' ok, props:', Object.getOwnPropertyNames(x).slice(0, 40).join(','));
} catch (e) {
  console.log(' threw:', String(e && e.message));
}
