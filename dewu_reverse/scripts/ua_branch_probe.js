/**
 * 回答主会话的疑问：把 UA 换成 Chrome 后 d 解不开，是不是 pyuntu 按浏览器类型分支了？
 * 做法：同一 env 分别用 Firefox UA / Chrome UA 出 d，用同一 KS 解，比较密文与长度。
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const L = require('../src/preinforce_loader.js');

const ROOT = path.resolve(__dirname, '..');
const KS = L.getKeystream();

function cipherOf(d) {
  const raw = Buffer.from(d, 'base64');
  const s = raw.toString('utf8');
  return { rawLen: raw.length, cipher: Buffer.from([...s].map(c => c.charCodeAt(0) & 0xff)) };
}

async function cap(ua) {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
  if (ua) {
    try {
      Object.defineProperty(w.navigator, 'userAgent', { get: () => ua, configurable: true });
      Object.defineProperty(w.navigator, 'appVersion', { get: () => ua.replace('Mozilla/', ''), configurable: true });
    } catch (e) { }
  }
  const strings = [];
  const oStr = w.JSON.stringify.bind(w.JSON);
  w.JSON.stringify = function (v, r, s) { const out = oStr(v, r, s); if (typeof out === 'string' && out.length > 60) strings.push(out); return out; };
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
      env.dispose();
      resolve({ d, strings });
    }, 1400);
  });
}

const FF = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  for (const [label, ua] of [['Firefox UA', FF], ['Chrome UA', CHROME]]) {
    const r = await cap(ua);
    if (!r.d) { console.log(label, '未捕获 d'); continue; }
    const { rawLen, cipher } = cipherOf(r.d);
    console.log('\n===== ' + label + ' =====');
    console.log('  d.len', r.d.length, '| base64->bytes', rawLen, '| cipher len', cipher.length);
    // 用固定 KS 解
    const plain = Buffer.alloc(cipher.length);
    for (let i = 0; i < cipher.length; i++) plain[i] = cipher[i] ^ KS[i];
    const txt = plain.toString('utf8');
    console.log('  解密结果前 80:', JSON.stringify(txt.slice(0, 80)));
    let printable = (txt.match(/[ -~]/g) || []).length;
    console.log('  可打印率:', (printable / txt.length).toFixed(3));
    try { JSON.parse(txt); console.log('  → 是合法 JSON ✅'); } catch (e) { console.log('  → 不是 JSON ❌'); }
    // 找长度匹配的明文候选
    const cand = r.strings.filter(s => s.length === cipher.length);
    console.log('  长度匹配的明文候选数:', cand.length);
    for (const c of cand.slice(0, 3)) console.log('   ', JSON.stringify(c.slice(0, 90)));
    fs.writeFileSync(path.join(ROOT, 'artifacts/ua_' + (ua === CHROME ? 'chrome' : 'firefox') + '_d.json'), JSON.stringify({ d: r.d, plain: cand, decrypted: txt }, null, 1));
  }
  process.exit(0);
})();
