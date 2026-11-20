/**
 * 诊断 4：用 SDK 的包装 XHR 走一次真实请求流程，看它改写成什么（header/body/URL）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('../src/env');

const ROOT = 'D:/ds_work/js_reverse_projects/dewu_reverse';
const code = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');

const env = makeEnv({});
const { sandbox, ctx } = env;
const baseline = new Set(Object.keys(sandbox));

const origDP = Object.defineProperty;
Object.defineProperty = function (t, k, d) {
  try { return origDP(t, k, d); } catch (e) {
    if (/Cannot redefine property/.test(String(e && e.message))) return t;
    throw e;
  }
};
try {
  vm.runInContext(code, ctx, { filename: 'pceptor', timeout: 30000 });
  console.log('[OK] executed');
} catch (e) { console.log('[THROW]', String(e && e.message).slice(0, 200)); }
Object.defineProperty = origDP;

console.log('[globals]', Object.keys(sandbox).filter(k => !baseline.has(k)).join(', '));
console.log('[cookie]', env.jar.cookie);
console.log('[storage]', [...env.store.entries()].map(([k, v]) => k + '=' + String(v).slice(0, 80)));
console.log('[console]'); for (const [l, t] of env.consoleLog.slice(0, 40)) console.log('  ', l, t.slice(0, 220));
console.log('[native instances at init]', env.recorder.instances.map(i => '#' + i.__id));

const W = sandbox.XMLHttpRequest;
console.log('[wrapper]', typeof W, 'proto === native proto?', W.prototype === env.sandbox.__protoCheck);

// 驱动一次
const x = new W();
const inner = [];
env.recorder.onSend = n => inner.push({ id: n.__id, method: n.__method, url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body });

const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
console.log('\n[plain]', plain, '| md5(plain)=', require('crypto').createHash('md5').update(plain).digest('hex'));

try {
  x.open('POST', 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info', true);
  console.log('[after open] readyState=', x.readyState);
  x.setRequestHeader('Content-Type', 'application/json');
  x.send(plain);
  console.log('[after send] readyState=', x.readyState);
} catch (e) {
  console.log('[flow throw]', String(e && e.message));
  console.log(String(e && e.stack || '').split('\n').slice(0, 8).join('\n'));
}
console.log('\n[inner native send]', JSON.stringify(inner, null, 1).slice(0, 4000));
console.log('\n[recorder events]');
for (const ev of env.recorder.events.slice(-30)) console.log('  ', ev.kind, '#' + ev.id, ev.args.map(a => String(a).slice(0, 200)).join(' | '));

// 模拟响应回来
console.log('\n=== 注入响应（不加密的普通 JSON），看业务侧读到什么 ===');
const nat = env.recorder.instances[env.recorder.instances.length - 1];
try {
  nat.status = 200; nat.statusText = 'OK'; nat.readyState = 2;
  if (typeof nat.onreadystatechange === 'function') nat.onreadystatechange({ target: nat, type: 'readystatechange' });
  nat.readyState = 3;
  if (typeof nat.onreadystatechange === 'function') nat.onreadystatechange({ target: nat, type: 'readystatechange' });
  nat.responseText = JSON.stringify({ code: 200, data: { hello: 1 } });
  nat.response = nat.responseText;
  nat.readyState = 4;
  if (typeof nat.onreadystatechange === 'function') nat.onreadystatechange({ target: nat, type: 'readystatechange' });
  if (typeof nat.onload === 'function') nat.onload({ target: nat, type: 'load' });
} catch (e) { console.log('[inject throw]', String(e && e.message)); }
console.log('[business sees] readyState=', x.readyState, 'status=', x.status, 'responseText=', String(x.responseText).slice(0, 200));
