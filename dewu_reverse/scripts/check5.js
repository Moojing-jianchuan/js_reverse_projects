/**
 * 验证 5：sk 取值来源与 ZWSP 切分
 *  dw.getSk() = (157275||174861||cookie('sk')||localStorage('sk')||88125||'').split('\u200b')[K] || ''
 *  用三种 cookie 形态看 header sk 输出，确定 K。
 */
'use strict';
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });

async function run(name, cookies, storage) {
  const api = pceptor.load({ cookies, storage });
  await sleep(20);
  const dw = api.sandbox.dw;
  console.log('\n### ' + name);
  console.log('  dw keys:', dw && Object.keys(dw).join(','));
  if (dw && typeof dw.getSk === 'function') {
    console.log('  dw.getSk() =', JSON.stringify(dw.getSk()));
    console.log('  dw.getSM() =', JSON.stringify(typeof dw.getSM === 'function' ? dw.getSM() : null));
    console.log('  dw.getLtk() =', JSON.stringify(typeof dw.getLtk === 'function' ? String(dw.getLtk()).slice(0, 120) : null));
  }
  const seen = [];
  api.env.recorder.onSend = n => seen.push({ url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body });
  const xhr = api.newWrapperXHR();
  xhr.open('POST', URL_INFO, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(plain);
  for (let i = 0; i < 40 && !seen.filter(s => s.url === URL_INFO).length; i++) await sleep(10);
  const rec = seen.filter(s => s.url === URL_INFO).pop();
  if (!rec) { console.log('  业务请求未到 native'); return; }
  const h = {};
  for (const [k, v] of rec.headers) h[k.toLowerCase()] = v;
  console.log('  sk  =', JSON.stringify(h.sk));
  console.log('  sks =', JSON.stringify(h.sks));
  console.log('  adi =', JSON.stringify(h.adi), '| len', String(h.adi).length);
  console.log('  ltk =', JSON.stringify(h.ltk));
  console.log('  hsn =', JSON.stringify(h.hsn));
  console.log('  body=', String(rec.body).slice(0, 120));
}

(async () => {
  await run('A: sk=PLAIN (no ZWSP)', { sk: 'PLAINSKVALUE123' }, { sk: 'PLAINSKVALUE123' });
  await run('B: sk=A\\u200bB', { sk: 'AAA\u200bBBB' }, {});
  await run('C: sk=A\\u200bB\\u200bC', { sk: 'AAA\u200bBBB\u200bCCC' }, {});
  await run('D: 真实 header sk 值 + 前缀 ZWSP', { sk: 'X\u200bYOUR_SK_HERE' }, {});
})();
