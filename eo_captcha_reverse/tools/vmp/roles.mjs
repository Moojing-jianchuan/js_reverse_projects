// roles.mjs — 打印某个 build 的 opcode 角色归类
// 用法: node tools/vmp/roles.mjs <opcodesJson>
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const m = new Map();
for (const r of j.opcodes) {
  if (!m.has(r.role)) m.set(r.role, []);
  m.get(r.role).push(r.opHex);
}
console.log('opcodes total', j.opcodes.length, 'code array', j.codeArray, 'ip var', j.ipVar, 'regs', j.regArray);
for (const [k, v] of [...m.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(String(k).padEnd(22), String(v.length).padStart(2), v.join(' '));
}
console.log('\n--- per-opcode ---');
for (const r of j.opcodes) console.log(r.opHex.padEnd(5), String(r.incs).padStart(2), String(r.role).padEnd(22), r.body.slice(0, 110).replace(/\s+/g, ' '));
