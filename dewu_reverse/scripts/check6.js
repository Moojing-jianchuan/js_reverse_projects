/**
 * 验证 6：摸清 window.dw 的形状，并在加载后替换 getSk/getLtk，看 body 是否加密。
 */
'use strict';
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });

(async () => {
  const api = pceptor.load({});
  await sleep(20);
  const dw = api.sandbox.dw;
  console.log('[dw typeof]', typeof dw);
  console.log('[dw own props]', Object.getOwnPropertyNames(dw).join(','));
  const proto = Object.getPrototypeOf(dw);
  console.log('[dw proto props]', proto ? Object.getOwnPropertyNames(proto).join(',') : null);
  console.log('[typeof dw.Fun110]', typeof dw.Fun110);
  console.log('[typeof dw.getSk/getLtk/getSM/init/bindUser]', typeof dw.getSk, typeof dw.getLtk, typeof dw.getSM, typeof dw.init, typeof dw.bindUser);

  // 直接调 Fun110 看它做什么
  if (typeof dw.Fun110 === 'function') {
    for (const args of [
      [plain, 'post'],
      [plain, 'POST'],
      ['hello', 'get'],
    ]) {
      try {
        const r = dw.Fun110(args[0], args[1]);
        console.log('[Fun110]', JSON.stringify(args).slice(0, 40), '->', JSON.stringify(r).slice(0, 300));
      } catch (e) { console.log('[Fun110 throw]', String(e.message)); }
    }
  }

  // 替换 getSk 再发一次
  const SK = 'YOUR_SK_HERE';
  try { dw.getSk = () => SK; } catch (e) { console.log('[override getSk fail]', String(e.message)); }
  try { dw.getLtk = () => 'LTK_TEST_VALUE'; } catch (e) { }
  console.log('[after override] dw.getSk()=', String(dw.getSk()).slice(0, 60));

  const seen = [];
  api.env.recorder.onSend = n => seen.push({ url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body });
  const xhr = api.newWrapperXHR();
  xhr.open('POST', URL_INFO, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(plain);
  for (let i = 0; i < 50 && !seen.filter(s => s.url === URL_INFO).length; i++) await sleep(10);
  const rec = seen.filter(s => s.url === URL_INFO).pop();
  if (!rec) { console.log('[业务请求未到 native]', seen.map(s => s.url)); return; }
  const h = {}; for (const [k, v] of rec.headers) h[k.toLowerCase()] = v;
  console.log('\n[headers]', JSON.stringify(h, null, 1).slice(0, 1200));
  console.log('[body]', String(rec.body).slice(0, 300));
  console.log('[console]', api.env.consoleLog.slice(0, 20));
})();
