/**
 * 验证 18：hsn 的构成。已知样本：
 *  body 为空        -> 90c805bcb9fa376aacfb38d598ec7bb6
 *  body {"a":1}     -> 6d0bb00954ceb7fbee436bb55a8397a9
 *  body {"a":2}     -> 同 {"a":1}（说明值不参与）
 *  body {"sign":...,"pickRuleId":644443,...} -> fde756e2092dfd255684eead0b2e6f45
 *  URL 变化不影响
 */
'use strict';
const crypto = require('crypto');
const md5 = (b, enc) => crypto.createHash('md5').update(b, enc || 'utf8').digest('hex');

const BIG = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
const TARGETS = {
  empty: '90c805bcb9fa376aacfb38d598ec7bb6',
  a1: '6d0bb00954ceb7fbee436bb55a8397a9',
  big: 'fde756e2092dfd255684eead0b2e6f45',
};

function cands(body) {
  const out = {};
  const put = (k, v) => out[k] = v;
  put('md5(body)', md5(body));
  put('md5(body)upper', md5(body).toUpperCase());
  put('md5(body+"" )', md5(body + ''));
  put('md5(latin1)', md5(Buffer.from(body, 'latin1')));
  put('md5(utf16le)', md5(Buffer.from(body, 'utf16le')));
  try { put('md5(keys)', md5(JSON.stringify(Object.keys(JSON.parse(body))))); } catch (e) { }
  try { put('md5(keys.join,)', md5(Object.keys(JSON.parse(body)).join(','))); } catch (e) { }
  try { put('md5(keys.sort.join)', md5(Object.keys(JSON.parse(body)).sort().join(''))); } catch (e) { }
  try { put('md5(body.length)', md5(String(body.length))); } catch (e) { }
  put('md5(md5(body))', md5(md5(body)));
  put('md5(btoa)', md5(Buffer.from(body, 'utf8').toString('base64')));
  put('md5(encodeURIComponent)', md5(encodeURIComponent(body)));
  put('md5(""+len+md5)', md5(body.length + md5(body)));
  return out;
}

for (const [label, body] of [['empty', ''], ['a1', '{"a":1}'], ['big', BIG]]) {
  console.log('\n### ' + label + ' target=' + TARGETS[label]);
  const c = cands(body);
  for (const [k, v] of Object.entries(c)) if (v === TARGETS[label]) console.log('   MATCH', k, v);
  console.log('   md5(body) =', md5(body));
}
console.log('\n[big md5]', md5(BIG));
