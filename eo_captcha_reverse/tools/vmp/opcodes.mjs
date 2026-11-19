// opcodes.mjs — 从分发器源码静态导出 opcode 表（编号 → 分支代码 + 操作数个数 + 语义特征）
// 用法: node tools/vmp/opcodes.mjs <foldedFile> <outJson>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require('D:/ds_work/dsh-src/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn/dist/acorn.js');

const [foldedFile, outJson] = process.argv.slice(2);
const src = fs.readFileSync(foldedFile, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

// 找分发器：switch(L[++IP]) 且 case 数 > 50
let sw = null, ipName = null, codeName = null, regName = null;
(function walk(n) {
  if (!n || typeof n.type !== 'string' || sw) return;
  if (n.type === 'SwitchStatement' && n.cases.length > 50) { sw = n; return; }
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v.type === 'string') walk(v);
  }
})(ast);
if (!sw) throw new Error('dispatcher switch not found');
const disc = src.slice(sw.discriminant.start, sw.discriminant.end);
console.log('[dispatcher] discriminant =', disc, '@', sw.discriminant.start, 'cases', sw.cases.length);
// discriminant 形如 _0x4c0e0b[++_0x3599db]
let m = /^(_0x[0-9a-f]+)\[\+\+(_0x[0-9a-f]+)\]$/.exec(disc);
if (!m) throw new Error('unexpected discriminant shape: ' + disc);
codeName = m[1]; ipName = m[2];
console.log('[dispatcher] code array =', codeName, ' ip var =', ipName);

