// 用法: node ctx.js <dir> <keyword> [before] [after] [maxHits]
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const kw = process.argv[3];
const before = parseInt(process.argv[4] || '200', 10);
const after = parseInt(process.argv[5] || '400', 10);
const maxHits = parseInt(process.argv[6] || '5', 10);
for (const f of fs.readdirSync(dir)) {
  const p = path.join(dir, f);
  if (!fs.statSync(p).isFile()) continue;
  const s = fs.readFileSync(p, 'utf8');
  let idx = -1, hits = 0;
  while ((idx = s.indexOf(kw, idx + 1)) !== -1 && hits < maxHits) {
    hits++;
    const st = Math.max(0, idx - before);
    console.log(`\n===== ${f} @ ${idx} (${hits}/${maxHits}) =====`);
    console.log(s.slice(st, Math.min(s.length, idx + after)));
  }
}
