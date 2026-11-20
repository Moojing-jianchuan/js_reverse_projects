/**
 * 工具：把 preinforce2 扁平化状态机里的 33319[...] 常量替换成字面值并 dump 指定位移区间
 * 用法：node scripts/a_deconst.js <startOffset> <length> [outFile]
 *       node scripts/a_deconst.js --find <name>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts/unpacked/preinforce2.readable.js');
const s = fs.readFileSync(SRC, 'utf8');

/* ---- 1. 找常量数组 ---- */
function findConstArray() {
  let i = s.lastIndexOf('[');
  while (i > 0) {
    const tail = s.slice(i);
    if (/^\[[-0-9a-zA-Z,\s]*\]\s*\)?\s*;?\s*$/.test(tail)) {
      const body = tail.slice(1, tail.indexOf(']'));
      const arr = JSON.parse('[' + body + ']');
      return { start: i, arr };
    }
    i = s.lastIndexOf('[', i - 1);
  }
  throw new Error('常量数组没找到');
}
const { start: CONST_START, arr: K } = findConstArray();
console.error('# const array @' + CONST_START + ' len=' + K.length);

/* ---- 2. 常量替换 ---- */
function deconst(text) {
  return text
    .replace(/\uFC5E/g, '')                     // 去掉混淆前缀字符 (U+FC5E)
    .replace(/33319\s*\[\s*"\s*"\s*,\s*(\d+)\s*\]/g, (m, n) => JSON.stringify(K[Number(n)]))
    .replace(/33319\s*\[\s*(\d+)\s*\]/g, (m, n) => JSON.stringify(K[Number(n)]))
    .replace(/197302\s*\|\|\s*/g, '');
}

/* ---- 3. 输出 ---- */
const argv = process.argv.slice(2);
if (argv[0] === '--find') {
  const name = argv[1];
  let i = -1, n = 0;
  while ((i = s.indexOf('=' + name + '=', i + 1)) >= 0) {
    n++;
    console.log(`\n===== def #${n} @${i} =====`);
    console.log(deconst(s.slice(i - 60, i + 1800)));
  }
  if (n === 0) {
    i = -1;
    while ((i = s.indexOf(name + '=function', i + 1)) >= 0) {
      console.log(`\n===== def @${i} =====`);
      console.log(deconst(s.slice(i - 40, i + 1800)));
    }
  }
} else {
  const from = Number(argv[0] || 0);
  const len = Number(argv[1] || 2000);
  const out = deconst(s.slice(from, from + len)).replace(/;;/g, ';\n');
  if (argv[2]) { fs.writeFileSync(argv[2], out); console.log('written', argv[2], out.length); }
  else console.log(out);
}
