/**
 * 跑 dw.init，把栈里每个帧的 (line:col) 换算成偏移并打印上下文，定位环境缺口
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const fs = require('fs');
const path = require('path');
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');

function line2off(s, line, col) {
  let off = 0, ln = 1;
  while (ln < line) {
    const m = /[\u2028\u2029\r\n]/.exec(s.slice(off));
    if (!m) break;
    off = off + m.index + 1;
    ln++;
  }
  return off + col;
}

(async () => {
  const api = pceptor.load({});
  await sleep(120);
  const s = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');
  const dw = api.sandbox.dw;
  try {
    dw.init({});
    console.log('[init ok]');
  } catch (e) {
    console.log('[err]', String(e && e.message));
    const frames = [...String(e.stack || '').matchAll(/(\S*\.eval\.js):(\d+):(\d+)/g)].slice(0, 4);
    for (const m of frames) {
      const off = line2off(s, Number(m[2]), Number(m[3]));
      console.log('\n=== frame line', m[2], 'col', m[3], '-> offset', off, '===');
      console.log(s.slice(Math.max(0, off - 350), off + 150));
    }
  }
})();
