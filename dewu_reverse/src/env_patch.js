/**
 * env_patch.js —— 得物 PC 端风控 SDK（preinforce2 / pceptor / pyuntu）的 Node 运行环境补丁包
 * ============================================================================
 * 定位：路径 B（环境复现）。不做算法还原，让原始 JSVMP 在 jsdom 里跑起来，
 *       使它能读到与真实 Camoufox(Firefox 152) 一致的环境值。
 *
 * 基准来源：artifacts/env_baseline/dewu_env_bundle.json（真实浏览器导出，163KB）
 * 补丁依据：scripts/scan_env_refs.js 从 artifacts/unpacked/ 解混淆后统计的「SDK 实读点」，
 *          每条补丁的注释里都写了它对应哪个检测点、是否是 SDK 真读（见 docs/env_report.md）。
 *
 * 用法：
 *   const { createEnv } = require('./src/env_patch');
 *   const env = createEnv();                       // 默认读 artifacts/env_baseline/dewu_env_bundle.json
 *   env.evalSource(fs.readFileSync('artifacts/js/pceptor.js', 'utf8'), 'pceptor.js');
 *   env.window.fun / env.globals() ...
 *
 * 关键设计：
 *   1) 所有注入的函数都过 markNative()，Function.prototype.toString 统一输出 **Firefox 多行格式**
 *      （Camoufox=Gecko 内核；Chrome 单行格式会是明显的对不上）；
 *   2) jsdom 补不动的项（canvas 像素 / WebGL / audio）走「基线回放」：直接把真实浏览器采集到的值当返回值；
 *   3) 补丁顺序固定：markNative → 原型扫描 → 各具体补丁 → 最后一次全量扫描（见 applyAll）。
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const DEFAULT_BUNDLE = path.resolve(__dirname, '..', 'artifacts', 'env_baseline', 'dewu_env_bundle.json');
const DEFAULT_ORIGIN = 'https://www.dewu.com/';

/** 真实基线 UA（Camoufox / Firefox 152，Windows） */
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

// ─────────────────────────────────────────────────────────────────────────────
// 0. 基础工具
// ─────────────────────────────────────────────────────────────────────────────

/** 读取基线 bundle；不存在直接抛错（宁可失败也不要拿默认值糊过去） */
function loadBundle(bundlePath) {
  const p = bundlePath || DEFAULT_BUNDLE;
  if (!fs.existsSync(p)) throw new Error('env bundle 不存在: ' + p);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 取 bundle 里 {type,value} 包裹字段的裸值 */
function bval(node, fallback) {
  if (node == null) return fallback;
  if (typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, 'value')) return node.value;
  return node;
}

/** 造一个「名字正确」的函数：Firefox 的 native 格式里带函数名，匿名函数会被识破 */
function namedFn(name, impl) {
  const holder = { [name]: function (...args) { return impl.apply(this, args); } };
  return holder[name];
}

/** 描述符写入工具：原型属性优先用 getter（贴合 WebIDL 形状：属性在原型上，不在实例上） */
function defineGetter(obj, name, getter, opts) {
  const o = opts || {};
  try {
    Object.defineProperty(obj, name, {
      get: getter,
      set: o.set,
      enumerable: o.enumerable !== false,
      configurable: true,
    });
    return true;
  } catch (e) {
    return false;
  }
}

