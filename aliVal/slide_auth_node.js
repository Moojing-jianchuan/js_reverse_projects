// 纯 Node：InitCaptcha(deviceToken) → data(浏览器生成) → slideAuth
const https = require('https');
const fs = require('fs');

function postForm(url, params, extraHeaders = {}) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
        'Origin': 'https://tool.manmanbuy.com',
        'Referer': 'https://tool.manmanbuy.com/m/aliVal.aspx',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*',
        ...extraHeaders,
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
  const init = JSON.parse(fs.readFileSync('config/init_result.json', 'utf8'));
  const deviceToken = fs.readFileSync('config/token_verify.txt', 'utf8').trim();
  const data = fs.readFileSync('config/data_from_page.txt', 'utf8').trim();
  const param = JSON.stringify({ sceneId: 'vollz84f', certifyId: init.CertifyId, deviceToken, data });
  console.log('certifyId:', init.CertifyId, '| dataLen:', data.length);
  const r = await postForm('https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth', { captchaVerifyParam: param }, {
    Cookie: fs.existsSync('config/site_cookie.txt') ? fs.readFileSync('config/site_cookie.txt', 'utf8').trim() : '',
  });
  console.log('HTTP', r.status);
  console.log('响应:', r.body);
  const ok = /"captchaVerifyResult":true/.test(r.body);
  console.log(ok ? '\n✅ S3 命中：slideAuth 通过' : '\n❌ slideAuth 未通过');
}
main().catch(e => console.error('ERR', e.message));