// 寄存器数组名：case 体里形如 REG[code[++ip]] = …
const firstBody = src.slice(sw.cases[0].consequent[0].start, sw.cases[0].consequent[0].end);
m = /^(_0x[0-9a-f]+)\[/.exec(firstBody);
regName = m ? m[1] : null;
console.log('[dispatcher] register array =', regName, ' first case body:', firstBody.slice(0, 80));

const incPat = new RegExp('\\+\\+' + ipName, 'g');
const rows = [];
for (const c of sw.cases) {
  const body = src.slice(c.start, c.end);
  const op = c.test ? c.test.value : null;
  const stmts = c.consequent.map(s => src.slice(s.start, s.end));
  const bodyText = stmts.join(';');
  const incs = (bodyText.match(incPat) || []).length;
  // 是否递归进入子 VM（case 0xb/0x17/0x21 把控制权交给 _0x1869b7）
  const reentry = /_0x1869b7\(/.test(bodyText);
  rows.push({ op, opHex: '0x' + op.toString(16), fileOffset: c.start, incs, reentry, body: bodyText, bodyLen: bodyText.length });
}
console.log('[dispatcher] opcodes', rows.length, 'min', rows[0].opHex, 'max', rows[rows.length - 1].opHex);

// 静态语义特征标注（基于分支代码形态，不猜）
const FEAT = [
  ['arith.add', /_0xa6a858\[[^\]]+\]\+_0xa6a858\[|\+_0x4c0e0b\[/],
  ['arith.sub', /-_0x4c0e0b\[|-_0xa6a858\[/],
  ['arith.mul', /\*_0xa6a858\[|_0x16269d\['CoIku'\]/],
  ['arith.div', /\/_0xa6a858\[/],
  ['arith.mod', /_0x16269d\['pgSFx'\]/],
  ['bit.and', /&_0x4c0e0b\[|_0x338b61\['TSQPE'\]|_0x338b61\['maTpg'\]/],
  ['bit.or', /\|_0x4c0e0b\[|\|_0xa6a858\[/],
  ['bit.xor', /\^_0xa6a858\[/],
  ['bit.shl', /<<_0x4c0e0b\[|<<_0xa6a858\[|_0x338b61\['sRvxX'\]|_0x338b61\['xIFdE'\]/],
  ['bit.shr', />>_0xa6a858\[|>>_0x4c0e0b\[/],
  ['bit.ushr', />>>_0x4c0e0b\[/],
  ['cmp.', /[<>=!]=|_0x338b61\['tnZhO'\]|_0x338b61\['tunOs'\]|_0x338b61\['yaXnr'\]|_0x338b61\['sXlAi'\]/],
  ['prop.read', /\]\[_0xa6a858\[|\]\[_0x4c0e0b\[/],
  ['prop.write', /_0xa6a858\[_0x4c0e0b\[[^\]]+\]\]\[/],
  ['call', /\['call'\]\(|'apply'\]\(|_0x1869b7\(/],
  ['str.fromCharCode', /fromCharCode/],
  ['jump', new RegExp('\\+=\\s*_0x4c0e0b\\[|' + ipName)],
  ['defineProperty', /defineProperty/],
  ['delete', /delete /],
  ['throw', /throw /],
  ['typeof', /typeof /],
  ['new', /new _0xa6a858\[/],
];
for (const r of rows) {
  r.features = FEAT.filter(([name, re]) => re.test(r.body)).map(([name]) => name);
}

// ---------- 语义角色（按分支代码形态判定，跨 build 可迁移） ----------
const C = codeName, G = regName || '_0xa6a858';
const RX = (s) => new RegExp(s);
// 寄存器数组：出现最多的 `X[code[++ip]]` 形态
if (!regName) {
  const cnt = new Map();
  for (const r of rows) {
    for (const m of r.body.matchAll(new RegExp('(_0x[0-9a-f]+)\\[\\(?' + codeName + '\\[\\+\\+' + ipName + '\\]', 'g'))) {
      cnt.set(m[1], (cnt.get(m[1]) || 0) + 1);
    }
  }
  regName = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  regName = regName ? regName[0] : null;
  console.log('[dispatcher] register array (detected) =', regName);
}

// ---------- 语义角色：先把 concrete 名字归一化，再按形态判定（跨 build 可迁移） ----------
function normalize(b) {
  let s = b;
  if (codeName) s = s.split(codeName).join('@C');
  if (regName) s = s.split(regName).join('@G');
  if (ipName) s = s.split(ipName).join('@I');
  return s.replace(/\s+/g, '');
}
const has = (s, t) => s.indexOf(t) !== -1;
function role(r) {
  const b = normalize(r.body);
  const nChar = (b.match(/fromCharCode/g) || []).length;
  const dynRead = has(b, '][@G[@C[++@I]]]');
  const immRead = /\]\[@C\[\+\+@I\]\]/.test(b);
  const write = /^@G\[@C\[\+\+@I\]\]\[(?:@G\[@C\[\+\+@I\]\]|@C\[\+\+@I\])\]=/.test(b);
  const callLike = has(b, "['call'](") || has(b, '["call"](') || has(b, "['apply'](") || has(b, '["apply"](');
  const reentry = /_0x[0-9a-f]+\(@I\+@C\[\+\+@I\]/.test(b) || /@G\[@C\[\+\+@I\]\]=_0x[0-9a-f]+\(@I\+/.test(b);

  if (reentry) return nChar ? 'STR_APP_THEN_REENTRY' : 'CALL_REENTRY';
  if (nChar) {
    if (nChar === 2) return 'STR_APP2';
    if (has(b, "@G[@C[++@I]]=''") && has(b, '@G[@C[++@I]]+=')) return 'STR_INIT_APP';
    if (callLike) return 'STR_APP_THEN_CALL';
    if (dynRead) return 'STR_APP_THEN_READ';
    if (write) return 'STR_APP_THEN_WRITE';
    if (has(b, '@G[@C[++@I]]={}')) return 'STR_APP_THEN_OBJ';
    return 'STR_APP';
  }
  if (has(b, "@G[@C[++@I]]=''") && r.incs === 1) return 'STR_INIT';
  if (write) return 'PROP_WRITE_DYN';
  if (dynRead && /^@G\[@C\[\+\+@I\]\]=@G\[@C\[\+\+@I\]\]\[@G\[@C\[\+\+@I\]\]\]/.test(b)) return 'PROP_READ_DYN';
  if (immRead && /^@G\[@C\[\+\+@I\]\]=@G\[@C\[\+\+@I\]\]\[@C\[\+\+@I\]\]/.test(b)) return 'PROP_READ_IMM';
  if (callLike) return 'CALL';
  if (/^@I\+=@C\[\+\+@I\]\?/.test(b) || /^@I\+=@G\[@C\[\+\+@I\]\]\?/.test(b)) return 'JMP_IF';
  if (/^@I\+=@C\[\+\+@I\]/.test(b)) return 'JMP';
  if (/\)\?@C\[\+\+@I\]:@C\[\+\+@I\]/.test(b)) return 'JMP_IF';
  if (has(b, '["push"](@I+@C[++@I])')) return 'CALL_PUSH';
  if (/^throw/.test(b)) return 'THROW';
  if (/^return/.test(b)) return 'RET';
  if (/\["pop"\]\(\)/.test(b)) return 'RET_POP';
  if (has(b, 'typeof')) return 'TYPEOF_MIX';
  if (has(b, 'delete ')) return 'PROP_DELETE';
  if (/^@G\[@C\[\+\+@I\]\]=new/.test(b)) return 'ALLOC_NEW';
  if (/^@G\[@C\[\+\+@I\]\]=\{/.test(b) || /^@G\[@C\[\+\+@I\]\]=Array\(/.test(b) || /^@G\[@C\[\+\+@I\]\]=null/.test(b)) return 'ALLOC';
  if (/^@G\[@C\[\+\+@I\]\]=@G\[@C\[\+\+@I\]\];?$/.test(b)) return 'MOV';
  if (/^@G\[@C\[\+\+@I\]\]=@C\[\+\+@I\]/.test(b)) return 'LOAD_IMM';
  if (/^@G\[@C\[\+\+@I\]\]=[!~+-]@G\[/.test(b)) return 'UNARY';
  if (/(\^|<<|>>>|>>|\||&)/.test(b)) return 'BITOP';
  if (/(===|==|>=|<=|<|>)/.test(b)) return 'CMP';
  if (/(\+|-|\*|\/|%)/.test(b)) return 'ARITH';
  return 'OTHER';
}
for (const r of rows) r.role = role(r);
fs.writeFileSync(outJson, JSON.stringify({ file: foldedFile, codeArray: codeName, ipVar: ipName, regArray: regName, opcodes: rows }, null, 1));
console.log('[out]', outJson);
for (const r of rows) console.log(r.opHex.padEnd(5), 'incs=' + String(r.incs).padStart(2), (r.reentry ? 'REENTRY ' : '        '), r.body.slice(0, 150).replace(/\s+/g, ' '));
