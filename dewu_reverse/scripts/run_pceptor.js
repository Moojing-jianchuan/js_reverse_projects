/**
 * 探针：把 unpacked 源码在 vm 沙箱里跑起来，枚举挂上去的全局，并尝试实例化 _yundunxhr。
 * 用法: node scripts/run_pceptor.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
const SRC = process.env.PCEPTOR_SRC || path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js');
const code = fs.readFileSync(SRC, 'utf8');

function makeSandbox() {
  const store = new Map();
  const log = [];
  const sandbox = {
    console: {
      log: (...a) => { log.push(['log', a.map(String).join(' ')]); },
      warn: (...a) => { log.push(['warn', a.map(String).join(' ')]); },
      error: (...a) => { log.push(['error', a.map(String).join(' ')]); },
      info: () => { }, debug: () => { },
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError, SyntaxError,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    URL, URLSearchParams,
    TextEncoder, TextDecoder,
    Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
    Uint8Array, Int8Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
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
  sandbox.crypto = { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } };
  sandbox.XMLHttpRequest = function () {
    this.open = () => { }; this.send = () => { }; this.setRequestHeader = () => { };
    this.getAllResponseHeaders = () => ''; this.addEventListener = () => { };
  };
  sandbox.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) });
  sandbox.WebSocket = function () { this.send = () => { }; this.close = () => { }; };
  sandbox.Image = function () { this.src = ''; };
  sandbox.addEventListener = () => { }; sandbox.removeEventListener = () => { };
  sandbox.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  sandbox.alert = () => { }; sandbox.matchMedia = () => ({ matches: false, addListener() { } });
  sandbox.chrome = { runtime: {} };
  sandbox.__log = log;
  sandbox.__store = store;
  return sandbox;
}

const sandbox = makeSandbox();
const baseline = new Set(Object.keys(sandbox));
const nativeXHR = sandbox.XMLHttpRequest;
const ctx = vm.createContext(sandbox);

try {
  vm.runInContext(code, ctx, { filename: 'pceptor.000.eval.js', timeout: 20000 });
  console.log('[OK] executed');
} catch (e) {
  console.log('[THROW]', e && e.constructor && e.constructor.name, '-', String(e && e.message).slice(0, 200));
  console.log(String(e && e.stack || '').split('\n').slice(0, 8).join('\n'));
}
const added = Object.keys(sandbox).filter(k => !baseline.has(k));
console.log('\n[new globals]', added.join(', '));
for (const k of added) {
  let v;
  try { v = sandbox[k]; } catch (e) { v = '<getter throw>'; }
  console.log('  ', k, '::', typeof v, typeof v === 'function' ? `name=${v.name} len=${v.length}` : (v && typeof v === 'object' ? 'keys=' + Object.keys(v).slice(0, 8).join('/') : JSON.stringify(String(v)).slice(0, 60)));
}
console.log('\n[XMLHttpRequest after]', typeof sandbox.XMLHttpRequest, 'same as native stub?', sandbox.XMLHttpRequest === nativeXHR);
console.log('[toString]', String(sandbox.XMLHttpRequest).slice(0, 200));
console.log('[store]', [...sandbox.__store.keys()]);
console.log('[console log]');
for (const [lvl, t] of sandbox.__log) console.log('  ', lvl, t.slice(0, 200));
