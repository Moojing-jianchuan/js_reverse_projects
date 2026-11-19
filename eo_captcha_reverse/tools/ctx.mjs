// ctx.mjs — search a (possibly single-line huge) JS file for a regex and print
// offset + context snippets. Usage:
//   node tools/ctx.mjs <file> <pattern> [ctxChars=200] [maxHits=10] [flags]
// flags: i (ignore case), r (treat pattern as raw substring, not regex)
import fs from 'node:fs';

const [file, pattern, ctxArg, maxArg, flagsArg] = process.argv.slice(2);
const ctx = Number(ctxArg || 200);
const maxHits = Number(maxArg || 10);
const flags = flagsArg || '';
const src = fs.readFileSync(file, 'utf8');

let re;
if (flags.includes('r')) {
  re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (flags.includes('i') ? 'i' : ''));
} else {
  re = new RegExp(pattern, 'g' + (flags.includes('i') ? 'i' : ''));
}

let m, n = 0;
while ((m = re.exec(src)) !== null) {
  n++;
  const s = Math.max(0, m.index - ctx);
  const e = Math.min(src.length, m.index + m[0].length + ctx);
  const lineOf = src.slice(0, m.index).split('\n').length;
  console.log(`\n=== hit#${n} offset=${m.index} line=${lineOf} len=${m[0].length} ===`);
  console.log(JSON.stringify(src.slice(s, e)));
  if (n >= maxHits) { console.log(`\n[stopped at maxHits=${maxHits}]`); break; }
  if (re.lastIndex === m.index) re.lastIndex++;
}
if (n === 0) console.log('NO MATCH');
else console.log(`\n[total shown ${Math.min(n, maxHits)}]`);
