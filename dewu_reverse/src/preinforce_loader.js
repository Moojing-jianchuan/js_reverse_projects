#!/usr/bin/env node
/**
 * preinforce_loader.js —— 得物 PC 端风控 SDK 本地驱动器
 * ============================================================================
 * 三条能力，互相独立：
 *
 *   A. 纯算法（不依赖 jsdom / 网络）
 *      buildD(plainObjOrString)    明文 -> d
 *      decryptD(d)                 d    -> 明文
 *      signD(d)                    d    -> sign
 *      buildCaptchaBody(plain)     -> {"d":...,"sign":...}
 *
 *   B. 原始 SDK 出值（jsdom + src/env_patch.js，真跑 pyuntu.js）
 *      runSdkCaptcha(config)       调 window.dewuCap(config)，抓它自己发出的 body
 *      用途：对拍、以及在明文里带 dje/环境字段时取"SDK 原生结果"
 *
 *   C. fun 内省（preinforce2 挂出来的那个对象）
 *      introspectFun()             类型 / 原型方法 / arity / 读值清单 / 一次采样
 *
 * 用法：
 *   node src/preinforce_loader.js demo            # 跑一遍全链路自检
 *   node src/preinforce_loader.js sdk             # 只跑 SDK 出值
 *   node src/preinforce_loader.js fun             # 只跑 fun 内省
 *   node src/preinforce_loader.js crypt "<json>"  # 明文 -> d + sign
 *
 * 结论摘要（详见 docs/preinforce_report.md 与 docs/cap_d_plaintext.md）：
 *   d = base64( UTF8( each-byte-as-char( plaintext_utf8 XOR KS ) ) )
 *   KS = 由 sk 决定的确定性常量流（sk 为空 + Firefox UA 时 = artifacts/keystream.bin）
 *        —— 换 sk / 换浏览器族都会整张换表，与时间、随机、明文长度无关。
 *   sign = md5("d" + d + "048a9c4943398714b356a696503d2d36")   ← 与 info 接口同一套 f()
 *   已对拍：本地重算的 d / sign / 整条 body 与 SDK 逐字节一致。
 *
 * ⚠️ KS 与 sk 强绑定：拿到新 sk 后必须重新标定（calibrateKeystream(sk)），
 *    否则用旧 KS 产出的 d 服务端解不开。calibrateKeystream 会离线跑一次原始 SDK。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const KS_PATH = path.join(ROOT, 'artifacts/keystream.bin');
const KS_JSON = path.join(ROOT, 'artifacts/keystream.json');
const SIGN_SALT = '048a9c4943398714b356a696503d2d36';

// ─────────────────────────────────────────────────────────────────────────────
// A. 纯算法
// ─────────────────────────────────────────────────────────────────────────────

let _ks = null;
/** 载入固定 keystream（硬编码常量；从 artifacts 读，缺失时回退 keystream.json 里的 base64） */
function getKeystream() {
  if (_ks) return _ks;
  if (fs.existsSync(KS_PATH)) {
    _ks = fs.readFileSync(KS_PATH);
  } else if (fs.existsSync(KS_JSON)) {
    _ks = Buffer.from(JSON.parse(fs.readFileSync(KS_JSON, 'utf8')).base64, 'base64');
  } else {
    throw new Error('缺少 keystream：先跑 node scripts/extract_keystream.js');
  }
  if (_ks.length < 64) throw new Error('keystream 太短: ' + _ks.length);
  return _ks;
}

/**
 * 明文 -> d
 * @param {object|string} input  对象会按 Object.keys 顺序 JSON.stringify（与 SDK 的 JSON.stringify 一致）
 * @param {Buffer} [ks]
 */
function buildD(input, ks) {
  const plain = typeof input === 'string' ? input : JSON.stringify(input);
  const k = ks || getKeystream();
  const p = Buffer.from(plain, 'utf8');
  if (p.length > k.length) {
    throw new Error('明文 ' + p.length + ' 字节超过已知 keystream ' + k.length +
      ' 字节；跑 scripts/extract_keystream.js（把 UA 撑长）再抽一段');
  }
  const cipher = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) cipher[i] = p[i] ^ k[i];
  // 关键一步：每个密文字节当成一个 0..255 的"字符"，再按 UTF-8 编码，最后 base64。
  // 这一步就是抓包里 d 呈 "mojibake base64"（w6rCkMKQ...）的原因。
  const latin1 = cipher.toString('latin1');
  return Buffer.from(latin1, 'utf8').toString('base64');
}

