#!/usr/bin/env node
/**
 * pceptor_decrypt.js —— 得物（dewu）PC 端风控 SDK `pceptor.js` 的**响应体解密**
 * ============================================================================
 * 目标接口：POST /api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info
 * 线上 200 响应体是**纯 base64 文本**（不是 JSON），带响应头 `sks: 1` / `sks-length: N`；
 * 前端由 pceptor 的 fetch / XHR 拦截器解密后才交给业务代码。
 *
 * ── 结论（函数 + 入参 → 出参，已在本地复现） ───────────────────────────────
 *   明文 = window.fun.Fun99(响应体文本, '', sks响应头, '')
 *
 *   pceptor 里的两处真实调用点（artifacts/unpacked/pceptor.000.eval.js）：
 *     fetch 路： Fun99(await res.clone().text(), '', res.headers.get('sks'), '')
 *     XHR   路： Fun99(xhr.response, '', xhr.headers.sks, '')
 *
 *   参数语义（实测，见 docs/pceptor_decrypt_report.md）：
 *     第 1 参  密文文本（base64）
 *     第 2 参  ''             —— 真实调用点恒为空串
 *     第 3 参  sks 响应头     —— 按 ',' 切开取 [0]：等于 '1' 才解密；其它值（含 '0'）原样返回
 *     第 4 参  ''             —— 只在 /product/detailV3 埋点分支里被用（我们不需要）
 *     第 5 参  ''             —— 真实调用点恒为空串
 *
 *   解密不依赖 sk / dwsm / cookie / 会话 / 时间：换 sk、清空 storage 结果完全一致，
 *   所以本模块只需一个静态 jsdom 环境即可离线解。
 *
 * ── 依赖 ───────────────────────────────────────────────────────────────────
 *   `fun` 不是 pceptor.js 自己定义的：pceptor 在运行期 createElement('script')
 *   去加载 https://davstatic.dewu.com/preinforce2.js，加载完把 window.fun 上的
 *   {Fun110, Fun99} 拿过来用。所以离线还原只需直接跑 preinforce2.js
 *   （artifacts/js/preinforce2.js，仓库内已存档），不需要 pceptor.js，也不需要联网。
 *
 * ── 用法 ───────────────────────────────────────────────────────────────────
 *   const { decryptInfoResponse, decryptInfoResponseText } = require('./pceptor_decrypt');
 *   const json = await decryptInfoResponse(rawBase64Text);           // 默认 sks='1'
 *   const text = await decryptInfoResponseText(rawBase64Text);
 *
 *   // 有响应头时按 sks 语义自动判定（sks 缺失/≠1 视为明文）
 *   const json2 = await decryptResponse(rawBody, { sks: headers.sks });
 *
 *   CLI：
 *   node src/pceptor_decrypt.js artifacts/resp_125.bin out.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SDK_PATH = path.join(ROOT, 'artifacts/js/preinforce2.js');
const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';

// sks 响应头里触发解密的那个 token
const SKS_ENCRYPTED = '1';

// ─────────────────────────────────────────────────────────────────────────────
// 引擎（jsdom + preinforce2.js，单例）
// ─────────────────────────────────────────────────────────────────────────────
let _engine = null;

function buildEngine(opts) {
  const o = opts || {};
  // env_patch.createEnv 的默认 UA 是 Firefox 分支 —— 必须保持！
  // 实测：把 navigator.userAgent 换成 Chrome UA，同一个 Fun99 会走另一条分支，
  // 输出 51141 字符的 Uint8Array 序列化（不是明文 JSON）。UA 是这个解密闭包的入参之一。
  const { createEnv } = require('./env_patch');
  const env = createEnv({
    blockNetwork: true,          // 绝不发真实请求
    traceReads: false,
    seedStorage: o.seedStorage === undefined ? { sk: SK, dwsm: DWSM } : o.seedStorage,
  });
  const sdk = o.sdkPath || SDK_PATH;
  env.evalSource(fs.readFileSync(sdk, 'utf8'), path.basename(sdk));

  const w = env.window;
  const fun = w.fun;
  if (!fun || typeof fun.Fun99 !== 'function') {
    env.dispose();
    throw new Error('[pceptor_decrypt] preinforce2 加载后没有 window.fun.Fun99；SDK 可能改版');
  }
  return {
    env,
    fun99: fun.Fun99.bind(fun),
    ua: w.navigator.userAgent,
    dispose() { try { env.dispose(); } catch (e) { /* ignore */ } },
  };
}

function engine(opts) {
  if (opts && opts.fresh) { const e = buildEngine(opts); return e; }
  if (!_engine) _engine = buildEngine(opts);
  return _engine;
}

