/**
 * 新会话验证：
 *  ① 用新 sk 重标 KS，生成同参数信封，与页面自己发的 data 逐字对拍（零网络）
 *  ② 对拍通过后，用本地信封发 pageNum=2 → 200 → Fun99 解密
 * 用法: node scripts/verify_new_session.js [--send]
 */
const { sign } = require('../src/dewu_sign');
const enc = require('../src/pceptor_encrypt');

const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';
// 页面（浏览器）自己发出的那条 data（同参数 pageNum=1）
const PAGE_DATA = 'df74e6521fc1ea3752eddb701c5453b8XF7Cs8OXwppOVyVDdEHDumfDkcK4aDvChcOMHmNcF8OJw5Q7woDDv3zDpDfClMKxRgHCoSHCn8KmwqHCk1bDmcKJbcOgw6zCvcKHw5hUwrvDukkLWFYOw6LDtEjDqxp/VQ/CoGN7wqvCvCduwqF1GMOmw5Rzw4PDhxE9wpnClApjVFNdWWjCucOxWsOUwrXCrWkMw4rDncO0wpnDgsOFV1bDmXlNw7XCuF3DvhnDs8KFNcKiwrASw6jDvA==';

const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const H = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
  'accept': '*/*',
  'accept-language': 'zh-CN,zh;q=0.9',
  'referer': 'https://www.dewu.com/',
  'origin': 'https://www.dewu.com/',
  'content-type': 'application/json',
  'adi': 'PVF-rtnSV9M__CYnp3QHQwWDAew73DtsOrLHDCqxVAFBwRw4LDn8Qjw4zDhcKSXsKnwo1cw45JXUTCiV5Aw7HCnA==',
  'hsn': '22a9ecc6cb12ec7d0e8bdf53bc34efce',
  'ltk': 'KcKawrrDm8OuMcO8wpXCkMK2QMKvwqnCpcOnDMOmwpbCkMKnNjnCl3fDnMOqL8K8LA3Cv3TDminDg8ODw54fcsKeQWzCoMO6w5LCjMO1w7jDl8OO',
  'sessionid': '1C5CEvrf-9MkO-xGNX-Qlwt-7JzlrHf25FaGrYi4',
  'shumeiid': DWSM,
  'sk': SK,
  'sks': '1,hdw4',
  'traceparent': '00-f53ea9d26affd8061c8aed1aa950c4d1-363e0664b9f0d699-01',
  'cookie': `sajssdk_2015_cross_new_user=1; _c_WBKFRo=aFAEEw54LXFhCR8GXwD9tAD7dl4C67yFV2TgfY8Q; sk=${SK}`,
};

(async () => {
  console.log('=== ① 重标 KS（新 sk） ===');
  const t0 = Date.now();
  const cal = await enc.calibrate({ sk: SK, shumeiid: DWSM, ua: H['user-agent'] });
  console.log('calibrate:', JSON.stringify(cal).slice(0, 200), `(${Date.now() - t0}ms)`);

  const p1 = { sign: sign({ pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }), pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true };
  const plain1 = JSON.stringify(p1);
  const raw1 = enc.buildInfoEnvelope(plain1);
  const data1 = typeof raw1 === 'string' ? raw1 : raw1.data;
  console.log('\n明文1:', plain1);
  console.log('页面 data:', PAGE_DATA.slice(0, 60) + '…', '| len', PAGE_DATA.length);
  console.log('本地 data:', data1.slice(0, 60) + '…', '| len', data1.length);
  console.log('★ 逐字一致:', data1 === PAGE_DATA);

  // 逐段诊断
  if (data1 !== PAGE_DATA) {
    let firstDiff = -1;
    for (let i = 0; i < Math.min(data1.length, PAGE_DATA.length); i++) if (data1[i] !== PAGE_DATA[i]) { firstDiff = i; break; }
    console.log('首个差异位置:', firstDiff, '| 页面:', PAGE_DATA.slice(firstDiff, firstDiff + 20), '| 本地:', data1.slice(firstDiff, firstDiff + 20));
  }

  if (!process.argv.includes('--send')) { console.log('\n（未加 --send，仅对拍）'); return; }

  console.log('\n=== ② 本地信封发 pageNum=2 ===');
  const p2 = { sign: sign({ pickRuleId: 644479, pageNum: 2, pageSize: 24, filterUnbid: true, showCspu: true }), pickRuleId: 644479, pageNum: 2, pageSize: 24, filterUnbid: true, showCspu: true };
  const raw2 = enc.buildInfoEnvelope(JSON.stringify(p2));
  const data2 = typeof raw2 === 'string' ? raw2 : raw2.data;
  const t1 = Date.now();
  const r = await fetch(URL_INFO, { method: 'POST', headers: H, body: JSON.stringify({ data: data2 }) });
  const text = await r.text();
  console.log(`status=${r.status} ${Date.now() - t1}ms len=${text.length} sks=${r.headers.get('sks')}`);
  if (r.status === 200) {
    const { decryptInfoResponse } = require('../src/pceptor_decrypt');
    const out = await decryptInfoResponse(text);
    const j = typeof out === 'string' ? JSON.parse(out) : out;
    const list = (j.data && j.data.list) || [];
    console.log('✅ code=', j.code, 'list=', list.length);
    if (list[0]) console.log('第一条:', JSON.stringify(list[0]).slice(0, 220));
  } else {
    console.log('响应:', text.slice(0, 200));
  }
})().catch(e => console.error('ERR', e));
