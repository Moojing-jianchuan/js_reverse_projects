/**
 * A/B：确认"JSON.stringify 包装"是否改变 VM 行为（JSDUN 反调试会对原生函数做 toString 校验）。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { makeSandbox, ROOT } = require('./sandbox_factory.js');

const code = fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8');

function attempt(label, opts, patch) {
  const ctx = makeSandbox(Object.assign({ uaFamily: 'chrome' }, opts));
  if (patch) vm.runInContext(patch, ctx);
  const t0 = Date.now();
  try {
    vm.runInContext(code, ctx, { filename: 'preinforce2.js', timeout: 40000 });
    console.log(label, '=> OK in', Date.now() - t0, 'ms; fun =', vm.runInContext('typeof fun', ctx));
  } catch (e) {
    console.log(label, '=> THROW', String(e.message).slice(0, 90));
  }
}

attempt('A hooks:false                 ', { hooks: false });
attempt('B hooks:true  jsonMin=1e9      ', { hooks: true, jsonMin: 1e9 });
attempt('C hooks:true  jsonMin=40       ', { hooks: true, jsonMin: 40 });
attempt('D hooks:false + native-looking ', { hooks: false }, `
  (function(){
    var jstr = JSON.stringify;
    var w = function (v, r, s) { return jstr.call(JSON, v, r, s); };
    w.toString = function () { return 'function stringify() { [native code] }'; };
    JSON.stringify = w;
  })();
`);
attempt('E hooks:true jsonMin=40 + toString', { hooks: true, jsonMin: 40 }, '');
