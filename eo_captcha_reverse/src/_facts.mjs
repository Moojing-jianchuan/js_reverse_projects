// src/_facts.mjs — 三份 build 的静态事实表（helper 签名对比 + 解码交叉验证）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require('D:/ds_work/dsh-src/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn/dist/acorn.js');

const BUILDS = [
  { name: 'mix_tdc.js', src: 'samples/mix_tdc.js', folded: 'src/_vmp/mix_tdc.folded.js' },
  { name: 'cur_tdc.js', src: 'samples/cur_tdc.js', folded: 'src/_vmp/cur_tdc.folded.js' },
  { name: 'capture11_tdc.js', src: 'samples/capture11_tdc.js', folded: 'src/_vmp/capture11_tdc.folded.js' },
];

for (const b of BUILDS) {
  const srcRaw = fs.readFileSync(b.src, 'utf8');
  const folded = fs.readFileSync(b.folded, 'utf8');
  const ast = acorn.parse(folded, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
  const funcs = [], vars = new Map();
  let switchCases = 0;
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') && n.id) funcs.push({ name: n.id.name, text: folded.slice(n.start, n.end) });
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) vars.set(n.id.name, n.init);
    if (n.type === 'SwitchStatement' && n.cases.length > switchCases) switchCases = n.cases.length;
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(ast);

  // bootstrap
  let boot = null, entry = null;
  (function find(n) {
    if (!n || typeof n.type !== 'string') return;
    if (!boot && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.arguments[0]
      && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string' && n.arguments[0].value.length > 50000) boot = n;
    if (entry === null && n.type === 'CallExpression' && n.arguments.length >= 5 && n.arguments[0].type === 'Literal'
      && typeof n.arguments[0].value === 'number' && n.arguments[1].type === 'ArrayExpression') entry = n.arguments[0].value;
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(find); else if (v && typeof v.type === 'string') find(v); }
  })(ast);

  const tdcName = (srcRaw.match(/TDC_NAME\s*=\s*"([^"]+)"/) || [])[1];
  const rangeHit = funcs.find(f => /=\[\],_0x[0-9a-f]+=0x0;while\(/.test(f.text));
  const oldB64 = funcs.find(f => /ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.test(f.text));
  const decHit = funcs.find(f => /Int8Array/.test(f.text));
  let tblName = null;
  for (const [n, init] of vars) {
    const t = folded.slice(init.start, init.end);
    if (/concat/.test(t) && rangeHit && t.includes(rangeHit.name) && t.length < 4000) { tblName = n; break; }
  }
  const newB64 = tblName ? funcs.find(f => new RegExp('\\b' + tblName + '\\[').test(f.text) && /charCodeAt|replace/.test(f.text)) : null;

  // 用新签名在隔离 vm 里解码，并和运行期 int 流对齐
  const b64Arg = boot.arguments[0].value;
  const helpers = [rangeHit, newB64, decHit].filter(Boolean);
  const stub = funcs.filter(f => !helpers.some(h => h.name === f.name)).map(f => 'var ' + f.name + '=function(){};').join('\n');
  const mod = [stub, rangeHit ? rangeHit.text : '', newB64 ? newB64.text : '', decHit ? decHit.text : '',
    tblName ? 'var ' + tblName + '=' + folded.slice(vars.get(tblName).start, vars.get(tblName).end) + ';' : '',
    ';({ dec: ' + (decHit && decHit.name) + ', table: ' + tblName + ' });'].join('\n');
  let intsLen = -1, intsHead = '';
  try {
    const ctx = vm.createContext({ Int8Array, Uint8Array, String, Number, Array, Math });
    const hp = vm.runInContext(mod, ctx, { filename: 'h.js' });
    const ints = hp.dec(b64Arg);
    intsLen = ints.length; intsHead = ints.slice(0, 8).join(',');
  } catch (e) { intsHead = 'ERR ' + e.message; }

  console.log(JSON.stringify({
    build: b.name, srcChars: srcRaw.length, foldedChars: folded.length,
    tdcName, b64len: b64Arg.length, entry: '0x' + entry.toString(16), switchCases,
    rangeHit: rangeHit && rangeHit.name,
    oldB64Hit: oldB64 ? oldB64.name : 'NOT FOUND',
    decHit: decHit && decHit.name,
    tblVar: tblName, newB64Hit: newB64 ? newB64.name : 'NOT FOUND',
    decodedInts: intsLen, intsHead,
  }));
}
