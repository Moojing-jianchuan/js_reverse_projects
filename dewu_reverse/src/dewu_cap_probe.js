/**
 * dewu_cap_probe.js —— captcha/call 的 `d` 载荷明文提取探针
 * ============================================================================
 * 目标：不反编译 JSVMP，而是在 env_patch 沙箱里把 `d` 加密前的明文捞出来。
 *
 * 已确证的事实（本模块的方法就是为它们设计的）：
 *   d = base64( UTF8( byteString( cipher ) ) )，cipher 是 **与明文等长的流密码密文**
 *   → 明文 = 一个 JSON 字符串，长度 == cipher 字节数（1301）
 *   → 加密调用点是 `{d: ENC(JSON.stringify(payload))}`（解混淆源码 @93525 可见）
 *
 * 抓法（按命中率排序，全部在 window 域内、加载 pyuntu 之后/之前按需安装）：
 *   1) window.JSON.stringify  —— 直接拿到加密前的明文（最有效，本模块主路径）
 *   2) window.base64js.fromByteArray/toByteArray —— 看 d 的编码层级与中间块（如 16 字节 nonce/key）
 *   3) XMLHttpRequest.prototype.open/setRequestHeader/send —— 拿 d / sign / headers 全形态
 *   4) crypto.subtle.* / TextEncoder / TextDecoder / btoa / atob —— 若将来改版走 WebCrypto 也能抓
 *   5) String.fromCharCode / Array.prototype.join —— 兜底：JS 手写加密的典型特征（默认关，噪音大）
 *
 * 用法（编程）：
 *   const { createEnv } = require('./env_patch');
 *   const { createCapProbe } = require('./dewu_cap_probe');
 *   const env = createEnv();
 *   const probe = createCapProbe(env, { forgeNowMs: 0 });   // 可选：伪造时钟
 *   probe.installPreLoad();          // 必须在 evalSource 之前
 *   env.evalSource(fs.readFileSync('artifacts/js/pyuntu.js','utf8'), 'pyuntu.js');
 *   probe.installPostLoad();         // base64js 要等 SDK 加载后才有
 *   await probe.call({});            // 触发 dewuCap，等 XHR 落地
 *   console.log(probe.report());
 *
 * 用法（CLI）：
 *   node src/dewu_cap_probe.js                 # dump 一次明文 + 结构表
 *   node src/dewu_cap_probe.js --forge-hour    # 伪造 Date.now +1h 再 dump
 *   node src/dewu_cap_probe.js --json out.json
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// d 的解码：base64 → UTF-8 字符串 → 逐字符 code（Latin-1 回压）= 真实密文字节
// 为什么需要 UTF-8 中转：SDK 用 base64js.fromByteArray(utf8(byteString)) 编码，
// 高字节会被编成 2 字节 UTF-8，所以 base64 解开后的字节数(1969) ≠ 密文字节数(1301)。
// ─────────────────────────────────────────────────────────────────────────────
function decodeD(dStr) {
  const utf8Bytes = Buffer.from(String(dStr), 'base64');
  const asString = utf8Bytes.toString('utf8');
  const cipher = Buffer.alloc(asString.length);
  for (let i = 0; i < asString.length; i++) cipher[i] = asString.charCodeAt(i) & 0xff;
  return { utf8Len: utf8Bytes.length, cipher, asString };
}

/** 已知明文时的 keystream 推导：ks = cipher ^ plaintext */
function deriveKeystream(cipher, plaintext) {
  const p = Buffer.from(String(plaintext), 'utf8');
  const n = Math.min(p.length, cipher.length);
  const ks = Buffer.alloc(n);
  for (let i = 0; i < n; i++) ks[i] = p[i] ^ cipher[i];
  return ks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 明文结构解析：把 JSON 展开成「字段 → 值/长度/类型/是否随时间变」的清单
// ─────────────────────────────────────────────────────────────────────────────
function flattenFields(obj, prefix, out) {
  const acc = out || [];
  if (obj === null || typeof obj !== 'object') return acc;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object') { flattenFields(v, name, acc); continue; }
    // data 字段本身是一个「被转义的 JSON 字符串」，再展开一层
    if (typeof v === 'string' && /^\{[\s\S]*\}$/.test(v)) {
      let inner = null;
      try { inner = JSON.parse(v); } catch (e) { inner = null; }
      if (inner) {
        if (prefix === '') flattenFields(inner, name, acc);
        continue;
      }
    }
    acc.push({
      field: name,
      type: v === null ? 'null' : typeof v,
      len: v === null ? 0 : String(v).length,
      value: v,
    });
  }
  return acc;
}

