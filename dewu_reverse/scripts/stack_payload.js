/**
 * 在同一 context 里按真实顺序执行"已解码 payload"（跳过 JSDUN 自解码那层），
 * 看模块注册表是否跨脚本共享，以及最终挂出什么全局。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createLegacyContext } = require('./legacy_sandbox.js');

const ROOT = path.resolve(__dirname, '..');
const ctxInfo = createLegacyContext({});
const { sb, ctx } = ctxInfo;

// 业务 chunk 也参与吗？先只跑三个 SDK
const order = ['preinforce2', 'pceptor', 'pyuntu'];
let globalsBefore = new Set(Object.keys(sb));
for (const name of order) {
  const p = path.join(ROOT, 'artifacts/unpacked/' + name + '.000.eval.js');
  const src = fs.readFileSync(p, 'utf8');
  const before = new Set(Object.keys(sb));
  try {
    vm.runInContext(src, ctx, { filename: name + '.payload.js', timeout: 40000 });
    console.log('[' + name + '] OK');
  } catch (e) {
    console.log('[' + name + '] THROW', String(e.message).slice(0, 160));
    const st = String(e.stack || '').split('\n').slice(0, 3).join(' | ');
    console.log('   ', st.slice(0, 300));
  }
  console.log('   new globals:', JSON.stringify(Object.keys(sb).filter(k => !before.has(k))));
}
console.log('\nfinal globals:', JSON.stringify(Object.keys(sb).filter(k => !globalsBefore.has(k))));
