/**
 * 验证 22：响应侧解密 —— 把线上抓到的加密响应灌进 native XHR，看业务侧读到什么
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const fs = require('fs');
const path = require('path');
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ROOT = path.resolve(__dirname, '..');
(async () => {
  const api = pceptor.load({});
  await sleep(60);
  const seen = [];
  api.env.recorder.onSend = n => seen.push({ url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body, native: n });

  const raw = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'));
  const text = raw.toString('utf8');
  console.log('[resp bytes]', raw.length, '| head:', JSON.stringify(text.slice(0, 60)));

  const xhr = api.newWrapperXHR();
  xhr.open('POST', 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  const big = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
  xhr.send(big);
  for (let i = 0; i < 60 && !seen.length; i++) await sleep(5);
  const rec = seen.pop();
  if (!rec) { console.log('no native send'); return; }
  const native = rec.native;

  const evs = [];
  const fire = (st) => {
    native.readyState = st;
    const ev = { type: 'readystatechange', target: native, currentTarget: native };
    try { native.onreadystatechange && native.onreadystatechange(ev); } catch (e) { evs.push('readystatechange ' + st + ' threw: ' + e.message); }
    try { native.dispatchEvent(ev); } catch (e) { }
  };
  native.status = 200; native.statusText = 'OK'; native.responseURL = rec.url;
  native.responseText = text; native.response = text;
  fire(2); fire(3); fire(4);
  const evL = { type: 'load', target: native, currentTarget: native };
  try { native.onload && native.onload(evL); } catch (e) { evs.push('onload threw: ' + e.message); }

  console.log('[events]', evs);
  let bt = null;
  try { bt = xhr.responseText; } catch (e) { console.log('[read responseText threw]', e.message); }
  console.log('[business responseText typeof]', typeof bt, '| len', bt && bt.length);
  console.log('[business responseText head]', JSON.stringify(String(bt).slice(0, 200)));
  console.log('[changed vs ciphertext?]', bt !== text);
  console.log('[typeof xhr.response]', typeof xhr.response);
  console.log('[console]', api.env.consoleLog.slice(0, 10));
})();
