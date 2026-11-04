// jsdom 环境伪装：真 DOM 对象 + 补 navigator/screen/window/canvas/webgl/timing
const { JSDOM } = require('jsdom');
const fs = require('fs');

const VM_SRC = fs.readFileSync('./config/014d55b6.js', 'utf8');
const CANVAS_DATAURL = fs.readFileSync('./config/canvas_fingerprint.txt', 'utf8').trim();

// 浏览器真值（Camoufox Windows 采集，Firefox 内核）
const BROWSER = {
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
  platform: 'Win32', language: 'en-US', languages: ['en-US', 'en'], hardwareConcurrency: 8,
  screen: { width: 1366, height: 768, availWidth: 1366, availHeight: 728, colorDepth: 24, pixelDepth: 24 },
  window: { innerWidth: 1278, innerHeight: 663, outerWidth: 1294, outerHeight: 728, screenX: 72, screenY: 0, screenLeft: 72, screenTop: 0, devicePixelRatio: 1 },
  webgl: {
    37445: 'Google Inc. (Intel)',  // UNMASKED_VENDOR_WEBGL
    37446: 'ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar',  // UNMASKED_RENDERER_WEBGL
  },
};

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

function buildSandbox(scriptSrc) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://www.zhipin.com/web/geek/jobs', pretendToBeVisual: true, runScripts: 'dangerously',
  });
  const win = dom.window;

  // 1. navigator 补丁
  const nav = win.navigator;
  const navOv = {
    userAgent: BROWSER.ua, platform: BROWSER.platform, language: BROWSER.language, languages: BROWSER.languages,
    hardwareConcurrency: BROWSER.hardwareConcurrency, maxTouchPoints: 0, appVersion: '5.0 (Windows)',
    appName: 'Netscape', appCodeName: 'Mozilla', product: 'Gecko', productSub: '20100101',
    vendor: '', vendorSub: '', cookieEnabled: true, onLine: true, webdriver: false,
    doNotTrack: 'unspecified', buildID: '20181001000000', oscpu: 'Windows NT 10.0; Win64; x64', pdfViewerEnabled: true,
  };
  for (const [k, v] of Object.entries(navOv)) {
    try { Object.defineProperty(nav, k, { value: v, configurable: true }); } catch (e) {}
  }
  const { pluginArray, mimeTypeArray } = buildPluginStructures();
  try { Object.defineProperty(nav, 'plugins', { value: pluginArray, configurable: true }); } catch (e) {}
  try { Object.defineProperty(nav, 'mimeTypes', { value: mimeTypeArray, configurable: true }); } catch (e) {}

  // 2. screen + window 补丁
  for (const [k, v] of Object.entries(BROWSER.screen)) {
    try { Object.defineProperty(win.screen, k, { value: v, configurable: true }); } catch (e) {}
  }
  for (const [k, v] of Object.entries(BROWSER.window)) {
    try { Object.defineProperty(win, k, { value: v, configurable: true }); } catch (e) {}
  }
  win.scrollX = 0; win.scrollY = 0;

  // 3. canvas 2d + webgl 指纹（值来自 ce475149.js 真实调用捕获）
  const canvas2d = {
    fillText() {}, strokeText() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
    measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]), width: 1, height: 1 }),
    font: '', textAlign: '', textBaseline: '', fillStyle: '', strokeStyle: '',
  };
  // webgl 上下文：做成 WebGLRenderingContext 实例（否则 instanceof 检测失败）
  const WebGLRC = (win.WebGLRenderingContext = class WebGLRenderingContext {});
  const webgl = Object.assign(Object.create(WebGLRC.prototype), {
    getParameter(p) { return BROWSER.webgl[p] ?? null; },
    getExtension(name) {
      // 浏览器真实可用扩展（9 个），WEBGL_multi_draw 返回 null
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
  win.HTMLCanvasElement.prototype.toDataURL = function () { return CANVAS_DATAURL; };

  // markNative：让补的函数 toString 看起来像原生（skill 致命级 #1）
  const NATIVE_STR = 'function () { [native code] }';
  function markNative(fn) {
    if (typeof fn !== 'function') return fn;
    try { fn.toString = () => NATIVE_STR; } catch (e) {}
    return fn;
  }
  for (const k in canvas2d) if (typeof canvas2d[k] === 'function') markNative(canvas2d[k]);
  markNative(webgl.getParameter);
  markNative(webgl.getExtension);
  markNative(win.HTMLCanvasElement.prototype.getContext);
  markNative(win.HTMLCanvasElement.prototype.toDataURL);

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

  // 5. document 补丁（iframe 环境：readyState=complete、URL=about:blank、hasFocus=true）
  try { Object.defineProperty(win.document, 'readyState', { value: 'complete', configurable: true }); } catch (e) {}
  try { Object.defineProperty(win.document, 'URL', { value: 'about:blank', configurable: true }); } catch (e) {}
  try { win.document.hasFocus = () => true; } catch (e) {}
  // DOM 布局非零（jsdom 默认 0，真实浏览器非零，致命级）
  try {
    Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get: () => 663, configurable: true });
    Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get: () => 1261, configurable: true });
    Object.defineProperty(win.Element.prototype, 'getBoundingClientRect', { value: () => ({ x: 0, y: 0, width: 1261, height: 663, top: 0, left: 0, right: 1261, bottom: 663 }), configurable: true });
  } catch (e) {}

  // 6. 特性检测对齐：补浏览器有、jsdom 缺的全局类（typeof 要匹配，用匿名 class 兜底）
  const BROWSER_DEFINED = 'TextEvent Float16Array Animation AnimationTimeline AudioParamMap BroadcastChannel ByteLengthQueuingStrategy Cache CanvasGradient ClipboardItem CompressionStream ConstantSourceNode Credential CustomStateSet DataTransferItem FontFace FragmentDirective GamepadHapticActuator ImageBitmap ImageData ImageDecoder Lock MIDIAccess MathMLElement MediaSession MediaStreamAudioSourceNode MessageChannel NavigationPreloadManager PerformanceMark PerformanceMeasure PerformanceNavigationTiming PerformancePaintTiming PerformanceServerTiming PeriodicWave PermissionStatus PushSubscriptionOptions RTCDtlsTransport RTCIceTransport RTCRtpScriptTransform RTCSctpTransport RTCStatsReport ReadableStreamBYOBReader ResizeObserver SVGAnimateMotionElement SVGComponentTransferFunctionElement SVGFEDropShadowElement SVGTextPathElement StereoPannerNode StorageManager TextDecoderStream TextMetrics UserActivation VideoColorSpace WebGL2RenderingContext WebGLRenderingContext WebTransport WritableStream Geolocation SVGMatrix DataTransfer SVGPoint SVGAElement SVGLength TimeRanges AsyncDisposableStack CloseWatcher Navigation NavigationActivation NavigatorLogin RTCError URLPattern'.split(' ');
  for (const k of BROWSER_DEFINED) {
    if (!(k in win)) { try { win[k] = class {}; } catch (e) {} }
  }
  // 非函数类型的全局，单独补真实值
  try { win.isSecureContext = true; } catch (e) {}
  try { win.structuredClone = (typeof structuredClone === 'function') ? structuredClone : ((v) => v); } catch (e) {}
  try { win.reportError = (e) => { try { console.error(e); } catch (x) {} }; } catch (e) {}
  // 新脚本无 jsdom 多余全局需清理（"s" 是脚本自身状态，非环境项）

  // 7. 加载脚本（默认 ce475149.js，可传入改写脚本用于插桩对比）
  win.eval(scriptSrc || VM_SRC);
  return win;
}

module.exports = { buildSandbox, genToken: (win) => (seed, ts) => new win.ABC().z(seed, ts) };
