// slice.mjs — 按字符区间切片到文件，便于阅读
// 用法: node tools/vmp/slice.mjs <srcFile> <start> <end> <outFile> [wrapCols]
import fs from 'node:fs';
const [file, a, b, out, wrap] = process.argv.slice(2);
const s = fs.readFileSync(file, 'utf8');
const t = s.slice(Number(a), Number(b));
let text = t;
const w = Number(wrap || 0);
if (w > 0) {
  const lines = [];
  for (let i = 0; i < t.length; i += w) lines.push(t.slice(i, i + w));
  text = lines.join('\n');
}
fs.writeFileSync(out, text);
console.log('wrote', out, text.length, 'chars');
