// 常驻 token 服务：一次加载 SDK/env，之后每行 <seed> <ts> 立即返回 token。
// 用途：把「seed → token」压到几十毫秒，排除 token TTL 导致的 38。
const fs = require('fs');
const path = require('path');
const { buildSandbox } = require('../env_jsdom.js');

function pickSdk() {
  const dir = path.join(__dirname, '..', 'config');
  const cand = fs.readdirSync(dir).filter((f) => /^_sdk_.*\.js$/.test(f) && !f.includes('.inst.'));
  return path.join(dir, cand.sort().pop());
}

const sdkFile = pickSdk();
const win = buildSandbox(fs.readFileSync(sdkFile, 'utf8'), {
  url: 'https://www.zhipin.com/web/passport/zp/security.html',
});
process.stdout.write('READY\n');

let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const [seed, rawTs] = line.split(' ');
    const tz = new Date().getTimezoneOffset();
    const ts = parseInt(rawTs, 10) + (480 + tz) * 60000;
    try {
      process.stdout.write(String(new win.ABC().z(seed, ts)) + '\n');
    } catch (e) {
      process.stdout.write('ERR ' + (e && e.message) + '\n');
    }
  }
});
