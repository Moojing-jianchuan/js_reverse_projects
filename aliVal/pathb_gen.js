// 路径 B：jsdom 补环境 → 加载 SDK → initFeiLin → 生成 deviceToken
// 依据：trace_property_access 采集的真实值 + initialProperties 检测清单 + skill 的 markNative 模板
const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://tool.manmanbuy.com/m/aliVal.aspx',
  referrer: 'https://www.google.com/',
  contentType: 'text/html',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
});
const win = dom.window, doc = win.document, nav = win.navigator;

// ===== markNative 三层防御 =====
const _origFnToString = win.Function.prototype.toString;
const nativeFnSet = new WeakSet();
function markNative(fn) {
  if (typeof fn !== 'function') return fn;
  nativeFnSet.add(fn);
  try {
    const name = fn.name || '';
    Object.defineProperty(fn, 'toString', {
      value: function () { return `function ${name}() { [native code] }`; },
      writable: true, configurable: true,
    });
  } catch (e) {}
  return fn;
}
win.Function.prototype.toString = function () {
  if (nativeFnSet.has(this)) return `function ${this.name || ''}() { [native code] }`;
  let src;
  try { src = _origFnToString.call(this); } catch (e) { return 'function () { [native code] }'; }
  if (/const\s+esValue|this\._globalObject|idlUtils|globalObject\s*=|_document/.test(src)) {
    return `function ${this.name || ''}() { [native code] }`;
  }
  return src;
};
// 命名 getter 工厂
function nativeGetter(name, value) {
  const fn = function () { return value; };
  try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) {}
  return markNative(fn);
}

// ===== window 上的 getter markNative（window.document/screen/navigator/localStorage 是 initialProperties 的 LEAK）=====
for (const key of ['document', 'screen', 'navigator', 'localStorage', 'sessionStorage']) {
  try {
    const desc = Object.getOwnPropertyDescriptor(win, key);
    if (desc && desc.get) markNative(desc.get);
  } catch (e) {}
}

// ===== navigator 基础属性（覆盖 15 LEAK 中的 navigator.* 项 + trace 采集值）=====
const navOverrides = {
  platform: 'Win32',
  vendor: '',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
  appVersion: '5.0 (Windows)',
  language: 'en-US',
  languages: ['en-US', 'en'],
  hardwareConcurrency: 24,
  cookieEnabled: true,
  product: 'Gecko',
  appCodeName: 'Mozilla',
  productSub: '20100101',
  maxTouchPoints: 0,
  webdriver: false,
  doNotTrack: '1',
  onLine: true,
};
for (const [k, v] of Object.entries(navOverrides)) {
  try { Object.defineProperty(nav, k, { get: nativeGetter(k, v), configurable: true, enumerable: true }); } catch (e) {}
}

