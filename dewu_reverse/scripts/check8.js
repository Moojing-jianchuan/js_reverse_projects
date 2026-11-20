/**
 * 单独跑 preinforce2（加密/签名模块），看它定义了什么、为什么 window.fun 是空对象。
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('../src/env');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8');

const env = makeEnv({});
const { sandbox, ctx } = env;
const before = new Set(Object.keys(sandbox));

const origDP = Object.defineProperty;
Object.defineProperty = function (t, k, d) {
  if (k === undefined || k === 'undefined') return t;
  return origDP(t, k, d);
};
let err = null;
try {
  vm.runInContext(src, ctx, { filename: 'preinforce2', timeout: 20000 });
  console.log('[OK] executed');
} catch (e) {
  err = e;
  console.log('[THROW]', String(e && e.message).slice(0, 300));
  console.log(String(e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}
Object.defineProperty = origDP;

const added = Object.keys(sandbox).filter(k => !before.has(k));
console.log('[new globals]', added.join(', '));
for (const k of added) {
  const v = sandbox[k];
  console.log('  ', k, '::', typeof v, v && typeof v === 'object' ? 'props=' + Object.getOwnPropertyNames(v).join('/') : '');
}
console.log('[fun]', typeof sandbox.fun, sandbox.fun && Object.getOwnPropertyNames(sandbox.fun));
console.log('[fun proto]', sandbox.fun && Object.getOwnPropertyNames(Object.getPrototypeOf(sandbox.fun)));
console.log('[console]', env.consoleLog.slice(0, 20));
setTimeout(() => process.exit(0), 100);
