/**
 * 延迟实验：dewuCap 在不同时间点调用，看 `c` 里的 rest/vrest/vreqt/sqt/ojst 怎么变。
 * 目的：确认 `c` 各字段的时间语义 → 直接回答"过期判定依据"。
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

async function captureWithDelay(delayMs) {
  const env = createEnv({ blockNetwork: true, traceReads: false });
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
  await new Promise(r => setTimeout(r, delayMs));
  const tCall = Date.now();
  try { w.dewuCap({}); } catch (e) { }
  return new Promise(resolve => {
    setTimeout(() => {
      let plain = null, d = null;
      for (const c of xhrs) {
        try { const j = JSON.parse(c.body); if (j.d) { d = j.d; } } catch (e) { }
      }
      if (d) {
        const n = decodeD(d).length;
        plain = strings.find(x => x.length === n) || null;
      }
      env.dispose();
      resolve({ delayMs, plain, d });
    }, 900);
  });
}

(async () => {
  for (const delay of [0, 900, 2500]) {
    const r = await captureWithDelay(delay);
    if (r.plain) {
      const j = JSON.parse(r.plain);
      console.log('delay=' + String(delay).padStart(4) + 'ms  c =', j.c);
    } else console.log('delay=' + delay + ' 未取到明文');
  }
  process.exit(0);
})();
