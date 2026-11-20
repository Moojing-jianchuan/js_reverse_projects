/**
 * 最后一步：本地生成 info 的 {data} 信封（= captcha 同一套 XOR+keystream）
 * 用页面放行态（id 87）的会话级头 + 本地新信封
 * 用法: node scripts/gen_info_envelope.js [pageNum]
 */
const { sign } = require('../src/dewu_sign');
const loader = require('../src/preinforce_loader');

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
  const pageNum = parseInt(process.argv[2] || '1', 10);
  console.log('标定 keystream（sk 派生，需跑一次原始 SDK）…');
  const t0 = Date.now();
  const ks = await loader.calibrateKeystream(SK);
  console.log(`ks len=${ks.length} head=${ks.slice(0, 8).toString('hex')} 耗时 ${Date.now() - t0}ms`);

  const params = { sign: sign({ pickRuleId: 644479, pageNum, pageSize: 24, filterUnbid: true, showCspu: true }), pickRuleId: 644479, pageNum, pageSize: 24, filterUnbid: true, showCspu: true };
  const plain = JSON.stringify(params);
  console.log('明文:', plain);

  const d = loader.buildD(params, ks);
  const body = JSON.stringify({ data: d });
  console.log('信封 hex 前缀:', d.slice(0, 32), '| md5(明文):', loader.md5(plain), '| 一致:', d.slice(0, 32) === loader.md5(plain));

  const t1 = Date.now();
  const r = await fetch(URL_INFO, { method: 'POST', headers: H, body });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { }
  console.log(`\n[本地信封请求] status=${r.status} ${Date.now() - t1}ms len=${text.length}`);
  console.log('  code/msg:', j ? `${j.code}/${j.msg}` : '(非JSON)');
  console.log('  head:', text.slice(0, 300));
})().catch(e => console.error('ERR', e));
