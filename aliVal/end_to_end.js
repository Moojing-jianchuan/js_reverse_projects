// 端到端：纯协议 InitCaptcha + jsdom 生成 deviceToken + data 加密 → slideAuth 过滑块
const https = require('https');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { initCaptcha, detectGap, genTrajectory } = require('./main.js');
const { KEYS, aesDecrypt, encryptData } = require('./utils/crypto');

const SCENE_ID = 'vollz84f';
const SLIDE_AUTH_URL = 'https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth';

function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new URLSearchParams(body).toString();
    const opts = {
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
        'Origin': 'https://tool.manmanbuy.com', 'Referer': 'https://tool.manmanbuy.com/',
      },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 解密 DeviceConfig → deviceConfig 对象（真实结构）
function parseDeviceConfig(dcB64) {
  const plain = aesDecrypt(dcB64, KEYS.RES_KEY, KEYS.AES_IV);
  const p = plain.split('#');
  return {
    key: Buffer.from(p[0], 'base64').toString('utf8'),
    switch: Number(Buffer.from(p[1], 'base64').toString('utf8')),
    sessionId: p[2], version: p[3], pluginElements: p[4], pluginResource: p[5],
    globalVariable: p[6], timestamp: p[7], ip: p[8],
  };
}

// jsdom 补环境 + initFeiLin → 完整版 deviceToken（window.z_um.getToken(certifyId)）
function generateDeviceToken(dcB64, devCfg, certifyId) {
  return new Promise((resolve, reject) => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://tool.manmanbuy.com/m/aliVal.aspx', referrer: 'https://www.google.com/',
      pretendToBeVisual: true, runScripts: 'dangerously',
    });
    const win = dom.window, doc = win.document, nav = win.navigator;
    const _origFnToString = win.Function.prototype.toString;
    const nativeFnSet = new WeakSet();
    function markNative(fn) {
      if (typeof fn !== 'function') return fn;
      nativeFnSet.add(fn);
      try { Object.defineProperty(fn, 'toString', { value: () => `function ${fn.name || ''}() { [native code] }`, writable: true, configurable: true }); } catch (e) {}
      return fn;
    }
    win.Function.prototype.toString = function () {
      if (nativeFnSet.has(this)) return `function ${this.name || ''}() { [native code] }`;
      let src; try { src = _origFnToString.call(this); } catch (e) { return 'function () { [native code] }'; }
      if (/const\s+esValue|this\._globalObject|idlUtils|globalObject\s*=|_document/.test(src)) return `function ${this.name || ''}() { [native code] }`;
      return src;
    };
    function nativeGetter(name, value) { const fn = function () { return value; }; try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) {} return markNative(fn); }
    for (const key of ['document', 'screen', 'navigator', 'localStorage', 'sessionStorage']) { try { const d = Object.getOwnPropertyDescriptor(win, key); if (d && d.get) markNative(d.get); } catch (e) {} }
    const navOverrides = { platform: 'Win32', vendor: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0', appVersion: '5.0 (Windows)', language: 'en-US', languages: ['en-US', 'en'], hardwareConcurrency: 24, cookieEnabled: true, product: 'Gecko', appCodeName: 'Mozilla', productSub: '20100101', maxTouchPoints: 0, webdriver: false, doNotTrack: 'unspecified', onLine: true };
    for (const [k, v] of Object.entries(navOverrides)) { try { Object.defineProperty(nav, k, { get: nativeGetter(k, v), configurable: true, enumerable: true }); } catch (e) {} }
    // plugins/mimeTypes
    const pluginNames = ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer', 'Microsoft Edge PDF Viewer', 'WebKit built-in PDF'];
    const mimeData = [{ type: 'application/pdf', description: 'Portable Document Format', suffixes: 'pdf' }, { type: 'text/pdf', description: 'Portable Document Format', suffixes: 'pdf' }];
    (function buildPlugins() {
      const mimeTypes = mimeData.map((m) => { const mt = {}; Object.defineProperties(mt, { type: { get: nativeGetter('type', m.type), enumerable: true }, description: { get: nativeGetter('description', m.description), enumerable: true }, suffixes: { get: nativeGetter('suffixes', m.suffixes), enumerable: true } }); mt[Symbol.toStringTag] = 'MimeType'; return mt; });
      const plugins = pluginNames.map((name) => { const p = {}; Object.defineProperties(p, { name: { get: nativeGetter('name', name), enumerable: true }, filename: { get: nativeGetter('filename', 'internal-pdf-viewer'), enumerable: true }, description: { get: nativeGetter('description', 'Portable Document Format'), enumerable: true }, length: { get: nativeGetter('length', mimeTypes.length), enumerable: true } }); mimeTypes.forEach((mt, i) => { p[i] = mt; }); p.item = markNative(function item(i) { return mimeTypes[i] || null; }); p.namedItem = markNative(function namedItem(n) { return mimeTypes.find(m => m.type === n) || null; }); p[Symbol.toStringTag] = 'Plugin'; return p; });
      const pluginArray = {}; Object.defineProperty(pluginArray, 'length', { get: nativeGetter('length', plugins.length), enumerable: true }); plugins.forEach((p, i) => { pluginArray[i] = p; }); pluginArray.item = markNative(function item(i) { return plugins[i] || null; }); pluginArray.namedItem = markNative(function namedItem(n) { return plugins.find(p => p.name === n) || null; }); pluginArray[Symbol.toStringTag] = 'PluginArray';
      const mimeTypeArray = {}; Object.defineProperty(mimeTypeArray, 'length', { get: nativeGetter('length', mimeTypes.length), enumerable: true }); mimeTypes.forEach((m, i) => { mimeTypeArray[i] = m; }); mimeTypeArray.item = markNative(function item(i) { return mimeTypes[i] || null; }); mimeTypeArray.namedItem = markNative(function namedItem(n) { return mimeTypes.find(m => m.type === n) || null; }); mimeTypeArray[Symbol.toStringTag] = 'MimeTypeArray';
      Object.defineProperty(nav, 'plugins', { get: nativeGetter('plugins', pluginArray), configurable: true, enumerable: true }); Object.defineProperty(nav, 'mimeTypes', { get: nativeGetter('mimeTypes', mimeTypeArray), configurable: true, enumerable: true });
    })();
    const screenData = { width: 2176, height: 1224, availWidth: 2176, availHeight: 1176, colorDepth: 24, pixelDepth: 24, availLeft: 0, availTop: 0 };
    for (const [k, v] of Object.entries(screenData)) { try { Object.defineProperty(win.screen, k, { get: nativeGetter(k, v), configurable: true, enumerable: true }); } catch (e) {} }
    Object.defineProperty(win.screen, 'orientation', { get: nativeGetter('orientation', { type: 'landscape-primary', angle: 0 }), configurable: true });
    const winDims = { outerWidth: 2190, outerHeight: 1190, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 };
    for (const [k, v] of Object.entries(winDims)) { try { Object.defineProperty(win, k, { get: nativeGetter(k, v), configurable: true, enumerable: true }); } catch (e) {} }
    doc.hasFocus = markNative(function hasFocus() { return true; });
    Object.defineProperty(doc, 'readyState', { get: nativeGetter('readyState', 'complete'), configurable: true });
    Object.defineProperty(doc, 'hidden', { get: nativeGetter('hidden', false), configurable: true });
    Object.defineProperty(doc, 'visibilityState', { get: nativeGetter('visibilityState', 'visible'), configurable: true });
    Object.defineProperty(doc, 'referrer', { get: nativeGetter('referrer', 'https://www.google.com/'), configurable: true });
    // canvas 真实指纹
    const fp0 = fs.readFileSync('config/canvas_fp0.txt', 'utf8').trim();
    const fp1 = fs.readFileSync('config/canvas_fp1.txt', 'utf8').trim();
    win.HTMLCanvasElement.prototype.toDataURL = markNative(function toDataURL() { if (this.width === 122 && this.height === 110) return fp1; return fp0; });
    win.HTMLCanvasElement.prototype.toBlob = markNative(function toBlob(cb, type) { if (cb) setTimeout(() => cb({ size: (this.width === 122 && this.height === 110) ? fp1.length : fp0.length }), 0); });
    win.HTMLCanvasElement.prototype.getContext = markNative(function getContext(type) {
      if (type === '2d') {
        const ctx = { fillText: markNative(function() {}), measureText: markNative(function() { return { width: 10 }; }), getImageData: markNative(function() { return { data: [0, 0, 0, 255], width: 1, height: 1 }; }), fillRect: markNative(function() {}), beginPath: markNative(function() {}), arc: markNative(function() {}), fill: markNative(function() {}), setTransform: markNative(function() {}), translate: markNative(function() {}), rotate: markNative(function() {}), scale: markNative(function() {}), strokeText: markNative(function() {}), save: markNative(function() {}), restore: markNative(function() {}), stroke: markNative(function() {}), moveTo: markNative(function() {}), lineTo: markNative(function() {}), closePath: markNative(function() {}), clearRect: markNative(function() {}), rect: markNative(function() {}), createLinearGradient: markNative(function() { return { addColorStop: markNative(function() {}) }; }), isPointInPath: markNative(function() { return false; }), isPointInStroke: markNative(function() { return false; }), font: '', textBaseline: '', textAlign: '' };
        return new Proxy(ctx, { get(t, p) { return t[p]; } });
      }
      if (type === 'webgl' || type === 'experimental-webgl') {
        return { VENDOR: 7936, RENDERER: 7937, VERSION: 7938, SHADING_LANGUAGE_VERSION: 35724, MAX_TEXTURE_SIZE: 3379, MAX_RENDERBUFFER_SIZE: 34024, getParameter: markNative(function(p) { if (p === 7936) return 'Mozilla'; if (p === 7937) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar'; if (p === 7938) return 'WebGL 1.0'; if (p === 35724) return 'WebGL GLSL ES 1.0'; if (p === 3379) return 16384; return null; }), getExtension: markNative(function() { return null; }), getSupportedExtensions: markNative(function() { return []; }), getShaderPrecisionFormat: markNative(function() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; }) };
      }
      return null;
    });
    win.Worker = markNative(function Worker() { return { postMessage: markNative(function() {}), terminate: markNative(function() {}), addEventListener: markNative(function() {}), onmessage: null, onerror: null }; });
    win.matchMedia = markNative(function matchMedia(q) { return { matches: false, media: q, onchange: null, addListener: markNative(function() {}), removeListener: markNative(function() {}), addEventListener: markNative(function() {}), removeEventListener: markNative(function() {}) }; });
    win.indexedDB = { open: markNative(function() { return { onupgradeneeded: null, onsuccess: null, onerror: null, result: null }; }) };
    // mock XHR（Log2 上报，返回成功）
    const _open = win.XMLHttpRequest.prototype.open, _send = win.XMLHttpRequest.prototype.send;
    win.XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return _open.apply(this, arguments); };
    win.XMLHttpRequest.prototype.send = function (body) {
      const resp = '{"Code":"200","Success":true,"ResultObject":true}';
      setTimeout(() => { try { this.readyState = 4; this.status = 200; this.responseText = resp; this.response = resp; if (this.onreadystatechange) this.onreadystatechange(); if (this.onload) this.onload(); } catch (e) {} }, 20);
      return _send.apply(this, arguments);
    };
    // 加载 SDK
    win.eval(fs.readFileSync('config/AliyunCaptcha.js', 'utf8'));
    win.eval(fs.readFileSync('config/feilin002.js', 'utf8'));
    const Br = {
      prefix: '1sfr0c', region: 'cn', appName: 'saf-captcha', appKey: 'ab034ec0643f91399eb33e062dc7fae1',
      endpoints: ['https://cloudauth-device-dualstack.cn-shanghai.aliyuncs.com', 'https://cn-shanghai.device.saf.aliyuncs.com'],
      ENDPOINTS: ['https://cloudauth-device-dualstack.cn-shanghai.aliyuncs.com', 'https://cn-shanghai.device.saf.aliyuncs.com'],
      logs: [], initTime: Date.now(), sceneId: SCENE_ID, preCollectData: { fontsNum: 72 },
      DeviceConfig: dcB64, deviceConfig: devCfg, timestamp: devCfg.timestamp, feilinLoad: true,
    };
    let done = false;
    // 预创建 um/z_um（AliyunCaptcha.js 在 initFeiLin 前会预创建空对象，initFeiLin 再填充 getToken）
    win.um = {};
    win.z_um = {};
    try {
      win.FEILIN.initFeiLin(Br, (state, data) => {
        console.log('[initFeiLin cb] state=' + state + ' z_um=' + typeof win.z_um + ' um=' + typeof win.um + ' data=' + JSON.stringify(data).slice(0,80));
        // initFeiLin 完成后，等待 z_um.getToken 出现，再生成完整版 deviceToken
        const tryGet = () => {
          if (done) return;
          if (win.z_um && typeof win.z_um.getToken === 'function') {
            try { done = true; resolve(win.z_um.getToken(certifyId)); }
            catch (e) { done = true; reject(e); }
          } else {
            setTimeout(tryGet, 100);
          }
        };
        tryGet();
      });
    } catch (e) { reject(e); }
    setTimeout(() => { if (!done) { done = true; reject(new Error('initFeiLin timeout')); } }, 8000);
  });
}

