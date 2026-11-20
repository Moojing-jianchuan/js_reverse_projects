/**
 * 缺模块自动打桩：让 pyuntu 的 webpack runtime 把未注册的模块 id 当成空模块，
 * 看能跑到哪一步、挂出什么全局。记录所有缺失 id。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createLegacyContext } = require('./legacy_sandbox.js');

const ROOT = path.resolve(__dirname, '..');
const P = String.fromCharCode(0xFC5E);
const which = process.argv[2] || 'pyuntu';
let src = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/' + which + '.000.eval.js'), 'utf8');

const modsVar = P + '141254';
const idVar = P + '35610';
const cacheVar = P + '132107';
const reqVar = P + '43644';
const needle = modsVar + '[' + idVar + '](';
const idx = src.indexOf(needle);
if (idx < 0) { console.log('needle not found'); process.exit(1); }

const guard = `(typeof ${modsVar}[${idVar}]!=='function'?(${modsVar}[${idVar}]=function(m,e,r){m.exports=function(){return arguments.length?arguments[arguments.length-1]:'';};m.exports.default=m.exports;},(globalThis.__miss=(globalThis.__miss||[])).push(${idVar}),1):1),`;
src = src.slice(0, idx) + guard + src.slice(idx);

const { sb, ctx } = createLegacyContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8'), ctx, { filename: 'preinforce2.payload.js' });

const t0 = Date.now();
try {
  vm.runInContext(src, ctx, { filename: which + '.patched.js', timeout: 40000 });
  console.log('[OK]', which, 'executed in', Date.now() - t0, 'ms');
} catch (e) {
  console.log('[THROW]', String(e.message).slice(0, 200));
  console.log(String(e.stack || '').split('\n').slice(0, 6).join('\n'));
}
console.log('missing module ids stubbed:', JSON.stringify(sb.__miss));
const known = new Set(['console','setTimeout','clearTimeout','setInterval','clearInterval','Math','Date','JSON','Object','Array','String','Number','Boolean','RegExp','Error','TypeError','RangeError','SyntaxError','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','escape','unescape','atob','btoa','URL','URLSearchParams','TextEncoder','TextDecoder','Promise','Map','Set','WeakMap','WeakSet','Symbol','Proxy','Reflect','Uint8Array','Int8Array','Uint16Array','Uint32Array','Float32Array','Float64Array','ArrayBuffer','DataView','globalThis','window','self','top','parent','navigator','location','document','screen','localStorage','sessionStorage','performance','crypto','XMLHttpRequest','fetch','Response','Headers','Request','WebSocket','Image','addEventListener','removeEventListener','dispatchEvent','requestAnimationFrame','cancelAnimationFrame','alert','confirm','prompt','matchMedia','chrome','open','close','focus','blur','Notification','Worker','SharedWorker','RTCPeerConnection','AudioContext','OfflineAudioContext','indexedDB','caches','history','name','__trace','Buffer','outerWidth','outerHeight','innerWidth','innerHeight','devicePixelRatio','screenX','screenY','__rnd','__miss']);
console.log('new globals:', JSON.stringify(Object.keys(sb).filter(k => !known.has(k))));
