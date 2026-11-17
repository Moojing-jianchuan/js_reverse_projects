// jsdom 环境伪装：真 DOM 对象 + 补 navigator/screen/window/canvas/webgl/timing
const { JSDOM } = require('jsdom');
const fs = require('fs');

// 默认加载的 SDK：优先当前快照，其次 config 下最新的 _sdk_*.js（换版时只换文件）
function pickDefaultSdk() {
  const prefer = './config/_sdk_6d66a65a.js';
  if (fs.existsSync(prefer)) return fs.readFileSync(prefer, 'utf8');
  const dir = './config';
  const cand = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^_sdk_.*\.js$/.test(f) && !f.includes('.inst.')).sort()
    : [];
  return cand.length ? fs.readFileSync('./config/' + cand[cand.length - 1], 'utf8') : '';
}

const VM_SRC = pickDefaultSdk();
const CANVAS_DATAURL = fs.existsSync('./config/canvas_fingerprint.txt')
  ? fs.readFileSync('./config/canvas_fingerprint.txt', 'utf8').trim()
  : '';

// 可选的实测环境快照（由采集脚本写入 config/browser_env.json）
let CAPTURED = null;
try {
  CAPTURED = JSON.parse(fs.readFileSync('./config/browser_env.json', 'utf8'));
} catch (e) {
  CAPTURED = null;
}

// security.html 的 inline 脚本（按原顺序在 SDK 之前执行）
let BOOTSTRAP_BLOCKS = null;

// 浏览器真值（Camoufox 152 reverse 内核实测，2026-11-10 采集）
const BROWSER = {
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
  platform: 'Win32', language: 'en-US', languages: ['en-US', 'en'], hardwareConcurrency: 32,
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1032, colorDepth: 24, pixelDepth: 24 },
  window: { innerWidth: 1920, innerHeight: 927, outerWidth: 1920, outerHeight: 1032, screenX: 0, screenY: 0, screenLeft: 0, screenTop: 0, devicePixelRatio: 1 },
  localStorage: {
    warlockjssdkcross: '{"distinct_id":"1a1c63223c5ae6-01fe747256f2ddd-9575122-2073600-1a1c63223c63c01","first_id":"","props":{},"identities":{}}',
  },
  webgl: {
    37445: 'Google Inc. (Intel)',  // UNMASKED_VENDOR_WEBGL
    37446: 'ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar',  // UNMASKED_RENDERER_WEBGL
  },
};

// 用实测快照覆盖指纹字段（换指纹时只需重新采集 browser_env.json）
if (CAPTURED) {
  if (CAPTURED.ua) BROWSER.ua = CAPTURED.ua;
  if (CAPTURED.platform) BROWSER.platform = CAPTURED.platform;
  if (CAPTURED.language) BROWSER.language = CAPTURED.language;
  if (CAPTURED.languages) BROWSER.languages = CAPTURED.languages;
  if (CAPTURED.cores) BROWSER.hardwareConcurrency = CAPTURED.cores;
  if (CAPTURED.screen) {
    BROWSER.screen = {
      width: CAPTURED.screen.w, height: CAPTURED.screen.h,
      availWidth: CAPTURED.screen.aw, availHeight: CAPTURED.screen.ah,
      colorDepth: CAPTURED.screen.cd, pixelDepth: CAPTURED.screen.pd,
    };
  }
  if (CAPTURED.win) {
    BROWSER.window = {
      innerWidth: CAPTURED.win.iw, innerHeight: CAPTURED.win.ih,
      outerWidth: CAPTURED.win.ow, outerHeight: CAPTURED.win.oh,
      screenX: CAPTURED.win.sx, screenY: CAPTURED.win.sy,
      screenLeft: CAPTURED.win.sx, screenTop: CAPTURED.win.sy,
      devicePixelRatio: CAPTURED.win.dpr || 1,
    };
  }
  if (CAPTURED.webgl) BROWSER.webgl = CAPTURED.webgl;
}

// 完整 PluginArray / MimeTypeArray 结构（Firefox 真值）
function buildPluginStructures() {
  const pluginData = [
    ['PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'],
    ['Chrome PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'],
    ['Chromium PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'],
    ['Microsoft Edge PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'],
    ['WebKit built-in PDF', 'internal-pdf-viewer', 'Portable Document Format'],
  ];
  const mimeData = [['application/pdf', 'Portable Document Format', 'pdf'], ['text/pdf', 'Portable Document Format', 'pdf']];
  const mimeTypes = mimeData.map(([type, description, suffixes]) => ({ type, description, suffixes, enabledPlugin: null }));
  const plugins = pluginData.map(([name, filename, description]) => {
    const p = { name, filename, description, length: mimeTypes.length };
    mimeTypes.forEach((mt, i) => { p[i] = mt; });
    return p;
  });
  mimeTypes.forEach((mt) => { mt.enabledPlugin = plugins[0]; });
  const pluginArray = plugins.slice();
  pluginArray.item = (i) => plugins[i] || null;
  pluginArray.namedItem = (n) => plugins.find(p => p.name === n) || null;
  pluginArray.refresh = () => {};
  const mimeTypeArray = mimeTypes.slice();
  mimeTypeArray.item = (i) => mimeTypes[i] || null;
  mimeTypeArray.namedItem = (n) => mimeTypes.find(m => m.type === n) || null;
  return { pluginArray, mimeTypeArray };
}

// document.all 的 undetectable 语义（浏览器：typeof 为 undefined、== undefined 为真、!== undefined 也为真）。
// 需要 `node --allow-natives-syntax` 启动才能拿到 %GetUndetectable()；拿不到时返回 null。
function makeUndetectable() {
  try {
    const und = require('vm').runInThisContext('%GetUndetectable()');
    return (und === null || und === undefined) ? null : und;
  } catch (e) {
    return null;
  }
}

function installDocumentAll(doc) {
  const und = makeUndetectable();
  if (und === null) return false;   // 只能用 === null 判断：undetectable 对象本身是 falsy
  const elems = () => {
    try {
      return Array.prototype.slice.call(doc.getElementsByTagName('*'));
    } catch (e) {
      return [];
    }
  };
  // 数字下标必须是「活」的：真实 Firefox 里 document.all[i] 与 length 同源。
  // SDK 的活性探针是：Q_ = all.length（追加前）→ 造 <a> 并 appendChild →
  // 断言 all[Q_] === 那个新节点。快照式 getter 会让 all[Q_] 恒为 undefined，探针必然失败。
  // 两个约束：
  //   1) 不能用 Proxy —— 那会让 typeof(document.all) 变成 "object"，undetectable 立刻被识破；
  //   2) 索引必须 **configurable:false** —— SDK 会 `delete all[Q_]` 再读一次，
  //      真实引擎上删不掉、仍能取到该节点；可配置的话会读成 undefined，探针又会失败。
  let allIndexDefined = 0;
  const ensureAllIndices = (n) => {
    const target = Math.min(n, 8192);
    for (let i = allIndexDefined; i < target; i++) {
      try {
        Object.defineProperty(und, i, {
          get: () => elems()[i], enumerable: true, configurable: false,
        });
      } catch (e) {}
    }
    if (target > allIndexDefined) allIndexDefined = target;
  };
  try {
    Object.defineProperty(und, 'length', {
      get: () => { const len = elems().length; ensureAllIndices(len + 8); return len; },
      configurable: true,
    });
  } catch (e) {}
  try { ensureAllIndices(64); } catch (e) {}
  try { Object.defineProperty(und, 'item', { value: (i) => elems()[i] || null, configurable: true }); } catch (e) {}
  try {
    Object.defineProperty(und, 'namedItem', {
      value: (n) => elems().find((el) => el.id === n || el.getAttribute('name') === n) || null,
      configurable: true,
    });
  } catch (e) {}
  try {
    // 数字下标必须是「活」的：真实 Firefox 里 document.all[i] 与 length 同源，
    // 后追加节点后 length 与下标会一起变。之前这里把 elems() 快照成静态 getter，
    // 造成「length 活、下标死」——追加节点后 all.length 21→23 但 all[21] 仍是 undefined。
    // 注意：undetectable 对象不能用 Proxy（会让 typeof 变成 object，而 undetectable 是判据），
    // 所以这里预置一批惰性 getter，每次访问都回读 elems()。
    const INDEX_LIMIT = 4096;
    for (let i = 0; i < INDEX_LIMIT; i++) {
      try {
        Object.defineProperty(und, i, { get: () => elems()[i], configurable: true });
      } catch (e) {}
    }
  } catch (e) {}
  try { Object.defineProperty(doc, 'all', { get: () => und, configurable: true }); } catch (e) { return false; }
  return true;
}

