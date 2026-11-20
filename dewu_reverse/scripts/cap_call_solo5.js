/**
 * 纯协议过码 · 第 1 步 v5：用「真实解密的 call 明文」做模板（含 sessionID）
 * 关键：真实 call 明文顶层有 6 个字段，第一个是 sessionID —— 我们的模板漏了它
 * 用法: node scripts/cap_call_solo5.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('../src/env_patch');
const { createCapProbe } = require('../src/dewu_cap_probe');

const ROOT = path.resolve(__dirname, '..');
const URL_CALL = 'https://app.dewu.com/api/v1/h5/risk-stone-captcha/captcha/call';
const SALT = '048a9c4943398714b356a696503d2d36';
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const randHex = n => crypto.randomBytes(n).toString('hex');
const randDje = () => { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < 32; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const SK = 'YOUR_SK_HERE';
const SHUMEI = 'YOUR_SHUMEIID_HERE';
const ADI = argOf('--adi') || '0l3fG8GRVw2jhh7HWZ-JHAwr18HcOSGHJOw55Jw78iaMOWwqwkwqPCtMOewr7DvcOXw7vCmcO1w4fDmigA';
const LTK = argOf('--ltk') || 'GcKMwqfCo8OZKcKRw67ClsKYI8Kkwp/DksOUB8OmwpbCkMKnNjnCnn7DnMOnL8K8LA3Cv3TDminDg8ODw54fcsKeQWzCrcOxwqTChcO1wozDlcK7';
const SESSIONID_HDR = argOf('--sessionid') || 'yTtluHT1-zEsM-3xqr-4ZoT-i5B0HNfmzmi9cfxQ';
const HSN = argOf('--hsn') || '944821c9440f7599987dd159e0b6fe16';
const BCV = '1.3.1.20260331';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

async function getKs(minLen) {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: SHUMEI } });
  const probe = createCapProbe(env, {});
  probe.installPreLoad();
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  probe.installPostLoad();
  await probe.call({ sessionId: 'A'.repeat(Math.max(2500, (minLen || 2000) + 800)) });
  const rep = probe.report();
  env.dispose();
  return rep.data.keystream;
}

(async () => {
  // 真实明文（从浏览器成功的 call 解密而来），含 sessionID
  const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/call_plain_real.json'), 'utf8'));
  const inner = JSON.parse(real.data);
  inner.dje = randDje();          // 只换随机字段，其余保持真实
  inner.sk = SK;
  inner.shumeiId = SHUMEI;
  inner.dua = UA;
  if (inner.jcmp) inner.jcmp.dua = UA;
  if (argOf('--sessionid-plain')) real.sessionID = argOf('--sessionid-plain');

  const plainObj = {
    sessionID: real.sessionID,
    bcv: real.bcv, type: real.type, c: real.c, webp: real.webp,
    data: JSON.stringify(inner),
  };
  const plain = JSON.stringify(plainObj);
  console.log('sessionID(明文):', plainObj.sessionID.slice(0, 40) + '…', '| len', plainObj.sessionID.length);
  console.log('明文长度:', plain.length, '（真实样本 1638）');

  const ks = await getKs(plain.length);
  const p = Buffer.from(plain, 'utf8');
  const cipher = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) cipher[i] = p[i] ^ ks[i];
  const d = Buffer.from(cipher.toString('latin1'), 'utf8').toString('base64');
  const sign = md5('d' + d + SALT);
  console.log('d len:', d.length, '| sign:', sign);

  const headers = {
    'content-type': 'application/json', 'accept': '*/*', 'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.dewu.com', 'referer': 'https://www.dewu.com/', 'user-agent': UA,
    'appid': 'h5', 'bcn': 'dewu', 'bcv': BCV, 'platform': 'h5', 'lang': 'zh',
    'shumeiid': SHUMEI, 'userid': '', 'sk': SK, 'SK': SK, 'skt': 'hdr1',
    'hsn': HSN, 'adi': ADI, 'ltk': LTK, 'sessionid': SESSIONID_HDR,
    'traceparent': `00-${randHex(16)}-${randHex(8)}-01`,
    'cookie': `sajssdk_2015_cross_new_user=1; sk=${SK}`,
  };

  const t0 = Date.now();
  const r = await fetch(URL_CALL, { method: 'POST', headers, body: JSON.stringify({ d, sign }) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { }
  console.log(`\nstatus=${r.status} ${Date.now() - t0}ms len=${text.length}`);
  console.log('code/msg:', j ? `${j.code}/${j.msg}` : '(非JSON)');
  if (j && j.data) {
    console.log('data keys:', Object.keys(j.data).join(','));
    console.log('★ sessionId:', j.data.sessionId);
    console.log('★ bgList:', (j.data.bgList || []).length, '张');
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_call_resp.json'), JSON.stringify(j, null, 1));
  } else { console.log('响应:', text.slice(0, 300)); }
})().catch(e => console.error('ERR', e));
