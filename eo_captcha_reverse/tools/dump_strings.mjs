// dump_strings.mjs — decode obfuscator.io-style string table from tdc.decomp.js
// Usage: node tools/dump_strings.mjs [outJson]
import fs from 'node:fs';
import vm from 'node:vm';

const FILE = 'scripts/tdc.decomp.js';
const src = fs.readFileSync(FILE, 'utf8');

// 1) tail definitions: function _0xe969(){...} + function _0xc04f(...){...}
const defsStart = src.indexOf('function _0xe969(){');
const defsEnd = src.indexOf('joAqFyB$xo$64b57z(', defsStart);
if (defsStart < 0 || defsEnd < 0) throw new Error('table/decoder not found');
const defs = src.slice(defsStart, defsEnd);

// 2) the rotation IIFE that runs at load time
const rotStart = src.indexOf('(function(_0x23c8a2');
const rotEndMarker = '}(_0xe969,0x8f815';
const rotEnd = src.indexOf(rotEndMarker, rotStart);
const rotation = src.slice(rotStart, rotEnd + rotEndMarker.length) + '))';

const sandbox = { window: {}, console, parseInt, String, Number, Array, Math, Date, JSON };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs + '\n' + rotation, sandbox, { filename: 'table.js' });

const table = sandbox._0xe969();
console.log('table length =', table.length);
const out = {};
let bad = 0;
for (let i = 0x9d; i < 0x9d + table.length + 5; i++) {
  let v;
  try { v = vm.runInContext(`_0xc04f(${i})`, sandbox); } catch (e) { bad++; continue; }
  out[i.toString(16)] = v;
}
console.log('decoded entries =', Object.keys(out).length, 'misses =', bad);

// interesting-string report
const interesting = [];
const KEY = /TDC|getData|getInfo|setData|clearTc|token|Token|enc|Enc|key|Key|cipher|md5|sha|hmac|aes|chacha|poly|armor|sess|appid|app_data|js_data|collect|eks|tlg|randstr|navigator|screen|canvas|webgl|performance|localStorage|sessionStorage|cookie|fingerprint|userAgent|plugins|timezone|language/i;
for (const [hex, v] of Object.entries(out)) {
  if (typeof v !== 'string') continue;
  if (KEY.test(v)) interesting.push([hex, v.length > 160 ? v.slice(0, 160) + '…' : v]);
}
console.log('\n=== interesting strings (' + interesting.length + ') ===');
for (const [hex, v] of interesting) console.log('0x' + hex, JSON.stringify(v));

const outFile = process.argv[2];
if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(out, null, 0));
  console.log('\nwritten', outFile);
}