// 真实挑战页的 DOM 骨架（去掉 <script>，只留结构）：SDK 载荷里有一个「结构计数」字节
// 会同时受 frames.length / document 内容长度 / localStorage 条数影响，空文档（39 字节）
// 是 jsdom 与真实页面最显眼的规模差。
let CHALLENGE_HTML = null;
function challengeHtml() {
  if (CHALLENGE_HTML !== null) return CHALLENGE_HTML;
  try {
    const raw = fs.readFileSync('./config/security_5d7c1c55.html', 'utf8');
    CHALLENGE_HTML = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[^>]*>/gi, '');
  } catch (e) {
    CHALLENGE_HTML = '';
  }
  return CHALLENGE_HTML;
}

function buildSandbox(scriptSrc, opts) {
  const options = opts || {};
  let initialHtml = options.html !== undefined
    ? options.html
    : (process.env.ZP_EMPTY_DOC === '1' ? '' : challengeHtml() || '<!DOCTYPE html><html><body></body></html>');
  // 真实 jobs 页面里有大量 <a>（职位卡片）。SDK 在「元素身份」探测里会按数字下标取锚点集合，
  // 集合为空时会走另一条分支（微步 125429 处的 `p = Bg ? 320 : 11340`）。
  // ZP_ANCHORS=N 在文档里补 N 个锚点，用于对齐这条分支。
  const anchorCount = Number(process.env.ZP_ANCHORS || 0);
  if (anchorCount > 0 && initialHtml) {
    const links = Array.from({ length: anchorCount }, (_, i) =>
      `<a href="https://www.zhipin.com/web/geek/jobs?p=${i}" data-jobid="job${i}">job${i}</a>`).join('');
    initialHtml = /<\/body>/i.test(initialHtml)
      ? initialHtml.replace(/<\/body>/i, links + '</body>')
      : initialHtml + links;
  }
  const dom = new JSDOM(initialHtml || '<!DOCTYPE html><html><body></body></html>', {
    url: options.url || 'https://www.zhipin.com/web/geek/jobs', pretendToBeVisual: true, runScripts: 'dangerously',
  });
  const win = dom.window;

  // 1. navigator 补丁
  const nav = win.navigator;
  // 注意：赋给 sandbox 的数组必须用 sandbox 自己的 Array 造。
  // SDK 会用 instanceof 判数组，宿主 realm 的数组在 sandbox 里 instanceof 为 false，
  // 会被当成"空数组"，载荷 7 元向量随之变成 [0,0,2,5,0,32,0]（真实浏览器是 [1,2,2,5,0,32,0]）。
  const LANGS_FACTORY = () => win.Array.from(BROWSER.languages);
  const navOv = {
    userAgent: BROWSER.ua, platform: BROWSER.platform, language: BROWSER.language, languages: LANGS_FACTORY(),
    hardwareConcurrency: BROWSER.hardwareConcurrency,
    maxTouchPoints: (CAPTURED && CAPTURED.maxTouchPoints != null) ? CAPTURED.maxTouchPoints : 0,
    appVersion: (CAPTURED && CAPTURED.appVersion) || '5.0 (Windows)',
    appName: (CAPTURED && CAPTURED.appName) || 'Netscape', appCodeName: 'Mozilla',
    product: (CAPTURED && CAPTURED.product) || 'Gecko',
    productSub: (CAPTURED && CAPTURED.productSub) || '20100101',
    vendor: (CAPTURED && CAPTURED.vendor !== undefined) ? CAPTURED.vendor : '',
    vendorSub: '', cookieEnabled: true, onLine: true,
    webdriver: (CAPTURED && CAPTURED.webdriver != null) ? CAPTURED.webdriver : false,
    doNotTrack: 'unspecified', buildID: '20181001000000',
    oscpu: (CAPTURED && CAPTURED.oscpu) || 'Windows NT 10.0; Win64; x64',
    pdfViewerEnabled: (CAPTURED && CAPTURED.pdfViewerEnabled != null) ? CAPTURED.pdfViewerEnabled : true,
  };
  for (const [k, v] of Object.entries(navOv)) {
    try { Object.defineProperty(nav, k, { value: v, configurable: true }); } catch (e) {}
  }
  // SDK 读的是 Navigator 原型上的 getter（不是实例属性）：jsdom 原型返回 en-US/['en-US','en']，
  // 会让载荷里的 7 元向量变成 [0,0,2,5,0,32,0]（真实浏览器是 [1,2,2,5,0,32,0]）。
  // 这里同时把原型 getter 指向我们的实测值。
  try {
    const NP = Object.getPrototypeOf(nav);
    Object.defineProperty(NP, 'language', {
      get() { return BROWSER.language; }, configurable: true, enumerable: true,
    });
    Object.defineProperty(NP, 'languages', {
      get() { return LANGS_FACTORY(); }, configurable: true, enumerable: true,
    });
    Object.defineProperty(NP, 'hardwareConcurrency', {
      get() { return BROWSER.hardwareConcurrency; }, configurable: true, enumerable: true,
    });
  } catch (e) {}
  const { pluginArray, mimeTypeArray } = buildPluginStructures();
  try { Object.defineProperty(nav, 'plugins', { value: pluginArray, configurable: true }); } catch (e) {}
  try { Object.defineProperty(nav, 'mimeTypes', { value: mimeTypeArray, configurable: true }); } catch (e) {}

  // 1.1 iframe 里的 navigator/screen 也必须同一套值（SDK 会创建 iframe 取“干净环境”）
  let cssInstaller = null;
  const patchNestedWindow = (w2) => {
    if (!w2) return w2;
    try {
      if (w2.__zpPatched) return w2;
      Object.defineProperty(w2, '__zpPatched', { value: true, configurable: true });
    } catch (e) { return w2; }
    if (cssInstaller) { try { cssInstaller(w2); } catch (e) {} }
    try {
      const n2 = w2.navigator;
      for (const [k, v] of Object.entries(navOv)) {
        try { Object.defineProperty(n2, k, { value: v, configurable: true }); } catch (e) {}
      }
      try { Object.defineProperty(n2, 'plugins', { value: pluginArray, configurable: true }); } catch (e) {}
      try { Object.defineProperty(n2, 'mimeTypes', { value: mimeTypeArray, configurable: true }); } catch (e) {}
    } catch (e) {}
    try {
      for (const [k, v] of Object.entries(BROWSER.screen)) {
        try { Object.defineProperty(w2.screen, k, { value: v, configurable: true }); } catch (e) {}
      }
      for (const [k, v] of Object.entries(BROWSER.window)) {
        try { Object.defineProperty(w2, k, { value: v, configurable: true }); } catch (e) {}
      }
      try { Object.defineProperty(w2.document, 'domain', { get: () => 'www.zhipin.com', configurable: true }); } catch (e) {}
      try { Object.defineProperty(w2.document, 'hasFocus', { value: () => true, configurable: true }); } catch (e) {}
      // 子文档同样要有 document.all 的 undetectable 语义（SDK 会在 iframe / createHTMLDocument 里重复检测）
      try { installDocumentAll(w2.document); } catch (e) {}
    } catch (e) {}
    return w2;
  };
  try {
    const iframeProto = win.HTMLIFrameElement.prototype;
    const cwDesc = Object.getOwnPropertyDescriptor(iframeProto, 'contentWindow');
    if (cwDesc && cwDesc.get) {
      Object.defineProperty(iframeProto, 'contentWindow', {
        get() {
          let w2 = null;
          try { w2 = cwDesc.get.call(this); } catch (e) { return null; }
          return patchNestedWindow(w2);
        },
        configurable: true,
      });
    } else {
      Object.defineProperty(iframeProto, 'contentWindow', {
        get() { return patchNestedWindow(this.contentWindow); },
        configurable: true,
      });
    }
  } catch (e) {}

  // 2. screen + window 补丁
  for (const [k, v] of Object.entries(BROWSER.screen)) {
    try { Object.defineProperty(win.screen, k, { value: v, configurable: true }); } catch (e) {}
  }
  for (const [k, v] of Object.entries(BROWSER.window)) {
    try { Object.defineProperty(win, k, { value: v, configurable: true }); } catch (e) {}
  }
  win.scrollX = 0; win.scrollY = 0;

  // localStorage 真值：优先用实测快照（含 passport_config / warlockjssdkcross 等）
  try {
    const localSeed = (CAPTURED && CAPTURED.localStorage) ? CAPTURED.localStorage : BROWSER.localStorage;
    for (const [k, v] of Object.entries(localSeed)) win.localStorage.setItem(k, v);
  } catch (e) {}

  // 3. canvas 2d + webgl 指纹（值来自真实 SDK 调用捕获）
  // 2d 上下文必须是 CanvasRenderingContext2D 实例：插桩是在原型上包方法的，
  // 用普通对象会让 fillText/measureText 调用完全观测不到（看起来像“没调用”）。
  const CR2D = class CanvasRenderingContext2D {};
  win.CanvasRenderingContext2D = CR2D;
  Object.assign(CR2D.prototype, {
    fillText() {}, strokeText() {}, fillRect() {}, clearRect() {}, strokeRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    drawImage() {}, putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]), width: 1, height: 1 }),
  });
  for (const k of ['font', 'textAlign', 'textBaseline', 'fillStyle', 'strokeStyle',
                   'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'lineCap']) {
    CR2D.prototype[k] = '';
  }
  const canvas2d = Object.create(CR2D.prototype);
  // webgl 上下文：做成 WebGLRenderingContext 实例（否则 instanceof 检测失败）
  const WebGLRC = (win.WebGLRenderingContext = class WebGLRenderingContext {});
  const webgl = Object.assign(Object.create(WebGLRC.prototype), {
    getParameter(p) { return (CAPTURED && CAPTURED.webgl && CAPTURED.webgl[p]) ?? BROWSER.webgl[p] ?? null; },
    getExtension(name) {
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
      }
      if (CAPTURED && CAPTURED.exts) return CAPTURED.exts.includes(name) ? {} : null;
      const available = {
        WEBGL_compressed_texture_s3tc_srgb: {},
        WEBGL_draw_buffers: {},
        EXT_float_blend: {},
        EXT_texture_compression_rgtc: {},
        OES_standard_derivatives: {},
        OES_texture_float_linear: {},
        OES_texture_half_float: {},
        ANGLE_instanced_arrays: {},
        WEBGL_debug_renderer_info: { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 },
      };
      return available[name] || null;
    },
  });
  win.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') return canvas2d;
    if (type === 'webgl' || type === 'experimental-webgl') return webgl;
    return null;
  };
  win.HTMLCanvasElement.prototype.toDataURL = function () {
    return (CAPTURED && CAPTURED.canvas) || CANVAS_DATAURL;
  };

  // markNative：让补的函数 toString 看起来像原生（Firefox 格式：含换行 + 4 空格缩进）
  const nativeFns = new WeakSet();
  function markNative(fn) {
    if (typeof fn !== 'function') return fn;
    nativeFns.add(fn);
    // jsdom 29 的 webidl 包装函数原型链不在 Function.prototype 上，必须给自有 toString
    try {
      Object.defineProperty(fn, 'toString', {
        value: function () { return `function ${fn.name || ''}() {\n    [native code]\n}`; },
        configurable: true, writable: true,
      });
    } catch (e) {}
    return fn;
  }
  // 三层防御：WeakSet + jsdom 源码特征 + 兜底原生串
  const origFnToString = win.Function.prototype.toString;
  const JSDOM_SRC_RE = /tryWrapperForImpl|implSymbol|_globalObject|_ownerDocument|jsdom|domtoquery|whatwg-url|parse5|esValue/;
  // 我们自己套的包装函数（prelude 的 __wrap / __api、canvas 包装等）也会被 SDK 拿去 toString，
  // 而载荷里确实带着函数源码（见 docs/notes.md 9.7），所以这些包装必须还原成 Firefox native 形态。
  const OWN_WRAPPER_RES = [
    /var ret;\s*[\s\S]{0,120}ret = (__)?orig[A-Za-z0-9_$]*\.apply\(this, arguments\)/,
    /var ret = (__)?orig[A-Za-z0-9_$]*\.apply\(this, arguments\)/,
    /window\.__api\(|window\.__stageLog|__st_args/,
    /this !== null && this !== undefined \? this :/,
  ];
  win.Function.prototype.toString = function () {
    try {
      if (nativeFns.has(this)) return `function ${this.name || ''}() {\n    [native code]\n}`;
      const src = origFnToString.call(this);
      if (src.indexOf('[native code]') !== -1) return src;
      if (JSDOM_SRC_RE.test(src)) return `function ${this.name || ''}() {\n    [native code]\n}`;
      for (const re of OWN_WRAPPER_RES) {
        if (re.test(src)) return `function ${this.name || ''}() {\n    [native code]\n}`;
      }
      return src;
    } catch (e) {
      return 'function () {\n    [native code]\n}';
    }
  };
  for (const k in canvas2d) if (typeof canvas2d[k] === 'function') markNative(canvas2d[k]);
  markNative(webgl.getParameter);
  markNative(webgl.getExtension);
  markNative(win.HTMLCanvasElement.prototype.getContext);
  markNative(win.HTMLCanvasElement.prototype.toDataURL);

  // 3.5 document.fonts（jsdom 没有 FontFaceSet；SDK 在画 canvas 文本前会探测字体）
  try {
    const fonts = {
      status: 'loaded',
      ready: Promise.resolve(),
      size: 0,
      check: () => true,
      load: () => Promise.resolve([]),
      add: () => fonts,
      delete: () => true,
      clear: () => {},
      forEach: () => {},
      has: () => false,
      [Symbol.iterator]: function* () {},
    };
    Object.defineProperty(win.document, 'fonts', { value: fonts, configurable: true });
    Object.defineProperty(win, 'FontFaceSet', { value: function FontFaceSet() {}, configurable: true });
  } catch (e) {}

  // 4. performance.timing（Firefox 152 已废弃：字段不可枚举，Object.keys 返回 0）
  try {
    const t0 = Date.now();
    const timing = {};
    const fields = { navigationStart: t0, unloadEventStart: 0, unloadEventEnd: 0, redirectStart: 0, redirectEnd: 0, fetchStart: t0, domainLookupStart: t0, domainLookupEnd: t0, connectStart: t0, connectEnd: t0, secureConnectionStart: t0, requestStart: t0 + 16, responseStart: t0 + 60, responseEnd: t0 + 61, domLoading: t0 + 66, domInteractive: t0 + 723, domContentLoadedEventStart: t0 + 882, domContentLoadedEventEnd: t0 + 895, domComplete: t0 + 7923, loadEventStart: t0 + 7923, loadEventEnd: t0 + 7926 };
    for (const [k, v] of Object.entries(fields)) {
      Object.defineProperty(timing, k, { value: v, enumerable: false, configurable: true });
    }
    win.performance.timing = timing;
  } catch (e) {}

  // 5. document 补丁（readyState=complete、hasFocus=true；URL 保留 options.url）
  try { Object.defineProperty(win.document, 'readyState', { value: 'complete', configurable: true }); } catch (e) {}
  try { win.document.hasFocus = () => true; } catch (e) {}
  try {
    if (!win.document.domain) {
      Object.defineProperty(win.document, 'domain', { get: () => 'www.zhipin.com', configurable: true });
    }
  } catch (e) {}
  // DOM 布局非零（jsdom 默认 0，真实浏览器非零，致命级）
  try {
    const bodyOh = (CAPTURED && CAPTURED.body && CAPTURED.body.oh) || 893;
    const bodyCh = (CAPTURED && CAPTURED.body && CAPTURED.body.ch) || 893;
    const wW = (CAPTURED && CAPTURED.win && CAPTURED.win.iw) || 1920;
    Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get: () => bodyOh, configurable: true });
    Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get: () => wW, configurable: true });
    Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { get: () => bodyCh, configurable: true });
    Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get: () => wW, configurable: true });
    Object.defineProperty(win.Element.prototype, 'getBoundingClientRect', { value: () => ({ x: 0, y: 0, width: wW, height: bodyOh, top: 0, left: 0, right: wW, bottom: bodyOh }), configurable: true });
  } catch (e) {}

  // 5.1 Gecko 标签与可见性（Firefox 真值：HTMLDocument / Screen / Navigator / Window）
  for (const [proto, tag] of [
    [win.Document.prototype, 'HTMLDocument'],
    [win.Screen.prototype, 'Screen'],
    [win.Navigator.prototype, 'Navigator'],
    [win.Window.prototype, 'Window'],
  ]) {
    try { Object.defineProperty(proto, Symbol.toStringTag, { get: () => tag, configurable: true }); } catch (e) {}
  }
  try { win.performance.navigation = { type: 0, redirectCount: 0 }; } catch (e) {}
  try { Object.defineProperty(win.document, 'visibilityState', { value: 'visible', configurable: true }); } catch (e) {}
  try { Object.defineProperty(win.document, 'hidden', { value: false, configurable: true }); } catch (e) {}

  // 5.2 document.all 的“不可检测”语义
  // 浏览器（含 jsdom 上的真实 Firefox）：typeof document.all === 'undefined'，
  // document.all == undefined 为真，但 document.all !== undefined 也为真。
  // jsdom 里 document.all 是普通 undefined，一测就暴露；这里用 V8 的 %GetUndetectable()
  // 拿到真正的 undetectable 对象（需要 node --allow-natives-syntax 启动）。
  try {
    if (installDocumentAll(win.document)) {
      win.__documentAllUndetectable = true;
    } else if (process.env.ZP_DEBUG_ALL) {
      console.log('[all] undetectable 不可用（需 node --allow-natives-syntax）');
    }
  } catch (e) {
    if (process.env.ZP_DEBUG_ALL) console.log('[all] define err:', e.message);
  }

  // 5.3 构造器名与 history.length（Firefox 真值：HTMLDocument / 2）
  try {
    const dproto = Object.getPrototypeOf(win.document);
    if (dproto && dproto.constructor) {
      Object.defineProperty(dproto.constructor, 'name', { value: 'HTMLDocument', configurable: true });
    }
  } catch (e) {}
  try { Object.defineProperty(win.history, 'length', { get: () => 2, configurable: true }); } catch (e) {}

  // 6. 特性检测对齐：补浏览器有、jsdom 缺的全局类（typeof 要匹配，用匿名 class 兜底）
  const BROWSER_DEFINED = 'TextEvent Float16Array Animation AnimationTimeline AudioParamMap BroadcastChannel ByteLengthQueuingStrategy Cache CanvasGradient ClipboardItem CompressionStream ConstantSourceNode Credential CustomStateSet DataTransferItem FontFace FragmentDirective GamepadHapticActuator ImageBitmap ImageData ImageDecoder Lock MIDIAccess MathMLElement MediaSession MediaStreamAudioSourceNode MessageChannel NavigationPreloadManager PerformanceMark PerformanceMeasure PerformanceNavigationTiming PerformancePaintTiming PerformanceServerTiming PeriodicWave PermissionStatus PushSubscriptionOptions RTCDtlsTransport RTCIceTransport RTCRtpScriptTransform RTCSctpTransport RTCStatsReport ReadableStreamBYOBReader ResizeObserver SVGAnimateMotionElement SVGComponentTransferFunctionElement SVGFEDropShadowElement SVGTextPathElement StereoPannerNode StorageManager TextDecoderStream TextMetrics UserActivation VideoColorSpace WebGL2RenderingContext WebGLRenderingContext WebTransport WritableStream Geolocation SVGMatrix DataTransfer SVGPoint SVGAElement SVGLength TimeRanges AsyncDisposableStack CloseWatcher Navigation NavigationActivation NavigatorLogin RTCError URLPattern'.split(' ');
  for (const k of BROWSER_DEFINED) {
    if (!(k in win)) { try { win[k] = class {}; } catch (e) {} }
  }
  // 非函数类型的全局，单独补真实值
  try { win.isSecureContext = true; } catch (e) {}
  try { win.structuredClone = (typeof structuredClone === 'function') ? structuredClone : ((v) => v); } catch (e) {}
  try { win.reportError = (e) => { try { console.error(e); } catch (x) {} }; } catch (e) {}
  // 浏览器有、jsdom 缺的具体构造器（SDK 会 typeof / 实例化）
  try {
    if (typeof win.AudioContext !== 'function') win.AudioContext = class AudioContext { constructor() { this.sampleRate = 48000; this.state = 'suspended'; } };
    if (typeof win.OfflineAudioContext !== 'function') win.OfflineAudioContext = class OfflineAudioContext { constructor() { this.sampleRate = 48000; this.length = 0; } startRendering() { return Promise.reject(new Error('not implemented')); } };
    if (typeof win.RTCPeerConnection !== 'function') win.RTCPeerConnection = class RTCPeerConnection {};
    if (typeof win.Notification !== 'function') {
      const NC = class Notification { };
      NC.permission = 'default';
      NC.requestPermission = () => Promise.resolve('default');
      win.Notification = NC;
    }
  } catch (e) {}
  // jsdom 内置 DOM 方法的 toString 也会泄漏源码：逐个补成 Firefox 原生串
  try {
    const nativeStr = (fn) => `function ${fn.name || ''}() {\n    [native code]\n}`;
    const protos = [
      win.Document.prototype, win.Element.prototype, win.Node.prototype,
      win.HTMLElement.prototype, win.HTMLCanvasElement.prototype,
      win.Navigator.prototype, win.Screen.prototype, win.EventTarget.prototype,
    ];
    for (const proto of protos) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        let desc;
        try { desc = Object.getOwnPropertyDescriptor(proto, name); } catch (e) { continue; }
        if (!desc || typeof desc.value !== 'function') continue;
        try {
          Object.defineProperty(desc.value, 'toString', {
            value: () => nativeStr(desc.value), configurable: true, writable: true,
          });
        } catch (e) {}
      }
    }
  } catch (e) {}
  // 新脚本无 jsdom 多余全局需清理（"s" 是脚本自身状态，非环境项）

  // 6.5 预置 cookie / storage（SDK 在真实页面里会大量读写 document.cookie）
  try {
    for (const [k, v] of Object.entries(options.cookies || {})) {
      win.document.cookie = `${k}=${encodeURIComponent(v)}; path=/`;
    }
  } catch (e) {}
  try {
    for (const [k, v] of Object.entries(options.sessionStorage || {})) win.sessionStorage.setItem(k, v);
    for (const [k, v] of Object.entries(options.localStorage || {})) win.localStorage.setItem(k, v);
  } catch (e) {}

  // 6.55 CSS 补丁提前到 bootstrap 之前：bootstrap 会缓存 style 对象
  if (CAPTURED && CAPTURED.cssProps) {
    // 先抓住 jsdom 的真实 CSSStyleDeclaration 原型（此时还没被替换），
    // 之后把它的可枚举性收敛成 Firefox 的样子：那 9 个方法在 Firefox 上是不可枚举的。
    let realCssProto = null;
    try { realCssProto = Object.getPrototypeOf(win.document.body.style); } catch (e) {}
    if (realCssProto) {
      for (const n of ['item', 'getPropertyValue', 'getPropertyPriority', 'setProperty',
                       'removeProperty', 'cssText', 'length', 'parentRule', 'toString']) {
        try {
          const d = Object.getOwnPropertyDescriptor(realCssProto, n);
          if (d) {
            if (d.configurable) {
              Object.defineProperty(realCssProto, n, { ...d, enumerable: false });
            } else if (d.get || d.set) {
              Object.defineProperty(realCssProto, n, {
                get: d.get, set: d.set, configurable: false, enumerable: false,
              });
            }
          }
        } catch (e) {}
      }
    }
    // 诊断用旋钮：按需补齐/削减三个计数维度，用来定位「某一项计数差 → 载荷哪一位变」
    const cssNames = (CAPTURED.cssProps || []).slice();
    {
      const padIdx = Number(process.env.ZP_CSS_INDEX_PAD || 0);
      for (let i = 0; i < padIdx; i++) cssNames.push('zp-pad-' + i);
      const trimIdx = Number(process.env.ZP_CSS_INDEX_TRIM || 0);
      if (trimIdx > 0) cssNames.length = Math.max(0, cssNames.length - trimIdx);
      // 页面的 CSS 自定义属性（--xxx）：真实页面上会出现在 style[383..415]。
      // ZP_CSS_APPEND="--font-size-sm,--icon-size-xs" 可把指定名字补进去做对照。
      // 真页面（jobs 列表页）在 getComputedStyle 里还有 33 个 CSS 自定义属性，
      // 浏览器实测从索引 383 开始，长度 383+33=416。缺这 33 项会让 SDK 的一个
      // 样式遍历循环少 33 次迭代（微步 384 vs 417），整条控制流从此分叉。
      // 默认就补上；ZP_CSS_NO_PAGE_VARS=1 可关闭（回到 383）。
      const PAGE_CSS_VARS = ['--sider-bar-background', '--sider-bar-padding',
        '--fixed-entry-background', '--fixed-entry-padding', '--report-dialog-background',
        '--report-dialog-padding', '--more-info-layer-background', '--more-info-layer-padding',
        '--job-list-login-card-background', '--job-list-login-card-padding',
        '--hide-salary-background', '--hide-salary-padding', '--shadow-key-ambient-opacity',
        '--shadow-key-penumbra-opacity', '--shadow-key-umbra-opacity', '--cubic-bezier',
        '--color-text-disabled', '--color-disabled', '--color-danger', '--color-warning',
        '--color-success', '--color-info', '--color-primary', '--color-text', '--color-body',
        '--icon-size-lg', '--icon-size-md', '--icon-size-sm', '--icon-size-xs',
        '--font-size-lg', '--font-size-md', '--font-size-sm', '--font-size-xs'];
      if (process.env.ZP_CSS_NO_PAGE_VARS !== '1') {
        for (const n of PAGE_CSS_VARS) if (!cssNames.includes(n)) cssNames.push(n);
      }
      const appendNames = String(process.env.ZP_CSS_APPEND || '').split(',').filter(Boolean);
      for (const n of appendNames) cssNames.push(n);
      // ZP_CSS_SOURCE=sdkproto：把实例名字源换成 CSSStyleProperties 原型那份完整表（1152 条）。
      // 用途：SDK 的 CSS 收集器（state 5800）在实例上只读到 383 条 → 本地 PU=723，浏览器 1866。
      if (process.env.ZP_CSS_SOURCE === 'sdkproto') {
        const all = (CAPTURED.cssSdkProto || []).slice();
        cssNames.length = 0;
        for (const n of all) cssNames.push(n);
      }
    }
    const cssValues = process.env.ZP_CSS_VALUES_BLANK === '1' ? {} : (CAPTURED.cssValues || {});
    const CSS_NAMED = String(process.env.ZP_CSS_NAMED || '').split(',').filter(Boolean);
    const camelize = (n) => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    // 用 null 原型：避免把 Object.prototype 的名字（hasOwnProperty 等）混进原型链枚举
    const cssProto = Object.create(null);
    // 优先用「浏览器里 SDK 实际枚举到的顺序」（首段去重前缀），比 raw 原型名更准
    const sdkProto = CAPTURED.cssSdkProto;
    const allNames = (Array.isArray(sdkProto) && sdkProto.length) ? sdkProto : CAPTURED.cssProtoAll;
    const enumNames = CAPTURED.cssProtoEnum;
    if (Array.isArray(allNames) && allNames.length) {
      // 以“浏览器实测的原型名顺序 + 可枚举性”为准。
      // 注意：constructor 必须最后定义 —— 浏览器 SDK 侧枚举出来第一位是 alignItems，
      // 而我们若把 constructor 先定义，getOwnPropertyNames 会把它排到第一位，
      // 整份 1866 项名字表整体错位一格，后面压进载荷的聚合就全变了。
      // 浏览器实测（b9a070d3 / Firefox 152 实时核对）：
      //   CSSStyleDeclaration.prototype 自有名 **1152**、首位 alignItems、**末位 constructor**；
      //   for-in 可枚举合计 1159；实例索引键 416。
      // 顺序很关键：constructor 既不能放第一位（会让整表错位），也不能省略（少一项），
      // 必须像浏览器那样排在**最后**。否则载荷里那张 26 字节的位掩码会差一位。
      const enumSet = new Set(Array.isArray(enumNames) ? enumNames : []);
      const tailNames = [];
      for (const n of allNames) {
        if (/^\d+$/.test(n)) continue;
        if (n === 'constructor') { tailNames.push(n); continue; }
        const v = (cssValues[n] !== undefined)
          ? cssValues[n]
          : (cssValues[n.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] || '');
        try {
          Object.defineProperty(cssProto, n, {
            get: () => v, configurable: true, enumerable: enumSet.has(n),
          });
        } catch (e) {}
      }
      for (const n of tailNames) {
        try {
          Object.defineProperty(cssProto, n, {
            get: () => Function, configurable: true, enumerable: false,
          });
        } catch (e) {}
      }
    } else {
      for (const ent of (CAPTURED.cssProtoEntries || [])) {
        if (ent.n === 'constructor') continue;
        if (/^\d+$/.test(ent.n)) continue; // 索引属性属于实例，不进原型
        const v = (cssValues[ent.n] !== undefined)
          ? cssValues[ent.n]
          : (cssValues[ent.n.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] || '');
        try {
          Object.defineProperty(cssProto, ent.n, {
            get: () => v, configurable: true, enumerable: !!ent.e,
          });
        } catch (e) {}
      }
    }
    // 浏览器实测原型链（b9a070d3 / Firefox 152）：
    //   depth0 CSSStyleProperties  own 1152（属性访问器 + constructor 在末位）
    //   depth1 CSSStyleDeclaration own 9（8 个可枚举成员 + 非枚举 constructor）  ← jsdom 之前缺这一层
    //   depth2 Object
    // for-in 合计 = 1151 + 8 = 1159。缺这一层会让载荷里那张 26 字节位掩码差一位。
    // SDK 的 CSS 收集器（state 5800）走 getPrototypeOf 链取原型名：
    // 多一层只带 9 个名字的中间原型会让它收不到那 1152 条（PU 723 vs 浏览器 1866），
    // 进而让块 B 的 53 位判定错位。默认**不加**中间层；ZP_CSS_DECLPROTO=1 可恢复。
    const declProto = process.env.ZP_CSS_DECLPROTO === '1' ? Object.create(cssProto) : cssProto;
    for (const n of ['item', 'getPropertyValue', 'getPropertyPriority', 'setProperty',
      'removeProperty', 'cssText', 'length', 'parentRule']) {
      try {
        Object.defineProperty(declProto, n, {
          get: () => {
            if (n === 'length') return cssNames.length;
            if (n === 'cssText') return cssNames.map((k) => k + ': ;').join(' ');
            if (n === 'parentRule') return null;
            if (n === 'item') return (i) => cssNames[i] || '';
            if (n === 'getPropertyValue') return (k) => (cssValues[k] !== undefined ? cssValues[k] : '');
            if (n === 'getPropertyPriority') return () => '';
            return () => undefined;
          },
          configurable: true, enumerable: true,
        });
      } catch (e) {}
    }
    try {
      Object.defineProperty(declProto, 'constructor', {
        get: () => win.CSSStyleDeclaration,
        configurable: true, enumerable: false,
      });
    } catch (e) {}

    // 方法放在实例上（原型名集合必须与浏览器完全一致，不能多出 item/getPropertyValue）
    const makeCssStub = function () {
      const o = Object.create(declProto);
      Object.defineProperty(o, 'length', { value: cssNames.length, enumerable: false, configurable: true });
      for (let i = 0; i < cssNames.length; i++) {
        Object.defineProperty(o, i, {
          value: cssNames[i], enumerable: true, configurable: true, writable: true,
        });
      }
      Object.defineProperty(o, 'item', {
        value: (i) => cssNames[i] || '', configurable: true, enumerable: false,
      });
      Object.defineProperty(o, 'getPropertyValue', {
        value: (n) => (cssValues[n] !== undefined ? cssValues[n] : ''), configurable: true, enumerable: false,
      });
      Object.defineProperty(o, 'getPropertyPriority', {
        value: () => '', configurable: true, enumerable: false,
      });
      Object.defineProperty(o, Symbol.iterator, {
        value: function* () { for (const n of cssNames) yield n; }, configurable: true, enumerable: false,
      });
      // Linux/Firefox 的 computed style 还有一批「简写名」只作为命名属性存在（不进索引），
      // SDK 的 CSS 收集器（state 5800）会把它们收进 PU，从而影响块 B 的 53 位判定。
      // ZP_CSS_NAMED="gap,border-block,..." 以命名属性形式补上，不改 style.length / 索引。
      for (const nm of CSS_NAMED) {
        try {
          Object.defineProperty(o, nm, {
            value: cssValues[nm] !== undefined ? cssValues[nm] : '', enumerable: true, configurable: true,
          });
        } catch (e) {}
      }
      return o;
    };
    win.getComputedStyle = function () { return makeCssStub(); };
    cssInstaller = (w2) => {
      try { w2.getComputedStyle = function () { return makeCssStub(); }; } catch (e) {}
      try {
        Object.defineProperty(w2.HTMLElement.prototype, 'style', {
          get() { return makeCssStub(); }, configurable: true,
        });
      } catch (e) {}
      try {
        Object.defineProperty(w2.SVGElement.prototype, 'style', {
          get() { return makeCssStub(); }, configurable: true,
        });
      } catch (e) {}
    };
    // SDK 枚举的其实是 jsdom 真实的 CSSStyleDeclaration（bootstrap 里可能已缓存），
    // 所以直接把它的原型改造成 Firefox 的名字集合：删掉 jsdom 自带的 9 个名字。
    try {
      const P = win.CSSStyleDeclaration && win.CSSStyleDeclaration.prototype;
      if (P && Array.isArray(allNames) && allNames.length) {
        const enumSet2 = new Set(Array.isArray(enumNames) ? enumNames : []);
        for (const n of Object.getOwnPropertyNames(P)) {
          try { delete P[n]; } catch (e) {}
        }
        for (const n of allNames) {
          if (/^\d+$/.test(n)) continue;
          if (n === 'constructor') continue;
          const v = (cssValues[n] !== undefined)
            ? cssValues[n]
            : (cssValues[n.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] || '');
          try {
            Object.defineProperty(P, n, {
              get: () => v, set: () => {}, configurable: true, enumerable: enumSet2.has(n),
            });
          } catch (e) {}
        }
      }
    } catch (e) {}
    // SDK 同时会枚举 element.style（jsdom 的真实 CSSStyleDeclaration 会带出
    // setProperty/cssText/Object.prototype 等 19 个 Firefox 没有的名字）
    try {
      Object.defineProperty(win.HTMLElement.prototype, 'style', {
        get() { return makeCssStub(); }, configurable: true,
      });
      Object.defineProperty(win.SVGElement.prototype, 'style', {
        get() { return makeCssStub(); }, configurable: true,
      });
    } catch (e) {}
    // SDK 还会用 document.implementation.createHTMLDocument() 建“干净文档”取 style，
    // 那个文档有自己的 HTMLElement 原型，主窗口补丁覆盖不到。
    try {
      const DIP = win.DOMImplementation && win.DOMImplementation.prototype;
      if (DIP && typeof DIP.createHTMLDocument === 'function') {
        const origCreate = DIP.createHTMLDocument;
        DIP.createHTMLDocument = function () {
          const d = origCreate.apply(this, arguments);
          try { installDocumentAll(d); } catch (e) {}
          try {
            const proto = Object.getPrototypeOf(d.createElement('div'));
            Object.defineProperty(proto, 'style', {
              get() { return makeCssStub(); }, configurable: true,
            });
          } catch (e) {}
          try {
            const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
            Object.defineProperty(Object.getPrototypeOf(svg), 'style', {
              get() { return makeCssStub(); }, configurable: true,
            });
          } catch (e) {}
          return d;
        };
      }
    } catch (e) {}
  }
  if (options.bootstrap !== false) {
    // 页面脚本用到的极简框架存根
    try {
      if (typeof win.$ !== 'function') {
        win.$ = win.jQuery = function (sel) {
          return {
            on() { return this; }, off() { return this; }, css() { return this; },
            attr() { return this; }, html() { return this; }, text() { return this; },
            append() { return this; }, remove() { return this; }, each() { return this; },
            length: 0,
          };
        };
        win.$.ajax = () => ({ done() { return this; }, fail() { return this; }, always() { return this; } });
      }
      if (!win.HTTP) {
        win.HTTP = {
          ajax(o) {
            try { if (o && typeof o.fail === 'function') o.fail({}); } catch (e) {}
            return { done() { return this; }, fail() { return this; }, always() { return this; } };
          },
        };
      }
    } catch (e) {}
    if (!BOOTSTRAP_BLOCKS) {
      try {
        BOOTSTRAP_BLOCKS = JSON.parse(fs.readFileSync('./config/security_inline.json', 'utf8'));
      } catch (e) {
        BOOTSTRAP_BLOCKS = [];
      }
    }
    for (const block of BOOTSTRAP_BLOCKS) {
      try { win.eval(block); } catch (e) { /* 页面脚本依赖 jQuery/DOM/网络，失败不影响后续 SDK */ }
    }
  }

  // 6.65 storage 终态对齐：bootstrap 可能写入键，按浏览器实测快照重置
  if (CAPTURED && CAPTURED.localStorage !== undefined) {
    try {
      win.localStorage.clear();
      for (const [k, v] of Object.entries(CAPTURED.localStorage)) win.localStorage.setItem(k, v);
    } catch (e) {}
  }
  // deviceMemory：浏览器为 undefined 时保持“存在但为 undefined”
  try { Object.defineProperty(win.navigator, 'deviceMemory', { value: undefined, configurable: true }); } catch (e) {}

  // 6.7 getComputedStyle：按 Firefox 实测的枚举结果对齐（SDK 会遍历属性名 + 原型链）
  // 6.9 消融钩子：加载 SDK 前执行一段覆盖代码（用于定位某个阶段依赖哪些环境项）
  if (options.preEval) {
    try { win.eval(options.preEval); } catch (e) { console.error('preEval error:', e && e.message); }
  }

  // 6.95 prelude 放在最后：确定性随机 / 阶段日志 / 读探针，必须在 SDK 之前、
  // 且在 bootstrap 之后执行（bootstrap 会消耗 Math.random，提前装 PRNG 会导致随机序列错位）
  if (options.prelude) {
    try { win.eval(options.prelude); } catch (e) { console.error('prelude error:', e && e.message); }
  }

  // 6.97 prelude 的 __wrap 把原生函数换成了 JS 包装，而载荷确实会把「函数源码」算进聚合摘要
  //      （见 docs/notes.md 9.7），所以 SDK 加载前把这些被包过的入口统一回收成 Firefox native 形态。
  {
    const NATIVE_TARGETS = [
      [win, 'getComputedStyle'], [win, 'matchMedia'], [win, 'fetch'], [win, 'reportError'],
      [win, 'structuredClone'], [win.localStorage, 'getItem'], [win.localStorage, 'setItem'],
      [win.sessionStorage, 'getItem'], [win.sessionStorage, 'setItem'],
      [win.performance, 'now'], [win.Date, 'now'], [win.document, 'hasFocus'],
    ];
    for (const [obj, key] of NATIVE_TARGETS) {
      try {
        if (obj && typeof obj[key] === 'function') {
          // 包装函数常常丢了 name，Firefox 原生形态是 `function getComputedStyle() {...}`
          if (!obj[key].name) {
            try { Object.defineProperty(obj[key], 'name', { value: key, configurable: true }); } catch (e) {}
          }
          markNative(obj[key]);
        }
      } catch (e) {}
    }
    for (const [proto, key] of [
      [win.HTMLCanvasElement.prototype, 'getContext'], [win.HTMLCanvasElement.prototype, 'toDataURL'],
      [win.CanvasRenderingContext2D.prototype, 'fillText'], [win.CanvasRenderingContext2D.prototype, 'measureText'],
    ]) {
      try {
        if (typeof proto[key] === 'function' && !proto[key].name) {
          try { Object.defineProperty(proto[key], 'name', { value: key, configurable: true }); } catch (e) {}
        }
        markNative(proto[key]);
      } catch (e) {}
    }
  }

  // 6.98 增量环境补丁（env_extra.js）：PluginArray/MimeTypeArray 真结构、window 键数、
  //      frames === window 的浏览器语义。默认开启；ZP_NO_EXTRA=1 可关闭做 A/B。
  if (process.env.ZP_NO_EXTRA !== '1') {
    try {
      const { applyExtraEnv } = require('./env_extra.js');
      const st = applyExtraEnv(win, {});
      if (process.env.ZP_DEBUG_ALL) console.log('[extra]', JSON.stringify(st).slice(0, 300));
    } catch (e) {
      if (process.env.ZP_DEBUG_ALL) console.log('[extra] 跳过:', e && e.message);
    }
  }

  // 6.99 applyExtraEnv 会重建 Navigator 原型上的描述符，这里把实测值最后再钉一次
  //      （SDK 走原型 getter 读 language/languages/hardwareConcurrency）
  try {
    const NP2 = Object.getPrototypeOf(win.navigator);
    Object.defineProperty(NP2, 'language', {
      get: () => BROWSER.language, configurable: true, enumerable: true,
    });
    Object.defineProperty(NP2, 'languages', {
      get: () => LANGS_FACTORY(), configurable: true, enumerable: true,
    });
    Object.defineProperty(NP2, 'hardwareConcurrency', {
      get: () => BROWSER.hardwareConcurrency, configurable: true, enumerable: true,
    });
  } catch (e) {}

  // 6.995 删掉「Firefox 152 上其实不存在、但我们补环境时造出来了」的全局。
  // SDK 会逐个探测一批全局构造器（130 个名字），用 `window[name] !== undefined` 决定后续分支：
  //   - 真实 Firefox 上其中 28 个是 undefined；
  //   - 我们早期为对齐 typeof 把它们补成了 class {}，于是探测结果不同 →
  //     微步序列在此分叉（位于 state (17,9,19)：`p = Oj ? 21606 : 20483`，其中 Oj = e[xj] !== t）。
  // 实测：删掉这 28 个后 token 长度 477→473、载荷 byte5 245→241、byte8 55→39，与浏览器完全一致。
  const NON_FIREFOX_GLOBALS = ['AudioSinkInfo', 'BackgroundFetchManager', 'BatteryManager',
    'CanvasFilter', 'ChapterInformation', 'Counter', 'DOMError', 'DevicePosture', 'EditContext',
    'Fence', 'FontData', 'GravitySensor', 'ManagedMediaSource', 'MediaSourceHandle',
    'NetworkInformation', 'NotRestoredReasonDetails', 'PaymentManager', 'SVGDiscardElement',
    'SVGRenderingIntent', 'StorageAccessHandle', 'StorageBucket', 'TouchList', 'WebKitPoint',
    'WebSocketError', 'XRBoundedReferenceSpace', 'XRCamera', 'XRCompositionLayer', 'XRHand'];
  for (const name of NON_FIREFOX_GLOBALS) {
    try { delete win[name]; } catch (e) {}
    try {
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(win) || {}, name);
      if (d) Object.defineProperty(Object.getPrototypeOf(win), name, { value: undefined, configurable: true });
    } catch (e) {}
  }

  // 6.998 让 iframe 子 realm 的 Window 构造器看起来是原生实现。
  // SDK 会读 `String(iframe.contentWindow.constructor).replace(/\s/g,'').length` 并写进载荷（槽 191）。
  // jsdom 的 Window 是 JS 实现 ⇒ 去除空白后 58 字符；Firefox 原生是 `function Window() { [native code] }` ⇒ 30。
  // 关键：必须打在**子 realm**（jsdom 每个 iframe 有独立 intrinsics），主 realm 覆盖无效。
  // 开关：ZP_NO_IFRAME_NATIVE=1 可关闭。
  if (process.env.ZP_NO_IFRAME_NATIVE !== '1') {
    try {
      const proto = win.HTMLIFrameElement && win.HTMLIFrameElement.prototype;
      const desc = proto && Object.getOwnPropertyDescriptor(proto, 'contentWindow');
      if (desc && desc.get) {
        const NATIVE_WINDOW_SRC = 'function Window() { [native code] }';
        const seenWin = [];
        const patchOnce = (w) => {
          for (const s of seenWin) if (s === w) return;
          seenWin.push(w);
          try {
            const F = w.Function;
            const WC = w.constructor;
            if (!F || !F.prototype || typeof WC !== 'function') return;
            if (F.prototype === Function.prototype) return;
            const fts = F.prototype.toString;
            const nt = function toString() { return this === WC ? NATIVE_WINDOW_SRC : fts.call(this); };
            Object.defineProperty(nt, 'name', { value: 'toString', configurable: true });
            Object.defineProperty(F.prototype, 'toString', {
              value: nt, enumerable: false, configurable: true, writable: true,
            });
          } catch (e) {}
        };
        Object.defineProperty(proto, 'contentWindow', {
          configurable: true,
          enumerable: !!desc.enumerable,
          get: function () { const w2 = desc.get.call(this); try { if (w2) patchOnce(w2); } catch (e) {} return w2; },
        });
      }
    } catch (e) {}
  }

  // 6.997 让 document 的「自有属性形状」贴近 Firefox。
  // SDK 会读 `Object.getOwnPropertyNames(document).length` 和 `Object.keys(document).length`
  // 并写进载荷（对应槽 239 / 240）。浏览器实测两者都是 3，jsdom 分别是 8 / 2。
  // 做法：把几个自有属性搬到原型（读值不变），再把剩下的自有属性设为可枚举。
  // 开关：ZP_NO_DOC_SHAPE=1 可关闭（回到 jsdom 原生形状）。
  if (process.env.ZP_NO_DOC_SHAPE !== '1') {
    try {
      const d = win.document;
      const P = Object.getPrototypeOf(d);
      const moveToProto = ['fonts', 'readyState', 'domain', 'visibilityState', 'hidden'];
      for (const n of moveToProto) {
        let desc;
        try { desc = Object.getOwnPropertyDescriptor(d, n); } catch (e) { continue; }
        if (!desc || !desc.configurable) continue;
        try { Object.defineProperty(P, n, desc); } catch (e) { continue; }
        try { delete d[n]; } catch (e) {}
      }
      let rest = [];
      try { rest = Object.getOwnPropertyNames(d); } catch (e) { rest = []; }
      for (const nm of rest) {
        let de;
        try { de = Object.getOwnPropertyDescriptor(d, nm); } catch (e) { continue; }
        if (!de || !de.configurable || de.enumerable) continue;
        de.enumerable = true;
        try { Object.defineProperty(d, nm, de); } catch (e) {}
      }
    } catch (e) {}
  }

  // 6.996 SDK 会读 `Object.keys(window).length` 并把结果写进载荷（新版是 238/240 两个槽）。
  // 浏览器真实 jobs 页实测 456 条，本地 455 条 → 240 槽差 1。
  // ZP_WINKEY_PAD=<n> 在 SDK eval 之前补 n 个惰性全局，仅为对齐这个「条数」；
  // 注意：只对齐条数，不追求名字成分（子会话已证明名字身份对该槽无影响）。
  // 默认 0（不补）。曾一度设为 1，但那组「浏览器 456 键」数据来自被 instrumentation
  // 改写过的 SDK 产物（332382），不是厂商字节；在干净基线下补键反而让差异从 6 增到 7。
  const winkeyPad = Number(process.env.ZP_WINKEY_PAD || 0);
  for (let i = 0; i < winkeyPad; i++) {
    try { win['__zp_pad_' + i] = undefined; } catch (e) {}
  }

  // 7. 加载脚本（默认 config/_sdk_*.js 最新一份，可传入改写脚本用于插桩对比）
  // 可选：用真实 <script> 标签注入，贴近页面 dynamicLoadJs 的加载方式
  const useScriptTag = options.scriptTag || process.env.ZP_SCRIPT_TAG === '1';
  if (useScriptTag) {
    const el = win.document.createElement('script');
    el.textContent = scriptSrc || VM_SRC;
    win.document.body.appendChild(el);
  } else {
    win.eval(scriptSrc || VM_SRC);
  }
  // 调试：枚举来源探针（仅 jsdom 侧，用于定位 SDK 到底枚举了哪个对象）
  if (process.env.ZP_ENUM_DEBUG) {
    const dbg = [];
    const record = (api, o, r) => {
      try {
        if (r && r.length > 100 && dbg.length < 80) {
          let ctor = '?';
          try { ctor = (o && o.constructor && o.constructor.name) || typeof o; } catch (e) {}
          const st = new Error().stack.split('\n').slice(2, 5).join(' | ');
          dbg.push({ api, len: r.length, ctor, st: st.slice(0, 260) });
        }
      } catch (e) {}
    };
    const wrap = (holder, name, api) => {
      const orig = holder[name];
      holder[name] = function (o) {
        const r = orig.apply(this, arguments);
        record(api, o, r);
        return r;
      };
    };
    wrap(win.Object, 'getOwnPropertyNames', 'getOwnPropertyNames');
    wrap(win.Object, 'keys', 'keys');
    if (win.Reflect && win.Reflect.ownKeys) wrap(win.Reflect, 'ownKeys', 'ownKeys');
    win.__enumDebug = dbg;
  }

  return win;
}

module.exports = { buildSandbox, genToken: (win) => (seed, ts) => new win.ABC().z(seed, ts) };
