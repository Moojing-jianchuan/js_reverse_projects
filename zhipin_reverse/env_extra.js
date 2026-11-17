'use strict';
// env_extra.js —— env_jsdom.js 之上的增量环境补丁（CommonJS，不改 env_jsdom.js）
//
// 用法（在启动 SDK 脚本之前调用）：
//   const { buildSandbox } = require('./env_jsdom.js');
//   const { applyExtraEnv } = require('./env_extra.js');
//   const win = buildSandbox('', { url: 'https://www.zhipin.com/web/passport/zp/security.html' });
//   const stats = applyExtraEnv(win, { frames: 4 });
//
// 补的东西全部来自本地实测（config/win_keys_firefox.json：Camoufox/Firefox 152 的
// window.wrappedJSObject 实采），不是照模板猜的：
//   1. PluginArray / MimeTypeArray / Plugin / MimeType 的真实结构（原型成员顺序、可枚举性、
//      Symbol.iterator / Symbol.toStringTag、enabledPlugin 指回 plugin、非法构造语义）
//   2. window.length / window[i] / window.frames 的浏览器语义（frames === window 且 length = 子帧数）
//   3. window 自有属性填充：Firefox 原生清单（env_extra_firefox.js）+ 可选的数量填充
//   4. jsdom 内部下划线属性收敛为不可枚举（Object.keys/for-in 不再泄漏 _document/_globalObject）
// 所有新增函数都过 markNative（Firefox 原生串 `function X() {\n    [native code]\n}`），
// 并且挂到 env_jsdom 那层 Function.prototype.toString 之上（两层 WeakSet 串联，互不覆盖）。

const FF = require('./env_extra_firefox.js');

// ── 0. 常量 ────────────────────────────────────────────────────────────────
const NATIVE_FMT = (name) => `function ${name || ''}() {\n    [native code]\n}`;

// Firefox 152 实测的 PDF 插件 / MIME 清单（navigator.plugins 5 个、navigator.mimeTypes 2 个）
const PLUGIN_DEFS = [
  ['PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'],
  ['Chrome PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'],
  ['Chromium PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'],
  ['Microsoft Edge PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'],
  ['WebKit built-in PDF', 'internal-pdf-viewer', 'Portable Document Format'],
];
const MIME_DEFS = [
  ['application/pdf', 'Portable Document Format', 'pdf'],
  ['text/pdf', 'Portable Document Format', 'pdf'],
];

const DEFAULTS = {
  frames: 4,                 // window.length / frames.length；浏览器实测业务页为 4
  framesIndex: true,         // 是否挂 window[0..frames-1]（浏览器里存在，且是可枚举的 accessor）
  plugins: true,             // PluginArray/MimeTypeArray 完整结构
  patchIframes: true,        // iframe 里的 navigator 也换同一套插件结构（SDK 会建 iframe 取干净环境）
  cleanInternals: true,      // jsdom 内部 _xxx 自有属性收敛为不可枚举
  fillWindowKeys: true,      // 补 window 自有属性
  fillers: true,             // 数量填充（FF 原生清单不够 440/1150 时补）
  targets: { keys: 448, ownNames: 1198 }, // 浏览器实测：Object.keys / getOwnPropertyNames
  verbose: false,
};

// ── 1. markNative（叠加在 env_jsdom 那层之上） ──────────────────────────────
const STATE = new WeakMap(); // win -> { nativeFns, markNative }

function ensureNativeState(win) {
  const cached = STATE.get(win);
  if (cached) return cached;

  const nativeFns = new WeakSet();
  const markNative = function markNative(fn) {
    if (typeof fn !== 'function') return fn;
    nativeFns.add(fn);
    try {
      Object.defineProperty(fn, 'toString', {
        value: function () { return NATIVE_FMT(fn.name); },
        configurable: true, writable: true,
      });
    } catch (e) {}
    return fn;
  };
  markNative(markNative);

  const fp = win.Function.prototype;
  const prev = fp.toString;
  // 关键：env_jsdom 已经换过 Function.prototype.toString，它只认自己的 WeakSet；
  // 我们的函数在它眼里是"用户代码"，会拿到真实源码 → 必须在我们这层先拦下来。
  const chained = function toString() {
    try {
      if (nativeFns.has(this)) return NATIVE_FMT(this && this.name);
      return prev.call(this);
    } catch (e) {
      return NATIVE_FMT(this && this.name);
    }
  };
  markNative(chained);
  // chained 自己也要过 env_jsdom 那层的检查（prev 认它自己的 WeakSet，这里再补一层保险）
  try {
    Object.defineProperty(fp, 'toString', { value: chained, writable: true, configurable: true });
  } catch (e) {}

  const st = { nativeFns, markNative };
  STATE.set(win, st);
  return st;
}

// 命名函数：`function item() {}` / `function get type() {}`（Firefox 原生串要带名字）
// 注意：`{ [name]: impl }` 不会给 impl 改名（SetFunctionName 只作用于匿名函数字面量），
// 必须显式 defineProperty('name')。
function namedFn(name, impl) {
  try { Object.defineProperty(impl, 'name', { value: name, configurable: true }); } catch (e) {}
  return impl;
}
function namedGetter(name, impl) {
  // 注意：必须用真正的 accessor 字面量，{ 'get x': fn } 只是普通字符串键，名字会是空串
  const holder = { get [name]() { return impl.call(this); } };
  return Object.getOwnPropertyDescriptor(holder, name).get;
}
// 非法构造（Firefox: new PluginArray() → TypeError: Illegal constructor.）
function illegalCtor(name) {
  const fn = {
    [name]: function () { throw new TypeError('Illegal constructor.'); },
  }[name];
  return fn;
}

