/**
 * 喂入-截出 v2：同时 mock XHR 与 fetch 的 /interceptor，确保 pceptor 初始化完成
 * 依据 skill case 坑 11（resources:'usable'）+ 坑 5（Hook 顺序：先 Hook 再加载 SDK）
 * 用法: node scripts/capture_pceptor_v2.js
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
const TARGET_HEX = md5(PLAIN);
const INTERCEPTOR = fs.readFileSync(path.join(ROOT, 'artifacts/interceptor_resp.json'), 'utf8').trim();

const env = createEnv({ blockNetwork: true, traceReads: false, resources: true, seedStorage: { sk: SK, dwsm: DWSM } });
const w = env.window;
for (const k of ['Response', 'Request', 'Headers', 'AbortController']) {
  if (typeof w[k] === 'undefined' && typeof globalThis[k] !== 'undefined') w[k] = globalThis[k];
}
const seen = [];

/** 伪造一次 XHR 响应（用于喂 /interceptor 配置） */
function fakeRespond(xhr, text, status = 200) {
  const set = (k, v) => { try { Object.defineProperty(xhr, k, { value: v, configurable: true, writable: true }); } catch (e) { } };
  set('readyState', 4); set('status', status); set('responseText', text); set('response', text);
  set('responseURL', xhr.__url || '');
  try { if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange(); } catch (e) { }
  try { if (typeof xhr.onload === 'function') xhr.onload(); } catch (e) { }
  try { xhr.dispatchEvent && xhr.dispatchEvent(new w.Event('load')); } catch (e) { }
}

// ① Hook 原生 XHR（先于 pceptor 加载）
const P = w.XMLHttpRequest.prototype;
const oOpen = P.open, oSend = P.send, oHdr = P.setRequestHeader;
P.open = function (m, u) { this.__url = String(u); this.__method = m; this.__h = {}; return oOpen.apply(this, arguments); };
P.setRequestHeader = function (k, v) { try { this.__h[k] = String(v); } catch (e) { } return oHdr.apply(this, arguments); };
P.send = function (b) {
  const url = this.__url || '';
  if (url.includes('/interceptor')) {
    console.log('[mock-xhr] feed interceptor ->', url);
    fakeRespond(this, INTERCEPTOR);
    return;
  }
  seen.push({ via: 'xhr', url, method: this.__method, headers: this.__h, body: b == null ? null : String(b) });
  console.log('[mock-xhr] sent ->', this.__method, url, '| bodyLen', b ? String(b).length : 0);
  fakeRespond(this, '{"code":200,"msg":"success","data":{}}');
};

// ② Hook fetch
w.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const method = (init && init.method) || 'GET';
  const body = init && init.body != null ? String(init.body) : null;
  if (url.includes('/interceptor')) {
    console.log('[mock-fetch] feed interceptor ->', url);
    return Promise.resolve(new w.Response(INTERCEPTOR, { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  seen.push({ via: 'fetch', url, method, headers: init && init.headers ? Object.fromEntries(Object.entries(init.headers)) : null, body });
  console.log('[mock-fetch] sent ->', method, url, '| bodyLen', body ? body.length : 0);
  return Promise.resolve(new w.Response('{"code":200,"msg":"success","data":{}}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
};

// ③ 加载 pceptor（它会保存上面的 fetch / XHR 引用）
try {
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pceptor.js'), 'utf8'), 'pceptor.js');
  console.log('[load] pceptor.js OK');
} catch (e) { console.log('[load] THROW', String(e.message).slice(0, 150)); }

async function fire(via) {
  try {
    if (via === 'fetch') {
      const p = w.fetch(URL_INFO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: PLAIN, credentials: 'include' });
      if (p && p.then) await Promise.race([p, new Promise(r => setTimeout(r, 3000))]);
    } else {
      const x = new w.XMLHttpRequest();
      x.open('POST', URL_INFO, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(PLAIN);
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (e) { console.log('[' + via + '] THROW', String(e.message).slice(0, 200)); }
}

(async () => {
  console.log('plain:', PLAIN);
  console.log('md5(plain):', TARGET_HEX);
  await new Promise(r => setTimeout(r, 1000));
  await fire('fetch');
  await fire('xhr');
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n=== captured ' + seen.length + ' ===');
  for (const s of seen) {
    console.log('\n', s.via, s.method, s.url);
    console.log('  headers:', JSON.stringify(s.headers).slice(0, 500));
    const b = s.body || '';
    console.log('  bodyLen:', b.length, '| head:', b.slice(0, 200));
    const m = b.match(/"data"\s*:\s*"([^"]+)"/);
    if (m) {
      const data = m[1];
      console.log('  -> data.hex:', data.slice(0, 32), '| == md5(plain):', data.slice(0, 32) === TARGET_HEX);
      console.log('  -> data.b64:', data.slice(32, 96));
      fs.writeFileSync(path.join(ROOT, 'artifacts/cap_data_envelope.txt'), data);
    }
  }
  console.log('\nnetLog:', JSON.stringify(env.netLog).slice(0, 400));
  env.dispose();
  process.exit(0);
})();