/** 按字段值给个「像什么」的猜测，方便一眼看出时间/随机/id */
function guessKind(field, value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') {
    if (/^(dbh|dbw|dow|doh|dsw|dsh|dsaw|dsah|dscreen|dpage)/.test(field)) return '像素/尺寸';
    if (/^(dpr)$/.test(field)) return 'devicePixelRatio';
    return 'number';
  }
  const s = String(value);
  if (/^(dje)$/.test(field)) return '随机 token（每次进程不同，疑似 nonce/会话 id）';
  if (/^(dua)$/.test(field)) return 'UserAgent';
  if (/^(dtz)$/.test(field)) return '时区名';
  if (/^(dul)$/.test(field)) return '页面 URL';
  if (/^(bcv|c)$/.test(field)) return 'SDK 版本/状态串';
  if (/^\d{10}$/.test(s)) return '疑似 unix 秒';
  if (/^\d{13}$/.test(s)) return '疑似 unix 毫秒';
  if (/^[A-Za-z0-9+/=]{16,}$/.test(s) && s.length % 4 === 0) return '疑似 base64 块';
  if (/^[0-9a-zA-Z]{20,40}$/.test(s)) return '疑似随机/编码 id';
  return 'string';
}

// ─────────────────────────────────────────────────────────────────────────────
// 探针主体
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} env            createEnv() 的返回值
 * @param {object} opts
 *   forgeNowMs  {number}  给沙箱时钟加偏移（毫秒），负数=回拨。默认 0（不改）
 *   deepHooks   {boolean} 额外挂 String.fromCharCode / Array.prototype.join（噪音大，默认 false）
 *   maxJson     {number}  记录 JSON.stringify 输出的上限条数，默认 400
 */
