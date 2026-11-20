/**
 * 关键实验：先加载 pceptor（让它自造 dwsm / yuntuSession），再加载 pyuntu 出 d，
 * 看 d 里的 shumeiId 是否变成 dwsm 值，以及服务端回执是否变化。
 * 默认只打印不发；加 --send 才发 1 次。
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const L = require('../src/preinforce_loader.js');

const ROOT = path.resolve(__dirname, '..');
const send = process.argv.includes('--send');
const HOST = 'https://app.dewu.com';
const PATH_CALL = '/api/v1/h5/risk-stone-captcha/captcha/call';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

(async () => {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;

  // pceptor 的 fetch 包装会 new Request(...)；env_patch 没提供，这里补最小实现
  if (typeof w.Request === 'undefined') {
    w.Request = function (url, init) {
      const src = (url && typeof url === 'object' && url.url) ? url : null;
      this.url = src ? src.url : (typeof url === 'string' ? url : String(url));
      this.method = (init && init.method) || (src && src.method) || 'GET';
      this.headers = (init && init.headers) || (src && src.headers) || {};
      this.body = (init && init.body) !== undefined ? init.body : (src ? src.body : undefined);
      this.credentials = (init && init.credentials) || (src && src.credentials) || 'same-origin';
      this.__isPolyfill = true;
      const self = this;
      this.clone = function () { return new w.Request(self); };
      this.text = function () { return Promise.resolve(self.body == null ? '' : String(self.body)); };
      this.json = function () { return Promise.resolve(JSON.parse(self.body == null ? '{}' : String(self.body))); };
      this.arrayBuffer = function () { return Promise.resolve(Buffer.from(String(self.body || '')).buffer); };
    };
  }
  if (typeof w.Headers === 'undefined') {
    w.Headers = function (h) {
      this._h = {};
      const self = this;
      if (h && typeof h === 'object') for (const k of Object.keys(h)) this._h[k.toLowerCase()] = h[k];
      this.get = k => self._h[String(k).toLowerCase()] ?? null;
      this.set = (k, v) => { self._h[String(k).toLowerCase()] = v; };
      this.append = this.set;
      this.has = k => String(k).toLowerCase() in self._h;
      this.forEach = cb => Object.keys(self._h).forEach(k => cb(self._h[k], k));
    };
  }

  const strings = [];
  const oStr = w.JSON.stringify.bind(w.JSON);
  w.JSON.stringify = function (v, r, s) { const out = oStr(v, r, s); if (typeof out === 'string' && out.length > 60) strings.push(out); return out; };
  const xhrs = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send, oSet = P.setRequestHeader;
  P.open = function (m, u) { this.__c = { method: m, url: String(u), headers: {} }; return oOpen.apply(this, arguments); };
  P.setRequestHeader = function (k, v) { if (this.__c) this.__c.headers[k] = String(v); return oSet.apply(this, arguments); };
  P.send = function (b) { if (this.__c) { this.__c.body = b == null ? null : String(b); if (/captcha/.test(this.__c.url)) xhrs.push(this.__c); } return oSend.apply(this, arguments); };

  // 1) pceptor 先行（真实页面顺序）
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pceptor.js'), 'utf8'), 'pceptor.js');
  console.log('pceptor 载入后: dwsm =', w.localStorage.getItem('dwsm'), '| yuntuSession =', w.localStorage.getItem('yuntuSession'));
  console.log('  document.cookie =', String(w.document.cookie).slice(0, 160));

  // 2) pyuntu
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  try { w.dewuCap({}); } catch (e) { console.log('dewuCap 抛错', e.message); }

  await new Promise(r => setTimeout(r, 1600));
  const hit = xhrs.find(x => /captcha\/call/.test(x.url));
  if (!hit) { console.log('未捕获 captcha/call'); env.dispose(); return process.exit(1); }
  const body = JSON.parse(hit.body);
  const plain = strings.find(s => s.length === L.getKeystream().length) || strings.find(s => {
    try { return JSON.parse(s).bcv; } catch (e) { return false; }
  });
  const dec = plain || L.decryptD(body.d);
  const j = JSON.parse(dec);
  const data = JSON.parse(j.data);
  console.log('\n=== d 明文关键字段 ===');
  console.log('  shumeiId:', data.shumeiId, '| sk:', JSON.stringify(data.sk), '| dje:', data.dje);
  console.log('  jcmp.dlocalSk:', data.jcmp && data.jcmp.dlocalSk);
  console.log('  sessionID(外层):', j.sessionID);
  console.log('\n=== SDK 发的头 ===');
  console.log(' ', JSON.stringify(hit.headers));
  fs.writeFileSync(path.join(ROOT, 'artifacts/flow/call_body_with_pceptor.json'), hit.body);
  env.dispose();

  if (!send) { console.log('\n（未加 --send）'); return process.exit(0); }

  console.log('\n=== 发送 captcha/call ===');
  const r = await fetch(HOST + PATH_CALL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Accept': '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9',
      'Origin': 'https://www.dewu.com', 'Referer': 'https://www.dewu.com/', 'User-Agent': UA,
      appid: 'h5', bcn: 'dewu', bcv: '1.3.1.20260331', platform: 'h5', lang: 'zh',
      SK: '', shumeiId: data.shumeiId || 'normal', userId: '',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(' HTTP', r.status, '|', text.slice(0, 500));
  fs.writeFileSync(path.join(ROOT, 'artifacts/flow/call_response_with_pceptor.json'), text);
  process.exit(0);
})();