// ===== plugins / mimeTypes 完整结构（length=5 / 2）=====
const pluginNames = ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer', 'Microsoft Edge PDF Viewer', 'WebKit built-in PDF'];
const mimeData = [
  { type: 'application/pdf', description: 'Portable Document Format', suffixes: 'pdf' },
  { type: 'text/pdf', description: 'Portable Document Format', suffixes: 'pdf' },
];
function buildPlugins() {
  const mimeTypes = mimeData.map((m) => {
    const mt = {};
    Object.defineProperties(mt, {
      type: { get: nativeGetter('type', m.type), enumerable: true },
      description: { get: nativeGetter('description', m.description), enumerable: true },
      suffixes: { get: nativeGetter('suffixes', m.suffixes), enumerable: true },
    });
    mt[Symbol.toStringTag] = 'MimeType';
    return mt;
  });
  const plugins = pluginNames.map((name) => {
    const p = {};
    Object.defineProperties(p, {
      name: { get: nativeGetter('name', name), enumerable: true },
      filename: { get: nativeGetter('filename', 'internal-pdf-viewer'), enumerable: true },
      description: { get: nativeGetter('description', 'Portable Document Format'), enumerable: true },
      length: { get: nativeGetter('length', mimeTypes.length), enumerable: true },
    });
    mimeTypes.forEach((mt, i) => { p[i] = mt; });
    p.item = markNative(function item(i) { return mimeTypes[i] || null; });
    p.namedItem = markNative(function namedItem(n) { return mimeTypes.find(m => m.type === n) || null; });
    p[Symbol.toStringTag] = 'Plugin';
    return p;
  });
  const pluginArray = {};
  Object.defineProperty(pluginArray, 'length', { get: nativeGetter('length', plugins.length), enumerable: true });
  plugins.forEach((p, i) => { pluginArray[i] = p; });
  pluginArray.item = markNative(function item(i) { return plugins[i] || null; });
  pluginArray.namedItem = markNative(function namedItem(n) { return plugins.find(p => p.name === n) || null; });
  pluginArray.refresh = markNative(function refresh() {});
  pluginArray[Symbol.toStringTag] = 'PluginArray';
  const mimeTypeArray = {};
  Object.defineProperty(mimeTypeArray, 'length', { get: nativeGetter('length', mimeTypes.length), enumerable: true });
  mimeTypes.forEach((m, i) => { mimeTypeArray[i] = m; });
  mimeTypeArray.item = markNative(function item(i) { return mimeTypes[i] || null; });
  mimeTypeArray.namedItem = markNative(function namedItem(n) { return mimeTypes.find(m => m.type === n) || null; });
  mimeTypeArray[Symbol.toStringTag] = 'MimeTypeArray';
  Object.defineProperty(nav, 'plugins', { get: nativeGetter('plugins', pluginArray), configurable: true, enumerable: true });
  Object.defineProperty(nav, 'mimeTypes', { get: nativeGetter('mimeTypes', mimeTypeArray), configurable: true, enumerable: true });
}
buildPlugins();

// ===== screen（trace 采集：2752×1152）=====
const screenData = {
  width: 2752, height: 1152, availWidth: 2752, availHeight: 1104,
  colorDepth: 24, pixelDepth: 24, availLeft: 0, availTop: 0,
};
for (const [k, v] of Object.entries(screenData)) {
  try { Object.defineProperty(win.screen, k, { get: nativeGetter(k, v), configurable: true, enumerable: true }); } catch (e) {}
}
Object.defineProperty(win.screen, 'orientation', { get: nativeGetter('orientation', { type: 'landscape-primary', angle: 0 }), configurable: true });
win.screen[Symbol.toStringTag] = 'Screen';

// ===== window 尺寸（trace 采集）=====
const winDims = { outerWidth: 1806, outerHeight: 1104, innerWidth: 1806, innerHeight: 1043, devicePixelRatio: 1, screenX: 652, screenY: 0 };
for (const [k, v] of Object.entries(winDims)) {
  try { Object.defineProperty(win, k, { get: nativeGetter(k, v), configurable: true, enumerable: true }); } catch (e) {}
}

// ===== document =====
doc.hasFocus = markNative(function hasFocus() { return true; });
Object.defineProperty(doc, 'readyState', { get: nativeGetter('readyState', 'complete'), configurable: true });
Object.defineProperty(doc, 'hidden', { get: nativeGetter('hidden', false), configurable: true });
Object.defineProperty(doc, 'visibilityState', { get: nativeGetter('visibilityState', 'visible'), configurable: true });
Object.defineProperty(doc, 'referrer', { get: nativeGetter('referrer', 'https://www.google.com/'), configurable: true });
try { doc[Symbol.toStringTag] = 'HTMLDocument'; } catch (e) {}
try { nav[Symbol.toStringTag] = 'Navigator'; } catch (e) {}

// ===== DOM 布局属性（jsdom 默认 0，SDK 可能测量）=====
try {
  const layoutDefaults = { offsetHeight: 150, offsetWidth: 300, clientHeight: 150, clientWidth: 300, scrollHeight: 150, scrollWidth: 300, offsetTop: 0, offsetLeft: 0 };
  for (const [prop, val] of Object.entries(layoutDefaults)) {
    Object.defineProperty(win.HTMLElement.prototype, prop, { get: nativeGetter(prop, val), configurable: true, enumerable: true });
  }
  win.HTMLElement.prototype.getBoundingClientRect = markNative(function getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 150, width: 300, height: 150 };
  });
} catch (e) {}

