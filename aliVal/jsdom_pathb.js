// 路径 B：jsdom 补环境，加载 SDK（当前版 feilin002.js），触发设备指纹生成 deviceToken
const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="captcha-element"></div><button id="button"></button></body></html>', {
  url: 'https://tool.manmanbuy.com/m/aliVal.aspx',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
});
const win = dom.window, doc = win.document, nav = win.navigator;

// ===== 补环境（用 trace_property_access 采集的值）=====
function mk(fn) { try { Object.defineProperty(fn, 'toString', { value: () => `function ${fn.name}() { [native code] }`, configurable: true }); } catch(e){} return fn; }
const def = (obj, key, val) => { try { Object.defineProperty(obj, key, { get: () => val, configurable: true, enumerable: true }); } catch(e){} };
def(nav, 'webdriver', false); def(nav, 'platform', 'Win32'); def(nav, 'hardwareConcurrency', 8);
def(nav, 'maxTouchPoints', 0); def(nav, 'language', 'en-US'); def(nav, 'languages', ['en-US','en']);
def(nav, 'productSub', '20100101'); def(nav, 'appVersion', '5.0 (Windows)'); def(nav, 'appCodeName', 'Mozilla');
def(nav, 'product', 'Gecko'); def(nav, 'cookieEnabled', true); def(nav, 'doNotTrack', '1');
def(nav, 'userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0');
def(nav, 'plugins', { length: 5, item: () => null, namedItem: () => null });
def(nav, 'mimeTypes', { length: 2, item: () => null, namedItem: () => null });
def(win, 'innerWidth', 2190); def(win, 'innerHeight', 1129); def(win, 'outerWidth', 2190); def(win, 'outerHeight', 1190);
def(win, 'devicePixelRatio', 1);
def(win.screen, 'width', 2176); def(win.screen, 'height', 1224); def(win.screen, 'availWidth', 2176);
def(win.screen, 'availHeight', 1176); def(win.screen, 'colorDepth', 24); def(win.screen, 'pixelDepth', 24);
def(win.screen, 'orientation', { type: 'landscape-primary', angle: 0 });
doc.hasFocus = mk(function hasFocus() { return true; });
def(doc, 'readyState', 'complete');

const canvasFp = fs.readFileSync('C:/Users/EDY/.cache/camoufox-reverse/values/canvas_toDataURL.txt', 'utf8').trim();
win.HTMLCanvasElement.prototype.toDataURL = mk(function toDataURL() { return canvasFp; });
win.HTMLCanvasElement.prototype.getContext = mk(function getContext(type) {
  if (type === '2d') return { fillText(){}, measureText(){return {width:10};}, getImageData(){return {data:[0,0,0,255]};}, fillRect(){}, beginPath(){}, arc(){}, fill(){}, setTransform(){}, translate(){}, rotate(){}, scale(){}, font:'', textBaseline:'', textAlign:'' };
  if (type === 'webgl' || type === 'experimental-webgl') return { getParameter(p){ if(p===7936)return 'Mozilla'; if(p===7937)return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar'; if(p===7938)return 'WebGL 1.0'; return null; }, getExtension(){return null;}, getSupportedExtensions(){return [];} };
  return null;
});

// ===== mock XHR：捕获请求 + 返回真实 DeviceConfig（从之前抓包）=====
const REAL_DEVICE_CONFIG = '/NYbGbYM9UE3w5uouCvDZzhJNpDwGx9jCwO3oCQBwPZ3oozVD9iG4rVlrT8f96M4sRHEHGYp71dMVXGhwgF5Atpe6C+z6q4z8bpP2AfYCCcb0TCa0+gzZzVkacn8ajC8cwS8S475hAC63aJh+k+fbI+HofHFLHSknN6t8b+ebzPbRxACTdLDtusgCjiXAzxRl6JIF2NfoOYuxUk86fnPaDna1o8UpVRoYGYWuLJpv1K9bdGh5oFKL7Pv/jCMeF1Ml2cW24auo1oydss/XDU50kUFpr/hlXMRgL1cdL5KKgMVeGfZOOGeYHOkwHg9C1ao';
const capturedXhr = [];
const _open = win.XMLHttpRequest.prototype.open;
const _send = win.XMLHttpRequest.prototype.send;
win.XMLHttpRequest.prototype.open = function(m, u) { this._u = u; return _open.apply(this, arguments); };
win.XMLHttpRequest.prototype.send = function(body) {
  capturedXhr.push({ u: this._u, body: String(body || '').slice(0, 300) });
  const isInit = this._u && this._u.indexOf('captcha-open') !== -1;
  const resp = isInit
    ? JSON.stringify({ CertifyId: 'mockTest123', Success: true, Code: 'Success', Image: 'qst/PUZZLE/online/848/x/back.png', PuzzleImage: 'qst/PUZZLE/online/848/x/shadow.png', CaptchaType: 'PUZZLE', StaticPath: '3.29.0/pe.055', DeviceConfig: REAL_DEVICE_CONFIG })
    : JSON.stringify({ Code: '200', Success: true, ResultObject: { DeviceConfig: REAL_DEVICE_CONFIG } });
  setTimeout(() => {
    this.readyState = 4; this.status = 200; this.responseText = resp; this.response = resp;
    if (this.onreadystatechange) this.onreadystatechange();
    if (this.onload) this.onload();
  }, 30);
  return _send.apply(this, arguments);
};

// ===== 加载 SDK（当前版 feilin002.js）=====
try { win.eval(fs.readFileSync('config/AliyunCaptcha.js', 'utf8')); console.log('AliyunCaptcha.js OK'); } catch(e) { console.log('AliyunCaptcha ERR:', e.message); }
try { win.eval(fs.readFileSync('config/feilin002.js', 'utf8')); console.log('feilin002.js OK'); } catch(e) { console.log('feilin002 ERR:', e.message); }

console.log('FEILIN:', Object.keys(win.FEILIN || {}));

// ===== 触发 initAliyunCaptcha =====
try {
  win.initAliyunCaptcha({ SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button', language: 'cn', immediate: true, getInstance: () => {}, captchaVerifyCallback: () => {}, onBizResultCallback: () => {} });
  console.log('initAliyunCaptcha 调用成功');
} catch(e) { console.log('initAliyunCaptcha ERR:', e.message); }

// ===== 观察 deviceToken 生成 =====
setTimeout(() => {
  console.log('\n=== 捕获的 XHR 请求 ===');
  capturedXhr.forEach(c => console.log(' ', c.u, '|', c.body.slice(0, 150)));
  console.log('\nwindow.um:', typeof win.um, 'z_um:', typeof win.z_um);
  if (win.um && typeof win.um.getToken === 'function') {
    try { console.log('um.getToken() 返回 deviceToken:', win.um.getToken().slice(0, 120)); } catch(e) { console.log('getToken ERR:', e.message); }
  }
  // 检查 deviceToken 是否在别处
  process.exit(0);
}, 3000);
