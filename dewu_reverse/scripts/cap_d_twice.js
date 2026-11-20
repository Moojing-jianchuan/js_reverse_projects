/**
 * 连续两次 dewuCap -> 比较 keystream，判定"流密钥是否常量"（=硬编码/时间派生/随机）。
 * 同时把完整明文（d 的明文 JSON）落盘，供字段清单使用。
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

function run(n, opts) {
  const env = createEnv(Object.assign({ blockNetwork: true, traceReads: false }, opts || {}));
  const w = env.window;
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

  const out = [];
  let pending = n;
  const calls = [];
  for (let i = 0; i < n; i++) calls.push(i);
  const doCall = (i) => {
    try { w.dewuCap({}); } catch (e) { console.log('  dewuCap 抛错', e.message); }
  };
  // 串行：每次间隔 250ms，等异步完成
  let idx = 0;
  const tick = () => {
    if (idx < n) { doCall(idx); idx++; setTimeout(tick, 350); }
    else setTimeout(finish, 600);
  };
  const finish = () => {
    const usable = [];
    for (const c of xhrs) {
      try {
        const j = JSON.parse(c.body);
        if (!j.d) continue;
        const cipher = decodeD(j.d);
        const plain = strings.find(s => s.length === cipher.length);
        if (!plain) { usable.push({ d: j.d, sign: j.sign, cipherLen: cipher.length, plain: null }); continue; }
        const pb = Buffer.from(plain, 'utf8');
        const ks = Buffer.alloc(cipher.length);
        for (let k = 0; k < cipher.length; k++) ks[k] = pb[k] ^ cipher[k];
        usable.push({ d: j.d, sign: j.sign, cipherLen: cipher.length, plain, ks });
      } catch (e) { }
    }
    env.dispose();
    return usable;
  };
  // 手动驱动
  return new Promise(resolve => {
    const runner = () => {
      if (idx < n) { doCall(idx); idx++; setTimeout(runner, 350); }
      else setTimeout(() => resolve(finish()), 700);
    };
    runner();
  });
}

(async () => {
  const a = await run(2);
  console.log('第 1 个 env：捕获', a.length, '个 captcha 请求');
  for (const r of a) console.log('  d.len', r.d.length, 'cipherLen', r.cipherLen, 'sign', r.sign, 'plain?', !!r.plain);
  if (a.length >= 2 && a[0].ks && a[1].ks) {
    const x = a[0].ks, y = a[1].ks;
    let same = 0; const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) if (x[i] === y[i]) same++;
    console.log('\n同一 env 两次 keystream 相同字节:', same, '/', n);
    console.log('  ks1[0..32]', x.slice(0, 32).toString('hex'));
    console.log('  ks2[0..32]', y.slice(0, 32).toString('hex'));
  }
  if (a[0] && a[0].plain) {
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_plain_call.json'), a[0].plain);
    if (a[0].ks) fs.writeFileSync(path.join(ROOT, 'artifacts/cap_keystream_call.bin'), a[0].ks);
    console.log('\n已存 artifacts/cap_plain_call.json （', a[0].plain.length, '字符）');
  }
  // 第二个 env（全新实例）对比
  const b = await run(1);
  if (a[0] && a[0].ks && b[0] && b[0].ks) {
    const x = a[0].ks, y = b[0].ks;
    const n = Math.min(x.length, y.length);
    let same = 0; for (let i = 0; i < n; i++) if (x[i] === y[i]) same++;
    console.log('\n跨 env 实例 keystream 相同字节:', same, '/', n);
  }
  process.exit(0);
})();