// ===== performance =====
try {
  const perfTiming = { navigationStart: Date.now() - 1200, fetchStart: Date.now() - 1000, domLoading: Date.now() - 400, domComplete: Date.now() - 50 };
  win.performance = win.performance || {};
  Object.defineProperty(win.performance, 'timing', { get: nativeGetter('timing', perfTiming), configurable: true });
  Object.defineProperty(win.performance, 'navigation', { get: nativeGetter('navigation', { type: 0, redirectCount: 0 }), configurable: true });
  win.performance.now = markNative(function now() { return Date.now(); });
} catch (e) {}

// ===== canvas + webgl（指纹）+ 诊断日志 =====
// 真实 canvas 指纹（从浏览器 SDK 采集，240×60 和 122×110 两种尺寸）
const canvasFp0 = fs.readFileSync('config/canvas_fp0.txt', 'utf8').trim(); // 240×60
const canvasFp1 = fs.readFileSync('config/canvas_fp1.txt', 'utf8').trim(); // 122×110
const canvasCalls = [];
win.HTMLCanvasElement.prototype.toDataURL = markNative(function toDataURL() {
  canvasCalls.push('toDataURL(' + this.width + 'x' + this.height + ')');
  if (this.width === 122 && this.height === 110) return canvasFp1;
  return canvasFp0; // 默认 240×60
});
win.HTMLCanvasElement.prototype.toBlob = markNative(function toBlob(cb, type, quality) {
  canvasCalls.push('toBlob(' + this.width + 'x' + this.height + ')');
  const data = (this.width === 122 && this.height === 110) ? canvasFp1 : canvasFp0;
  if (cb) setTimeout(() => cb({ size: data.length, type: type || 'image/png' }), 0);
});
win.HTMLCanvasElement.prototype.getContext = markNative(function getContext(type) {
  canvasCalls.push('getContext(' + type + ')');
  if (type === '2d') {
    const ctx = {
      fillText: markNative(function fillText() {}),
      measureText: markNative(function measureText() { return { width: 10 }; }),
      getImageData: markNative(function getImageData() { return { data: [0, 0, 0, 255], width: 1, height: 1 }; }),
      fillRect: markNative(function fillRect() {}), beginPath: markNative(function beginPath() {}),
      arc: markNative(function arc() {}), fill: markNative(function fill() {}),
      setTransform: markNative(function setTransform() {}), translate: markNative(function translate() {}),
      rotate: markNative(function rotate() {}), scale: markNative(function scale() {}),
      strokeText: markNative(function strokeText() {}), save: markNative(function save() {}),
      restore: markNative(function restore() {}), stroke: markNative(function stroke() {}),
      moveTo: markNative(function moveTo() {}), lineTo: markNative(function lineTo() {}),
      closePath: markNative(function closePath() {}), clearRect: markNative(function clearRect() {}),
      rect: markNative(function rect() {}), createLinearGradient: markNative(function createLinearGradient() { return { addColorStop: markNative(function() {}) }; }),
      isPointInPath: markNative(function isPointInPath() { return false; }), isPointInStroke: markNative(function isPointInStroke() { return false; }),
      font: '', textBaseline: '', textAlign: '',
    };
    return new Proxy(ctx, {
      get(target, prop) {
        const v = target[prop];
        if (typeof prop === 'string' && !(prop in target)) {
          canvasCalls.push('ctx2d.MISSING.' + String(prop));
        }
        return v;
      },
    });
  }
  if (type === 'webgl' || type === 'experimental-webgl') {
    return {
      VENDOR: 7936, RENDERER: 7937, VERSION: 7938,
      SHADING_LANGUAGE_VERSION: 35724, MAX_TEXTURE_SIZE: 3379,
      MAX_RENDERBUFFER_SIZE: 34024, MAX_VIEWPORT_DIMS: 3386,
      RED_BITS: 3410, GREEN_BITS: 3411, BLUE_BITS: 3412, ALPHA_BITS: 3413,
      DEPTH_BITS: 3414, STENCIL_BITS: 3415,
      getParameter: markNative(function getParameter(p) {
        canvasCalls.push('webgl.getParameter(' + p + ')');
        if (p === 7936) return 'Mozilla'; // VENDOR
        if (p === 7937) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar'; // RENDERER
        if (p === 7938) return 'WebGL 1.0'; // VERSION
        if (p === 35724) return 'WebGL GLSL ES 1.0'; // SHADING_LANGUAGE_VERSION
        if (p === 3379) return 16384; // MAX_TEXTURE_SIZE
        if (p === 34024) return 16384; // MAX_RENDERBUFFER_SIZE
        if (p === 3386) return new Int32Array([16384, 16384]); // MAX_VIEWPORT_DIMS
        if (p === 3410 || p === 3411 || p === 3412 || p === 3413) return 8; // *_BITS
        if (p === 3414) return 24; // DEPTH_BITS
        if (p === 3415) return 8; // STENCIL_BITS
        return null;
      }),
      getExtension: markNative(function getExtension() { return null; }),
      getSupportedExtensions: markNative(function getSupportedExtensions() { return []; }),
      getShaderPrecisionFormat: markNative(function getShaderPrecisionFormat() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; }),
    };
  }
  return null;
});

