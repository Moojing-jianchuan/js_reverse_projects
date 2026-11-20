/**
 * 把 \uXXXX 转义解出来，生成 *.readable.js，便于按端点/字段名搜索
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const names = ['pceptor', 'preinforce2', 'pyuntu'];
for (const n of names) {
  const src = path.join(ROOT, 'artifacts/unpacked', n + '.000.eval.js');
  const s = fs.readFileSync(src, 'utf8');
  const dec = s.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => {
    const c = parseInt(h, 16);
    return (c >= 32 && c < 127) ? String.fromCharCode(c) : m;
  });
  fs.writeFileSync(path.join(ROOT, 'artifacts/unpacked', n + '.readable.js'), dec);
  const kws = ['webSk', 'dav.dewu.com', 'interceptor', '/cost', 'sk=', 'getSk', 'Fun110'];
  const out = kws.map(kw => {
    let i = -1; const hits = [];
    while ((i = dec.indexOf(kw, i + 1)) !== -1) hits.push(i);
    return kw + '=' + hits.length + (hits.length ? '[' + hits.slice(0, 6).join(',') + ']' : '');
  });
  console.log(n, '->', out.join('  '));
}
