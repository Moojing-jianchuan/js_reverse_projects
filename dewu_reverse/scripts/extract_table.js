/**
 * 把 JSDUN 包装体末尾的字符串表 _$_ 提取出来，方便按 35367[idx] 查表。
 * 输出 artifacts/unpacked/pceptor.strings.json 并打印关心的下标。
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
const file = process.argv[2] || path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js');
const s = fs.readFileSync(file, 'utf8');

const marker = ",typeof window!='undefined'";
const mi = s.indexOf(marker);
if (mi < 0) throw new Error('marker not found');
// 往前找第三个实参之前的第二个数字
const endBracket = s.lastIndexOf(']', mi);
let depth = 0, start = -1;
for (let i = endBracket; i >= 0; i--) {
  const c = s[i];
  if (c === ']') depth++;
  else if (c === '[') { depth--; if (depth === 0) { start = i; break; } }
}
const arrSrc = s.slice(start, endBracket + 1);
console.log('array literal at', start, 'len', arrSrc.length);
const table = vm.runInNewContext('(' + arrSrc + ')');
console.log('table length', table.length);
const out = path.join(ROOT, 'artifacts/unpacked/pceptor.strings.json');
fs.writeFileSync(out, JSON.stringify(table));
console.log('written', out);
const idx = process.argv.slice(3).map(Number);
if (idx.length) for (const i of idx) console.log('  [' + i + '] =', JSON.stringify(table[i]));
else {
  console.log('sample 1440..1530:');
  for (let i = 1440; i <= 1530; i++) console.log('  ', i, JSON.stringify(table[i]));
}