// ===== mediaDevices / sessionStorage（trace 观察到访问）=====
try {
  Object.defineProperty(nav, 'mediaDevices', {
    get: nativeGetter('mediaDevices', {
      enumerateDevices: markNative(function enumerateDevices() { return Promise.resolve([]); }),
      getUserMedia: markNative(function getUserMedia() { return Promise.reject(new Error('NotAllowed')); }),
    }),
    configurable: true, enumerable: true,
  });
} catch (e) {}
try {
  win.sessionStorage = {
    setItem: markNative(function setItem() {}), getItem: markNative(function getItem() { return null; }),
    removeItem: markNative(function removeItem() {}), clear: markNative(function clear() {}),
  };
  win.sessionStorage[Symbol.toStringTag] = 'Storage';
} catch (e) {}

// ===== 中危级 API 存根 =====
if (!win.Worker) {
  win.Worker = markNative(function Worker() {
    return {
      postMessage: markNative(function postMessage() {}), terminate: markNative(function terminate() {}),
      addEventListener: markNative(function addEventListener() {}), removeEventListener: markNative(function removeEventListener() {}),
      onmessage: null, onerror: null,
    };
  });
}
if (!win.SharedWorker) {
  win.SharedWorker = markNative(function SharedWorker() {
    return { port: { postMessage: markNative(function() {}), start: markNative(function() {}), addEventListener: markNative(function() {}), onmessage: null } };
  });
}
win.matchMedia = markNative(function matchMedia(q) {
  return { matches: false, media: q, onchange: null, addListener: markNative(function() {}), removeListener: markNative(function() {}), addEventListener: markNative(function() {}), removeEventListener: markNative(function() {}) };
});
win.indexedDB = { open: markNative(function open(n, v) { return { onupgradeneeded: null, onsuccess: null, onerror: null, result: null }; }) };
win.indexedDB[Symbol.toStringTag] = 'IDBFactory';
if (!win.Notification) { win.Notification = markNative(function Notification() {}); win.Notification.permission = 'default'; }
if (!win.AudioContext) { win.AudioContext = markNative(function AudioContext() { return { sampleRate: 44100, state: 'suspended', currentTime: 0, destination: {}, createOscillator: markNative(function() { return { type: 'sine', frequency: { value: 440 }, connect: markNative(function() {}), start: markNative(function() {}), stop: markNative(function() {}) }; }), close: markNative(function() { return Promise.resolve(); }), resume: markNative(function() { return Promise.resolve(); }) }; }); }
if (!win.OfflineAudioContext) { win.OfflineAudioContext = markNative(function OfflineAudioContext() { return new win.AudioContext(); }); }
if (!win.fetch) { win.fetch = markNative(function fetch() { return Promise.reject(new Error('network')); }); }
if (!win.performance) { win.performance = { now: markNative(function now() { return Date.now(); }), timing: { navigationStart: Date.now() - 1200 }, navigation: { type: 0, redirectCount: 0 } }; }

// ===== 加载 SDK =====
win.eval(fs.readFileSync('config/AliyunCaptcha.js', 'utf8'));
win.eval(fs.readFileSync('config/feilin002.js', 'utf8'));
console.log('SDK 加载 OK');

