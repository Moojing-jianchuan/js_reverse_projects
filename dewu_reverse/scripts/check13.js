/**
 * 验证 13：看 fun.Fun110 四参数返回的到底是什么（是否已加密）
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { makeEnv } = require('../src/env');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8');

const env = makeEnv({});
const { sandbox, ctx } = env;
const origDP = Object.defineProperty;
Object.defineProperty = (t, k, d) => (k === undefined || k === 'undefined') ? t : origDP(t, k, d);
vm.runInContext(src, ctx, { filename: 'preinforce2', timeout: 20000 });
Object.defineProperty = origDP;

const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
sandbox.__P = plain;
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
console.log('[md5(plain)]', md5(plain));

for (const expr of [
  'JSON.stringify(fun.Fun110(__P,"post"))',
  'JSON.stringify(fun.Fun110(__P,"post","",true))',
  'JSON.stringify(fun.Fun110(__P,"get","",true))',
  'JSON.stringify(fun.Fun99(__P,"", ""))',
]) {
  try {
    const r = vm.runInContext(expr, ctx, { timeout: 3000 });
    console.log('\n' + expr + ' ->');
    console.log('  ', String(r).slice(0, 900));
    try {
      const j = JSON.parse(r);
      console.log('   keys=', Object.keys(j), '| d===plain?', j.d === plain, '| typeof d', typeof j.d);
    } catch (e) { }
  } catch (e) { console.log(expr, 'ERR', String(e && e.message).slice(0, 80)); }
}
setTimeout(() => process.exit(0), 100);
