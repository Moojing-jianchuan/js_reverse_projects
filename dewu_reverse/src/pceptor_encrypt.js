#!/usr/bin/env node
/**
 * pceptor_encrypt.js —— 得物 info 接口 {data} 信封的本地构造器
 * =================================================================
 * 结论（本文实现所依据，证据见 docs/pceptor_encrypt_report.md）：
 *
 *   data  =  hex32 + mojibakeBase64( XOR( 明文, KS ) )          ← 密文与明文【等长】
 *   hex32 =  md5(明文 JSON 字符串)
 *   KS    =  keystream，逐字节，由 (sk, navigator.userAgent 括号段) 决定
 *            - 与明文内容、明文长度无关（实测 124B / 2181B 两明文整表一致 2181/2181）
 *            - 与 shumeiid 无关（SK 非空时闭包里 `SK || shumeiId || uaParen` 短路到 SK）
 *            - 同一 (sk, UA) 下确定可复现（跨 env 实例逐字一致）
 *
 * 两条产生路径：
 *   A. 纯算法（默认，毫秒级）：buildInfoEnvelope(plain)
 *      需要一张与当前 (sk, UA) 匹配的 KS 表（首次调用自动标定并落盘缓存）。
 *   B. 直接驱动 SDK：sdkEnvelope(plain)
 *      在 jsdom 里跑 artifacts/js/{pceptor,preinforce2}.js，调 window.fun.Fun110
 *      (payload,'post','',false,{SK,ShumeiId,...}) → 2ms/次，结果即厂商输出。
 *
 * ⚠️ 为什么不用 Node `vm`：src/env.js 的 vm 沙箱里 preinforce2 的 CryptoJS
 *    （MD5._doFinalize / BufferedBlockAlgorithm._process）会自旋不返回
 *    （探针见 scripts/a_spin_trace.js）。jsdom realm 里同一份源码毫秒级返回，
 *    因此本模块用 jsdom（src/env_patch.js）做标定。
 *
 * 用法：
 *   node src/pceptor_encrypt.js --selftest
 *   node src/pceptor_encrypt.js "<明文 JSON 字符串>"
 *   node src/pceptor_encrypt.js --info 644479 1 24        # 用 sign 规则自造明文
 *   node src/pceptor_encrypt.js --calibrate               # 只重标 KS
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const KS_BIN = path.join(ROOT, 'artifacts/b_ks.bin');
const KS_META = path.join(ROOT, 'artifacts/b_ks_meta.json');
const SIGN_SALT = '048a9c4943398714b356a696503d2d36';
const INFO_PATH = '/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const INFO_URL = 'https://app.dewu.com' + INFO_PATH;

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const md5bytes = b => crypto.createHash('md5').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ────────────────────────────────────────────────────────────────
 * 编码层：SDK 的「mojibake base64」（逐字节当字符 → UTF-8 → base64）
 * ──────────────────────────────────────────────────────────────── */

/** 密文字节 → 线上 b64 文本 */
function b64FromRealBytes(bytes) {
  const latin1 = Buffer.from(bytes).toString('latin1');
  return Buffer.from(latin1, 'utf8').toString('base64');
}

