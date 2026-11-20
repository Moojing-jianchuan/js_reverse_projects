/**
 * JSDUN / eval-VM 自解码捕获器
 * 原理：这类保护把源码编码在 VM 字节码里，运行时用 eval / new Function 还原后执行。
 * 在沙箱里接管 eval / Function，把每一次还原出来的源码落盘，等价于"一键脱壳"。
 *
 * 用法: node unpack.js <文件名> [输出目录]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const dir = process.argv[4] || 'D:/ds_work/js_reverse_projects/dewu_reverse/artifacts/js';
const target = process.argv[2] || 'preinforce2.js';
const outDir = process.argv[3] || 'D:/ds_work/js_reverse_projects/dewu_reverse/artifacts/unpacked';
fs.mkdirSync(outDir, { recursive: true });

const code = fs.readFileSync(path.join(dir, target), 'utf8');
const base = target.replace(/\.js$/, '');
let dumpIdx = 0;
const dumped = [];

function dump(kind, src) {
  if (typeof src !== 'string' || src.length < 50) return;
  const name = `${base}.${String(dumpIdx++).padStart(3, '0')}.${kind}.js`;
  const p = path.join(outDir, name);
  fs.writeFileSync(p, src);
  dumped.push({ name, len: src.length });
}

function makeSandbox() {
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError, SyntaxError,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    URL, URLSearchParams,
    TextEncoder, TextDecoder,
    Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
    Uint8Array, Int8Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;

  const store = new Map();
  sandbox.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    platform: 'Win32', vendor: '', language: 'zh-CN', languages: ['zh-CN', 'zh'],
    hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false,
    plugins: { length: 5 }, mimeTypes: { length: 2 },
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    sendBeacon: () => true,
  };
  sandbox.location = {
    href: 'https://www.dewu.com/', hostname: 'www.dewu.com', host: 'www.dewu.com',
    protocol: 'https:', origin: 'https://www.dewu.com', pathname: '/', search: '', hash: '',
    reload() { }, replace() { }, toString() { return 'https://www.dewu.com/'; }
  };
  const el = () => ({
    style: {}, dataset: {}, setAttribute() { }, getAttribute: () => null, appendChild() { },
    removeChild() { }, addEventListener() { }, removeEventListener() { }, getContext: () => null,
    contentWindow: sandbox, contentDocument: sandbox.document,
    attachEvent() { }, detachEvent() { }, insertAdjacentHTML() { }, remove() { },
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=', width: 300, height: 150,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150 }),
    offsetHeight: 150, offsetWidth: 300, clientHeight: 150, clientWidth: 300, scrollHeight: 150, scrollWidth: 300
  });
  sandbox.document = {
    createElement: el, createTextNode: el,
    documentElement: Object.assign(el(), { style: {}, clientWidth: 1920, clientHeight: 980 }),
    head: el(), body: Object.assign(el(), { clientWidth: 1920, clientHeight: 980 }),
    cookie: '', compatMode: 'CSS1Compat', readyState: 'complete', visibilityState: 'visible', hidden: false,
    addEventListener() { }, removeEventListener() { }, hasFocus: () => true,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    getElementsByTagName: () => [], referrer: '', title: '得物App-新一代潮流网购社区',
    location: sandbox.location, characterSet: 'UTF-8', contentType: 'text/html',
  };
  sandbox.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } };
  sandbox.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
    key: i => [...store.keys()][i] || null,
    get length() { return store.size; }
  };
  sandbox.sessionStorage = sandbox.localStorage;
  sandbox.performance = { now: () => Date.now() - 1000, timing: { navigationStart: Date.now() - 1000 }, navigation: { type: 0, redirectCount: 0 } };
  sandbox.crypto = { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } };
  sandbox.XMLHttpRequest = function () {
    this.open = () => { }; this.send = () => { }; this.setRequestHeader = () => { };
    this.getAllResponseHeaders = () => ''; this.addEventListener = () => { };
  };
  sandbox.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) });
  sandbox.WebSocket = function () { this.send = () => { }; this.close = () => { }; };
  sandbox.Image = function () { this.src = ''; };
  sandbox.addEventListener = () => { }; sandbox.removeEventListener = () => { };
  sandbox.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  sandbox.alert = () => { }; sandbox.matchMedia = () => ({ matches: false, addListener() { } });
  sandbox.chrome = { runtime: {} };
  return sandbox;
}

const sandbox = makeSandbox();
const ctx = vm.createContext(sandbox);

// 接管 eval / Function —— 这是脱壳的关键
const realEval = code2 => vm.runInContext(code2, ctx, { filename: `unpacked-${dumpIdx}` });
sandbox.eval = function (src) {
  dump('eval', src);
  return realEval(src);
};
const RealFunction = Function;
function HookedFunction(...args) {
  if (args.length) dump('function', String(args[args.length - 1]));
  return RealFunction(...args);
}
HookedFunction.prototype = RealFunction.prototype;
sandbox.Function = HookedFunction;

try {
  vm.runInContext(code, ctx, { filename: target, timeout: 30000 });
  console.log('[OK] executed');
} catch (e) {
  console.log('[THROW]', e && e.constructor && e.constructor.name, '-', String(e && e.message).slice(0, 300));
}
console.log('dumped files:');
for (const d of dumped) console.log(' ', d.name, d.len, 'bytes');
console.log('sandbox globals:', Object.keys(sandbox).filter(k => !(k in globalThis) && !['window', 'self', 'top', 'parent', 'document', 'navigator', 'location', 'screen', 'localStorage', 'sessionStorage', 'performance', 'crypto', 'XMLHttpRequest', 'fetch', 'WebSocket', 'Image', 'chrome', 'alert', 'matchMedia', 'requestAnimationFrame'].includes(k)));
