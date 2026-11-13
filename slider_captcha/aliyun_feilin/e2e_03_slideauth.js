// e2e_03_slideauth.js — 提交一次 slideAuth（带会话 cookie），完整记录请求摘要 + 响应全文
// 用法：node e2e_03_slideauth.js --init static/work/e2e/init_xxx.json --data static/work/e2e/data_pN.json --tag P2
const fs = require('fs');
const path = require('path');
const C = require('./e2e_common');

const URL_SLIDEAUTH = 'https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth';

async function submitSlideAuth({ initFile, dataFile, tag }) {
  const init = JSON.parse(fs.readFileSync(path.isAbsolute(initFile) ? initFile : path.join(__dirname, initFile), 'utf8'));
  const dat = JSON.parse(fs.readFileSync(path.isAbsolute(dataFile) ? dataFile : path.join(__dirname, dataFile), 'utf8'));
  const certifyId = init.initBody && init.initBody.CertifyId;
  if (!certifyId) throw new Error('init 文件里没有 CertifyId');

  const n = C.readQuota();
  if (n >= C.MAX_SLIDEAUTH) throw new Error('slideAuth 配额已用尽 (' + n + '/' + C.MAX_SLIDEAUTH + ')');

  // 一致性要求：cvp.deviceToken 必须与 InitCaptcha 的 DeviceToken 相同
  const deviceToken = init.deviceToken;
  if (!deviceToken) throw new Error('init 文件里没有 deviceToken（请用 e2e_01_init.js 重新生成）');
  return _post({ init, dat, tag, deviceToken, certifyId });
}

async function _post({ init, dat, tag, deviceToken, certifyId }) {
  const sess = await C.siteSession();
  const cvp = { sceneId: 'vollz84f', certifyId, deviceToken, data: dat.data };
  const body = C.formBody({ captchaVerifyParam: JSON.stringify(cvp) });
  const postNo = C.bumpQuota();
  const t0 = Date.now();
  const r = await C.request({
    method: 'POST', url: URL_SLIDEAUTH,
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
  let parsed = null;
  try { parsed = JSON.parse(r.text); } catch (e) { }
  const rec = {
    post: postNo, tag, tookMs: Date.now() - t0,
    initFile: init.stamp || null, initCertifyId: certifyId, initRequestId: init.initBody && init.initBody.RequestId,
    initImage: init.initBody && init.initBody.Image, staticPath: init.initBody && init.initBody.StaticPath,
    dataSummary: dat.summary,
    req: {
      url: URL_SLIDEAUTH,
      certifyId, sceneId: cvp.sceneId,
      deviceToken_len: deviceToken.length, deviceToken_head: deviceToken.slice(0, 24),
      data_len: dat.data.length, data_head16: dat.data.slice(0, 16),
      body_len: body.length,
    },
    status: r.status, respHeaders: r.headers, respBody: r.text, respParsed: parsed,
    verdict: parsed ? parsed.captchaVerifyResult : null,
  };
  C.saveJson(`p${String(postNo).padStart(2, '0')}_${tag}.json`, rec);
  console.log(`[POST ${postNo}/${C.MAX_SLIDEAUTH}] tag=${tag} HTTP ${r.status} ${rec.tookMs}ms`);
  console.log(`  certifyId=${certifyId} dataLen=${dat.data.length} head=${dat.data.slice(0, 16)} slidePos=${dat.summary && dat.summary.slidePos} arg=${dat.summary && dat.summary.argMode}`);
  console.log('  resp:', r.text);
  console.log('  captchaVerifyResult === true ?', parsed && parsed.captchaVerifyResult === true);
  return rec;
}

module.exports = { submitSlideAuth, _post, URL_SLIDEAUTH };

if (require.main === module) {
  const a = process.argv.slice(2);
  const get = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const initFile = get('--init'), dataFile = get('--data'), tag = get('--tag') || 'manual';
  const dtSource = get('--deviceTokenFrom') || null; // 指定 deviceToken 来源样本
  (async () => {
    const init = JSON.parse(fs.readFileSync(path.join(__dirname, initFile), 'utf8'));
    const dat = JSON.parse(fs.readFileSync(path.join(__dirname, dataFile), 'utf8'));
    let deviceToken = init.deviceToken;
    if (dtSource) {
      const cvp = JSON.parse(JSON.parse(fs.readFileSync(path.join(__dirname, dtSource), 'utf8')).captchaVerifyParam);
      deviceToken = cvp.deviceToken;
    }
    // 一致性要求：cvp.deviceToken 必须与 InitCaptcha 的 DeviceToken 相同
    console.log('deviceToken src =', dtSource || 'init.deviceToken', '| len', deviceToken.length);
    await _post({ init, dat, tag, deviceToken, certifyId: init.initBody.CertifyId });
  })().catch(e => { console.error('ERR', e.stack || e.message); process.exit(1); });
}
