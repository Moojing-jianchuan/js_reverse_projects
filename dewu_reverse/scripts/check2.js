/**
 * 验证 2：SDK 的发送是异步的（promise 链 / 事件滴），先 pump 事件循环再取结果。
 */
'use strict';
const pceptor = require('../src/pceptor_loader');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const api = pceptor.load();
  console.log('[load] error=', api.sdk.loadError && String(api.sdk.loadError.message).slice(0, 120));
  console.log('[globals]=', api.sdk.globals.join(', '));

  const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
  const url = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';

  const xhr = api.newWrapperXHR();
  const seen = [];
  api.env.recorder.onSend = n => seen.push({ method: n.__method, url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body });

  const t0 = Date.now();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(plain);

  for (let i = 0; i < 40 && !seen.length; i++) { await sleep(5); }
  console.log('[wait ms]', Date.now() - t0, '| seen', seen.length);

  if (seen.length) {
    const s = seen[0];
    console.log('[method]', s.method);
    console.log('[url]', s.url);
    console.log('[body]', String(s.body).slice(0, 300));
    console.log('[headers]');
    for (const [k, v] of s.headers) console.log('   ', k + ':', String(v).slice(0, 160));
  } else {
    console.log('[no native send]');
    console.log('[recorder events]', JSON.stringify(api.env.recorder.events.slice(-20)).slice(0, 1500));
    console.log('[console]', api.env.consoleLog.slice(-10));
  }
  console.log('[storage]', JSON.stringify(api.state().storage));
  console.log('[cookie]', api.state().cookie);
})();