/** d -> 明文（解密：反向两步） */
function decryptD(d, ks) {
  const k = ks || getKeystream();
  const raw = Buffer.from(String(d), 'base64');
  const s = raw.toString('utf8');
  const cipher = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) cipher[i] = s.charCodeAt(i) & 0xff;
  const plain = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) plain[i] = cipher[i] ^ k[i];
  return plain.toString('utf8');
}

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/** captcha 的 sign：与 info 接口同一个 f()，参数对象就是 {d} */
function signD(d) {
  return md5('d' + d + SIGN_SALT);
}

/** 完整 captcha 请求体。ks 省略时用内置 keystream（仅对 sk='' 有效） */
function buildCaptchaBody(input, ks) {
  const d = buildD(input, ks);
  return { d, sign: signD(d) };
}

/**
 * 标定：给定 sk（含空串），离线跑一次原始 SDK，抽出与本次 sk 配套的 keystream。
 * 返回的 Buffer 可直接喂给 buildD(input, ks)。
 *
 * 为什么需要它：KS = F(sk, 浏览器族)。sk 一变整张表都变（实测 sk='' / 96×'A' / 96×'B' 三张互不相同）。
 * @param {string} sk      会话令牌（cookie 'sk' 或 localStorage['sk']；没有就传 ''）
 * @param {object} [opts]  { uaFamily:'firefox'|'chrome', pad: 额外拉长明文的字节数, wait }
 */
async function calibrateKeystream(sk, opts) {
  const o = opts || {};
  const pad = o.pad === undefined ? 800 : o.pad;   // UA 会在明文里出现两次，pad=800 → 明文 +1600
  const UA = o.uaFamily === 'chrome'
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
  const cap = await runSdkCaptcha({}, {
    wait: o.wait || 1500,
    storage: sk === undefined || sk === null ? {} : { sk: String(sk) },
    userAgent: UA + (pad ? ' P' + 'x'.repeat(pad) : ''),
  });
  if (!cap.parsed || !cap.plain) throw new Error('标定失败：没有拿到 (明文, d) 对');
  const cipher = (() => {
    const raw = Buffer.from(cap.parsed.d, 'base64');
    const s = raw.toString('utf8');
    return Buffer.from([...s].map(c => c.charCodeAt(0) & 0xff));
  })();
  const p = Buffer.from(cap.plain, 'utf8');
  if (p.length !== cipher.length) throw new Error('标定失败：明文/密文长度不一致 ' + p.length + ' vs ' + cipher.length);
  const ks = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) ks[i] = p[i] ^ cipher[i];
  return ks;
}

/**
 * captcha/call 的明文骨架（字段顺序 = SDK 里的对象字面量顺序，顺序影响密文与 sign）。
 * 顶层只有 5 个键：bcv / type / c / webp / data（sessionID 只在 verify 阶段出现）。
 * 说明：值为占位/取自本地环境实测，真实使用时按需替换。
 */
function callPlainTemplate(over) {
  const o = over || {};
  const data = Object.assign({
    yt: 2,
    dua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    dpl: '',
    dnt: 'wifi',
    dje: randomDje(),
    dwd: -1, dbh: 969, dbw: 1906, dsl: 0, dst: 0,
    dow: 1920, doh: 1032, dsw: 1920, dsh: 1080, dbwh: 969, dbww: 1906,
    dor: -1, dcd: 24, dpr: 1.25, dsaw: 1920, dsah: 1032, dsal: 0, dsat: 0,
    dte: 1, dwte: 1, dmtp: 0, dm: 'PC',
    sk: '', shumeiId: 'normal', dul: 'https://www.dewu.com/', userId: '', appid: 'h5',
    jcmp: {
      dlocalSk: null, dtagn: '', dtitle: '', dcapno: '',
      dscreenwidth: 1920, dpagewidth: '', dscreenheigh: 1080, dpageheigh: '',
      dua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
      dlanguage: 'zh-CN', dwebdriver: false
    },
    dtz: 'Asia/Shanghai'
  }, o.data || {});
  return {
    bcv: o.bcv || '1.3.1.20260331',
    type: o.type === undefined ? 0 : o.type,
    c: o.c || 'v=1.3.1.20260331|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0',
    webp: o.webp === undefined ? 0 : o.webp,
    data: JSON.stringify(data),
  };
}

