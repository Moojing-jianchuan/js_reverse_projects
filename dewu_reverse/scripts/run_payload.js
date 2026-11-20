/**
 * 直接执行"已解码 payload"（artifacts/unpacked/*.eval.js），带完整栈追踪。
 * 用法: node scripts/run_payload.js pyuntu [legacy|clean]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createLegacyContext } = require('./legacy_sandbox.js');

const ROOT = path.resolve(__dirname, '..');
const name = process.argv[2] || 'pyuntu';
const mode = process.argv[3] || 'legacy';
const payload = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/' + name + '.000.eval.js'), 'utf8');

let sb, ctx;
if (mode === 'legacy') {
  ({ sb, ctx } = createLegacyContext({}));
} else {
  const { makeSandbox } = require('./sandbox_factory.js');
  ctx = makeSandbox({ uaFamily: 'chrome', hooks: false });
  sb = ctx;
}

const before = mode === 'legacy' ? new Set(Object.keys(sb)) : new Set(vm.runInContext('Object.getOwnPropertyNames(globalThis)', ctx));
const t0 = Date.now();
try {
  vm.runInContext(payload, ctx, { filename: name + '.payload.js', timeout: 40000 });
  console.log('[OK]', name, 'executed in', Date.now() - t0, 'ms');
} catch (e) {
  console.log('[THROW]', e && e.constructor && e.constructor.name, '-', String(e && e.message).slice(0, 300));
  console.log('elapsed', Date.now() - t0, 'ms');
  const st = String(e && e.stack || '');
  console.log(st.split('\n').slice(0, 12).join('\n'));
}
const after = mode === 'legacy' ? Object.keys(sb) : vm.runInContext('Object.getOwnPropertyNames(globalThis)', ctx);
const added = after.filter(k => !before.has(k));
console.log('new globals:', JSON.stringify(added));
if (mode === 'legacy') {
  for (const k of added) {
    const v = sb[k];
    if (v && typeof v === 'object') console.log('  obj', k, JSON.stringify(Object.keys(v)).slice(0, 300));
    else console.log('  ', k, typeof v, String(v).slice(0, 80));
  }
}
