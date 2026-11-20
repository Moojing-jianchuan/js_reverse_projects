/**
 * 让 pceptor 自己跑一遍初始化（真发 dav.dewu.com 的 /interceptor 与 /webSk），
 * 抓：请求 URL / 头（dsn）/ body、响应原文、以及 SDK 写回了什么（cookie / localStorage）。
 *
 * 用法：
 *   node scripts/pceptor_live.js            # 只加载，看是否自动触发
 *   node scripts/pceptor_live.js --call <fn>  # 加载后手动调用某个全局初始化入口
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const env = createEnv({ blockNetwork: false, traceReads: false });
const w = env.window;

const log = [];
const origFetch = w.fetch;
w.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  const rec = { kind: 'fetch', url, method: (init && init.method) || 'GET', headers: (init && init.headers) || null, body: init && init.body };
  log.push(rec);
  return origFetch.apply(this, arguments).then(async res => {
    try {
      const text = await res.clone().text();
      rec.status = res.status;
      rec.responseText = text;
    } catch (e) { rec.cloneErr = String(e.message); }
    return res;
  });
};

// 记录 cookie / storage 写入
const setItemOrig = w.Storage.prototype.setItem;
w.Storage.prototype.setItem = function (k, v) {
  log.push({ kind: 'storage.setItem', key: String(k), value: String(v).slice(0, 200) });
  return setItemOrig.apply(this, arguments);
};

env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pceptor.js'), 'utf8'), 'pceptor.js');
console.log('pceptor 加载完成；新增全局:', JSON.stringify(env.globals().added));

// 看看有哪些可疑入口
for (const k of ['_yundunxhr', 'dw', 'dwCap', 'dewuCap', 'yundun', 'init']) {
  if (w[k] !== undefined) console.log('  window.' + k, '=', typeof w[k]);
}

setTimeout(() => {
  console.log('\n=== 网络/存储事件（' + log.length + '）===');
  for (const r of log) {
    if (r.kind === 'storage.setItem') { console.log('  [storage]', r.key, '=', r.value); continue; }
    console.log('  [fetch]', r.method, r.url);
    if (r.headers) console.log('    headers:', JSON.stringify(r.headers).slice(0, 400));
    if (r.body) console.log('    bodyLen:', String(r.body).length, '| body:', String(r.body).slice(0, 300));
    if (r.responseText) console.log('    respLen:', r.responseText.length, '| resp:', String(r.responseText).slice(0, 300));
  }
  console.log('\ndocument.cookie:', String(w.document.cookie).slice(0, 300));
  try { console.log('localStorage keys:', Object.keys(w.localStorage)); } catch (e) { }
  env.dispose();
  process.exit(0);
}, 4000);
