// jsvmp_extract.js — pull the bytecode array, char pool W and the 256-table out of
// pe.081 around 262646..264414, then find who consumes them.
const fs = require('fs');
const P = '../bundles/pe.081.a2ede546e341a1b9.js';
const src = fs.readFileSync(P, 'utf8');

const iW = src.indexOf('W=["o","r","a","m","C","e","f","i","p","h');
console.log('W pool starts at', iW);
// W = [ ... ] : walk to matching ]
let j = src.indexOf('[', iW);
let depth = 0, k = j;
for (; k < src.length; k++) {
  const c = src[k];
  if (c === '"') { k++; while (k < src.length && src[k] !== '"') { if (src[k] === '\\') k++; k++; } continue; }
  if (c === '[') depth++;
  else if (c === ']') { depth--; if (depth === 0) { k++; break; } }
}
const wLiteral = src.slice(j, k);
const W = JSON.parse(wLiteral);
console.log('W length', W.length);
console.log('W as JSON head:', JSON.stringify(W.slice(0, 24)));
const nums = W.filter(x => typeof x === 'number');
const strs = W.filter(x => typeof x === 'string');
console.log('numeric entries', nums.length, 'string entries', strs.length);
console.log('strings:', JSON.stringify(strs));
console.log('numeric: min', Math.min(...nums), 'max', Math.max(...nums), 'count', nums.length);
const sorted = [...nums].sort((a, b) => a - b);
const isPerm = sorted.length === 256 && sorted.every((v, i) => v === i);
console.log('numeric part is a permutation of 0..255 ?', isPerm);

// what follows W ?
const after = src.slice(k, k + 700);
console.log('\nafter W:', after.slice(0, 700));

// who references W? (identifier W inside the module)
let refs = [];
for (let idx = src.indexOf('W', 260000); idx !== -1 && idx < 268000; idx = src.indexOf('W', idx + 1)) {
  const prev = src[idx - 1] || '';
  const next = src[idx + 1] || '';
  if (/[A-Za-z0-9_$]/.test(prev) || /[A-Za-z0-9_$]/.test(next)) continue;
  refs.push(idx);
}
console.log('\nbare W references in 260k-268k:', refs);
for (const r of refs) console.log('   ', r, '|', JSON.stringify(src.slice(r - 60, r + 60)));
