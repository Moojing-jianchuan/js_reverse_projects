// 关键词计数 + 上下文 dump
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const files = process.argv[2]
  ? process.argv[2].split(',')
  : ['artifacts/unpacked/pceptor.000.eval.js', 'artifacts/unpacked/preinforce2.000.eval.js', 'artifacts/unpacked/pyuntu.000.eval.js'];
const kws = (process.argv[3] || 'risk-stone-captcha,captcha,cloudauth,sumei,umid,deviceToken,getUmid').split(',');

for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  console.log('\n#####', f, 'len', s.length);
  for (const kw of kws) {
    let i = -1, n = 0;
    while ((i = s.indexOf(kw, i + 1)) !== -1) n++;
    if (n) console.log('  ', JSON.stringify(kw), 'x', n);
    else console.log('  ', JSON.stringify(kw), 'x 0');
  }
}

// 若给第 4 个参数则以它为关键词 dump 上下文
const dumpKw = process.argv[4];
if (dumpKw) {
  const before = parseInt(process.argv[5] || '300', 10);
  const after = parseInt(process.argv[6] || '500', 10);
  const maxHits = parseInt(process.argv[7] || '6', 10);
  for (const f of files) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    let i = -1, c = 0;
    while ((i = s.indexOf(dumpKw, i + 1)) !== -1 && c < maxHits) {
      c++;
      console.log('\n=== ' + f + ' @' + i + ' (' + c + ') ===');
      console.log(JSON.stringify(s.slice(Math.max(0, i - before), i + after)));
    }
  }
}
