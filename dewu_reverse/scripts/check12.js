/**
 * 楠岃瘉 12锛欶un110 鍙傛暟閫愪釜鍔狅紝鎵惧嚭鍝釜鍙傛暟瑙﹀彂姝诲惊鐜? */
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
const origDP = Object.defineProperty;
Object.defineProperty = (t, k, d) => (k === undefined || k === 'undefined') ? t : origDP(t, k, d);
vm.runInContext(src, ctx, { filename: 'preinforce2', timeout: 20000 });
Object.defineProperty = origDP;

const SK = 'YOUR_SK_HERE';
sandbox.__P = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
sandbox.__SK = SK;

const variants = [
  ['fun.Fun110(__P,"post")', 1500],
  ['fun.Fun110(__P,"post","")', 1500],
  ['fun.Fun110(__P,"post","",false)', 1500],
  ['fun.Fun110(__P,"post","",true)', 1500],
  ['fun.Fun110(__P,"post","",false,{})', 1500],
  ['fun.Fun110(__P,"post","",true,{SK:__SK})', 1500],
  ['fun.Fun110(__P,"post","",true,{SK:__SK,Sk:__SK,sk:__SK,ShumeiId:"x",shumeiId:"x",shumeiid:"x"})', 1500],
  ['fun.Fun110("a","get","",true,{})', 1500],
  ['fun.Fun99(__P,"","")', 1500],
];
for (const [expr, ms] of variants) {
  const t0 = Date.now();
  try {
    const r = vm.runInContext('String(' + expr + ')', ctx, { timeout: ms });
    console.log('OK  ', (Date.now() - t0) + 'ms', expr, '->', String(r).slice(0, 160));
  } catch (e) {
    console.log('FAIL', (Date.now() - t0) + 'ms', expr, '->', String(e && e.message).slice(0, 60));
  }
}
setTimeout(() => process.exit(0), 100);

