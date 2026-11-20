/**
 * 探针 4：直接包装宿主的 Object.defineProperty（沙箱共享宿主 Object），打印每一次调用的 key 与目标。
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
const code = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');

const store = new Map();
const events = [];
const sb = {
  console: { log: () => { }, warn: () => { }, error: () => { }, info: () => { }, debug: () => { } },
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
sb.globalThis = sb; sb.window = sb; sb.self = sb; sb.top = sb; sb.parent = sb;
sb.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0', platform: 'Win32', vendor: '', language: 'zh-CN', languages: ['zh-CN'], hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, plugins: { length: 5 }, mimeTypes: { length: 2 }, sendBeacon: () => true };
sb.location = { href: 'https://www.dewu.com/', hostname: 'www.dewu.com', protocol: 'https:', pathname: '/', reload() { }, replace() { }, toString() { return 'https://www.dewu.com/'; } };
sb.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 };
const el = () => ({ style: {}, dataset: {}, setAttribute() { }, getAttribute: () => null, appendChild() { }, removeChild() { }, addEventListener() { }, removeEventListener() { }, getContext: () => null, toDataURL: () => 'data:image/png;base64,', width: 300, height: 150, contentWindow: sb, getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 150, top: 0, left: 0 }), offsetHeight: 150, offsetWidth: 300 });
sb.document = { createElement: el, documentElement: el(), head: el(), body: el(), cookie: '', compatMode: 'CSS1Compat', readyState: 'complete', visibilityState: 'visible', addEventListener() { }, removeEventListener() { }, hasFocus: () => true, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, getElementsByTagName: () => [], title: 'dewu' };
sb.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), key: i => [...store.keys()][i] || null, get length() { return store.size; } };
sb.sessionStorage = sb.localStorage;
sb.performance = { now: () => Date.now(), timing: {}, navigation: {} };
sb.crypto = { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0; return a; }, subtle: {} };
function XHR() {
  this.readyState = 0; this.status = 0; this.statusText = ''; this.responseText = ''; this.response = '';
  this.responseType = ''; this.responseURL = ''; this.timeout = 0; this.withCredentials = false;
  this.upload = {}; this.onreadystatechange = null; this.onload = null; this.onerror = null;
}
XHR.prototype.open = function () { }; XHR.prototype.send = function () { }; XHR.prototype.setRequestHeader = function () { };
sb.XMLHttpRequest = XHR;
sb.fetch = () => Promise.resolve({});
sb.WebSocket = function () { }; sb.Image = function () { };
sb.addEventListener = () => { }; sb.removeEventListener = () => { };
sb.requestAnimationFrame = cb => setTimeout(cb, 0);
sb.alert = () => { }; sb.matchMedia = () => ({ matches: false, addListener() { } }); sb.chrome = {};

const ctx = vm.createContext(sb);
const g = vm.runInContext('globalThis', ctx);

const origDP = Object.defineProperty;
let depth = 0;
Object.defineProperty = function (target, key, desc) {
  if (depth < 40) {
    depth++;
    try {
      const isG = target === g || target === sb;
      events.push({ key: String(key), target: isG ? 'GLOBAL' : (target === Object.prototype ? 'Object.prototype' : (target && target.constructor ? target.constructor.name : typeof target)), has: (() => { try { return Object.prototype.hasOwnProperty.call(target, key); } catch (e) { return 'err'; } })() });
    } catch (e) { }
    depth--;
  }
  return origDP(target, key, desc);
};

try {
  vm.runInContext(code, ctx, { filename: 'pceptor', timeout: 20000 });
  console.log('[OK] executed');
} catch (e) {
  console.log('[THROW]', String(e && e.message).slice(0, 200));
}
Object.defineProperty = origDP;
console.log('defineProperty events:', events.length);
for (const ev of events) console.log('  ', JSON.stringify(ev));
console.log('globals:', Object.keys(sb).filter(k => k.startsWith('_') || k === 'dw' || k === 'base64js' || k === 'XMLHttpRequest'));
