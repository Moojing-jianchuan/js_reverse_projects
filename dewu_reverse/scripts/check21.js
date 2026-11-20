/**
 * 验证 21：用 Array.prototype.join 拦截 + 目标 md5 匹配，直接抓出 hsn 的原像
 */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const crypto = require('crypto');
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

const TARGETS = new Set([
  'fde756e2092dfd255684eead0b2e6f45',
  '6d0bb00954ceb7fbee436bb55a8397a9',
  '90c805bcb9fa376aacfb38d598ec7bb6',
]);

const origJoin = Array.prototype.join;
const hits = [];
Array.prototype.join = function (sep) {
  const r = origJoin.call(this, sep);
  try {
    if (typeof r === 'string' && r.length <= 200 && this.length && typeof this[0] === 'string') {
      const h = md5(r);
      if (TARGETS.has(h)) hits.push({ sep, arr: this.slice(0, 40), joined: r, md5: h });
    }
  } catch (e) { }
  return r;
};

(async () => {
  const api = pceptor.load({});
  await sleep(60);
  const seen = [];
  api.env.recorder.onSend = n => seen.push({ url: n.__url, headers: n.__reqHeaders.slice(), body: n.__body });
  const big = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
  const xhr = api.newWrapperXHR();
  xhr.open('POST', 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(big);
  for (let i = 0; i < 60 && !seen.length; i++) await sleep(5);
  Array.prototype.join = origJoin;

  console.log('[native sends]', seen.length);
  for (const s of seen) {
    const h = {}; for (const [k, v] of s.headers) h[k.toLowerCase()] = v;
    console.log('  ', s.url, '| hsn=', h.hsn);
  }
  console.log('\n[join 命中]', hits.length);
  for (const h of hits.slice(0, 6)) {
    console.log('  md5=', h.md5, 'sep=', JSON.stringify(h.sep), 'len=', h.joined.length);
    console.log('     joined=', JSON.stringify(h.joined).slice(0, 300));
    console.log('     arr=', JSON.stringify(h.arr.slice(0, 20)));
  }
})();