// ===== hook XHR：记录 + mock 响应 =====
const capturedXhr = [];
const _open = win.XMLHttpRequest.prototype.open;
const _send = win.XMLHttpRequest.prototype.send;
win.XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__m = m; return _open.apply(this, arguments); };
win.XMLHttpRequest.prototype.send = function (body) {
  capturedXhr.push({ m: this.__m, u: String(this.__u || '').slice(0, 200), body: String(body || '').slice(0, 300) });
  const resp = '{"Code":"200","Success":true,"Message":"ok","ResultObject":{}}';
  setTimeout(() => {
    try {
      this.readyState = 4; this.status = 200;
      this.responseText = resp; this.response = resp;
      if (this.onreadystatechange) this.onreadystatechange();
      if (this.onload) this.onload();
    } catch (e) {}
  }, 20);
  return _send.apply(this, arguments);
};

// ===== 解密 DeviceConfig → deviceConfig 对象（真实结构，来自 initFeiLin trace）=====
const { aesDecrypt: _aesDecrypt, KEYS: _KEYS } = require('./utils/crypto');
function parseDeviceConfig(dcB64) {
  const plain = _aesDecrypt(dcB64, _KEYS.RES_KEY, _KEYS.AES_IV);
  const p = plain.split('#');
  return {
    key: Buffer.from(p[0], 'base64').toString('utf8'),
    switch: Number(Buffer.from(p[1], 'base64').toString('utf8')),
    sessionId: p[2],
    version: p[3],
    pluginElements: p[4],
    pluginResource: p[5],
    globalVariable: p[6],
    timestamp: p[7],
    ip: p[8],
  };
}

// ===== 构造正确的 Br（真实结构）=====
const DEVICE_CONFIG_B64 = fs.readFileSync('config/device_config_live.txt', 'utf8').trim();
const devCfg = parseDeviceConfig(DEVICE_CONFIG_B64);
console.log('[deviceConfig] key=', devCfg.key, '| version=', devCfg.version, '| sessionId=', devCfg.sessionId.slice(0, 40) + '...');
const Br = {
  prefix: '1sfr0c',
  region: 'cn',
  appName: 'saf-captcha',
  appKey: 'ab034ec0643f91399eb33e062dc7fae1',
  endpoints: ['https://cloudauth-device-dualstack.cn-shanghai.aliyuncs.com', 'https://cn-shanghai.device.saf.aliyuncs.com'],
  ENDPOINTS: ['https://cloudauth-device-dualstack.cn-shanghai.aliyuncs.com', 'https://cn-shanghai.device.saf.aliyuncs.com'],
  logs: [],
  initTime: Date.now(),
  sceneId: 'vollz84f',
  preCollectData: { fontsNum: 72 },
  DeviceConfig: DEVICE_CONFIG_B64,
  deviceConfig: devCfg,
  timestamp: devCfg.timestamp,
  feilinLoad: true,
};

try {
  const ret = win.FEILIN.initFeiLin(Br, (state, data) => {
    console.log('[callback]', state, JSON.stringify(data).slice(0, 120));
    if (data && data.DeviceToken) {
      fs.writeFileSync('config/device_token_jsdom.txt', data.DeviceToken);
      console.log('DeviceToken 已保存，长度:', data.DeviceToken.length);
    }
  });
  Promise.resolve(ret).then(() => console.log('initFeiLin resolve OK')).catch(e => console.log('initFeiLin reject:', e && e.message));
} catch (e) {
  console.log('initFeiLin 同步 ERR:', e.message);
}

setTimeout(() => {
  console.log('\n=== XHR 请求 ===');
  capturedXhr.forEach(c => console.log(' ', c.m, c.u, '|', c.body));
  console.log('\n=== canvas/webgl 调用 ===');
  console.log(' ', canvasCalls.join('  ->  ') || '(无)');
  console.log('\nwindow.um:', typeof win.um, 'keys:', win.um ? Object.keys(win.um) : '');
  console.log('window.z_um:', typeof win.z_um);
  if (win.um && typeof win.um.getToken === 'function') {
    try { console.log('um.getToken():', win.um.getToken().slice(0, 120)); } catch (e) { console.log('getToken ERR:', e.message); }
  }
  process.exit(0);
}, 3000);