// 模板匹配缺口检测：用 shadow.png（拼图块）在 back.png 里找缺口位置
function detectGapTemplate(backBuf, shadowBuf) {
  const { PNG } = require('pngjs');
  const bp = PNG.sync.read(backBuf);
  const sp = PNG.sync.read(shadowBuf);
  const gb = (x, y) => { const i = (bp.width * y + x) << 2; return (bp.data[i] * 299 + bp.data[i + 1] * 587 + bp.data[i + 2] * 114) / 1000; };
  const gs = (x, y) => { const i = (sp.width * y + x) << 2; return (sp.data[i] * 299 + sp.data[i + 1] * 587 + sp.data[i + 2] * 114) / 1000; };
  const sa = (x, y) => sp.data[(sp.width * y + x) << 2 | 3];
  // 找 shadow 非透明像素边界
  let px = sp.width, py = sp.height, mx = 0, my = 0;
  for (let y = 0; y < sp.height; y++) for (let x = 0; x < sp.width; x++) if (sa(x, y) > 0) { if (x < px) px = x; if (x > mx) mx = x; if (y < py) py = y; if (y > my) my = y; }
  const pw = mx - px + 1, ph = my - py + 1;
  // 模板匹配 SSD
  let bestX = 0, bestY = 0, bestSSD = Infinity;
  for (let y = 0; y + ph <= bp.height; y++) for (let x = 0; x + pw <= bp.width; x++) {
    let ssd = 0, cnt = 0;
    for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) {
      if (sa(px + dx, py + dy) > 0) { const d = gb(x + dx, y + dy) - gs(px + dx, py + dy); ssd += d * d; cnt++; }
    }
    if (cnt > 0 && ssd < bestSSD) { bestSSD = ssd; bestX = x; bestY = y; }
  }
  return bestX; // 缺口左边缘 = 滑块拖动距离
}

