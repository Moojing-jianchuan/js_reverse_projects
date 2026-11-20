/**
 * Fun110 参数语义矩阵 + 确定性检查。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createLegacyContext } = require('./legacy_sandbox.js');

const ROOT = path.resolve(__dirname, '..');
const { sb, ctx } = createLegacyContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8'), ctx, { filename: 'preinforce2.payload.js' });

function call(label, argSrc, timeout) {
  const t0 = Date.now();
  try {
    const r = vm.runInContext(`JSON.stringify((function(){var r=fun.Fun110(${argSrc});return r;})())`, ctx, { filename: 'c.js', timeout: timeout || 5000 });
    console.log(('[' + label + ']').padEnd(38), (Date.now() - t0 + 'ms').padStart(7), String(r).slice(0, 260));
    return r;
  } catch (e) {
    console.log(('[' + label + ']').padEnd(38), (Date.now() - t0 + 'ms').padStart(7), 'THROW/TIMEOUT:', String(e.message).slice(0, 80));
    return null;
  }
}

console.log('=== 单参数 arg0 语义 ===');
call('()');
call('(undefined)', 'undefined');
call('(null)', 'null');
call('("")', '""');
call('("abc")', '"abc"');
call('("/api/x")', '"/api/x"');
call('(0)', '0');
call('(1763600000000)', '1763600000000');
call('({})', '{}');
call('([])', '[]');

console.log('\n=== arg1 (method?) ===');
call('("","get")', '"","get"');
call('("","POST")', '"","POST"');
call('("","")', '"",""');

console.log('\n=== 确定性：连调 3 次 Fun110() ===');
for (let i = 0; i < 3; i++) call('call#' + i, '');
