/**
 * 纯协议过码 · 第 1 步 v4：全量真实头 + 正确的 shumeiid（header 与 cookie 是两套值）
 * 关键修正：
 *   1) header 的 shumeiid ≠ cookie 的 dwsm（实测不同，明文里的 shumeiId 要用 header 那个）
 *   2) hsn 不是固定值（本次为 944821c9…，此前的 22a9ecc6… 是另一会话）
 *   3) 补齐 adi / ltk / sessionid / skt
 * 用法: node scripts/cap_call_solo4.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('../src/env_patch');
const { createCapProbe } = require('../src/dewu_cap_probe');

const ROOT = path.resolve(__dirname, '..');
const URL_CALL = 'https://app.dewu.com/api/v1/h5/risk-stone-captcha/captcha/call';
const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

// ── 本次新会话（2026-11-20 15:02 签发）的真实值，全部来自抓包 ──
const SK = argOf('--sk') || 'YOUR_SK_HERE';
const DWSM = argOf('--dwsm') || 'YOUR_SHUMEIID_HERE'; // cookie 里的
const SHUMEI = argOf('--shumei') || 'YOUR_SHUMEIID_HERE'; // header 里的
const ADI = argOf('--adi') || '0l3fG8GRVw2jhh7HWZ-JHAwr18HcOSGHJOw55Jw78iaMOWwqwkwqPCtMOewr7DvcOXw7vCmcO1w4fDmigA';
const LTK = argOf('--ltk') || 'GcKMwqfCo8OZKcKRw67ClsKYI8Kkwp/DksOUB8OmwpbCkMKnNjnCnn7DnMOnL8K8LA3Cv3TDminDg8ODw54fcsKeQWzCrcOxwqTChcO1wozDlcK7';
const SESSIONID = argOf('--sessionid') || 'yTtluHT1-zEsM-3xqr-4ZoT-i5B0HNfmzmi9cfxQ';
const HSN = argOf('--hsn') || '944821c9440f7599987dd159e0b6fe16';
const BCV = '1.3.1.20260331';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const SALT = '048a9c4943398714b356a696503d2d36';

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const randHex = n => crypto.randomBytes(n).toString('hex');
const randDje = () => { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < 32; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

async function getCaptchaKs(minLen) {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: SHUMEI } });
  const probe = createCapProbe(env, {});
  probe.installPreLoad();
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  probe.installPostLoad();
  await probe.call({ sessionId: 'A'.repeat(Math.max(2500, (minLen || 1500) + 800)) });
  const rep = probe.report();
  env.dispose();
  return rep.data.keystream;
}

(async () => {
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/cap_d_plaintext.json'), 'utf8'));
  const inner = JSON.parse(tpl.data);
  inner.sk = SK;
  inner.shumeiId = SHUMEI;      // ← 用 header 那套 shumeiid
  inner.dua = UA;
  inner.dje = randDje();
  if (inner.jcmp) { inner.jcmp.dua = UA; inner.jcmp.dlocalSk = null; }
  const plainObj = { bcv: BCV, type: tpl.type, c: tpl.c, webp: tpl.webp, data: JSON.stringify(inner) };
  const plain = JSON.stringify(plainObj);
  console.log('明文长度:', plain.length, '| data 字段数:', Object.keys(inner).length);

  const ks = await getCaptchaKs(plain.length);
  console.log('ks 长度:', ks ? ks.length : 0);
  if (!ks || ks.length < Buffer.byteLength(plain)) { console.log('ks 不足，退出'); return; }

  const p = Buffer.from(plain, 'utf8');
  const cipher = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) cipher[i] = p[i] ^ ks[i];
  const d = Buffer.from(cipher.toString('latin1'), 'utf8').toString('base64');
  const sign = md5('d' + d + SALT);
  console.log('d len:', d.length, '| sign:', sign);

  const headers = {
    'content-type': 'application/json',
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.dewu.com',
    'referer': 'https://www.dewu.com/',
    'user-agent': UA,
    'appid': 'h5', 'bcn': 'dewu', 'bcv': BCV, 'platform': 'h5', 'lang': 'zh',
    'shumeiid': SHUMEI, 'userid': '', 'sk': SK, 'SK': SK, 'skt': 'hdr1',
    'hsn': HSN, 'adi': ADI, 'ltk': LTK, 'sessionid': SESSIONID,
    'traceparent': `00-${randHex(16)}-${randHex(8)}-01`,
    'cookie': `sajssdk_2015_cross_new_user=1; sk=${SK}; _c_WBKFRo=JgdkLJdUmBaHdb6PQh6Z5ckFRJTZkuywxzE0MjIB`,
  };

  const t0 = Date.now();
  const r = await fetch(URL_CALL, { method: 'POST', headers, body: JSON.stringify({ d, sign }) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { }
  console.log(`\nstatus=${r.status} ${Date.now() - t0}ms len=${text.length}`);
  console.log('code/msg:', j ? `${j.code}/${j.msg}` : '(非JSON)');
  if (j && j.data) {
    console.log('data keys:', Object.keys(j.data).join(','));
    if (j.data.sessionId) console.log('★ sessionId:', j.data.sessionId);
    if (j.data.bgList) console.log('★ bgList:', j.data.bgList.length, '张');
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_call_resp.json'), JSON.stringify(j, null, 1));
    console.log('→ artifacts/cap_call_resp.json');
  } else {
    console.log('响应:', text.slice(0, 300));
  }
})().catch(e => console.error('ERR', e));
