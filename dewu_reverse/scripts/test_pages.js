/**
 * 关键实验：同一 sk 会话下，本地连续翻页能成功几次？
 * 用法: node scripts/test_pages.js [n]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sign } = require('../src/dewu_sign');
const enc = require('../src/pceptor_encrypt');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const N = parseInt(argv[0] || '4', 10);
const SK = 'YOUR_SK_HERE';
const SHUMEI = 'YOUR_SHUMEIID_HERE';
const ADI = '0l3fG8GRVw2jhh7HWZ-JHAwr18HcOSGHJOw55Jw78iaMOWwqwkwqPCtMOewr7DvcOXw7vCmcO1w4fDmigA';
const LTK = 'GcKMwqfCo8OZKcKRw67ClsKYI8Kkwp/DksOUB8OmwpbCkMKnNjnCnn7DnMOnL8K8LA3Cv3TDminDg8ODw54fcsKeQWzCrcOxwqTChcO1wozDlcK7';
const SESSIONID = 'yTtluHT1-zEsM-3xqr-4ZoT-i5B0HNfmzmi9cfxQ';
const HSN = '944821c9440f7599987dd159e0b6fe16';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const randHex = n => crypto.randomBytes(n).toString('hex');

(async () => {
  await enc.calibrate({ sk: SK, shumeiid: SHUMEI, ua: UA });
  const { decryptInfoResponse } = require('../src/pceptor_decrypt');
  const out = [];
  for (let pageNum = 1; pageNum <= N; pageNum++) {
    const params = { pickRuleId: 644479, pageNum, pageSize: 24, filterUnbid: true, showCspu: true };
    const p = { sign: sign(params), ...params };
    const b = enc.buildInfoEnvelope(JSON.stringify(p));
    const dataField = typeof b === 'string' ? b : b.data;
    const headers = {
      'content-type': 'application/json', 'accept': '*/*', 'accept-language': 'zh-CN,zh;q=0.9',
      'origin': 'https://www.dewu.com', 'referer': 'https://www.dewu.com/', 'user-agent': UA,
      'hsn': HSN, 'adi': ADI, 'ltk': LTK, 'sessionid': SESSIONID,
      'shumeiid': SHUMEI, 'sk': SK, 'sks': '1,hdw4', 'skt': 'hdr1',
      'traceparent': `00-${randHex(16)}-${randHex(8)}-01`,
      'cookie': `sajssdk_2015_cross_new_user=1; sk=${SK}`,
    };
    const t0 = Date.now();
    const r = await fetch(URL_INFO, { method: 'POST', headers, body: JSON.stringify({ data: dataField }) });
    const text = await r.text();
    let line = `page${pageNum}: status=${r.status} ${Date.now() - t0}ms len=${text.length}`;
    if (r.status === 200) {
      try {
        const j = await decryptInfoResponse(text);
        const o = typeof j === 'string' ? JSON.parse(j) : j;
        const list = (o.data && o.data.list) || [];
        line += ` ✅ list=${list.length} total=${o.data && o.data.total}`;
        if (list[0]) line += ` | ${String(list[0].title || '').slice(0, 30)}`;
      } catch (e) { line += ` 解密失败:${e.message.slice(0, 60)}`; }
    } else {
      let j = null; try { j = JSON.parse(text); } catch (e) { }
      line += ` ❌ ${j ? j.code + '/' + j.msg : text.slice(0, 80)}`;
    }
    console.log(line);
    out.push({ pageNum, status: r.status, len: text.length });
    if (r.status !== 200) break;   // 失败即停，避免加重
    await new Promise(res => setTimeout(res, 800));
  }
  fs.writeFileSync(path.join(ROOT, 'artifacts/page_test.json'), JSON.stringify(out, null, 1));
})().catch(e => console.error('ERR', e));
