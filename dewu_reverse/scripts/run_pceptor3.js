/**
 * 探针 3：定位 "Cannot redefine property: undefined" 的根因。
 * 用 defineProperty 包装器打印 (目标是否全局, 属性名)。
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
const code = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');

const events = [];
function makeSandbox() {
  const store = new Map();
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
  sb.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    platform: 'Win32', vendor: '', language: 'zh-CN', languages: ['zh-CN', 'zh'],
    hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, plugins: { length: 5 }, mimeTypes: { length: 2 },
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 }, sendBeacon: () => true,
  };
  sb.location = { href: 'https://www.dewu.com/', hostname: 'www.dewu.com', host: 'www.dewu.com', protocol: 'https:', origin: 'https://www.dewu.com', pathname: '/', search: '', hash: '', reload() { }, replace() { }, toString() { return 'https://www.dewu.com/'; } };
  sb.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } };
  const el = () => ({ style: {}, dataset: {}, setAttribute() { }, getAttribute: () => null, appendChild() { }, removeChild() { }, addEventListener() { }, removeEventListener() { }, getContext: () => null, contentWindow: sb, contentDocument: sb.document, attachEvent() { }, detachEvent() { }, insertAdjacentHTML() { }, remove() { }, toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=', width: 300, height: 150, getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150 }), offsetHeight: 150, offsetWidth: 300, clientHeight: 150, clientWidth: 300, scrollHeight: 150, scrollWidth: 300 });
  sb.document = { createElement: el, createTextNode: el, documentElement: Object.assign(el(), { style: {}, clientWidth: 1920, clientHeight: 980 }), head: el(), body: Object.assign(el(), { clientWidth: 1920, clientHeight: 980 }), cookie: '', compatMode: 'CSS1Compat', readyState: 'complete', visibilityState: 'visible', hidden: false, addEventListener() { }, removeEventListener() { }, hasFocus: () => true, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, getElementsByTagName: () => [], referrer: '', title: 'dewu', location: sb.location, characterSet: 'UTF-8', contentType: 'text/html' };
  sb.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), key: i => [...store.keys()][i] || null, get length() { return store.size; } };
  sb.sessionStorage = sb.localStorage;
  sb.performance = { now: () => Date.now() - 1000, timing: { navigationStart: Date.now() - 1000 }, navigation: { type: 0, redirectCount: 0 } };
  sb.crypto = { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; }, subtle: {} };
  // 真实感 XHR：注意 for..in 需能枚举出属性
  function XHR() {
    this.readyState = 0; this.status = 0; this.statusText = ''; this.responseText = ''; this.response = '';
    this.responseType = ''; this.responseURL = ''; this.timeout = 0; this.withCredentials = false;
    this.upload = {}; this.onreadystatechange = null; this.onload = null; this.onerror = null;
    this.onabort = null; this.ontimeout = null; this.onprogress = null; this.onloadstart = null; this.onloadend = null;
  }
  XHR.prototype.open = function () { }; XHR.prototype.send = function () { }; XHR.prototype.setRequestHeader = function () { };
  XHR.prototype.abort = function () { }; XHR.prototype.getAllResponseHeaders = function () { return ''; };
  XHR.prototype.getResponseHeader = function () { return null; }; XHR.prototype.overrideMimeType = function () { };
  XHR.prototype.addEventListener = function () { }; XHR.prototype.removeEventListener = function () { }; XHR.prototype.dispatchEvent = function () { return true; };
  sb.XMLHttpRequest = XHR;
  sb.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) });
  sb.WebSocket = function () { this.send = () => { }; this.close = () => { }; };
  sb.Image = function () { this.src = ''; };
  sb.addEventListener = () => { }; sb.removeEventListener = () => { };
  sb.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  sb.alert = () => { }; sb.matchMedia = () => ({ matches: false, addListener() { } }); sb.chrome = { runtime: {} };
  sb.__events = events; sb.__store = store;
  return sb;
}

const sandbox = makeSandbox();
const ctx = vm.createContext(sandbox);

// 记录 defineProperty 调用
const patched = function (target, key, desc) {
  try {
    const isGlobal = target === sandbox || target === sandbox.window || target === vm.runInContext('globalThis', ctx);
    events.push(['defineProperty', String(key), isGlobal ? 'GLOBAL' : (target && target.constructor ? (target.constructor.name || '?') : typeof target)]);
  } catch (e) { }
  return Object.defineProperty(target, key, desc);
};
for (const k of Object.getOwnPropertyNames(Object)) { }
sandbox.Object = Object; // 同 realm，直接改会污染宿主，改用沙箱内注入
// 在沙箱内注入包装
vm.runInContext('__wrapDefine()', ctx);

