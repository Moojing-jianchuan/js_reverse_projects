/**
 * 验证 14：Fun110 5 参数死循环是不是"忙等时钟"（new Date()/getTime 高频探针）
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

const counts = {};
const bump = k => { counts[k] = (counts[k] || 0) + 1; };
const RealDate = Date;
const realNow = () => RealDate.now();
function FakeDate(...a) {
  bump(a.length ? 'new Date(arg)' : 'new Date()');
  if (!(this instanceof FakeDate)) return new RealDate(realNow()).toString();
  return a.length ? new RealDate(...a) : new RealDate(realNow());
}
FakeDate.now = () => { bump('Date.now'); return realNow(); };
FakeDate.prototype = RealDate.prototype;
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
const origGetTime = RealDate.prototype.getTime;
RealDate.prototype.getTime = function () { bump('getTime'); return origGetTime.call(this); };
sandbox.Date = FakeDate;
sandbox.performance = Object.assign({}, sandbox.performance, { now: () => { bump('performance.now'); return realNow() - 1000; } });

const origDP = Object.defineProperty;
Object.defineProperty = (t, k, d) => (k === undefined || k === 'undefined') ? t : origDP(t, k, d);
vm.runInContext(src, ctx, { filename: 'preinforce2', timeout: 20000 });
Object.defineProperty = origDP;

const SK = 'YOUR_SK_HERE';
sandbox.__P = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443 });
sandbox.__K = { SK, Sk: SK, sk: SK, ShumeiId: 'YOUR_SHUMEIID_HERE' };
for (const k of Object.keys(counts)) delete counts[k];
try {
  const r = vm.runInContext('String(fun.Fun110(__P,"post","",true,__K).d).slice(0,80)', ctx, { timeout: 2000 });
  console.log('[OK]', r);
} catch (e) { console.log('[timeout]', String(e && e.message).slice(0, 100)); }
console.log('[counts]', JSON.stringify(counts));
RealDate.prototype.getTime = origGetTime;
setTimeout(() => process.exit(0), 50);
