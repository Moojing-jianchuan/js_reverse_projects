/**
 * 快速验证：加载 SDK → 走一次请求装配 → 看底层 native XHR 收到什么
 */
'use strict';
const pceptor = require('../src/pceptor_loader');

const api = pceptor.load();
console.log('[load] error=', api.sdk.loadError && String(api.sdk.loadError.message).slice(0, 120));
console.log('[load] globals=', api.sdk.globals.join(', '));
console.log('[load] dpSkipped=', api.sdk.dpSkipped);
console.log('[state]', JSON.stringify(api.state().storage), api.state().cookie);

const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
const t0 = Date.now();
const r = api.getHeadersFor({
  url: 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info',
  method: 'POST',
  bodyText: plain,
});
console.log('[took]', Date.now() - t0, 'ms');
console.log('[errors]', r.errors);
console.log('[url]', r.url);
console.log('[method]', r.method);
console.log('[body]', String(r.body).slice(0, 200));
console.log('[headers]');
for (const [k, v] of Object.entries(r.headers || {})) console.log('   ', k + ':', String(v).slice(0, 140));
