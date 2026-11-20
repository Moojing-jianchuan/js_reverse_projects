/**
 * 得物 (www.dewu.com) PC 端接口签名算法 —— 已线上验证
 *
 * 来源：页面 chunk `b003166a...js` 中的 webpack 模块 `d0RG`（请求封装模块）
 *   d0RG.b(path, params) → POST，body = JSON.stringify({ sign: f(params), ...params })
 *   f(t) = md5( 键名排序拼接 + SALT )
 *
 * 验证记录（2026-11-20，浏览器抓包逐字节对拍）：
 *   mapping {pageNum:1,pageSize:20}                                    → a44fa02883cc1342f22c7dfefea1d9e9 ✅
 *   info    {pickRuleId:644443,pageNum:1,pageSize:24,filterUnbid,showCspu} → 0e5d10fb111f2afef6ac0a1776187e23 ✅
 *   info    {pickRuleId:644479,pageNum:1,pageSize:24,filterUnbid,showCspu} → f2b6b4c666227d52fdadf251f307445d ✅
 *                                                            （与 2025-11 CSDN 文章样本完全一致）
 */
'use strict';
const crypto = require('crypto');

/** 固定盐值，取自 d0RG 模块内 f() 的常量参数 */
const SALT = '048a9c4943398714b356a696503d2d36';

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/**
 * 键名排序 → 拼接 key+value → 追加盐 → md5
 * 规则（逐条对齐 d0RG.f 的实现）：
 *   - Object.keys(t).sort() 升序
 *   - 值为 undefined → 跳过该键
 *   - Number.isNaN(值) → 值当空串
 *   - 数组：先 sort()，元素是 Object 就 JSON.stringify，再用 "," 连接；空数组只拼键名
 *   - 对象：JSON.stringify 后拼接
 *   - 其它：toString() 后拼接
 */
function signConcat(params) {
  return Object.keys(params).sort().reduce((acc, key) => {
    let v = params[key];
    if (v === undefined) return acc;
    if (Number.isNaN(v)) v = '';
    if (Array.isArray(v)) {
      if (v.length === 0) return acc + key;
      const joined = v.slice().sort()
        .map(x => (x instanceof Object ? JSON.stringify(x) : x))
        .reduce((a, b) => a + (a ? ',' : '') + b, '');
      return acc + key + joined;
    }
    return v instanceof Object ? acc + key + JSON.stringify(v) : acc + key + v.toString();
  }, '');
}

/** 生成 sign */
function sign(params) {
  return md5(signConcat(params) + SALT);
}

/** 生成完整请求体（服务端接受的明文格式） */
function buildBody(params) {
  return JSON.stringify({ sign: sign(params), ...params });
}

module.exports = { SALT, md5, signConcat, sign, buildBody };

if (require.main === module) {
  const cases = [
    [{ pageNum: 1, pageSize: 20 }, 'a44fa02883cc1342f22c7dfefea1d9e9'],
    [{ pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }, '0e5d10fb111f2afef6ac0a1776187e23'],
    [{ pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }, 'f2b6b4c666227d52fdadf251f307445d'],
  ];
  let ok = 0;
  for (const [p, expect] of cases) {
    const got = sign(p);
    const pass = got === expect;
    ok += pass ? 1 : 0;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${got}  ${pass ? '' : 'expect ' + expect}`);
  }
  console.log(`\n${ok}/${cases.length} 通过`);
}