/** 线上 b64 文本 → 真实密文字节（buildD/decryptD 里同一个坑） */
function realBytesFromB64(b64) {
  const raw = Buffer.from(String(b64), 'base64');
  const t = raw.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

function xor(a, b) {
  const n = Math.min(a.length, b.length);
  const o = Buffer.alloc(n);
  for (let i = 0; i < n; i++) o[i] = a[i] ^ b[i];
  return o;
}

/* ────────────────────────────────────────────────────────────────
 * sign：键名排序拼接 key+value，再拼固定盐，md5
 * ──────────────────────────────────────────────────────────────── */
function signOf(obj) {
  const body = Object.keys(obj).sort().map(k => k + obj[k]).join('');
  return md5(body + SIGN_SALT);
}

/** 造一条 info 明文（字段顺序与线上一致：sign 在前） */
function infoPlain(over) {
  const o = Object.assign({ pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }, over || {});
  const signKeys = {};
  for (const k of ['pickRuleId', 'pageNum', 'pageSize', 'filterUnbid', 'showCspu']) signKeys[k] = o[k];
  const plain = { sign: signOf(signKeys) };
  for (const k of Object.keys(signKeys)) plain[k] = signKeys[k];
  return JSON.stringify(plain);
}

/* ────────────────────────────────────────────────────────────────
 * B 路径：jsdom 里驱动 window.fun.Fun110（标定 + 直出）
 * ──────────────────────────────────────────────────────────────── */
const SESSION = {
  env: null,
  fun: null,
  ua: null,
  sk: null,
  shumeiid: null,
};

const DEFAULT_SK = 'YOUR_SK_HERE';
const DEFAULT_SM = 'YOUR_SHUMEIID_HERE';

/**
 * 起一个 jsdom 会话并把 pceptor + preinforce2 灌进去（不联网）。
 * @param {{sk?:string, shumeiid?:string, ua?:string}} opt
 */
function openSession(opt) {
  const o = opt || {};
  const sk = o.sk || process.env.SK || DEFAULT_SK;
  const sm = o.shumeiid || process.env.DWSM || DEFAULT_SM;
  const { createEnv } = require('./env_patch');
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk, dwsm: sm } });
  const w = env.window;
  if (o.ua) {
    try {
      Object.defineProperty(w.navigator, 'userAgent', { get: () => o.ua, configurable: true });
      Object.defineProperty(w.navigator, 'appVersion', { get: () => String(o.ua).replace('Mozilla/', ''), configurable: true });
    } catch (e) { }
  }
  for (const f of ['pceptor.js', 'preinforce2.js']) {
    env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js', f), 'utf8'), f);
  }
  const fun = w.fun;
  if (!fun) throw new Error('preinforce2 未挂出 window.fun（pceptor.js / preinforce2.js 版本变了？）');
  const F110 = fun.Fun110 || Object.getPrototypeOf(fun).Fun110;
  if (typeof F110 !== 'function') throw new Error('window.fun.Fun110 缺失');
  Object.assign(SESSION, {
    env, fun, F110,
    ua: w.navigator.userAgent,
    sk, shumeiid: sm,
    keyMap: { SK: sk, Sk: sk, sk, ShumeiId: sm, shumeiId: sm, shumeiid: sm },
  });
  return SESSION;
}

function closeSession() {
  try { SESSION.env && SESSION.env.dispose(); } catch (e) { }
  SESSION.env = null; SESSION.fun = null; SESSION.F110 = null;
}

function ensureSession(opt) {
  if (!SESSION.F110) openSession(opt);
  return SESSION;
}

/**
 * 直接让 SDK 出信封（厂商原样输出）。
 * @returns {{data:string, hex:string, b64:string, cipher:Buffer, raw:object, ms:number}}
 */
function sdkEnvelope(plaintextString, opt) {
  const s = ensureSession(opt);
  const t0 = Date.now();
  const r = s.F110.call(s.fun, plaintextString, 'post', '', false, s.keyMap);
  const ms = Date.now() - t0;
  if (!r || typeof r.d !== 'string') throw new Error('Fun110 未返回 d');
  let j;
  try { j = JSON.parse(r.d); } catch (e) { throw new Error('Fun110 的 d 不是 JSON：' + r.d.slice(0, 80)); }
  if (!j || typeof j.data !== 'string') {
    throw new Error('Fun110 走了明文回退（c=' + r.c + '），没有 {data} 信封。' +
      '通常意味着 keyMap 空 / 加密分支抛异常；检查 sk 是否传入。');
  }
  const data = j.data;
  const hex = data.slice(0, 32);
  const cipher = realBytesFromB64(data.slice(32));
  return { data, hex, b64: data.slice(32), cipher, raw: r, ms, via: 'sdk' };
}

/**
 * 标定 KS：用一条超长明文让 SDK 加密，再 cipher XOR plain 反推出整张表。
 * @param {{sk?:string, shumeiid?:string, ua?:string, length?:number}} opt
 * @returns {Buffer}
 */
function calibrate(opt) {
  const o = opt || {};
  const want = Math.max(512, o.length || 2048);
  const s = ensureSession(o);
  const pad = 'p'.repeat(want + 64);
  const plain = JSON.stringify({ sign: md5('calibrate'), pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true, pad });
  const env = sdkEnvelope(plain, o);
  const p = Buffer.from(plain, 'utf8');
  const ks = xor(p, env.cipher);
  if (ks.length < p.length) throw new Error('标定失败：密文比明文短 ' + env.cipher.length + '/' + p.length);
  const meta = {
    sk: s.sk, shumeiid: s.shumeiid, ua: s.ua,
    ksLen: ks.length, ksSha256: crypto.createHash('sha256').update(ks).digest('hex'),
    calibratedAt: new Date().toISOString(),
    sample: { plainLen: p.length, cipherLen: env.cipher.length, dataLen: env.data.length, c: env.raw.c },
  };
  if (o.persist !== false) {
    fs.mkdirSync(path.dirname(KS_BIN), { recursive: true });
    fs.writeFileSync(KS_BIN, ks);
    fs.writeFileSync(KS_META, JSON.stringify(meta, null, 1));
  }
  return ks;
}

