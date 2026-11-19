// merge_strings.mjs — 把两份 build 的字符串表解法合并成 samples/tdc.strings.json（index → 明文）
// 用法: node tools/vmp/merge_strings.mjs samples/tdc.strings.json A.json:B.csv,label ...
import fs from 'node:fs';
const out = process.argv[2];
const specs = process.argv.slice(3).map(s => {
  const [file, label] = s.split(':');
  return { file, label, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
});
const result = {
  _readme: {
    what: 'obfuscator.io 字符串表解法结果：build → (index → 明文)。index 是源码里 _0xACCESSOR(0xNNN) 的 0xNNN。',
    method: [
      '1) 表数组取自 AST 里 ArrayExpression 的字面量（不 eval 源文本）',
      '2) 访问器偏移取自 AST：p = p - 0xNNN',
      '3) 轮转：把轮转 IIFE 的校验和表达式里的 ACCESSOR(0xNNN) 折叠成 arr[0xNNN-off]，对常量表达式求值；命中 target 即得到最终顺序',
      '4) 校验：finalChecksum === rotationTarget；且解码出的值里出现 call/apply/push/pop/concat/fromCharCode/defineProperty/length 等真实 JS 内置名',
      '5) 别名：`var X = ACCESSOR` 与 `var X = <已识别别名>` 递归收集，调用点按别名全量匹配后再折叠',
    ],
    tools: ['tools/vmp/strings.mjs', 'tools/vmp/merge_strings.mjs'],
  },
  builds: {},
};
for (const { file, label, data } of specs) {
  result.builds[label] = {
    file: data.file,
    tableFn: data.table, accessor: data.accessor,
    indexOffset: '0x' + data.offset.toString(16),
    rotationTarget: '0x' + data.rotationTarget.toString(16),
    rotationsApplied: data.rotations,
    aliases: data.aliases,
    callsites: Object.values(data.sites).reduce((a, b) => a + b.length, 0),
    entries: data.entries,            // 仅“被实际调用”的 index
    fullTable: data.fullTable,        // 整张表（index → 明文）
  };
}
fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log('[merge] wrote', out, Object.keys(result.builds).length, 'builds');
for (const [k, v] of Object.entries(result.builds))
  console.log('  ', k, 'offset', v.indexOffset, 'rotations', v.rotationsApplied, 'callsites', v.callsites,
    'entries', Object.keys(v.entries).length);
