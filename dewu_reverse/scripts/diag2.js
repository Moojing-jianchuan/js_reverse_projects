/**
 * 诊断 2：让 defineProperty 宽容化（吞掉 Cannot redefine property），看包装器能否构造成功。
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
let swallowed = 0;
Object.defineProperty = function (target, key, desc) {
  try {
    return origDP(target, key, desc);
  } catch (e) {
    if (/Cannot redefine property/.test(String(e && e.message))) { swallowed++; return target; }
    throw e;
  }
};
try {
  vm.runInContext(code, ctx, { filename: 'pceptor.000.eval.js', timeout: 20000 });
  console.log('[OK] executed');
} catch (e) {
  console.log('[THROW]', String(e && e.message).slice(0, 160));
  console.log(String(e && e.stack || '').split('\n').slice(0, 5).join('\n'));
}
Object.defineProperty = origDP;
console.log('[swallowed]', swallowed);
console.log('[new globals]', Object.keys(sandbox).filter(k => !baseline.has(k)).join(', '));
console.log('[storage]', [...env.store.entries()].map(([k, v]) => k + '=' + String(v).slice(0, 80)));
console.log('[cookie]', env.jar.cookie.slice(0, 300));
console.log('[storageLog]', env.storageLog);

console.log('\n=== new XMLHttpRequest() ===');
let x;
try {
  x = new sandbox.XMLHttpRequest();
  console.log(' ok. own props:', Object.getOwnPropertyNames(x).join(','));
} catch (e) {
  console.log(' threw:', String(e && e.message));
}
if (x) {
  console.log('\n--- 走一次 open/setRequestHeader/send ---');
  const inner = [];
  const origOnSend = env.recorder.onSend;
  env.recorder.onSend = function (native) {
    inner.push({ method: native.__method, url: native.__url, headers: native.__reqHeaders.slice(), body: native.__body });
  };
  try {
    x.open('POST', 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }));
  } catch (e) {
    console.log(' flow threw:', String(e && e.message));
    console.log(String(e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  }
  console.log('inner native xhr calls:', JSON.stringify(inner, null, 2).slice(0, 3000));
  console.log('recorder log:', JSON.stringify(env.recorder.events.slice(-30), null, 1).slice(0, 3000));
}
