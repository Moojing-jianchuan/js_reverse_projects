// inventory.mjs — 纯静态结构扫描：找字符串表/访问器/引导调用/分发器
// 用法: node tools/vmp/inventory.mjs <file> [...]
import fs from 'node:fs';

const files = process.argv.slice(2);
const MARK = [
  ['TDC_NAME assign', 'window.TDC_NAME'],
  ['blob assign', 'window['],
  ['bootstrap', 'joAqFyB$xo$64b57z'],
  ['switch(', 'switch('],
  ['case 0x', 'case 0x'],
  ['function _0x', 'function _0x'],
  ['while(!![])', 'while(!![])'],
  ['parseInt(', 'parseInt('],
  ['Object.defineProperty', 'Object.defineProperty'],
];

function all(hay, needle) {
  const out = [];
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { out.push(i); i += needle.length; }
  return out;
}

for (const f of files) {
  if (!fs.existsSync(f)) { console.log('MISSING', f); continue; }
  const s = fs.readFileSync(f, 'utf8');
  console.log('='.repeat(70));
  console.log('FILE', f, 'chars', s.length);
  for (const [label, needle] of MARK) {
    const p = all(s, needle);
    console.log(`  ${label.padEnd(22)} count=${String(p.length).padEnd(5)} first=${p.slice(0, 12).join(',')}${p.length > 12 ? ' …' : ''}`);
  }
  // function _0xXXX definitions with position + first 120 chars
  const re = /function (_0x[0-9a-f]+)\(/g;
  let m, seen = [];
  while ((m = re.exec(s))) seen.push([m[1], m.index]);
  const uniq = new Map();
  for (const [n, i] of seen) if (!uniq.has(n)) uniq.set(n, i);
  console.log('  function _0x defs:');
  for (const [n, i] of uniq) console.log(`    ${n} @${i}  ${JSON.stringify(s.slice(i, i + 100))}`);
}
