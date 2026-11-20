/**
 * 纯协议过码 · 第 1 步 v2：用「真实 34 字段明文模板」拼 call 的 d
 * 关键：明文必须字段完整（我们首版只有 6 个字段 → 服务端判「请求已过期」）
 * 用法: node scripts/cap_call_solo2.js [--sk <sk>] [--dwsm <dwsm>]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const loader = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const URL_CALL = 'https://app.dewu.com/api/v1/h5/risk-stone-captcha/captcha/call';
const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const SK = argOf('--sk') || 'YOUR_SK_HERE';
const DWSM = argOf('--dwsm') || 'YOUR_SHUMEIID_HERE';
const BCV = '1.3.1.20260331';
const HSN = '22a9ecc6cb12ec7d0e8bdf53bc34efce';   // 抓包中恒为此值
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

function randHex(n) { return crypto.randomBytes(n).toString('hex'); }
function randTrace() {
  return `00-${randHex(16)}-${randHex(8)}-01`;
}
function randDje() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

(async () => {
  const tplRaw = fs.readFileSync(path.join(ROOT, 'artifacts/cap_d_plaintext.json'), 'utf8');
  const tpl = JSON.parse(tplRaw);
  const inner = JSON.parse(tpl.data);

  // 替换会随会话变化的字段，其余保持模板原值（34 字段全保留，顺序不变）
  inner.sk = SK;
  inner.shumeiId = DWSM;
  inner.dua = UA;
  inner.dje = randDje();
  if (inner.jcmp) { inner.jcmp.dua = UA; inner.jcmp.dlocalSk = null; }
  // 顶层：保持 bcv/type/c/webp/data 顺序；c 的时间项按新会话给 0
  const plainObj = { bcv: BCV, type: tpl.type, c: tpl.c, webp: tpl.webp, data: JSON.stringify(inner) };
  const plain = JSON.stringify(plainObj);
  console.log('明文长度:', plain.length, '| data 字段数:', Object.keys(inner).length);

  const ks = await loader.calibrateKeystream(SK);
  const built = loader.buildD(plainObj, ks);
  const d = typeof built === 'string' ? built : built.d;
  const sign = loader.signD(d);
  console.log('d len:', d.length, '| sign:', sign);

  const headers = {
    'content-type': 'application/json',
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.dewu.com',
    'referer': 'https://www.dewu.com/',
    'user-agent': UA,
    'appid': 'h5', 'bcn': 'dewu', 'bcv': BCV, 'platform': 'h5', 'lang': 'zh',
    'shumeiId': DWSM, 'userId': '', 'SK': SK, 'sk': SK, 'skt': 'hdr1',
    'hsn': HSN,
    'traceparent': randTrace(),
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
    if (j.data.sessionId) console.log('★ sessionId:', j.data.sessionId);
    if (j.data.bgList) console.log('★ bgList:', j.data.bgList.length, '张 | 题面:', (j.data.question || j.data.tip || j.data.title || '').slice(0, 60));
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_call_resp.json'), JSON.stringify(j, null, 1));
    console.log('→ artifacts/cap_call_resp.json');
  } else {
    console.log('响应:', text.slice(0, 300));
  }
})().catch(e => console.error('ERR', e));
