const fs = require('fs');
const targets = ['251327', '37,19,39', '37, 19, 39', 'String.fromCharCode', 'fromCharCode', 'atob', 'btoa'];
for (const f of ['config/feilin075.js', 'config/pe080.js']) {
  const s = fs.readFileSync(f, 'utf8');
  console.log('===', f, 'len', s.length);
  for (const p of targets) {
    let idx = -1, c = 0, first = -1;
    while ((idx = s.indexOf(p, idx + 1)) >= 0) { if (first < 0) first = idx; c++; }
    console.log('  ', JSON.stringify(p), 'count', c, 'first', first);
  }
}
// 打印 pe080 的 btoa 调用点上下文（此前栈显示 211175 附近）
const pe = fs.readFileSync('config/pe080.js', 'utf8');
const near = [];
let i = -1;
while ((i = pe.indexOf('btoa', i + 1)) >= 0) near.push(i);
console.log('\npe080 btoa 位置:', near.slice(0, 10));
for (const pos of near.slice(0, 3)) {
  console.log(`--- @${pos} ---`);
  console.log(pe.slice(Math.max(0, pos - 320), pos + 160).replace(/\n/g, ' '));
}
// feilin075 的 btoa 位置
const fe = fs.readFileSync('config/feilin075.js', 'utf8');
const fn = [];
let j = -1;
while ((j = fe.indexOf('btoa', j + 1)) >= 0) fn.push(j);
console.log('\nfeilin075 btoa 位置:', fn.slice(0, 10));
for (const pos of fn.slice(0, 2)) {
  console.log(`--- @${pos} ---`);
  console.log(fe.slice(Math.max(0, pos - 320), pos + 160).replace(/\n/g, ' '));
}
