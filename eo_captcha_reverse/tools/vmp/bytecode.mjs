// bytecode.mjs — 静态解出 JSVMP 字节码整数流（按**形态**识别助手，不依赖固定混淆名）
//  1) AST 取 bootstrap 实参（base64 字面量）与入口偏移
//  2) 从折叠后源码按 AST 位置切出纯常量解码助手：
//     区间构造器(while+push) / base64 表(64 字符字母表) / zigzag(可选) / varint 解码器(Int8Array)
//  3) 在隔离 vm 里只做常量求值（不执行样本主体、不联网），再用独立重写实现交叉验证
// 用法: node tools/vmp/bytecode.mjs <foldedFile> <origFile> <outJson>
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require('D:/ds_work/dsh-src/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn/dist/acorn.js');

const [foldedFile, origFile, outJson] = process.argv.slice(2);
const folded = fs.readFileSync(foldedFile, 'utf8');
const ast = acorn.parse(folded, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

// ---------- 全树索引 ----------
const funcs = [];
const vars = new Map();
const objLits = [];
(function walk(node) {
  if (!node || typeof node.type !== 'string') return;
  if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && node.id) {
    funcs.push({ name: node.id.name, node, text: folded.slice(node.start, node.end) });
  }
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) vars.set(node.id.name, node);
  if (node.type === 'ObjectExpression') {
    const fnCount = node.properties.filter(p => p.value &&
      (p.value.type === 'FunctionExpression' || p.value.type === 'ArrowFunctionExpression')).length;
    if (fnCount >= 6) objLits.push({ node, count: fnCount, total: node.properties.length });
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v.type === 'string') walk(v);
  }
})(ast);
const slice = (n) => folded.slice(n.start, n.end);

// ---------- bootstrap ----------
let boot = null;
(function find(node) {
  if (!node || typeof node.type !== 'string' || boot) return;
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier'
    && node.arguments.length >= 1 && node.arguments[0].type === 'Literal'
    && typeof node.arguments[0].value === 'string' && node.arguments[0].value.length > 50000) { boot = node; return; }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(find);
    else if (v && typeof v.type === 'string') find(v);
  }
})(ast);
if (!boot) throw new Error('bootstrap not found');
const b64 = boot.arguments[0].value;
console.log('[boot] fn', boot.callee.name, 'b64len', b64.length);

let entry = null;
(function find2(node) {
  if (!node || typeof node.type !== 'string' || entry !== null) return;
  if (node.type === 'CallExpression' && node.arguments.length >= 5 && node.arguments[0].type === 'Literal'
    && typeof node.arguments[0].value === 'number' && node.arguments[1].type === 'ArrayExpression'
    && node.arguments[3] && node.arguments[3].type === 'ArrayExpression') { entry = node.arguments[0].value; return; }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(find2);
    else if (v && typeof v.type === 'string') find2(v);
  }
})(ast);
console.log('[boot] entry =', entry === null ? 'NOT FOUND' : '0x' + entry.toString(16));

