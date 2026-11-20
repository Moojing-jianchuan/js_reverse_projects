/**
 * pceptor 运行环境（Node vm，无浏览器）
 * ---------------------------------------------------------------
 * 目标：给 yundun / pceptor 风控 SDK 一个足以完成初始化的沙箱，并把
 *  - 底层原生 XHR（模拟浏览器 XMLHttpRequest）
 *  - document.cookie / localStorage
 *  - 随机源 / 时间
 * 全部做成可观测、可注入的。
 *
 * 只做"读值补齐"，不做指纹伪装；沙箱里读不到的浏览器能力按缺失处理。
 */
'use strict';
const vm = require('vm');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

/* ------------------------------------------------------------------ */
/* Cookie jar                                                          */
/* ------------------------------------------------------------------ */
class CookieJar {
  constructor(init) {
    this.map = new Map();
    this.writes = [];
    if (init) for (const [k, v] of Object.entries(init)) this.map.set(k, v);
  }
  get cookie() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  set cookie(str) {
    const first = String(str).split(';')[0];
    const eq = first.indexOf('=');
    if (eq < 0) return;
    const k = first.slice(0, eq).trim();
    const v = first.slice(eq + 1).trim();
    this.writes.push([k, v]);
    this.map.set(k, v);
  }
  get(k) { return this.map.has(k) ? this.map.get(k) : null; }
  set(k, v) { this.map.set(k, v); }
}

/* document.all 是浏览器里的 "undetectable" 对象：typeof === 'undefined' 但不是 null。
 * 用 V8 的 %GetUndetectable() 取真身；取不到时退化为普通对象并记录。 */
function makeDocumentAll(vmMod) {
  try {
    require('v8').setFlagsFromString('--allow-natives-syntax');
    const o = vmMod.runInNewContext('%GetUndetectable()', {});
    if (typeof o === 'undefined' && o !== null) return { all: o, exact: true };
  } catch (e) { }
  const o = { length: 0, item: () => null, namedItem: () => null };
  return { all: o, exact: false };
}

/* ------------------------------------------------------------------ */
/* 原生 XHR 模拟：记录 open/setRequestHeader/send，并可注入响应          */
/* ------------------------------------------------------------------ */
function makeNativeXHR(recorder) {
  function XMLHttpRequest() {
    // 注意：SDK 的包装器用 for..in 枚举实例属性来代理，这里保持全部可枚举
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.response = '';
    this.responseXML = null;
    this.responseType = '';
    this.responseURL = '';
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
    this.__id = recorder.nextId();
    this.__method = null;
    this.__url = null;
    this.__reqHeaders = [];
    this.__body = null;
    this.__listeners = {};
    recorder.instances.push(this);
  }
  XMLHttpRequest.UNSENT = 0;
  XMLHttpRequest.OPENED = 1;
  XMLHttpRequest.HEADERS_RECEIVED = 2;
  XMLHttpRequest.LOADING = 3;
  XMLHttpRequest.DONE = 4;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__method = method;
    this.__url = url;
    this.readyState = 1;
    recorder.push('open', this.__id, [method, url]);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    this.__reqHeaders.push([k, v]);
    recorder.push('setRequestHeader', this.__id, [k, v]);
  };
  XMLHttpRequest.prototype.send = function (body) {
    this.__body = body;
    recorder.push('send', this.__id, [body]);
    recorder.onSend && recorder.onSend(this);
  };
  XMLHttpRequest.prototype.abort = function () { recorder.push('abort', this.__id, []); };
  XMLHttpRequest.prototype.getAllResponseHeaders = function () {
    return 'content-type: application/json\r\n';
  };
  XMLHttpRequest.prototype.getResponseHeader = function (n) {
    return String(n).toLowerCase() === 'content-type' ? 'application/json' : null;
  };
  XMLHttpRequest.prototype.overrideMimeType = function () { };
  XMLHttpRequest.prototype.addEventListener = function (type, fn) {
    (this.__listeners[type] = this.__listeners[type] || []).push(fn);
  };
  XMLHttpRequest.prototype.removeEventListener = function (type, fn) {
    const a = this.__listeners[type];
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  };
  XMLHttpRequest.prototype.dispatchEvent = function (ev) {
    const type = ev && ev.type;
    if (type && typeof this['on' + type] === 'function') this['on' + type](ev);
    for (const fn of this.__listeners[type] || []) fn(ev);
    return true;
  };
  return XMLHttpRequest;
}

