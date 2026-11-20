/**
 * 验证 7：让 SDK 的 <script src=davstatic/preinforce2.js> 注入生效（用本地文件顶替），
 * 看 window.fun 是否出现、body 是否变成 {"data":"hex+b64"}。
 */
'use strict';
process.on('unhandledRejection', (r) => { console.log('[unhandledRejection]', String((r && r.message) || r)); });
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });

(async () => {
  const api = pceptor.load({});
  await sleep(200);
  console.log('[scripts injected]', JSON.stringify(api.env.scripts));
  console.log('[typeof window.fun]', typeof api.sandbox.fun, api.sandbox.fun && Object.keys(api.sandbox.fun));
  console.log('[load error]', api.sdk.loadError && String(api.sdk.loadError.message));
  console.log('[console]', api.env.consoleLog.slice(0, 10));
  const dw = api.sandbox.dw;
  console.log('[dw.Fun110]', typeof (dw && dw.Fun110));

  const SK = 'YOUR_SK_HERE';
  if (dw) { try { dw.getSk = () => SK; dw.getLtk = () => 'LTK_TEST'; } catch (e) { } }

  const seen = [];
  api.env.recorder.onSend = n => seen.push({ url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body });
  const xhr = api.newWrapperXHR();
  xhr.open('POST', URL_INFO, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(plain);
  for (let i = 0; i < 80 && !seen.filter(s => s.url === URL_INFO).length; i++) await sleep(10);
  const rec = seen.filter(s => s.url === URL_INFO).pop();
  if (!rec) { console.log('[未到 native]', seen.map(s => s.url)); return; }
  const h = {}; for (const [k, v] of rec.headers) h[k.toLowerCase()] = v;
  console.log('\n[headers]', JSON.stringify(h, null, 1).slice(0, 1400));
  console.log('[body]', String(rec.body).slice(0, 200));

  if (api.sandbox.fun && api.sandbox.fun.Fun110) {
    try {
      const r = api.sandbox.fun.Fun110(plain, 'post', '', true, { SK, Sk: SK, sk: SK, ShumeiId: 'x', shumeiId: 'x', shumeiid: 'x' });
      console.log('\n[fun.Fun110 direct]', JSON.stringify(r).slice(0, 400));
    } catch (e) { console.log('[fun.Fun110 throw]', String(e.message)); }
  }
  console.log('[console tail]', api.env.consoleLog.slice(-6));
})();
