/**
 * 鐢?--cpu-prof 鎶?Fun110 鍗℃鏃剁殑鐑偣锛屽畾浣嶆寰幆浣嶇疆
 * 鐢ㄦ硶: node --cpu-prof --cpu-prof-dir=artifacts/prof scripts/prof_fun110.js
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
const origDP = Object.defineProperty;
Object.defineProperty = (t, k, d) => (k === undefined || k === 'undefined') ? t : origDP(t, k, d);
vm.runInContext(src, ctx, { filename: 'preinforce2', timeout: 20000 });
Object.defineProperty = origDP;

sandbox.__P = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443 });
sandbox.__K = {};
try {
  vm.runInContext('fun.Fun110(__P,"post","",true,__K)', ctx, { timeout: 20000 });
  console.log('[done]');
} catch (e) {
  console.log('[timeout]', String(e && e.message).slice(0, 80));
}
setTimeout(() => process.exit(0), 100);