// ── 2. PluginArray / MimeTypeArray / Plugin / MimeType ─────────────────────
const PLUGIN_REALM = new WeakMap(); // win -> { pluginArray, mimeTypeArray, classes }

function buildPluginRealm(win, st) {
  const cached = PLUGIN_REALM.get(win);
  if (cached) return cached;
  const mark = st.markNative;

  const META = new WeakMap(); // 实例 -> { kind, ... }
  const defVal = (proto, name, value, opts) =>
    Object.defineProperty(proto, name, {
      value, writable: (opts && opts.writable) !== false, enumerable: !!(opts && opts.enumerable),
      configurable: true,
    });
  const defGet = (proto, name, getter, enumerable) =>
    Object.defineProperty(proto, name, { get: getter, enumerable: !!enumerable, configurable: true });
  const tag = (proto, name) =>
    Object.defineProperty(proto, Symbol.toStringTag, {
      value: name, writable: false, enumerable: false, configurable: true,
    });
  const iteratorOn = (proto, itemsGetter) =>
    Object.defineProperty(proto, Symbol.iterator, {
      value: mark(namedFn('values', function () {
        const items = itemsGetter(this);
        let i = 0;
        return {
          next: mark(namedFn('next', function () {
            return i < items.length ? { value: items[i++], done: false } : { value: undefined, done: true };
          })),
          [Symbol.iterator]: mark(namedFn('values', function () { return this; })),
        };
      })),
      writable: true, enumerable: false, configurable: true,
    });

  const brand = (obj, kind) => {
    const m = META.get(obj);
    if (!m || m.kind !== kind) throw new TypeError('Illegal invocation');
    return m;
  };

  // ---------- MimeType ----------
  const MimeType = mark(illegalCtor('MimeType'));
  const mimeProto = MimeType.prototype;
  delete mimeProto.constructor; // 让 constructor 排在最后（Firefox 的枚举顺序）
  defGet(mimeProto, 'type', mark(namedGetter('type', function () { return brand(this, 'MimeType').type; })), true);
  defGet(mimeProto, 'description', mark(namedGetter('description', function () { return brand(this, 'MimeType').description; })), true);
  defGet(mimeProto, 'suffixes', mark(namedGetter('suffixes', function () { return brand(this, 'MimeType').suffixes; })), true);
  defGet(mimeProto, 'enabledPlugin', mark(namedGetter('enabledPlugin', function () { return brand(this, 'MimeType').enabledPlugin; })), true);
  defVal(mimeProto, 'constructor', MimeType, { enumerable: false });
  tag(mimeProto, 'MimeType');

  // ---------- Plugin ----------
  const Plugin = mark(illegalCtor('Plugin'));
  const pluginProto = Plugin.prototype;
  delete pluginProto.constructor;
  defVal(pluginProto, 'item', mark(namedFn('item', function (idx) {
    const m = brand(this, 'Plugin').mimes;
    const i = Number(idx) | 0;
    return (i >= 0 && i < m.length) ? m[i] : null;
  })), { enumerable: true });
  defVal(pluginProto, 'namedItem', mark(namedFn('namedItem', function (name) {
    const m = brand(this, 'Plugin').mimes;
    const s = String(name);
    for (const mt of m) if (mt.type === s) return mt; // eslint-disable-line no-restricted-syntax
    return null;
  })), { enumerable: true });
  defGet(pluginProto, 'description', mark(namedGetter('description', function () { return brand(this, 'Plugin').description; })), true);
  defGet(pluginProto, 'filename', mark(namedGetter('filename', function () { return brand(this, 'Plugin').filename; })), true);
  defGet(pluginProto, 'name', mark(namedGetter('name', function () { return brand(this, 'Plugin').name; })), true);
  defGet(pluginProto, 'length', mark(namedGetter('length', function () { return brand(this, 'Plugin').mimes.length; })), true);
  defVal(pluginProto, 'constructor', Plugin, { enumerable: false });
  iteratorOn(pluginProto, (self) => brand(self, 'Plugin').mimes);
  tag(pluginProto, 'Plugin');

  // ---------- MimeTypeArray ----------
  const MimeTypeArray = mark(illegalCtor('MimeTypeArray'));
  const mimeArrayProto = MimeTypeArray.prototype;
  delete mimeArrayProto.constructor;
  defVal(mimeArrayProto, 'item', mark(namedFn('item', function (idx) {
    const m = brand(this, 'MimeTypeArray').mimes;
    const i = Number(idx) | 0;
    return (i >= 0 && i < m.length) ? m[i] : null;
  })), { enumerable: true });
  defVal(mimeArrayProto, 'namedItem', mark(namedFn('namedItem', function (name) {
    const m = brand(this, 'MimeTypeArray').mimes;
    const s = String(name);
    for (const mt of m) if (mt.type === s) return mt; // eslint-disable-line no-restricted-syntax
    return null;
  })), { enumerable: true });
  defGet(mimeArrayProto, 'length', mark(namedGetter('length', function () { return brand(this, 'MimeTypeArray').mimes.length; })), true);
  defVal(mimeArrayProto, 'constructor', MimeTypeArray, { enumerable: false });
  iteratorOn(mimeArrayProto, (self) => brand(self, 'MimeTypeArray').mimes);
  tag(mimeArrayProto, 'MimeTypeArray');

  // ---------- PluginArray ----------
  const PluginArray = mark(illegalCtor('PluginArray'));
  const pluginArrayProto = PluginArray.prototype;
  delete pluginArrayProto.constructor;
  defVal(pluginArrayProto, 'refresh', mark(namedFn('refresh', function () { brand(this, 'PluginArray'); return undefined; })), { enumerable: true });
  defVal(pluginArrayProto, 'item', mark(namedFn('item', function (idx) {
    const p = brand(this, 'PluginArray').plugins;
    const i = Number(idx) | 0;
    return (i >= 0 && i < p.length) ? p[i] : null;
  })), { enumerable: true });
  defVal(pluginArrayProto, 'namedItem', mark(namedFn('namedItem', function (name) {
    const p = brand(this, 'PluginArray').plugins;
    const s = String(name);
    for (const pl of p) if (pl.name === s) return pl; // eslint-disable-line no-restricted-syntax
    return null;
  })), { enumerable: true });
  defGet(pluginArrayProto, 'length', mark(namedGetter('length', function () { return brand(this, 'PluginArray').plugins.length; })), true);
  defVal(pluginArrayProto, 'constructor', PluginArray, { enumerable: false });
  iteratorOn(pluginArrayProto, (self) => brand(self, 'PluginArray').plugins);
  tag(pluginArrayProto, 'PluginArray');

  // ---------- 实例 ----------
  // MimeType 实例：自有属性为空（Firefox 实测 ownNames = []）
  const mimes = MIME_DEFS.map(([type, description, suffixes]) => {
    const mt = Object.create(mimeProto);
    META.set(mt, { kind: 'MimeType', type, description, suffixes, enabledPlugin: null });
    return mt;
  });

  // Plugin 实例：数字索引可枚举 + MIME 名字非枚举（Firefox 实测）
  const plugins = PLUGIN_DEFS.map(([name, filename, description]) => {
    const pl = Object.create(pluginProto);
    META.set(pl, { kind: 'Plugin', name, filename, description, mimes });
    mimes.forEach((mt, i) => {
      Object.defineProperty(pl, String(i), { value: mt, writable: false, enumerable: true, configurable: true });
      Object.defineProperty(pl, mt.type, { value: mt, writable: false, enumerable: false, configurable: true });
    });
    return pl;
  });
  // Firefox：mime.enabledPlugin 都指回第一个 plugin（"PDF Viewer"）
  for (const mt of mimes) META.get(mt).enabledPlugin = plugins[0];

  // MimeTypeArray 实例
  const mimeTypeArray = Object.create(mimeArrayProto);
  META.set(mimeTypeArray, { kind: 'MimeTypeArray', mimes });
  mimes.forEach((mt, i) => {
    Object.defineProperty(mimeTypeArray, String(i), { value: mt, writable: false, enumerable: true, configurable: true });
    Object.defineProperty(mimeTypeArray, mt.type, { value: mt, writable: false, enumerable: false, configurable: true });
  });

  // PluginArray 实例
  const pluginArray = Object.create(pluginArrayProto);
  META.set(pluginArray, { kind: 'PluginArray', plugins });
  plugins.forEach((pl, i) => {
    Object.defineProperty(pluginArray, String(i), { value: pl, writable: false, enumerable: true, configurable: true });
    Object.defineProperty(pluginArray, pl.name, { value: pl, writable: false, enumerable: false, configurable: true });
  });

  const realm = {
    classes: { Plugin, PluginArray, MimeType, MimeTypeArray },
    pluginArray, mimeTypeArray, mimes, plugins, META,
  };
  PLUGIN_REALM.set(win, realm);
  return realm;
}

