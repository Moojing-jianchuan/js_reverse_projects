/**
 * 验证 3：把 SDK 初始化后产生的所有底层请求 + 业务请求都打出来
 */
'use strict';
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const api = pceptor.load();
  const seen = [];
  api.env.recorder.onSend = n => seen.push({ id: n.__id, method: n.__method, url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body, native: n });
  await sleep(50);
  console.log('=== init 阶段请求 ===', seen.length);
  for (const s of seen) console.log('  #' + s.id, s.method, s.url, '| body=', String(s.body).slice(0, 100));

  const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
  const url = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
  const n0 = seen.length;

  const xhr = api.newWrapperXHR();
  console.log('\n=== 业务请求：包装 XHR 的 own props ===');
  console.log(' own:', Object.getOwnPropertyNames(xhr).join(','));
  xhr.open('POST', url, true);
  console.log(' after open: readyState=', xhr.readyState, 'url=', xhr.__url);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(plain);
  console.log(' after send: readyState=', xhr.readyState);

  for (let i = 0; i < 60 && seen.length === n0; i++) await sleep(10);
  console.log('\n=== 业务请求是否到达底层 native ===', seen.length - n0);
  for (const s of seen.slice(n0)) {
    console.log('  #' + s.id, s.method, s.url);
    console.log('  body:', String(s.body).slice(0, 300));
    for (const [k, v] of s.headers) console.log('     ', k + ':', String(v).slice(0, 160));
  }
  console.log('\n[recorder events]');
  for (const ev of api.env.recorder.events) console.log('  ', ev.kind, '#' + ev.id, ev.args.map(a => String(a).slice(0, 120)).join(' | '));
  console.log('\n[console]', api.env.consoleLog);
})();