// ---------- 形态识别助手 ----------
const pickFn = (re, label) => {
  const hit = funcs.find(f => re.test(f.text));
  console.log('[helpers]', label, '=', hit ? hit.name : 'NOT FOUND');
  return hit || null;
};
const rangeHit = pickFn(/=\[\],_0x[0-9a-f]+=0x0;while\(/, 'range-builder(while+push)');
const b64Hit = pickFn(/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/, 'base64(alphabet literal)');
const zigHit = pickFn(/>>0x1/, 'zigzag(>>1, optional)');
const decHit = pickFn(/Int8Array/, 'varint-decoder(Int8Array)');
if (!b64Hit || !decHit || !rangeHit) throw new Error('helper identification failed');

// 运算表：优先取「助手源码里以 OBJ['key'] 形式被引用的那个对象字面量」
let bigObj = null, objName = null;
const helperText = [rangeHit, b64Hit, zigHit, decHit].filter(Boolean).map(h => h.text).join('\n');
const referenced = new Set([...helperText.matchAll(/(_0x[0-9a-f]+)\[[\]'"]/g)].map(m => m[1]));
for (const name of referenced) {
  const d = vars.get(name);
  if (!d || d.init.type !== 'ObjectExpression') continue;
  const fnCount = d.init.properties.filter(p => p.value && p.value.type === 'FunctionExpression').length;
  if (fnCount >= 4) { bigObj = { node: d.init, count: fnCount }; objName = name; break; }
}
if (!bigObj) {
  bigObj = objLits.sort((x, y) => y.count - x.count)[0];
  for (const [n, d] of vars) if (d.init === (bigObj && bigObj.node)) objName = n;
}
console.log('[helpers] op table =', objName, bigObj ? bigObj.count + ' fns' : 'NONE');

// base 表变量：init 含 concat 链且引用 range-builder
let initName = null;
for (const [n, d] of vars) {
  const t = slice(d.init);
  if (/concat/.test(t) && t.includes(rangeHit.name) && t.length < 4000) { initName = n; break; }
}
console.log('[helpers] base table var =', initName);

const stubNames = new Set();
for (const [, rhs] of folded.matchAll(/var (_0x[0-9a-f]+)=(_0x[0-9a-f]+)[,;]/g)) stubNames.add(rhs);
// 未被纳入模块的函数声明也一律用哨兵桩（折叠后偶有残留别名引用）
const selected = new Set([rangeHit.name, b64Hit.name, zigHit && zigHit.name, decHit.name].filter(Boolean));
for (const f of funcs) if (!selected.has(f.name)) stubNames.add(f.name);
for (const n of selected) stubNames.delete(n);
const mod = [
  [...stubNames].map(n => 'var ' + n + '=function(){throw new Error("unfolded accessor call: ' + n + '")};').join('\n'),
  objName ? 'var ' + objName + '=' + slice(bigObj.node) + ';' : '',
  rangeHit.text, b64Hit.text, zigHit && zigHit !== b64Hit && zigHit !== decHit ? zigHit.text : '', decHit.text,
  initName ? 'var ' + initName + '=' + slice(vars.get(initName).init) + ';' : '',
  ';({ b64fn: ' + b64Hit.name + ', dec: ' + decHit.name + ', table: ' + initName + ' });',
].join('\n');
const ctx = vm.createContext({ Int8Array, Uint8Array, String, Number, Array, Math, console });
const helpers = vm.runInContext(mod, ctx, { filename: 'helpers.js' });
console.log('[helpers] table len', helpers.table && helpers.table.length, 'dec fn', typeof helpers.dec);
if (!helpers.table || typeof helpers.dec !== 'function') throw new Error('helper extraction failed');

// ---------- 解码 ----------
const ints = helpers.dec(b64);
console.log('[decode] ints =', ints.length, 'head', ints.slice(0, 16).join(','),
  'min', Math.min(...ints), 'max', Math.max(...ints));
fs.writeFileSync(outJson, JSON.stringify({ file: origFile, folded: foldedFile, entry, len: ints.length, ints }));

// ---------- 独立重写交叉验证 ----------
const tbl = helpers.table;
const valOf = new Map();
const alpha = [];
for (let c = 43; c <= 122; c++) {
  const v = tbl[c];
  if (typeof v === 'number' && !Number.isNaN(v)) { valOf.set(String.fromCharCode(c), v); alpha.push(String.fromCharCode(c) + '=' + v); }
}
console.log('[xcheck] alphabet', alpha.join(' '));

function myB64Bytes(s) {
  s = String(s).replace(/[=]+$/, '');
  const out = []; let prev = 0, n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = valOf.get(s[i]); if (v === undefined) continue;
    const rem = n % 4;
    if (rem) prev = 0x40 * prev + v; else prev = v;
    n++;
    if (rem) out.push(0xff & (prev >> ((-2 * n) & 6)));
  }
  return out;
}
function myDecode(s) {
  const b = myB64Bytes(s).map(x => x > 127 ? x - 256 : x);
  const zig = v => (v >> 1) ^ -(v & 1);
  const out = []; let i = 0;
  while (i < b.length) {
    let t = b[i++], acc = t & 0x7f;
    if (t >= 0) { out.push(zig(acc)); continue; }
    t = b[i++]; acc |= (t & 0x7f) << 7; if (t >= 0) { out.push(zig(acc)); continue; }
    t = b[i++]; acc |= (t & 0x7f) << 14; if (t >= 0) { out.push(zig(acc)); continue; }
    t = b[i++]; acc |= (t & 0x7f) << 21; if (t >= 0) { out.push(zig(acc)); continue; }
    t = b[i++]; acc |= t << 28; out.push(zig(acc));
  }
  return out;
}
const mine = myDecode(b64);
const same = mine.length === ints.length && mine.every((v, i) => v === ints[i]);
console.log('[xcheck] my decode len', mine.length, 'IDENTICAL =', same);
const bytes = myB64Bytes(b64);
console.log('[xcheck] b64→bytes', bytes.length, 'sha256',
  crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'));
fs.writeFileSync(outJson.replace(/\.json$/, '.bytes.bin'), Buffer.from(bytes));
console.log('[out]', outJson);
