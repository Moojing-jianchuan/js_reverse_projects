/**
 * 输出某个标识符在 readable 源码里的所有出现位置及上下文
 * 用法: node scripts/ctx3.js <file> <kw> [before] [after]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const f = path.resolve(__dirname, '..', 'artifacts/unpacked', (process.argv[2] || 'pceptor.readable.js'));
const kw = process.argv[3];
const before = parseInt(process.argv[4] || '400', 10);
const after = parseInt(process.argv[5] || '800', 10);
const s = fs.readFileSync(f, 'utf8');
let i = -1, n = 0;
while ((i = s.indexOf(kw, i + 1)) !== -1 && n < 20) {
  n++;
  console.log(`\n===== ${path.basename(f)} @${i} (#${n}) =====`);
  console.log(s.slice(Math.max(0, i - before), Math.min(s.length, i + after)));
}
console.log(`\n[total shown] ${n}`);
