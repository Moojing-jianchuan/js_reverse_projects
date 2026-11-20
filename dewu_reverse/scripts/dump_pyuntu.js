// 在 de-escaped 源码里按多个关键串 dump 上下文
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'artifacts/unpacked/pyuntu.000.eval.deesc.js');
const s = fs.readFileSync(file, 'utf8');
const pats = process.argv.slice(2);
for (const p of pats) {
  let i = -1, c = 0;
  while ((i = s.indexOf(p, i + 1)) !== -1 && c < 4) {
    c++;
    console.log('\n--- ' + JSON.stringify(p) + ' @' + i + ' (' + c + ') ---');
    console.log(JSON.stringify(s.slice(Math.max(0, i - 260), i + 220)));
  }
  if (!c) console.log('\n--- ' + JSON.stringify(p) + ' : 0 hits');
}
