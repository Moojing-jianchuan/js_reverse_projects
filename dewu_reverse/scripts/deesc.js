// 把 '\u0063\u0061...' 形式的转义解码成可读字符，产出 .deesc.js 便于搜索/阅读。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const files = process.argv.slice(2);
if (!files.length) {
  console.log('usage: node deesc.js <file...>');
  process.exit(1);
}
for (const rel of files) {
  const p = path.join(ROOT, rel);
  const s = fs.readFileSync(p, 'utf8');
  let n = 0;
  const out = s.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => {
    const c = parseInt(h, 16);
    if (c < 32 || c > 126) return m; // 保留控制字符/非 ASCII
    n++;
    return String.fromCharCode(c);
  });
  const dst = p.replace(/\.js$/, '.deesc.js');
  fs.writeFileSync(dst, out);
  console.log(rel, '->', path.basename(dst), 'decoded', n, 'escapes, len', out.length);
}
