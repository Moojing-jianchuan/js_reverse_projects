// 通用：在指定 de-escaped 源码里搜关键串并 dump 上下文
// 用法: node scripts/dump_src.js <file> <kw1> [kw2 ...]
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, process.argv[2]);
const kws = process.argv.slice(3);
const s = fs.readFileSync(file, 'utf8');
for (const p of kws) {
  let i = -1, c = 0;
  while ((i = s.indexOf(p, i + 1)) !== -1 && c < 4) {
    c++;
    console.log('\n--- ' + JSON.stringify(p) + ' @' + i + ' (' + c + ') ---');
    console.log(JSON.stringify(s.slice(Math.max(0, i - 300), i + 260)));
  }
  if (!c) console.log('\n--- ' + JSON.stringify(p) + ' : 0 hits');
}
