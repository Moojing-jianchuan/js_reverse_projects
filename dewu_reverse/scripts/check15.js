/**
 * 验证 15：加密白名单 = md5(pathname).toUpperCase() 的 includes 判定
 * 找一个真实被加密的 URL 是否在白名单里，并定位白名单数组。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const s = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');

const md5u = t => crypto.createHash('md5').update(t).digest('hex').toUpperCase();

const urls = [
  'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info',
  'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/category-pick/mapping',
];
for (const u of urls) {
  const p = new URL(u).pathname;
  console.log('\n', u);
  console.log('  pathname          =', p);
  console.log('  md5(pathname)     =', md5u(p));
  console.log('  md5(pathname+?)   =', md5u(p + '?'));
  console.log('  in source?        =', s.includes(md5u(p)), '| lower:', s.includes(md5u(p).toLowerCase()));
}

// 找 html 里出现的一批 32 位大写 hex 字面量
const m = s.match(/[0-9A-F]{32}/g) || [];
const uniq = [...new Set(m)];
console.log('\n[source 里 32 位大写字面量] count=', uniq.length);

// 在源码里找形如 "xxxx","yyyy" 的连续 hex 列表
const listMatch = s.match(/(?:[0-9A-F]{32}[\\"',\s]{1,6}){3,}/);
console.log('[疑似白名单片段]', listMatch ? listMatch[0].slice(0, 400) : 'none');
