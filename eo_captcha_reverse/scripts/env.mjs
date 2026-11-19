import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { BROWSER_GLOBAL_KEYS, browserGlobalDefault } from './browser_globals.mjs';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

/**
 * Create the vm context with a Firefox-compatible Error.stack renderer.
 *
 * The SDK calls something like `new Error().stack.match(/.../)[0]` to learn where it is running.
 * V8's default stack is "    at fn (file:1:2)", which does not match that pattern -> match()
 * returns null -> `null[0]` throws, and the SDK records that TypeError as a fingerprint slot.
 * Error.prepareStackTrace lets us render the Firefox form "fn@url:line:col".
 */
export function createContext(w, tdcUrl = 'https://captcha.eo.qq.com/tdc.js', fileName) {
  const ctx = vm.createContext(w);
  const url = String(tdcUrl || 'https://captcha.eo.qq.com/tdc.js');
  vm.runInContext(
    'Error.prepareStackTrace = function (err, frames) {\n' +
    '  var out = [];\n' +
    '  for (var i = 0; i < frames.length; i++) {\n' +
    '    var f = frames[i];\n' +
    '    var name = (typeof f.getFunctionName === "function" && f.getFunctionName()) || "anonymous";\n' +
    '    var file = (typeof f.getFileName === "function" && f.getFileName()) || ' + JSON.stringify(url) + ';\n' +
    '    var line = (typeof f.getLineNumber === "function" && f.getLineNumber()) || 1;\n' +
    '    var col  = (typeof f.getColumnNumber === "function" && f.getColumnNumber()) || 1;\n' +
    '    out.push(name + "@" + file + ":" + line + ":" + col);\n' +
    '  }\n' +
    '  return out.join("\\n");\n' +
    '};',
    ctx
  );
  return { ctx, options: fileName ? { filename: fileName } : {} };
}

// Real Firefox-on-Windows fingerprint recorded from the live browser (see samples/fingerprint_browser.json)
const FP = {
  nav: {
    userAgent: UA, appVersion: '5.0 (Windows)', appName: 'Netscape', vendor: '', platform: 'Win32',
    languages: ['en-US', 'en'], language: 'en-US', webdriver: false, hardwareConcurrency: 32, deviceMemory: 8,
    cookieEnabled: true, maxTouchPoints: 0,
    plugins: [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 },
    ],
    mimes: ['application/pdf', 'text/pdf'],
    oscpu: 'Windows NT 10.0; Win64; x64', productSub: '20100101', vendorSub: '', buildID: '20181001000000',
  },
  screen: { width: 1366, height: 768, availWidth: 1366, availHeight: 720, colorDepth: 24, pixelDepth: 24, dpr: 1.25 },
  win: { outerWidth: 1295, outerHeight: 687, innerWidth: 1281, innerHeight: 624 },
  webgl: {
    VENDOR: 'Mozilla', RENDERER: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar',
    VERSION: 'WebGL 1.0', SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 1.0',
    unmaskedVendor: 'Google Inc. (NVIDIA)',
    unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar',
    MAX_TEXTURE_SIZE: 16384, MAX_VIEWPORT_DIMS: [32767, 32767],
    MAX_VERTEX_ATTRIBS: 16, MAX_TEXTURE_IMAGE_UNITS: 16, MAX_VARYING_VECTORS: 30, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16, MAX_VERTEX_UNIFORM_VECTORS: 4096, MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
    MAX_CUBE_MAP_TEXTURE_SIZE: 16384, MAX_RENDERBUFFER_SIZE: 16384, ALIASED_LINE_WIDTH_RANGE: [1, 1],
    ALIASED_POINT_SIZE_RANGE: [1, 1024],
    extensions: [
      'ANGLE_instanced_arrays', 'EXT_blend_minmax', 'EXT_color_buffer_half_float', 'EXT_depth_clamp', 'EXT_float_blend',
      'EXT_frag_depth', 'EXT_polygon_offset_clamp', 'EXT_shader_texture_lod', 'EXT_sRGB', 'EXT_texture_compression_bptc',
      'EXT_texture_compression_rgtc', 'EXT_texture_filter_anisotropic', 'OES_element_index_uint', 'OES_fbo_render_mipmap',
      'OES_standard_derivatives', 'OES_texture_float', 'OES_texture_float_linear', 'OES_texture_half_float',
      'OES_texture_half_float_linear', 'OES_vertex_array_object', 'WEBGL_color_buffer_float',
      'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_s3tc_srgb', 'WEBGL_debug_renderer_info',
      'WEBGL_debug_shaders', 'WEBGL_depth_texture', 'WEBGL_draw_buffers', 'WEBGL_lose_context', 'WEBGL_provoking_vertex',
    ],
    precision: { precision: 23, rangeMin: 127, rangeMax: 127 },
  },
  fonts: { baseW: 515, baseH: 108, detected: ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Comic Sans MS', 'Impact', 'Lucida Console', 'MS Gothic', 'SimSun', 'Microsoft YaHei'] },
  canvasDataUrl: null,
};

