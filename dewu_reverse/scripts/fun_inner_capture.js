/**
 * 内部观测：hook base64js.fromByteArray / JSON.stringify / TextEncoder，然后调 Fun110 / Fun99，
 * 抓"明文 JSON → 密文字节 → base64 串"这条链。
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
  G.__cap = [];
  function rec(o){ if (G.__cap.length < 400) G.__cap.push(o); }
  G.__rec = rec;

  var b64 = G.base64js;
  if (b64 && b64.fromByteArray) {
    var orig = b64.fromByteArray.bind(b64);
    b64.fromByteArray = function (bytes) {
      var out = orig(bytes);
      rec({ api: 'base64js.fromByteArray', inLen: bytes && bytes.length, inHex: bytes ? Array.prototype.map.call(bytes, function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('').slice(0, 400) : null, out: String(out).slice(0, 500) });
      return out;
    };
  }
  if (b64 && b64.toByteArray) {
    var origT = b64.toByteArray.bind(b64);
    b64.toByteArray = function (s) {
      var out = origT(s);
      rec({ api: 'base64js.toByteArray', inLen: String(s).length, in: String(s).slice(0, 200), outLen: out && out.length });
      return out;
    };
  }
  var jstr = JSON.stringify;
  JSON.stringify = function (v, r, s) {
    var out = jstr.call(JSON, v, r, s);
    if (typeof out === 'string' && out.length > 24) rec({ api: 'JSON.stringify', len: out.length, out: out.slice(0, 3000) });
    return out;
  };
  var jparse = JSON.parse;
  JSON.parse = function (t, r) {
    if (typeof t === 'string' && t.length > 24) rec({ api: 'JSON.parse', len: t.length, in: t.slice(0, 3000) });
    return jparse.call(JSON, t, r);
  };
})();
`, ctx);

function run(label, expr, timeout) {
  vm.runInContext('__cap.length = 0', ctx);
  let res, err;
  try { res = vm.runInContext(expr, ctx, { filename: 'c.js', timeout: timeout || 8000 }); }
  catch (e) { err = String(e.message).slice(0, 120); }
  const cap = vm.runInContext('__cap.slice()', ctx);
  console.log('\n===== ' + label + ' =====');
  console.log('  result:', err ? 'THROW ' + err : JSON.stringify(res).slice(0, 300));
  console.log('  captured', cap.length, 'events');
  for (const c of cap) {
    if (c.api === 'JSON.stringify' || c.api === 'JSON.parse') console.log('   ', c.api, 'len', c.len, '=>', JSON.stringify((c.out || c.in).slice(0, 700)));
    else console.log('   ', c.api, 'inLen', c.inLen, 'out', JSON.stringify(String(c.out).slice(0, 200)));
  }
}

run('Fun110()', '(function(){var r=fun.Fun110();return {keys:Object.keys(r),a:r.a&&r.a.length,b:r.b,c:r.c,e:r.e&&r.e.length};})()');
run('Fun99({a:1,b:"x"})', 'fun.Fun99({a:1,b:"x"},"","","")');
