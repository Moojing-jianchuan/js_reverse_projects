#!/usr/bin/env node
/**
 * 得物 pc 端本地协议探测
 * 1) category-pick/mapping  —— 明文 {sign,...} 请求体
 * 2) feeds/info             —— 同一套 sign，明文请求体
 * 用法: node probe_local.js
 */
const crypto = require('crypto');

const SALT = '048a9c4943398714b356a696503d2d36';
const BASE = 'https://app.dewu.com';
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/** d0RG.f() 的等价实现：键名排序 → 拼接 key+value（对象 JSON.stringify，数组排序后逗号连接） → + salt → md5 */
function sign(obj) {
  const concat = Object.keys(obj).sort().reduce((acc, k) => {
    let v = obj[k];
    if (v === undefined) return acc;
    if (Number.isNaN(v)) v = '';
    if (Array.isArray(v)) {
      if (v.length === 0) return acc + k;
      const joined = v.slice().sort().map(x => (x instanceof Object ? JSON.stringify(x) : x)).join(',');
      return acc + k + joined;
    }
    return v instanceof Object ? acc + k + JSON.stringify(v) : acc + k + v.toString();
  }, '');
  return md5(concat + SALT);
}

const COOKIE = [
  'sajssdk_2015_cross_new_user=1',
  'sensorsdata2015jssdkcross=',
  '_c_WBKFRo=Asb1LOZqU4cK1Y52feRhhzRxf1mt6S90OPaLWOQc',
  'sk=YOUR_SK_HERE',
  'dwsm=YOUR_SHUMEIID_HERE'
].join('; ');

const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Origin': 'https://www.dewu.com',
  'Referer': 'https://www.dewu.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
  'Cookie': COOKIE
};

async function post(path, params) {
  const body = JSON.stringify({ sign: sign(params), ...params });
  const t0 = Date.now();
  const r = await fetch(BASE + path, { method: 'POST', headers: HEADERS, body });
  const text = await r.text();
  return { path, status: r.status, ms: Date.now() - t0, body: JSON.parse(JSON.stringify({ sign: sign(params), ...params })).sign, reqBody: body, resp: text.slice(0, 400) };
}

(async () => {
  const mapping = await post('/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/category-pick/mapping', { pageNum: 1, pageSize: 20 });
  console.log('=== mapping ===');
  console.log(JSON.stringify(mapping, null, 2));

  const info = await post('/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info', { pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
  console.log('=== info (plain body) ===');
  console.log(JSON.stringify(info, null, 2));
})().catch(e => console.error('ERR', e));