/** dje：SDK 每次调用新生成的 32 字符随机串（与加密无关，只是明文里的一个字段） */
function randomDje() {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.randomBytes(32);
  let s = '';
  for (let i = 0; i < 32; i++) s += A[b[i] % A.length];
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. 原始 SDK 出值（jsdom）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 真跑 pyuntu.js，调 dewuCap(config)，截获它自己发出的 captcha/call body。
 * @returns {Promise<{body:string, parsed:object, plain:string|null, xhrs:Array}>}
 */
function runSdkCaptcha(config, opts) {
  const o = opts || {};
  const { createEnv } = require('../src/env_patch');
  const env = createEnv({ blockNetwork: o.blockNetwork !== false, traceReads: false, seedStorage: o.storage || {} });
  const w = env.window;

  // 可选：整体改写 UA（会连带切换 keystream 表，标定时用得到）
  if (o.userAgent) {
    try {
      Object.defineProperty(w.navigator, 'userAgent', { get: () => o.userAgent, configurable: true });
      Object.defineProperty(w.navigator, 'appVersion', { get: () => o.userAgent.replace('Mozilla/', ''), configurable: true });
    } catch (e) { }
  }

  const strings = [];
  const origStringify = w.JSON.stringify.bind(w.JSON);
  w.JSON.stringify = function (v, r, s) {
    const out = origStringify(v, r, s);
    if (typeof out === 'string' && out.length > 60) strings.push(out);
    return out;
  };
  const xhrs = [];
  const P = w.XMLHttpRequest.prototype;
  const pOpen = P.open, pSend = P.send, pSet = P.setRequestHeader;
  P.open = function (m, u) { this.__cap = { method: m, url: String(u), headers: {} }; return pOpen.apply(this, arguments); };
  P.setRequestHeader = function (k, v) { if (this.__cap) this.__cap.headers[k] = String(v); return pSet.apply(this, arguments); };
  P.send = function (b) { if (this.__cap) { this.__cap.body = b == null ? null : String(b); xhrs.push(this.__cap); } return pSend.apply(this, arguments); };

  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  let ret;
  try { ret = w.dewuCap(config || {}); } catch (e) { ret = { error: String(e && e.message) }; }

  return new Promise(resolve => {
    setTimeout(() => {
      let parsed = null, plain = null;
      const hit = xhrs.find(c => /captcha\/call|captcha\/verify/.test(c.url));
      if (hit && hit.body) {
        try {
          parsed = JSON.parse(hit.body);
          if (parsed.d) {
            const cipher = (() => {
              const raw = Buffer.from(parsed.d, 'base64');
              const s = raw.toString('utf8');
              return Buffer.from([...s].map(ch => ch.charCodeAt(0) & 0xff));
            })();
            plain = strings.find(x => x.length === cipher.length) || null;
          }
        } catch (e) { }
      }
      resolve({ ret, body: hit ? hit.body : null, parsed, plain, xhrs, env });
    }, o.wait || 1500);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// C. fun 内省（preinforce2）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * preinforce2 在 window 上挂 `fun` / `base64js` / `jsdVipUserMark`。
 * fun 是匿名类实例：自有属性为空，方法在原型上（Fun110 / Fun99），arity 均为 5。
 */
function introspectFun() {
  const { createEnv } = require('../src/env_patch');
  const env = createEnv({ blockNetwork: true, traceReads: false });
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8'), 'preinforce2.js');
  const w = env.window;
  const fun = w.fun;
  const out = {
    typeofFun: typeof fun,
    ownKeys: fun && Object.getOwnPropertyNames(fun),
    protoKeys: fun && Object.getOwnPropertyNames(Object.getPrototypeOf(fun)),
    json: fun && (() => { try { return JSON.stringify(fun); } catch (e) { return null; } })(),
    arity: {},
    samples: {},
    reads: {},
    base64jsKeys: w.base64js && Object.keys(w.base64js),
    jsdVipUserMark: w.jsdVipUserMark,
  };
  if (fun) {
    for (const k of ['Fun110', 'Fun99']) {
      if (typeof fun[k] === 'function') out.arity[k] = fun[k].length;
    }
    // 读值追踪：Proxy 住 navigator/screen，看 Fun110 到底读什么
    try {
      const reads = [];
      for (const [name, obj] of [['navigator', w.navigator], ['screen', w.screen]]) {
        if (!obj) continue;
        const px = new Proxy(obj, {
          get(t, k) { if (typeof k === 'string') reads.push(name + '.' + k); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; }
        });
        try { Object.defineProperty(w, name, { value: px, configurable: true, writable: true }); } catch (e) { }
      }
      out.samples.Fun110 = fun.Fun110();
      out.reads.Fun110 = [...new Set(reads)];
    } catch (e) { out.reads.Fun110 = 'THROW: ' + String(e && e.message).slice(0, 120); }
    try { out.samples.Fun99_object = fun.Fun99({ a: 1, b: [1, 2] }, '', '', ''); } catch (e) { out.samples.Fun99_object = 'THROW'; }
    try { out.samples.Fun99_string = fun.Fun99('hello', '', '', ''); } catch (e) { out.samples.Fun99_string = 'THROW'; }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2] || 'demo';

  if (cmd === 'crypt') {
    const txt = process.argv[3] || JSON.stringify(callPlainTemplate());
    const body = buildCaptchaBody(txt);
    console.log(JSON.stringify({ dLen: body.d.length, sign: body.sign, body }, null, 1));
    return;
  }

  if (cmd === 'fun') {
    const info = introspectFun();
    console.log(JSON.stringify(info, null, 1));
    return;
  }

  if (cmd === 'sdk') {
    const r = await runSdkCaptcha({});
    console.log('bodyLen:', r.body && r.body.length);
    console.log('fields :', r.parsed && Object.keys(r.parsed));
    console.log('d.len  :', r.parsed && r.parsed.d.length, '| sign:', r.parsed && r.parsed.sign);
    console.log('plain  :', r.plain && r.plain.length, 'chars');
    r.env.dispose();
    return;
  }

  // demo：全链路自检
  console.log('=== 1) keystream ===');
  const ks = getKeystream();
  console.log('  len', ks.length, '| head64hex', ks.slice(0, 64).toString('hex'));

  console.log('\n=== 2) 原始 SDK 出值（jsdom 跑 pyuntu.js）===');
  const r = await runSdkCaptcha({});
  if (!r.parsed) { console.log('  未捕获到 captcha 请求'); }
  else {
    console.log('  d.len', r.parsed.d.length, '| sign', r.parsed.sign, '| 明文', r.plain ? r.plain.length : 'n/a');
    console.log('\n=== 3) 对拍：本地重算 ===');
    const mine = buildCaptchaBody(r.plain);
    console.log('  d 一致    :', mine.d === r.parsed.d);
    console.log('  sign 一致 :', mine.sign === r.parsed.sign);
    console.log('  body 一致 :', JSON.stringify({ d: mine.d, sign: mine.sign }) === r.body);
    console.log('\n=== 4) 解密回来的明文（前 400）===');
    console.log(' ', decryptD(r.parsed.d).slice(0, 400));
  }
  r.env && r.env.dispose();

  console.log('\n=== 5) fun 内省 ===');
  const f = introspectFun();
  console.log('  typeof', f.typeofFun, '| own', JSON.stringify(f.ownKeys), '| proto', JSON.stringify(f.protoKeys));
  console.log('  arity', JSON.stringify(f.arity));
  console.log('  Fun110 读值:', JSON.stringify(f.reads.Fun110));
  console.log('  Fun110 采样:', JSON.stringify(f.samples.Fun110 || null).slice(0, 240));
  console.log('  Fun99(object):', JSON.stringify(f.samples.Fun99_object), '| Fun99(string):', JSON.stringify(f.samples.Fun99_string));
}

module.exports = {
  // A
  getKeystream, buildD, decryptD, signD, buildCaptchaBody, callPlainTemplate, randomDje,
  md5, SIGN_SALT,
  // A'
  calibrateKeystream,
  // B
  runSdkCaptcha,
  // C
  introspectFun,
};

if (require.main === module) {
  main().catch(e => { console.error('ERR', e && e.message); process.exit(1); });
}
