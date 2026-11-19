// show.mjs — 打印某 ip 附近的指令窗口（带角色与操作数）
// 用法: node tools/vmp/show.mjs <insJson> <ip> [before] [after]
import fs from 'node:fs';
const [insFile, ipS, beforeS, afterS] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(insFile, 'utf8'));
const ip0 = Number(ipS), before = Number(beforeS || 8), after = Number(afterS || 4);
const idx = list.findIndex(i => i.ip === ip0);
const from = Math.max(0, idx - before), to = Math.min(list.length, idx + after + 1);
for (let k = from; k < to; k++) {
  const i = list[k];
  const mark = i.ip === ip0 ? '>>' : '  ';
  console.log(mark, String(i.ip).padStart(7), '0x' + i.op.toString(16).padStart(2, '0'), String(i.role).padEnd(22), '[' + i.ops.join(', ') + ']', 'len=' + i.len);
}
