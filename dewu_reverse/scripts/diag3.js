/**
 * 诊断 3：
 *  1) 捕获运行时字符串表（看是否被解码/重排）
 *  2) 打印 SDK 初始化期间自己发出的请求（open/setRequestHeader/send）
 *  3) 宽容化 defineProperty 后能否构造包装 XHR，并跑一次 open/send
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('../src/env');

const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
let code = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');

// 捕获表：在数组字面量前后插入赋值
const marker = ",typeof window!='undefined'";
const mi = code.indexOf(marker);
const endBracket = code.lastIndexOf(']', mi);
let depth = 0, start = -1;
for (let i = endBracket; i >= 0; i--) {
  if (code[i] === ']') depth++;
  else if (code[i] === '[') { depth--; if (depth === 0) { start = i; break; } }
}
code = code.slice(0, start) + 'globalThis.__TABLE=(' + code.slice(start, endBracket + 1) + ')' + code.slice(endBracket + 1);

const env = makeEnv({});
const { sandbox, ctx } = env;
const baseline = new Set(Object.keys(sandbox));

const origDP = Object.defineProperty;
let swallow = 0;
Object.defineProperty = function (t, k, d) {
  try { return origDP(t, k, d); } catch (e) {
    if (/Cannot redefine property/.test(String(e && e.message))) { swallow++; return t; }
    throw e;
  }
};
let threw = null;
try {
  vm.runInContext(code, ctx, { filename: 'pceptor', timeout: 30000 });
  console.log('[OK] executed');
} catch (e) {
  threw = e;
  console.log('[THROW]', String(e && e.message).slice(0, 200));
}
console.log('[swallowed defineProperty]', swallow);
console.log('[new globals]', Object.keys(sandbox).filter(k => !baseline.has(k)).join(', '));

const T = sandbox.__TABLE;
console.log('[table] len', T && T.length);
if (T) console.log('  [1440..1490]', T.slice(1440, 1491).join(','));
if (T) console.log('  [1451]=', T[1451], ' [1457]=', T[1457], ' [5278]=', T[5278]);

console.log('\n[SDK 自己的请求]');
for (const ev of env.recorder.events) {
  const a = ev.args.map(x => (typeof x === 'string' ? x.slice(0, 160) : JSON.stringify(x))).join(' | ');
  console.log('  ', ev.kind, '#' + ev.id, a);
}
console.log('[native instances]', env.recorder.instances.map(i => '#' + i.__id + ' ' + i.__method + ' ' + String(i.__url).slice(0, 80)));

console.log('\n=== new XMLHttpRequest() ===');
try {
  const x = new sandbox.XMLHttpRequest();
  console.log(' ok. own props count:', Object.getOwnPropertyNames(x).length);
  console.log(' own props:', Object.getOwnPropertyNames(x).slice(0, 40).map(String).join(','));
  console.log(' typeof open/send/setRequestHeader:', typeof x.open, typeof x.send, typeof x.setRequestHeader);
} catch (e) {
  console.log(' threw:', String(e && e.message));
}
Object.defineProperty = origDP;