async function main() {
  console.log('[1] InitCaptcha ...');
  const init = await initCaptcha();
  console.log('    CertifyId:', init.CertifyId, 'Success:', init.Success);
  if (!init.Success) throw new Error('InitCaptcha failed: ' + init.Code);

  console.log('[2] 解密 DeviceConfig → deviceConfig + 动态密钥');
  const devCfg = parseDeviceConfig(init.DeviceConfig);
  console.log('    key:', devCfg.key, '| sessionId:', devCfg.sessionId.slice(0, 40) + '...');

  console.log('[3] jsdom 生成 deviceToken ...');
  const deviceToken = await generateDeviceToken(init.DeviceConfig, devCfg, init.CertifyId);
  console.log('    deviceToken 长度:', deviceToken.length);
  const _dp = Buffer.from(deviceToken, 'base64').toString('utf8').split('#');
  const _plain = aesDecrypt(_dp[2], devCfg.key, KEYS.AES_IV).split('#');
  console.log('    [77] certifyId:', _plain[77], '| [91]:', _plain[91], '| [43] len:', (_plain[43]||'').length);

  console.log('[4] 下载 back.png + shadow.png + 模板匹配缺口识别');
  const imgBase = 'https://static-captcha.aliyuncs.com/';
  const dl = (u) => new Promise((resolve, reject) => {
    https.get(imgBase + u, { headers: { Referer: 'https://tool.manmanbuy.com/' } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
  const backBuf = await dl(init.Image);
  const shadowBuf = await dl(init.PuzzleImage);
  const gapX = detectGapTemplate(backBuf, shadowBuf);
  console.log('    缺口距离:', gapX);

  console.log('[5] 轨迹 + data 加密');
  const traj = genTrajectory(gapX, 528, 736); // 滑块实际起始坐标（getBoundingClientRect）
  const data = encryptData(traj, devCfg.key);

  console.log('[6] slideAuth 请求');
  const captchaVerifyParam = JSON.stringify({ sceneId: SCENE_ID, certifyId: init.CertifyId, deviceToken, data });
  const r = await postForm(SLIDE_AUTH_URL, { captchaVerifyParam });
  console.log('    status:', r.status);
  console.log('    响应:', r.body);
  return { init, deviceToken, gapX, data, slideAuthResult: r };
}

if (require.main === module) {
  main().then(() => console.log('done')).catch(e => console.error('ERROR:', e.message));
}
module.exports = { generateDeviceToken, parseDeviceConfig, main };
