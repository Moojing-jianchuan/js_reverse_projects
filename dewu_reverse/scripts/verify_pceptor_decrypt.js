/**
 * verify_pceptor_decrypt.js —— src/pceptor_decrypt.js 的离线回归
 * 不联网、只用 artifacts 里的存档样本。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const D = require('../src/pceptor_decrypt.js');

const raw = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✔ ' + name + (extra ? ' — ' + extra : '')); }
  else { fail++; console.log('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
};

(async () => {
  console.log('=== 1) 基础解密 ===');
  const t0 = Date.now();
  const json = await D.decryptInfoResponse(raw);
  const ms = Date.now() - t0;
  ok('code=200', json.code === 200, 'code=' + json.code + ' msg=' + json.msg);
  ok('data.list 是数组且有 40 条', Array.isArray(json.data.list) && json.data.list.length === 40,
    'total=' + json.data.total + ' page=' + json.data.page + ' pageSize=' + json.data.pageSize);
  ok('list[0] 有 spuId/title', !!(json.data.list[0].spuId && json.data.list[0].title),
    'spuId=' + json.data.list[0].spuId);
  ok('单次解密 < 5s', ms < 5000, ms + 'ms');

  console.log('\n=== 2) 单例复用（第二次应更快且结果一致）===');
  const t1 = Date.now();
  const json2 = await D.decryptInfoResponse(raw);
  const ms2 = Date.now() - t1;
  ok('第二次结果与第一次一致', JSON.stringify(json2) === JSON.stringify(json),
    '第一次 ' + ms + 'ms / 第二次 ' + ms2 + 'ms');

  console.log('\n=== 3) sks 语义 ===');
  ok("isEncryptedFlag('1') === true", D.isEncryptedFlag('1') === true);
  ok("isEncryptedFlag('1,hdw4') === true", D.isEncryptedFlag('1,hdw4') === true);
  ok("isEncryptedFlag('0') === false", D.isEncryptedFlag('0') === false);
  ok("isEncryptedFlag(undefined) === null", D.isEncryptedFlag(undefined) === null);
  const passRaw = await D.decryptInfoResponseText(raw, { sks: '0' });
  ok("sks='0' 时原样返回（不解密）", passRaw === raw.trim(), 'len=' + passRaw.length);
  const plainJson = JSON.stringify({ code: 200, data: { list: [1] } });
  ok('已是明文 JSON 时原样返回', (await D.decryptInfoResponseText(plainJson)) === plainJson);

  console.log('\n=== 4) 失败路径要报错而不是静默 ===');
  let threw = false, msg = '';
  try {
    await D.decryptInfoResponseText(fs.readFileSync(path.join(ROOT, 'artifacts/websk_resp.txt'), 'utf8'));
  } catch (e) { threw = true; msg = e.message; }
  ok('异物响应（websk 的 hex 信封）抛错', threw, msg.slice(0, 110));

  let threw2 = false, msg2 = '';
  try {
    await D.decryptInfoResponse('D472D6DADFEF03D931FF09FA886CB6559B8C942EE7B36E98');
  } catch (e) { threw2 = true; msg2 = e.message; }
  ok('短异物：解出垃圾时 decryptInfoResponse 用 JSON.parse 拦住', threw2, msg2.slice(0, 110));

  console.log('\n=== 5) decryptResponse（带响应头）===');
  const j3 = await D.decryptResponse(raw, { sks: '1', 'sks-length': '14740' });
  ok('响应头路径也能解', j3 && j3.code === 200);
  const j4 = await D.decryptResponse(raw, {});
  ok('无 sks 头但体像密文 → 兜底解', j4 && j4.code === 200);

  D.disposeEngine();
  console.log('\n结果: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
