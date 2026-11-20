/**
 * 解析 .cpuprofile：打印最热的函数与它们的调用位置（取自身采样最多的节点）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '../artifacts/prof');
const f = fs.readdirSync(dir).filter(x => x.endsWith('.cpuprofile')).sort().pop();
const prof = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const nodes = new Map(prof.nodes.map(n => [n.id, n]));
const self = new Map();
for (const id of prof.samples || []) self.set(id, (self.get(id) || 0) + 1);
const rows = [...self.entries()].map(([id, c]) => ({ n: nodes.get(id), c })).filter(r => r.n)
  .sort((a, b) => b.c - a.c);
console.log('[profile]', f, 'samples', (prof.samples || []).length);
for (const r of rows.slice(0, 12)) {
  const cf = r.n.callFrame;
  console.log(`  ${r.c} samples  ${cf.functionName || '(anon)'}  ${cf.url}:${cf.lineNumber}:${cf.columnNumber}`);
}
// 打印最热节点的父链（用 children 反查）
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
if (rows[0]) {
  let id = rows[0].n.id;
  console.log('\n[调用链]');
  const chain = [];
  while (id) {
    const n = nodes.get(id);
    if (!n) break;
    chain.push(`${n.callFrame.functionName || '(anon)'}@${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`);
    id = parent.get(id);
  }
  console.log(chain.slice(0, 14).join('\n  <- '));
}
