// src/_probe_bc.mjs — 修正版 helper 识别：base64 助手改用「引用 base 表变量」定位
// 用法: node src/_probe_bc.mjs <folded> <orig> <outJson>
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require('D:/ds_work/dsh-src/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn/dist/acorn.js');

const [foldedFile, origFile, outJson] = process.argv.slice(2);
const folded = fs.readFileSync(foldedFile, 'utf8');
const ast = acorn.parse(folded, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

const funcs = [];
const vars = new Map();
(function walk(node) {
  if (!node || typeof node.type !== 'string') return;
  if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && node.id) {
    funcs.push({ name: node.id.name, node, text: folded.slice(node.start, node.end) });
  }
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) vars.set(node.id.name, node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v.type === 'string') walk(v);
  }
})(ast);
const slice = n => folded.slice(n.start, n.end);

let boot = null;
(function find(node) {
  if (!node || typeof node.type !== 'string' || boot) return;
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier'
    && node.arguments.length >= 1 && node.arguments[0].type === 'Literal'
    && typeof node.arguments[0].value === 'string' && node.arguments[0].value.length > 50000) { boot = node; return; }
  for (const k of Object.keys(node)) { const v = node[k]; if (Array.isArray(v)) v.forEach(find); else if (v && typeof v.type === 'string') find(v); }
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
  for (const k of Object.keys(node)) { const v = node[k]; if (Array.isArray(v)) v.forEach(find2); else if (v && typeof v.type === 'string') find2(v); }
})(ast);
console.log('[boot] entry =', entry === null ? 'NOT FOUND' : '0x' + entry.toString(16));

const pickFn = (re, label) => {
  const hit = funcs.find(f => re.test(f.text));
  console.log('[helpers]', label, '=', hit ? hit.name : 'NOT FOUND');
  return hit || null;
};
const rangeHit = pickFn(/=\[\],_0x[0-9a-f]+=0x0;while\(/, 'range-builder(while+push)');
const zigHit = pickFn(/>>0x1/, 'zigzag(>>1)');
const decHit = pickFn(/Int8Array/, 'varint-decoder(Int8Array)');
if (!rangeHit || !decHit) throw new Error('range/dec helper missing');

// base 表变量：init 含 concat 且引用 range-builder
let initName = null, initNode = null;
for (const [n, d] of vars) {
  const t = slice(d.init);
  if (/concat/.test(t) && t.includes(rangeHit.name) && t.length < 4000) { initName = n; initNode = d.init; break; }
}
console.log('[helpers] base table var =', initName);
if (!initName) throw new Error('base table not found');

// base64 助手：引用 base 表变量的具名函数（新旧两种形状都覆盖到）
let b64Hit = pickFn(/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/, 'base64(literal in fn)');
if (!b64Hit) {
  const refRe = new RegExp('\\b' + initName + '\\[', 'g');
  b64Hit = funcs.find(f => refRe.test(f.text) && /charCodeAt|replace/.test(f.text)) || null;
  console.log('[helpers] base64(via table var) =', b64Hit ? b64Hit.name : 'NOT FOUND');
}
if (!b64Hit) throw new Error('b64 helper not found');

// 运算表
let bigObj = null, objName = null;
const helperText = [rangeHit, b64Hit, zigHit, decHit].filter(Boolean).map(h => h.text).join('\n');
const referenced = new Set([...helperText.matchAll(/(_0x[0-9a-f]+)\[[\]'"]/g)].map(m => m[1]));
for (const name of referenced) {
  const d = vars.get(name);
  if (!d || d.init.type !== 'ObjectExpression') continue;
  const fnCount = d.init.properties.filter(p => p.value && p.value.type === 'FunctionExpression').length;
  if (fnCount >= 4) { bigObj = { node: d.init, count: fnCount }; objName = name; break; }
}
if (!bigObj) throw new Error('op table not found');
console.log('[helpers] op table =', objName, bigObj.count, 'fns');

const stubNames = new Set();
for (const [, rhs] of folded.matchAll(/var (_0x[0-9a-f]+)=(_0x[0-9a-f]+)[,;]/g)) stubNames.add(rhs);
const selected = new Set([rangeHit.name, b64Hit.name, zigHit && zigHit.name, decHit.name].filter(Boolean));
for (const f of funcs) if (!selected.has(f.name)) stubNames.add(f.name);
for (const n of selected) stubNames.delete(n);

const mod = [
  [...stubNames].map(n => 'var ' + n + '=function(){throw new Error("stub ' + n + '")};').join('\n'),
  'var ' + objName + '=' + slice(bigObj.node) + ';',
  rangeHit.text, b64Hit.text, (zigHit && ![b64Hit, decHit, rangeHit].includes(zigHit)) ? zigHit.text : '', decHit.text,
  'var ' + initName + '=' + slice(initNode) + ';',
  ';({ b64fn: ' + b64Hit.name + ', dec: ' + decHit.name + ', table: ' + initName + ' });',
].join('\n');
const ctx = vm.createContext({ Int8Array, Uint8Array, String, Number, Array, Math, console });
const helpers = vm.runInContext(mod, ctx, { filename: 'helpers.js' });
console.log('[helpers] table len', helpers.table && helpers.table.length);
const ints = helpers.dec(b64);
let mn = Infinity, mx = -Infinity;
for (const v of ints) { if (v < mn) mn = v; if (v > mx) mx = v; }
console.log('[decode] ints =', ints.length, 'head', ints.slice(0, 12).join(','), 'min', mn, 'max', mx);
fs.writeFileSync(outJson, JSON.stringify({ file: origFile, folded: foldedFile, entry, len: ints.length, ints }));

// delta 是否作为立即数出现在流里
const DELTA = 0x9e3779b9 | 0;
const hits = [];
for (let i = 0; i < ints.length; i++) {
  const v = ints[i];
  if (v === DELTA || v === (DELTA >>> 0) || v === (-DELTA | 0)) hits.push([i, v]);
}
console.log('[scan] delta-like immediates at', hits.length, 'sites:', hits.slice(0, 20).map(h => h[0] + '=' + h[1]).join(' '));
