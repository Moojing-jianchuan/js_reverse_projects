/**
 * 验证 10：Fun110 卡住的原因。用 vm 超时包住调用，逐参数递减试探。
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

const SK = 'YOUR_SK_HERE';
const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });

sandbox.__P = plain;
sandbox.__SK = SK;

function call(expr, ms = 3000) {
  const t0 = Date.now();
  try {
    const r = vm.runInContext(expr, ctx, { timeout: ms });
    console.log('  OK', Date.now() - t0, 'ms ->', JSON.stringify(r).slice(0, 300));
    return r;
  } catch (e) {
    console.log('  ERR', Date.now() - t0, 'ms:', String(e && e.message).slice(0, 160));
    return null;
  }
}

console.log('[ Fun99 / Fun110 少参数 ]');
call('typeof fun.Fun99');
call('JSON.stringify(fun.Fun99("a","b"))');
call('String(fun.Fun110(__P, "post"))');
call('String(fun.Fun110(__P))');
console.log('[ 5 参数 ]');
call('String(fun.Fun110(__P,"post","",true,{}))', 4000);
call('String(fun.Fun110(__P,"post","",true,{SK:__SK}))', 4000);
setTimeout(() => process.exit(0), 200);
