/**
 * 验证 4：注入真实 sk cookie/localStorage，看 body 是否变成 {"data":"hex+b64"}，
 * 并与线上抓包样本逐字节对拍。
 */
'use strict';
const pceptor = require('../src/pceptor_loader');
const crypto = require('crypto');
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SK = 'YOUR_SK_HERE';
const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';

const EXPECT = {
  hex: 'c536d0639fb2f24e2526ed558c463cf4',
  b64: 'w6pQfDwFVsKmEsKMwqDDpQ3Dn8OWOsO+wpxPHcO4wpLDtsO/w5/CrcKONMKEK0HDnMOES1R3w5LCtTlbJQfDj8Ktw7PDvcO6Hyt6NsKIL8Ohw5LDqQZ/ClJPwprDicKhwpBFSMOOw4HDsMKsw6PCjsK9aAR0wow9JsOeLMKwwo8RNlQwHsOMaB7CkcKNe8OKU1HCqsOswpjCs8KHw6RFLGbDkMOiWB53USTDtHPCgcKKwr3Cs2fDhMKNPMOn',
};

(async () => {
  const api = pceptor.load({
    cookies: { sk: SK, dwsm: 'YOUR_SHUMEIID_HERE' },
    storage: { sk: SK },
  });
  console.log('[load error]', api.sdk.loadError && String(api.sdk.loadError.message).slice(0, 200));
  console.log('[cookie after load]', api.state().cookie);
  await sleep(30);

  const xhr = api.newWrapperXHR();
  const seen = [];
  api.env.recorder.onSend = n => seen.push({ method: n.__method, url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body, native: n });
  xhr.open('POST', URL_INFO, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(plain);
  for (let i = 0; i < 50 && !seen.filter(s => s.url === URL_INFO).length; i++) await sleep(10);

  const rec = seen.filter(s => s.url === URL_INFO).pop();
  console.log('\n[md5(plain)]', md5(plain));
  console.log('[expect hex]', EXPECT.hex);
  if (!rec) { console.log('!! 业务请求没有到 native'); console.log(seen.map(s => s.url)); return; }
  console.log('[got body]', String(rec.body).slice(0, 400));
  for (const [k, v] of rec.headers) console.log('    hdr', k + ':', String(v).slice(0, 200));

  let data = null;
  try { data = JSON.parse(rec.body).data; } catch (e) { }
  if (data) {
    console.log('\n[got hex]', data.slice(0, 32), data.slice(0, 32) === EXPECT.hex ? 'MATCH' : 'diff');
    console.log('[got b64 head]', data.slice(32, 80));
    console.log('[exp b64 head]', EXPECT.b64.slice(0, 48));
    console.log('[b64 exact match]', data.slice(32) === EXPECT.b64);
  }
  console.log('\n[storage]', JSON.stringify(api.state().storage));
  console.log('[console]', api.env.consoleLog.slice(0, 10));
})();
