// strings.mjs v2 — 静态解 obfuscator.io 字符串表 + 别名解析 + 全源码常量折叠
// 用法: node tools/vmp/strings.mjs <file> <outJson> [--fold <outFile>]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require('D:/ds_work/dsh-src/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn/dist/acorn.js');

const file = process.argv[2];
const outJson = process.argv[3];
const foldIdx = process.argv.indexOf('--fold');
const foldOut = foldIdx > 0 ? process.argv[foldIdx + 1] : null;
const src = fs.readFileSync(file, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

// ---------- 1. 表函数 ----------
function findTable() {
  const cands = [];
  for (const st of ast.body) {
    if (st.type !== 'FunctionDeclaration' || !st.body.body.length) continue;
    const first = st.body.body[0];
    if (first.type !== 'VariableDeclaration' || first.declarations.length !== 1) continue;
    const init = first.declarations[0].init;
    if (!init || init.type !== 'ArrayExpression' || init.elements.length < 10) continue;
    if (!init.elements.every(e => e && e.type === 'Literal' && typeof e.value === 'string')) continue;
    cands.push({ name: st.id.name, arr: init.elements.map(e => e.value), start: st.start, len: st.body.body[0].declarations[0].private });
  }
  return cands;
}
const tables = findTable();
if (!tables.length) throw new Error('no string table found');
const T = tables[0];
let arr = T.arr.slice();
console.log('[table]', T.name, '@' + T.start, 'rawLen', arr.length);

// ---------- 2. 访问器 ----------
const accRe = new RegExp('function (_0x[0-9a-f]+)\\(_0x[0-9a-f]+,_0x[0-9a-f]+\\)\\{var _0x[0-9a-f]+=' + T.name + '\\(\\)');
const accM = accRe.exec(src);
if (!accM) throw new Error('accessor not found');
const accName = accM[1];
const accStart = accM.index;
const accSrc = src.slice(accStart, accStart + 400);
const offset = parseInt(/-0x([0-9a-f]+);/.exec(accSrc)[1], 16);
console.log('[accessor]', accName, '@' + accStart, 'offset 0x' + offset.toString(16));
console.log('[accessor] src:', accSrc.slice(0, 200));

// ---------- 3. 别名集合（AST 数据流：var X = <已知名字>） ----------
const aliases = new Set([accName]);
let changed = true;
while (changed) {
  changed = false;
  for (const st of ast.body) {
    const decls = st.type === 'VariableDeclaration' ? st.declarations
      : (st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' && st.expression.left.type === 'Identifier')
        ? [{ id: st.expression.left, init: st.expression.right }] : [];
    for (const d of decls) {
      if (!d.id || d.id.type !== 'Identifier' || !d.init) continue;
      if (d.init.type === 'Identifier' && aliases.has(d.init.name) && !aliases.has(d.id.name)) {
        aliases.add(d.id.name); changed = true;
      }
    }
  }
}
// 函数体内也可能有 var A=B 别名，做一次全文 AST 遍历（含嵌套）
(function walk(node) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'VariableDeclaration') {
    for (const d of node.declarations) {
      if (d.id && d.id.type === 'Identifier' && d.init && d.init.type === 'Identifier'
        && aliases.has(d.init.name) && !aliases.has(d.id.name)) { aliases.add(d.id.name); changed = true; }
    }
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v.type === 'string') walk(v);
  }
})(ast);
console.log('[aliases]', [...aliases].join(' '));

// ---------- 4. 轮转 ----------
const rotRe = new RegExp('\\}\\(\\s*' + T.name + '\\s*,\\s*0x([0-9a-f]+)\\s*\\)');
const rotM = rotRe.exec(src);
let rotations = 0, target = null;
if (rotM) {
  target = parseInt(rotM[1], 16);
  const before = src.lastIndexOf('(function(', rotM.index);
  const block = src.slice(before, rotM.index + rotM[0].length);
  const expr = /try\{var _0x[0-9a-f]+=(\-?parseInt[\s\S]*?);if\(/.exec(block)[1]
    .replace(/_0x[0-9a-f]+\(0x([0-9a-f]+)\)/gi, (_, h) => `__ACC(0x${h})`);
  console.log('[rotation] @' + before, 'target 0x' + target.toString(16), '=', target);
  const fn = new Function('__ACC', `return (${expr});`);
  const ACC = (h) => arr[h - offset];
  let guard = 0;
  while (guard++ < 20000) {
    let v; try { v = fn(ACC); } catch (e) { v = NaN; }
    if (v === target) break;
    arr.push(arr.shift()); rotations++;
  }
  console.log('[rotation] rotations =', rotations, 'checksum =', fn(ACC), 'MATCH =', fn(ACC) === target);
} else console.log('[rotation] none');

const map = {};
for (let i = 0; i < arr.length; i++) map[offset + i] = arr[i];

// ---------- 5. 调用点扫描（含别名） ----------
const namePat = [...aliases].map(n => n.replace(/\$/g, '\\$')).join('|');
const callRe = new RegExp('(?:' + namePat + ')\\(0x([0-9a-f]+)\\)', 'g');
const uses = new Map();
let m;
while ((m = callRe.exec(src))) {
  const idx = parseInt(m[1], 16);
  if (!uses.has(idx)) uses.set(idx, []);
  uses.get(idx).push(m.index);
}
console.log('[uses] distinct =', uses.size, 'sites =', [...uses.values()].reduce((a, b) => a + b.length, 0));

const rows = [];
for (const [idx, pos] of [...uses.entries()].sort((a, b) => a[0] - b[0])) {
  const v = map[idx];
  rows.push(['0x' + idx.toString(16), v, pos.length]);
  console.log('  0x' + idx.toString(16), '→', JSON.stringify(v), pos.length + 'x');
}
// sanity: 有多少解码值是标识符样
const ident = rows.filter(r => typeof r[1] === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(r[1])).length;
const undef = rows.filter(r => r[1] === undefined).length;
console.log('[sanity] identifier-like', ident + '/' + rows.length, 'undefined-index', undef);

// ---------- 6. 输出 ----------
const out = {
  file, table: T.name, accessor: accName, offset, rotationTarget: target, rotations,
  aliases: [...aliases],
  entries: Object.fromEntries(rows.map(r => [r[0], r[1] === undefined ? null : r[1]])),
  sites: Object.fromEntries([...uses.entries()].map(([i, p]) => ['0x' + i.toString(16), p])),
  fullTable: Object.fromEntries(Object.entries(map).map(([i, v]) => ['0x' + Number(i).toString(16), v])),
};
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
console.log('[out]', outJson);

// ---------- 7. 生成折叠后的源码 ----------
if (foldOut) {
  const replaced = src.replace(callRe, (all, h) => {
    const v = map[parseInt(h, 16)];
    return typeof v === 'string' ? JSON.stringify(v) : all;
  });
  fs.writeFileSync(foldOut, replaced);
  console.log('[fold]', foldOut, replaced.length, 'chars (was', src.length + ')');
}
