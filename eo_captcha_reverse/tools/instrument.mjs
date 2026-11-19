// instrument.mjs — rewrite JSVMP dispatch handlers in tdc.decomp.js so
// "member get -> undefined" and "call of non-function" are logged with the base
// type + key instead of dying as a bare TypeError.
//   node tools/instrument.mjs  ->  scripts/tdc.inst.js
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../scripts/tdc.decomp.js', import.meta.url), 'utf8');
let out = src;
let n = 0;
function rep(from, to, tag) {
  const c = out.split(from).length - 1;
  if (c === 0) { console.log(`[miss] ${tag}`); return; }
  out = out.split(from).join(to);
  n += c;
  console.log(`[ok x${c}] ${tag}`);
}

const A = '_0x55328b[_0x9acbcc[++_0x20531c]]';
const I = '_0x9acbcc[++_0x20531c]';

// 0x14: A = B[immKey]
rep(`${A}=${A}[_0x9acbcc[++_0x20531c]]`, `${A}=__get(${A},${I},0x14)`, 'opcode 0x14 static member get');
// 0x2b: A = B[C]
rep(`${A}=${A}[_0x55328b[${I}]]`, `${A}=__get(${A},_0x55328b[${I}],0x2b)`, 'opcode 0x2b dynamic member get');
// 0x27: A = B['call'](C, D)
rep(`${A}=${A}['call'](${A},${A})`, `${A}=__call(${A},${A},${A},0x27)`, 'opcode 0x27 call with this');
// 0x17: A = A['call'](globalThis)
rep(`${A}=${A}['call'](_0x3ab2e1)`, `${A}=__call(${A},_0x3ab2e1,void 0,0x17)`, 'opcode 0x17 call');
// 0x33: A = A['call'](globalThis, B)
rep(`${A}=${A}['call'](_0x3ab2e1,${A})`, `${A}=__call(${A},_0x3ab2e1,${A},0x33)`, 'opcode 0x33 call 1arg');
// 0x11 / 0x23 / 0x2c use String.fromCharCode-free 'call' via table 0xb0 -> leave intact

// dispatch hook: record (opcode, ip) + hand the instruction array to the host
rep(
  '_0x55328b[_0x9acbcc[++_0x20531c]]=__get(',
  '_0x55328b[_0x9acbcc[++_0x20531c]]=__get(',
  'noop guard',
);
const SW = 'switch(_0x9acbcc[++_0x20531c])';
const swCount = out.split(SW).length - 1;
if (swCount) {
  out = out.split(SW).join('switch((__op(_0x9acbcc[_0x20531c+0x1],_0x20531c,_0x9acbcc),_0x9acbcc[++_0x20531c]))');
  console.log(`[ok x${swCount}] dispatch hook`);
  n += swCount;
} else {
  console.log('[miss] dispatch hook');
}

fs.writeFileSync(new URL('../scripts/tdc.inst.js', import.meta.url), out);
console.log(`rewritten handlers: ${n}; out=${out.length} chars`);
