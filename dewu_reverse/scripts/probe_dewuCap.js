/**
 * 试探 dewuCap 的调用契约 —— 抓它是否发起 captcha 请求、是否产出 d/sign
 * 用法: node scripts/probe_dewuCap.js [参数JSON]
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const env = createEnv({ blockNetwork: true, traceReads: false });
env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
const w = env.window;

console.log('dewuCap typeof:', typeof w.dewuCap, 'length:', w.dewuCap && w.dewuCap.length);

const argText = process.argv[2] || '{}';
let arg;
try { arg = JSON.parse(argText); } catch (e) { arg = argText; }
console.log('调用参数:', JSON.stringify(arg));

const beforeLog = env.netLog.length;
let ret, err;
try {
  ret = w.dewuCap(arg);
} catch (e) {
  err = e;
}
console.log('同步返回:', ret === undefined ? 'undefined' : (typeof ret === 'object' ? JSON.stringify(ret).slice(0, 400) : String(ret).slice(0, 400)));
if (err) console.log('同步异常:', err.constructor.name, '-', String(err.message).slice(0, 300));

setTimeout(() => {
  console.log('\n--- 1.2s 后的观测 ---');
  console.log('netLog 新增:', env.netLog.length - beforeLog);
  for (const n of env.netLog.slice(beforeLog)) {
    console.log('  REQ', n.method || '?', n.url || n, '| body:', JSON.stringify(String(n.body || '').slice(0, 200)));
  }
  // 看看有没有挂到 window 上的新东西
  const g = env.globals();
  console.log('globals added:', g.added, 'changed:', g.changed);
  console.log('document.cookie:', String(w.document.cookie).slice(0, 200));
  try {
    const keys = ['dewuCap', 'fun', 'yuntuSession'];
    for (const k of keys) console.log(` localStorage[${k}] =`, w.localStorage.getItem(k));
  } catch (e) { }
  env.dispose();
  process.exit(0);
}, 1200);
