/**
 * 探针 3：按真实顺序把 preinforce2 → pceptor → pyuntu 装进同一个沙箱。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { makeSandbox, ROOT } = require('./sandbox_factory.js');

const ctx = makeSandbox({ uaFamily: 'chrome' });
const baseline = new Set(vm.runInContext('Object.getOwnPropertyNames(globalThis)', ctx));

const order = [
  ['artifacts/js/preinforce2.js', 'preinforce2'],
  ['artifacts/js/pceptor.js', 'pceptor'],
  ['artifacts/js/pyuntu.js', 'pyuntu'],
];

for (const [rel, name] of order) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const before = new Set(vm.runInContext('Object.getOwnPropertyNames(globalThis)', ctx));
  const mark = ctx.__trace.calls.length;
  try {
    vm.runInContext(code, ctx, { filename: name + '.js', timeout: 30000 });
    console.log('\n[' + name + '] OK');
  } catch (e) {
    console.log('\n[' + name + '] THROW', e && e.constructor && e.constructor.name, '-', String(e && e.message).slice(0, 200));
    console.log('  stack:', String(e && e.stack).split('\n').slice(0, 5).join(' | ').slice(0, 400));
  }
  const after = vm.runInContext('Object.getOwnPropertyNames(globalThis)', ctx);
  const added = after.filter(k => !before.has(k));
  console.log('  new globals:', JSON.stringify(added));
  const calls = ctx.__trace.calls.slice(mark);
  console.log('  trace calls:', calls.length, '|', JSON.stringify(calls.slice(0, 6).map(c => c.api)));
  const js = calls.filter(c => c.api === 'JSON.stringify');
  for (const c of js.slice(0, 5)) console.log('   JSON.len', c.len, 'preview', String(c.preview).slice(0, 200));
}

console.log('\n=== 最终非内建全局 ===');
const fin = vm.runInContext('Object.getOwnPropertyNames(globalThis)', ctx).filter(k => !baseline.has(k));
console.log(JSON.stringify(fin));
for (const k of fin) {
  const t = ctx.read('typeof ' + JSON.stringify(k));
  console.log('  ', k, t, t === 'object' ? JSON.stringify(Object.keys(ctx[k] || {})).slice(0, 200) : '');
}
