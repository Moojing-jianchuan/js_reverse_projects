/**
 * 定位"浏览器类型分支"的判别键：分别改 userAgent / appVersion / vendor / productSub，
 * 看 keystream 是否切换。用已知 KS(FF) 前 8 字节做指纹比对。
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const L = require('../src/preinforce_loader.js');
const ROOT = path.resolve(__dirname, '..');
const KS = L.getKeystream();
const KS8 = KS.slice(0, 8).toString('hex');

const FF = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function cipherOf(d) {
  const raw = Buffer.from(d, 'base64');
  const s = raw.toString('utf8');
  return Buffer.from([...s].map(c => c.charCodeAt(0) & 0xff));
}

async function cap(patch) {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
  if (patch) {
    for (const [k, v] of Object.entries(patch)) {
      try { Object.defineProperty(w.navigator, k, { get: () => v, configurable: true }); } catch (e) { }
    }
  }
  const strings = [];
  const oStr = w.JSON.stringify.bind(w.JSON);
  w.JSON.stringify = function (v, r, s) { const out = oStr(v, r, s); if (typeof out === 'string' && out.length > 60) strings.push(out); return out; };
  const xhrs = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send;
  P.open = function () { this.__c = {}; return oOpen.apply(this, arguments); };
  P.send = function (b) { if (this.__c) { this.__c.body = b == null ? null : String(b); xhrs.push(this.__c); } return oSend.apply(this, arguments); };
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  try { w.dewuCap({}); } catch (e) { }
  return new Promise(resolve => {
    setTimeout(() => {
      let d = null;
      for (const c of xhrs) { try { const j = JSON.parse(c.body); if (j.d) d = j.d; } catch (e) { } }
      env.dispose();
      if (!d) return resolve(null);
      const cipher = cipherOf(d);
      const plain = strings.find(s => s.length === cipher.length);
      if (!plain) return resolve({ d, cipher, plain: null });
      const pb = Buffer.from(plain, 'utf8');
      const ks = Buffer.alloc(Math.min(pb.length, cipher.length));
      for (let i = 0; i < ks.length; i++) ks[i] = pb[i] ^ cipher[i];
      resolve({ d, cipher, plain, ks });
    }, 1400);
  });
}

const cases = [
  ['Chrome UA (原始)', { userAgent: CHROME }],
  ['Chrome UA + Firefox/152.0', { userAgent: CHROME + ' Firefox/152.0' }],
  ['Chrome UA 去掉 AppleWebKit', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36' }],
  ['只有 Chrome/131', { userAgent: 'Chrome/131.0.0.0' }],
  ['空 UA', { userAgent: '' }],
];

(async () => {
  for (const [label, patch] of cases) {
    const r = await cap(patch);
    if (!r || !r.ks) { console.log(label.padEnd(34), '→ 捕获失败'); continue; }
    const head8 = r.ks.slice(0, 8).toString('hex');
    console.log(label.padEnd(34), '→ plain', String(r.plain.length).padStart(4),
      '| ks8', head8, head8 === KS8 ? '✅ 同一张表(FF)' : '❌ 换表');
  }
  process.exit(0);
})();
