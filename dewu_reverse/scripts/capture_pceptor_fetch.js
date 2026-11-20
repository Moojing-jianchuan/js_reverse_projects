/**
 * 喂入-截出（fetch 通道）：先喂 interceptor 配置让 pceptor 完成初始化，
 * 再用 pceptor 包装后的 fetch 发明文 → 抓它加密后的最终 body
 * 依 skill case 坑 11：必须 resources:'usable' 才会触发 JSVMP 的 XHR 拦截器
 * 用法: node scripts/capture_pceptor_fetch.js
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
if (typeof w.Response === 'undefined') w.Response = Response;
if (typeof w.Request === 'undefined') w.Request = Request;
if (typeof w.Headers === 'undefined') w.Headers = Headers;

const seen = [];

w.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const method = (init && init.method) || (input && input.method) || 'GET';
  const body = init && init.body != null ? String(init.body) : null;

  if (url.includes('/interceptor')) {
    console.log('[mock] feed interceptor config ->', url);
    return Promise.resolve(new w.Response(INTERCEPTOR, { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  seen.push({ url, method, body, headers: init && init.headers ? Object.fromEntries(Object.entries(init.headers)) : null });
  console.log('[mock] pceptor finally sent ->', method, url, '| bodyLen', body ? body.length : 0);
  return Promise.resolve(new w.Response('{"code":200,"msg":"success","data":{}}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
};

try {
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pceptor.js'), 'utf8'), 'pceptor.js');
  console.log('[load] pceptor.js OK');
} catch (e) { console.log('[load] THROW', String(e.message).slice(0, 150)); }

async function fireViaFetch() {
  try {
    const p = w.fetch(URL_INFO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: PLAIN, credentials: 'include' });
    if (p && p.then) await p;
  } catch (e) { console.log('[fetch] THROW', String(e.message).slice(0, 200)); }
}

(async () => {
  console.log('plain:', PLAIN);
  console.log('md5(plain):', TARGET_HEX);
  await new Promise(r => setTimeout(r, 800));
  await fireViaFetch();
  await new Promise(r => setTimeout(r, 800));

  console.log('\n=== captured ' + seen.length + ' ===');
  for (const s of seen) {
    console.log('\n', s.method, s.url);
    console.log('  headers:', JSON.stringify(s.headers).slice(0, 400));
    const b = s.body || '';
    console.log('  bodyLen:', b.length, '| head:', b.slice(0, 160));
    const m = b.match(/"data"\s*:\s*"([^"]+)"/);
    if (m) {
      const data = m[1];
      console.log('  -> data.hex:', data.slice(0, 32), '| == md5(plain):', data.slice(0, 32) === TARGET_HEX);
      console.log('  -> data.b64 head:', data.slice(32, 84));
    }
  }
  env.dispose();
  process.exit(0);
})();
