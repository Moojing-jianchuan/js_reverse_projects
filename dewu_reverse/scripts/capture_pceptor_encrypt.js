/**
 * 喂入-截出：让 pceptor 自己加密 info 请求体
 * 手法：在加载 pceptor 之前 hook 原生 XMLHttpRequest.prototype.send，
 *       pceptor 内部最终会调用原生 send，此时抓到的就是加密后的 body
 * 用法: node scripts/capture_pceptor_encrypt.js
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const { md5 } = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';

const PLAIN = JSON.stringify({
  sign: 'f2b6b4c666227d52fdadf251f307445d',
  pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true
});
const TARGET = 'df74e6521fc1ea3752eddb701c5453b8';

const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: DWSM } });
const w = env.window;
const captured = [];

// pceptor 的 fetch 覆盖依赖 Request/Response/Headers，jsdom 没有，用 Node 的实现补上
if (typeof w.Request === 'undefined') w.Request = Request;
if (typeof w.Response === 'undefined') w.Response = Response;
if (typeof w.Headers === 'undefined') w.Headers = Headers;

// ① 先 hook 原生 XHR（pceptor 尚未加载）
const P = w.XMLHttpRequest.prototype;
const oOpen = P.open, oSend = P.send, oHdr = P.setRequestHeader;
P.open = function (m, u) { this.__c = { method: m, url: String(u), headers: {} }; return oOpen.apply(this, arguments); };
P.setRequestHeader = function (k, v) { try { if (this.__c) this.__c.headers[k] = String(v); } catch (e) { } return oHdr.apply(this, arguments); };
P.send = function (b) {
  try { if (this.__c) { this.__c.body = b == null ? null : String(b); captured.push(this.__c); } } catch (e) { }
  return oSend.apply(this, arguments);
};

// ② 加载 pceptor（它会覆盖 XMLHttpRequest / fetch）
try {
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pceptor.js'), 'utf8'), 'pceptor.js');
  console.log('[load] pceptor.js OK');
} catch (e) { console.log('[load] THROW', String(e.message).slice(0, 120)); }

// ③ 用 pceptor 版 XHR 发一次（模拟业务代码）
function fireViaXHR() {
  return new Promise(resolve => {
    try {
      const x = new w.XMLHttpRequest();
      x.open('POST', URL_INFO, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.onreadystatechange = () => { if (x.readyState === 4) resolve(); };
      x.send(PLAIN);
      setTimeout(resolve, 800);
    } catch (e) { console.log('XHR THROW', String(e.message).slice(0, 120)); resolve(); }
  });
}

// ④ 也用 fetch 发一次（pceptor 可能也 hook 了 fetch）
function fireViaFetch() {
  return new Promise(resolve => {
    try {
      const r = w.fetch(URL_INFO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: PLAIN });
      if (r && r.then) r.then(() => resolve()).catch(() => resolve());
      else resolve();
      setTimeout(resolve, 800);
    } catch (e) { console.log('fetch THROW', String(e.message).slice(0, 120)); resolve(); }
  });
}

(async () => {
  console.log('明文:', PLAIN);
  console.log('目标 hex:', TARGET, '| md5(明文):', md5(PLAIN));

  await fireViaXHR();
  await fireViaFetch();
  await new Promise(r => setTimeout(r, 500));

  console.log(`\n=== 捕获 ${captured.length} 条 ===`);
  for (const c of captured) {
    console.log('\nURL:', c.method, c.url);
    console.log('headers:', JSON.stringify(c.headers).slice(0, 400));
    const b = c.body || '';
    console.log('bodyLen:', b.length);
    console.log('body:', b.slice(0, 300));
    if (b.startsWith('{"data"')) {
      try {
        const j = JSON.parse(b);
        const hex = String(j.data).slice(0, 32);
        console.log('  → data.hex:', hex, '| 与 md5(明文) 一致:', hex === md5(PLAIN));
        console.log('  → data.b64 head:', String(j.data).slice(32, 72));
      } catch (e) { }
    }
  }
  // 也看拦截器是否记录了什么
  console.log('\nnetLog:', JSON.stringify(env.netLog).slice(0, 300));
  env.dispose();
})();
