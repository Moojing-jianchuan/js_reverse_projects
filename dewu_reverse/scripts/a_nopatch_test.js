/**
 * A-6：对照组实验 —— 不装 pceptor_loader 的 Object.defineProperty 宽容补丁，
 *      直接跑 pceptor，再调用 Fun110 五参，看 MD5 是否还自旋。
 * 用法: node scripts/a_nopatch_test.js [ms]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('../src/env');
const ROOT = path.resolve(__dirname, '..');
const TIMEOUT = Number(process.argv[2] || 5000);

const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';

const resolveScript = (url) => {
  const u = String(url);
  if (/preinforce/i.test(u)) return fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8');
  if (/pyuntu/i.test(u)) return fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pyuntu.000.eval.js'), 'utf8');
  return null;
};

(async () => {
  // 对照组：把 "key===undefined" 的 defineProperty 行为改成浏览器语义（键名变 'undefined'），
  // 而不是 pceptor_loader 那样直接跳过 —— 看 MD5 是否还自旋。
  const MODE = process.argv[3] || 'browser';
  const orig = Object.defineProperty;
  Object.defineProperty = function (t, k, d) {
    if (k === undefined) {
      if (MODE === 'skip') return t;
      k = 'undefined';
    }
    return orig(t, k, d);
  };
  const env = makeEnv({ resolveScript, storage: { sk: SK, dwsm: SM } });
  const w = env.sandbox;
  let loadErr = null;
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8'), env.ctx, { filename: 'pceptor.js', timeout: 30000 });
  } catch (e) { loadErr = String(e.message).slice(0, 200); }
  console.log('load err:', loadErr);
  await new Promise(r => setTimeout(r, 600));
  console.log('fun?', !!(w.fun && w.fun.Fun110), '| globals:', Object.keys(w).filter(k => /^(fun|base64js|dw|_yundunxhr)$/.test(k)).join(','));
  if (!w.fun) { process.exit(0); }
  w.__PLAIN = PLAIN;
  w.__MAP = { SK: SK, ShumeiId: SM };
  const t0 = Date.now();
  try {
    vm.runInContext(`window.__out = fun.Fun110(window.__PLAIN,'post','',false,window.__MAP)`, env.ctx, { timeout: TIMEOUT });
    console.log('RETURNED in', Date.now() - t0, 'ms');
    const o = w.__out;
    console.log('c:', o.c, '| keys:', Object.keys(o));
    console.log('d.head:', String(o.d).slice(0, 160));
  } catch (e) {
    console.log('THROW in', Date.now() - t0, 'ms:', String(e.message).slice(0, 100));
  }
  process.exit(0);
})();
