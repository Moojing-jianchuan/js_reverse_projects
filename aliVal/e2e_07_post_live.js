// e2e_07_post_live.js — 提交"浏览器真实产出"的 captchaVerifyParam（certifyId / deviceToken / data 同轮）
// 用法：node e2e_07_post_live.js [cvp_live.json 路径] [tag]
// 说明：这是唯一能判定"端点是否接受真实同轮三件套"的实验；data 不是离线构造的。
const fs = require('fs');
const path = require('path');
const C = require('./e2e_common');

const file = process.argv[2] || path.join(__dirname, 'static', 'work', 'e2e', 'cvp_live.json');
const tag = process.argv[3] || 'P4-live-cvp';

(async () => {
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cvp = rec.cvp;
  if (!cvp || !cvp.data) throw new Error('cvp_live.json 里没有可用 captchaVerifyParam');
  const sess = await C.siteSession();
  const body = C.formBody({ captchaVerifyParam: JSON.stringify(cvp) });
  const n = C.readQuota();
  if (n >= C.MAX_SLIDEAUTH) throw new Error('配额已用尽');
  const postNo = C.bumpQuota();
  const t0 = Date.now();
  const r = await C.request({
    method: 'POST', url: 'https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(body),
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Origin': 'https://tool.manmanbuy.com',
      'Referer': 'https://tool.manmanbuy.com/m/aliVal.aspx',
      Cookie: sess.jar,
    },
    body,
  });
  let parsed = null; try { parsed = JSON.parse(r.text); } catch (e) { }
  const out = {
    post: postNo, tag, tookMs: Date.now() - t0,
    capturedAt: rec.received_at, postedAt: new Date().toISOString(),
    ageSeconds: rec.received_at ? +((Date.now() - Date.parse(rec.received_at)) / 1000).toFixed(1) : null,
    req: { certifyId: cvp.certifyId, sceneId: cvp.sceneId, deviceToken_len: cvp.deviceToken.length, deviceToken_head: cvp.deviceToken.slice(0, 20), data_len: cvp.data.length, data_head16: cvp.data.slice(0, 16) },
    status: r.status, respBody: r.text, respParsed: parsed, verdict: parsed ? parsed.captchaVerifyResult : null,
  };
  C.saveJson(`p${String(postNo).padStart(2, '0')}_${tag}.json`, out);
  console.log(`[POST ${postNo}/${C.MAX_SLIDEAUTH}] ${tag} HTTP ${r.status} age=${out.ageSeconds}s`);
  console.log('  certifyId=%s dataLen=%d', cvp.certifyId, cvp.data.length);
  console.log('  resp:', r.text);
  console.log('  captchaVerifyResult === true ?', parsed && parsed.captchaVerifyResult === true);
})().catch(e => { console.error('ERR', e.stack || e.message); process.exit(1); });