function wireNavigator(win, st, realm) {
  const mark = st.markNative;
  const nav = win.navigator;
  // Firefox 的 navigator 没有自有 plugins/mimeTypes，只有 Navigator.prototype 上的 getter
  try { delete nav.plugins; } catch (e) {}
  try { delete nav.mimeTypes; } catch (e) {}

  const install = (proto) => {
    if (!proto) return;
    Object.defineProperty(proto, 'plugins', {
      get: mark(namedGetter('plugins', function () { return realm.pluginArray; })),
      enumerable: true, configurable: true,
    });
    Object.defineProperty(proto, 'mimeTypes', {
      get: mark(namedGetter('mimeTypes', function () { return realm.mimeTypeArray; })),
      enumerable: true, configurable: true,
    });
  };
  install(win.Navigator && win.Navigator.prototype);
  // 少数 jsdom 版本 navigator 的原型不是 win.Navigator.prototype
  try { install(Object.getPrototypeOf(nav)); } catch (e) {}

  // 构造器挂到 window（Firefox 实测：非枚举、可写、可配置）
  // jsdom 29 自己也导出了 PluginArray/Plugin/MimeType/MimeTypeArray，但它的实例不可构造、
  // 只会返回空数组，且 instanceof 关系对不上 —— 这里直接用自己的实现覆盖掉。
  for (const [name, Ctor] of Object.entries(realm.classes)) {
    try {
      Object.defineProperty(win, name, { value: Ctor, writable: true, enumerable: false, configurable: true });
    } catch (e) {
      try { win[name] = Ctor; } catch (e2) {}
    }
  }
}

// ── 3. frames / length / window[i] ─────────────────────────────────────────
const CHILD = new WeakMap(); // win -> Map(i -> proxy)

