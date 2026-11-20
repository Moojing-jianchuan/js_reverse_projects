/**
 * 端到端：本地信封 → 真实请求 → 200 → Fun99 解密 → 商品列表
 * 用法: node scripts/e2e_info.js [pickRuleId] [pageNum]
 */
const { sign } = require('../src/dewu_sign');
const { buildInfoEnvelope } = require('../src/pceptor_encrypt');

const SK = 'YOUR_SK_HERE';
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';

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
  'sk': SK,
  'sks': '1,hdw4',
  'traceparent': '00-f598cd336affc8e77405f68f7f26920a-4a0e3b2fc6ced727-01',
  'cookie': `sajssdk_2015_cross_new_user=1; _c_WBKFRo=TkLqpk9TM5BUx46i9zVttdvhqM4HxRsgKVhAcoZc; sk=${SK}`,
};

(async () => {
  const pickRuleId = parseInt(process.argv[2] || '644479', 10);
  const pageNum = parseInt(process.argv[3] || '1', 10);
  const params = { sign: sign({ pickRuleId, pageNum, pageSize: 24, filterUnbid: true, showCspu: true }), pickRuleId, pageNum, pageSize: 24, filterUnbid: true, showCspu: true };
  const plain = JSON.stringify(params);
  const raw = buildInfoEnvelope(plain);
  const data = typeof raw === 'string' ? raw : (raw && (raw.data || raw.envelope));
  if (!data || typeof data !== 'string') { console.log('buildInfoEnvelope 返回结构异常:', Object.keys(raw || {}), JSON.stringify(raw).slice(0, 200)); return; }
  const body = JSON.stringify({ data });
  console.log('明文:', plain);
  console.log('data:', data.slice(0, 40) + '…', '| len', data.length);

  const t0 = Date.now();
  const r = await fetch(URL_INFO, { method: 'POST', headers: H, body });
  const text = await r.text();
  console.log(`\nstatus=${r.status} ${Date.now() - t0}ms len=${text.length}`);
  console.log('sks 响应头:', r.headers.get('sks'), '| sks-length:', r.headers.get('sks-length'));

  if (r.status === 200) {
    const { decryptInfoResponse } = require('../src/pceptor_decrypt');
    try {
      const out = await decryptInfoResponse(text);
      const j = typeof out === 'string' ? JSON.parse(out) : out;
      const list = (j.data && j.data.list) || [];
      console.log('\n✅ 解密成功 code=', j.code, 'total=', j.data && j.data.total, 'list=', list.length);
      if (list[0]) console.log('第一条:', JSON.stringify(list[0]).slice(0, 200));
    } catch (e) { console.log('解密失败:', e.message.slice(0, 200)); }
  } else {
    console.log('响应:', text.slice(0, 300));
  }
})().catch(e => console.error('ERR', e));