const realFontPath = path.join(process.cwd(), 'samples', 'dumped_font_widths.json');
let FONT_WIDTHS = null;
let FONT_NORMALIZED = null;
// TDC may set fontFamily with different spacing/quoting than our probe string;
// match on a normalised key and fall back to the raw form.
const m_lookup = (map, raw) => {
  const key = String(raw).replace(/\s+/g, '').toLowerCase();
  if (map.has(key)) return map.get(key);
  const bare = key.replace(/^['"]|['"]$/g, '');
  if (map.has(bare)) return map.get(bare);
  return undefined;
};
if (fs.existsSync(realFontPath)) {
  try { FONT_WIDTHS = JSON.parse(fs.readFileSync(realFontPath, 'utf8')).res; } catch (e) { FONT_WIDTHS = null; }
}
const realCanvasPath = path.join(process.cwd(), 'samples', 'canvas_real_dataurl.txt');
if (fs.existsSync(realCanvasPath)) FP.canvasDataUrl = fs.readFileSync(realCanvasPath, 'utf8').trim();

// Real OfflineAudioContext output recorded from the captcha iframe
// (hook on startRendering -> getChannelData(0)); the SDK hashes this buffer,
// so an invented waveform is a detectable tell.
const realAudioPath = path.join(process.cwd(), 'samples', 'dumped_audio_full.json');
let AUDIO_SAMPLES = null;
if (fs.existsSync(realAudioPath)) {
  try {
    const a = JSON.parse(fs.readFileSync(realAudioPath, 'utf8'));
    if (Array.isArray(a.samples) && a.samples.length) AUDIO_SAMPLES = Float32Array.from(a.samples);
  } catch (e) { AUDIO_SAMPLES = null; }
}

// Real getImageData(120,60) buffer recorded from the captcha iframe
const realPixelsPath = path.join(process.cwd(), 'samples', 'canvas_pixels.bin');
let REAL_PIXELS = null;
if (fs.existsSync(realPixelsPath)) {
  try { REAL_PIXELS = new Uint8ClampedArray(fs.readFileSync(realPixelsPath)); } catch (e) { REAL_PIXELS = null; }
}

export function buildEnv({ onListener, onTrace } = {}) {
  const listeners = [];
  const trace = onTrace || (() => {});
  const w = {};
  w.window = w; w.self = w;

  const plugins = FP.nav.plugins.map(p => ({ ...p }));
  const mimes = FP.nav.mimes.map(t => ({ type: t, suffixes: '', description: '', enabledPlugin: plugins[0] }));
  w.navigator = {
    userAgent: FP.nav.userAgent, appVersion: FP.nav.appVersion, appName: FP.nav.appName, vendor: FP.nav.vendor,
    platform: FP.nav.platform, languages: [...FP.nav.languages], language: FP.nav.language, webdriver: FP.nav.webdriver,
    hardwareConcurrency: FP.nav.hardwareConcurrency, deviceMemory: FP.nav.deviceMemory, cookieEnabled: FP.nav.cookieEnabled,
    maxTouchPoints: FP.nav.maxTouchPoints, oscpu: FP.nav.oscpu, productSub: FP.nav.productSub, vendorSub: FP.nav.vendorSub,
    buildID: FP.nav.buildID,
    plugins: Object.assign(plugins, { length: plugins.length, item: (i) => plugins[i], namedItem: (n) => plugins.find(p => p.name === n) }),
    mimeTypes: Object.assign(mimes, { length: mimes.length, item: (i) => mimes[i], namedItem: (n) => mimes.find(m => m.type === n) }),
    javaEnabled: () => false,
  };
  // The SDK runs inside the widget iframe, so location is the widget document
  // (decrypted cd[64] == "https://captcha.eo.gtimg.com/static/template/widget_ele_eo.e349d149.html?rand=…").
  const WIDGET_URL = 'https://captcha.eo.gtimg.com/static/template/widget_ele_eo.e349d149.html';
  w.location = { href: WIDGET_URL, host: 'captcha.eo.gtimg.com', hostname: 'captcha.eo.gtimg.com', protocol: 'https:', search: '', pathname: '/static/template/widget_ele_eo.e349d149.html', origin: 'https://captcha.eo.gtimg.com', port: '', ancestorOrigins: ['https://blog.51cto.com'], toString() { return this.href; } };
  // decrypted cd[30] == "1;<sid>": the leading flag comes from this marker
  w.__TDC_PROTECT_T0 = Date.now();
  // The SDK runs inside the widget iframe: window.name carries "<apiDomain>|<cdnDomain>",
  // and top !== self (decrypted cd[3] / cd[45] show exactly this shape).
  w.name = 'https://captcha.eo.qq.com|https://captcha.eo.gtimg.com/static';
  w.top = { name: 'https://captcha.eo.qq.com|https://captcha.eo.gtimg.com/static', length: 1 };
  w.parent = w.top;
  w.self = w;
  w.location.toString = () => w.location.href;

  // ---- canvas / webgl stubs echoing the recorded real fingerprint ----
  const glConst = {
    VENDOR: 0x1f00, RENDERER: 0x1f01, VERSION: 0x1f02, SHADING_LANGUAGE_VERSION: 0x8b8c,
    MAX_TEXTURE_SIZE: 0x0d33, MAX_VIEWPORT_DIMS: 0x0d3a, MAX_VERTEX_ATTRIBS: 0x8869,
    MAX_TEXTURE_IMAGE_UNITS: 0x8872, MAX_VARYING_VECTORS: 0x8dfc, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8b4c, MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb, MAX_FRAGMENT_UNIFORM_VECTORS: 0x8dfd,
    MAX_CUBE_MAP_TEXTURE_SIZE: 0x851c, MAX_RENDERBUFFER_SIZE: 0x84e8, ALIASED_LINE_WIDTH_RANGE: 0x846e,
    ALIASED_POINT_SIZE_RANGE: 0x846d, FRAGMENT_SHADER: 0x8b30, VERTEX_SHADER: 0x8b31, HIGH_FLOAT: 0x8df2,
    HIGH_INT: 0x8df5, MEDIUM_FLOAT: 0x8df1, LOW_FLOAT: 0x8df0, MEDIUM_INT: 0x8df4, LOW_INT: 0x8df3,
    DEPTH_TEST: 0x0b71, BLEND: 0x0be2, TEXTURE_2D: 0x0de1, ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88e4,
    COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100, TRIANGLES: 0x0004,
  };
  const glStub = {
    ...glConst,
    getParameter(p) {
      trace('gl.getParameter', p);
      switch (p) {
        case 0x1f00: return FP.webgl.VENDOR;
        case 0x1f01: return FP.webgl.RENDERER;
        case 0x1f02: return FP.webgl.VERSION;
        case 0x8b8c: return FP.webgl.SHADING_LANGUAGE_VERSION;
        case 0x0d33: return FP.webgl.MAX_TEXTURE_SIZE;
        case 0x0d3a: return FP.webgl.MAX_VIEWPORT_DIMS;
        case 0x8869: return FP.webgl.MAX_VERTEX_ATTRIBS;
        case 0x8872: return FP.webgl.MAX_TEXTURE_IMAGE_UNITS;
        case 0x8dfc: return FP.webgl.MAX_VARYING_VECTORS;
        case 0x8b4d: return FP.webgl.MAX_COMBINED_TEXTURE_IMAGE_UNITS;
        case 0x8b4c: return FP.webgl.MAX_VERTEX_TEXTURE_IMAGE_UNITS;
        case 0x8dfb: return FP.webgl.MAX_VERTEX_UNIFORM_VECTORS;
        case 0x8dfd: return FP.webgl.MAX_FRAGMENT_UNIFORM_VECTORS;
        case 0x851c: return FP.webgl.MAX_CUBE_MAP_TEXTURE_SIZE;
        case 0x84e8: return FP.webgl.MAX_RENDERBUFFER_SIZE;
        case 0x846e: return new Float32Array(FP.webgl.ALIASED_LINE_WIDTH_RANGE);
        case 0x846d: return new Float32Array(FP.webgl.ALIASED_POINT_SIZE_RANGE);
        case 0x0d3a: return new Int32Array(FP.webgl.MAX_VIEWPORT_DIMS);
        case 0x9245: return FP.webgl.unmaskedVendor;
        case 0x9246: return FP.webgl.unmaskedRenderer;        default: return 0;
      }
    },
    getExtension(name) {
      trace('gl.getExtension', name);
      if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
      if (name === 'WEBGL_lose_context') return { loseContext() {}, restoreContext() {} };
      return {};
    },
    getSupportedExtensions: () => FP.webgl.extensions.slice(),
    getShaderPrecisionFormat(shaderType, precisionType) {
      const isInt = [0x8df5, 0x8df4, 0x8df3].includes(precisionType);   // HIGH/MEDIUM/LOW_INT
      return isInt
        ? { precision: 0, rangeMin: 31, rangeMax: 30 }
        : { precision: 23, rangeMin: 127, rangeMax: 127 };
    },
    createBuffer: () => ({}), createProgram: () => ({}), createShader: () => ({}), shaderSource() {}, compileShader() {},
    attachShader() {}, linkProgram() {}, useProgram() {}, getProgramParameter: () => true, getShaderParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: () => ({}), bufferData() {}, drawArrays() {}, uniform1f() {},
    clearColor() {}, clear() {}, enable() {}, disable() {}, viewport() {}, getError: () => 0,
    // gp probe reads pixels and hashes them: all-zero output makes it report s:-3.
    // Deterministic non-zero gradient keeps the probe alive (sp then matches the real engine).
    readPixels(x, y, w, h, fmt, type, px) {
      if (px && px.length) { for (let i = 0; i < px.length; i++) px[i] = (i * 37 + 11) & 0xff; }
    },
    createTexture: () => ({}), bindTexture() {}, texImage2D() {}, texParameteri() {}, generateMipmap() {}, activeTexture() {},
    createFramebuffer: () => ({}), bindFramebuffer() {}, framebufferTexture2D() {}, createRenderbuffer: () => ({}),
    bindRenderbuffer() {}, renderbufferStorage() {}, framebufferRenderbuffer() {},
    // methods the SDK's shader/GPU probe touches (missing ones make it silently degrade)
    bindBuffer() {}, bindAttribLocation() {}, vertexAttribPointer() {}, enableVertexAttribArray() {},
    disableVertexAttribArray() {}, drawElements() {}, pixelStorei() {}, uniform2f() {}, uniform3f() {},
    uniform4f() {}, uniform1i() {}, uniformMatrix4fv() {}, validateProgram() {},
    getProgramInfoLog: () => '', getShaderInfoLog: () => '', getAttachedShaders: () => [],
    getActiveUniform: () => ({ name: 'u', size: 1, type: 0 }), getActiveAttrib: () => ({ name: 'a', size: 1, type: 0 }),
    getUniform: () => 0, getVertexAttrib: () => 0, getBufferParameter: () => 0, getFramebufferAttachmentParameter: () => 0,
    getRenderbufferParameter: () => 0, getTexParameter: () => 0, isContextLost: () => false, isEnabled: () => false,
    checkFramebufferStatus: () => 0x8cd5, hint() {}, lineWidth() {}, polygonOffset() {}, depthFunc() {}, depthMask() {},
    colorMask() {}, cullFace() {}, frontFace() {}, blendFunc() {}, blendFuncSeparate() {}, blendEquation() {},
    scissor() {}, stencilFunc() {}, stencilOp() {}, stencilMask() {}, detachShader() {}, deleteShader() {},
    deleteProgram() {}, deleteBuffer() {}, deleteTexture() {}, deleteFramebuffer() {}, deleteRenderbuffer() {},
    getContextAttributes: () => ({
      alpha: true, antialias: true, depth: true, desynchronized: false, failIfMajorPerformanceCaveat: false,
      powerPreference: 'default', premultipliedAlpha: true, preserveDrawingBuffer: false, stencil: false,
    }),
    finish() {}, flush() {},
    get drawingBufferWidth() { return 300; },
    get drawingBufferHeight() { return 150; },
  };

  const make2d = (canvas) => ({
    canvas,
    fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif', globalAlpha: 1, globalCompositeOperation: 'source-over',
    textBaseline: 'alphabetic', textAlign: 'start', lineWidth: 1, shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)',
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText(t, x, y) { trace('2d.fillText', String(t).slice(0, 40)); },
    strokeText() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, rect() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, fill() {}, stroke() {}, clip() {}, save() {}, restore() {},
    translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {}, resetTransform() {},
    drawImage() {}, createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}), getLineDash: () => [], setLineDash() {}, isPointInPath: () => false,
    measureText(t) { const s = String(t); trace('2d.measureText', s.slice(0, 40)); return { width: s.length * 7.3125 + (s.length ? 1.5 : 0), actualBoundingBoxAscent: 12.76, actualBoundingBoxDescent: 2.98, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 7.3125 }; },
    getImageData(x, y, wd, ht) {
      trace('2d.getImageData', `${wd}x${ht}`);
      if (REAL_PIXELS && wd * ht * 4 === REAL_PIXELS.length) {
        return { width: wd, height: ht, data: new Uint8ClampedArray(REAL_PIXELS) };
      }
      return { width: wd, height: ht, data: new Uint8ClampedArray(wd * ht * 4).map((_, i) => (i * 37) % 251) };
    },
    putImageData() {}, createImageData: (wd, ht) => ({ width: wd, height: ht, data: new Uint8ClampedArray(wd * ht * 4) }),
  });

  const canvasProto = {
    width: 300, height: 150,
    getContext(kind) {
      trace('canvas.getContext', kind);
      if (kind === '2d') return make2d(this);
      if (kind === 'webgl' || kind === 'experimental-webgl' || kind === 'webgl2') return glStub;
      return null;
    },
    toDataURL(type) {
      trace('canvas.toDataURL', type);
      return FP.canvasDataUrl || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    },
    toBlob(cb, type) {
      trace('canvas.toBlob', type);
      // a real Blob-ish object: the SDK reads .size / .type / arrayBuffer()
      const blob = {
        size: 3944,
        type: type || 'image/png',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(3944)),
        slice() { return blob; },
        text: () => Promise.resolve(''),
      };
      try { cb(blob); } catch (e) {}
    },
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 150, top: 0, left: 0 }),
    style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {},
  };

  const makeEl = (tag) => {
    trace('createElement', tag);
    if (tag === 'canvas') return Object.assign(Object.create(null), canvasProto);
    const el = {
      tagName: String(tag).toUpperCase(), style: {}, children: [],
      setAttribute() {}, getAttribute() { return null; }, appendChild(c) { this.children.push(c); }, removeChild() {},
      replaceChild() {}, cloneNode() { return makeEl(tag); },
      addEventListener(t, fn) { listeners.push({ target: tag, t, fn }); },
      removeEventListener() {},
      insertBefore() {}, removeAttribute() {}, hasAttribute() { return false; },
      replaceChild() {}, removeChild() {},
      get innerHTML() { return ''; }, set innerHTML(v) {},
      get outerHTML() { return '<' + tag + '>'; },
      // decrypted cd[55] == {x:-9999,y:-9999,w:100,h:100,ol:-9999,ot:-9999,ow:100,oh:100}
      // (the element the SDK measures is off-screen in the real widget)
      getBoundingClientRect() { return { x: -9999, y: -9999, width: 100, height: 100, top: -9999, left: -9999, right: -9899, bottom: -9899 }; },
      contentWindow: null, parentNode: null,
      canPlayType(t) {
        // Values measured in the real widget (decrypted cd[5] / cd[37])
        const s = String(t).toLowerCase();
        if (/hev1|hvc1|h265|hevc/.test(s)) return '';
        if (/theora/.test(s)) return '';
        if (/mp4v|mpeg-4|mpeg4/.test(s) && !/avc/.test(s)) return '';
        if (/opus/.test(s)) return 'probably';
        if (/vorbis/.test(s)) return 'probably';
        if (/audio\/wav|audio\/wave/.test(s)) return 'probably';
        if (/flac/.test(s)) return 'maybe';
        if (/x-m4a|audio\/m4a/.test(s)) return 'maybe';
        if (/audio\/mpeg|mp3/.test(s)) return 'maybe';
        if (/aac|mp4a/.test(s)) return 'probably';
        if (/avc1|avc|h264/.test(s)) return 'probably';
        if (/vp8|vp9|av01|av1/.test(s)) return 'probably';
        if (/video\/mp4/.test(s)) return 'probably';
        if (/video\/webm/.test(s)) return 'probably';
        if (/audio\/(ogg|webm)/.test(s)) return 'probably';
        return '';
      },
    };
    Object.defineProperty(el, 'offsetWidth', {
      get() {
        const raw = String(this.style.fontFamily || '');
        trace('offsetWidth', raw);
        // font probing sets fontFamily; the layout probe (cd[55]) measures a bare element (100x100)
        if (!raw) return 100;
        if (FONT_WIDTHS) {
          const norm = FONT_NORMALIZED || (FONT_NORMALIZED = (() => {
            const m = new Map();
            for (const [k, v] of Object.entries(FONT_WIDTHS)) m.set(k.replace(/\s+/g, '').toLowerCase(), v);
            return m;
          })());
          const hit = m_lookup(norm, raw);
          if (hit !== undefined) return hit;
        }
        return 515;
      },
    });
    Object.defineProperty(el, 'offsetHeight', { get() { return String(this.style.fontFamily || '') ? 108 : 100; } });
    Object.defineProperty(el, 'offsetLeft', { get() { return -9999; } });
    Object.defineProperty(el, 'offsetTop', { get() { return -9999; } });
    return el;
  };

  w.document = {
    cookie: '', referrer: '', title: 'Security Verification',
    documentElement: { lang: 'en', style: {}, clientWidth: 1281, clientHeight: 624, getAttribute() { return null; }, setAttribute() {}, addEventListener(t, fn) { listeners.push({ target: 'documentElement', t, fn }); } },
    body: { clientWidth: 1281, clientHeight: 624, appendChild() {}, removeChild() {}, style: {}, addEventListener(t, fn) { listeners.push({ target: 'body', t, fn }); } },
    head: { appendChild() {}, removeChild() {} },
    createElement: makeEl,
    addEventListener(t, fn) { listeners.push({ target: 'document', t, fn }); }, removeEventListener() {},
    querySelectorAll: () => [], querySelector: () => null, getElementsByTagName: () => [], getElementById: () => null,
    createEvent: () => ({ initEvent() {} }), visibilityState: 'visible', hidden: false, hasFocus: () => true,
    fonts: { check: () => true, size: 12 },
  };
  w.screen = { width: FP.screen.width, height: FP.screen.height, availWidth: FP.screen.availWidth, availHeight: FP.screen.availHeight, colorDepth: FP.screen.colorDepth, pixelDepth: FP.screen.pixelDepth, orientation: { type: 'landscape-primary', angle: 0 } };
  w.outerWidth = FP.win.outerWidth; w.outerHeight = FP.win.outerHeight; w.innerWidth = FP.win.innerWidth; w.innerHeight = FP.win.innerHeight;
  w.devicePixelRatio = FP.screen.dpr;
  w.performance = { now: () => Number(process.hrtime.bigint() / 1000n) / 1000, timing: { navigationStart: Date.now() - 3000 }, navigation: { type: 0 }, memory: { jsHeapSizeLimit: 4294705152, totalJSHeapSize: 32511048, usedJSHeapSize: 24255432 } };
  w.setTimeout = setTimeout; w.clearTimeout = clearTimeout; w.setInterval = setInterval; w.clearInterval = clearInterval;
  w.console = console; w.addEventListener = (t, fn) => listeners.push({ target: 'window', t, fn });
  w.removeEventListener = () => {}; w.postMessage = () => {};
  // Real in-memory storage: the SDK writes then reads back (that round-trip drives the
  // "flag;sid" slot — with a no-op storage the flag stays 0 while a real browser reports 1).
  const makeStorage = () => {
    const m = new Map();
    const st = {
      getItem(k) { const key = String(k); return m.has(key) ? m.get(key) : null; },
      setItem(k, v) { m.set(String(k), String(v)); },
      removeItem(k) { m.delete(String(k)); },
      clear() { m.clear(); },
      key(i) { const keys = Array.from(m.keys()); return i < keys.length ? keys[i] : null; },
      get length() { return m.size; },
    };
    return st;
  };
  w.localStorage = makeStorage();
  w.sessionStorage = makeStorage();
  w.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} addEventListener() {} };
  w.crypto = crypto;
  w.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  w.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  w.Event = class { constructor(t, o) { Object.assign(this, o || {}); this.type = t; } };
  w.MouseEvent = w.Event; w.KeyboardEvent = w.Event; w.PointerEvent = w.Event;
  w.TouchEvent = w.Event; w.UIEvent = w.Event;
  w.OfflineAudioContext = class OfflineAudioContext {
    constructor(a, b, c) {
      trace('new OfflineAudioContext');
      if (a && typeof a === 'object') {
        this.length = a.length || 4500;
        this._rate = a.sampleRate || 44100;
        this._channels = a.numberOfChannels || 1;
      } else {
        this._channels = a || 1;
        this.length = b || 4500;
        this._rate = c || 44100;
      }
      this.destination = { maxChannelCount: 2, channelCount: this._channels, numberOfInputs: 1, numberOfOutputs: 0, connect() {}, disconnect() {} };
      this.state = 'suspended';
      this.currentTime = 0;
      this.oncomplete = null;
    }
    get sampleRate() { return this._rate; }
    get baseLatency() { return 0; }
    get outputLatency() { return 0; }
    close() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    get channelCount() { return this._channels; }
    get numberOfChannels() { return this._channels; }
    get numberOfInputs() { return 1; }
    get numberOfOutputs() { return 0; }
    createOscillator() { return { type: 'sine', frequency: { value: 0, setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createDynamicsCompressor() { return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect() {} }; }
    createGain() { return { gain: { value: 0, setValueAtTime() {} }, connect() {} }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    createAnalyser() { return { fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0.8, minDecibels: -100, maxDecibels: -30, numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'max', channelInterpretation: 'speakers', connect() {}, getFloatFrequencyData() {} }; }
    startRendering() {
      trace('startRendering');
      const buf = AUDIO_SAMPLES || (() => { const a = new Float32Array(4500); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i / 100) * 0.0001; return a; })();
      const audioBuffer = {
        getChannelData: () => buf,
        sampleRate: 44100,
        length: buf.length,
        numberOfChannels: 1,
        duration: buf.length / 44100,
      };
      return Promise.resolve(audioBuffer);
    }
    get sampleRate() { return 44100; }
  };
  w.AudioContext = class AudioContext {
    constructor() {
      this.sampleRate = 48000;       // device rate, as the real engine reports (decrypted cd[19])
      this.baseLatency = 0;
      this.outputLatency = 0;
      this.state = 'running';
      this.currentTime = 0;
      this.destination = { maxChannelCount: 2, channelCount: 2, numberOfInputs: 1, numberOfOutputs: 0, channelCountMode: 'explicit', channelInterpretation: 'speakers', connect() {}, disconnect() {} };
    }
    createOscillator() { return { type: 'sine', frequency: { value: 0, setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createDynamicsCompressor() { return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect() {} }; }
    createAnalyser() { return { fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0.8, minDecibels: -100, maxDecibels: -30, numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'max', channelInterpretation: 'speakers', connect() {}, getFloatFrequencyData() {} }; }
    createGain() { return { gain: { value: 0, setValueAtTime() {} }, connect() {} }; }
    close() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  };
  w.webkitOfflineAudioContext = w.OfflineAudioContext;
  w.globalThis = w;
  w.__listeners = listeners;
  // Match the real iframe's enumerable global surface (282 own keys) — the SDK reads it.
  // Must run BEFORE harden() so harden's walk() marks these functions as native.
  for (const k of BROWSER_GLOBAL_KEYS) {
    if (k in w) continue;
    try {
      const v = browserGlobalDefault(k, w);
      if (v === undefined) continue;
      w[k] = v;
    } catch (e) {}
  }
  harden(w);
  return w;
}

/**
 * Make the sandbox look native to FeatureDetect-style probes (jsdom-env-patches §1/§6).
 * Baseline recorded from the real captcha iframe (samples/baseline_iframe.json):
 *   Object.prototype.toString.call(navigator) -> [object Navigator]
 *   Symbol.toStringTag -> Navigator / HTMLDocument / Screen
 *   Function.prototype.toString -> "function name() { [native code] }"   (Firefox, single line)
 *   inner 330x70, outer 2048x1104, screen 2048x1152, dpr 1.25
 * Without this, every stub answers with its own JS source, which is a one-line bot tell.
 */
function harden(w) {
  const nativeFns = new WeakSet();
  const origFnToString = Function.prototype.toString;

  const mark = (fn) => {
    if (typeof fn === 'function') nativeFns.add(fn);
    return fn;
  };
  const walk = (obj, depth = 0, seen = new Set()) => {
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function') || depth > 3 || seen.has(obj)) return;
    seen.add(obj);
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key === 'caller' || key === 'callee' || key === 'arguments') continue;
      try {
        const desc = Object.getOwnPropertyDescriptor(obj, key);
        if (!desc) continue;
        if (typeof desc.value === 'function') { nativeFns.add(desc.value); if (depth < 3) walk(desc.value, depth + 1, seen); }
        if (typeof desc.get === 'function') nativeFns.add(desc.get);
        if (typeof desc.set === 'function') nativeFns.add(desc.set);
      } catch (e) { /* one hostile getter must not abort the whole walk */ }
    }
  };

  // 1) Function.prototype.toString -> Firefox-style native string for everything we provided
  const patched = function toString() {
    if (nativeFns.has(this)) {
      let name = this.name || '';
      if (name.startsWith('get ') || name.startsWith('set ')) name = name.slice(4);
      if (!name) name = 'anonymous';
      return 'function ' + name + '() {\n    [native code]\n}';
    }
    return origFnToString.call(this);
  };
  nativeFns.add(patched);
  Object.defineProperty(Function.prototype, 'toString', { value: patched, writable: true, configurable: true });

  for (const target of [w.navigator, w.screen, w.document, w.performance, w.localStorage, w.sessionStorage, w.XMLHttpRequest.prototype, w.crypto, w]) {
    try { walk(target); } catch (e) {}
  }
  try { walk(w.document.documentElement); } catch (e) {}
  try {
    const c = w.document.createElement('canvas');
    walk(c);
    const ctx = c.getContext('2d');
    if (ctx) walk(ctx);
    const gl = w.document.createElement('canvas').getContext('webgl');
    if (gl) { walk(gl); if (gl.__proto__) walk(gl.__proto__); }
  } catch (e) {}

  // 2) Symbol.toStringTag so Object.prototype.toString matches the real engine
  const tag = (obj, value) => {
    try { Object.defineProperty(obj, Symbol.toStringTag, { value, configurable: true }); } catch (e) {}
  };
  tag(w.navigator, 'Navigator');
  tag(w.document, 'HTMLDocument');
  tag(w.screen, 'Screen');
  tag(w, 'Window');

  // 3) iframe geometry actually seen by the SDK (the widget runs inside a 330x70 iframe)
  const set = (name, value) => { try { Object.defineProperty(w, name, { value, writable: true, configurable: true, enumerable: true }); } catch (e) {} };
  set('innerWidth', 330);
  set('innerHeight', 70);
  set('outerWidth', 2048);
  set('outerHeight', 1104);
  set('screenX', 0);
  set('screenY', 0);
  w.screen.width = 2048; w.screen.height = 1152;
  w.screen.availWidth = 2048; w.screen.availHeight = 1104;
  // decrypted cd[24] == "srgb"
  w.screen.colorSpace = 'srgb';
  // the SDK reads the challenge sid from a global (decrypted cd[30] == "1;<sid>")
  w.TCaptchaSid = '1106021005';

  // 4) document basics
  w.document.readyState = 'complete';
  w.document.characterSet = 'UTF-8';
  w.document.contentType = 'text/html';
  w.document.compatMode = 'CSS1Compat';
  w.document.domain = 'blog.51cto.com';
  w.document.referrer = 'https://blog.51cto.com/u_16213614/14723924';
  w.document.title = 'Security Verification';
  w.document.hasFocus = mark(function hasFocus() { return false; });   // iframe is not focused

  // 5) API surface present in the real Firefox
  w.fetch = mark(function fetch() { return Promise.reject(new TypeError('NetworkError')); });
  w.matchMedia = mark(function matchMedia(q) {
    const s = String(q || '');
    let matches = false;
    const minW = /min-width:\s*(\d+)px/.exec(s);
    const maxW = /max-width:\s*(\d+)px/.exec(s);
    const minH = /min-height:\s*(\d+)px/.exec(s);
    const maxH = /max-height:\s*(\d+)px/.exec(s);
    if (minW) matches = 330 >= Number(minW[1]);
    if (maxW) matches = 330 <= Number(maxW[1]);
    if (minH) matches = 70 >= Number(minH[1]);
    if (maxH) matches = 70 <= Number(maxH[1]);
    if (/prefers-color-scheme:\s*dark/.test(s)) matches = false;
    if (/prefers-color-scheme:\s*light/.test(s)) matches = true;
    if (/prefers-reduced-motion/.test(s)) matches = false;
    if (/pointer:\s*fine/.test(s)) matches = true;
    if (/hover:\s*hover/.test(s)) matches = true;
    // decrypted cd[24] == "srgb": the SDK derives it from this query
    if (/color-gamut:\s*srgb/.test(s)) matches = true;
    if (/color-gamut:\s*p3/.test(s)) matches = false;
    if (/color-gamut:\s*rec2020/.test(s)) matches = false;
    if (/color-gamut/.test(s) && !/srgb/.test(s)) matches = false;
    return { matches, media: s, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
  });
  w.requestAnimationFrame = mark(function requestAnimationFrame(cb) { return setTimeout(() => cb(Date.now()), 16); });
  w.cancelAnimationFrame = mark(function cancelAnimationFrame(id) { clearTimeout(id); });
  w.indexedDB = { open() { return {}; }, deleteDatabase() { return {}; } };
  w.Notification = class Notification { static requestPermission() { return Promise.resolve('default'); } };
  w.Worker = class Worker { constructor() {} postMessage() {} terminate() {} addEventListener() {} };
  w.RTCPeerConnection = class RTCPeerConnection {
    constructor(cfg) {
      this.configuration = cfg || {};
      this.localDescription = null;
      this.remoteDescription = null;
      this.iceConnectionState = 'new';
      this.iceGatheringState = 'new';
      this.signalingState = 'stable';
      this.onicecandidate = null;
      this.onicegatheringstatechange = null;
      this.onicecandidateerror = null;
      this._iceListeners = [];
      this._closed = false;
    }
    createDataChannel(label) { return { label: String(label || ''), readyState: 'connecting', close() {}, send() {}, addEventListener() {}, removeEventListener() {} }; }
    createOffer() { return Promise.resolve({ type: 'offer', sdp: 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n' }); }
    createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }); }
    setLocalDescription(desc) { this.localDescription = desc || { type: 'offer', sdp: 'v=0\r\n' }; this.iceGatheringState = 'gathering'; this._gather(); return Promise.resolve(); }
    setRemoteDescription(desc) { this.remoteDescription = desc || { type: 'answer', sdp: 'v=0\r\n' }; return Promise.resolve(); }
    addIceCandidate() { return Promise.resolve(); }
    getStats() { return Promise.resolve(new Map()); }
    addEventListener(type, fn) { if (type === 'icecandidate') this._iceListeners.push(fn); }
    removeEventListener() {}
    dispatchEvent() { return true; }
    _gather() {
      // Real Firefox emits host + srflx candidates for each configured STUN server.
      const candidates = [
        'candidate:0 1 UDP 2122252543 192.168.1.14 54321 typ host generation 0 ufrag Kd9x network-id 1',
        'candidate:1 1 UDP 1686052607 192.168.1.14 54321 typ srflx raddr 192.168.1.14 rport 54321 generation 0 ufrag Kd9x network-id 1',
        'candidate:2 1 UDP 2122252543 192.168.1.14 54322 typ host generation 0 ufrag Kd9x network-id 2',
        'candidate:3 1 TCP 2105524479 192.168.1.14 9 typ host tcptype active generation 0 ufrag Kd9x network-id 1',
      ];
      candidates.forEach((c, i) => {
        setTimeout(() => {
          if (this._closed) return;
          const ev = {
            type: 'icecandidate',
            target: this,
            candidate: { candidate: c, sdpMid: '0', sdpMLineIndex: 0, toJSON() { return { candidate: c, sdpMid: '0', sdpMLineIndex: 0 }; } },
          };
          try { if (typeof this.onicecandidate === 'function') this.onicecandidate(ev); } catch (e) {}
          for (const fn of this._iceListeners) { try { fn(ev); } catch (e) {} }
          if (i === candidates.length - 1) {
            const done = { type: 'icecandidate', target: this, candidate: null };
            try { if (typeof this.onicecandidate === 'function') this.onicecandidate(done); } catch (e) {}
            for (const fn of this._iceListeners) { try { fn(done); } catch (e) {} }
            this.iceGatheringState = 'complete';
          }
        }, 8 + i * 4);
      });
    }
    close() { this._closed = true; this.iceConnectionState = 'closed'; }
  };
  w.caches = { open() { return Promise.resolve({}); } };
  w.isSecureContext = true;
  // Blob / FileReader / URL.createObjectURL: the SDK reads canvas output through them.
  // Missing these made the canvas collector bail out with _state:-2.
  w.Blob = class Blob {
    constructor(parts, opts) {
      let size = 0;
      for (const p of (parts || [])) {
        if (typeof p === 'string') size += Buffer.byteLength(p);
        else if (p && typeof p.length === 'number') size += p.length;
        else if (p && typeof p.size === 'number') size += p.size;
      }
      this.size = size || 3944;
      this.type = (opts && opts.type) || '';
    }
    arrayBuffer() { return Promise.resolve(new ArrayBuffer(this.size)); }
    text() { return Promise.resolve(''); }
    slice() { return this; }
    stream() { return {}; }
  };
  w.FileReader = class FileReader {
    constructor() { this.result = null; this.error = null; this.readyState = 0; this.onload = null; this.onloadend = null; this.onerror = null; this.onprogress = null; this.onabort = null; }
    _done(result) {
      this.result = result;
      this.readyState = 2;
      setTimeout(() => {
        try { if (typeof this.onload === 'function') this.onload({ target: this, type: 'load' }); } catch (e) {}
        try { if (typeof this.onloadend === 'function') this.onloadend({ target: this, type: 'loadend' }); } catch (e) {}
      }, 0);
    }
    readAsDataURL() { this._done(FP.canvasDataUrl || 'data:image/png;base64,'); }
    readAsArrayBuffer() { this._done(new ArrayBuffer(3944)); }
    readAsBinaryString() { this._done(''); }
    readAsText() { this._done(''); }
    abort() { this.readyState = 2; }
  };
  const URLBase = typeof w.URL === 'function' ? w.URL : function URL(u) { this.href = String(u); this.origin = 'https://captcha.eo.gtimg.com'; this.pathname = '/'; this.search = ''; this.toString = () => this.href; };
  URLBase.createObjectURL = mark(function createObjectURL() { return 'blob:https://captcha.eo.gtimg.com/1a2b3c4d-5e6f'; });
  URLBase.revokeObjectURL = mark(function revokeObjectURL() {});
  w.URL = URLBase;

  // Canvas family the SDK probes before falling back to a plain canvas.
  w.ImageData = class ImageData {
    constructor(a, b, c) {
      if (a && typeof a.length === 'number') { this.data = a; this.width = b; this.height = c; }
      else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    }
  };
  w.createImageBitmap = mark(function createImageBitmap() {
    return Promise.resolve({ width: 300, height: 150, close() {} });
  });
  w.Image = class Image {
    constructor(wd, ht) { this.width = wd || 0; this.height = ht || 0; this.src = ''; this.onload = null; this.onerror = null; this.complete = false; this.crossOrigin = null; }
    set src(v) { this._src = v; this.complete = true; setTimeout(() => { try { if (typeof this.onload === 'function') this.onload({ target: this }); } catch (e) {} }, 0); }
    get src() { return this._src || ''; }
    decode() { return Promise.resolve(); }
    addEventListener() {} removeEventListener() {}
  };
  w.OffscreenCanvas = class OffscreenCanvas {
    constructor(wd, ht) { this.width = wd || 300; this.height = ht || 150; }
    getContext(kind) {
      trace('offscreen.getContext', kind);
      if (String(kind) === '2d') {
        const c = Object.assign(Object.create(null), canvasProto);
        c.width = this.width; c.height = this.height;
        return c.getContext('2d');
      }
      return String(kind).startsWith('webgl') ? glStub : null;
    }
    convertToBlob() {
      return Promise.resolve(new w.Blob([new Uint8Array(3944)], { type: 'image/png' }));
    }
    transferToImageBitmap() { return { width: this.width, height: this.height, close() {} }; }
  };
  // running inside an iframe (decrypted cd[45] == "iframe")
  w.frameElement = { tagName: 'IFRAME', id: 'captcha', src: 'https://captcha.eo.gtimg.com/static/template/widget_ele_eo.e349d149.html' };
  w.history = { length: 1, state: null, scrollRestoration: 'auto', pushState() {}, replaceState() {}, back() {}, forward() {}, go() {} };
  w.visualViewport = { width: 330, height: 70, scale: 1, offsetLeft: 0, offsetTop: 0 };
  w.performance.timing = {};
  w.performance.navigation = { type: 0, redirectCount: 0 };
  w.performance.getEntriesByType = mark(function getEntriesByType() { return []; });
  w.performance.getEntries = mark(function getEntries() { return []; });

  // 5b) items the tap log showed the SDK really reads but we answered undefined
  //     (baseline: navigator.gpu/storage = object, getComputedStyle = function,
  //      document.URL = location.href, body.insertBefore = function,
  //      performance.timing.<field> readable although Object.keys() is empty)
  w.document.URL = 'https://blog.51cto.com/u_16213614/14723924';
  w.document.documentURI = w.document.URL;
  w.document.location = w.location;
  w.document.defaultView = w;
  w.document.parentWindow = w;
  w.getComputedStyle = mark(function getComputedStyle() {
    return {
      getPropertyValue() { return ''; },
      getPropertyPriority() { return ''; },
      item() { return ''; },
      length: 0,
    };
  });
  w.document.body.insertBefore = mark(function insertBefore() {});
  w.document.body.removeChild = mark(function removeChild() {});
  w.document.body.replaceChild = mark(function replaceChild() {});
  w.navigator.gpu = {
    requestAdapter() { return Promise.resolve(null); },
    getPreferredCanvasFormat() { return 'bgra8unorm'; },
    wgslLanguageFeatures: new Set(),
  };
  w.navigator.storage = {
    estimate() { return Promise.resolve({ quota: 10737418240, usage: 16414 }); },
    persist() { return Promise.resolve(false); },
    persisted() { return Promise.resolve(false); },
  };
  // Firefox has no navigator.deviceMemory; keeping a fake one is an extra key the baseline lacks
  try { delete w.navigator.deviceMemory; } catch (e) {}
  tag(w.navigator.gpu, 'GPU');
  tag(w.navigator.storage, 'StorageManager');
  w.navigator.appCodeName = 'Mozilla';
  w.navigator.product = 'Gecko';
  w.navigator.doNotTrack = 'unspecified';
  w.navigator.pdfViewerEnabled = true;
  w.navigator.globalPrivacyControl = false;
  w.document.dir = '';
  w.document.designMode = 'off';
  // CSSOM statistics read by the SDK (decrypted cd[32] == {"sheets":4,"rules":194})
  const makeSheet = (ruleCount) => ({
    cssRules: { length: ruleCount },
    rules: { length: ruleCount },
    ownerNode: null,
    href: null,
    disabled: false,
  });
  w.document.styleSheets = Object.assign([makeSheet(50), makeSheet(50), makeSheet(50), makeSheet(44)], {
    item(i) { return this[i] || null; },
  });
  w.getComputedStyle = mark(function getComputedStyle() {
    return { getPropertyValue() { return ''; }, getPropertyPriority() { return ''; }, item() { return ''; }, length: 0 };
  });
  w.document.cookie = 'TDC_itoken=1470025199%3A1794983867';

  const t0 = Date.now() - 4000;
  const timingValue = {
    navigationStart: t0, unloadEventStart: 0, unloadEventEnd: 0,
    redirectStart: 0, redirectEnd: 0, fetchStart: t0 + 12,
    domainLookupStart: t0 + 12, domainLookupEnd: t0 + 12,
    connectStart: t0 + 12, connectEnd: t0 + 40,
    secureConnectionStart: t0 + 20, requestStart: t0 + 41,
    responseStart: t0 + 260, responseEnd: t0 + 300,
    domLoading: t0 + 320, domInteractive: t0 + 900,
    domContentLoadedEventStart: t0 + 900, domContentLoadedEventEnd: t0 + 950,
    domComplete: t0 + 1200, loadEventStart: t0 + 1200, loadEventEnd: t0 + 1210,
  };
  for (const [k, v] of Object.entries(timingValue)) {
    Object.defineProperty(w.performance.timing, k, { get() { return v; }, configurable: true, enumerable: false });
  }
  w.performance.timing.toJSON = mark(function toJSON() { return { ...timingValue }; });
  w.performance.timeOrigin = t0;

  // 5c) Intl: Node reports zh-CN from the host locale, the browser reports "en".
  //     The SDK ships locale/timeZone/calendar/numberingSystem into the payload.
  w.Intl = {
    DateTimeFormat(locale, opts) {
      return {
        resolvedOptions: () => ({ locale: 'en', timeZone: 'Asia/Shanghai', calendar: 'gregory', numberingSystem: 'latn' }),
        format: () => '1/1/1970',
        formatToParts: () => [{ type: 'literal', value: '' }],
      };
    },
    NumberFormat() {
      return { resolvedOptions: () => ({ locale: 'en', numberingSystem: 'latn' }), format: (v) => String(v) };
    },
    Collator() { return { compare: (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0), resolvedOptions: () => ({ locale: 'en' }) }; },
    getCanonicalLocales: (l) => [].concat(l || []),
  };

  // 6) measureText: anchor values measured in Firefox at 10px, scaled by the real ctx.font
  //    (browser baseline: 11pt -> 126.4167, 18pt -> 216.4792 for 'mmmmmmmmmmlli')
  const realWidths = {
    'mmmmmmmmmmlli': 90.02083587646484,
    'mmmmmmmmmmlli ': 90.02083587646484,
    'Cwm fjordbank glyphs vext quiz, 😃': 384.7916564941406,
    'ClientJS,org <canvas> 1.0': 236.75,
  };
  const ANCHOR_PX = 10;
  const patchedCreate = w.document.createElement;
  w.document.createElement = mark(function createElement(tag, opts) {
    const el = patchedCreate(tag, opts);
    if (String(tag).toLowerCase() === 'canvas' && el && el.getContext) {
      const origGet = el.getContext;
      el.getContext = mark(function getContext(kind) {
        const ctx = origGet.call(el, kind);
        if (ctx) { try { walk(ctx); } catch (e) {} }
        if (ctx && ctx.measureText && !ctx.__patched) {
          ctx.__patched = true;
          ctx.measureText = mark(function measureText(text) {
            const s = String(text);
            // parse "11pt no-real-font-123" / "18pt Arial" / "14px Arial" / "1.2em serif"
            const f = String(ctx.font || '10px sans-serif');
            const m = f.match(/([\d.]+)\s*(px|pt|em|rem|%)/);
            let px = ANCHOR_PX;
            if (m) {
              const n = parseFloat(m[1]);
              const unit = m[2];
              if (unit === 'pt') px = n * 96 / 72;
              else if (unit === 'em' || unit === 'rem') px = n * 16;
              else if (unit === '%') px = n * 16 / 100;
              else px = n;
            }
            const base = Object.prototype.hasOwnProperty.call(realWidths, s) ? realWidths[s] : s.length * 7.3125 + (s.length ? 1.5 : 0);
            const width = base * (px / ANCHOR_PX);
            const asc = 12.76 * (px / ANCHOR_PX);
            const desc = 2.98 * (px / ANCHOR_PX);
            return { width, actualBoundingBoxAscent: asc, actualBoundingBoxDescent: desc, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width };
          });
        }
        return ctx;
      });
    }
    return el;
  });

  // Everything defined between the first walk() and here must be re-marked as native,
  // otherwise Function.prototype.toString leaks real source for Blob/FileReader/etc.
  for (const target of [w, w.document, w.navigator, w.screen, w.location, w.history, w.navigation, w.console, w.crypto,
    w.Blob && w.Blob.prototype, w.FileReader && w.FileReader.prototype, w.OffscreenCanvas && w.OffscreenCanvas.prototype,
    w.Image && w.Image.prototype, w.ImageData && w.ImageData.prototype, w.visualViewport, w.speechSynthesis,
    w.indexedDB, w.caches, w.scheduler, w.trustedTypes, w.external, w.cookieStore, w.documentPictureInPicture,
    w.Intl, w.customElements, w.InstallTrigger, w.navigator.plugins, w.navigator.mimeTypes,
    w.crypto, w.crypto && w.crypto.subtle, w.navigator.storage, w.navigator.gpu, w.document.body,
    w.document.documentElement, w.document.head, w.AudioContext && w.AudioContext.prototype,
    w.OfflineAudioContext && w.OfflineAudioContext.prototype, w.document.fonts, w.document.styleSheets]) {
    try { walk(target); } catch (e) {}
  }
  try { nativeFns.add(w.crypto.getRandomValues.bind(w.crypto)); nativeFns.add(w.crypto.getRandomValues); } catch (e) {}
  try { walk(w.URL); } catch (e) {}
}

export function fireSyntheticActivity(w, { x = 348, y = 236 } = {}) {
  const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;
  const t0 = now();
  let n = 0;
  const move = (i) => {
    const args = { type: 'mousemove', clientX: x - 80 + i * 2.2, clientY: y - 60 + i * 1.4, screenX: x - 80 + i * 2.2, screenY: y - 60 + i * 1.4, pageX: x - 80 + i * 2.2, pageY: y - 60 + i * 1.4, timeStamp: t0 + i * 24, target: w.document.body };
    for (const l of w.__listeners) {
      if (l.t === 'mousemove' || l.t === 'pointermove') { try { l.fn(args); n++; } catch (e) {} }
      if (l.t === 'pointerdown' && i === 36) { try { l.fn({ ...args, type: 'pointerdown', button: 0, buttons: 1 }); } catch (e) {} }
    }
  };
  for (let i = 0; i < 37; i++) move(i);
  for (const l of w.__listeners) {
    const ev = { clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y, button: 0, buttons: 0, timeStamp: t0 + 900, target: w.document.body, detail: 1 };
    if (['mouseup', 'pointerup', 'click'].includes(l.t)) { try { l.fn({ ...ev, type: l.t }); n++; } catch (e) {} }
  }
  return n;
}
