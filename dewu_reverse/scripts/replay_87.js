/**
 * 决定性实验：用「页面放行态（id 87）」的全套风控头，分别发
 *   B1: 明文 {sign,...} 体   → 判断是否只需 headers
 *   B2: 原样 {data} 信封体   → 对照
 * 用法: node scripts/replay_87.js [--b2]
 */
const fs = require('fs');
const path = require('path');
const { sign } = require('../src/dewu_sign');

const ROOT = path.resolve(__dirname, '..');

// ===== 从 id 87（HTTP 200 的放行态样本）原样抄下来的头 =====
const H = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
  'accept': '*/*',
  'accept-language': 'zh-CN,zh;q=0.9',
  'referer': 'https://www.dewu.com/',
  'origin': 'https://www.dewu.com/',
  'content-type': 'application/json',
  'adi': '8YZEx35NEDTLiNl0hGI0Ygw71Bw6nDmMK+wr7Cs0VjwrB7eMOKN8K6A8KAw6HCgDNHNyYVbMONwpJwwpzCgmt7RRw=',
  'hsn': '22a9ecc6cb12ec7d0e8bdf53bc34efce',
  'ltk': 'DMKbwprDm8OOacKjw4XCq8KTB8KJwq/CssOWZsOmwpbCkMKnNjjCnn/Dm8OlL8K8LA3Cv3TDminDg8ODw54fcsKeQWzDncOyw5zCisKJwozDlsOM',
  'sessionid': 'pxiZ6oX1-nd7F-ljPB-uZso-r5M2P86sx1BvERkH',
  'shumeiid': 'YOUR_SHUMEIID_HERE',
  'sk': 'YOUR_SK_HERE',
  'sks': '1,hdw4',
  'traceparent': '00-f598cd336affc8e77405f68f7f26920a-4a0e3b2fc6ced727-01',
  'cookie': 'sajssdk_2015_cross_new_user=1; _c_WBKFRo=TkLqpk9TM5BUx46i9zVttdvhqM4HxRsgKVhAcoZc; sk=YOUR_SK_HERE',
};

// id 87 的原样请求体（{data} 信封）
const BODY_DATA = JSON.stringify({
  data: 'df74e6521fc1ea3752eddb701c5453b8w6bDlcK3F37Dv1AyGcK5GmlRd8OfcMKAw4/CnMO/w6sdcMKpw7goMsOQNMKpwo5kWsK7wpYRw4DDlyJ6YMOdw5MMFjvDm1BaCMKjwrPChSTCuxAyw4N4w44YK8KZWcKVwrHDn8OQKcKPMsO3PMKwR0BBwpvCksO2w4o+PF9Xw4lfRsKcwqbCrkXDhnzCgF3Cm2HCtMOpTUokWXjDiC3CiC3DoXHCpcOLMsKRJHQuw5rDqgDCrXvCrw=='
});

const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';

async function send(label, body) {
  const t0 = Date.now();
  const r = await fetch(URL_INFO, { method: 'POST', headers: H, body });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { }
  console.log(`\n[${label}] status=${r.status} ${Date.now() - t0}ms len=${text.length}`);
  console.log('  code/msg:', j ? `${j.code}/${j.msg}` : '(非JSON)');
  console.log('  head:', text.slice(0, 200));
  return { status: r.status, code: j && j.code, msg: j && j.msg, len: text.length };
}

(async () => {
  if (process.argv.includes('--b2')) {
    await send('B2 原样信封体', BODY_DATA);
    return;
  }
  // B1：明文体（同一批参数，sign 本地算）
  const params = { pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true };
  const plain = JSON.stringify({ sign: sign(params), ...params });
  console.log('B1 明文体:', plain);
  await send('B1 明文体 + 放行态头', plain);
})().catch(e => console.error('ERR', e));
