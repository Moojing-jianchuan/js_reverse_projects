/**
 * 验证 17：hsn / adi 的输入依赖（改 URL、改 body 各看一次），并打印 adi 生成处附近代码
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const api = pceptor.load({});
  await sleep(50);
  const origSend = api.env.recorder.onSend;
  const before = [];
  api.env.recorder.onSend = n => { before.push({ url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body }); };

  const cases = [
    { url: 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info', body: JSON.stringify({ a: 1 }) },
    { url: 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info', body: JSON.stringify({ a: 2 }) },
    { url: 'https://app.dewu.com/api/v1/h5/OTHER/path', body: JSON.stringify({ a: 1 }) },
    { url: 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info', body: '' },
  ];
  for (const c of cases) {
    const n0 = before.length;
    const xhr = api.newWrapperXHR();
    xhr.open('POST', c.url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(c.body);
    for (let i = 0; i < 40 && before.length === n0; i++) await sleep(5);
    const rec = before.slice(n0).pop();
    const h = {};
    if (rec) for (const [k, v] of rec.headers) h[k.toLowerCase()] = v;
    console.log('\n[url]', c.url);
    console.log('[body]', c.body);
    if (!rec) { console.log('  <no native send>'); continue; }
    console.log('  hsn=', h.hsn, '| adi=', String(h.adi).slice(0, 40), '| skt=', h.skt, '| ltk=', String(h.ltk).slice(0, 20));
  }
  console.log('\n[adi/shsn 是否随请求变] 见上');
})();
