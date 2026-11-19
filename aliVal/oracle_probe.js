// 阶段0：oracle 判定。4 组对照，每组独立 InitCaptcha + 一次 slideAuth
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { sign, KEYS } = require('./utils/crypto');

const SCENE_ID = 'vollz84f';
const INIT_URL = 'https://1sfr0c.captcha-open.aliyuncs.com/';
const TOKEN = fs.readFileSync('config/token_verify.txt', 'utf8').trim();
const DATA = fs.readFileSync('config/data_fresh.txt', 'utf8').trim();

function post(url, params, extraHeaders = {}) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
        'Origin': 'https://tool.manmanbuy.com', 'Referer': 'https://tool.manmanbuy.com/m/aliVal.aspx',
        'Accept': 'application/json, text/javascript, */*', 'X-Requested-With': 'XMLHttpRequest',
        ...extraHeaders,
      },
    }, (res) => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c).toString('utf8') })); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function initCaptcha() {
  const p = {
    AaduaneId: KEYS.KEY_ID, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', Format: 'JSON',
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), Version: '2023-03-05',
    Action: 'InitCaptcha', SceneId: SCENE_ID, Language: 'cn', DeviceToken: TOKEN,
    SignatureNonce: crypto.randomUUID(),
  };
  p.Signature = sign(p, KEYS.KEY_SECRET);
  const r = await post(INIT_URL, p);
  const j = JSON.parse(r.body);
  return j;
}

function mutate(dataB64, mode) {
  const buf = Buffer.from(dataB64, 'base64');
  if (mode === 'head') { buf[10] = buf[10] ^ 0xff; }
  if (mode === 'magic') { buf[0] = 0; buf[1] = 0; buf[2] = 0; }
  if (mode === 'trunc') return buf.slice(0, Math.max(16, buf.length - 32)).toString('base64');
  return buf.toString('base64');
}

async function one(label, mode) {
  const init = await initCaptcha();
  if (!init.Success) return { label, initErr: init.Code };
  const data = mode === 'raw' ? DATA : mutate(DATA, mode);
  const param = JSON.stringify({ sceneId: SCENE_ID, certifyId: init.CertifyId, deviceToken: TOKEN, data });
  const r = await post('https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth', { captchaVerifyParam: param });
  await new Promise(z => setTimeout(z, 300));
  return { label, certifyId: init.CertifyId, status: r.status, resp: r.body };
}

(async () => {
  const groups = [
    ['0a-control', 'raw'],
    ['0b-head-xor', 'head'],
    ['0c-magic-zero', 'magic'],
    ['0d-trunc', 'trunc'],
    ['0a2-control-repeat', 'raw'],
  ];
  const out = [];
  for (const [label, mode] of groups) {
    try { out.push(await one(label, mode)); } catch (e) { out.push({ label, err: e.message }); }
  }
  console.log(JSON.stringify(out, null, 1));
  const bodies = out.map(o => (o.resp || '').trim());
  console.log('\n响应体去重:', [...new Set(bodies)]);
  console.log('是否全部一致:', new Set(bodies).size === 1 ? 'YES（oracle 不可用）' : 'NO（存在差异，oracle 可用）');
})();
