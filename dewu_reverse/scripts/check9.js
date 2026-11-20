/**
 * 验证 9：直接调用 preinforce2 的 window.fun.Fun110(payload, method, '', true, keyMap)
 * 与线上抓包样本逐字节对拍。
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

const fun = sandbox.fun;
console.log('[fun]', Object.getOwnPropertyNames(Object.getPrototypeOf(fun)).join(','), '| Fun110.length=', fun.Fun110.length, '| Fun99.length=', fun.Fun99 && fun.Fun99.length);

const SK = 'YOUR_SK_HERE';
const SHUMEI = 'YOUR_SHUMEIID_HERE';

const cases = [
  {
    name: 'click-283 (info)',
    plain: JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }),
    hex: 'c536d0639fb2f24e2526ed558c463cf4',
    b64: 'w6pQfDwFVsKmEsKMwqDDpQ3Dn8OWOsO+wpxPHcO4wpLDtsO/w5/CrcKONMKEK0HDnMOES1R3w5LCtTlbJQfDj8Ktw7PDvcO6Hyt6NsKIL8Ohw5LDqQZ/ClJPwprDicKhwpBFSMOOw4HDsMKsw6PCjsK9aAR0wow9JsOeLMKwwo8RNlQwHsOMaB7CkcKNe8OKU1HCqsOswpjCs8KHw6RFLGbDkMOiWB53USTDtHPCgcKKwr3Cs2fDhMKNPMOn',
  },
];

const keyMap = { SK, Sk: SK, sk: SK, ShumeiId: SHUMEI, shumeiId: SHUMEI, shumeiid: SHUMEI };

for (const c of cases) {
  console.log('\n###', c.name);
  console.log('  plain md5 =', crypto.createHash('md5').update(c.plain).digest('hex'), '| expect hex', c.hex);
  for (const method of ['post', 'get', 'POST']) {
    for (const withKeys of [keyMap, {}]) {
      let r;
      try {
        r = fun.Fun110(c.plain, method, '', true, withKeys);
      } catch (e) {
        console.log('  Fun110 threw:', String(e && e.message));
        continue;
      }
      const keys = Object.keys(withKeys).length ? 'withKeys' : 'noKeys';
      console.log('  [' + method + '/' + keys + '] a=', String(r && r.a).slice(0, 40), '| c=', String(r && r.c).slice(0, 40), '| d=', String(r && r.d).slice(0, 80));
      if (r && typeof r.d === 'string') {
        try {
          const j = JSON.parse(r.d);
          if (j && typeof j.data === 'string') {
            console.log('     hex  =', j.data.slice(0, 32), j.data.slice(0, 32) === c.hex ? 'MATCH' : 'diff');
            console.log('     b64 match =', j.data.slice(32) === c.b64);
            if (j.data.slice(32) !== c.b64) {
              console.log('     got b64 head:', j.data.slice(32, 90));
              console.log('     exp b64 head:', c.b64.slice(0, 58));
            }
          }
        } catch (e) { }
      }
    }
  }
}
setTimeout(() => process.exit(0), 200);