function installFrames(win, st, cfg) {
  const mark = st.markNative;
  const count = Math.max(0, cfg.frames | 0);

  // window.length：Firefox 是 window 自有的可枚举 accessor，值 = 子帧数
  Object.defineProperty(win, 'length', {
    get: mark(namedGetter('length', function () { return count; })),
    set: mark(namedFn('length', function () {})),
    enumerable: true, configurable: true,
  });

  // frames 保持 === window（jsdom 已满足，这里显式兜底一次）
  const framesDesc = Object.getOwnPropertyDescriptor(win, 'frames');
  if (!framesDesc || !framesDesc.get) {
    Object.defineProperty(win, 'frames', {
      get: mark(namedGetter('frames', function () { return win; })),
      enumerable: true, configurable: true,
    });
  }

  if (!cfg.framesIndex) return;
  const cache = CHILD.get(win) || new Map();
  CHILD.set(win, cache);

  const makeChild = (idx) => {
    if (cache.has(idx)) return cache.get(idx);
    const overrides = {
      // frames[i] 是子窗口：parent/top 指回父窗口，self/frames 指自己，length = 0
      get parent() { return win; },
      get top() { return win; },
      get self() { return proxy; },
      get window() { return proxy; },
      get frames() { return proxy; },
      get globalThis() { return proxy; },
      get length() { return 0; },
      get frameElement() { return null; },
      get name() { return ''; },
      get closed() { return false; },
      get opener() { return null; },
    };
    const proxy = new Proxy(win, {
      get(target, prop) {
        if (prop in overrides) {
          const d = Object.getOwnPropertyDescriptor(overrides, prop);
          return d && d.get ? d.get.call(target) : d.value;
        }
        return Reflect.get(target, prop);
      },
      has(target, prop) { return (prop in overrides) || Reflect.has(target, prop); },
      getOwnPropertyDescriptor(target, prop) {
        if (prop in overrides) {
          const d = Object.getOwnPropertyDescriptor(overrides, prop);
          return { get: d.get, set: d.set, enumerable: true, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
      set(target, prop, value) { return Reflect.set(target, prop, value); },
      ownKeys(target) { return Reflect.ownKeys(target); },
      getPrototypeOf(target) { return Reflect.getPrototypeOf(target); },
    });
    cache.set(idx, proxy);
    return proxy;
  };

  // window[0..n-1]：Firefox 里是可枚举 accessor（JSON.stringify 会因循环引用报错）
  for (let i = 0; i < count; i++) {
    Object.defineProperty(win, String(i), {
      get: mark(namedGetter(String(i), function () { return makeChild(i); })),
      set: mark(namedFn(String(i), function () {})),
      enumerable: true, configurable: true,
    });
  }
}

// ── 4. jsdom 内部下划线属性：可枚举 → 不可枚举 ─────────────────────────────
// 只处理 jsdom 自己的 _document/_globalObject 这类；填充池里的 _toConsumableArray、_hmt
// 是"页面全局"，不能被误伤（否则第二次调用会把它们隐藏掉、键数又掉下去）。
const FILLER_NAME_SET = new Set();
function isFillerName(name) { return FILLER_NAME_SET.has(name); }

function cleanInternals(win) {
  const st = STATE.get(win);
  if (st && st.cleaned) return [];
  if (st) st.cleaned = true;
  const hidden = [];
  for (const name of Object.getOwnPropertyNames(win)) {
    if (!/^_{1,2}[A-Za-z]/.test(name)) continue; // _document / __documentAllUndetectable
    if (isFillerName(name) || name.startsWith('__zp')) continue;
    let d;
    try { d = Object.getOwnPropertyDescriptor(win, name); } catch (e) { continue; }
    if (!d || !d.enumerable || d.configurable === false) continue;
    try {
      Object.defineProperty(win, name, { ...d, enumerable: false });
      hidden.push(name);
    } catch (e) {}
  }
  return hidden;
}

// ── 5. 特殊全局的原生语义（Firefox 有、jsdom 没有的那些） ───────────────────
function makeSpecial(name, win, st) {
  const mark = st.markNative;
  switch (name) {
    case 'requestIdleCallback':
      return mark(namedFn('requestIdleCallback', function (cb) {
        return win.setTimeout(function () { try { cb({ didTimeout: false, timeRemaining: function () { return 50; } }); } catch (e) {} }, 1);
      }));
    case 'cancelIdleCallback':
      return mark(namedFn('cancelIdleCallback', function (id) { win.clearTimeout(id); }));
    case 'createImageBitmap':
      return mark(namedFn('createImageBitmap', function () {
        return Promise.resolve({ width: 1, height: 1, close: mark(namedFn('close', function () {})) });
      }));
    case 'matchMedia':
      return mark(namedFn('matchMedia', function (query) {
        const mql = {
          media: String(query), matches: false, onchange: null,
          addListener: mark(namedFn('addListener', function () {})),
          removeListener: mark(namedFn('removeListener', function () {})),
          addEventListener: mark(namedFn('addEventListener', function () {})),
          removeEventListener: mark(namedFn('removeEventListener', function () {})),
          dispatchEvent: mark(namedFn('dispatchEvent', function () { return true; })),
        };
        Object.defineProperty(mql, Symbol.toStringTag, { value: 'MediaQueryList', configurable: true });
        return mql;
      }));
    case 'getDefaultComputedStyle':
      return mark(namedFn('getDefaultComputedStyle', function (el, pseudo) {
        try { return win.getComputedStyle(el, pseudo); } catch (e) { return {}; }
      }));
    case 'find': case 'dump': case 'updateCommands': case 'captureEvents':
    case 'releaseEvents': case 'scrollByLines': case 'scrollByPages':
    case 'moveTo': case 'moveBy': case 'resizeTo': case 'resizeBy':
      return mark(namedFn(name, function () {}));
    case 'clientInformation':
      return win.navigator;
    case 'closed': return false;
    case 'opener': return null;
    case 'frameElement': return null;
    case 'originAgentCluster': return true;
    case 'event': return undefined;
    case 'status': return '';
    case 'name': return '';
    case 'scrollMaxX': case 'scrollMaxY': case 'mozInnerScreenX': case 'mozInnerScreenY': return 0;
    case 'fullScreen': return false;
    case 'visualViewport': {
      const vv = {
        width: win.innerWidth || 1920, height: win.innerHeight || 900,
        offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1,
        onresize: null, onscroll: null, onscrollend: null,
        addEventListener: mark(namedFn('addEventListener', function () {})),
        removeEventListener: mark(namedFn('removeEventListener', function () {})),
      };
      Object.defineProperty(vv, Symbol.toStringTag, { value: 'VisualViewport', configurable: true });
      return vv;
    }
    case 'navigation': {
      const entry = {
        url: String(win.location && win.location.href), key: '', id: '', index: 0,
        sameDocument: true,
        getState: mark(namedFn('getState', function () { return undefined; })),
      };
      Object.defineProperty(entry, Symbol.toStringTag, { value: 'NavigationHistoryEntry', configurable: true });
      const nav = {
        currentEntry: entry, transition: null, activation: null, canGoBack: false, canGoForward: false,
        onnavigate: null, onnavigatesuccess: null, onnavigateerror: null, oncurrententrychange: null,
        entries: mark(namedFn('entries', function () { return [entry]; })),
        addEventListener: mark(namedFn('addEventListener', function () {})),
        removeEventListener: mark(namedFn('removeEventListener', function () {})),
        traverseTo: mark(namedFn('traverseTo', function () { return Promise.resolve(entry); })),
        updateCurrentEntry: mark(namedFn('updateCurrentEntry', function () {})),
      };
      Object.defineProperty(nav, Symbol.toStringTag, { value: 'Navigation', configurable: true });
      return nav;
    }
    case 'netscape': {
      const ns = {};
      Object.defineProperty(ns, Symbol.toStringTag, { value: 'Object', configurable: true });
      return ns;
    }
    default:
      return undefined;
  }
}

// ── 6. window 自有属性填充 ─────────────────────────────────────────────────
// 6.1 Firefox 原生清单（867 条，来自 env_extra_firefox.js）
function fillFirefoxNatives(win, st, cfg) {
  let added = 0;
  let accessors = 0;
  let skipped = 0;
  for (const [name, enumerable, isAccessor, type, hasProto, value] of FF.ENTRIES) {
    if (Object.prototype.hasOwnProperty.call(win, name)) { skipped++; continue; }
    if (type === 'throw' || value === 'ERR') { skipped++; continue; }
    if (name === 'localStorage' || name === 'sessionStorage') { skipped++; continue; }

    let v;
    const special = makeSpecial(name, win, st);
    if (special !== undefined) {
      v = special;
    } else if (type === 'function') {
      const fn = st.markNative(illegalCtor(name));
      if (hasProto) {
        // 保证 prototype 是个干净对象（Firefox 里是 interface prototype object）
        try { fn.prototype = Object.create(Object.prototype); } catch (e) {}
      }
      v = fn;
    } else if (type === 'object') {
      // tag:[object X] → 造一个带 @@toStringTag 的空对象
      const m = /^tag:\[object (.+)\]$/.exec(String(value));
      const o = {};
      if (m) Object.defineProperty(o, Symbol.toStringTag, { value: m[1], configurable: true });
      v = o;
    } else if (type === 'undefined') {
      v = undefined;
    } else if (type === 'string' || type === 'boolean' || type === 'number') {
      v = value;
      if (value === '-0') v = -0;
      if (typeof v === 'string' && /^(NaN|Infinity|-Infinity)$/.test(v)) v = Number(v);
    } else {
      skipped++;
      continue;
    }

    try {
      if (isAccessor) {
        let slot = v;
        Object.defineProperty(win, name, {
          get: st.markNative(namedGetter(name, function () { return slot; })),
          set: st.markNative(namedFn(name, function (next) { slot = next; })),
          enumerable: !!enumerable, configurable: true,
        });
        accessors++;
      } else {
        Object.defineProperty(win, name, {
          value: v, writable: true, enumerable: !!enumerable, configurable: true,
        });
      }
      added++;
    } catch (e) {
      skipped++;
    }
  }
  return { added, accessors, skipped };
}

// 6.2 数量填充池：浏览器页面里还有一批「页面自定义全局」（webpack/babel helper、
// 埋点、第三方 SDK、业务工具函数）。它们不是浏览器原生，但在真实业务页面上确实存在，
// 也是 Object.keys(window) 从 243 涨到 448 的主要来源。名字是常见清单，非该站点实测。
const PAGE_FILLERS = [
  // babel / regenerator helper（非 module 脚本会被吐到全局）
  '_toConsumableArray', '_toArray', '_iterableToArray', '_iterableToArrayLimit', '_unsupportedIterableToArray',
  '_arrayLikeToArray', '_arrayWithoutHoles', '_nonIterableSpread', '_nonIterableRest',
  '_objectWithoutProperties', '_objectWithoutPropertiesLoose', '_objectSpread2', '_extends',
  '_asyncToGenerator', '_regeneratorRuntime', '_slicedToArray', '_interopRequireWildcard',
  '_interopRequireDefault', '_classCallCheck', '_defineProperties', '_createClass', '_inherits',
  '_possibleConstructorReturn', '_assertThisInitialized', '_getPrototypeOf', '_setPrototypeOf',
  '_isNativeReflectConstruct', '_wrapNativeSuper', '_taggedTemplateLiteral', '_templateObject',
  // webpack runtime
  'webpackJsonp', '__webpack_require__', '__webpack_exports__', '__webpack_module_cache__',
  '__webpack_chunk_load__', 'webpackChunkzhipin', '__VUE_DEVTOOLS_GLOBAL_HOOK__',
  '__REACT_DEVTOOLS_GLOBAL_HOOK__', '__NEXT_DATA__',
  // 埋点 / 监控
  'dataLayer', 'gtag', 'ga', '_hmt', '_czc', '_gs', 'sensorsdata', 'sa', 'Sentry', '__SENTRY__',
  'gio', 'growing', 'vConsole', 'VConsole', 'WebMonitor', 'monitor', 'traceLog',
  // 第三方 SDK / 库
  'Vue', 'React', 'ReactDOM', 'moment', 'dayjs', 'axios', 'lodash', 'CryptoJS', 'JSEncrypt', 'md5',
  'qs', 'Zepto', 'Swiper', 'echarts', 'ECharts', 'NProgress', 'layer', 'layui', 'Aliplayer',
  'TencentCaptcha', 'BMap', 'AMap', 'initGeetest',
  // 业务工具函数 / 命名空间
  'getQuery', 'parseQuery', 'getUrlParam', 'formatDate', 'throttle', 'debounce', 'deepClone',
  'copyText', 'isMobile', 'isIOS', 'isAndroid', 'isWeixin', 'loadScript', 'preloadImage',
  'track', 'sendLog', 'reportLog', 'uploadLog', 'getStorage', 'setStorage', 'removeStorage',
  'storageUtil', 'cookieUtil', 'request', 'http', 'api', 'config', 'env', 'version', 'locals',
  'browser', 'device', 'user', 'utils', 'helpers', 'constants', 'store', 'router', 'app',
  'pageData', 'globalData', 'shareData', 'loginInfo', 'userInfo', 'appConfig',
  // 第二批：埋点别名 / 桥 / 工具函数 / 页面状态
  'cnzz', 'clarity', 'gtm', 'GTM', '_taq', 'baiduTongji', 'hmBa',
  'JSBridge', 'WeixinJSBridge', 'AppBridge', 'webviewBridge', 'nativeBridge', 'Hybrid', 'App', 'H5',
  'formatMoney', 'formatTime', 'toThousands', 'encrypt', 'decrypt', 'rsaEncrypt', 'aesEncrypt',
  'sha1', 'base64', 'urlencode', 'urldecode', 'jsonp', 'fetchJson', 'post', 'get', 'mockData',
  'appState', 'globalState', 'pageConfig', 'pageOption', 'routeData', 'layoutData', 'navData',
  'menuData', 'cityData', 'positionData', 'filterData', 'searchParams', 'pageParams', 'queryParams',
  'userAgentInfo', 'screenInfo', 'envInfo', 'deviceInfo', 'initApp', 'initPage', 'initEvent',
];

// 6.3 非枚举填充池：名字取自其它引擎/更新规范里的真实 Web API（这套 Gecko 建造里没有），
// 用来把 getOwnPropertyNames 抬到浏览器量级；因为不可枚举，不进 Object.keys / for-in。
const INTERFACE_FILLERS = [
  'webkitRequestAnimationFrame', 'webkitCancelAnimationFrame', 'webkitRTCPeerConnection',
  'webkitMediaStream', 'webkitSpeechRecognition', 'mozRTCPeerConnection',
  'FileSystemHandle', 'FileSystemFileHandle', 'FileSystemDirectoryHandle', 'FileSystemWritableFileStream',
  'StorageBucket', 'StorageBucketManager', 'LaunchParams', 'LaunchQueue', 'SharedStorage',
  'CookieStore', 'CookieChangeEvent', 'DigitalCredential', 'CredentialManager', 'IdentityCredential',
  'HID', 'HIDDevice', 'HIDConnectionEvent', 'Serial', 'SerialPort', 'USB', 'USBDevice', 'USBConnectionEvent',
  'Bluetooth', 'BluetoothDevice', 'BluetoothRemoteGATTCharacteristic', 'EyeDropper', 'IdleDetector',
  'PeriodicSyncManager', 'SyncManager', 'PushManager', 'PushSubscription', 'ServiceWorkerContainer',
  'ServiceWorkerRegistration', 'BackgroundFetchManager', 'BackgroundFetchRegistration',
  'VideoFrame', 'VideoColorSpace', 'AudioEncoder', 'AudioDecoder', 'VideoEncoder', 'VideoDecoder',
  'EncodedAudioChunk', 'ImageTrack', 'ImageTrackList', 'FileSystemObserver', 'ContentVisibilityAutoStateChangeEvent',
  'PerformanceLongTaskTiming', 'TaskAttributionTiming', 'LayoutShift', 'LayoutShiftAttribution',
  'TrustedTypePolicy', 'TrustedTypePolicyFactory', 'Sanitizer', 'Highlight', 'HighlightRegistry',
  'CSSNumericValue', 'CSSUnitValue', 'CSSMathSum', 'CSSMathMax', 'CSSMathMin', 'CSSKeywordValue',
  'CSSTransformValue', 'CSSTransformComponent', 'CSSImageValue', 'CSSUnparsedValue', 'CSSVariableReferenceValue',
  'CSSSkewX', 'CSSSkewY', 'CSSRotate', 'CSSScale', 'CSSTranslate', 'CSSPerspective', 'CSSMatrixComponent',
  'MediaCapabilities', 'MediaKeyStatusMap', 'MediaKeys', 'MediaKeySession', 'MediaKeySystemAccess',
  'XRSystem', 'XRSession', 'XRReferenceSpace', 'XRRenderState', 'XRView', 'XRViewerPose', 'XRFrame',
  'XRInputSource', 'XRInputSourceArray', 'XRHitTestSource', 'XRPlane', 'XRAnchor', 'XRHand',
  'PaymentRequest', 'PaymentResponse', 'PaymentMethodChangeEvent', 'PaymentRequestUpdateEvent',
  'SpeechRecognition', 'SpeechRecognitionEvent', 'SpeechRecognitionResult', 'SpeechSynthesisVoice',
  'ContactsManager', 'NavigationHistoryEntry', 'NavigationTransition', 'NavigationPrecommitController',
  'Scheduler', 'TaskController', 'TaskSignal', 'TaskPriorityChangeEvent', 'UserActivation',
  'FontFace', 'FontFaceSet', 'FontFaceSetLoadEvent', 'BeforeInstallPromptEvent', 'RelatedApplication',
  'Ink', 'InkPresenter', 'DelegatedInkTrailPresenter', 'DocumentPictureInPicture', 'DocumentPictureInPictureEvent',
  'Summarizer', 'Translator', 'LanguageDetector', 'AITextSession', 'ModelContext',
  'ScreenDetailed', 'ScreenDetails', 'WindowControlsOverlay', 'WindowControlsOverlayGeometryChangeEvent',
  'AttributionReporting', 'FencedFrameConfig', 'Fence', 'ProtectedAudience',
  'Worklet', 'AudioWorklet', 'AudioWorkletNode', 'AudioWorkletProcessor', 'PaintWorklet', 'LayoutWorklet',
  'CSSLayoutAPI', 'AnimationWorklet', 'SharedStorageWorklet',
  'WebTransportBidirectionalStream', 'WebTransportDatagramDuplexStream', 'WebTransportError',
  'RTCIceTransport', 'RTCSctpTransport', 'RTCDtlsTransport', 'RTCRtpScriptTransform',
  'MediaStreamTrackProcessor', 'MediaStreamTrackGenerator', 'MediaStreamTrackGenerator2',
  'ReadableStreamBYOBRequest', 'WritableStreamDefaultWriter', 'TransformStreamDefaultController',
  'CompressionStream', 'DecompressionStream', 'TextEncoderStream', 'TextDecoderStream',
  'CSSLayerBlockRule', 'CSSLayerStatementRule', 'CSSNestedDeclarations', 'CSSStartingStyleRule',
  'CSSScopeRule', 'CSSPropertyRule', 'CSSPositionTryRule', 'CSSPositionTryDescriptors',
  'WebGLObject', 'WebGLVertexArrayObjectOES', 'WebGLTimerQueryEXT', 'WebGLMultiDraw',
  'InternalError', 'Temporal', 'Iterator', 'DisposableStack', 'AsyncDisposableStack',
  'HTMLFencedFrameElement', 'HTMLPortalElement', 'PortalHost', 'PortalActivateEvent',
  'GeolocationCoordinates', 'GeolocationPosition', 'GeolocationPositionError',
  'Credential', 'PasswordCredential', 'FederatedCredential', 'PublicKeyCredential',
  'AuthenticatorAssertionResponse', 'AuthenticatorAttestationResponse', 'AuthenticatorResponse',
  'ContactAddress', 'ContactInfo', 'ContactService',
  'Scheduling', 'ComputePressureObserver', 'PressureObserver', 'PressureRecord',
  'PerformanceScriptTiming', 'PerformanceElementTiming', 'PerformanceLongAnimationFrameTiming',
  'SchedulerYield', 'YieldRequest', 'IdleDeadline',
  'MediaSessionActionDetails', 'MediaSessionPlaybackState', 'MediaSessionAction', 'MediaSessionPlaybackStateHandler',
  'Sensor', 'Accelerometer', 'Gyroscope', 'Magnetometer', 'AbsoluteOrientationSensor', 'RelativeOrientationSensor',
  'AmbientLightSensor', 'ProximitySensor', 'SensorErrorEvent',
];

// 填充池名字登记（cleanInternals 不能误伤它们）
for (const n of PAGE_FILLERS) FILLER_NAME_SET.add(n);
for (const n of INTERFACE_FILLERS) FILLER_NAME_SET.add(n);

// 页面全局里"确实是函数"的那批（其余按对象/命名空间处理）
const PAGE_FN_FILLERS = new Set([
  'moment', 'dayjs', 'axios', 'md5', 'qs', 'Zepto', 'Swiper', 'lodash', 'CryptoJS', 'JSEncrypt',
  'NProgress', 'throttle', 'debounce', 'deepClone', 'copyText', 'loadScript', 'preloadImage',
  'track', 'sendLog', 'reportLog', 'uploadLog', 'getStorage', 'setStorage', 'removeStorage',
  'getQuery', 'parseQuery', 'getUrlParam', 'formatDate', 'isMobile', 'isIOS', 'isAndroid', 'isWeixin',
  'initGeetest', 'TencentCaptcha', 'Aliplayer', 'BMap', 'AMap', 'gtag', 'ga', 'sa', 'gio', 'growing',
]);

function makeFillerValue(name, st, kind) {
  const mark = st.markNative;
  if (kind === 'interface') {
    // 这批名字都是其它引擎/更新规范里的接口或 API 函数
    const fn = mark(illegalCtor(name));
    try { fn.prototype = Object.create(Object.prototype); } catch (e) {}
    return fn;
  }
  if (PAGE_FN_FILLERS.has(name) || /^[A-Z]/.test(name)) {
    const fn = mark(illegalCtor(name));
    try { fn.prototype = Object.create(Object.prototype); } catch (e) {}
    return fn;
  }
  if (/^on[a-z]/.test(name)) return null;
  if (name.startsWith('_')) return mark(namedFn(name, function () {}));
  if (name.startsWith('__')) return {};
  return {};
}

function fillToTargets(win, st, cfg) {
  const report = { pageFillers: 0, interfaceFillers: 0 };
  const keysTarget = (cfg.targets && cfg.targets.keys) || 0;
  const namesTarget = (cfg.targets && cfg.targets.ownNames) || 0;

  const keysNow = () => Object.keys(win).length;
  const namesNow = () => Object.getOwnPropertyNames(win).length;

  if (keysTarget) {
    for (const name of PAGE_FILLERS) {
      if (keysNow() >= keysTarget) break;
      if (Object.prototype.hasOwnProperty.call(win, name)) continue;
      try {
        Object.defineProperty(win, name, {
          value: makeFillerValue(name, st, 'page'), writable: true, enumerable: true, configurable: true,
        });
        report.pageFillers++;
      } catch (e) {}
    }
  }
  if (namesTarget) {
    for (const name of INTERFACE_FILLERS) {
      if (namesNow() >= namesTarget) break;
      if (Object.prototype.hasOwnProperty.call(win, name)) continue;
      try {
        Object.defineProperty(win, name, {
          value: makeFillerValue(name, st, 'interface'), writable: true, enumerable: false, configurable: true,
        });
        report.interfaceFillers++;
      } catch (e) {}
    }
  }
  return report;
}

// ── 7. iframe：把同一套插件结构挂到子 window 上 ────────────────────────────
function patchIframes(win, st, cfg) {
  const iframeProto = win.HTMLIFrameElement && win.HTMLIFrameElement.prototype;
  if (!iframeProto) return false;
  const desc = Object.getOwnPropertyDescriptor(iframeProto, 'contentWindow');
  if (!desc || !desc.get) return false;
  const prevGet = desc.get;
  const install = (w2) => {
    if (!w2) return w2;
    try {
      const st2 = ensureNativeState(w2);
      const realm2 = buildPluginRealm(w2, st2);
      wireNavigator(w2, st2, realm2);
    } catch (e) {}
    return w2;
  };
  try {
    Object.defineProperty(iframeProto, 'contentWindow', {
      get() { return install(prevGet.call(this)); },
      configurable: true,
    });
    return true;
  } catch (e) {
    return false;
  }
}

// ── 8. 总入口 ──────────────────────────────────────────────────────────────
function applyExtraEnv(win, opts) {  const cfg = Object.assign({}, DEFAULTS, opts || {});
  cfg.targets = Object.assign({}, DEFAULTS.targets, (opts && opts.targets) || {});
  const st = ensureNativeState(win);

  const stats = { win };
  const before = {
    keys: Object.keys(win).length,
    ownNames: Object.getOwnPropertyNames(win).length,
    framesLength: (() => { try { return win.top.frames.length; } catch (e) { return 'ERR'; } })(),
    pluginsTag: (() => { try { return Object.prototype.toString.call(win.navigator.plugins); } catch (e) { return 'ERR'; } })(),
  };

  if (cfg.plugins) {
    const realm = buildPluginRealm(win, st);
    wireNavigator(win, st, realm);
    stats.plugins = true;
    if (cfg.patchIframes) stats.iframes = patchIframes(win, st, cfg);
  }
  installFrames(win, st, cfg);
  if (cfg.cleanInternals) stats.hiddenInternals = cleanInternals(win).length;
  if (cfg.fillWindowKeys) {
    stats.nativeFill = fillFirefoxNatives(win, st, cfg);
    if (cfg.fillers) stats.fillerFill = fillToTargets(win, st, cfg);
  }

  stats.before = before;
  stats.after = {
    keys: Object.keys(win).length,
    ownNames: Object.getOwnPropertyNames(win).length,
    framesLength: (() => { try { return win.top.frames.length; } catch (e) { return 'ERR'; } })(),
    pluginsTag: (() => { try { return Object.prototype.toString.call(win.navigator.plugins); } catch (e) { return 'ERR'; } })(),
  };
  if (cfg.verbose) console.log('[env_extra]', JSON.stringify(stats.after));
  return stats;
}

// ── 9. 便捷封装：先补环境、再加载 SDK ──────────────────────────────────────
// buildSandbox(scriptSrc) 会在内部直接 eval SDK，没有"补完再加载"的时机；
// 传一个 ';' 占位脚本就能拿到"只做好 jsdom/环境、还没跑 SDK"的 window。
// 用法：
//   const win = buildPatchedSandbox(fs.readFileSync('config/_sdk_5d7c1c55.js', 'utf8'), { url });
// 顺序：jsdom → env_jsdom 的 bootstrap（页面 inline 脚本）→ applyExtraEnv → SDK
function buildPatchedSandbox(scriptSrc, opts) {
  const { buildSandbox } = require('./env_jsdom.js'); // 延迟 require，避免循环依赖
  const options = opts || {};
  const { extra, ...rest } = options;
  if (!scriptSrc) {
    // 没有传 SDK 源码：退回 env_jsdom 自己的默认加载（此时补丁发生在 SDK 之后）
    const win = buildSandbox('', rest);
    win.__zpExtraStats = applyExtraEnv(win, extra);
    return win;
  }
  const win = buildSandbox(';', rest);
  win.__zpExtraStats = applyExtraEnv(win, extra);
  win.eval(scriptSrc);
  return win;
}

module.exports = {
  applyExtraEnv,
  buildPatchedSandbox,
  // 供 probe/调试复用
  _internals: { ensureNativeState, buildPluginRealm, PLUGIN_DEFS, MIME_DEFS, FF, PAGE_FILLERS, INTERFACE_FILLERS },
};
