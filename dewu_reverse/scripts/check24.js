/**
 * 验证 24：dw.init 抛 "reading 'name'"，用栈里的列号定位到源码偏移
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const fs = require('fs');
const path = require('path');
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const api = pceptor.load({});
  await sleep(120);
  const dw = api.sandbox.dw;
  try {
    dw.init({});
  } catch (e) {
    console.log('[err]', String(e && e.message));
    const stack = String(e && e.stack || '');
    console.log(stack.split('\n').slice(0, 8).join('\n'));
    const src = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');
    for (const m of stack.matchAll(/pceptor[^:]*:(\d+):(\d+)/g)) {
      const off = Number(m[2]);
      if (off > src.length) continue;
      console.log('\n--- @' + off + ' ---');
      console.log(src.slice(Math.max(0, off - 500), off + 300));
    }
  }
})();
