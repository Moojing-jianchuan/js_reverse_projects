/**
 * fun 行为探针：在 legacy 沙箱里只加载 preinforce2（稳定 5/5），
 * 1) dump Fun110 / Fun99 / constructor 的完整源码；
 * 2) 用真实抓包素材（resp_125.bin + sk/sks 令牌）测 Fun99 是不是解密；
 * 3) 扫 Fun110 的参数语义。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createLegacyContext } = require('./legacy_sandbox.js');

const ROOT = path.resolve(__dirname, '..');
const { sb, ctx } = createLegacyContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8'), ctx, { filename: 'preinforce2.payload.js' });
console.log('[OK] preinforce2 payload loaded; fun =', typeof sb.fun);

const outDir = path.join(ROOT, 'artifacts/fun_src');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'Fun110.js'), String(sb.fun.Fun110));
fs.writeFileSync(path.join(outDir, 'Fun99.js'), String(sb.fun.Fun99));
fs.writeFileSync(path.join(outDir, 'constructor.js'), String(sb.fun.constructor));
fs.writeFileSync(path.join(outDir, 'installed_snapshot.json'), JSON.stringify({
  proto: Object.getOwnPropertyNames(Object.getPrototypeOf(sb.fun)),
  own: Object.getOwnPropertyNames(sb.fun),
  ctorName: sb.fun.constructor.name,
  arity: { Fun110: sb.fun.Fun110.length, Fun99: sb.fun.Fun99.length },
  keys: Object.keys(sb.fun),
}, null, 2));
console.log('dumped fun sources to artifacts/fun_src/');

const show = (label, fn) => {
  try {
    const r = fn();
    let d;
    if (typeof r === 'string') d = 'string(' + r.length + ') ' + JSON.stringify(r.slice(0, 120));
    else if (r === undefined) d = 'undefined';
    else if (r === null) d = 'null';
    else if (typeof r === 'object') d = 'object ' + JSON.stringify(r).slice(0, 300);
    else d = typeof r + ' ' + String(r);
    console.log('  ' + label + ' -> ' + d);
    return r;
  } catch (e) {
    console.log('  ' + label + ' -> THROW ' + String(e.message).slice(0, 140));
    return undefined;
  }
};

console.log('\n=== Fun99 语义扫描（4 参数：data, ?, key, ?） ===');
const resp = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8').trim();
const sk = 'YOUR_SK_HERE';
console.log('resp_125 len', resp.length, 'head', JSON.stringify(resp.slice(0, 60)));
show('Fun99(resp, "", sk, "")', () => sb.fun.Fun99(resp, '', sk, ''));
show('Fun99(resp, "", "", "")', () => sb.fun.Fun99(resp, '', '', ''));
show('Fun99(resp, sk, "", "")', () => sb.fun.Fun99(resp, sk, '', ''));
show('Fun99("hello","","","")', () => sb.fun.Fun99('hello', '', '', ''));
show('Fun99({a:1,b:[1,2]}, "", "", "")', () => sb.fun.Fun99({ a: 1, b: [1, 2] }, '', '', ''));
show('Fun99([1,2,3], "", "", "")', () => sb.fun.Fun99([1, 2, 3], '', '', ''));

console.log('\n=== Fun110 语义扫描（5 参数） ===');
show('Fun110("/api/x","post","a","b","c")', () => sb.fun.Fun110('/api/x', 'post', 'a', 'b', 'c'));
show('Fun110("/api/x","get","a","b","c")', () => sb.fun.Fun110('/api/x', 'get', 'a', 'b', 'c'));
show('Fun110(1,2,3,4,5)', () => sb.fun.Fun110(1, 2, 3, 4, 5));
show('Fun110()', () => sb.fun.Fun110());

// 结构详情：把 Fun110 返回的每个字段类型打出来
try {
  const r = sb.fun.Fun110('/api/x', 'post', 'a', 'b', 'c');
  console.log('\nFun110 返回字段明细:');
  for (const k of Object.keys(r)) console.log('   ', k, '=', typeof r[k], JSON.stringify(r[k]).slice(0, 200));
} catch (e) { console.log('detail fail', e.message); }
