// 最小环境加载 probe：看 JS DUN PROTECT VM 在无浏览器环境下最先要什么
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const dir = 'D:/ds_work/js_reverse_projects/dewu_reverse/artifacts/js';
const target = process.argv[2] || 'preinforce2.js';
const code = fs.readFileSync(path.join(dir, target), 'utf8');

let jsdomOk = false;
try { require.resolve('jsdom'); jsdomOk = true; } catch (e) { jsdomOk = false; }
console.log('jsdom resolvable:', jsdomOk, '| node', process.version);

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape, atob, btoa,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0', platform: 'Win32', language: 'zh-CN', languages: ['zh-CN'], hardwareConcurrency: 8, webdriver: false };
sandbox.location = { href: 'https://www.dewu.com/', hostname: 'www.dewu.com', protocol: 'https:', pathname: '/' };
sandbox.document = {
  createElement: () => ({ style: {}, setAttribute() { }, getContext: () => null, appendChild() { }, removeChild() { } }),
  documentElement: { style: {} },
  head: { appendChild() { } },
  body: { appendChild() { } },
  cookie: '',
  addEventListener() { }, removeEventListener() { },
  querySelector: () => null,
  getElementsByTagName: () => []
};
sandbox.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 };
sandbox.XMLHttpRequest = function () { this.open = () => { }; this.send = () => { }; this.setRequestHeader = () => { }; };
sandbox.fetch = () => Promise.resolve({});
sandbox.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
sandbox.sessionStorage = { getItem: () => null, setItem() { }, removeItem() { } };
sandbox.performance = { now: () => Date.now(), timing: {} };

const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(code, ctx, { filename: target, timeout: 20000 });
  console.log('[OK] executed without throwing');
} catch (e) {
  console.log('[THROW]', e && e.constructor && e.constructor.name, '-', e && e.message);
  console.log((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}
// 观察安装结果
for (const k of ['fetch', 'XMLHttpRequest', 'navigator', 'document']) {
  try {
    const v = sandbox[k];
    console.log(`after: ${k} = ${typeof v}${typeof v === 'function' ? ' name=' + (v.name || '?') + ' len=' + v.length : ''}`);
  } catch (e) { console.log('after: ' + k + ' read fail'); }
}
const globals = Object.keys(sandbox).filter(k => !['console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'escape', 'unescape', 'atob', 'btoa', 'globalThis', 'window', 'self', 'navigator', 'location', 'document', 'screen', 'XMLHttpRequest', 'fetch', 'localStorage', 'sessionStorage', 'performance'].includes(k));
console.log('new globals:', globals.slice(0, 60));