/* ------------------------------------------------------------------ */
/* 沙箱                                                                */
/* ------------------------------------------------------------------ */
function makeEnv(opts = {}) {
  const recorder = {
    seq: 0,
    instances: [],
    events: [],
    fetchCalls: [],
    nextId() { return ++this.seq; },
    onSend: opts.onSend || null,
    push(kind, id, args) { this.events.push({ kind, id, args }); },
  };

  const store = new Map(Object.entries(opts.storage || {}));
  const storageLog = [];
  const jar = new CookieJar(opts.cookies);
  const consoleLog = [];

  const sandbox = {
    console: {
      log: (...a) => consoleLog.push(['log', a.map(String).join(' ')]),
      warn: (...a) => consoleLog.push(['warn', a.map(String).join(' ')]),
      error: (...a) => consoleLog.push(['error', a.map(String).join(' ')]),
      info: (...a) => consoleLog.push(['info', a.map(String).join(' ')]),
      debug: () => { },
    },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError, SyntaxError, EvalError, URIError,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    URL, URLSearchParams, TextEncoder, TextDecoder,
    Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
    Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Float32Array, Float64Array,
    ArrayBuffer, DataView,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;

  /* plugins 要"能点出 .name/.description/.filename"：SDK 的签名载荷里会采样它 */
  const pluginDefs = opts.plugins || [
    ['PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer'],
    ['Chrome PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer'],
    ['Chromium PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer'],
    ['Microsoft Edge PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer'],
    ['WebKit built-in PDF', 'Portable Document Format', 'internal-pdf-viewer'],
  ];
  const plugins = pluginDefs.map(([name, description, filename]) => ({ name, description, filename, length: 0 }));
  plugins.item = i => plugins[i] || null;
  plugins.namedItem = n => plugins.find(p => p.name === n) || null;
  plugins.refresh = () => { };
  sandbox.navigator = {
    userAgent: opts.userAgent || UA,
    appName: 'Netscape', appCodeName: 'Mozilla', appVersion: '5.0 (Windows)',
    platform: 'Win32', vendor: '', vendorSub: '', productSub: '20100101', product: 'Gecko',
    language: 'zh-CN', languages: ['zh-CN', 'zh'],
    hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false,
    plugins,
    mimeTypes: { length: 2, item: () => null, namedItem: () => null },
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    cookieEnabled: true, onLine: true, doNotTrack: null,
    sendBeacon: () => true,
  };
  sandbox.location = {
    href: 'https://www.dewu.com/',
    hostname: 'www.dewu.com', host: 'www.dewu.com', port: '',
    protocol: 'https:', origin: 'https://www.dewu.com',
    pathname: '/', search: '', hash: '',
    reload() { }, replace() { }, assign() { },
    toString() { return 'https://www.dewu.com/'; },
  };

  /* --- <script> 注入支持 -------------------------------------------
   * SDK 把加密模块当成外链脚本注入：
   *   s = document.createElement('script'); s.src = 'https://davstatic.dewu.com/preinforce2.js';
   *   s.onload = () => resolve(window.fun);  document.head.appendChild(s);
   * 沙箱里由 opts.resolveScript(url) 用本地文件顶替该 URL，执行后回调 onload。
   * ----------------------------------------------------------------- */
  let runner = null;               // 由调用方在 createContext 之后填充
  const scripts = [];
  function attachNode(parent, child) {
    if (child && (child.tagName === 'SCRIPT' || child.tagName === 'STYLE')) {
      scripts.push({ src: child.__src || null, inline: !!child.textContent });
      setTimeout(() => {
        let err = null;
        try {
          if (child.__src) {
            const src = (opts.resolveScript && opts.resolveScript(child.__src)) || null;
            if (src == null) throw new Error('no local substitute for script src: ' + child.__src);
            if (runner) runner(src, child.__src);
          } else if (child.textContent && runner) {
            runner(child.textContent, 'inline-script');
          }
        } catch (e) {
          err = e;
          consoleLog.push(['error', 'script exec: ' + e.message]);
        }
        try {
          if (err) { child.onerror && child.onerror({ type: 'error', target: child }); }
          else { child.onload && child.onload({ type: 'load', target: child }); }
        } catch (e) { consoleLog.push(['error', 'script onload: ' + e.message]); }
      }, 0);
    }
    return child;
  }

  const makeEl = (tag) => {
    const e = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, dataset: {}, classList: { add() { }, remove() { }, contains: () => false },
      children: [], childNodes: [], textContent: '',
      setAttribute() { }, getAttribute: () => null, removeAttribute() { },
      appendChild(c) { e.children.push(c); if (e.tagName === 'SCRIPT') e.textContent += String(c && (c.textContent || c.nodeValue) || ''); return c; },
      removeChild(c) { return c; }, insertBefore(c) { return c; },
      addEventListener() { }, removeEventListener() { }, dispatchEvent: () => true,
      getContext: () => null, toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',      getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150 }),
      width: 300, height: 150,
      offsetHeight: 150, offsetWidth: 300, offsetTop: 0, offsetLeft: 0,
      clientHeight: 150, clientWidth: 300,
      scrollHeight: 150, scrollWidth: 300, scrollTop: 0, scrollLeft: 0,
      attachEvent() { }, detachEvent() { }, insertAdjacentHTML() { }, remove() { },
      cloneNode() { return makeEl(); }, contains: () => false,
      querySelector: () => null, querySelectorAll: () => [],
      focus() { }, blur() { }, click() { },
    };
    e.contentWindow = sandbox;
    e.contentDocument = sandbox.document;
    if (e.tagName === 'SCRIPT') {
      e.type = 'text/javascript';
      e.async = true;
      e.defer = false;
      Object.defineProperty(e, 'src', {
        get() { return e.__src || ''; },
        set(v) { e.__src = String(v); },
        configurable: true, enumerable: true,
      });
    }
    return e;
  };
  const headEl = makeEl('head');
  headEl.appendChild = function (c) { return attachNode(headEl, c); };
  const bodyEl = makeEl('body');
  bodyEl.appendChild = function (c) { return attachNode(bodyEl, c); };
  const __docAll = makeDocumentAll(vm);
  sandbox.document = {
    createElement: makeEl,
    createElementNS: makeEl,
    createTextNode: t => ({ nodeValue: t, textContent: t, tagName: '#TEXT' }),
    createDocumentFragment: makeEl,
    documentElement: makeEl('html'),
    head: headEl,
    body: bodyEl,
    get cookie() { return jar.cookie; },
    set cookie(v) { jar.cookie = v; },
    compatMode: 'CSS1Compat',
    readyState: 'complete',
    visibilityState: 'visible',
    hidden: false,
    addEventListener() { }, removeEventListener() { }, dispatchEvent: () => true,
    hasFocus: () => true,
    querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, getElementsByTagName: () => [], getElementsByClassName: () => [],
    referrer: 'https://www.dewu.com/', title: '得物App-新一代潮流网购社区',
    location: sandbox.location,
    characterSet: 'UTF-8', charset: 'UTF-8', contentType: 'text/html',
    URL: 'https://www.dewu.com/',
    all: __docAll.all,
    __documentAllExact: __docAll.exact,
  };
  sandbox.screen = {
    width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, availLeft: 0, availTop: 0,
    colorDepth: 24, pixelDepth: 24,
    orientation: { type: 'landscape-primary', angle: 0 },
  };
  sandbox.localStorage = {
    getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { storageLog.push(['set', String(k), String(v)]); store.set(String(k), String(v)); },
    removeItem: k => { storageLog.push(['remove', String(k)]); store.delete(String(k)); },
    clear: () => { storageLog.push(['clear']); store.clear(); },
    key: i => [...store.keys()][i] || null,
    get length() { return store.size; },
  };
  sandbox.sessionStorage = {
    getItem: k => null, setItem() { }, removeItem() { }, clear() { }, key: () => null, length: 0,
  };
  sandbox.performance = {
    now: () => Date.now() - (opts.timeOrigin || 1000),
    timeOrigin: Date.now() - (opts.timeOrigin || 1000),
    timing: { navigationStart: Date.now() - (opts.timeOrigin || 1000) },
    navigation: { type: 0, redirectCount: 0 },
    mark() { }, measure() { }, getEntries: () => [], getEntriesByType: () => [],
  };
  sandbox.crypto = {
    getRandomValues: a => {
      for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
      return a;
    },
    randomUUID: () => require('crypto').randomUUID(),
    subtle: {},
  };
  sandbox.XMLHttpRequest = makeNativeXHR(recorder);
  /* fetch：记录调用；默认返回空响应，可用 opts.fetchImpl 换成真实实现（联网用） */
  sandbox.fetch = function (input, init) {
    const req = (input && typeof input === 'object' && input.url) ? input : null;
    const url = req ? req.url : String(input);
    const hdrs = (init && init.headers) || (req && req.headers) || null;
    let hdrObj = null;
    try {
      if (hdrs) {
        hdrObj = {};
        if (hdrs._m && typeof hdrs._m.forEach === 'function') hdrs._m.forEach((v, k) => { hdrObj[k] = v; });
        else if (typeof hdrs.forEach === 'function') hdrs.forEach((v, k) => { hdrObj[k] = v; });
        else if (typeof hdrs === 'object') for (const k of Object.keys(hdrs)) hdrObj[k] = hdrs[k];
      }
    } catch (e) { hdrObj = { __err: String(e.message) }; }
    const bodyVal = (init && init.body !== undefined) ? init.body : (req && req.body);
    const rec = {
      id: recorder.nextId(),
      url,
      method: (init && init.method) || (req && req.method) || 'GET',
      headers: hdrObj,
      body: bodyVal,
      credentials: (init && init.credentials) || (req && req.credentials),
      isRequestObject: !!req,
    };
    recorder.fetchCalls.push(rec);
    recorder.push('fetch', rec.id, [url, rec.method, JSON.stringify(hdrObj), bodyVal]);
    if (opts.fetchImpl) return opts.fetchImpl(url, { method: rec.method, headers: hdrObj, body: bodyVal, credentials: rec.credentials }, rec);
    const text = opts.fetchText || '{}';
    return Promise.resolve({
      ok: true, status: 200, url,
      text: () => Promise.resolve(text),
      json: () => Promise.resolve(JSON.parse(text === '{}' ? '{}' : text)),
      clone() { return this; },
      headers: { get: () => null },
    });
  };
  sandbox.WebSocket = function () { this.send = () => { }; this.close = () => { }; };
  sandbox.Image = function () { this.src = ''; this.onload = null; this.onerror = null; };
  sandbox.addEventListener = () => { };
  sandbox.removeEventListener = () => { };
  sandbox.dispatchEvent = () => true;
  sandbox.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  sandbox.cancelAnimationFrame = id => clearTimeout(id);
  sandbox.alert = () => { };
  sandbox.matchMedia = () => ({ matches: false, addListener() { }, removeListener() { }, addEventListener() { } });
  sandbox.chrome = { runtime: {} };
  sandbox.name = '';
  sandbox.innerWidth = 1920; sandbox.innerHeight = 980;
  sandbox.outerWidth = 1920; sandbox.outerHeight = 1080;
  sandbox.devicePixelRatio = 1;
  sandbox.scrollX = 0; sandbox.scrollY = 0;
  sandbox.pageXOffset = 0; sandbox.pageYOffset = 0;
  sandbox.screenX = 0; sandbox.screenY = 0;
  sandbox.history = { length: 1, pushState() { }, replaceState() { }, back() { }, forward() { } };
  sandbox.AbortController = class AbortController { constructor() { this.signal = {}; } abort() { } };
  /* 事件对象：SDK 的响应拦截会 document.createEvent('Event') / new Event() */
  /* Fetch API 的最小实现：SDK 的 webSk 链路会 new Request(...) / new Headers(...) */
  sandbox.Headers = class Headers {
    constructor(init) {
      this._m = new Map();
      if (init) {
        if (Array.isArray(init)) for (const [k, v] of init) this._m.set(String(k).toLowerCase(), String(v));
        else for (const k of Object.keys(init)) this._m.set(String(k).toLowerCase(), String(init[k]));
      }
    }
    get(k) { return this._m.has(String(k).toLowerCase()) ? this._m.get(String(k).toLowerCase()) : null; }
    set(k, v) { this._m.set(String(k).toLowerCase(), String(v)); }
    append(k, v) { this.set(k, v); }
    has(k) { return this._m.has(String(k).toLowerCase()); }
    delete(k) { this._m.delete(String(k).toLowerCase()); }
    forEach(fn) { this._m.forEach((v, k) => fn(v, k)); }
    entries() { return this._m.entries(); }
  };
  sandbox.Request = class Request {
    constructor(input, init) {
      const i = init || {};
      this.url = typeof input === 'string' ? input : (input && input.url) || String(input);
      this.method = (i.method || (input && input.method) || 'GET').toUpperCase();
      this.headers = new sandbox.Headers(i.headers || (input && input.headers));
      this.body = i.body !== undefined ? i.body : (input && input.body);
      this.credentials = i.credentials || 'same-origin';
      this.mode = i.mode || 'cors';
    }
    clone() { return new sandbox.Request(this.url, { method: this.method, headers: this.headers, body: this.body, credentials: this.credentials }); }
  };
  sandbox.Response = class Response {
    constructor(body, init) {
      const i = init || {};
      this._body = body === undefined ? '' : body;
      this.status = i.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new sandbox.Headers(i.headers);
      this.url = i.url || '';
    }
    text() { return Promise.resolve(String(this._body)); }
    json() { return Promise.resolve(JSON.parse(String(this._body))); }
    clone() { return new sandbox.Response(this._body, { status: this.status, headers: this.headers, url: this.url }); }
  };
  sandbox.Event = class Event {    constructor(type, init) {
      this.type = type;
      this.bubbles = !!(init && init.bubbles);
      this.cancelable = !!(init && init.cancelable);
      this.target = null;
      this.currentTarget = null;
      this.defaultPrevented = false;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { }
    stopImmediatePropagation() { }
  };
  sandbox.CustomEvent = class CustomEvent extends sandbox.Event {
    constructor(type, init) { super(type, init); this.detail = init && init.detail; }
  };
  sandbox.MessageEvent = sandbox.CustomEvent;
  sandbox.document.createEvent = function (kind) {
    const ev = new sandbox.Event(String(kind || 'Event').toLowerCase() === 'customevent' ? 'custom' : '');
    ev.initEvent = function (type, bubbles, cancelable) { ev.type = type; ev.bubbles = !!bubbles; ev.cancelable = !!cancelable; };
    ev.initCustomEvent = function (type, bubbles, cancelable, detail) { ev.type = type; ev.detail = detail; };
    return ev;
  };
  sandbox.document.createEventObject = () => ({ type: '' });
  sandbox.Blob = class Blob { constructor(a) { this.parts = a; } };
  sandbox.FormData = class FormData {
    constructor() { this._d = []; }
    append(k, v) { this._d.push([k, v]); }
  };

  sandbox.__recorder = recorder;
  sandbox.__store = store;
  sandbox.__storageLog = storageLog;
  sandbox.__jar = jar;
  sandbox.__consoleLog = consoleLog;

  const ctx = vm.createContext(sandbox);
  runner = (code, name) => vm.runInContext(code, ctx, { filename: String(name || 'dynamic-script').slice(0, 80), timeout: opts.scriptTimeout || 30000 });
  return { sandbox, ctx, recorder, store, storageLog, jar, consoleLog, scripts, runScript: runner };
}

module.exports = { makeEnv, CookieJar, makeNativeXHR, UA };
