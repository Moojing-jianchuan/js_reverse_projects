// 用法: node ctx2.js <keyword> [before] [after] [maxHits] [file]
const fs = require('fs');
const file = process.argv[6] || 'D:/ds_work/js_reverse_projects/dewu_reverse/artifacts/unpacked/pceptor.000.eval.js';
const kw = process.argv[2];
const before = parseInt(process.argv[3] || '600', 10);
const after = parseInt(process.argv[4] || '1200', 10);
const maxHits = parseInt(process.argv[5] || '5', 10);
const s = fs.readFileSync(file, 'utf8');
let idx = -1, hits = 0;
while ((idx = s.indexOf(kw, idx + 1)) !== -1 && hits < maxHits) {
  hits++;
  const st = Math.max(0, idx - before);
  console.log(`\n===== @ ${idx} (${hits}/${maxHits}) =====`);
  console.log(s.slice(st, Math.min(s.length, idx + after)));
}
