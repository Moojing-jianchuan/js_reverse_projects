/**
 * 验证 23：触发 dw.init()，抓 /webSk 请求（fetch 通道）
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const api = pceptor.load({});
  await sleep(150);
  const dw = api.sandbox.dw;
  console.log('[dw proto]', Object.getOwnPropertyNames(Object.getPrototypeOf(dw)).join(','));
  console.log('[fetch calls before]', api.env.recorder.fetchCalls.length);

  for (const cfg of [{}, { bcv: '1.1.8.260514' }, null]) {
    try {
      const r = dw.init(cfg === null ? undefined : cfg);
      if (r && typeof r.then === 'function') await r.catch(e => console.log('  init promise rej:', String(e && e.message)));
      console.log('[init]', JSON.stringify(cfg), 'ok');
    } catch (e) {
      console.log('[init]', JSON.stringify(cfg), 'threw:', String(e && e.message).slice(0, 160));
    }
    await sleep(150);
  }
  console.log('\n[fetch calls]', api.env.recorder.fetchCalls.length);
  for (const c of api.env.recorder.fetchCalls) {
    console.log('  ->', c.method, c.url);
    console.log('     headers:', JSON.stringify(c.headers));
    console.log('     body:', String(c.body).slice(0, 600));
  }
  console.log('\n[storage]', JSON.stringify(api.state().storage));
  console.log('[cookie]', api.state().cookie);
  console.log('[console]', api.env.consoleLog.slice(0, 12));
})();
