/**
 * 抽取完整硬编码 keystream：把 UA 撑长，让明文变长，从而把 keystream 往后延伸。
 * 结论依据：keystream 与明文无关、前缀稳定（1301 vs 1355 完全一致）。
 * 产出 artifacts/keystream.bin + artifacts/keystream.json（含校验信息）
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const ROOT = path.resolve(__dirname, '..');

function decodeD(d) {
  const raw = Buffer.from(d, 'base64');
  const s = raw.toString('utf8');
  const b = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

async function capture(uaSuffix) {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
  if (uaSuffix) {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0' + uaSuffix;
    try {
      Object.defineProperty(w.navigator, 'userAgent', { get: () => ua, configurable: true });
      Object.defineProperty(w.navigator, 'appVersion', { get: () => ua.replace('Mozilla/', ''), configurable: true });
    } catch (e) { }
  }
  const strings = [];
  const oStr = w.JSON.stringify.bind(w.JSON);
  w.JSON.stringify = function (v, r, s) {
    const out = oStr(v, r, s);
    if (typeof out === 'string' && out.length > 60) strings.push(out);
    return out;
  };
  const xhrs = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send;
  P.open = function (m, u) { this.__c = {}; return oOpen.apply(this, arguments); };
  P.send = function (b) { if (this.__c) { this.__c.body = b == null ? null : String(b); xhrs.push(this.__c); } return oSend.apply(this, arguments); };
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  try { w.dewuCap({}); } catch (e) { }
  return new Promise(resolve => {
    setTimeout(() => {
      let d = null;
      for (const c of xhrs) { try { const j = JSON.parse(c.body); if (j.d) d = j.d; } catch (e) { } }
      let out = null;
      if (d) {
        const cipher = decodeD(d);
        const plain = strings.find(x => x.length === cipher.length);
        if (plain) {
          const pb = Buffer.from(plain, 'utf8');
          const ks = Buffer.alloc(cipher.length);
          for (let k = 0; k < cipher.length; k++) ks[k] = pb[k] ^ cipher[k];
          out = { len: cipher.length, ks, plain, d };
        }
      }
      env.dispose();
      resolve(out);
    }, 1500);
  });
}

(async () => {
  const r = await capture('-PADDING-'.padEnd(4200, 'X'));
  if (!r) { console.log('捕获失败'); process.exit(1); }
  console.log('明文/密文长度 =', r.len);
  const base = await capture('');
  console.log('基准长度 =', base ? base.len : 'n/a');
  if (base) {
    const n = Math.min(base.ks.length, r.ks.length);
    let same = 0; for (let i = 0; i < n; i++) if (base.ks[i] === r.ks[i]) same++;
    console.log('长明文 vs 基准 前缀一致字节:', same, '/', n);
  }
  fs.writeFileSync(path.join(ROOT, 'artifacts/keystream.bin'), r.ks);
  fs.writeFileSync(path.join(ROOT, 'artifacts/keystream.json'), JSON.stringify({
    len: r.len,
    sha256: crypto.createHash('sha256').update(r.ks).digest('hex'),
    head64hex: r.ks.slice(0, 64).toString('hex'),
    base64: r.ks.toString('base64'),
  }, null, 1));
  console.log('已存 artifacts/keystream.bin（', r.ks.length, '字节）, sha256 =', crypto.createHash('sha256').update(r.ks).digest('hex').slice(0, 32));
  console.log('前 64 字节 hex:', r.ks.slice(0, 64).toString('hex'));
  process.exit(0);
})();
