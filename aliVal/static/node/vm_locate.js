// vm_locate.js — find the bytecode array, the constants pool W, and the call that
// feeds them to the stack-machine interpreter D (pe.081:210257).
const fs = require('fs');
const P = '../bundles/pe.081.a2ede546e341a1b9.js';
const src = fs.readFileSync(P, 'utf8');

// 1) start of W
const iW = src.indexOf('W=["o","r","a","m","C","e","f","i","p","h');
console.log('W array starts at', iW);

// 2) the numeric array that ends right before `,W=[`
let p = iW;
while (p > 0 && src[p] !== '[') p--;
// p is at '[' of ...? careful: the char right before iW is ',' then ']' of previous array
// find the ']' immediately before iW
let q = iW - 1;
while (q > 0 && src[q] !== ']') q--;
console.log('previous array closes at', q, ' char before it:', JSON.stringify(src[q - 12]));
// now find its matching '['
let depth = 0, r2 = q;
for (; r2 > 0; r2--) {
  const c = src[r2];
  if (c === '"') { // skip string backwards
    r2--; while (r2 > 0 && src[r2] !== '"') { if (src[r2 - 1] === '\\') r2 -= 2; else r2--; } continue;
  }
  if (c === ']') depth++;
  else if (c === '[') { depth--; if (depth === 0) break; }
}
console.log('bytecode array opens at', r2, ' length', q - r2);
console.log('context before it:', JSON.stringify(src.slice(r2 - 120, r2 + 80)));

// 3) what variable name is it assigned to?
const nameMatch = src.slice(Math.max(0, r2 - 40), r2).match(/([A-Za-z_$][\w$]*)=$/);
console.log('assigned to:', nameMatch && nameMatch[1]);

// 4) find call sites of the interpreter: look for the identifier D used as callee
const refs = [];
const re = /(^|[^A-Za-z0-9_$.])D\(/g;
let m;
while ((m = re.exec(src))) refs.push(m.index + m[1].length);
console.log('\n"D(" call sites:', refs.length);
for (const rr of refs) console.log('   ', rr, '|', JSON.stringify(src.slice(rr - 100, rr + 100)));

// 5) also report whether the bytecode array / W names appear elsewhere
if (nameMatch) {
  const nm = nameMatch[1];
  const re2 = new RegExp('(^|[^A-Za-z0-9_$.])' + nm.replace(/\$/g, '\\$') + '\\b', 'g');
  const hits = [];
  let m2;
  while ((m2 = re2.exec(src))) hits.push(m2.index + m2[1].length);
  console.log(`\nreferences to '${nm}':`, hits.length, hits.slice(0, 20));
}
