// 纯 Node：用浏览器产出的 deviceToken 调 InitCaptcha（验证 deviceToken 可复用）
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { sign, KEYS } = require('./utils/crypto');

const SCENE_ID = 'vollz84f';
const INIT_URL = 'https://1sfr0c.captcha-open.aliyuncs.com/';

function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
        'Origin': 'https://tool.manmanbuy.com',
        'Referer': 'https://tool.manmanbuy.com/',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function main() {
  const deviceToken = fs.readFileSync('config/token_verify.txt', 'utf8').trim();
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
    DeviceToken: deviceToken,
    SignatureNonce: crypto.randomUUID(),
  };
  if (process.argv[2] === 'withCertify') params.CertifyId = process.argv[3];
  params.Signature = sign(params, KEYS.KEY_SECRET);
  console.log('请求参数键:', Object.keys(params).join(','));
  const r = await postForm(INIT_URL, params);
  console.log('HTTP', r.status);
  console.log(r.body.slice(0, 1200));
  try {
    const j = JSON.parse(r.body);
    if (j.Success) {
      fs.writeFileSync('config/init_result.json', JSON.stringify(j, null, 1));
      console.log('\n✅ InitCaptcha 成功（deviceToken 可复用）: CertifyId=' + j.CertifyId + ' Image=' + j.Image);
    } else {
      console.log('\n❌ InitCaptcha 失败: Code=' + j.Code + ' Message=' + j.Message);
    }
  } catch (e) { }
}
main().catch(e => console.error('ERR', e.message));