/* ────────────────────────────────────────────────────────────────
 * A 路径：纯算法（毫秒级）
 * ──────────────────────────────────────────────────────────────── */
let _ksCache = null;

/** 取缓存的 KS；元数据与当前 (sk, UA) 不匹配则重标 */
function getKs(opt) {
  const o = opt || {};
  if (o.ks) return Buffer.isBuffer(o.ks) ? o.ks : Buffer.from(o.ks, 'base64');
  if (_ksCache && !o.force) return _ksCache;
  if (fs.existsSync(KS_BIN) && fs.existsSync(KS_META) && !o.force) {
    const meta = JSON.parse(fs.readFileSync(KS_META, 'utf8'));
    const sk = o.sk || process.env.SK || DEFAULT_SK;
    const ua = o.ua || null;
    const skOk = meta.sk === sk;
    const uaOk = !ua || meta.ua === ua;
    if (skOk && uaOk) { _ksCache = fs.readFileSync(KS_BIN); return _ksCache; }
  }
  _ksCache = calibrate(o);
  return _ksCache;
}

/**
 * 明文 → 信封（纯算法）。
 * @param {string} plaintextString 明文 JSON（字段顺序敏感：sign 在最前）
 * @param {{ks?:Buffer|string, sk?:string, ua?:string, force?:boolean, debug?:boolean}} [opt]
 * @returns {{data:string, hex:string, b64:string, cipher:Buffer, ks:Buffer, ms:number, debug:object}}
 */
function buildInfoEnvelope(plaintextString, opt) {
  const o = opt || {};
  const t0 = Date.now();
  const plain = String(plaintextString);
  const p = Buffer.from(plain, 'utf8');
  let ks = getKs(o);
  if (ks.length < p.length) {                       // 明文比表长 → 加长重标
    ks = calibrate(Object.assign({}, o, { length: p.length + 512, force: true, persist: true }));
    _ksCache = ks;
  }
  const hex = md5(plain);
  const cipher = xor(p, ks.subarray(0, p.length));
  const data = hex + b64FromRealBytes(cipher);
  return {
    data, hex, b64: data.slice(32), cipher, ks,
    plainLen: p.length, cipherLen: cipher.length,
    ms: Date.now() - t0,
    debug: o.debug ? {
      ksLen: ks.length, ksHead: ks.subarray(0, 16).toString('hex'),
      path: 'pure', sk: (o.sk || process.env.SK || DEFAULT_SK).slice(0, 12) + '…',
      hexMatchesMd5: hex === md5(plain),
      cipherLenEqualsPlain: cipher.length === p.length,
    } : null,
  };
}

/** 反解：data → {hex, plain, cipher}（KS 不匹配时 plain 是乱码，可用来判表是否对） */
function decryptData(data, opt) {
  const hex = String(data).slice(0, 32);
  const cipher = realBytesFromB64(String(data).slice(32));
  const ks = getKs(opt);
  const plain = xor(cipher, ks.subarray(0, cipher.length));
  const txt = plain.toString('utf8');
  return {
    hex, cipher, plain: txt,
    hexMatchesPlain: md5bytes(plain) === hex || md5(txt) === hex,
  };
}

/* ────────────────────────────────────────────────────────────────
 * CLI / 自检
 * ──────────────────────────────────────────────────────────────── */
const CAPTURED_DATA = 'df74e6521fc1ea3752eddb701c5453b8w6bDlcK3F37Dv1AyGcK5GmlRd8OfcMKAw4/CnMO/w6sdcMKpw7goMsOQNMMpwo5kWsK7wpYRw4DDlyJ6YMOdw5MMFjvDm1BaCMKjwrPChSTCuxAyw4N4w44YK8KZWcKVwrHDn8OQKcKPMsO3PMKwR0BBwpvCksO2w4o+PF9Xw4lfRsKcwqbCrkXDhnzCgF3Cm2HCtMOpTUokWXjDiC3CiC3DoXHCpcOLMsKRJHQuw5rDqgDCrXvCrw==';
const CAPTURED_PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';

