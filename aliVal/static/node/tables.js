// tables.js — extract both custom base64 tables (pe.081 key 139, feilin076 key 68)
const fs = require('fs');
const P = '../bundles/pe.081.a2ede546e341a1b9.js';
const F = '../bundles/feilin076.dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1.js';

const src = fs.readFileSync(P, 'utf8');
const i = src.indexOf('function rv(t,n){var e=[');
const seg = src.slice(i, i + 400000);
const m = seg.match(/var a="([0-9a-f]+)"/);
const hex = m[1];
console.log('pe.081 table          :', hex.length / 2, 'bytes');
console.log(hex);
const A = hex.match(/.{1,2}/g).map(h => parseInt(h, 16));
const ALPHA = A.map(v => String.fromCharCode(139 ^ v)).join('');
console.log('pe.081 alphabet (' + ALPHA.length + '):', JSON.stringify(ALPHA));
const alph2 = A.map(v => String.fromCharCode(139 ^ v));
const uniq = new Set(alph2);
console.log('distinct alphabet chars:', uniq.size);
const dup = alph2.filter((c, k) => alph2.indexOf(c) !== k);
console.log('duplicates:', JSON.stringify(dup));

const f = fs.readFileSync(F, 'utf8');
const j = f.indexOf('142e0a3077253d0d');
const hex2 = f.slice(j, f.indexOf('"', j));
console.log('\nfeilin076 table       :', hex2.length / 2, 'bytes');
console.log(hex2);
const B = hex2.match(/.{1,2}/g).map(h => parseInt(h, 16));
const AL2 = B.map(v => String.fromCharCode(68 ^ v));
console.log('feilin076 alphabet (' + AL2.length + '):', JSON.stringify(AL2.join('')));
console.log('distinct:', new Set(AL2).size);
console.log('duplicates:', JSON.stringify(AL2.filter((c, k) => AL2.indexOf(c) !== k)));
