/**
 * Fun110 / Fun99 读值追踪：用 Proxy 包住 navigator/document/screen/localStorage/performance/crypto，
 * 记录 SDK 真正读了哪些属性（补环境六步法的"读值差异"输入）。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createLegacyContext } = require('./legacy_sandbox.js');

const ROOT = path.resolve(__dirname, '..');
const { sb, ctx } = createLegacyContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8'), ctx, { filename: 'preinforce2.payload.js' });

vm.runInContext(`
(function(){
  var G = globalThis;
  G.__reads = [];
  function wrap(name, obj) {
    if (!obj) return;
    var p = new Proxy(obj, {
      get: function (t, k) {
        if (typeof k === 'string') G.__reads.push(name + '.' + k);
        var v = t[k];
        if (typeof v === 'function') { return v.bind(t); }
        return v;
      },
      has: function (t, k) { G.__reads.push(name + ' has ' + String(k)); return k in t; }
    });
    G[name] = p;
  }
  wrap('navigator', G.navigator);
  wrap('screen', G.screen);
  wrap('performance', G.performance);
  wrap('localStorage', G.localStorage);
  wrap('sessionStorage', G.sessionStorage);
  wrap('crypto', G.crypto);
  wrap('history', G.history);
  var doc = G.document;
  var docP = new Proxy(doc, {
    get: function (t, k) {
      if (typeof k === 'string') G.__reads.push('document.' + k);
      var v = t[k];
      if (typeof v === 'function') return v.bind(t);
      return v;
    }
  });
  G.document = docP;
})();
`, ctx);

function tryRun(label, expr, timeout) {
  vm.runInContext('__reads.length = 0', ctx);
  const t0 = Date.now();
  let out;
  try {
    out = vm.runInContext(expr, ctx, { filename: 'call.js', timeout: timeout || 8000 });
    console.log('\n[' + label + '] OK in', Date.now() - t0, 'ms');
    console.log('  type:', typeof out, '| value:', typeof out === 'string' ? JSON.stringify(out.slice(0, 400)) : JSON.stringify(out && typeof out === 'object' ? out : String(out)).slice(0, 400));
  } catch (e) {
    console.log('\n[' + label + '] THROW/TIMEOUT in', Date.now() - t0, 'ms:', String(e.message).slice(0, 160));
  }
  const reads = vm.runInContext('__reads.slice()', ctx);
  const uniq = [...new Set(reads)];
  console.log('  reads:', reads.length, 'uniq:', uniq.length);
  console.log('  ' + uniq.slice(0, 120).join(', '));
  return out;
}

const argSets = [
  ['Fun110 空参', 'fun.Fun110()'],
  ['Fun110(url,method,"","","")', 'fun.Fun110("/api/v1/h5/risk-stone-captcha/captcha/call","post","","","")'],
  ['Fun99 空参', 'fun.Fun99()'],
  ['Fun99("abc","","","")', 'fun.Fun99("abc","","","")'],
];
for (const [label, expr] of argSets) tryRun(label, expr, 6000);
