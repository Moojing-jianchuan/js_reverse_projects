/**
 * 验证 20：hsn 只依赖 body 长度 —— 反推具体构造
 */
'use strict';
const crypto = require('crypto');
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const T = {
  0: '90c805bcb9fa376aacfb38d598ec7bb6',
  7: '6d0bb00954ceb7fbee436bb55a8397a9',
  8: '22577911e88af39f79409e6de8eed4d9',
  10: '213e635dac590095b5681a944a5713a2',
};
const lens = Object.keys(T).map(Number);
const chars = ['0', 'a', ' ', '\0', 'x', '1', '_', '.', 'A'];

const forms = {};
for (const ch of chars) {
  forms['md5("' + JSON.stringify(ch) + '".repeat(n))'] = n => md5(ch.repeat(n));
  forms['md5(n + "' + JSON.stringify(ch) + '".repeat(n))'] = n => md5(String(n) + ch.repeat(n));
  forms['md5("' + JSON.stringify(ch) + '".repeat(n) + n)'] = n => md5(ch.repeat(n) + String(n));
}
forms['md5(String(n))'] = n => md5(String(n));
forms['md5(n*2 repeated)'] = n => md5('0'.repeat(n * 2));
forms['md5(space*2n)'] = n => md5(' '.repeat(n * 2));

let found = 0;
for (const [name, fn] of Object.entries(forms)) {
  const ok = lens.every(n => fn(n) === T[n]);
  if (ok) { console.log('MATCH', name); found++; }
}
console.log('直接形式命中:', found);

// 换思路：hsn 可能是 md5(32位空 body 摘要 + 长度) 之类。先看 len=0 的目标是不是某个常见空串 md5
const known = {
  'md5("")': md5(''),
  'md5("0")': md5('0'),
  'md5("undefined")': md5('undefined'),
  'md5("null")': md5('null'),
  'md5("POST")': md5('POST'),
  'md5("[]")': md5('[]'),
  'md5("{}")': md5('{}'),
};
for (const [k, v] of Object.entries(known)) if (v === T[0]) console.log('len0 =', k);
console.log('\n[目标]', JSON.stringify(T, null, 1));
