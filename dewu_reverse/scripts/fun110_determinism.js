/**
 * 确定性实验：固定 Math.random / Date.now / crypto.getRandomValues 后，
 * Fun110 的输出是否稳定；以及改动 navigator/screen 单个字段对输出的影响。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createLegacyContext } = require('./legacy_sandbox.js');

const ROOT = path.resolve(__dirname, '..');

function fresh() {
  const { sb, ctx } = createLegacyContext({ deterministicRandom: true, rand: 0x20112026 });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8'), ctx, { filename: 'preinforce2.payload.js' });
  return { sb, ctx };
}

const { sb, ctx } = fresh();

// 固定时间与随机
vm.runInContext(`
(function(){
  var G = globalThis;
  G.__t = 1763600000000;
  var rl = Date.now;
  Date.now = function(){ return G.__t; };
  var rc = Date;
  G.Date = new Proxy(rc, { construct: function(T, a){ return a.length ? new rc(...a) : new rc(G.__t); }, apply: function(){ return new rc(G.__t).toString(); } });
  var rs = 0x1234;
  Math.random = function(){ rs = (rs * 1103515245 + 12345) >>> 0; return (rs >>> 8) / 16777216; };
  var kv = 0xabc;
  if (G.crypto && G.crypto.getRandomValues) G.crypto.getRandomValues = function(a){ for (var i=0;i<a.length;i++){ kv = (kv*1103515245+12345)>>>0; a[i] = (kv>>>8) & 255; } return a; };
})();
`, ctx);

function call(n) {
  const r = vm.runInContext('(function(){var r=fun.Fun110();return r;})()', ctx, { filename: 'c.js', timeout: 8000 });
  return r;
}
// 重置随机流到同一起点再取两次，判断"同状态同输出"
function callReset() {
  vm.runInContext('(function(){ var G=globalThis; G.__rs=0x9999; Math.random=function(){ G.__rs=(G.__rs*1103515245+12345)>>>0; return (G.__rs>>>8)/16777216; }; })();', ctx);
  return call();
}

const a = callReset();
const b = callReset();
console.log('同状态两次输出是否一致：', JSON.stringify(a) === JSON.stringify(b));
console.log('a:', JSON.stringify(a).slice(0, 400));
console.log('b:', JSON.stringify(b).slice(0, 400));

// 不重置，连续两次
const c = call();
const d = call();
console.log('连续两次一致：', JSON.stringify(c) === JSON.stringify(d));
console.log('c.a len', c.a && c.a.length, '| d.a len', d.a && d.a.length);
console.log('c:', JSON.stringify(c).slice(0, 300));
console.log('d:', JSON.stringify(d).slice(0, 300));
