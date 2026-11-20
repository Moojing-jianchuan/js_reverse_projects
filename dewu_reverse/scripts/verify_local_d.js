/**
 * 对拍：用抽出来的固定 keystream 在本地重算 d，与 SDK 实际产出的 d 逐字节比较。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('../src/env_patch');
const ROOT = path.resolve(__dirname, '..');

const KS = fs.readFileSync(path.join(ROOT, 'artifacts/keystream.bin'));

/** 本地实现：明文 -> d */
function encD(plaintext, ks) {
  const p = Buffer.from(plaintext, 'utf8');
  const c = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) c[i] = p[i] ^ ks[i % ks.length];
  // 每个密文字节 -> 一个 0..255 的字符 -> UTF-8 编码 -> base64
  const latin1 = c.toString('latin1');
  return Buffer.from(latin1, 'utf8').toString('base64');
}
function decD(d) {
  const raw = Buffer.from(d, 'base64');
  const s = raw.toString('utf8');
  return Buffer.from([...s].map(ch => ch.charCodeAt(0) & 0xff));
}
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const SALT = '048a9c4943398714b356a696503d2d36';
const signOf = d => md5('d' + d + SALT);

(async () => {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
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

  setTimeout(() => {
    let body = null;
    for (const c of xhrs) { try { const j = JSON.parse(c.body); if (j.d) body = j; } catch (e) { } }
    if (!body) { console.log('未捕获到 d'); process.exit(1); }
    const cipher = decD(body.d);
    const plain = strings.find(x => x.length === cipher.length);
    console.log('SDK 产出: d.len =', body.d.length, '| 密文长度 =', cipher.length, '| sign =', body.sign);
    console.log('明文长度 =', plain ? plain.length : 'n/a');

    // 1) 密文 -> 明文
    const back = Buffer.alloc(cipher.length);
    for (let i = 0; i < cipher.length; i++) back[i] = cipher[i] ^ KS[i];
    const recon = back.toString('utf8');
    console.log('\n[1] 本地用固定 keystream 解出的明文 == 捕获明文 ?', recon === plain);
    if (recon !== plain) {
      let d1 = -1; for (let i = 0; i < Math.min(recon.length, plain.length); i++) if (recon[i] !== plain[i]) { d1 = i; break; }
      console.log('    首个差异位置:', d1);
    }

    // 2) 明文 -> d 重算
    const myD = encD(plain, KS);
    console.log('\n[2] 本地重算 d == SDK 的 d ?', myD === body.d, '| len', myD.length, 'vs', body.d.length);
    if (myD !== body.d) {
      let d1 = -1; for (let i = 0; i < Math.min(myD.length, body.d.length); i++) if (myD[i] !== body.d[i]) { d1 = i; break; }
      console.log('    首个差异位置:', d1, JSON.stringify(myD.slice(0, 60)), JSON.stringify(body.d.slice(0, 60)));
    }

    // 3) sign 重算
    console.log('\n[3] 本地 sign == SDK sign ?', signOf(body.d) === body.sign, '|', signOf(body.d), 'vs', body.sign);

    // 4) 整条 body 重算
    const myBody = JSON.stringify({ d: myD, sign: signOf(myD) });
    console.log('\n[4] 整条 body 逐字节一致 ?', myBody === JSON.stringify(body));
    console.log('    SDK :', JSON.stringify(body).slice(0, 120));
    console.log('    本地:', myBody.slice(0, 120));
    env.dispose();
    process.exit(0);
  }, 1500);
})();
