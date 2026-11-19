// ast_overview.mjs — acorn 顶层结构总览（纯静态，无网络）
// 用法: node tools/vmp/ast_overview.mjs <file>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ACORN = 'D:/ds_work/dsh-src/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn/dist/acorn.js';
const acorn = require(ACORN);

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const t0 = Date.now();
const ast = acorn.parse(src, {
  ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true, allowHashBang: true, preserveParens: false,
});
console.log('parse ok in', Date.now() - t0, 'ms; top-level statements =', ast.body.length);

function preview(node) {
  const s = src.slice(node.start, Math.min(node.end, node.start + 90)).replace(/\n/g, ' ');
  return JSON.stringify(s);
}
for (const st of ast.body) {
  let name = '';
  if (st.type === 'FunctionDeclaration') name = st.id.name;
  else if (st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression') name = 'CALL';
  else if (st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression') {
    name = 'ASSIGN_LHS@' + st.expression.left.start;
  } else if (st.type === 'VariableDeclaration') name = 'VAR ' + st.declarations.map(d => d.id.name).join(',');
  else if (st.type === 'IfStatement') name = 'IF';
  console.log(
    String(st.start).padStart(7), '→', String(st.end).padStart(7),
    '(' + String(st.end - st.start).padStart(7) + ')',
    st.type.padEnd(22), name.padEnd(26), preview(st).slice(0, 110));
}