/** 数据属性写入工具（configurable 尽量为 true，方便后续再补） */
function defineValue(obj, name, value, opts) {
  const o = opts || {};
  try {
    Object.defineProperty(obj, name, {
      value,
      writable: o.writable !== false,
      enumerable: o.enumerable !== false,
      configurable: true,
    });
    return true;
  } catch (e) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. markNative：Function.prototype.toString 的 Firefox 化（全项目最高优先级补丁）
//    对应检测点：pceptor 里 `Object.prototype.toString.toString().includes('native code')`、
//                `WebSocket.toString().includes('native code')`、
//                `navigator.sendBeacon.toString().includes('native code')`
//    jsdom 原值：document.createElement.toString() 直接吐 jsdom 源码（const esValue = ...）
//    基线值：Firefox 多行 native 格式 "function createElement() {\n    [native code]\n}"
// ─────────────────────────────────────────────────────────────────────────────
function createNativePatcher(win) {
  const FnProto = win.Function.prototype;
  const origToString = FnProto.toString;
  const marked = new WeakSet();

  /** Firefox/Gecko 的 native 代码格式（注意换行 + 4 空格缩进，这是和 Chrome 最大的区别） */
  const formatNative = (name) => (name
    ? 'function ' + name + '() {\n    [native code]\n}'
    : 'function () {\n    [native code]\n}');

  // jsdom 源码指纹：扫描原型链时漏掉的函数靠这些正则兜底
  const jsdomPatterns = [
    /const esValue = this !== null && this !== undefined \? this : globalObject/,
    /this\._globalObject/,
    /throw new TypeError\("Illegal constructor"\)/,
    /^\s*function\s*\([^)]*\)\s*\{\s*if \(this === null \|\| this === undefined\)/,
    /webIDLConvert/, // jsdom 的 WebIDL 转换辅助
  ];

  /** 标记一个函数为「原生」；顺带在函数对象上挂 toString 兜底（防原型被 SDK 重建） */
  function markNative(fn) {
    if (typeof fn !== 'function') return fn;
    marked.add(fn);
    try {
      Object.defineProperty(fn, 'toString', {
        value: namedFn('toString', function () { return formatNative(this && this.name); }),
        writable: true,
        configurable: true,
        enumerable: false,
      });
    } catch (e) { /* 某些内建函数不可扩展，忽略 */ }
    return fn;
  }

  const toStringProxy = namedFn('toString', function toString() {
    // 原生语义：非函数 this 必须抛 TypeError
    if (typeof this !== 'function') return origToString.call(this);

    let src = '';
    try { src = origToString.call(this); } catch (e) { src = ''; }

    if (marked.has(this)) return formatNative(this.name);
    // V8 内建的 native 字符串是 Chrome 单行格式 → 统一改写成 Gecko 多行格式
    if (/\[native code\]/.test(src)) return formatNative(this.name);
    for (let i = 0; i < jsdomPatterns.length; i++) {
      if (jsdomPatterns[i].test(src)) return formatNative(this.name);
    }
    return src;
  });
  markNative(toStringProxy);
  Object.defineProperty(FnProto, 'toString', {
    value: toStringProxy, writable: true, configurable: true, enumerable: false,
  });

  /**
   * jsdom 的 window.setTimeout 等是匿名函数，而 Firefox 的 native 实例带名字
   * （"function setTimeout() {...}"）。匿名的话我们的 formatNative 会输出 "function () {...}"，
   * 与基线对不上，所以按属性名补 name。
   */
  function ensureName(fn, name) {
    if (typeof fn !== 'function' || !name) return fn;
    if (fn.name) return fn;
    try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) { /* ignore */ }
    return fn;
  }

  /** 递归扫描原型链上的方法/访问器并标记 */
  function scanPrototypeChain(obj, maxDepth) {
    let cur = obj;
    const depth = maxDepth || 4;
    for (let d = 0; d < depth && cur && cur !== win.Object.prototype; d++) {
      let names = [];
      try { names = Object.getOwnPropertyNames(cur); } catch (e) { break; }
      for (const name of names) {
        if (name === 'constructor') continue;
        let desc;
        try { desc = Object.getOwnPropertyDescriptor(cur, name); } catch (e) { continue; }
        if (!desc) continue;
        if (typeof desc.value === 'function') markNative(ensureName(desc.value, d === 0 ? name : ''));
        if (typeof desc.get === 'function') markNative(ensureName(desc.get, d === 0 ? name : ''));
        if (typeof desc.set === 'function') markNative(desc.set);
      }
      try { cur = Object.getPrototypeOf(cur); } catch (e) { break; }
    }
  }

  /** 全量扫描：window 上所有构造器的 prototype 链 + 若干宿主对象实例 */
  function scanAll(extra) {
    const seen = new WeakSet();
    let names = [];
    try { names = Object.getOwnPropertyNames(win); } catch (e) { names = []; }
    for (const name of names) {
      let v;
      try { v = win[name]; } catch (e) { continue; }
      if (typeof v === 'function') {
        markNative(ensureName(v, name));
        if (v.prototype && !seen.has(v.prototype)) {
          seen.add(v.prototype);
          scanPrototypeChain(v.prototype, 4);
        }
      } else if (v && typeof v === 'object' && !seen.has(v)) {
        seen.add(v);
        scanPrototypeChain(v, 3);
      }
    }
    for (const obj of [win.document, win.navigator, win.screen, win.location, win.history, win.performance, win.localStorage, win.sessionStorage].concat(extra || [])) {
      if (obj && !seen.has(obj)) { seen.add(obj); scanPrototypeChain(obj, 4); }
    }
  }

  return { markNative, scanPrototypeChain, scanAll, formatNative, toStringProxy, marked };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. navigator 补丁（37 个 getter）
//    对应检测点：
//      - SDK 真读：navigator.userAgent（preinforce2 用 /\(([^)]+)\)/ 抽平台；pceptor 判 iOS/Android）
//                  navigator.platform（pceptor 判 iPad/iPhone/iPod）
//      - 高危兜底：webdriver/plugins/mimeTypes/hardwareConcurrency/oscpu/buildID
//    jsdom 原值：UA 是 "Mozilla/5.0 (win32) ... jsdom/29"，platform ""，vendor "Apple Computer, Inc."
//                （这套是 Chrome 语义，跟 Firefox 基线直接矛盾）
// ─────────────────────────────────────────────────────────────────────────────
function buildPluginTree(win, native, pluginData, mimeData) {
  const mark = native.markNative;
  const mkMime = (m, enabledPlugin) => {
    const mt = Object.create(Object.getPrototypeOf(mimeData) === null ? null : Object.prototype);
    defineGetter(mt, 'type', mark(namedFn('type', () => m.type)));
    defineGetter(mt, 'suffixes', mark(namedFn('suffixes', () => m.suffixes)));
    defineGetter(mt, 'description', mark(namedFn('description', () => m.description)));
    defineGetter(mt, 'enabledPlugin', mark(namedFn('enabledPlugin', () => enabledPlugin)));
    defineValue(mt, Symbol.toStringTag, 'MimeType', { writable: false, enumerable: false });
    return mt;
  };

  const plugins = pluginData.map((p) => {
    const plugin = {};
    const mimes = (p.mimeTypes || mimeData).map((m) => mkMime(m, null));
    defineGetter(plugin, 'name', mark(namedFn('name', () => p.name)));
    defineGetter(plugin, 'filename', mark(namedFn('filename', () => p.filename)));
    defineGetter(plugin, 'description', mark(namedFn('description', () => p.description)));
    defineGetter(plugin, 'length', mark(namedFn('length', () => mimes.length)));
    mimes.forEach((mt, i) => { defineValue(plugin, i, mt, { writable: false }); });
    defineValue(plugin, 'item', mark(namedFn('item', (i) => mimes[i >>> 0] || null)));
    defineValue(plugin, 'namedItem', mark(namedFn('namedItem', (n) => mimes.find((m) => m.type === n) || null)));
    defineValue(plugin, Symbol.iterator, mark(namedFn('values', function* () { yield* mimes; })));
    defineValue(plugin, Symbol.toStringTag, 'Plugin', { writable: false, enumerable: false });
    return plugin;
  });

  const pluginArray = {};
  defineGetter(pluginArray, 'length', mark(namedFn('length', () => plugins.length)));
  plugins.forEach((p, i) => { defineValue(pluginArray, i, p, { writable: false }); });
  defineValue(pluginArray, 'item', mark(namedFn('item', (i) => plugins[i >>> 0] || null)));
  defineValue(pluginArray, 'namedItem', mark(namedFn('namedItem', (n) => plugins.find((p) => p.name === n) || null)));
  defineValue(pluginArray, 'refresh', mark(namedFn('refresh', () => undefined)));
  defineValue(pluginArray, Symbol.iterator, mark(namedFn('values', function* () { yield* plugins; })));
  defineValue(pluginArray, Symbol.toStringTag, 'PluginArray', { writable: false, enumerable: false });

  const mimeTypeArray = {};
  const allMimes = mimeData.map((m) => mkMime(m, plugins[0]));
  // enabledPlugin 要指回第一个 plugin（自引用，浏览器就是这样）
  allMimes.forEach((mt) => {
    try {
      Object.defineProperty(mt, 'enabledPlugin', {
        get: mark(namedFn('enabledPlugin', () => plugins[0])), configurable: true, enumerable: true,
      });
    } catch (e) { /* ignore */ }
  });
  defineGetter(mimeTypeArray, 'length', mark(namedFn('length', () => allMimes.length)));
  allMimes.forEach((m, i) => { defineValue(mimeTypeArray, i, m, { writable: false }); });
  defineValue(mimeTypeArray, 'item', mark(namedFn('item', (i) => allMimes[i >>> 0] || null)));
  defineValue(mimeTypeArray, 'namedItem', mark(namedFn('namedItem', (n) => allMimes.find((m) => m.type === n) || null)));
  defineValue(mimeTypeArray, Symbol.toStringTag, 'MimeTypeArray', { writable: false, enumerable: false });

  return { pluginArray, mimeTypeArray };
}

/** 给 bundle 里那些「只是 object」的接口造一个带 tag 的空壳（Permissions/MediaDevices/GPU...） */
function makeInterfaceStub(win, native, tag, extras) {
  const mark = native.markNative;
  const obj = Object.create(win.EventTarget ? win.EventTarget.prototype : Object.prototype);
  const base = {
    addEventListener: mark(namedFn('addEventListener', () => undefined)),
    removeEventListener: mark(namedFn('removeEventListener', () => undefined)),
    dispatchEvent: mark(namedFn('dispatchEvent', () => true)),
  };
  for (const k of Object.keys(base)) defineValue(obj, k, base[k], { enumerable: false });
  defineValue(obj, Symbol.toStringTag, tag, { writable: false, enumerable: false });
  if (extras) for (const k of Object.keys(extras)) defineValue(obj, k, extras[k], { enumerable: true });
  return obj;
}

function patchNavigator(win, bundle, native) {
  const nav = win.navigator;
  const proto = win.Navigator && win.Navigator.prototype ? win.Navigator.prototype : Object.getPrototypeOf(nav);
  const mark = native.markNative;
  const N = bundle.navigator || {};
  const applied = [];

  const get = (k) => bval(N[k]);

  // ── 2.1 标量属性：直接来自基线 ────────────────────────────────────────────
  const scalars = {
    userAgent: get('userAgent') || FIREFOX_UA,
    appVersion: get('appVersion'),
    appName: get('appName'),
    appCodeName: get('appCodeName'),
    platform: get('platform'),
    product: get('product'),
    productSub: get('productSub'),
    vendor: get('vendor'),
    vendorSub: get('vendorSub'),
    oscpu: get('oscpu'),
    buildID: get('buildID'),
    language: get('language'),
    doNotTrack: get('doNotTrack'),
    hardwareConcurrency: get('hardwareConcurrency'),
    maxTouchPoints: get('maxTouchPoints'),
    webdriver: get('webdriver'),
    cookieEnabled: get('cookieEnabled'),
    onLine: get('onLine'),
    pdfViewerEnabled: get('pdfViewerEnabled'),
    globalPrivacyControl: get('globalPrivacyControl'),
    languages: get('languages'),
  };
  for (const [k, v] of Object.entries(scalars)) {
    if (v === undefined) continue;
    const frozen = Array.isArray(v) ? Object.freeze(v.slice()) : v;
    const ok = defineGetter(proto, k, mark(namedFn(k, () => frozen)));
    if (ok) applied.push('navigator.' + k);
  }

  // ── 2.2 plugins / mimeTypes 对象树（长度、item/namedItem、遍历）───────────
  const pluginData = (bval(N.plugins) || []).map((p) => ({
    name: p.name, filename: p.filename, description: p.description, mimeTypes: p.mimeTypes,
  }));
  const mimeData = bval(N.mimeTypes) || [];
  if (pluginData.length && mimeData.length) {
    const { pluginArray, mimeTypeArray } = buildPluginTree(win, native, pluginData, mimeData);
    if (defineGetter(proto, 'plugins', mark(namedFn('plugins', () => pluginArray)))) applied.push('navigator.plugins');
    if (defineGetter(proto, 'mimeTypes', mark(namedFn('mimeTypes', () => mimeTypeArray)))) applied.push('navigator.mimeTypes');
  }

  // ── 2.3 sendBeacon：pceptor 会读 navigator.sendBeacon.toString() 的 native 标记 ──
  if (typeof nav.sendBeacon !== 'function') {
    const beacon = mark(namedFn('sendBeacon', function sendBeacon() { return true; }));
    defineValue(proto, 'sendBeacon', beacon, { enumerable: true });
    applied.push('navigator.sendBeacon');
  }

  // ── 2.4 connection（NetworkInformation，Firefox 有）──────────────────────
  if (!nav.connection) {
    const conn = makeInterfaceStub(win, native, 'NetworkInformation', {
      effectiveType: '4g', downlink: 10, rtt: 50, saveData: false,
      type: 'wifi', onchange: null,
    });
    defineGetter(proto, 'connection', mark(namedFn('connection', () => conn)));
    applied.push('navigator.connection');
  }

  // ── 2.5 其余接口型属性：给带正确 toStringTag 的空壳，避免 typeof 检测穿帮 ──
  const ifaceTags = ['permissions', 'mediaCapabilities', 'mediaDevices', 'serviceWorker', 'credentials',
    'clipboard', 'mediaSession', 'userActivation', 'wakeLock', 'login', 'gpu', 'geolocation', 'locks', 'storage'];
  const tagNameOf = { permissions: 'Permissions', mediaCapabilities: 'MediaCapabilities', mediaDevices: 'MediaDevices',
    serviceWorker: 'ServiceWorkerContainer', credentials: 'CredentialsContainer', clipboard: 'Clipboard',
    mediaSession: 'MediaSession', userActivation: 'UserActivation', wakeLock: 'WakeLock', login: 'NavigatorLogin',
    gpu: 'GPU', geolocation: 'Geolocation', locks: 'LockManager', storage: 'StorageManager' };
  for (const k of ifaceTags) {
    const entry = N[k];
    if (!entry || nav[k]) continue;
    const stub = makeInterfaceStub(win, native, tagNameOf[k] || k);
    if (defineGetter(proto, k, mark(namedFn(k, () => stub)))) applied.push('navigator.' + k);
  }

  // ── 2.6 明确「保持缺失」：Firefox 没有 userAgentData / deviceMemory / getBattery ──
  //    SDK 若检测这些，真实浏览器同样 undefined；补反而制造 Chrome 特征。
  for (const k of ['userAgentData', 'deviceMemory', 'getBattery']) {
    if (nav[k] !== undefined) {
      try { delete proto[k]; } catch (e) { /* ignore */ }
    }
  }
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. screen / window 尺寸
//    对应检测点：SDK 真读 screen.width/height、devicePixelRatio、innerWidth/innerHeight、
//                outerWidth/outerHeight（preinforce2 的 smid 指纹直接用三元判存在性）
//    jsdom 原值：screen 全 0，inner 1024x768，dpr 1
//    基线值：screen 1920x1080 avail 1920x1032 depth 24，inner 1906x969，dpr 1.25
// ─────────────────────────────────────────────────────────────────────────────
function patchScreenAndWindow(win, bundle, native) {
  const mark = native.markNative;
  const applied = [];
  const S = bundle.screen || {};
  const M = bundle.window && bundle.window.metrics ? bundle.window.metrics : {};
  const screenProto = win.Screen && win.Screen.prototype ? win.Screen.prototype : Object.getPrototypeOf(win.screen);

  const screenVals = {
    width: bval(S.width), height: bval(S.height),
    availWidth: bval(S.availWidth), availHeight: bval(S.availHeight),
    colorDepth: bval(S.colorDepth), pixelDepth: bval(S.pixelDepth),
    top: bval(S.top), left: bval(S.left),
    availTop: bval(S.availTop), availLeft: bval(S.availLeft),
    mozOrientation: bval(S.mozOrientation),
  };
  for (const [k, v] of Object.entries(screenVals)) {
    if (v === undefined) continue;
    if (defineGetter(screenProto, k, mark(namedFn(k, () => v)))) applied.push('screen.' + k);
  }
  // orientation：jsdom 没有 ScreenOrientation 实例
  if (!win.screen.orientation) {
    const orientation = { type: 'landscape-primary', angle: 0, onchange: null };
    defineValue(orientation, Symbol.toStringTag, 'ScreenOrientation', { writable: false, enumerable: false });
    if (defineGetter(screenProto, 'orientation', mark(namedFn('orientation', () => orientation)))) applied.push('screen.orientation');
  }

  const winVals = {
    innerWidth: bval(M.innerWidth), innerHeight: bval(M.innerHeight),
    outerWidth: bval(M.outerWidth), outerHeight: bval(M.outerHeight),
    screenX: bval(M.screenX), screenY: bval(M.screenY),
    screenLeft: bval(M.screenLeft), screenTop: bval(M.screenTop),
    devicePixelRatio: bval(M.devicePixelRatio),
    scrollX: bval(M.scrollX), scrollY: bval(M.scrollY),
    pageXOffset: bval(M.scrollX), pageYOffset: bval(M.scrollY),
    isSecureContext: bval(M.isSecureContext), crossOriginIsolated: bval(M.crossOriginIsolated),
  };
  for (const [k, v] of Object.entries(winVals)) {
    if (v === undefined) continue;
    if (defineGetter(win, k, mark(namedFn(k, () => v)))) applied.push('window.' + k);
  }
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. document 补丁
//    对应检测点：
//      - SDK 真读：document.compatMode（pceptor/pyuntu 用它选 documentElement 还是 body 取视口尺寸）
//      - 高危兜底：hasFocus()（jsdom 恒 false）、readyState（jsdom "loading"）
//    jsdom 原值：compatMode CSS1Compat（对）、hasFocus false、readyState loading
// ─────────────────────────────────────────────────────────────────────────────
function patchDocument(win, bundle, native) {
  const mark = native.markNative;
  const doc = win.document;
  const docProto = win.Document && win.Document.prototype ? win.Document.prototype : Object.getPrototypeOf(doc);
  const D = bundle.window && bundle.window.document ? bundle.window.document : {};
  const applied = [];

  const vals = {
    characterSet: bval(D.characterSet), compatMode: bval(D.compatMode),
    contentType: bval(D.contentType), readyState: bval(D.readyState),
    hidden: bval(D.hidden), visibilityState: bval(D.visibilityState),
    designMode: bval(D.designMode), dir: bval(D.dir),
  };
  for (const [k, v] of Object.entries(vals)) {
    if (v === undefined) continue;
    // 注意：定义在 Document.prototype 上（不要在 document 实例上造自有属性，
    // 否则 Object.getOwnPropertyNames(document).length 会暴露）
    if (defineGetter(docProto, k, mark(namedFn(k, () => v)))) applied.push('document.' + k);
  }

  defineValue(docProto, 'hasFocus', mark(namedFn('hasFocus', () => true)), { enumerable: true });
  applied.push('document.hasFocus');

  // Object.prototype.toString.call(document) → [object HTMLDocument]
  // jsdom 原值 [object Document]；Firefox 是 [object HTMLDocument]
  try {
    Object.defineProperty(docProto, Symbol.toStringTag, {
      get: mark(namedFn('toStringTag', function () {
        return win.HTMLDocument && this instanceof win.HTMLDocument ? 'HTMLDocument' : 'Document';
      })),
      configurable: true, enumerable: false,
    });
    applied.push('document[Symbol.toStringTag]');
  } catch (e) { /* ignore */ }

  // document.all：Firefox 有（typeof 'undefined' 的 undetectable）。这里只做「存在且可用」的最小版，
  // 真 undetectable 需要 --allow-natives-syntax，当前 SDK 未读到，先不做。
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DOM 布局（jsdom 无排版引擎，全部为 0）
//    对应检测点：
//      - SDK 真读：document.documentElement.clientWidth/clientHeight（pceptor/pyuntu 视口尺寸）
//      - 兜底：offsetHeight/offsetWidth/getBoundingClientRect（pyuntu 拿 canvas 尺寸做缩放比）
// ─────────────────────────────────────────────────────────────────────────────
function patchLayout(win, native) {
  const mark = native.markNative;
  const applied = [];
  const ElementProto = win.Element && win.Element.prototype;
  if (!ElementProto) return applied;

  const styleNum = (el, prop) => {
    try {
      const s = el.getAttribute && el.getAttribute('style');
      if (!s) return 0;
      const m = s.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*(-?[\\d.]+)px'));
      return m ? Math.round(parseFloat(m[1])) : 0;
    } catch (e) { return 0; }
  };
  const isViewportEl = (el) => el === win.document.documentElement || el === win.document.body;
  const viewportW = () => (typeof win.innerWidth === 'number' ? win.innerWidth : 1906);
  const viewportH = () => (typeof win.innerHeight === 'number' ? win.innerHeight : 969);

  const sizeGetter = (dim) => mark(namedFn(dim, function () {
    if (isViewportEl(this)) return dim.indexOf('eight') !== -1 ? viewportH() : viewportW();
    const v = styleNum(this, dim.indexOf('eight') !== -1 ? 'height' : 'width');
    if (v) return v;
    // 空块级元素：宽度撑满视口、高度 0（真实浏览器行为，比 300x150 的假默认更不容易被抓）
    return dim.indexOf('eight') !== -1 ? 0 : viewportW();
  }));

  // jsdom 把 clientWidth/scrollHeight 挂在 Element.prototype，把 offsetWidth/offsetHeight 挂在
  // HTMLElement.prototype —— 只补其中一个会被另一个自有描述符遮住，所以两边都补。
  const targets = [win.Element && win.Element.prototype, win.HTMLElement && win.HTMLElement.prototype]
    .filter(Boolean);
  for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight',
    'scrollWidth', 'scrollHeight', 'clientTop', 'clientLeft']) {
    let okAny = false;
    for (const proto of targets) {
      if (defineGetter(proto, prop, sizeGetter(prop))) okAny = true;
    }
    if (okAny) applied.push('Element/HTMLElement.' + prop);
  }
  // offsetTop/offsetLeft：视口内元素基本为 0
  for (const prop of ['offsetTop', 'offsetLeft']) {
    for (const proto of targets) defineGetter(proto, prop, mark(namedFn(prop, () => 0)));
    applied.push('Element/HTMLElement.' + prop);
  }
  // scrollTop/scrollLeft 保留 jsdom 可写语义（它们本身就是 0，SDK 也可能写）

  const rectOf = mark(namedFn('getBoundingClientRect', function getBoundingClientRect() {
    let w; let h;
    if (isViewportEl(this)) { w = viewportW(); h = viewportH(); } else {
      w = styleNum(this, 'width') || viewportW();
      h = styleNum(this, 'height') || 0;
    }
    const rect = {
      x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h,
      toJSON: mark(namedFn('toJSON', function toJSON() { return this; })),
    };
    return rect;
  }));
  defineValue(ElementProto, 'getBoundingClientRect', rectOf, { enumerable: true });
  applied.push('Element.getBoundingClientRect');

  defineValue(ElementProto, 'getClientRects', mark(namedFn('getClientRects', function getClientRects() {
    return [this.getBoundingClientRect()];
  })), { enumerable: true });
  applied.push('Element.getClientRects');
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Canvas：jsdom 的 getContext 直接 "Not implemented"
//    对应检测点（SDK 真读）：
//      - pceptor: createElement('canvas') → getContext('2d') → fill/arc/fillText → toDataURL()
//                 → 另做 getImageData(216,16,1,1) 取像素
//      - pyuntu:  getContext('2d') → toDataURL('image/jpeg',0.1)；canvas.getBoundingClientRect()
//    策略：toDataURL = 基线回放（直接返回真实浏览器的那串 dataURL，长度 7078，sha256 已知）；
//          measureText = 基线回放；getImageData = 由坐标确定性推导（无法从基线还原像素，见报告残余差异）
// ─────────────────────────────────────────────────────────────────────────────
function patchCanvas(win, bundle, native) {
  const mark = native.markNative;
  const applied = [];
  const C = win.HTMLCanvasElement && win.HTMLCanvasElement.prototype;
  if (!C) return applied;

  const canvas = bundle.canvas || {};
  const dataUrl = canvas.data_url || '';
  const measure = canvas.measure_text || {};
  const defaultFont = canvas.font || "14px 'Arial'";

  // 确定性伪像素：同一坐标永远得到同一组字节，保证 SDK 多次运行的 canvas 指纹稳定
  function fakePixels(x, y, w, h) {
    const len = Math.max(4, (w | 0) * (h | 0) * 4);
    const out = new Uint8ClampedArray(len);
    let seed = ((x | 0) * 73856093) ^ ((y | 0) * 19349663) ^ ((w | 0) * 83492791) ^ ((h | 0) * 2654435761);
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out[i] = (seed >>> 16) & 0xff;
    }
    return out;
  }

  function make2dContext(canvasEl) {
    const ctx = {
      canvas: canvasEl,
      font: defaultFont,
      textBaseline: 'alphabetic',
      textAlign: 'start',
      fillStyle: '#000000',
      strokeStyle: '#000000',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      shadowBlur: 0,
      shadowColor: 'rgba(0, 0, 0, 0)',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      imageSmoothingEnabled: true,
      direction: 'ltr',
    };
    const noop = (name) => mark(namedFn(name, () => undefined));
    for (const m of ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke', 'clip',
      'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'quadraticCurveTo',
      'bezierCurveTo', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
      'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform',
      'drawImage', 'putImageData', 'setLineDash', 'drawFocusIfNeeded']) {
      ctx[m] = noop(m);
    }
    ctx.getLineDash = mark(namedFn('getLineDash', () => []));
    ctx.isPointInPath = mark(namedFn('isPointInPath', () => false));
    ctx.isPointInStroke = mark(namedFn('isPointInStroke', () => false));
    ctx.measureText = mark(namedFn('measureText', function measureText(text) {
      const key = String(ctx.font || defaultFont);
      const base = measure[key] || measure[defaultFont] || { width: 0 };
      // 基线是按固定样本文本采的；换文本时按字符数线性缩放，保证同一文本稳定
      const sample = canvas.sample_text || '';
      const ratio = sample ? (String(text).length / sample.length) : 1;
      const width = (base.width || 0) * (ratio || 1);
      return {
        width,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: width,
        actualBoundingBoxAscent: base.actualBoundingBoxAscent || 0,
        actualBoundingBoxDescent: base.actualBoundingBoxDescent || 0,
        fontBoundingBoxAscent: base.fontBoundingBoxAscent || 0,
        fontBoundingBoxDescent: base.fontBoundingBoxDescent || 0,
        emHeightAscent: 0, emHeightDescent: 0, hangingBaseline: 0, alphabeticBaseline: 0,
        ideographicBaseline: 0,
      };
    }));
    ctx.getImageData = mark(namedFn('getImageData', function getImageData(x, y, w, h) {
      const width = w >>> 0; const height = h >>> 0;
      return { width, height, data: fakePixels(x, y, width, height), colorSpace: 'srgb' };
    }));
    ctx.createImageData = mark(namedFn('createImageData', function createImageData(w, h) {
      const width = (w && w.width) || w >>> 0; const height = (w && w.height) || h >>> 0;
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    }));
    ctx.createLinearGradient = mark(namedFn('createLinearGradient', () => ({ addColorStop: mark(namedFn('addColorStop', () => undefined)) })));
    ctx.createRadialGradient = mark(namedFn('createRadialGradient', () => ({ addColorStop: mark(namedFn('addColorStop', () => undefined)) })));
    ctx.createPattern = mark(namedFn('createPattern', () => ({})));
    ctx.getContextAttributes = mark(namedFn('getContextAttributes', () => ({ alpha: true, desynchronized: false, willReadFrequently: false })));
    defineValue(ctx, Symbol.toStringTag, 'CanvasRenderingContext2D', { writable: false, enumerable: false });
    return ctx;
  }

  const ctxCache = new WeakMap();
  const origGetContext = C.getContext;
  defineValue(C, 'getContext', mark(namedFn('getContext', function getContext(type, attrs) {
    const t = String(type || '').toLowerCase();
    if (t === '2d') {
      if (!ctxCache.has(this)) ctxCache.set(this, make2dContext(this));
      return ctxCache.get(this);
    }
    if (t === 'webgl' || t === 'experimental-webgl' || t === 'moz-webgl') return getWebGL(this, 1, bundle, native);
    if (t === 'webgl2') return getWebGL(this, 2, bundle, native);
    return null;
  })), { enumerable: true });
  applied.push('HTMLCanvasElement.getContext');

  defineValue(C, 'toDataURL', mark(namedFn('toDataURL', function toDataURL() {
    // 基线回放：任何绘制参数都返回真实浏览器采到的那串 PNG
    return dataUrl;
  })), { enumerable: true });
  applied.push('HTMLCanvasElement.toDataURL');

  defineValue(C, 'toBlob', mark(namedFn('toBlob', function toBlob(cb) {
    if (typeof cb === 'function') win.setTimeout(() => cb(null), 0);
  })), { enumerable: true });

  // 记录一下原实现，供 diff 用
  C.__origGetContext = origGetContext;
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. WebGL：jsdom 没有 GL 上下文
//    对应检测点（SDK 真读）：pceptor
//      createElement('canvas').getContext('webgl') → getParameter(VENDOR/RENDERER/VERSION/...)
//      → getSupportedExtensions() / getExtension('WEBGL_debug_renderer_info')
//    策略：基线回放（参数、扩展列表、context attributes、shader precision 全部来自 bundle）
// ─────────────────────────────────────────────────────────────────────────────
const GL_ENUMS = {
  VENDOR: 0x1F00, RENDERER: 0x1F01, VERSION: 0x1F02, SHADING_LANGUAGE_VERSION: 0x8B8C,
  MAX_TEXTURE_SIZE: 0x0D33, MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C, MAX_RENDERBUFFER_SIZE: 0x84E8,
  MAX_VIEWPORT_DIMS: 0x0D3A, MAX_VERTEX_ATTRIBS: 0x8869, MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB,
  MAX_VARYING_VECTORS: 0x8DFC, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C, MAX_TEXTURE_IMAGE_UNITS: 0x8872,
  MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD, ALIASED_LINE_WIDTH_RANGE: 0x846E,
  ALIASED_POINT_SIZE_RANGE: 0x846D, RED_BITS: 0x0D52, GREEN_BITS: 0x0D53, BLUE_BITS: 0x0D54,
  ALPHA_BITS: 0x0D55, DEPTH_BITS: 0x0D56, STENCIL_BITS: 0x0D57, SUBPIXEL_BITS: 0x0D50,
  UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246,
  VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30,
  HIGH_FLOAT: 0x8DF2, MEDIUM_FLOAT: 0x8DF1, LOW_FLOAT: 0x8DF0,
  HIGH_INT: 0x8DF5, MEDIUM_INT: 0x8DF4, LOW_INT: 0x8DF3,
  MAX_SAMPLES: 0x8D57,
};

function buildWebGLContext(canvasEl, kind, bundle, native) {
  const mark = native.markNative;
  const W = bundle.webgl || {};
  const isV2 = kind === 2;

  const params = new Map();
  const p = W.parameters || {};
  params.set(GL_ENUMS.MAX_VIEWPORT_DIMS, new Int32Array([16384, 16384]));       // 基线捕获为 null，取典型值
  params.set(GL_ENUMS.ALIASED_LINE_WIDTH_RANGE, new Float32Array([1, 1]));      // 同上
  params.set(GL_ENUMS.ALIASED_POINT_SIZE_RANGE, new Float32Array([1, 1024]));   // 同上
  for (const k of Object.keys(p)) {
    if (!(k in GL_ENUMS)) continue;
    const v = p[k];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) params.set(GL_ENUMS[k], new Float32Array(v));
    else params.set(GL_ENUMS[k], v);
  }
  params.set(GL_ENUMS.VENDOR, W.vendor);
  params.set(GL_ENUMS.RENDERER, W.renderer);
  params.set(GL_ENUMS.VERSION, isV2 ? (W.webgl2 && W.webgl2.version) || 'WebGL 2.0' : W.version);
  params.set(GL_ENUMS.SHADING_LANGUAGE_VERSION, W.shading_language_version);
  params.set(GL_ENUMS.UNMASKED_VENDOR_WEBGL, W.unmasked_vendor);
  params.set(GL_ENUMS.UNMASKED_RENDERER_WEBGL, W.unmasked_renderer);
  if (isV2) params.set(GL_ENUMS.MAX_SAMPLES, (W.webgl2 && W.webgl2.max_samples) || 8);

  const extList = isV2
    ? ((W.webgl2 && W.webgl2.extensions) || [])
    : (W.extensions || []);

  const gl = { canvas: canvasEl, drawingBufferWidth: 300, drawingBufferHeight: 150 };
  // 常量表（SDK 可能直接拿 gl.VENDOR 之类）
  for (const [k, v] of Object.entries(GL_ENUMS)) gl[k] = v;

  gl.getParameter = mark(namedFn('getParameter', function getParameter(enumName) {
    if (params.has(enumName)) return params.get(enumName);
    return null;
  }));
  gl.getSupportedExtensions = mark(namedFn('getSupportedExtensions', () => extList.slice()));
  gl.getExtension = mark(namedFn('getExtension', function getExtension(name) {
    if (extList.indexOf(name) === -1) return null;
    if (name === 'WEBGL_debug_renderer_info') {
      return { UNMASKED_VENDOR_WEBGL: GL_ENUMS.UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL: GL_ENUMS.UNMASKED_RENDERER_WEBGL };
    }
    return {};
  }));
  gl.getContextAttributes = mark(namedFn('getContextAttributes', () => Object.assign({}, W.context_attributes || {})));
  const precision = W.shader_precision || {};
  gl.getShaderPrecisionFormat = mark(namedFn('getShaderPrecisionFormat', function getShaderPrecisionFormat(shaderType, precisionType) {
    const prefix = shaderType === GL_ENUMS.FRAGMENT_SHADER ? 'FRAGMENT_SHADER' : 'VERTEX_SHADER';
    let name = 'HIGH_FLOAT';
    if (precisionType === GL_ENUMS.MEDIUM_FLOAT) name = 'MEDIUM_FLOAT';
    else if (precisionType === GL_ENUMS.LOW_FLOAT) name = 'LOW_FLOAT';
    else if (precisionType === GL_ENUMS.HIGH_INT) name = 'HIGH_INT';
    else if (precisionType === GL_ENUMS.MEDIUM_INT) name = 'MEDIUM_INT';
    else if (precisionType === GL_ENUMS.LOW_INT) name = 'LOW_INT';
    const v = precision[prefix + '.' + name] || [127, 127, 23];
    return { rangeMin: v[1], rangeMax: v[0], precision: v[2] };
  }));

  const noopNames = ['activeTexture', 'attachShader', 'bindAttribLocation', 'bindBuffer', 'bindFramebuffer',
    'bindRenderbuffer', 'bindTexture', 'blendColor', 'blendEquation', 'blendEquationSeparate', 'blendFunc',
    'blendFuncSeparate', 'bufferData', 'bufferSubData', 'checkFramebufferStatus', 'clear', 'clearColor',
    'clearDepth', 'clearStencil', 'colorMask', 'compileShader', 'compressedTexImage2D', 'copyTexImage2D',
    'createBuffer', 'createFramebuffer', 'createProgram', 'createRenderbuffer', 'createShader', 'createTexture',
    'cullFace', 'deleteBuffer', 'deleteFramebuffer', 'deleteProgram', 'deleteRenderbuffer', 'deleteShader',
    'deleteTexture', 'depthFunc', 'depthMask', 'depthRange', 'detachShader', 'disable', 'disableVertexAttribArray',
    'drawArrays', 'drawElements', 'enable', 'enableVertexAttribArray', 'finish', 'flush', 'framebufferRenderbuffer',
    'framebufferTexture2D', 'frontFace', 'generateMipmap', 'getActiveAttrib', 'getActiveUniform',
    'getAttachedShaders', 'getAttribLocation', 'getBufferParameter', 'getError', 'getFramebufferAttachmentParameter',
    'getProgramInfoLog', 'getProgramParameter', 'getRenderbufferParameter', 'getShaderInfoLog', 'getShaderParameter',
    'getShaderSource', 'getTexParameter', 'getUniform', 'getUniformLocation', 'getVertexAttrib', 'getVertexAttribOffset',
    'hint', 'isBuffer', 'isEnabled', 'isFramebuffer', 'isProgram', 'isRenderbuffer', 'isShader', 'isTexture',
    'lineWidth', 'linkProgram', 'pixelStorei', 'polygonOffset', 'readPixels', 'renderbufferStorage', 'sampleCoverage',
    'scissor', 'shaderSource', 'stencilFunc', 'stencilFuncSeparate', 'stencilMask', 'stencilMaskSeparate',
    'stencilOp', 'stencilOpSeparate', 'texImage2D', 'texParameterf', 'texParameteri', 'texSubImage2D',
    'uniform1f', 'uniform1fv', 'uniform1i', 'uniform1iv', 'uniform2f', 'uniform2fv', 'uniform2i', 'uniform2iv',
    'uniform3f', 'uniform3fv', 'uniform3i', 'uniform3iv', 'uniform4f', 'uniform4fv', 'uniform4i', 'uniform4iv',
    'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv', 'useProgram', 'validateProgram',
    'vertexAttrib1f', 'vertexAttrib2f', 'vertexAttrib3f', 'vertexAttrib4f', 'vertexAttribPointer', 'viewport',
    'getTranslatedShaderSource'];
  for (const m of noopNames) {
    if (gl[m] === undefined) gl[m] = mark(namedFn(m, () => null));
  }
  gl.getError = mark(namedFn('getError', () => 0));
  gl.isContextLost = mark(namedFn('isContextLost', () => false));
  defineValue(gl, Symbol.toStringTag, isV2 ? 'WebGL2RenderingContext' : 'WebGLRenderingContext', { writable: false, enumerable: false });
  return gl;
}

const GL_CACHE = new WeakMap();
function getWebGL(canvasEl, kind, bundle, native) {
  const key = kind;
  let perCanvas = GL_CACHE.get(canvasEl);
  if (!perCanvas) { perCanvas = {}; GL_CACHE.set(canvasEl, perCanvas); }
  if (!perCanvas[key]) perCanvas[key] = buildWebGLContext(canvasEl, kind, bundle, native);
  return perCanvas[key];
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Audio 指纹（基线回放）
//    实读证据：scan_env_refs 在三个 SDK 里对 AudioContext/OfflineAudioContext 的命中数为 0
//    → 属于「补了保险」，不是必读项。仍按基线给 sampleRate/baseLatency/maxChannelCount。
// ─────────────────────────────────────────────────────────────────────────────
function patchAudio(win, bundle, native) {
  const mark = native.markNative;
  const applied = [];
  const A = bundle.audio || {};

  function makeAudioContext(kind) {
    const isOffline = kind === 'offline';
    const sampleRate = isOffline ? (A.offline_sample_rate || 44100) : (A.sample_rate || 48000);
    const ctx = {
      sampleRate, currentTime: 0, state: isOffline ? 'suspended' : (A.state || 'suspended'),
      baseLatency: A.base_latency || 0, outputLatency: A.output_latency || 0,
      listener: {}, destination: { maxChannelCount: A.max_channel_count || 2, channelCount: 2 },
    };
    const noopNode = (name) => ({ connect: mark(namedFn('connect', () => undefined)), disconnect: mark(namedFn('disconnect', () => undefined)), name });
    for (const m of ['createOscillator', 'createGain', 'createDynamicsCompressor', 'createAnalyser',
      'createBiquadFilter', 'createBufferSource', 'createScriptProcessor', 'createStereoPanner',
      'createChannelMerger', 'createChannelSplitter', 'createConvolver', 'createDelay',
      'createWaveShaper', 'createPanner', 'createPeriodicWave']) {
      ctx[m] = mark(namedFn(m, () => noopNode(m)));
    }
    ctx.createBuffer = mark(namedFn('createBuffer', function createBuffer(ch, len, sr) {
      const n = len >>> 0 || 5000;
      const data = new Float32Array(n);
      return {
        numberOfChannels: ch || 1, length: n, sampleRate: sr || sampleRate, duration: n / (sr || sampleRate),
        getChannelData: mark(namedFn('getChannelData', () => data)),
      };
    }));
    ctx.resume = mark(namedFn('resume', () => win.Promise.resolve()));
    ctx.suspend = mark(namedFn('suspend', () => win.Promise.resolve()));
    ctx.close = mark(namedFn('close', () => win.Promise.resolve()));
    if (isOffline) {
      ctx.startRendering = mark(namedFn('startRendering', function startRendering() {
        const n = 5000;
        const data = new Float32Array(n);
        // 稳定的确定性数据（基线 audio 指纹 35.749972093850374 无法由样本反推，这里只保证「有值且稳定」）
        let seed = 12345;
        for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; data[i] = (seed / 0x7fffffff) * 2 - 1; }
        return win.Promise.resolve({
          numberOfChannels: 1, length: n, sampleRate: ctx.sampleRate, duration: n / ctx.sampleRate,
          getChannelData: mark(namedFn('getChannelData', () => data)),
        });
      }));
    }
    defineValue(ctx, Symbol.toStringTag, isOffline ? 'OfflineAudioContext' : 'AudioContext', { writable: false, enumerable: false });
    return ctx;
  }

  defineValue(win, 'AudioContext', mark(namedFn('AudioContext', function AudioContext() { return makeAudioContext('online'); })), { enumerable: true });
  defineValue(win, 'webkitAudioContext', win.AudioContext, { enumerable: true });
  defineValue(win, 'OfflineAudioContext', mark(namedFn('OfflineAudioContext', function OfflineAudioContext() { return makeAudioContext('offline'); })), { enumerable: true });
  applied.push('window.AudioContext', 'window.OfflineAudioContext');
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. CSS：getComputedStyle / insertRule / <style> 插入
//    对应检测点：pyuntu 解混淆后可见 webpack style-loader 会 appendChild(<style>) 并调 insertRule，
//                原本报 "Couldn't find a style target"；同时它会读 getComputedStyle
//    jsdom 原值：getComputedStyle 只回 'auto'/空；insertRule 可用；<style> 可插入
//    基线值：383 个 CSS 属性名与初始值（bundle.css.values）
// ─────────────────────────────────────────────────────────────────────────────
function patchCSS(win, bundle, native) {
  const mark = native.markNative;
  const applied = [];
  const C = bundle.css || {};
  const values = C.values || {};
  const props = C.props || Object.keys(values);

  const origGetComputedStyle = win.getComputedStyle;
  const cache = new WeakMap();

  const view = (el) => {
    if (cache.has(el)) return cache.get(el);
    const base = origGetComputedStyle ? origGetComputedStyle.call(win, el) : null;
    const store = Object.assign({}, values);
    const decl = {
      getPropertyValue: mark(namedFn('getPropertyValue', (n) => (store[n] !== undefined ? store[n] : (base ? base.getPropertyValue(n) : '')))),
      getPropertyPriority: mark(namedFn('getPropertyPriority', () => '')),
      setProperty: mark(namedFn('setProperty', function (n, v) { store[n] = String(v); })),
      removeProperty: mark(namedFn('removeProperty', function (n) { const old = store[n]; delete store[n]; return old || ''; })),
      item: mark(namedFn('item', (i) => props[i] || '')),
      get length() { return props.length; },
    };
    for (const p of props) {
      if (decl[p] === undefined) {
        Object.defineProperty(decl, p, {
          get: mark(namedFn(p.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), () => store[p])),
          enumerable: true, configurable: true,
        });
      }
    }
    decl[Symbol.iterator] = mark(namedFn('values', function* () { yield* props.map((p) => store[p]); }));
    defineValue(decl, Symbol.toStringTag, 'CSSStyleDeclaration', { writable: false, enumerable: false });
    cache.set(el, decl);
    return decl;
  };

  defineValue(win, 'getComputedStyle', mark(namedFn('getComputedStyle', function getComputedStyle(el) {
    return view(el || win.document.documentElement);
  })), { enumerable: true });
  applied.push('window.getComputedStyle');

  defineValue(win, 'getDefaultComputedStyle', win.getComputedStyle, { enumerable: true });

  // CSSStyleSheet.insertRule / deleteRule / addRule：jsdom 自带部分实现，缺失则补最小可用版
  const sheetProto = win.CSSStyleSheet && win.CSSStyleSheet.prototype;
  if (sheetProto) {
    if (typeof sheetProto.insertRule !== 'function') {
      defineValue(sheetProto, 'insertRule', mark(namedFn('insertRule', function insertRule(rule) {
        if (!this.cssRules) this.cssRules = [];
        this.cssRules.push({ cssText: String(rule) });
        return this.cssRules.length - 1;
      })), { enumerable: true });
      applied.push('CSSStyleSheet.insertRule');
    }
    if (typeof sheetProto.deleteRule !== 'function') {
      defineValue(sheetProto, 'deleteRule', mark(namedFn('deleteRule', function deleteRule(i) {
        if (this.cssRules && typeof this.cssRules.splice === 'function') this.cssRules.splice(i, 1);
      })), { enumerable: true });
    }
    if (typeof sheetProto.addRule !== 'function') {
      defineValue(sheetProto, 'addRule', mark(namedFn('addRule', function addRule(sel, decl, i) {
        return this.insertRule(sel + '{' + decl + '}', i || 0);
      })), { enumerable: true });
    }
  }
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. 杂项 API 兜底（存在性检测类）
//     基线 window.globals 里这些是 function；jsdom 缺 → SDK 做 typeof 检测会掉分支
//     注意：window.chrome / navigator.userAgentData 在 Firefox 基线里**不存在**，绝不补
// ─────────────────────────────────────────────────────────────────────────────
function patchMiscAPI(win, bundle, native) {
  const mark = native.markNative;
  const applied = [];
  const stubs = {
    requestIdleCallback: function requestIdleCallback(cb) { return win.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1); },
    cancelIdleCallback: function cancelIdleCallback(id) { win.clearTimeout(id); },
    reportError: function reportError() { undefined; },
    structuredClone: function structuredClone(v) { return JSON.parse(JSON.stringify(v)); },
  };
  for (const [k, fn] of Object.entries(stubs)) {
    if (win[k] === undefined) { defineValue(win, k, mark(namedFn(k, fn)), { enumerable: true }); applied.push('window.' + k); }
  }
  // Notification / Worker / SharedWorker / RTCPeerConnection：Firefox 都有，jsdom 缺
  if (!win.Notification) {
    const N = mark(namedFn('Notification', function Notification() { undefined; }));
    N.permission = 'default';
    N.requestPermission = mark(namedFn('requestPermission', () => win.Promise.resolve('default')));
    N.maxActions = 2;
    defineValue(win, 'Notification', N, { enumerable: true });
    applied.push('window.Notification');
  }
  if (!win.RTCPeerConnection) {
    defineValue(win, 'RTCPeerConnection', mark(namedFn('RTCPeerConnection', function RTCPeerConnection() {
      return { createDataChannel: mark(namedFn('createDataChannel', () => ({}))), createOffer: mark(namedFn('createOffer', () => win.Promise.resolve({}))), setLocalDescription: mark(namedFn('setLocalDescription', () => win.Promise.resolve())), close: mark(namedFn('close', () => undefined)), localDescription: null, onicecandidate: null };
    })), { enumerable: true });
    applied.push('window.RTCPeerConnection');
  }
  // document.fonts（FontFaceSet）
  if (!win.document.fonts) {
    const fonts = {
      ready: win.Promise.resolve(), status: 'loaded', size: 0,
      check: mark(namedFn('check', () => true)),
      load: mark(namedFn('load', () => win.Promise.resolve([]))),
      add: mark(namedFn('add', () => undefined)),
      forEach: mark(namedFn('forEach', () => undefined)),
    };
    defineValue(fonts, Symbol.toStringTag, 'FontFaceSet', { writable: false, enumerable: false });
    defineGetter(win.Document.prototype, 'fonts', mark(namedFn('fonts', () => fonts)));
    applied.push('document.fonts');
  }
  // visualViewport
  if (!win.visualViewport) {
    const vv = {
      width: win.innerWidth, height: win.innerHeight, offsetLeft: 0, offsetTop: 0,
      pageLeft: 0, pageTop: 0, scale: 1, onresize: null, onscroll: null,
      addEventListener: mark(namedFn('addEventListener', () => undefined)),
      removeEventListener: mark(namedFn('removeEventListener', () => undefined)),
    };
    defineValue(vv, Symbol.toStringTag, 'VisualViewport', { writable: false, enumerable: false });
    defineGetter(win, 'visualViewport', mark(namedFn('visualViewport', () => vv)));
    applied.push('window.visualViewport');
  }
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. 网络隔离（出值阶段禁止真发包，避免污染服务端）
//     SDK 真读：pceptor 里有 `window.XMLHttpRequest ? new XMLHttpRequest() : ActiveXObject(...)`
//    → XHR 必须**存在**且能 new，但 send 不发
// ─────────────────────────────────────────────────────────────────────────────
function patchNetwork(win, native) {
  const mark = native.markNative;
  const applied = [];
  const netLog = [];
  const XHR = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
  if (XHR) {
    defineValue(XHR, 'send', mark(namedFn('send', function send(body) {
      netLog.push({ method: this.__method || 'GET', url: this.__url || '', size: body ? String(body).length : 0 });
      // 不回包：保持 readyState 0/1，SDK 的上报回调不触发，但也不会抛异常
    })), { enumerable: true });
    const origOpen = XHR.open;
    defineValue(XHR, 'open', mark(namedFn('open', function open(method, url) {
      this.__method = method; this.__url = url;
      return origOpen.apply(this, arguments);
    })), { enumerable: true });
    applied.push('XMLHttpRequest.send(拦截)');
  }
  if (typeof win.fetch === 'function') {
    defineValue(win, 'fetch', mark(namedFn('fetch', function fetch() {
      netLog.push({ method: 'FETCH', url: arguments[0] && String(arguments[0]).slice(0, 200) || '', size: 0 });
      return win.Promise.resolve({
        ok: true, status: 200, statusText: 'OK', headers: { get: () => null },
        json: () => win.Promise.resolve({}), text: () => win.Promise.resolve('{}'),
      });
    })), { enumerable: true });
    applied.push('fetch(拦截)');
  }
  return { applied, netLog };
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. 清 Node 特征
//     对应检测点：SDK 若枚举 window 自有属性，process/require/Buffer 是最直接的沙箱标记
// ─────────────────────────────────────────────────────────────────────────────
function hideNodeFeatures(win, native) {
  const applied = [];
  for (const k of ['process', 'module', 'exports', 'require', 'global', '__filename', '__dirname', 'Buffer', 'setImmediate']) {
    try {
      if (win[k] !== undefined) { delete win[k]; applied.push('delete window.' + k); }
    } catch (e) {
      try { defineValue(win, k, undefined, { enumerable: false }); applied.push('window.' + k + '=undefined'); } catch (e2) { /* ignore */ }
    }
  }
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. 站点侧已知状态种子（localStorage）
//    已知事实：站点/后续业务会读 localStorage 的 sk / yuntuSession / dwsm / DUOTELUUID 等。
//    我们只有 key 名与长度，没有值 → 这里只保证 storage 可用 + 可种子注入。
// ─────────────────────────────────────────────────────────────────────────────
function seedStorage(win, bundle, extraSeed) {
  const applied = [];
  const S = bundle.storage || {};
  const seed = extraSeed || {};
  // 只写真值；没有真值就不写（长度已知但内容未知，伪造长度反而制造不一致）
  for (const [k, v] of Object.entries(seed)) {
    try { win.localStorage.setItem(k, String(v)); applied.push('localStorage.' + k); } catch (e) { /* ignore */ }
  }
  const keys = ((S.localStorage && S.localStorage.keys) || []).map((x) => x[0]);
  return { applied, requiredButMissing: keys.filter((k) => !(k in seed)) };
}

// ─────────────────────────────────────────────────════════════════════════════
// 主入口
// ─────────────────────────────────────────────────════════════════════════════
/**
 * createEnv({ bundlePath, url, seedStorage, blockNetwork })
 * @returns {{
 *   dom, window, document, navigator, screen, bundle,
 *   evalSource(code, filename) -> any,
 *   globals(extraSkipList) -> string[],
 *   netLog: Array, patchLog: Array, storageMissing: string[], virtualConsole: VirtualConsole,
 *   dispose(): void
 * }}
 */
// 12.5 读值追踪（可选）：回答「SDK 到底读了哪些字段」
//      静态证据来自 scripts/scan_env_refs.js（解混淆后 grep）；
//      运行期证据来自这里：在补丁后的 getter / 方法外面套一层计数器，
//      加载完 SDK 看计数，就知道哪一项是它真的读了，哪一项只是我们补的保险。
function installReadTrace(win, native) {
  const mark = native.markNative;
  const counts = new Map();
  const bump = (label) => counts.set(label, (counts.get(label) || 0) + 1);
  const wrapped = [];

  const wrapGetter = (obj, prop, label) => {
    if (!obj) return;
    let desc;
    try { desc = Object.getOwnPropertyDescriptor(obj, prop); } catch (e) { return; }
    if (!desc) return;
    if (typeof desc.get === 'function') {
      const g = desc.get;
      try {
        Object.defineProperty(obj, prop, {
          get: mark(namedFn(prop, function () { bump(label); return g.call(this); })),
          set: desc.set, enumerable: desc.enumerable, configurable: true,
        });
        wrapped.push(label);
      } catch (e) { /* ignore */ }
    } else if ('value' in desc) {
      const v = desc.value;
      try {
        Object.defineProperty(obj, prop, {
          get: mark(namedFn(prop, function () { bump(label); return v; })),
          set: desc.set, enumerable: desc.enumerable, configurable: true,
        });
        wrapped.push(label);
      } catch (e) { /* ignore */ }
    }
  };

  const wrapMethod = (obj, prop, label) => {
    if (!obj) return;
    let desc;
    try { desc = Object.getOwnPropertyDescriptor(obj, prop); } catch (e) { return; }
    if (!desc || typeof desc.value !== 'function') return;
    const fn = desc.value;
    try {
      Object.defineProperty(obj, prop, {
        value: mark(namedFn(prop, function () { bump(label); return fn.apply(this, arguments); })),
        writable: true, enumerable: desc.enumerable, configurable: true,
      });
      wrapped.push(label);
    } catch (e) { /* ignore */ }
  };

  const NP = win.Navigator && win.Navigator.prototype;
  for (const p of ['userAgent', 'platform', 'oscpu', 'appVersion', 'appName', 'appCodeName', 'product',
    'productSub', 'vendor', 'vendorSub', 'buildID', 'language', 'languages', 'hardwareConcurrency',
    'maxTouchPoints', 'webdriver', 'doNotTrack', 'cookieEnabled', 'onLine', 'pdfViewerEnabled',
    'globalPrivacyControl', 'plugins', 'mimeTypes', 'connection']) wrapGetter(NP, p, 'navigator.' + p);

  const SP = win.Screen && win.Screen.prototype;
  for (const p of ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth',
    'orientation', 'availLeft', 'availTop']) wrapGetter(SP, p, 'screen.' + p);

  for (const p of ['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio',
    'screenX', 'screenY', 'isSecureContext']) wrapGetter(win, p, 'window.' + p);

  const DP = win.Document && win.Document.prototype;
  for (const p of ['compatMode', 'readyState', 'visibilityState', 'hidden', 'cookie', 'characterSet',
    'referrer', 'title', 'designMode', 'contentType', 'domain']) wrapGetter(DP, p, 'document.' + p);
  wrapMethod(DP, 'hasFocus', 'document.hasFocus');
  wrapMethod(DP, 'createElement', 'document.createElement');
  wrapMethod(DP, 'querySelector', 'document.querySelector');
  wrapMethod(DP, 'getElementsByTagName', 'document.getElementsByTagName');

  const EP = win.Element && win.Element.prototype;
  for (const p of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight']) wrapGetter(EP, p, 'element.' + p);
  wrapMethod(EP, 'getBoundingClientRect', 'element.getBoundingClientRect');

  const CP = win.HTMLCanvasElement && win.HTMLCanvasElement.prototype;
  wrapMethod(CP, 'getContext', 'canvas.getContext');
  wrapMethod(CP, 'toDataURL', 'canvas.toDataURL');

  wrapMethod(win, 'getComputedStyle', 'window.getComputedStyle');
  wrapMethod(win.URLSearchParams && win.URLSearchParams.prototype, 'get', 'URLSearchParams.get');
  wrapMethod(win.Storage && win.Storage.prototype, 'getItem', 'Storage.getItem');
  wrapMethod(win.Storage && win.Storage.prototype, 'setItem', 'Storage.setItem');
  wrapMethod(win.XMLHttpRequest && win.XMLHttpRequest.prototype, 'send', 'XHR.send');
  wrapMethod(win, 'setTimeout', 'window.setTimeout');

  return {
    wrapped,
    snapshot() {
      return Array.from(counts.entries())
        .map(([label, n]) => ({ label, n }))
        .sort((a, b) => b.n - a.n);
    },
  };
}

function createEnv(options) {
  const o = options || {};
  const bundle = o.bundlePath ? loadBundle(o.bundlePath) : loadBundle(DEFAULT_BUNDLE);
  const url = o.url || DEFAULT_ORIGIN;

  // ⓿ 时区：基线的 Date.getTimezoneOffset() 与 toLocaleString 都带 -480 / Asia/Shanghai，
  //    Node 在本机支持运行期改 process.env.TZ（实测 win32 + node24 生效），先对齐再接沙箱。
  const tz = bundle.timing && bundle.timing.timezone ? bval(bundle.timing.timezone) : null;
  const tzApplied = [];
  if (o.timezone !== false && tz) {
    const before = process.env.TZ;
    if (before !== tz) {
      process.env.TZ = tz;
      tzApplied.push('TZ=' + tz + (before ? '（原 ' + before + '）' : ''));
    }
  }

  // jsdom 的 "Not implemented" 噪音（iframe 导航 / canvas）收进 buffer，不污染 stdout
  const hits = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => hits.push({ type: 'jsdomError', message: String(e && e.message || e).slice(0, 300) }));
  virtualConsole.on('error', (...a) => hits.push({ type: 'error', message: a.map(String).join(' ').slice(0, 300) }));
  virtualConsole.on('warn', () => undefined);
  virtualConsole.on('log', () => undefined);

  const dom = new JSDOM('<!doctype html><html lang="zh-CN"><head></head><body></body></html>', {
    url,
    referrer: url,
    contentType: 'text/html',
    pretendToBeVisual: true,
    runScripts: 'outside-only', // 关键：拿到 window.eval / window.Function，但不执行页面脚本
    // skill case「jsvmp-xhr-interceptor-env-emulation」坑 11：
    // JSVMP 的 XHR 拦截器依赖 jsdom 的完整 XHR 实现，缺少 resources:'usable' 时
    // SDK 能加载、但不触发拦截（表现为"发请求没被加密"）。默认关闭以保持既有 35/35 回归，
    // 需要拦截器生效时显式传 resources:true。
    ...(o.resources ? { resources: 'usable' } : {}),
    virtualConsole,
  });
  const win = dom.window;
  const patchLog = [];

  // ① markNative 必须先装：后面所有补丁函数都要过它
  const native = createNativePatcher(win);
  patchLog.push('markNative(Function.prototype.toString → Firefox 多行格式)');
  for (const x of tzApplied) patchLog.push('时区对齐：' + x);

  // ② 先扫一遍 jsdom 自带原型链，把 DOM API 全部伪装成原生
  native.scanAll();
  patchLog.push('scanAll(jsdom 原型链批量 native 化)');

  // ③ 逐项补环境（顺序见 docs/env_report.md）
  for (const x of patchNavigator(win, bundle, native)) patchLog.push(x);
  for (const x of patchScreenAndWindow(win, bundle, native)) patchLog.push(x);
  for (const x of patchDocument(win, bundle, native)) patchLog.push(x);
  for (const x of patchLayout(win, native)) patchLog.push(x);
  for (const x of patchCanvas(win, bundle, native)) patchLog.push(x);
  for (const x of patchAudio(win, bundle, native)) patchLog.push(x);
  for (const x of patchCSS(win, bundle, native)) patchLog.push(x);
  for (const x of patchMiscAPI(win, bundle, native)) patchLog.push(x);

  let netLog = [];
  if (o.blockNetwork !== false) {
    const net = patchNetwork(win, native);
    netLog = net.netLog;
    for (const x of net.applied) patchLog.push(x);
  }

  for (const x of hideNodeFeatures(win, native)) patchLog.push(x);
  const seeded = seedStorage(win, bundle, o.seedStorage);
  for (const x of seeded.applied) patchLog.push(x);

  // ④ 收尾再扫一次：把这次新加的所有函数也标成 native（防止漏网）
  native.scanAll();
  patchLog.push('scanAll(收尾：补丁函数 native 化)');

  // ⑤ 可选：装读值追踪（必须在 SDK 加载前装，且装上后再扫一次 native）
  const trace = o.traceReads ? installReadTrace(win, native) : null;
  if (trace) {
    native.scanAll();
    patchLog.push('installReadTrace(读值追踪，' + trace.wrapped.length + ' 个观测点)');
  }

  // ⑥ 环境补丁全部打完（含追踪包装），此刻拍快照 —— 之后 SDK 挂载了什么/覆盖了什么一比对就知道
  const bootSnapshot = new Map();
  for (const k of Object.getOwnPropertyNames(win)) {
    let v;
    try { v = win[k]; } catch (e) { v = undefined; }
    bootSnapshot.set(k, v);
  }

  // SDK 通过 window.eval 进入；给它带 sourceURL，栈里能看出是哪个文件
  let evalCounter = 0;
  function evalSource(code, filename) {
    evalCounter += 1;
    const tag = filename || ('sdk-' + evalCounter + '.js');
    return win.eval(String(code) + '\n//# sourceURL=' + tag);
  }

  /**
   * 与 createEnv 完成时刻的 window 快照比对，得出 SDK 挂载 / 覆盖的全局。
   * 返回 { added: string[], changed: string[] }
   *   added   —— SDK 新增的全局（如 pceptor 的 _yundunxhr、preinforce2 的 fun/base64js/jsdVipUserMark）
   *   changed —— SDK 覆盖掉的既有全局（如 fetch / XMLHttpRequest 被劫持）
   */
  function globals(skipExtra) {
    const skip = new Set(skipExtra || []);
    const added = [];
    const changed = [];
    for (const k of Object.getOwnPropertyNames(win)) {
      if (skip.has(k)) continue;
      let v;
      try { v = win[k]; } catch (e) { continue; }
      if (!bootSnapshot.has(k)) { added.push(k); continue; }
      let old;
      try { old = bootSnapshot.get(k); } catch (e) { old = undefined; }
      if (!Object.is(old, v) && typeof v !== 'undefined') changed.push(k);
    }
    return { added: added.sort(), changed: changed.sort() };
  }

  return {
    dom, window: win, document: win.document, navigator: win.navigator, screen: win.screen,
    bundle, patchLog, netLog, storageMissing: seeded.requiredButMissing,
    jsdomNotices: hits, evalSource, globals, bootSnapshot,
    readCounts: () => (trace ? trace.snapshot() : []),
    dispose() { try { win.close(); } catch (e) { /* ignore */ } },
  };
}

module.exports = {
  createEnv,
  loadBundle,
  bval,
  FIREFOX_UA,
  DEFAULT_BUNDLE,
  DEFAULT_ORIGIN,
  // 供 verify_env.js / 后续脚本复用
  createNativePatcher,
  patchNavigator,
  patchScreenAndWindow,
  patchDocument,
  patchLayout,
  patchCanvas,
  patchAudio,
  patchCSS,
  patchMiscAPI,
  patchNetwork,
  installReadTrace,
  hideNodeFeatures,
  seedStorage,
};
