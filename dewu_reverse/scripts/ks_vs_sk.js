/**
 * 决定性问题：keystream 到底由什么决定？
 * 对照组（全离线）：
 *   A sk='' + Firefox UA        （已知表 A：48b44cefa4f3ade2）
 *   B sk=96字符假值             （看 ks 是否变）
 *   C sk=另一个96字符值          （看是否随 sk 线性/派生）
 *   D sk='' + yuntuSession 预置  （看 session 是否影响）
 * 判据：ks 前 8 字节指纹 + 与表 A 的相同字节比例。
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const L = require('../src/preinforce_loader.js');
const ROOT = path.resolve(__dirname, '..');

const KS = L.getKeystream();
const F = KS.slice(0, 8).toString('hex');

function cipherOf(d) {
  const raw = Buffer.from(d, 'base64');
  const s = raw.toString('utf8');
  return Buffer.from([...s].map(c => c.charCodeAt(0) & 0xff));
}

async function cap({ sk, yuntuSession, skInCookie }) {
  const storage = {};
  if (sk !== undefined && !skInCookie) storage.sk = sk;
  if (yuntuSession) storage.yuntuSession = yuntuSession;
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: storage });
  const w = env.window;
  if (sk && skInCookie) {
    try { w.document.cookie = 'sk=' + sk; } catch (e) { }
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
      let ks = null;
      if (plain) {
        const pb = Buffer.from(plain, 'utf8');
        ks = Buffer.alloc(Math.min(pb.length, cipher.length));
        for (let i = 0; i < ks.length; i++) ks[i] = pb[i] ^ cipher[i];
      }
      resolve({ d, cipher, plain, ks });
    }, 1400);
  });
}

const SK1 = 'A'.repeat(96);
const SK2 = 'B'.repeat(96);

(async () => {
  const cases = [
    ['A sk 未设置 (基线)', { sk: undefined }],
    ['B sk=96×A (localStorage)', { sk: SK1 }],
    ['C sk=96×B (localStorage)', { sk: SK2 }],
    ['D sk=96×A (cookie)', { sk: SK1, skInCookie: true }],
    ['E sk 空串 + yuntuSession 预置', { sk: '', yuntuSession: '43Am1WCu-4538-5zx6-ZnQi-LK5G8ZroR3njYgB7' }],
  ];
  const rows = [];
  for (const [label, opt] of cases) {
    const r = await cap(opt);
    if (!r || !r.ks) { console.log(label.padEnd(32), '→ 捕获失败'); continue; }
    const head = r.ks.slice(0, 8).toString('hex');
    let same = 0; const n = Math.min(r.ks.length, KS.length);
    for (let i = 0; i < n; i++) if (r.ks[i] === KS[i]) same++;
    // sk 是否进了明文
    let skInPlain = 'n/a';
    try { skInPlain = JSON.parse(JSON.parse(r.plain).data).sk; } catch (e) { }
    console.log(label.padEnd(32), '→ plain', String(r.plain.length).padStart(4),
      '| ks8', head, head === F ? '≡表A' : '≠表A',
      '| 相同字节', (100 * same / n).toFixed(1) + '%',
      '| 明文.sk', JSON.stringify(String(skInPlain).slice(0, 12)));
    rows.push({ label, head, same, n, skInPlain });
  }
  fs.writeFileSync(path.join(ROOT, 'artifacts/ks_vs_sk.json'), JSON.stringify(rows, null, 1));
  process.exit(0);
})();
