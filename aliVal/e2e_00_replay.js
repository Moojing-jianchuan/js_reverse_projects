// e2e_00_replay.js — 实验 P1：原样回放浏览器同轮三件套（certifyId + deviceToken + data）
// 目的：拿到该端点的真实响应形态；若 certifyId 仍有效，可判断"真实浏览器产物"当前是否通过。
// 消耗：1 次 slideAuth
const fs = require('fs');
const path = require('path');
const C = require('./e2e_common');

async function main() {
  const cap = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'cvp_capture.json'), 'utf8'));
  const cvp = JSON.parse(cap.captchaVerifyParam);
  const sess = await C.siteSession();
  console.log('[GET] site page %d | cookies: %s', sess.status, sess.jar);

  const before = C.readQuota();
  if (before >= C.MAX_SLIDEAUTH) { console.log('配额已用尽，停止'); return; }
  const n = C.bumpQuota();

  const body = C.formBody({ captchaVerifyParam: JSON.stringify(cvp) });
  const t0 = Date.now();
  const r = await C.request({
    method: 'POST',
    url: 'https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth',
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

  const rec = {
    post: n, tag: 'P1-replay-capture', url: 'aliVal.aspx?method=slideAuth',
    tookMs: Date.now() - t0,
    reqSummary: {
      certifyId: cvp.certifyId, sceneId: cvp.sceneId,
      deviceToken_len: cvp.deviceToken.length, deviceToken_head: cvp.deviceToken.slice(0, 24),
      data_len: cvp.data.length, data_head16: cvp.data.slice(0, 16),
      captured_at: cap.captured_at,
    },
    status: r.status, respHeaders: r.headers, respBody: r.text,
  };
  C.saveJson(`p${String(n).padStart(2, '0')}_${rec.tag}.json`, rec);
  console.log('\n[POST %d] HTTP %d in %dms', n, r.status, rec.tookMs);
  console.log('resp:', r.text);
  console.log('captchaVerifyResult === true ?', /"captchaVerifyResult"\s*:\s*true/.test(r.text));
}
main().catch(e => { console.error('ERR', e.stack || e.message); process.exit(1); });
