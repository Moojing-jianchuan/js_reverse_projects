/**
 * 喂入-截出验证：jsdom 里让 dewuCap 生成 captcha/call 载荷 → 用 Node 原生 fetch 真发
 * 目的：验证「本地生成的 d」服务端认不认（S2/S3 判定）
 * 用法: node scripts/send_cap_call.js [--dry]
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

function buildPayload() {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
  const captured = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send, oHdr = P.setRequestHeader;

  P.open = function (m, u) { this.__c = { method: m, url: String(u), headers: {} }; return oOpen.apply(this, arguments); };
  P.setRequestHeader = function (k, v) { if (this.__c) this.__c.headers[k] = String(v); return oHdr.apply(this, arguments); };
  P.send = function (b) { if (this.__c) { this.__c.body = b == null ? null : String(b); captured.push(this.__c); } return oSend.apply(this, arguments); };

  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  w.dewuCap({});
  return new Promise(resolve => {
    setTimeout(() => {
      const hit = captured.find(c => c.url.includes('captcha'));
      env.dispose();
      resolve(hit || null);
    }, 1500);
  });
}

(async () => {
  const cap = await buildPayload();
  if (!cap) { console.log('未捕获到 captcha 请求'); return; }
  console.log('捕获:', cap.method, cap.url, 'bodyLen', (cap.body || '').length);
  console.log('SDK 自带 headers:', JSON.stringify(cap.headers));

  if (DRY) { console.log('--dry：不发送'); return; }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://www.dewu.com',
    'Referer': 'https://www.dewu.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    ...cap.headers,
  };
  const t0 = Date.now();
  const r = await fetch(cap.url, { method: 'POST', headers, body: cap.body });
  const text = await r.text();
  console.log('\n=== 服务端响应 ===');
  console.log('status :', r.status, ' 耗时', Date.now() - t0, 'ms');
  console.log('len    :', text.length);
  console.log('head   :', text.slice(0, 400));
  try {
    const j = JSON.parse(text);
    console.log('code/msg:', j.code, '/', j.msg);
    if (j.data) console.log('data keys:', Object.keys(j.data));
  } catch (e) { console.log('（响应非 JSON）'); }
})().catch(e => console.error('ERR', e));
