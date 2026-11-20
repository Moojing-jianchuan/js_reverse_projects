/**
 * captcha/call 的 `d` 攻关：在 jsdom(env_patch) 里跑 pyuntu.js，
 *  1) 包 JSON.stringify 抓"加密前的明文"；
 *  2) 包 XHR 抓真实 body（d / sign）；
 *  3) 用长度关系反推 d 对应哪一条明文（密文→UTF8→base64 的膨胀比可算）。
 * 用法: node scripts/cap_d_capture.js [dewuCap 入参 JSON]
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const env = createEnv({ blockNetwork: true, traceReads: false });
const w = env.window;

// ---- 1) 抓 JSON.stringify 明文（pyuntu 用 JSON.stringify 生成 d 的明文）----
const jsCalls = [];
const origStringify = w.JSON.stringify.bind(w.JSON);
w.JSON.stringify = function (v, r, s) {
  const out = origStringify(v, r, s);
  if (typeof out === 'string' && out.length > 60 && jsCalls.length < 80) {
    jsCalls.push({ len: out.length, text: out });
  }
  return out;
};

// ---- 2) 抓 XHR ----
const xhrs = [];
const XHR = w.XMLHttpRequest;
const P = XHR.prototype;
const oOpen = P.open, oSend = P.send, oSet = P.setRequestHeader;
P.open = function (m, u) { this.__c = { method: m, url: String(u), headers: {} }; return oOpen.apply(this, arguments); };
P.setRequestHeader = function (k, v) { if (this.__c) this.__c.headers[k] = String(v); return oSet.apply(this, arguments); };
P.send = function (b) {
  if (this.__c) { this.__c.body = b == null ? null : String(b); xhrs.push(this.__c); }
  return oSend.apply(this, arguments);
};

// ---- 3) 载入 pyuntu 并调用 ----
env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
console.log('dewuCap:', typeof w.dewuCap, '| yd_md5:', typeof w.yd_md5, '| base64js:', typeof w.base64js);

const argText = process.argv[2] || '{}';
let arg; try { arg = JSON.parse(argText); } catch (e) { arg = argText; }
console.log('dewuCap 入参:', JSON.stringify(arg));

// 载入后再挂一层 base64js 观测
let b64calls = [];
if (w.base64js) {
  const oFrom = w.base64js.fromByteArray, oTo = w.base64js.toByteArray;
  w.base64js.fromByteArray = function (bytes) {
    const out = oFrom.call(w.base64js, bytes);
    b64calls.push({ api: 'fromByteArray', inLen: bytes && bytes.length, outLen: String(out).length, outHead: String(out).slice(0, 80) });
    return out;
  };
  w.base64js.toByteArray = function (s) {
    const out = oTo.call(w.base64js, s);
    b64calls.push({ api: 'toByteArray', inLen: String(s).length, outLen: out && out.length });
    return out;
  };
}

let ret, err;
try { ret = w.dewuCap(arg); } catch (e) { err = e; }
console.log('同步返回:', ret === undefined ? 'undefined' : String(ret).slice(0, 300));
if (err) console.log('同步异常:', String(err.message).slice(0, 200));

setTimeout(() => {
  console.log('\n===== XHR（' + xhrs.length + '） =====');
  for (const c of xhrs) {
    console.log(c.method, c.url, '| bodyLen', (c.body || '').length);
    console.log('  headers:', JSON.stringify(c.headers));
    try {
      const j = JSON.parse(c.body);
      for (const k of Object.keys(j)) console.log('   field', k, 'len', String(j[k]).length, 'head', JSON.stringify(String(j[k]).slice(0, 100)));
      fs.writeFileSync(path.join(ROOT, 'artifacts/cap_call_body.json'), c.body);
    } catch (e) { console.log('  body:', String(c.body).slice(0, 300)); }
  }

  console.log('\n===== netLog =====');
  for (const n of env.netLog || []) console.log('  ', n.method || '?', n.url, '| bodyLen', n.body ? String(n.body).length : 0);

  console.log('\n===== JSON.stringify 捕获（' + jsCalls.length + '） =====');
  // 目标：d 的长度
  let dLen = 0;
  for (const c of xhrs) {
    try { const j = JSON.parse(c.body); if (j && j.d) dLen = String(j.d).length; } catch (e) { }
  }
  console.log('  实际 d 长度 =', dLen);
  for (const c of jsCalls) {
    // d = base64(utf8(bytechar(cipher)))，cipher 长度 = 明文长度（流密码）
    const h1 = 4 * Math.ceil(c.len / 3);            // 密文字节都 <0x80
    const h2 = 4 * Math.ceil((c.len * 2) / 3);      // 密文字节都 >=0x80
    const mark = dLen && (Math.abs(h1 - dLen) <= 8 || Math.abs(h2 - dLen) <= 8) ? '  <== 长度吻合' : '';
    console.log('  len', c.len, 'H1', h1, 'H2', h2, mark);
    console.log('      ', JSON.stringify(c.text.slice(0, 400)));
  }

  console.log('\n===== base64js 调用（' + b64calls.length + '） =====');
  for (const b of b64calls.slice(0, 20)) console.log('  ', JSON.stringify(b));

  fs.writeFileSync(path.join(ROOT, 'artifacts/cap_d_capture.json'), JSON.stringify({ jsCalls, xhrs, b64calls, dLen }, null, 1));
  console.log('\n已存 artifacts/cap_d_capture.json');
  env.dispose();
  process.exit(0);
}, 2000);
