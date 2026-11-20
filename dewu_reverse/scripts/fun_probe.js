/**
 * 探针 1：在最小沙箱里加载 preinforce2.js，然后对挂载出来的 fun / base64js 做结构内省。
 * 目标：确定 fun 的类型、自有属性、原型方法、constructor 源码。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
const code = fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8');

function makeSandbox() {
  const sb = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError, SyntaxError,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    atob: s => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: s => Buffer.from(String(s), 'binary').toString('base64'),
    URL, URLSearchParams, TextEncoder, TextDecoder,
    Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
    Uint8Array, Int8Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
  };
  sb.globalThis = sb;
  sb.window = sb;
  sb.self = sb;
  sb.top = sb;
  sb.parent = sb;

  const store = new Map();
  sb.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    platform: 'Win32', vendor: '', language: 'zh-CN', languages: ['zh-CN', 'zh'],
    hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false,
    plugins: { length: 5 }, mimeTypes: { length: 2 },
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    sendBeacon: () => true,
  };
  sb.location = {
    href: 'https://www.dewu.com/', hostname: 'www.dewu.com', host: 'www.dewu.com',
    protocol: 'https:', origin: 'https://www.dewu.com', pathname: '/', search: '', hash: '',
    reload() { }, replace() { }, toString() { return 'https://www.dewu.com/'; }
  };
  const el = () => ({
    style: {}, dataset: {}, setAttribute() { }, getAttribute: () => null, appendChild() { },
    removeChild() { }, addEventListener() { }, removeEventListener() { }, getContext: () => null,
    contentWindow: sb, contentDocument: sb.document,
    attachEvent() { }, detachEvent() { }, insertAdjacentHTML() { }, remove() { },
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=', width: 300, height: 150,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150 }),
    offsetHeight: 150, offsetWidth: 300, clientHeight: 150, clientWidth: 300, scrollHeight: 150, scrollWidth: 300
  });
  sb.document = {
    createElement: el, createTextNode: el,
    documentElement: Object.assign(el(), { style: {}, clientWidth: 1920, clientHeight: 980 }),
    head: el(), body: Object.assign(el(), { clientWidth: 1920, clientHeight: 980 }),
    cookie: '', compatMode: 'CSS1Compat', readyState: 'complete', visibilityState: 'visible', hidden: false,
    addEventListener() { }, removeEventListener() { }, hasFocus: () => true,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    getElementsByTagName: () => [], referrer: '', title: '得物App-新一代潮流网购社区',
    location: sb.location, characterSet: 'UTF-8', contentType: 'text/html',
  };
  sb.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } };
  sb.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
    key: i => [...store.keys()][i] || null,
    get length() { return store.size; }
  };
  sb.sessionStorage = sb.localStorage;
  sb.performance = { now: () => Date.now() - 1000, timing: { navigationStart: Date.now() - 1000 }, navigation: { type: 0, redirectCount: 0 } };
  let rs = 0x12345678;
  sb.crypto = { getRandomValues: a => { for (let i = 0; i < a.length; i++) { rs = (rs * 1103515245 + 12345) & 0x7fffffff; a[i] = rs & 0xff; } return a; } };
  sb.XMLHttpRequest = function () {
    this.open = () => { }; this.send = () => { }; this.setRequestHeader = () => { };
    this.getAllResponseHeaders = () => ''; this.addEventListener = () => { };
  };
  sb.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) });
  sb.WebSocket = function () { this.send = () => { }; this.close = () => { }; };
  sb.Image = function () { this.src = ''; };
  sb.addEventListener = () => { }; sb.removeEventListener = () => { };
  sb.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  sb.alert = () => { }; sb.matchMedia = () => ({ matches: false, addListener() { } });
  sb.chrome = { runtime: {} };
  return sb;
}

const sb = makeSandbox();
const ctx = vm.createContext(sb);
try {
  vm.runInContext(code, ctx, { filename: 'preinforce2.js', timeout: 30000 });
  console.log('[OK] executed');
} catch (e) {
  console.log('[THROW]', e && e.message);
}

const g = k => { try { return sb[k]; } catch (e) { return '<err>'; } };
console.log('globals added:', Object.keys(sb).filter(k => !(k in globalThis)));
for (const name of ['fun', 'base64js', 'jsdVipUserMark']) {
  const v = g(name);
  console.log('\n===== ' + name + ' =====');
  console.log('typeof:', typeof v);
  if (v && (typeof v === 'object' || typeof v === 'function')) {
    console.log('Object.keys:', JSON.stringify(Object.keys(v)));
    console.log('getOwnPropertyNames:', JSON.stringify(Object.getOwnPropertyNames(v)));
    try { console.log('ownSymbols:', String(Object.getOwnPropertySymbols(v))); } catch (e) { }
    try {
      const d = Object.getOwnPropertyDescriptors(v);
      for (const [k, dd] of Object.entries(d)) {
        console.log('  desc', k, 'get=' + (typeof dd.get), 'value=' + (dd.value === undefined ? 'undefined' : typeof dd.value), 'enumerable=' + dd.enumerable);
      }
    } catch (e) { console.log('desc err', e.message); }
    try { console.log('proto names:', JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(v)))); } catch (e) { }
    try {
      const C = v.constructor;
      console.log('constructor type:', typeof C, 'name:', C && C.name, 'length:', C && C.length);
      console.log('String(constructor):', String(C).slice(0, 800));
      if (C) console.log('ctor proto names:', JSON.stringify(Object.getOwnPropertyNames(C.prototype || {})));
    } catch (e) { console.log('ctor err', e.message); }
    try { console.log('JSON:', JSON.stringify(v).slice(0, 500)); } catch (e) { console.log('json err', e.message); }
    try { console.log('String(v):', String(v).slice(0, 300)); } catch (e) { }
    try { console.log('toStringTag:', String(v[Symbol.toStringTag])); } catch (e) { }
  } else {
    console.log('value:', String(v).slice(0, 200));
  }
}
