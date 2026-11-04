const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const root = path.join(__dirname, '..');
const input = process.argv[2] || path.join(root, 'sources', 'deob.js');
const output = process.argv[3] || path.join(root, 'sdk', 'deob.final.js');
const src = fs.readFileSync(input, 'utf8');

const tailMatch = src.match(/\}\)\('([^']+)'\);\s*$/s);
if (!tailMatch) throw new Error('未找到最外层 IIFE 的编码字符串参数');

function decodeStringTable(encoded) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+_=';
  const clean = encoded.replace(/[^A-Za-z0-9\+\/=]/g, '');
  let out = '';
  let i = 0;
  while (i < clean.length) {
    const c1 = alphabet.indexOf(clean.charAt(i++));
    const c2 = alphabet.indexOf(clean.charAt(i++));
    const c3 = alphabet.indexOf(clean.charAt(i++));
    const c4 = alphabet.indexOf(clean.charAt(i++));
    if (c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0) break;
    const b1 = (c1 << 2) | (c2 >> 4);
    const b2 = ((c2 & 15) << 4) | (c3 >> 2);
    const b3 = ((c3 & 3) << 6) | c4;
    out += String.fromCharCode(b1);
    if (c3 !== 64) out += String.fromCharCode(b2);
    if (c4 !== 64) out += String.fromCharCode(b3);
  }
  return decodeURIComponent(out).split('##');
}

const table = decodeStringTable(tailMatch[1]);
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', ranges: true, allowReturnOutsideFunction: true });

const binaryOps = new Map();
walk.full(ast, (node) => {
  if (node.type !== 'FunctionDeclaration' || !node.id || !node.id.name) return;
  const body = node.body && node.body.body;
  if (!body || body.length !== 1) return;
  const stmt = body[0];
  if (stmt.type !== 'ReturnStatement' || !stmt.argument) return;
  const expr = stmt.argument;
  if (!node.params || node.params.length !== 2) return;
  const [a, b] = node.params;
  if (a.type !== 'Identifier' || b.type !== 'Identifier') return;
  const check = (e) => e.left.type === 'Identifier' && e.right.type === 'Identifier' && e.left.name === a.name && e.right.name === b.name;
  if ((expr.type === 'BinaryExpression' || expr.type === 'LogicalExpression') && check(expr)) {
    binaryOps.set(node.id.name, expr.operator);
  }
});

const replacements = [];
walk.full(ast, (node) => {
  if (node.type === 'MemberExpression' && node.computed && node.object.type === 'Identifier' && node.object.name === 'Q0oQQ0') {
    let index = null;
    if (node.property.type === 'Literal' && typeof node.property.value === 'number') index = node.property.value;
    if (node.property.type === 'Literal' && typeof node.property.value === 'string' && /^\d+$/.test(node.property.value)) index = Number(node.property.value);
    if (node.property.type === 'Identifier' && /^\d+$/.test(node.property.name)) index = Number(node.property.name);
    if (Number.isInteger(index) && index >= 0 && index < table.length) {
      replacements.push({ start: node.start, end: node.end, text: JSON.stringify(table[index]) });
    }
    return;
  }
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && binaryOps.has(node.callee.name) && node.arguments.length === 2) {
    const op = binaryOps.get(node.callee.name);
    if (op === '&&' || op === '||') return;
    const a = src.slice(node.arguments[0].start, node.arguments[0].end);
    const b = src.slice(node.arguments[1].start, node.arguments[1].end);
    replacements.push({ start: node.start, end: node.end, text: `((${a}) ${op} (${b}))` });
  }
});

replacements.sort((x, y) => {
  const lenx = x.end - x.start;
  const leny = y.end - y.start;
  if (lenx !== leny) return lenx - leny;
  return y.start - x.start;
});

const chosen = [];
for (const rep of replacements) {
  let overlaps = false;
  for (const c of chosen) {
    if (!(rep.end <= c.start || rep.start >= c.end)) { overlaps = true; break; }
  }
  if (!overlaps) chosen.push(rep);
}
chosen.sort((x, y) => y.start - x.start);

let out = src;
for (const rep of chosen) {
  out = out.slice(0, rep.start) + rep.text + out.slice(rep.end);
}

out = out.replace(/^\(function \(Q0oQQ0\) \{/, '(function () {');
out = out.replace(/^\s*Q0oQQ0\s*=\s*ooQGOO\(Q0oQQ0\);\s*\n/m, '');
out = out.replace(/\}\)\('[^']*'\);\s*$/s, '})();');

const header = [
  '/*',
  ' * deob.final.js',
  ' * 自动反混淆结果: 字符串表替换 + 基础二元运算包装内联 + 最外层编码参数移除',
  ' * 未完全处理: 控制流平坦化、局部变量语义化重命名',
  ' */',
  ''
].join('\n');
out = header + out;
out = out.replace('function ooQGOO(QQ0OQ, QOoQQ) {', '/* 自定义编码/解码函数: 第二参数存在时做编码, 否则做字符串表解码 */\n    function ooQGOO(QQ0OQ, QOoQQ) {');
out = out.replace('function oQQQoQ() {', '/* 对外暴露 _fmOpt.sign 的安装逻辑 */\n    function oQQQoQ() {');
out = out.replace('_fmOpt["sign"] = function () {', '_fmOpt["sign"] = function () {\n        /* 入口: 输入 { path } , 输出 { code, sign, message } */');
out = out.replace('getDeviceInfo: function QO0oQ() {', 'getDeviceInfo: function QO0oQ() {\n                    /* SDK 对外接口: 异步返回设备指纹信息 */');

fs.writeFileSync(output, out, 'utf8');
console.log('[+] 字符串表长度:', table.length);
console.log('[+] 包装函数数:', binaryOps.size);
console.log('[+] 替换数:', chosen.length);
console.log('[+] 输出:', output);