/**
 * 用 U+2028/U+2029/CR/LF 作为分行符，把 vm 的 line:col 换算成字符偏移
 * 用法: node scripts/vm_line2off.js <file> <line> <col> [before] [after]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const f = path.resolve(__dirname, '..', 'artifacts/unpacked', process.argv[2]);
const line = Number(process.argv[3]);
const col = Number(process.argv[4]);
const before = Number(process.argv[5] || 600);
const after = Number(process.argv[6] || 400);
const s = fs.readFileSync(f, 'utf8');
const ls = (s.match(/[\u2028\u2029\r\n]/g) || []).length;
console.log('[line terminators]', ls, '| U+2028:', (s.match(/\u2028/g) || []).length, 'U+2029:', (s.match(/\u2029/g) || []).length);
let off = 0, ln = 1;
while (ln < line) {
  const m = /[\u2028\u2029\r\n]/.exec(s.slice(off));
  if (!m) break;
  off = off + m.index + 1;
  ln++;
}
const at = off + col;
console.log('[reached line]', ln, '[offset]', at, 'of', s.length);
console.log('----------');
console.log(s.slice(Math.max(0, at - before), at + after));
console.log('----------');
console.log('[around exact]', JSON.stringify(s.slice(at - 120, at + 120)));