function createCapProbe(env, opts) {
  const o = opts || {};
  const w = env.window;
  const state = {
    jsonCalls: [],      // {len, text, stack}
    b64Calls: [],       // base64js 调用
    b64Blocks: [],      // 16 字节级中间块（nonce/key 候选）
    xhrs: [],           // {method,url,headers,body}
    cryptoCalls: [],    // subtle/TextEncoder/btoa 等
    deepCalls: [],      // fromCharCode/join
    clockForged: 0,
    hooks: [],
  };

  // ── 1) JSON.stringify：主路径。d = ENC(JSON.stringify(payload)) ─────────────
  function installJSONHook() {
    if (w.JSON.__capHooked) return;
    const orig = w.JSON.stringify;
    const wrapped = function stringify(v, r, s) {
      const out = orig.call(this, v, r, s);
      try {
        if (typeof out === 'string' && state.jsonCalls.length < (o.maxJson || 400)) {
          state.jsonCalls.push({
            len: out.length,
            text: out,
            stack: (new Error().stack || '').split('\n').slice(1, 5).join(' | '),
          });
        }
      } catch (e) { /* ignore */ }
      return out;
    };
    wrapped.__capHooked = true;
    env.window.JSON.stringify = wrapped;
    state.hooks.push('JSON.stringify');
  }

  // ── 2) XHR：拿 d / sign / headers（异步发送，需要等待） ────────────────────
  function installXHRHook() {
    const XHR = w.XMLHttpRequest;
    if (!XHR || XHR.prototype.__capHooked) return;
    const P = XHR.prototype;
    const oOpen = P.open; const oSend = P.send; const oSet = P.setRequestHeader;
    P.open = function (m, u) { this.__cap = { method: m, url: String(u), headers: {} }; return oOpen.apply(this, arguments); };
    P.setRequestHeader = function (k, v) {
      if (this.__cap) this.__cap.headers[k] = String(v);
      return oSet.apply(this, arguments);
    };
    P.send = function (b) {
      if (this.__cap) {
        this.__cap.body = b === undefined || b === null ? null : String(b);
        this.__cap.stack = (new Error().stack || '').split('\n').slice(1, 6).join(' | ');
        state.xhrs.push(this.__cap);
      }
      return oSend.apply(this, arguments);
    };
    P.__capHooked = true;
    state.hooks.push('XMLHttpRequest');
  }

  // ── 3) 时钟伪造（必须在 SDK 加载前；用于判断明文里有没有时间字段） ─────────
  function installClockForge() {
    const off = o.forgeNowMs || 0;
    if (!off) return;
    const RealDate = w.Date;
    const realNow = RealDate.now.bind(RealDate);
    const Shifted = class ShiftedDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(realNow() + off);
        else super(...args);
      }
      static now() { return realNow() + off; }
    };
    w.Date = Shifted;
    state.clockForged = off;
    state.hooks.push('Date(forge ' + off + 'ms)');
    // performance.now 也一起偏离，避免「只用 performance 计时」的路径绕过
    try {
      const perf = w.performance;
      const oNow = perf.now.bind(perf);
      Object.defineProperty(perf, 'now', { value: () => oNow() + off, configurable: true, writable: true });
      state.hooks.push('performance.now(forge)');
    } catch (e) { /* ignore */ }
  }

  // ── 4) 编码/加密原语（改版兜底：目前 pyuntu 不用 WebCrypto/TextEncoder） ────
  function installCryptoHooks() {
    const note = (api, extra) => {
      if (state.cryptoCalls.length < 200) state.cryptoCalls.push(Object.assign({ api }, extra));
    };
    // crypto.subtle
    try {
      const c = w.crypto;
      if (c && c.subtle) {
        for (const m of ['encrypt', 'decrypt', 'digest', 'sign', 'importKey']) {
          const orig = c.subtle[m];
          if (typeof orig !== 'function') continue;
          c.subtle[m] = function (...args) {
            note('subtle.' + m, { argLens: args.map((a) => (a && a.byteLength) || (typeof a === 'string' ? a.length : 0)) });
            return orig.apply(this, args);
          };
          state.hooks.push('crypto.subtle.' + m);
        }
      } else {
        state.hooks.push('crypto.subtle(不存在，跳过)');
      }
    } catch (e) { /* ignore */ }

    // TextEncoder / TextDecoder
    for (const [name, meth, key] of [['TextEncoder', 'encode', 'in'], ['TextDecoder', 'decode', 'out']]) {
      const C = w[name];
      if (!C || !C.prototype || !C.prototype[meth]) continue;
      const orig = C.prototype[meth];
      C.prototype[meth] = function (arg) {
        const out = orig.apply(this, arguments);
        const rec = { api: name + '.' + meth };
        if (key === 'in') rec.inLen = arg && arg.length;
        else rec.outLen = out && out.length;
        note(rec.api, rec);
        return out;
      };
      state.hooks.push(name + '.' + meth);
    }

    // btoa / atob
    for (const name of ['btoa', 'atob']) {
      const orig = w[name];
      if (typeof orig !== 'function') continue;
      w[name] = function (s) {
        const out = orig.call(this, s);
        note(name, { inLen: String(s).length, outLen: String(out).length, head: String(out).slice(0, 40) });
        return out;
      };
      state.hooks.push(name);
    }
  }

  // ── 5) base64js（SDK 自己的 base64 实现，加载后才有） ─────────────────────
  function installB64Hook() {
    const b = w.base64js;
    if (!b || b.__capHooked) return;
    const oFrom = b.fromByteArray; const oTo = b.toByteArray;
    if (typeof oFrom === 'function') {
      b.fromByteArray = function (bytes) {
        const out = oFrom.call(this, bytes);
        const inLen = bytes && bytes.length;
        state.b64Calls.push({ api: 'fromByteArray', inLen, outLen: String(out).length, head: String(out).slice(0, 40) });
        if (inLen && inLen <= 32) {
          state.b64Blocks.push({ kind: 'fromByteArray', inLen, input: Array.from(bytes), b64: String(out) });
        }
        return out;
      };
    }
    if (typeof oTo === 'function') {
      b.toByteArray = function (s) {
        const out = oTo.call(this, s);
        state.b64Calls.push({ api: 'toByteArray', inLen: String(s).length, outLen: out && out.length });
        return out;
      };
    }
    b.__capHooked = true;
    state.hooks.push('base64js');
  }

  // ── 6) 深钩子（可选）：JS 手写加密的典型特征 ──────────────────────────────
  function installDeepHooks() {
    const SC = w.String;
    const oFromCharCode = SC.fromCharCode;
    SC.fromCharCode = function (...codes) {
      const out = oFromCharCode.apply(this, codes);
      if (state.deepCalls.length < 5000) state.deepCalls.push({ api: 'String.fromCharCode', n: codes.length, head: out.slice(0, 24) });
      return out;
    };
    const AP = w.Array.prototype;
    const oJoin = AP.join;
    AP.join = function (sep) {
      const out = oJoin.apply(this, arguments);
      if (sep === '' && state.deepCalls.length < 5000 && out.length > 40) {
        state.deepCalls.push({ api: 'Array.join("")', len: out.length, head: String(out).slice(0, 24) });
      }
      return out;
    };
    state.hooks.push('String.fromCharCode', 'Array.prototype.join');
  }

  function installPreLoad() {
    installClockForge();
    installJSONHook();
    installXHRHook();
    installCryptoHooks();
    if (o.deepHooks) installDeepHooks();
  }

  function installPostLoad() {
    installB64Hook();
  }

  // ── 触发一次 dewuCap 并等 XHR 落地 ────────────────────────────────────────
  function call(args, waitMs) {
    const before = state.xhrs.length;
    const beforeJson = state.jsonCalls.length;
    let ret; let err = null;
    try { ret = w.dewuCap(args === undefined ? {} : args); } catch (e) { err = e; }
    return new Promise((resolve) => {
      const deadline = Date.now() + (waitMs || 1200);
      const tick = () => {
        if (state.xhrs.length > before || Date.now() > deadline) {
          resolve({
            ret: ret === undefined ? undefined : String(ret).slice(0, 200),
            err: err ? String(err.message).slice(0, 200) : null,
            newXhrs: state.xhrs.slice(before),
            newJson: state.jsonCalls.slice(beforeJson),
          });
          return;
        }
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  // ── 汇总：把最近一次 captcha/call 的 d 解出明文 ──────────────────────────
  function analyze(xhr) {
    const target = xhr || state.xhrs[state.xhrs.length - 1];
    if (!target || !target.body) return { ok: false, reason: '没有抓到带 body 的 XHR' };
    let body;
    try { body = JSON.parse(target.body); } catch (e) { return { ok: false, reason: 'body 不是 JSON: ' + String(target.body).slice(0, 120) }; }
    if (!body.d) return { ok: false, reason: 'body 里没有 d 字段', keys: Object.keys(body) };
    const { utf8Len, cipher } = decodeD(body.d);
    // 明文候选：长度 == cipher 字节数的 JSON.stringify 输出（流密码等长）
    const cands = state.jsonCalls.filter((c) => c.len === cipher.length);
    const pick = cands.length ? cands[cands.length - 1] : null;
    const out = {
      ok: true,
      url: target.url,
      method: target.method,
      headers: target.headers,
      dLen: body.d.length,
      sign: body.sign,
      cipherLen: cipher.length,
      utf8Len,
      plaintext: pick ? pick.text : null,
      plaintextLen: pick ? pick.text.length : 0,
      keystream: null,
      keystreamHeadHex: null,
      fields: [],
      jsonCalls: state.jsonCalls.map((c) => ({ len: c.len, head: c.text.slice(0, 60) })),
      b64Calls: state.b64Calls,
      b64Blocks: state.b64Blocks,
      cryptoCalls: state.cryptoCalls,
      clockForged: state.clockForged,
      hooks: state.hooks,
    };
    if (pick) {
      const ks = deriveKeystream(cipher, pick.text);
      out.keystream = ks;
      out.keystreamHeadHex = ks.slice(0, 32).toString('hex');
      try {
        const obj = JSON.parse(pick.text);
        out.fields = flattenFields(obj, '').map((f) => Object.assign(f, { kind: guessKind(f.field, f.value) }));
      } catch (e) { out.parseError = String(e.message); }
    }
    return out;
  }

  function report() {
    const a = analyze();
    const lines = [];
    if (!a.ok) { lines.push('✗ ' + a.reason); return { text: lines.join('\n'), data: a }; }
    lines.push('URL         : ' + a.method + ' ' + a.url);
    lines.push('headers     : ' + JSON.stringify(a.headers));
    lines.push('d           : ' + a.dLen + ' chars → cipher ' + a.cipherLen + ' bytes (经 UTF-8 中转 ' + a.utf8Len + ' 字节)');
    lines.push('sign        : ' + a.sign);
    lines.push('明文         : ' + (a.plaintext ? a.plaintextLen + ' chars（已还原）' : '未捕获（JSON.stringify 里没有等长输出）'));
    if (a.keystream) lines.push('keystream   : ' + a.keystreamHeadHex + ' ...（= cipher XOR 明文，长度 ' + a.keystream.length + '）');
    if (a.fields.length) {
      lines.push('');
      lines.push('明文结构（' + a.fields.length + ' 个叶子字段）：');
      for (const f of a.fields) {
        const v = f.value === null ? 'null' : String(f.value);
        lines.push('  ' + f.field.padEnd(26) + String(f.type).padEnd(8) + String(f.len).padStart(4) + '  ' + f.kind.padEnd(30) + ' ' + (v.length > 46 ? v.slice(0, 46) + '…' : v));
      }
    }
    return { text: lines.join('\n'), data: a };
  }

  return { state, installPreLoad, installPostLoad, call, analyze, report };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const { createEnv } = require('./env_patch');
  const crypto = require('crypto');
  const argv = process.argv.slice(2);
  const argOf = (flag) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : null;
  };
  const forge = argv.includes('--forge-hour') ? 3600 * 1000 : 0;
  const outPath = argOf('--json');
  const argsText = argOf('--args');
  const seedText = argOf('--seed');
  let args = {};
  let seed = undefined;
  try { if (argsText) args = JSON.parse(argsText); } catch (e) { args = {}; }
  try { if (seedText) seed = JSON.parse(seedText); } catch (e) { seed = undefined; }

  const env = createEnv({ blockNetwork: true, seedStorage: seed });
  const probe = createCapProbe(env, { forgeNowMs: forge, deepHooks: argv.includes('--deep') });
  probe.installPreLoad();
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  probe.installPostLoad();
  await probe.call(args);
  const rep = probe.report();
  console.log(rep.text);

  // 顺手把 sign 公式核对一遍：sign = md5('d' + d + SALT)
  const SALT = '048a9c4943398714b356a696503d2d36';
  if (rep.data.ok) {
    const xhr = probe.state.xhrs[probe.state.xhrs.length - 1];
    const body = JSON.parse(xhr.body);
    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
    const ok = md5('d' + body.d + SALT) === body.sign;
    console.log('\nsign 校验   : md5("d"+d+"' + SALT + '") = ' + md5('d' + body.d + SALT)
      + (ok ? '  ✓ 与 body.sign 一致' : '  ✗ 不一致（body.sign=' + body.sign + '）'));
  }

  if (rep.data.ok && rep.data.plaintext) {
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_d_plaintext.json'), rep.data.plaintext, 'utf8');
    const xhr = probe.state.xhrs[probe.state.xhrs.length - 1];
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_d_cipher.bin'), decodeD(JSON.parse(xhr.body).d).cipher);
    if (rep.data.keystream) fs.writeFileSync(path.join(ROOT, 'artifacts/cap_d_keystream.bin'), rep.data.keystream);
    console.log('\n→ 已写 artifacts/cap_d_plaintext.json / cap_d_cipher.bin / cap_d_keystream.bin');
  }
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({
      plaintext: rep.data.plaintext, sign: rep.data.sign, dLen: rep.data.dLen,
      cipherLen: rep.data.cipherLen, keystreamHex: rep.data.keystream ? rep.data.keystream.toString('hex') : null,
      fields: rep.data.fields, hooks: rep.data.hooks, clockForged: rep.data.clockForged,
      b64Blocks: rep.data.b64Blocks, headers: rep.data.headers, args, seedKeys: seed ? Object.keys(seed) : [],
    }, null, 1), 'utf8');
    console.log('→ 已写 ' + outPath);
  }
  env.dispose();
}

if (require.main === module) main();

module.exports = { createCapProbe, decodeD, deriveKeystream, flattenFields, guessKind };
