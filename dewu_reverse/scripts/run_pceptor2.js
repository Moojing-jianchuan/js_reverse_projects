/**
 * 探针 2：给沙箱一个"像真的" XHR（带原型/访问器/事件），看 SDK 的包装器能不能构造出来。
 * 用法: node scripts/run_pceptor2.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
const SRC = process.env.PCEPTOR_SRC || path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js');
const code = fs.readFileSync(SRC, 'utf8');

const TRACE = [];
function trace(...a) { TRACE.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }

function makeRealisticXHR() {
  function XHR() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.response = '';
    this.responseType = '';
    this.responseURL = '';
    this.responseXML = null;
    this.timeout = 0;
    this.withCredentials = false;
    this.upload = { addEventListener() { }, removeEventListener() { } };
    this.onreadystatechange = null;
    this.onloadstart = null;
    this.onprogress = null;
    this.onabort = null;
    this.onerror = null;
    this.onload = null;
    this.ontimeout = null;
    this.onloadend = null;
    this.__headers = [];
    this.__method = null;
    this.__url = null;
    this.__body = null;
  }
  XHR.UNSENT = 0; XHR.OPENED = 1; XHR.HEADERS_RECEIVED = 2; XHR.LOADING = 3; XHR.DONE = 4;
  XHR.prototype.open = function (m, u, async, user, pw) {
    this.__method = m; this.__url = u; this.readyState = 1;
    trace('[nativeXHR.open]', String(m), String(u));
  };
  XHR.prototype.setRequestHeader = function (k, v) {
    this.__headers.push([k, v]);
    trace('[nativeXHR.setRequestHeader]', String(k), String(v));
  };
  XHR.prototype.send = function (body) {
    this.__body = body;
    trace('[nativeXHR.send]', typeof body, String(body).slice(0, 120));
  };
  XHR.prototype.abort = function () { trace('[nativeXHR.abort]'); };
  XHR.prototype.getAllResponseHeaders = function () { return 'content-type: application/json\r\n'; };
  XHR.prototype.getResponseHeader = function (n) { return String(n).toLowerCase() === 'content-type' ? 'application/json' : null; };
  XHR.prototype.overrideMimeType = function () { };
  XHR.prototype.addEventListener = function () { };
  XHR.prototype.removeEventListener = function () { };
  XHR.prototype.dispatchEvent = function () { return true; };
  return XHR;
}

function makeSandbox() {
  const store = new Map();
  const logs = [];
  const sandbox = {
    console: {
      log: (...a) => logs.push(['log', a.map(String).join(' ')]),
      warn: (...a) => logs.push(['warn', a.map(String).join(' ')]),
      error: (...a) => logs.push(['error', a.map(String).join(' ')]),
      info: () => { }, debug: () => { },
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError, SyntaxError,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    URL, URLSearchParams, TextEncoder, TextDecoder,
    Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
    Uint8Array, Int8Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
  };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  sandbox.top = sandbox; sandbox.parent = sandbox;
  sandbox.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    platform: 'Win32', vendor: '', language: 'zh-CN', languages: ['zh-CN', 'zh'],
    hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false,
    plugins: { length: 5 }, mimeTypes: { length: 2 },
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    sendBeacon: () => true,
  };
  sandbox.location = {
    href: 'https://www.dewu.com/', hostname: 'www.dewu.com', host: 'www.dewu.com',
    protocol: 'https:', origin: 'https://www.dewu.com', pathname: '/', search: '', hash: '',
    reload() { }, replace() { }, toString() { return 'https://www.dewu.com/'; }
  };
  sandbox.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } };
  const el = () => ({
    style: {}, dataset: {}, setAttribute() { }, getAttribute: () => null, appendChild() { },
    removeChild() { }, addEventListener() { }, removeEventListener() { }, getContext: () => null,
    contentWindow: sandbox, contentDocument: sandbox.document,
    attachEvent() { }, detachEvent() { }, insertAdjacentHTML() { }, remove() { },
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=', width: 300, height: 150,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150 }),
    offsetHeight: 150, offsetWidth: 300, clientHeight: 150, clientWidth: 300, scrollHeight: 150, scrollWidth: 300
  });
  sandbox.document = {
    createElement: el, createTextNode: el,
    documentElement: Object.assign(el(), { style: {}, clientWidth: 1920, clientHeight: 980 }),
    head: el(), body: Object.assign(el(), { clientWidth: 1920, clientHeight: 980 }),
    cookie: '', compatMode: 'CSS1Compat', readyState: 'complete', visibilityState: 'visible', hidden: false,
    addEventListener() { }, removeEventListener() { }, hasFocus: () => true,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    getElementsByTagName: () => [], referrer: '', title: '得物App-新一代潮流网购社区',
    location: sandbox.location, characterSet: 'UTF-8', contentType: 'text/html',
  };
  sandbox.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
    key: i => [...store.keys()][i] || null,
    get length() { return store.size; }
  };
  sandbox.sessionStorage = sandbox.localStorage;
  sandbox.performance = { now: () => Date.now() - 1000, timing: { navigationStart: Date.now() - 1000 }, navigation: { type: 0, redirectCount: 0 } };
  sandbox.crypto = { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; }, subtle: {} };
  sandbox.XMLHttpRequest = makeRealisticXHR();
  sandbox.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) });
  sandbox.WebSocket = function () { this.send = () => { }; this.close = () => { }; };
  sandbox.Image = function () { this.src = ''; };
  sandbox.addEventListener = () => { }; sandbox.removeEventListener = () => { };
  sandbox.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  sandbox.alert = () => { }; sandbox.matchMedia = () => ({ matches: false, addListener() { } });
  sandbox.chrome = { runtime: {} };
  sandbox.__logs = logs; sandbox.__store = store;
  return sandbox;
}

const sandbox = makeSandbox();
const baseline = new Set(Object.keys(sandbox));
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(code, ctx, { filename: 'pceptor.000.eval.js', timeout: 20000 });
  console.log('[OK] executed');
} catch (e) {
  console.log('[THROW]', e && e.constructor && e.constructor.name, '-', String(e && e.message).slice(0, 200));
  console.log(String(e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}
console.log('\n[new globals]', Object.keys(sandbox).filter(k => !baseline.has(k)).join(', '));
console.log('[store]', [...sandbox.__store.entries()].map(([k, v]) => k + '=' + String(v).slice(0, 40)));
console.log('[logs]'); for (const [l, t] of sandbox.__logs) console.log('  ', l, t.slice(0, 160));
console.log('\n[trace]'); for (const t of TRACE.slice(0, 40)) console.log('  ', t.slice(0, 200));

// 试着构造包装后的 XHR
console.log('\n=== 试着 new XMLHttpRequest() ===');
try {
  const x = new sandbox.XMLHttpRequest();
  console.log('constructed ok, own keys:', Object.getOwnPropertyNames(x).slice(0, 30).join(','));
  console.log('typeof x.open', typeof x.open, '| typeof x.send', typeof x.send);
} catch (e) {
  console.log('construct threw:', e && e.constructor && e.constructor.name, String(e && e.message).slice(0, 200));
}
