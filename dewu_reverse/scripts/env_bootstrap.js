/**
 * env_bootstrap.js —— 在 vm context 内部执行的补环境引导脚本（以字符串形式注入）
 *
 * 为什么要"在 context 内部"：JSDUN 这类 VM 会用
 *   [].constructor.constructor('return this')()   /  Function('return this')()
 * 来拿到"干净的全局"。如果从宿主把 Array/String/JSON 注入沙箱，这些内建就是宿主 realm 的，
 * 上面的技巧就会拿到宿主 global，字符串表全部取不到 → 第二阶段解码出
 *   `(function (55,,415)undefined)()` 这种乱码 → SyntaxError。
 *
 * 所以：宿主只注入 console/timers/crypto 之类必需函数，内建一律用 context 自己的。
 */
'use strict';

function buildBootstrapSource(envJson) {
  return `
(function () {
  var ENV = ${envJson};
  var G = globalThis;
  var trace = { reads: [], calls: [] };
  G.__trace = trace;
  function rec(o) { if (trace.calls.length < ENV.traceLimit) trace.calls.push(o); }

  // ---------- 时间：固定初值 + 单步微小递增（不冻死，避免忙等循环步数爆炸） ----------
  var RealDate = Date;
  var T0 = ENV.time;
  var tick = 0;
  var STEP = ENV.timeStep || 1;
  function fakeNow() { tick += 1; return T0 + tick * STEP; }
  G.__T0 = T0;
  G.__ticks = function () { return tick; };
  function FakeDate(a, b, c, d, e, f, g) {
    if (!(this instanceof FakeDate)) return new RealDate(fakeNow()).toString();
    switch (arguments.length) {
      case 0: return new RealDate(fakeNow());
      case 1: return new RealDate(a);
      case 2: return new RealDate(a, b);
      case 3: return new RealDate(a, b, c);
      case 4: return new RealDate(a, b, c, d);
      case 5: return new RealDate(a, b, c, d, e);
      case 6: return new RealDate(a, b, c, d, e, f);
      default: return new RealDate(a, b, c, d, e, f, g);
    }
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return fakeNow(); };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  G.Date = FakeDate;

  // ---------- 随机 ----------
  var rs = ENV.rand >>> 0;
  G.__rnd = function () { rs = (rs * 1103515245 + 12345) >>> 0; return (rs >>> 8) / 16777216; };
  var RealMath = Math;
  G.__realMathRandom = G.__rnd;

  // ---------- 纯 JS base64 / TextEncoder（避免宿主 realm 内建泄漏） ----------
  var B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function btoaImpl(input) {
    var str = String(input), out = '';
    for (var i = 0; i < str.length; i += 3) {
      var c1 = str.charCodeAt(i) & 255;
      var c2 = i + 1 < str.length ? str.charCodeAt(i + 1) & 255 : NaN;
      var c3 = i + 2 < str.length ? str.charCodeAt(i + 2) & 255 : NaN;
      out += B64C.charAt(c1 >> 2);
      out += B64C.charAt(((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4));
      out += isNaN(c2) ? '=' : B64C.charAt(((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6));
      out += isNaN(c3) ? '=' : B64C.charAt(c3 & 63);
    }
    return out;
  }
  function atobImpl(input) {
    var str = String(input).replace(/[^A-Za-z0-9+/=]/g, ''), out = '';
    for (var i = 0; i < str.length; i += 4) {
      var e1 = B64C.indexOf(str.charAt(i)), e2 = B64C.indexOf(str.charAt(i + 1));
      var e3 = B64C.indexOf(str.charAt(i + 2)), e4 = B64C.indexOf(str.charAt(i + 3));
      out += String.fromCharCode((e1 << 2) | (e2 >> 4));
      if (e3 !== -1) out += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
      if (e4 !== -1) out += String.fromCharCode(((e3 & 3) << 6) | e4);
    }
    return out;
  }
  G.btoa = btoaImpl;
  G.atob = atobImpl;

  function TextEncoderPoly() { this.encoding = 'utf-8'; }
  TextEncoderPoly.prototype.encode = function (s) {
    s = String(s);
    var bytes = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c >= 0xd800 && c <= 0xdbff) {
        var c2 = s.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return new Uint8Array(bytes);
  };
  function TextDecoderPoly() { this.encoding = 'utf-8'; }
  TextDecoderPoly.prototype.decode = function (buf) {
    if (!buf) return '';
    var a = buf instanceof Uint8Array ? buf : new Uint8Array(buf.buffer || buf);
    var out = '', i = 0;
    while (i < a.length) {
      var b = a[i++];
      if (b < 0x80) out += String.fromCharCode(b);
      else if (b < 0xe0) out += String.fromCharCode(((b & 31) << 6) | (a[i++] & 63));
      else if (b < 0xf0) out += String.fromCharCode(((b & 15) << 12) | ((a[i++] & 63) << 6) | (a[i++] & 63));
      else {
        var cp = ((b & 7) << 18) | ((a[i++] & 63) << 12) | ((a[i++] & 63) << 6) | (a[i++] & 63);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
      }
    }
    return out;
  };
  G.TextEncoder = TextEncoderPoly;
  G.TextDecoder = TextDecoderPoly;
  G.URLSearchParams = G.URLSearchParams || function (s) {
    this._p = {}; var self2 = this;
    if (typeof s === 'string') s.replace(/^\\?/, '').split('&').forEach(function (kv) {
      if (!kv) return; var i2 = kv.indexOf('='); self2._p[decodeURIComponent(kv.slice(0, i2 < 0 ? kv.length : i2))] = i2 < 0 ? '' : decodeURIComponent(kv.slice(i2 + 1));
    });
    this.get = function (k) { return Object.prototype.hasOwnProperty.call(this._p, k) ? this._p[k] : null; };
    this.set = function (k, v) { this._p[k] = String(v); };
    this.append = this.set;
    this.toString = function () { return Object.keys(this._p).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(self2._p[k]); }).join('&'); };
  };

  // ---------- navigator ----------
  var nav = {};
  Object.keys(ENV.navigator).forEach(function (k) { nav[k] = ENV.navigator[k]; });
  nav.javaEnabled = function () { return false; };
  nav.sendBeacon = function () { return true; };
  nav.getBattery = undefined;
  Object.defineProperty(G, 'navigator', { value: nav, writable: true, configurable: true, enumerable: true });

  // ---------- screen / 几何 ----------
  G.screen = ENV.screen;
  ['outerWidth', 'outerHeight', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'screenX', 'screenY'].forEach(function (k) {
    G[k] = ENV.window[k];
  });

  // ---------- location/history ----------
  var HREF = ENV.href;
  G.location = {
    href: HREF, hostname: ENV.host, host: ENV.host, protocol: 'https:', origin: 'https://' + ENV.host,
    pathname: ENV.pathname, search: '', hash: '',
    reload: function () { rec({ api: 'location.reload' }); }, replace: function () { }, assign: function () { },
    toString: function () { return HREF; }
  };
  G.history = { length: 2, pushState: function () { }, replaceState: function () { }, back: function () { }, forward: function () { } };

  // ---------- DOM 桩 ----------
  function mkStyle() {
    var s = {};
    return new Proxy(s, {
      get: function (t, k) { return k in t ? t[k] : ''; },
      set: function (t, k, v) { t[k] = v; return true; }
    });
  }
  function mkCanvas(w, h) {
    var ctx2d = {
      canvas: null,
      fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif', textBaseline: 'alphabetic',
      globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1,
      save: function () { }, restore: function () { }, scale: function () { }, rotate: function () { }, translate: function () { },
      beginPath: function () { }, closePath: function () { }, moveTo: function () { }, lineTo: function () { },
      arc: function () { }, arcTo: function () { }, rect: function () { }, fill: function () { }, stroke: function () { },
      fillRect: function () { }, strokeRect: function () { }, clearRect: function () { }, clip: function () { },
      fillText: function () { }, strokeText: function () { }, measureText: function (t) { return { width: (String(t).length * 7) | 0 }; },
      drawImage: function () { }, setTransform: function () { }, transform: function () { },
      createLinearGradient: function () { return { addColorStop: function () { } }; },
      createRadialGradient: function () { return { addColorStop: function () { } }; },
      getImageData: function (x, y, w2, h2) { return { width: w2, height: h2, data: new Uint8ClampedArray(w2 * h2 * 4) }; },
      putImageData: function () { }, createImageData: function (w2, h2) { return { width: w2, height: h2, data: new Uint8ClampedArray(w2 * h2 * 4) }; },
      getLineDash: function () { return []; }, setLineDash: function () { }
    };
    var gl = {
      VENDOR: 0x1F00, RENDERER: 0x1F01, VERSION: 0x1F02, SHADING_LANGUAGE_VERSION: 0x8B8C,
      UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246,
      MAX_TEXTURE_SIZE: 0x0D33, getParameter: function (p) {
        if (p === 0x1F00 || p === 0x9245) return ENV.webgl.vendor;
        if (p === 0x1F01 || p === 0x9246) return ENV.webgl.renderer;
        if (p === 0x1F02) return ENV.webgl.version;
        if (p === 0x8B8C) return ENV.webgl.glsl;
        if (p === 0x0D33) return 16384;
        return 16;
      },
      getExtension: function () { return null; }, getSupportedExtensions: function () { return ENV.webgl.extensions; },
      getShaderPrecisionFormat: function () { return { precision: 23, rangeMin: 127, rangeMax: 127 }; },
      getContextAttributes: function () { return { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false }; },
      createBuffer: function () { return {}; }, bindBuffer: function () { }, bufferData: function () { },
      createProgram: function () { return {}; }, createShader: function () { return {}; },
      enable: function () { }, disable: function () { }, viewport: function () { }, clear: function () { }, clearColor: function () { }
    };
    var el = {
      tagName: 'CANVAS', width: w || 300, height: h || 150, style: mkStyle(), dataset: {},
      __isCanvas: true,
      getContext: function (kind) {
        if (kind === '2d') return Object.assign(ctx2d, {});
        if (kind === 'webgl' || kind === 'experimental-webgl' || kind === 'webkit-3d' || kind === 'moz-webgl') return gl;
        return null;
      },
      toDataURL: function () { return ENV.canvasDataUrl; },
      toBlob: function (cb) { if (cb) cb(null); }
    };
    return el;
  }
  function mkEl(tag) {
    tag = String(tag || 'div').toLowerCase();
    if (tag === 'canvas') return mkCanvas();
    var kids = [];
    var el = {
      tagName: tag.toUpperCase(), nodeType: 1, style: mkStyle(), dataset: {}, className: '', id: '', innerHTML: '', textContent: '', innerText: '',
      children: kids, childNodes: kids, parentNode: null, firstChild: null, lastChild: null,
      width: 300, height: 150, src: '', href: '', value: '', checked: false, disabled: false,
      offsetHeight: 150, offsetWidth: 300, clientHeight: 150, clientWidth: 300,
      scrollHeight: 150, scrollWidth: 300, offsetTop: 0, offsetLeft: 0, scrollTop: 0, scrollLeft: 0,
      setAttribute: function (k, v) { this[k] = v; }, getAttribute: function (k) { return k in this ? this[k] : null; },
      removeAttribute: function (k) { delete this[k]; }, hasAttribute: function (k) { return k in this; },
      appendChild: function (c) { kids.push(c); if (c) c.parentNode = el; return c; },
      insertBefore: function (c) { kids.unshift(c); if (c) c.parentNode = el; return c; },
      removeChild: function (c) { var i = kids.indexOf(c); if (i >= 0) kids.splice(i, 1); return c; },
      replaceChild: function (a) { return a; }, remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
      append: function () { }, prepend: function () { }, insertAdjacentHTML: function () { },
      addEventListener: function () { }, removeEventListener: function () { }, dispatchEvent: function () { return true; },
      attachEvent: function () { }, detachEvent: function () { },
      getElementsByTagName: function () { return []; }, getElementsByClassName: function () { return []; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      getBoundingClientRect: function () { return { x: 0, y: 0, width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150, toJSON: null }; },
      getClientRects: function () { return [{ width: 300, height: 150, top: 0, left: 0 }]; },
      focus: function () { }, blur: function () { }, click: function () { rec({ api: 'el.click' }); },
      cloneNode: function () { return mkEl(tag); }, contains: function () { return false; },
      play: function () { }, pause: function () { }, load: function () { },
      contentWindow: G, contentDocument: null
    };
    return el;
  }
  var documentEl = mkEl('html');
  var bodyEl = mkEl('body');
  var headEl = mkEl('head');
  documentEl.appendChild(headEl); documentEl.appendChild(bodyEl);
  var doc = {
    nodeType: 9, documentElement: documentEl, head: headEl, body: bodyEl,
    cookie: ENV.cookie || '',
    readyState: 'complete', visibilityState: 'visible', hidden: false,
    compatMode: 'CSS1Compat', characterSet: 'UTF-8', charset: 'UTF-8', contentType: 'text/html',
    referrer: '', title: ENV.title, domain: ENV.host, URL: ENV.href, documentURI: ENV.href,
    currentScript: null, designMode: 'off', dir: 'ltr', defaultView: G, activeElement: bodyEl,
    createElement: function (t) { return mkEl(t); },
    createElementNS: function (ns, t) { return mkEl(t); },
    createTextNode: function (t) { return { nodeType: 3, textContent: String(t), data: String(t), appendChild: function () { }, removeChild: function () { } }; },
    createDocumentFragment: function () { return mkEl('fragment'); },
    getElementById: function () { return null; }, getElementsByTagName: function () { return []; },
    getElementsByClassName: function () { return []; }, getElementsByName: function () { return []; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () { }, removeEventListener: function () { }, dispatchEvent: function () { return true; },
    hasFocus: function () { return true; }, write: function () { }, writeln: function () { }, open: function () { return doc; }, close: function () { },
    get scripts() { return []; }, get forms() { return []; }, get images() { return []; },
    elementFromPoint: function () { return bodyEl; }
  };
  bodyEl.contentDocument = doc; bodyEl.contentWindow = G;
  Object.defineProperty(G, 'document', { value: doc, writable: true, configurable: true, enumerable: true });

  // ---------- storage ----------
  function mkStorage(init) {
    var m = {}; var order = [];
    if (init) Object.keys(init).forEach(function (k) { m[k] = String(init[k]); order.push(k); });
    return {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { k = String(k); if (!Object.prototype.hasOwnProperty.call(m, k)) order.push(k); m[k] = String(v); },
      removeItem: function (k) { k = String(k); delete m[k]; var i = order.indexOf(k); if (i >= 0) order.splice(i, 1); },
      clear: function () { m = {}; order = []; },
      key: function (i) { return order[i] === undefined ? null : order[i]; },
      get length() { return order.length; }
    };
  }
  G.localStorage = mkStorage(ENV.localStorage);
  G.sessionStorage = mkStorage(ENV.sessionStorage);

  // ---------- performance ----------
  G.performance = {
    now: function () { return fakeNow() - T0; }, timeOrigin: T0,
    timing: { navigationStart: T0, unloadEventStart: 0, unloadEventEnd: 0, redirectStart: 0, redirectEnd: 0, fetchStart: T0 + 2, domainLookupStart: T0 + 4, domainLookupEnd: T0 + 4, connectStart: T0 + 5, connectEnd: T0 + 40, requestStart: T0 + 45, responseStart: T0 + 120, responseEnd: T0 + 140, domLoading: T0 + 160, domInteractive: T0 + 600, domContentLoadedEventStart: T0 + 601, domContentLoadedEventEnd: T0 + 650, domComplete: T0 + 900, loadEventStart: T0 + 901, loadEventEnd: T0 + 950 },
    navigation: { type: 0, redirectCount: 0 },
    mark: function () { }, measure: function () { }, clearMarks: function () { }, clearMeasures: function () { },
    getEntriesByType: function () { return []; }, getEntriesByName: function () { return []; }, getEntries: function () { return []; },
    memory: { jsHeapSizeLimit: 4294705152, totalJSHeapSize: 33768219, usedJSHeapSize: 26516967 }
  };

  // ---------- 网络桩 ----------
  function XHR() {
    this.readyState = 0; this.status = 0; this.statusText = ''; this.responseText = ''; this.response = ''; this.responseType = '';
    this.timeout = 0; this.withCredentials = false;
    this.__headers = {}; this.__url = null; this.__method = null; this.__body = null;
    this.upload = { addEventListener: function () { } };
    this.onreadystatechange = null; this.onload = null; this.onerror = null; this.ontimeout = null;
    this.onabort = null; this.onprogress = null;
  }
  XHR.prototype.open = function (m, u) { this.__method = m; this.__url = u; this.readyState = 1; rec({ api: 'xhr.open', m: String(m), u: String(u) }); };
  XHR.prototype.setRequestHeader = function (k, v) { this.__headers[k] = v; rec({ api: 'xhr.setRequestHeader', k: String(k), v: String(v).slice(0, 400) }); };
  XHR.prototype.getResponseHeader = function () { return null; };
  XHR.prototype.getAllResponseHeaders = function () { return ''; };
  XHR.prototype.overrideMimeType = function () { };
  XHR.prototype.abort = function () { };
  XHR.prototype.send = function (b) { this.__body = b; this.readyState = 4; rec({ api: 'xhr.send', url: this.__url, body: typeof b === 'string' ? b.slice(0, 2000) : String(b) }); };
  XHR.prototype.addEventListener = function () { };
  XHR.prototype.removeEventListener = function () { };
  G.XMLHttpRequest = XHR;

  function fetch(url, opt) {
    rec({ api: 'fetch', u: String(url), body: opt && typeof opt.body === 'string' ? opt.body.slice(0, 2000) : null });
    var body = '{}';
    var res = {
      ok: true, status: 200, statusText: 'OK', url: String(url), headers: { get: function () { return null; }, has: function () { return false; } },
      text: function () { return Promise.resolve(body); }, json: function () { return Promise.resolve(JSON.parse(body)); },
      clone: function () { return res; }, arrayBuffer: function () { return Promise.resolve(new ArrayBuffer(0)); }
    };
    return Promise.resolve(res);
  }
  G.fetch = fetch;
  G.Request = function (u, o) { this.url = String(u); Object.assign(this, o || {}); };
  G.Response = function (b, o) { this._b = b; Object.assign(this, o || {}); this.text = function () { return Promise.resolve(String(b)); }; };
  G.Headers = function (h) { this._h = h || {}; this.get = function (k) { return this._h[k] || null; }; this.append = function (k, v) { this._h[k] = v; }; };
  G.WebSocket = function () { this.send = function () { }; this.close = function () { }; this.addEventListener = function () { }; };
  G.EventSource = function () { this.close = function () { }; };
  G.navigator.sendBeacon = function (u, d) { rec({ api: 'sendBeacon', u: String(u), d: String(d).slice(0, 500) }); return true; };
  G.Image = function () { this.src = ''; this.width = 0; this.height = 0; this.onload = null; this.onerror = null; this.crossOrigin = null; this.addEventListener = function () { }; };
  G.Audio = function (src) { this.src = src; this.play = function () { }; this.pause = function () { }; };
  G.XDomainRequest = G.XMLHttpRequest;

  // ---------- 杂项 API ----------
  G.addEventListener = function () { }; G.removeEventListener = function () { }; G.dispatchEvent = function () { return true; };
  G.attachEvent = function () { }; G.detachEvent = function () { };
  G.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(fakeNow()); }, 0); };
  G.cancelAnimationFrame = function () { }; G.webkitRequestAnimationFrame = G.requestAnimationFrame;
  G.setTimeout = G.setTimeout; // keep host timers injected
  G.alert = function () { }; G.confirm = function () { return true; }; G.prompt = function () { return ''; };
  G.matchMedia = function (q) { return { matches: false, media: String(q), addListener: function () { }, removeListener: function () { }, addEventListener: function () { } }; };
  G.chrome = ENV.chrome;
  G.open = function () { return null; }; G.close = function () { }; G.focus = function () { }; G.blur = function () { };
  G.postMessage = function () { };
  G.Notification = function () { }; G.Worker = function () { }; G.SharedWorker = function () { }; G.ServiceWorker = function () { };
  G.RTCPeerConnection = function () { }; G.webkitRTCPeerConnection = function () { };
  G.AudioContext = function () { this.sampleRate = 44100; }; G.webkitAudioContext = G.AudioContext;
  G.OfflineAudioContext = function () { };
  G.indexedDB = { open: function () { return {}; } }; G.caches = { open: function () { return Promise.resolve({}); } };
  G.__name = ''; Object.defineProperty(G, 'name', { value: '', writable: true, configurable: true });
  G.__trace = trace;

  // ---------- crypto ----------
  var hostFill = ENV.__hostRandomFill ? G.__hostRandomFill : null;
  var realCrypto = G.crypto && G.crypto.getRandomValues ? G.crypto : null;
  G.crypto = {
    getRandomValues: function (a) {
      if (ENV.deterministicRandom) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(G.__rnd() * 256); }
      else if (G.__hostRandomFill) { var b = G.__hostRandomFill(a.length); for (var j = 0; j < a.length; j++) a[j] = b[j]; }
      else { for (var k = 0; k < a.length; k++) a[k] = Math.floor(G.__rnd() * 256); }
      rec({ api: 'crypto.getRandomValues', len: a.length, hex: Array.prototype.map.call(a, function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('').slice(0, 96) });
      return a;
    },
    randomUUID: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.floor(G.__rnd() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); }); }
  };

  // ---------- 观察 hooks（默认只开 JSON + btoa/atob，其余按需开） ----------
  var HF = ENV.hookFlags || {};
  if (ENV.hooks) {
    var jstr = JSON.stringify, jparse = JSON.parse;
    G.JSON.stringify = function (v, r, s) {
      var out = jstr.call(JSON, v, r, s);
      if (typeof out === 'string' && out.length > ENV.jsonMin) {
        trace.calls.push({ api: 'JSON.stringify', len: out.length, preview: out.slice(0, 2000), full: out });
      }
      return out;
    };
    G.JSON.parse = function (t, r) {
      var out = jparse.call(JSON, t, r);
      if (typeof t === 'string' && t.length > ENV.jsonMin) trace.calls.push({ api: 'JSON.parse', len: t.length, preview: t.slice(0, 1200), full: t });
      return out;
    };
    var _btoa = G.btoa, _atob = G.atob;
    G.btoa = function (s) {
      var t = String(s), out = _btoa(t);
      if (t.length > ENV.jsonMin) trace.calls.push({ api: 'btoa', inLen: t.length, outLen: out.length, inPreview: t.slice(0, 200) });
      return out;
    };
    G.atob = function (s) {
      var out = _atob(String(s));
      if (String(s).length > ENV.jsonMin) trace.calls.push({ api: 'atob', inLen: String(s).length, outLen: out.length, outPreview: out.slice(0, 200) });
      return out;
    };
    if (HF.fromCharCode) {
      var sfc = String.fromCharCode;
      G.String.fromCharCode = function () {
        if (arguments.length > 8) trace.calls.push({ api: 'String.fromCharCode', n: arguments.length, codes: Array.prototype.slice.call(arguments, 0, 16).join(',') });
        return sfc.apply(String, arguments);
      };
    }
    if (HF.join) {
      var join = Array.prototype.join;
      Array.prototype.join = function (sep) {
        var out = join.call(this, sep);
        if (typeof out === 'string' && out.length > 40 && this.length > 3 && trace.calls.length < ENV.traceLimit * 3) {
          trace.calls.push({ api: 'Array.join', sep: String(sep), n: this.length, preview: String(out).slice(0, 300) });
        }
        return out;
      };
    }
    if (HF.perfNow) {
      var nowFn = performance.now;
      performance.now = function () { var v = nowFn(); trace.calls.push({ api: 'performance.now', v: v }); return v; };
    }
  }
})();
`;
}

module.exports = { buildBootstrapSource };
