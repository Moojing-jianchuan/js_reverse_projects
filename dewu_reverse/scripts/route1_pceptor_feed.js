/**
 * route1_pceptor_feed.js —— 路线 1「喂入-截出」：
 * 让 pceptor 自己的 fetch 拦截器吃掉一份假的 200 响应（真实密文 + 真实响应头 sks:1），
 * 截获它交给业务层的明文。
 *
 * 全程本地：jsdom 的 resources 不开，davstatic 那个外部 SDK 脚本由我们把
 * preinforce2 的 payload 顶上（它挂的 window.fun 就是 pceptor 要的东西），不联网。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { createEnv } = require('../src/env_patch');

const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';
const INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const cipherText = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8').trim();
const interceptorResp = fs.readFileSync(path.join(ROOT, 'artifacts/interceptor_resp.json'), 'utf8');

const t0 = Date.now();
const log = [];
const L = (m) => { const s = '[' + String(Date.now() - t0).padStart(5) + 'ms] ' + m; console.log(s); log.push(s); };

(async () => {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: DWSM } });
  const w = env.window;

  // ── 0) 最小 Request / Headers / Response 垫片（jsdom 没有 fetch 家族） ─────
  if (typeof w.Headers === 'undefined' || !w.Headers.prototype.get) {
    w.Headers = function (h) {
      this._h = {};
      if (h && typeof h === 'object') for (const k of Object.keys(h)) this._h[k.toLowerCase()] = String(h[k]);
      this.get = k => (String(k).toLowerCase() in this._h ? this._h[String(k).toLowerCase()] : null);
      this.set = (k, v) => { this._h[String(k).toLowerCase()] = String(v); };
      this.has = k => String(k).toLowerCase() in this._h;
      this.forEach = cb => Object.keys(this._h).forEach(k => cb(this._h[k], k));
      this.entries = () => Object.keys(this._h).map(k => [k, this._h[k]]);
    };
  }
  if (typeof w.Request === 'undefined' || !w.Request.prototype.clone) {
    w.Request = function (url, init) {
      const src = url && typeof url === 'object' && url.url ? url : null;
      this.url = src ? src.url : String(url);
      this.method = (init && init.method) || (src && src.method) || 'GET';
      this.headers = new w.Headers((init && init.headers) || (src && src.headers) || {});
      this.body = (init && init.body) !== undefined ? init.body : (src && src.body);
      this.credentials = 'same-origin';
      this.__poly = true;
      const self = this;
      this.clone = () => new w.Request(self);
      this.text = () => w.Promise.resolve(self.body == null ? '' : String(self.body));
    };
  }
  if (typeof w.Response === 'undefined' || !w.Response.prototype.clone) {
    w.Response = function (body, init) {
      init = init || {};
      this._body = body == null ? '' : String(body);
      this.status = init.status || 200;
      this.statusText = init.statusText || 'OK';
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new w.Headers(init.headers || {});
      this.url = init.url || '';
      const self = this;
      this.clone = () => new w.Response(self._body, { status: self.status, statusText: self.statusText, headers: self.headers._h, url: self.url });
      this.text = () => w.Promise.resolve(self._body);
      this.json = () => { try { return w.Promise.resolve(JSON.parse(self._body)); } catch (e) { return w.Promise.reject(e); } };
    };
  }

  // ── 1) 外部 SDK 脚本顶替：pceptor 会 createElement('script') + src=davstatic ─
  const NP = w.Node && w.Node.prototype;
  const origAppend = NP.appendChild;
  let injected = false;
  NP.appendChild = function (node) {
    try {
      const tag = node && node.tagName;
      const src = node && node.src ? String(node.src) : '';
      if (tag === 'SCRIPT' && /davstatic|\.dewu\.com\/p/.test(src) && !injected) {
        injected = true;
        L('捕获 pceptor 注入的外部 SDK 脚本: ' + src.slice(0, 70) + '…  → 用 preinforce2 payload 顶替（不联网）');
        try {
          env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8'), 'substitute-davstatic.js');
        } catch (e) { L('  顶替脚本 eval 失败: ' + e.message); }
        L('  顶替后 window.fun = ' + typeof w.fun + ' | Fun99=' + (w.fun && typeof w.fun.Fun99));
        const onload = node.onload;
        setTimeout(() => { try { onload && onload.call(node, { type: 'load' }); L('  已触发 script.onload → pceptor 的 {Fun110,Fun99} promise 可 resolve'); } catch (e) { L('  onload 抛错 ' + e.message); } }, 0);
        return node; // 不真插进 DOM，避免 jsdom 尝试加载
      }
    } catch (e) { /* ignore */ }
    return origAppend.apply(this, arguments);
  };

  // ── 2) 底层 fetch 桩：按 URL 返回假响应 ────────────────────────────────────
  const calls = [];
  w.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    calls.push({ url, method: (init && init.method) || 'GET' });
    L('底层 fetch 被调用: ' + url.slice(0, 120));
    if (/interceptor/.test(url)) {
      return w.Promise.resolve(new w.Response(interceptorResp, { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    if (/feeds\/info/.test(url)) {
      return w.Promise.resolve(new w.Response(cipherText, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json;charset=UTF-8',
          sks: '1',
          'sks-length': '14740',
          traceid: 'route1-fixture',
          servertime: '20261120121012',
        },
      }));
    }
    return w.Promise.resolve(new w.Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  };

  // ── 3) 装 JSON.parse 观察点 ───────────────────────────────────────────────
  const parseLog = [];
  const oParse = w.JSON.parse;
  w.JSON.parse = function (s, r) {
    const out = oParse.call(w.JSON, s, r);
    if (typeof s === 'string' && s.length > 100) parseLog.push({ len: s.length, head: s.slice(0, 120) });
    return out;
  };

  // ── 4) 加载 pceptor ───────────────────────────────────────────────────────
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pceptor.js'), 'utf8'), 'pceptor.js');
  L('pceptor 加载完成；新增全局: ' + JSON.stringify(env.globals().added));
  L('  window.fetch 是否被 pceptor 接管: ' + (w.fetch !== undefined));

  await new Promise(r => setTimeout(r, 1500));

  // ── 5) 喂一个 info 的 200 响应 ────────────────────────────────────────────
  L('=== 发起 feeds/info（本地假响应） ===');
  let text = null, status = null;
  try {
    const res = await w.fetch(INFO, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pickRuleId":644479}' });
    status = res && res.status;
    L('拦截器返回 Response: status=' + status + ' statusText=' + (res && res.statusText));
    const sksHdr = res && res.headers && res.headers.get ? res.headers.get('sks') : undefined;
    L('  返回的 Response.headers.sks = ' + JSON.stringify(sksHdr));
    text = await res.text();
  } catch (e) {
    L('fetch 链路抛错: ' + (e && e.message));
  }

  L('业务层拿到的 body: type=' + typeof text + ' len=' + (text ? String(text).length : 0));
  if (text) {
    L('  head: ' + JSON.stringify(String(text).slice(0, 200)));
    try {
      const j = JSON.parse(text);
      L('  JSON.parse 成功: code=' + j.code + ' data.list=' + (j.data && j.data.list ? j.data.list.length : 'n/a'));
    } catch (e) { L('  JSON.parse 失败: ' + e.message); }
  }
  L('JSON.parse 观察点命中 ' + parseLog.length + ' 次');
  for (const p of parseLog.slice(0, 5)) L('   parse len=' + p.len + ' ' + JSON.stringify(p.head));

  L('底层 fetch 调用记录: ' + JSON.stringify(calls));

  w.JSON.parse = oParse;
  NP.appendChild = origAppend;
  fs.writeFileSync(path.join(ROOT, 'artifacts/route1_pceptor_feed.log'), log.join('\n'));
  env.dispose();
})();
