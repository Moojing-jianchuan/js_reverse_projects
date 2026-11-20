// 在 payload 里找 "id:" 形式的模块注册，以及某数字出现在哪些上下文
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const file = process.argv[2] || 'pyuntu';
const needle = process.argv[3] || '35610';
const maxHits = parseInt(process.argv[4] || '10', 10);
const before = parseInt(process.argv[5] || '120', 10);
const after = parseInt(process.argv[6] || '200', 10);

const s = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/' + file + '.000.eval.js'), 'utf8');
const pats = [needle + ':', needle + '=', needle + ']', '[' + needle + ']', needle + ','];
for (const p of pats) {
  let i = -1, c = 0;
  while ((i = s.indexOf(p, i + 1)) !== -1 && c < maxHits) {
    c++;
    console.log('\n--- ' + file + ' "' + p + '" @' + i + ' (' + c + ') ---');
    console.log(JSON.stringify(s.slice(Math.max(0, i - before), i + after)));
  }
  console.log('total for', JSON.stringify(p), ':', (s.match(new RegExp(p.replace(/[[\]]/g, '\\$&'), 'g')) || []).length);
}

// 模块表：找形如 `12345:function(` 的注册
const mods = [...s.matchAll(/(\d{3,7})\s*:\s*function\s*\(/g)].map(m => m[1]);
console.log('\nfunction-valued object keys (possible module ids):', mods.length, mods.slice(0, 40).join(','));