function selftest() {
  const out = { checks: [] };
  const add = (name, pass, detail) => { out.checks.push({ name, pass: !!pass, detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail || ''}`); };

  const plain = infoPlain({});
  console.log('\n[1] sign 规则：', plain);
  add('sign 与抓包明文逐字一致', plain === CAPTURED_PLAIN, plain.slice(0, 60) + '…');

  const e1 = buildInfoEnvelope(plain);
  console.log('\n[2] 纯算法信封：data.len', e1.data.length, '| ms', e1.ms);
  add('hex32 == md5(明文)', e1.hex === md5(plain), e1.hex);
  add('密文与明文等长', e1.cipher.length === Buffer.byteLength(plain), e1.cipher.length + '/' + Buffer.byteLength(plain));
  add('b64 可逆（decryptData 回原文）', (() => { try { return decryptData(e1.data).plain === plain; } catch (e) { return false; } })(), '');

  const e2 = sdkEnvelope(plain);
  add('纯算法 == SDK 直出（同 sk/UA）', e2.data === e1.data, `${e1.ms}ms vs ${e2.ms}ms`);

  const p2 = infoPlain({ pageNum: 2 });
  const a1 = buildInfoEnvelope(plain), a2 = buildInfoEnvelope(p2);
  const k1 = xor(Buffer.from(plain), a1.cipher), k2 = xor(Buffer.from(p2), a2.cipher);
  add('两条不同明文反推 KS 完全一致', k1.equals(k2), k1.length + 'B');

  const cap = decryptData(CAPTURED_DATA);
  let same = 0;
  const n = Math.min(kslen(), 124);
  const ksNow = getKs({});
  for (let i = 0; i < n; i++) if (Buffer.from(CAPTURED_PLAIN)[i] === (cap.cipher[i] ^ ksNow[i])) same++;
  add('线上抓包样本与本机 KS 的吻合前缀（只作诊断，非判定项）', true, same + '/' + n + ' 字节 → 说明对端 UA 分支不同');
  add('抓包 hex32 == md5(抓包明文)', CAPTURED_DATA.slice(0, 32) === md5(CAPTURED_PLAIN), CAPTURED_DATA.slice(0, 32));

  const pass = out.checks.filter(c => c.pass).length;
  console.log(`\n[self-test] ${pass}/${out.checks.length}`);
  return pass === out.checks.length;
}
function kslen() { try { return getKs({}).length; } catch (e) { return 0; } }

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--selftest') { const ok = selftest(); closeSession(); process.exit(ok ? 0 : 1); }
  if (args[0] === '--calibrate') {
    const ks = calibrate({ force: true, length: Number(args[1] || 2048) });
    console.log('ks len', ks.length, 'sha256', crypto.createHash('sha256').update(ks).digest('hex'));
    console.log('head:', ks.subarray(0, 32).toString('hex'));
    closeSession(); return;
  }
  if (args[0] === '--info') {
    const plain = infoPlain({ pickRuleId: Number(args[1] || 644479), pageNum: Number(args[2] || 1), pageSize: Number(args[3] || 24) });
    const e = buildInfoEnvelope(plain, { debug: true });
    console.log(JSON.stringify({ plain, data: e.data, hex: e.hex, ms: e.ms, debug: e.debug }, null, 1));
    closeSession(); return;
  }
  const plain = args[0];
  const e = buildInfoEnvelope(plain, { debug: true });
  console.log(JSON.stringify({ plain, data: e.data, hex: e.hex, cipherLen: e.cipherLen, ms: e.ms, debug: e.debug }, null, 1));
  closeSession();
}

module.exports = {
  // 主能力
  buildInfoEnvelope, sdkEnvelope, decryptData, calibrate, getKs,
  // 工具
  signOf, infoPlain, md5, xor, b64FromRealBytes, realBytesFromB64,
  openSession, closeSession, ensureSession,
  // 常量
  SIGN_SALT, INFO_URL, INFO_PATH, DEFAULT_SK, DEFAULT_SM,
};

if (require.main === module) {
  try { main(); } catch (e) { console.error('ERR', e && e.message); process.exit(2); }
}
