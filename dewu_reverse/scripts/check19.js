/**
 * 验证 19：hsn 的输入依赖矩阵（body 长度 / body 内容 / 额外 header / cookie）
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const api = pceptor.load({});
  await sleep(60);
  const seen = [];
  api.env.recorder.onSend = n => seen.push({ url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body });
  const URL1 = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';

  async function probe(label, { url = URL1, body = '', headers = null } = {}) {
    const n0 = seen.length;
    const xhr = api.newWrapperXHR();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (headers) for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.send(body);
    for (let i = 0; i < 40 && seen.length === n0; i++) await sleep(5);
    const rec = seen.slice(n0).pop();
    const h = {};
    if (rec) for (const [k, v] of rec.headers) h[k.toLowerCase()] = v;
    console.log(`  ${label.padEnd(28)} len=${String(body).length}  hsn=${h.hsn || '(none)'}  adi=${String(h.adi).slice(0, 18)}`);
    return h.hsn;
  }

  console.log('[hsn 依赖]');
  await probe('body=""', { body: '' });
  await probe('body={"a":1} (7)', { body: '{"a":1}' });
  await probe('body={"b":1} (7)', { body: '{"b":1}' });
  await probe('body={"a":12} (8)', { body: '{"a":12}' });
  await probe('body={"a":"xx"} (10)', { body: '{"a":"xx"}' });
  await probe('URL+?x=1', { url: URL1 + '?x=1', body: '{"a":1}' });
  await probe('URL+?x=2', { url: URL1 + '?x=2', body: '{"a":1}' });
  await probe('extra header X-T:1', { body: '{"a":1}', headers: { 'X-T': '1' } });
  await probe('extra header X-T:2', { body: '{"a":1}', headers: { 'X-T': '2' } });
})();
