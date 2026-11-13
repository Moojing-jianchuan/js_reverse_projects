// e2e_01_init.js — 纯 Node InitCaptcha：取新 certifyId + 下载 back/shadow 图
// 用法：node e2e_01_init.js [deviceToken 来源: file|sample1|sample2|capture]
// 输出：static/work/e2e/init_<ts>.json + static/work/e2e/img_<ts>/back.png|shadow.png
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./e2e_common');
const { sign, KEYS } = require('./utils/crypto');

const SCENE_ID = 'vollz84f';
const INIT_URL = 'https://1sfr0c.captcha-open.aliyuncs.com/';
const IMG_BASE = 'https://static-captcha.aliyuncs.com/';

function deviceTokenOf(src) {
  if (src === 'file') return { src, token: fs.readFileSync(path.join(__dirname, 'config', 'token_verify.txt'), 'utf8').trim() };
  const f = { sample1: 'cvp_sample_1.json', sample2: 'cvp_sample_2.json', capture: 'cvp_capture.json' }[src];
  const cvp = JSON.parse(JSON.parse(fs.readFileSync(path.join(__dirname, 'config', f), 'utf8')).captchaVerifyParam);
  return { src, token: cvp.deviceToken };
}

async function main() {
  const src = process.argv[2] || 'capture';
  const { token, src: tokenSrc } = deviceTokenOf(src);
  const sess = await C.siteSession();

  const params = {
    AaduaneId: KEYS.KEY_ID,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    Format: 'JSON',
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    Version: '2023-03-05',
    Action: 'InitCaptcha',
    SceneId: SCENE_ID,
    Language: 'cn',
    DeviceToken: token,
    SignatureNonce: crypto.randomUUID(),
  };
  params.Signature = sign(params, KEYS.KEY_SECRET);

  const body = C.formBody(params);
  const r = await C.request({
    method: 'POST', url: INIT_URL,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(body),
      'Origin': 'https://tool.manmanbuy.com',
      'Referer': 'https://tool.manmanbuy.com/',
      'Accept': '*/*',
    },
    body,
  });
  let j = null;
  try { j = JSON.parse(r.text); } catch (e) { }
  const stamp = C.ts();
  const outDir = path.join(C.WORK, `img_${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const rec = {
    stamp, tokenSrc, deviceToken: token, deviceToken_len: token.length, deviceToken_head: token.slice(0, 24),
    initStatus: r.status, initBody: j || r.text,
    cookies: sess.jar,
  };

  if (j && j.Success) {
    for (const [key, rel] of Object.entries({ back: j.Image, shadow: j.PuzzleImage })) {
      const url = IMG_BASE + encodeURI(rel);
      const ir = await C.request({ url });
      const fp = path.join(outDir, key + '.png');
      fs.writeFileSync(fp, ir.buf);
      rec[key] = { url, status: ir.status, bytes: ir.buf.length, path: fp };
    }
    const { PNG } = require('pngjs');
    for (const key of ['back', 'shadow']) {
      try {
        const p = PNG.sync.read(fs.readFileSync(rec[key].path));
        rec[key].size = [p.width, p.height];
      } catch (e) { rec[key].sizeErr = e.message; }
    }
  }

  const f = C.saveJson(`init_${stamp}.json`, rec);
  console.log(JSON.stringify(rec, null, 1));
  console.log('\nsaved:', f);
  if (j && j.Success) console.log('\nCERTIFY_ID=' + j.CertifyId + '\nINIT_JSON=' + f);
}
main().catch(e => { console.error('ERR', e.stack || e.message); process.exit(1); });
