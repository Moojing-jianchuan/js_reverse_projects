/**
 * sandbox_factory.js —— 补环境沙箱（vm context 原生内建 + 环境包取值）
 *
 * 【补环境六步法 步骤 2/4】这里同时是"本地环境"和 patchEnvironment() 的实现。
 *
 * 关键设计：宿主只注入 console / timers / 一个随机源函数；
 * 其余全部在 context 内部由 env_bootstrap.js 建立，
 * 否则 JSDUN 这类 VM 用 `[].constructor.constructor('return this')()` 会拿到宿主 global，
 * 第二阶段解码失败（表现为 SyntaxError: Unexpected number）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { buildBootstrapSource } = require('./env_bootstrap.js');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE_PATH = path.join(ROOT, 'artifacts/env_baseline/dewu_env_bundle.json');

let _bundle = null;
function loadEnvBundle() {
  if (_bundle !== null) return _bundle;
  try { _bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8')); }
  catch (e) { _bundle = {}; }
  return _bundle;
}

/** bundle 的值统一包成 {type, value}（compare_env 导出格式），这里自动解包 */
function pick(obj, p, fallback) {
  let cur = obj;
  for (const seg of p.split('.')) {
    if (cur == null) return fallback;
    cur = cur[seg];
  }
  if (cur && typeof cur === 'object' && !Array.isArray(cur) && 'value' in cur && 'type' in cur) cur = cur.value;
  return cur === undefined || cur === null ? fallback : cur;
}

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

const CANVAS_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

/** 建 ENV 种子（纯 JSON，供 bootstrap 使用） */
function buildEnvSeed(opts = {}) {
  const bundle = opts.bundle === undefined ? loadEnvBundle() : opts.bundle;
  const uaFamily = opts.uaFamily || 'chrome';
  const isChrome = uaFamily === 'chrome';
  const seed = opts.seed || {};

  let ua = pick(bundle, 'navigator.userAgent', isChrome ? CHROME_UA : FIREFOX_UA);
  if (isChrome && /Firefox/.test(ua)) ua = CHROME_UA;
  if (!isChrome && /Chrome/.test(ua)) ua = FIREFOX_UA;

  const env = {
    time: seed.time || 1763600000000,
    timeStep: seed.timeStep || 1,
    rand: seed.rand || 0x12345678,
    traceLimit: opts.traceLimit || 200000,
    jsonMin: opts.jsonMin === undefined ? 40 : opts.jsonMin,
    hooks: opts.hooks !== false,
    deterministicRandom: !!seed.deterministicRandom,
    hookFlags: Object.assign({ fromCharCode: false, join: false, perfNow: false }, opts.hookFlags || {}),
    href: seed.href || 'https://www.dewu.com/',
    host: 'www.dewu.com',
    pathname: seed.pathname || '/',
    title: seed.title || '得物App-新一代潮流网购社区',
    cookie: seed.cookie || '',
    localStorage: seed.localStorage || {},
    sessionStorage: seed.sessionStorage || {},
    canvasDataUrl: seed.canvasDataUrl || CANVAS_DATA_URL,
    navigator: {
      userAgent: ua,
      appName: 'Netscape',
      appCodeName: 'Mozilla',
      appVersion: ua.replace('Mozilla/', ''),
      platform: isChrome ? 'Win32' : pick(bundle, 'navigator.platform', 'Win32'),
      vendor: isChrome ? 'Google Inc.' : pick(bundle, 'navigator.vendor', ''),
      vendorSub: '',
      product: 'Gecko',
      productSub: isChrome ? '20030107' : '20100101',
      language: 'zh-CN',
      languages: ['zh-CN', 'zh'],
      cookieEnabled: true,
      doNotTrack: null,
      onLine: true,
      webdriver: false,
      hardwareConcurrency: seed.hardwareConcurrency || 8,
      deviceMemory: 8,
      maxTouchPoints: 0,
      pdfViewerEnabled: true,
      plugins: { length: 5 },
      mimeTypes: { length: 2 },
      connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false },
    },
    screen: {
      width: pick(bundle, 'screen.width', 1920),
      height: pick(bundle, 'screen.height', 1080),
      availWidth: pick(bundle, 'screen.availWidth', 1920),
      availHeight: pick(bundle, 'screen.availHeight', 1032),
      colorDepth: 24,
      pixelDepth: 24,
      orientation: { type: 'landscape-primary', angle: 0 },
      availTop: 0,
      availLeft: 0,
    },
    window: {
      outerWidth: seed.outerWidth || 1920,
      outerHeight: seed.outerHeight || 969,
      innerWidth: seed.innerWidth || 1920,
      innerHeight: seed.innerHeight || 969,
      devicePixelRatio: seed.devicePixelRatio || 1,
      screenX: 0,
      screenY: 0,
    },
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
      glsl: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.00 Chromium)',
      extensions: [
        'ANGLE_instanced_arrays', 'EXT_blend_minmax', 'EXT_clip_control', 'EXT_color_buffer_half_float',
        'EXT_depth_clamp', 'EXT_disjoint_timer_query', 'EXT_float_blend', 'EXT_frag_depth',
        'EXT_polygon_offset_clamp', 'EXT_shader_texture_lod', 'EXT_texture_compression_bptc',
        'EXT_texture_compression_rgtc', 'EXT_texture_filter_anisotropic', 'EXT_texture_mirror_clamp_to_edge',
        'EXT_sRGB', 'KHR_parallel_shader_compile', 'OES_element_index_uint', 'OES_fbo_render_mipmap',
        'OES_standard_derivatives', 'OES_texture_float', 'OES_texture_float_linear', 'OES_texture_half_float',
        'OES_texture_half_float_linear', 'OES_vertex_array_object', 'WEBGL_blend_func_extended',
        'WEBGL_color_buffer_float', 'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_s3tc_srgb',
        'WEBGL_debug_renderer_info', 'WEBGL_debug_shaders', 'WEBGL_depth_texture', 'WEBGL_draw_buffers',
        'WEBGL_lose_context', 'WEBGL_multi_draw', 'WEBGL_polygon_mode'
      ],
    },
    chrome: isChrome ? { runtime: {}, app: {}, csi: null, loadTimes: null } : { runtime: {} },
  };
  return env;
}

