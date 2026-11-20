/**
 * 验证 11：Fun110 5 参数卡死 —— 看它在等什么/在转什么（统计热点原语调用）
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

// 统计原语
const counts = {};
const bump = k => { counts[k] = (counts[k] || 0) + 1; };
const realNow = Date.now.bind(Date);
const RealDate = Date;
function FakeDate(...a) {
  if (!(this instanceof FakeDate)) return new RealDate(realNow()).toString();
  return a.length ? new RealDate(...a) : new RealDate(realNow());
}
FakeDate.now = () => { bump('Date.now'); return realNow(); };
FakeDate.prototype = RealDate.prototype;
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
sandbox.Date = FakeDate;
sandbox.Math = Object.create(Math);
sandbox.Math.random = () => { bump('Math.random'); return Math.random(); };
sandbox.performance = Object.assign({}, sandbox.performance, { now: () => { bump('performance.now'); return realNow() - 1000; } });
const baseCreate = sandbox.document.createElement;
sandbox.document.createElement = (...a) => { bump('createElement:' + a[0]); return baseCreate(...a); };
const baseQSA = sandbox.document.querySelectorAll;
sandbox.document.querySelectorAll = (...a) => { bump('querySelectorAll'); return baseQSA(...a); };
const baseGCS = sandbox.getComputedStyle;
sandbox.getComputedStyle = (...a) => { bump('getComputedStyle'); return baseGCS ? baseGCS(...a) : { getPropertyValue: () => '' }; };

const origDP = Object.defineProperty;
Object.defineProperty = (t, k, d) => (k === undefined || k === 'undefined') ? t : origDP(t, k, d);
vm.runInContext(src, ctx, { filename: 'preinforce2', timeout: 20000 });
Object.defineProperty = origDP;

const SK = 'YOUR_SK_HERE';
sandbox.__P = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443 });
sandbox.__K = { SK, Sk: SK, sk: SK, ShumeiId: 'x', shumeiId: 'x', shumeiid: 'x' };
for (const k of Object.keys(counts)) delete counts[k];
try {
  const r = vm.runInContext('String(fun.Fun110(__P,"post","",true,__K))', ctx, { timeout: 2000 });
  console.log('[OK]', String(r).slice(0, 200));
} catch (e) {
  console.log('[timeout/err]', String(e && e.message).slice(0, 120));
}
console.log('[hot primitives]', JSON.stringify(counts, null, 1));
console.log('[console]', env.consoleLog.slice(0, 10));
setTimeout(() => process.exit(0), 100);
