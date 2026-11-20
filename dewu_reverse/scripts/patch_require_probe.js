/**
 * 在 pyuntu payload 的 __webpack_require__ 处打补丁，记录"缺失的模块 id 和已注册的模块 key"。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createLegacyContext } = require('./legacy_sandbox.js');

const ROOT = path.resolve(__dirname, '..');
const P = String.fromCharCode(0xFC5E); // ﱞ
let src = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pyuntu.000.eval.js'), 'utf8');

const modsVar = P + '141254';
const idVar = P + '35610';
const needle = modsVar + '[' + idVar + '](';
const idx = src.indexOf(needle);
console.log('needle found at', idx);
if (idx < 0) process.exit(1);

const guard = `(typeof ${modsVar}[${idVar}]!=='function'?(globalThis.__miss={id:${idVar},keys:Object.keys(${modsVar}),modsType:typeof ${modsVar},stack:(new Error()).stack},1):1),`;
src = src.slice(0, idx) + guard + src.slice(idx);

const { sb, ctx } = createLegacyContext({});
// 也让 preinforce2 提供 base64js / fun
vm.runInContext(fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8'), ctx, { filename: 'preinforce2.payload.js' });

try {
  vm.runInContext(src, ctx, { filename: 'pyuntu.patched.js', timeout: 40000 });
  console.log('[OK] pyuntu executed');
} catch (e) {
  console.log('[THROW]', String(e.message).slice(0, 200));
}
console.log('miss:', JSON.stringify(sb.__miss && {
  id: sb.__miss.id,
  modsType: sb.__miss.modsType,
  keys: sb.__miss.keys && sb.__miss.keys.slice(0, 60),
  stack: String(sb.__miss.stack).split('\n').slice(0, 5).join(' | ')
}, null, 1));