/**
 * @returns vm.Context —— 直接当全局对象用（ctx.fun / ctx.document 都走 global）
 * 另挂两个宿主侧辅助：
 *   ctx.__trace  （沙箱内 trace 对象，跨 realm 访问）
 *   read(expr)   —— 在 context 内求值
 */
function makeSandbox(opts = {}) {
  const env = buildEnvSeed(opts);
  const traceHolder = { calls: [] };

  const host = {
    console: opts.console || console,
    setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
    __hostRandomFill: (n) => crypto.randomBytes(n),
  };
  if (opts.globalExtras) Object.assign(host, opts.globalExtras);

  const ctx = vm.createContext(host, { name: opts.name || 'dewu-env' });
  // 把 trace 容器注入 context，让 bootstrap 复用它（宿主侧保留同一引用）
  vm.runInContext('globalThis.__trace = { reads: [], calls: [] };', ctx);
  traceHolder.calls = ctx.__trace.calls;

  const bootstrap = buildBootstrapSource(JSON.stringify(env));
  try {
    vm.runInContext(bootstrap, ctx, { filename: 'env_bootstrap.js' });
  } catch (e) {
    console.error('[env_bootstrap] failed:', e && e.message);
    throw e;
  }
  ctx.__env = env;
  ctx.read = (expr) => vm.runInContext(expr, ctx);
  return ctx;
}

// 兼容旧探针：makeSandbox({trace}) 里的 trace 已由 ctx.__trace 提供
module.exports = { makeSandbox, buildEnvSeed, loadEnvBundle, BUNDLE_PATH, ROOT, CHROME_UA, FIREFOX_UA };
