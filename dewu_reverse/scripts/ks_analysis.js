/**
 * keystream 性质分析：
 *  1) 周期性（是否短密钥重复）；
 *  2) 换明文长度（改 UA）后前缀是否一致 → 判定是"流密码"还是"按长度重算的块处理"；
 *  3) 是否等于 RC4(key) 之类已知构造（试常见 key 的 RC4）。
 */
const fs = require('fs');
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

function capture(userAgentPatch) {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
  if (userAgentPatch) {
    try {
      Object.defineProperty(w.navigator, 'userAgent', { get: () => userAgentPatch, configurable: true });
      Object.defineProperty(w.navigator, 'appVersion', { get: () => userAgentPatch.replace('Mozilla/', ''), configurable: true });
    } catch (e) { console.log('UA patch fail', e.message); }
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
  P.open = function (m, u) { this.__c = { m, u: String(u) }; return oOpen.apply(this, arguments); };
  P.send = function (b) { if (this.__c) { this.__c.body = b == null ? null : String(b); xhrs.push(this.__c); } return oSend.apply(this, arguments); };

  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  try { w.dewuCap({}); } catch (e) { }

  return new Promise(resolve => {
    setTimeout(() => {
      const res = [];
      for (const c of xhrs) {
        try {
          const j = JSON.parse(c.body);
          if (!j.d) continue;
          const cipher = decodeD(j.d);
          const plain = strings.find(s => s.length === cipher.length);
          if (!plain) { res.push({ cipherLen: cipher.length, plain: null }); continue; }
          const pb = Buffer.from(plain, 'utf8');
          const ks = Buffer.alloc(cipher.length);
          for (let k = 0; k < cipher.length; k++) ks[k] = pb[k] ^ cipher[k];
          res.push({ cipherLen: cipher.length, plain, ks, sign: j.sign, d: j.d });
        } catch (e) { }
      }
      env.dispose();
      resolve(res);
    }, 1200);
  });
}

const rc4 = (key, n) => {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 0xff; const t = S[i]; S[i] = S[j]; S[j] = t; }
  const out = Buffer.alloc(n);
  let i2 = 0; j = 0;
  for (let k = 0; k < n; k++) {
    i2 = (i2 + 1) & 0xff; j = (j + S[i2]) & 0xff;
    const t = S[i2]; S[i2] = S[j]; S[j] = t;
    out[k] = S[(S[i2] + S[j]) & 0xff];
  }
  return out;
};

(async () => {
  const base = await capture(null);
  console.log('基准捕获:', base.map(r => r.cipherLen));
  const K = base[0] && base[0].ks;

  // 周期性
  if (K) {
    let best = 0, bestScore = 0;
    for (let p = 1; p <= 256; p++) {
      let same = 0;
      for (let i = 0; i + p < K.length; i++) if (K[i] === K[i + p]) same++;
      const score = same / (K.length - p);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    console.log('周期扫描：最佳周期', best, '匹配率', bestScore.toFixed(3), '(0.004 附近=无周期)');
    console.log('KS 前 48 hex:', K.slice(0, 48).toString('hex'));
    const uniq = new Set(K);
    console.log('KS 不同字节值个数:', uniq.size, '/256 ；前 32 字节 SHA256:', require('crypto').createHash('sha256').update(K.slice(0, 32)).digest('hex').slice(0, 16));
  }

  // 换 UA 改变明文长度
  const long = await capture('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0 EXTRA-PADDING-XXXXXXXXXXXX');
  console.log('\n改 UA 后捕获:', long.map(r => r.cipherLen));
  if (long[0] && long[0].ks && K) {
    const n = Math.min(K.length, long[0].ks.length);
    let same = 0; for (let i = 0; i < n; i++) if (K[i] === long[0].ks[i]) same++;
    console.log('两个不同长度明文的前缀 keystream 相同字节:', same, '/', n);
  }

  // 试 RC4 常见 key
  if (K) {
    const keys = ['048a9c4943398714b356a696503d2d36', 'dewu', 'h5', '1.3.1.20260331', 'dw', 'jsdun', 'yuntu', 'risk-stone'];
    for (const kk of keys) {
      const t = rc4(Buffer.from(kk), 32);
      if (t.equals(K.slice(0, 32))) console.log('*** RC4(key=' + kk + ') 命中!');
    }
    console.log('（RC4 常见 key 无命中）');
  }

  // 落盘 KS（如果有）
  if (K) {
    fs.writeFileSync(path.join(ROOT, 'artifacts/keystream_1301.bin'), K);
    console.log('\n已存 artifacts/keystream_1301.bin');
  }
  process.exit(0);
})();