/** 释放单例（脚本退出前调用即可；进程结束也会自动回收） */
function disposeEngine() {
  if (_engine) { _engine.dispose(); _engine = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// sks 语义
// ─────────────────────────────────────────────────────────────────────────────
/** 响应头 sks 是否是"已加密"标记：'1' 或 '1,xxx' → true；'0' / 'hdw4' / 缺失 → false */
function isEncryptedFlag(sks) {
  if (sks === undefined || sks === null || String(sks) === '') return null; // 不知道
  return String(sks).split(',')[0] === SKS_ENCRYPTED;
}

/** 文本看起来像不像密文（纯 base64、不含 { }） */
function looksLikeCipherText(s) {
  const t = String(s).trim();
  if (!t) return false;
  if (t.includes('{') || t.includes('}')) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(t);
}

// ─────────────────────────────────────────────────────────────────────────────
// 主 API
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 密文文本 -> 明文文本（不做 JSON.parse）
 * @param {string} rawText  200 响应体原文（base64 文本）
 * @param {{sks?:string, fresh?:boolean, sdkPath?:string, seedStorage?:object}} [opts]
 * @returns {Promise<string>}
 */
async function decryptInfoResponseText(rawText, opts) {
  const o = opts || {};
  const raw = String(rawText == null ? '' : rawText).trim();
  const sks = o.sks === undefined ? SKS_ENCRYPTED : o.sks;

  // 服务端没加密（或业务层已经拿到明文）：原样返回
  const flag = isEncryptedFlag(sks);
  if (flag === false) return raw;

  if (!looksLikeCipherText(raw)) return raw; // 已经是 JSON

  const e = engine(o);
  let out;
  try {
    out = e.fun99(raw, '', String(sks), '');
  } catch (err) {
    throw new Error('[pceptor_decrypt] Fun99 抛错: ' + (err && err.message));
  }
  if (typeof out !== 'string') {
    // 两种已知原因：① 输入不是该 SDK 的响应信封（base64 解出来不是 zlib 流）
    //             ② 沙箱 UA 不是 Firefox 分支（实测会走另一条分支，输出 Uint8Array 序列化）
    throw new Error('[pceptor_decrypt] Fun99 返回 ' + typeof out + '（预期 string）：' +
      '输入不是 pceptor 响应信封，或沙箱 UA 不在 Firefox 分支；引擎 UA=' +
      JSON.stringify(e.ua));
  }
  if (out === raw) {
    throw new Error('[pceptor_decrypt] Fun99 原样返回了输入（未解密）：sks=' + JSON.stringify(String(sks)) +
      ' 的首段不是 "1"，或者这段密文本身不是该 SDK 的响应信封');
  }
  return out;
}

/**
 * 密文文本 -> 明文 JSON（对象）
 * @returns {Promise<object>}
 */
async function decryptInfoResponse(rawText, opts) {
  const text = await decryptInfoResponseText(rawText, opts);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('[pceptor_decrypt] 解密结果不是 JSON（前 120 字符：' +
      JSON.stringify(String(text).slice(0, 120)) + '）');
  }
}

/**
 * 带响应头的便捷入口：按 sks 头自动决定解密还是当明文。
 * @param {string} rawBody
 * @param {{sks?:string, [k:string]:any}} headers  响应头（对象或 Headers）
 */
async function decryptResponse(rawBody, headers) {
  const h = headers || {};
  const get = (k) => (typeof h.get === 'function' ? h.get(k) : h[k]);
  const sks = get('sks');
  // sks 缺失 → 交给 looksLikeCipherText 判：看着像密文就按默认 '1' 试解，否则原样返回
  const text = await decryptInfoResponseText(rawBody, { sks: sks == null ? undefined : sks });
  try { return JSON.parse(text); } catch (e) { return text; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const inp = process.argv[2] || path.join(ROOT, 'artifacts/resp_125.bin');
  const outp = process.argv[3];
  const sks = process.argv[4] || SKS_ENCRYPTED;
  const raw = fs.readFileSync(inp, 'utf8');
  const t0 = Date.now();
  const text = await decryptInfoResponseText(raw, { sks });
  const ms = Date.now() - t0;
  let obj = null;
  try { obj = JSON.parse(text); } catch (e) { /* ignore */ }
  console.log('输入 :', inp, '(', raw.trim().length, 'chars )');
  console.log('sks  :', JSON.stringify(sks), '| 引擎 UA:', engine().ua);
  console.log('输出 :', text.length, 'chars (' + ms + 'ms)');
  if (obj) {
    console.log('JSON : code=' + obj.code + ' msg=' + obj.msg +
      ' data.keys=' + JSON.stringify(obj.data ? Object.keys(obj.data) : null));
    if (obj.data && Array.isArray(obj.data.list)) {
      console.log('list :', obj.data.list.length, '条，第一条 spuId=' + obj.data.list[0].spuId);
    }
  } else {
    console.log('非 JSON，前 200 字符:', JSON.stringify(text.slice(0, 200)));
  }
  if (outp) {
    fs.writeFileSync(outp, obj ? JSON.stringify(obj, null, 2) : text);
    console.log('已写:', outp);
  }
  disposeEngine();
}

module.exports = {
  decryptInfoResponse,
  decryptInfoResponseText,
  decryptResponse,
  isEncryptedFlag,
  looksLikeCipherText,
  disposeEngine,
  SKS_ENCRYPTED,
  SDK_PATH,
};

if (require.main === module) {
  main().catch((e) => { console.error('ERR', e && e.message); process.exit(1); });
}
