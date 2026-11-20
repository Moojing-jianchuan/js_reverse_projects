/**
 * 生成 d 明文字段快照：字段名 / 类型 / 样例值 / 是否随环境或 sk 变化。
 * 用多组已捕获样本做差分：基线、sk 注入、UA 变化、延迟。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const base = fs.readFileSync(path.join(ROOT, 'artifacts/cap_plain_call.json'), 'utf8');
const j = JSON.parse(base);
const data = JSON.parse(j.data);

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

const rows = [];
rows.push({ scope: '(top)', name: 'bcv', type: typeOf(j.bcv), sample: JSON.stringify(j.bcv) });
rows.push({ scope: '(top)', name: 'type', type: typeOf(j.type), sample: JSON.stringify(j.type) });
rows.push({ scope: '(top)', name: 'c', type: typeOf(j.c), sample: JSON.stringify(j.c) });
rows.push({ scope: '(top)', name: 'webp', type: typeOf(j.webp), sample: JSON.stringify(j.webp) });
rows.push({ scope: '(top)', name: 'data', type: 'string(JSON)', sample: '<嵌套 JSON，' + j.data.length + ' 字符>' });
rows.push({ scope: '(top)', name: 'dtz', type: typeOf(j.dtz), sample: JSON.stringify(j.dtz) });
rows.push({ scope: '(top)', name: 'sessionID', type: 'string?', sample: '<首次调用缺失，仅 verify 阶段有>' });
for (const k of Object.keys(data)) {
  const v = data[k];
  rows.push({ scope: 'data', name: k, type: typeOf(v), sample: String(JSON.stringify(v)).slice(0, 120) });
}
for (const k of Object.keys(data.jcmp || {})) {
  rows.push({ scope: 'data.jcmp', name: k, type: typeOf(data.jcmp[k]), sample: String(JSON.stringify(data.jcmp[k])).slice(0, 120) });
}

console.log('scope        name              type           sample');
for (const r of rows) console.log(r.scope.padEnd(12), r.name.padEnd(17), r.type.padEnd(14), String(r.sample).slice(0, 110));
console.log('\n字段总数:', rows.length, '（top', rows.filter(r => r.scope === '(top)').length,
  '| data', rows.filter(r => r.scope === 'data').length,
  '| data.jcmp', rows.filter(r => r.scope === 'data.jcmp').length, '）');
fs.writeFileSync(path.join(ROOT, 'artifacts/cap_d_fields.json'), JSON.stringify(rows, null, 1));
console.log('已存 artifacts/cap_d_fields.json');
