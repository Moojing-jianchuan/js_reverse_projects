/**
 * 关键实验：带真实 cookie（sk / _c_WBKFRo）真发 captcha/call
 * 之前所有真发实验都漏了 Cookie —— 服务端很可能靠它识别 sk 会话
 * 用法: node scripts/send_cap_with_cookie.js [--sessionId xxx] [--no-cookie]
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const { signD } = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const PYUNTU = fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8');

// 浏览器当前 cookie（2026-11-20 11:40 读取）
const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';
const WBK = 'Asb1LOZqU4cK1Y52feRhhzRxf1mt6S90OPaLWOQc';

const noCookie = process.argv.includes('--no-cookie');
const si = process.argv.indexOf('--sessionId');
const sessionId = si > 0 ? process.argv[si + 1] : null;
const noSk = process.argv.includes('--no-sk');

async function gen() {
  const seed = {};
  if (!noSk) seed.sk = SK;
  seed.dwsm = DWSM;
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: seed });
  const w = env.window;
  const cap = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send, oHdr = P.setRequestHeader;
  P.open = function (m, u) { this.__c = { method: m, url: String(u), headers: {} }; return oOpen.apply(this, arguments); };
  P.setRequestHeader = function (k, v) { if (this.__c) this.__c.headers[k] = String(v); return oHdr.apply(this, arguments); };
  P.send = function (b) { if (this.__c) { this.__c.body = b == null ? null : String(b); cap.push(this.__c); } return oSend.apply(this, arguments); };
  env.evalSource(PYUNTU, 'pyuntu.js');
  const args = sessionId ? { sessionId } : {};
  w.dewuCap(args);
  return new Promise(res => setTimeout(() => {
    const hit = cap.find(c => c.url.includes('captcha'));
    env.dispose();
    res(hit || null);
  }, 1500));
}

(async () => {
  const cap = await gen();
  if (!cap) { console.log('未捕获请求'); return; }
  const j = JSON.parse(cap.body);
  console.log('SK header   :', JSON.stringify(cap.headers.SK || cap.headers.sk || ''));
  console.log('shumeiId hdr:', JSON.stringify(cap.headers.shumeiId || ''));
  console.log('全部 headers:', JSON.stringify(cap.headers));
  console.log('d.len       :', j.d.length, '| sign 自校验:', signD(j.d) === j.sign ? '✅' : '❌');

  const headers = {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://www.dewu.com',
    'Referer': 'https://www.dewu.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    ...cap.headers,
  };
  if (!noCookie) {
    headers['Cookie'] = `sajssdk_2015_cross_new_user=1; _c_WBKFRo=${WBK}; sk=${SK}`;
    console.log('Cookie      : 已附加（sk/_c_WBKFRo）');
  } else {
    console.log('Cookie      : 未附加（对照）');
  }
  if (sessionId) console.log('sessionId   :', sessionId);

  const t0 = Date.now();
  const r = await fetch(cap.url, { method: 'POST', headers, body: cap.body });
  const text = await r.text();
  console.log('\n=== 响应 ===');
  console.log('status', r.status, '|', Date.now() - t0, 'ms | len', text.length);
  console.log('body  :', text.slice(0, 500));
  try {
    const o = JSON.parse(text);
    console.log('code/msg:', o.code, '/', o.msg);
    if (o.data) console.log('data keys:', Object.keys(o.data), '| sessionId:', o.data.sessionId);
  } catch (e) { }
})().catch(e => console.error('ERR', e));
