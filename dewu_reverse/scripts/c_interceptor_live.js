/**
 * C-1：回答「pceptor 拦截器为什么不触发 / 需不需要它」
 * 做法：jsdom 里在【加载 pceptor 之前】hook 原生 XMLHttpRequest.prototype，
 *       然后把 pceptor.js + preinforce2.js 都灌进去，再发一条 feeds/info POST，
 *       看最终交给原生 send 的 body 是不是 {data} 信封。
 * 用法: node scripts/c_interceptor_live.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const pe = require('../src/pceptor_encrypt');

const ROOT = path.resolve(__dirname, '..');
const SK = pe.DEFAULT_SK, SM = pe.DEFAULT_SM;
const PLAIN = pe.infoPlain({});

const env = createEnv({ blockNetwork: true, resources: true, traceReads: false, seedStorage: { sk: SK, dwsm: SM } });
const w = env.window;
for (const k of ['Response', 'Request', 'Headers', 'AbortController']) {
  if (typeof w[k] === 'undefined' && typeof globalThis[k] !== 'undefined') w[k] = globalThis[k];
}

/* ① 先 hook 原生 XHR（skill case 坑 5：Hook 必须先于 SDK 加载） */
const finalCalls = [];
const P = w.XMLHttpRequest.prototype;
const oOpen = P.open, oSend = P.send, oHdr = P.setRequestHeader;
P.open = function (m, u) { this.__u = String(u); this.__m = m; this.__h = {}; return oOpen.apply(this, arguments); };
P.setRequestHeader = function (k, v) { try { this.__h[k] = String(v); } catch (e) { } return oHdr.apply(this, arguments); };
P.send = function (b) {
  finalCalls.push({ url: this.__u, method: this.__m, headers: this.__h, body: b == null ? null : String(b) });
  // 不真的发网络请求：喂一个假响应让 SDK 的 promise 链能收尾
  const self = this;
  setTimeout(() => {
    try {
      Object.defineProperty(self, 'readyState', { value: 4, configurable: true, writable: true });
      Object.defineProperty(self, 'status', { value: 200, configurable: true, writable: true });
      Object.defineProperty(self, 'responseText', { value: '{"code":200,"msg":"{}"}', configurable: true, writable: true });
      Object.defineProperty(self, 'response', { value: '{"code":200,"msg":"{}"}', configurable: true, writable: true });
      if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
      if (typeof self.onload === 'function') self.onload();
      if (self.dispatchEvent) self.dispatchEvent(new w.Event('load'));
    } catch (e) { }
  }, 5);
  return undefined;
};

/* ② 再加载 SDK：两件套都灌进去（只灌 pceptor.js 时，请求管线会 await preinforce2 模块而卡住） */
const loadOrder = (process.argv[2] === 'pceptor-only') ? ['pceptor.js'] : ['pceptor.js', 'preinforce2.js'];
for (const f of loadOrder) {
  try { env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js', f), 'utf8'), f); console.log('[load]', f, 'OK'); }
  catch (e) { console.log('[load]', f, 'THROW:', String(e.message).slice(0, 140)); }
}
console.log('window.fun?', !!(w.fun && w.fun.Fun110), '| _yundunxhr?', typeof w._yundunxhr, '| XMLHttpRequest 已被替换?', w.XMLHttpRequest !== w._yundunxhr);

(async () => {
  await new Promise(r => setTimeout(r, 300));
  // ③ 用【pceptor 包装后的】XMLHttpRequest 发业务请求
  try {
    const x = new w.XMLHttpRequest();
    x.open('POST', pe.INFO_URL, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(PLAIN);
  } catch (e) { console.log('fire THROW:', String(e.message).slice(0, 160)); }

  await new Promise(r => setTimeout(r, 2500));
  console.log('\n=== 交给原生 XHR 的调用 ' + finalCalls.length + ' 条 ===');
  for (const c of finalCalls) {
    console.log('-', c.method, c.url.slice(0, 90));
    console.log('  headers:', Object.keys(c.headers || {}).join(','));
    const b = c.body || '';
    console.log('  bodyLen:', b.length, '| head:', b.slice(0, 110));
    try {
      const j = JSON.parse(b);
      if (j && typeof j.data === 'string') {
        console.log('  *** {data} 信封! len', j.data.length, '| hex32', j.data.slice(0, 32), '| == md5(plain):', j.data.slice(0, 32) === pe.md5(PLAIN));
        const mine = pe.buildInfoEnvelope(PLAIN);
        console.log('  *** 与本模块纯算法结果一致:', j.data === mine.data, '(pure', mine.ms + 'ms)');
      }
    } catch (e) { }
  }
  if (!finalCalls.length) console.log('（0 条：说明 SDK 的请求管线没走到原生 send —— 见 docs 里关于 preinforce2 依赖的说明）');
  pe.closeSession();
  env.dispose();
  process.exit(0);
})();
