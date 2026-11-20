/**
 * 矩阵实验：找出 captcha/call 从「请求已过期」变成有效响应的条件
 * 变量：localStorage 里的 sk / dwsm / yuntuSession 种子
 * 用法: node scripts/seed_matrix.js
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const PYUNTU = fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8');

// 浏览器会话中观察到的真实值（抓包所得，可能已过期）
const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';

function build(seed) {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: seed || undefined });
  const w = env.window;
  const captured = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send, oHdr = P.setRequestHeader;
  P.open = function (m, u) { this.__c = { method: m, url: String(u), headers: {} }; return oOpen.apply(this, arguments); };
  P.setRequestHeader = function (k, v) { if (this.__c) this.__c.headers[k] = String(v); return oHdr.apply(this, arguments); };
  P.send = function (b) { if (this.__c) { this.__c.body = b == null ? null : String(b); captured.push(this.__c); } return oSend.apply(this, arguments); };
  env.evalSource(PYUNTU, 'pyuntu.js');
  w.dewuCap({});
  return new Promise(resolve => setTimeout(() => {
    const hit = captured.find(c => c.url.includes('captcha'));
    env.dispose();
    resolve(hit || null);
  }, 1500));
}

async function send(cap) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://www.dewu.com',
    'Referer': 'https://www.dewu.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    ...cap.headers,
  };
  const r = await fetch(cap.url, { method: 'POST', headers, body: cap.body });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { }
  return { status: r.status, code: j && j.code, msg: j && j.msg, len: t.length, head: t.slice(0, 160) };
}

(async () => {
  const cases = [
    ['基线（无种子）', null],
    ['seed sk', { sk: SK }],
    ['seed sk+dwsm', { sk: SK, dwsm: DWSM }],
    ['seed sk+dwsm+yuntuSession', { sk: SK, dwsm: DWSM, yuntuSession: 'xwuknnl1-r0gv-crnz-zlxw-jpzyq5fuui9v1zwa' }],
  ];
  for (const [name, seed] of cases) {
    const cap = await build(seed);
    if (!cap) { console.log(name, '→ 未捕获请求'); continue; }
    const resp = await send(cap);
    console.log(`\n[${name}] SK header="${cap.headers.SK || cap.headers.sk || ''}" dLen=${((JSON.parse(cap.body).d) || '').length}`);
    console.log('  →', JSON.stringify(resp));
    await new Promise(r => setTimeout(r, 1200));
  }
})();
