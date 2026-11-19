// e2e_06_local_catch.js — 本地回环接收器：浏览器页面把 captchaVerifyParam POST 过来，落到文件
// 用法：node e2e_06_local_catch.js [port]
// 页面侧：fetch('http://127.0.0.1:18080/cvp', {method:'POST', body: cvp})
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2] || '18080', 10);
const OUT = path.join(__dirname, 'static', 'work', 'e2e', 'cvp_live.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    if (req.method === 'POST' && body.trim()) {
      let parsed = null, err = null;
      try { parsed = JSON.parse(body); } catch (e) { err = e.message; }
      const rec = { received_at: new Date().toISOString(), bytes: body.length, parseErr: err, cvp: parsed || body };
      fs.writeFileSync(OUT, JSON.stringify(rec, null, 1));
      console.log('[catch] bytes=%d certifyId=%s dataLen=%s', body.length,
        parsed ? parsed.certifyId : '?', parsed && parsed.data ? parsed.data.length : '?');
    }
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'text/plain' });
    res.end('ok');
  });
});
srv.listen(port, '127.0.0.1', () => console.log('listening on http://127.0.0.1:' + port + ' -> ' + OUT));
