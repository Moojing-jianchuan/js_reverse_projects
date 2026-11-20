/**
 * legacy_sandbox.js —— 与原 unpack.js 完全同构的沙箱（宿主内建 + 接管 eval/Function）。
 *
 * 为什么保留它：实测 JSDUN 的这三份脚本在这个环境里才是稳定的；
 * context 原生内建 + 假 Date 的"更干净"沙箱反而让它们的自检分支抖动。
 * 它用于「解码与出值」，原生性/反检测差异写进报告限制。
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

function makeLegacySandbox(opts = {}) {
  const trace = { calls: [] };
  const store = new Map(Object.entries(opts.localStorage || {}));
  const sstore = new Map(Object.entries(opts.sessionStorage || {}));

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

  sb.navigator = {
    userAgent: opts.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    appName: 'Netscape', appCodeName: 'Mozilla',
    platform: 'Win32', vendor: 'Google Inc.', vendorSub: '', product: 'Gecko', productSub: '20030107',
    language: 'zh-CN', languages: ['zh-CN', 'zh'], cookieEnabled: true, doNotTrack: null, onLine: true,
    hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, deviceMemory: 8, pdfViewerEnabled: true,
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
    removeChild() { }, addEventListener() { }, removeEventListener() { }, getContext: (k) => (k === 'webgl' || k === 'experimental-webgl') ? {
      getParameter: (p) => p === 0x1F00 ? 'Google Inc. (Intel)' : p === 0x1F01 ? 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' : (p === 0x1F02 ? 'WebGL 1.0' : 16),
      getExtension: () => null, getSupportedExtensions: () => [], getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
      createBuffer: () => ({}), bindBuffer() { }, bufferData() { },
    } : {
      canvas: {}, fillStyle: '#000', font: '10px sans-serif', textBaseline: 'alphabetic', globalAlpha: 1,
      save() { }, restore() { }, scale() { }, rotate() { }, translate() { }, beginPath() { }, closePath() { },
      moveTo() { }, lineTo() { }, arc() { }, fill() { }, stroke() { }, fillRect() { }, clearRect() { },
      fillText() { }, strokeText() { }, measureText: (t) => ({ width: String(t).length * 7 }),
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData() { }, drawImage() { }, createLinearGradient: () => ({ addColorStop() { } }),
      setTransform() { }, transform() { }
    },
    contentWindow: sb, contentDocument: sb.document,
    attachEvent() { }, detachEvent() { }, insertAdjacentHTML() { }, remove() { },
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    width: 300, height: 150,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150 }),
    offsetHeight: 150, offsetWidth: 300, clientHeight: 150, clientWidth: 300, scrollHeight: 150, scrollWidth: 300,
    getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [],
    focus() { }, blur() { }, click() { }, cloneNode() { return el(); },
  });
  sb.document = {
    createElement: el, createElementNS: el, createTextNode: el,
    documentElement: Object.assign(el(), { style: {}, clientWidth: 1920, clientHeight: 969 }),
    head: el(), body: Object.assign(el(), { clientWidth: 1920, clientHeight: 969 }),
    cookie: opts.cookie || '', compatMode: 'CSS1Compat', readyState: 'complete', visibilityState: 'visible', hidden: false,
    addEventListener() { }, removeEventListener() { }, hasFocus: () => true,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    getElementsByTagName: () => [], getElementsByClassName: () => [], getElementsByName: () => [],
    referrer: '', title: '得物App-新一代潮流网购社区', domain: 'www.dewu.com', URL: 'https://www.dewu.com/',
    location: sb.location, characterSet: 'UTF-8', charset: 'UTF-8', contentType: 'text/html',
    currentScript: null, write() { }, close() { }, elementFromPoint: () => null,
  };
  sb.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1032, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } };
  sb.outerWidth = 1920; sb.outerHeight = 969; sb.innerWidth = 1920; sb.innerHeight = 969;
  sb.devicePixelRatio = 1; sb.screenX = 0; sb.screenY = 0;
  const mkStorage = m => ({
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    key: i => [...m.keys()][i] || null,
    get length() { return m.size; }
  });
  sb.localStorage = mkStorage(store);
  sb.sessionStorage = mkStorage(sstore);
  sb.performance = { now: () => Date.now() - 1000, timing: { navigationStart: Date.now() - 1000 }, navigation: { type: 0, redirectCount: 0 }, timeOrigin: Date.now() - 1000, mark() { }, measure() { }, getEntriesByType: () => [] };
  let rs = (opts.rand || 0x12345678) >>> 0;
  const rnd = () => { rs = (rs * 1103515245 + 12345) >>> 0; return (rs >>> 8) / 16777216; };
  sb.crypto = {
    getRandomValues: a => {
      if (opts.deterministicRandom) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(rnd() * 256); return a; }
      const b = require('crypto').randomBytes(a.length);
      for (let i = 0; i < a.length; i++) a[i] = b[i];
      return a;
    },
    randomUUID: () => require('crypto').randomUUID(),
  };
  sb.__rnd = rnd;
  function XHR() {
    this.headers = {}; this.__url = null; this.__method = null; this.__body = null;
    this.readyState = 0; this.status = 0; this.responseText = ''; this.response = ''; this.withCredentials = false;
    this.open = (m, u) => { this.__method = m; this.__url = u; this.readyState = 1; trace.calls.push({ api: 'xhr.open', m: String(m), u: String(u) }); };
    this.setRequestHeader = (k, v) => { this.headers[k] = v; trace.calls.push({ api: 'xhr.setRequestHeader', k: String(k), v: String(v).slice(0, 500) }); };
    this.send = (b) => { this.__body = b; this.readyState = 4; trace.calls.push({ api: 'xhr.send', url: this.__url, body: typeof b === 'string' ? b.slice(0, 4000) : String(b) }); };
    this.getAllResponseHeaders = () => ''; this.getResponseHeader = () => null;
    this.addEventListener = () => { }; this.removeEventListener = () => { }; this.abort = () => { };
    this.upload = { addEventListener() { } };
  }
  sb.XMLHttpRequest = XHR;
  sb.fetch = (u, o) => {
    trace.calls.push({ api: 'fetch', u: String(u), body: o && typeof o.body === 'string' ? o.body.slice(0, 4000) : null });
    const res = { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}), clone() { return res; } };
    return Promise.resolve(res);
  };
  sb.Response = function (b, o) { this._b = b; Object.assign(this, o || {}); this.text = () => Promise.resolve(String(b)); };
  sb.Headers = function (h) { this._h = h || {}; this.get = k => this._h[k] || null; };
  sb.Request = function (u, o) { this.url = String(u); Object.assign(this, o || {}); };
  sb.WebSocket = function () { this.send = () => { }; this.close = () => { }; this.addEventListener = () => { }; };
  sb.Image = function () { this.src = ''; this.onload = null; this.onerror = null; this.addEventListener = () => { }; };
  sb.addEventListener = () => { }; sb.removeEventListener = () => { }; sb.dispatchEvent = () => true;
  sb.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  sb.cancelAnimationFrame = () => { };
  sb.alert = () => { }; sb.confirm = () => true; sb.prompt = () => '';
  sb.matchMedia = () => ({ matches: false, media: '', addListener() { }, removeListener() { }, addEventListener() { } });
  sb.chrome = { runtime: {}, app: {}, csi: null, loadTimes: null };
  sb.open = () => null; sb.close = () => { }; sb.focus = () => { }; sb.blur = () => { };
  sb.Notification = function () { }; sb.Worker = function () { }; sb.SharedWorker = function () { };
  sb.RTCPeerConnection = function () { }; sb.AudioContext = function () { }; sb.OfflineAudioContext = function () { };
  sb.indexedDB = { open: () => ({}) }; sb.caches = { open: () => Promise.resolve({}) };
  sb.history = { length: 2, pushState() { }, replaceState() { }, back() { }, forward() { } };
  sb.name = '';
  sb.__trace = trace;
  sb.Buffer = Buffer;
  return sb;
}

/** 建 context 并按需接管 eval/Function 落盘 */
function createLegacyContext(opts = {}) {
  const sb = makeLegacySandbox(opts);
  const ctx = vm.createContext(sb);
  if (opts.dumpDir) {
    const fsx = require('fs');
    const pathx = require('path');
    fsx.mkdirSync(opts.dumpDir, { recursive: true });
    let i = 0;
    const realEval = s => vm.runInContext(s, ctx, { filename: 'stage-' + i });
    sb.eval = function (src) { try { fsx.writeFileSync(pathx.join(opts.dumpDir, String(i).padStart(3, '0') + '.eval.js'), String(src)); } catch (e) { } i++; return realEval(src); };
    const RealFunction = Function;
    function HookedFunction(...args) { try { if (args.length) fsx.writeFileSync(pathx.join(opts.dumpDir, String(i).padStart(3, '0') + '.fn.js'), String(args[args.length - 1])); } catch (e) { } i++; return RealFunction(...args); }
    HookedFunction.prototype = RealFunction.prototype;
    sb.Function = HookedFunction;
  }
  return { sb, ctx, trace: sb.__trace };
}

module.exports = { makeLegacySandbox, createLegacyContext };
