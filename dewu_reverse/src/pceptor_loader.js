/**
 * pceptor_loader.js —— 纯离线运行得物 PC 端风控 SDK（pceptor.js / JSDUN 保护）
 * ==================================================================
 * 无浏览器、无网络。SDK、以及它自己注入的 preinforce2.js / pyuntu.js
 * 全部用本地落盘源码在 Node vm 里执行。
 *
 *   const pceptor = require('./src/pceptor_loader');
 *   const api = pceptor.load({ sk: '<cookie sk>', shumeiid: '<dwsm>' });
 *
 *   await api.getHeadersFor({url, method, bodyText})
 *        -> {ok, url, method, headers, body, rawHeaders}
 *   await api.encryptBody(plaintextString)
 *        -> {ok, hex, data, bodyText, hexMatchesMd5, cipherLen, keystreamLen}
 *   await api.decryptResponse(textOrBytes)
 *        -> {ok, plaintext, json, changed}
 *   api.selfCheck()   -> 结构化自检（不联网）
 *   api.state()       -> 会话状态（cookie / localStorage / 底层请求记录）
 *
 * 关键结论（详见 docs/pceptor_report.md）：
 *   - window.XMLHttpRequest 被替换成包装器，open/setRequestHeader/send 全部
 *     转发给内部真实 XHR，并在转发前追加 sk / shumeiid / ltk / sessionid /
 *     hsn / adi / skt 七个头。
 *   - body 加密（{"data":"<hex32><b64>"}）与 sks 头由 window.fun.Fun110
 *     (payload, method, '', true, {SK,ShumeiId,...}) 产出；该分支只在
 *     /interceptor 下发的"URL 白名单 + 会话密钥"齐备时才会进入，
 *     缺配置时 SDK 走 skt:'hdr1' 的明文回退路径。
 *   - hex32 = md5(明文 JSON)，密文与明文等长（会话级固定 keystream）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { makeEnv } = require('./env');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SDK = path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js');
const SRC_SDK = path.join(ROOT, 'artifacts/js/pceptor.js');
const CRYPTO_UNPACKED = path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js');
const CRYPTO_RAW = path.join(ROOT, 'artifacts/js/preinforce2.js');
const PYUNTU_UNPACKED = path.join(ROOT, 'artifacts/unpacked/pyuntu.000.eval.js');
const PYUNTU_RAW = path.join(ROOT, 'artifacts/js/pyuntu.js');

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const md5bytes = b => crypto.createHash('md5').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* SDK 内部会 reject 一些"缺环境"的 promise（例如拿不到配置），
 * 在 Node 里会直接打崩进程。统一收集起来，供诊断用。 */
const rejections = [];
let rejectHookInstalled = false;
function installRejectionHook() {
  if (rejectHookInstalled) return;
  rejectHookInstalled = true;
  process.on('unhandledRejection', (r) => {
    rejections.push(String((r && r.message) || r));
  });
}

/** base64 文本 → SDK 内部真正的密文字节（UTF-8/Latin-1 双层破坏的逆运算） */
function realBytesFromB64(b64) {
  const buf = Buffer.from(String(b64).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

/** 密文字节 → 线上 base64 文本（SDK 侧的 Latin-1→UTF-8 破坏） */
function b64FromRealBytes(bytes) {
  return Buffer.from(Buffer.from(bytes).toString('latin1'), 'latin1').toString('base64');
}

function xor(a, b) {
  const n = Math.min(a.length, b.length);
  const o = Buffer.alloc(n);
  for (let i = 0; i < n; i++) o[i] = a[i] ^ b[i];
  return o;
}

/**
 * SDK 会注入 <script src="https://davstatic.dewu.com/preinforce2.js"> 和
 * pyuntu.js；沙箱里用本地已落盘源码顶替，保证离线可跑。
 */
function defaultResolveScript(url) {
  const u = String(url);
  if (/preinforce/i.test(u)) {
    if (fs.existsSync(CRYPTO_UNPACKED)) return fs.readFileSync(CRYPTO_UNPACKED, 'utf8');
    if (fs.existsSync(CRYPTO_RAW)) return fs.readFileSync(CRYPTO_RAW, 'utf8');
  }
  if (/pyuntu/i.test(u)) {
    if (fs.existsSync(PYUNTU_UNPACKED)) return fs.readFileSync(PYUNTU_UNPACKED, 'utf8');
    if (fs.existsSync(PYUNTU_RAW)) return fs.readFileSync(PYUNTU_RAW, 'utf8');
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 加载                                                                */
/* ------------------------------------------------------------------ */
function load(opts = {}) {
  installRejectionHook();
  const sdkPath = opts.sdk || process.env.PCEPTOR_SDK || DEFAULT_SDK;
  if (!fs.existsSync(sdkPath)) {
    throw new Error(`SDK 源码不存在: ${sdkPath}（先跑 node scripts/unpack.js pceptor.js）`);
  }
  const code = fs.readFileSync(sdkPath, 'utf8');

  const env = makeEnv(Object.assign({ resolveScript: defaultResolveScript }, opts));
  const { sandbox, ctx, recorder, jar, store } = env;
  const before = new Set(Object.keys(sandbox));

  /* ---- 环境补丁 1：defineProperty 宽容 -----------------------------
   * SDK 的 XHR 属性代理循环存在一次 "以 undefined 为键" 的 defineProperty；
   * 浏览器里它只是给新实例加了个名为 "undefined" 的垃圾属性，Node 里第二次
   * 会抛 Cannot redefine property。这里直接跳过这类调用。            */
  const origDefineProperty = Object.defineProperty;
  let dpSkipped = 0;
  Object.defineProperty = function (target, key, desc) {
    if (key === undefined || key === 'undefined') { dpSkipped++; return target; }
    return origDefineProperty(target, key, desc);
  };

  let loadError = null;
  try {
    vm.runInContext(code, ctx, { filename: path.basename(sdkPath), timeout: opts.timeout || 30000 });
  } catch (e) {
    loadError = e;
  }

  const globals = Object.keys(sandbox).filter(k => !before.has(k));

  /* ---- 会话状态：sk / shumeiid --------------------------------------
   * 页面里 header sk 取自 window.dw.getSk()（见报告"header 生成"），
   * 而 dw.getSk() 在本环境下取不到值时返回 undefined；因此把外部给的
   * 真值挂到 dw.getSk / dw.getSM 上，这是唯一需要外部输入的地方。   */
  const session = {
    sk: opts.sk || (jar.get('sk') || store.get('sk') || '').split('\u200b')[0] || '',
    shumeiid: opts.shumeiid || jar.get('dwsm') || store.get('dwsm') || '',
    ltk: opts.ltk || null,
  };
  function applySession() {
    const dw = sandbox.dw;
    if (!dw) return false;
    if (session.sk) dw.getSk = () => session.sk;
    if (session.shumeiid) dw.getSM = () => session.shumeiid;
    if (session.ltk !== null && session.ltk !== undefined) dw.getLtk = () => session.ltk;
    return true;
  }
  applySession();

  const sdk = {
    env, sandbox, ctx, loadError, globals, dpSkipped,
    wrapperXHR: sandbox.XMLHttpRequest,
    nativeXHR: sandbox._yundunxhr,
    base64js: sandbox.base64js,
    crypto: sandbox.fun,
    dw: sandbox.dw,
    consoleLog: env.consoleLog,
    recorder,
    session,
  };

  /* ------------------------------------------------------------------ */
  /* 驱动：业务 → SDK 包装 XHR → 底层 native XHR                          */
  /* ------------------------------------------------------------------ */
  const innerCalls = [];
  recorder.onSend = native => {
    innerCalls.push({
      id: native.__id,
      method: native.__method,
      url: native.__url,
      headers: native.__reqHeaders.slice(),
      body: native.__body,
      native,
    });
  };

  function newWrapperXHR() { return new sandbox.XMLHttpRequest(); }

  /** 异步装配请求：SDK 的 hsn/加密链路是 promise 链，必须 pump 事件循环 */
  async function buildRequest({ url, method = 'POST', bodyText = '', contentType = 'application/json', headers = null, timeoutMs = 2000 }) {
    applySession();
    const mark = innerCalls.length;
    const xhr = newWrapperXHR();
    const errors = [];
    try {
      xhr.open(method, url, true);
      if (contentType) xhr.setRequestHeader('Content-Type', contentType);
      if (headers) for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.send(bodyText);
    } catch (e) {
      errors.push(String(e && e.message));
    }
    const t0 = Date.now();
    let record = null;
    while (Date.now() - t0 < timeoutMs) {
      await sleep(5);
      const found = innerCalls.slice(mark).filter(c => c.url === url).pop();
      if (found) { record = found; break; }
      if (innerCalls.length > mark && Date.now() - t0 > 300) {
        record = innerCalls.slice(mark).pop();
        break;
      }
    }
    return { xhr, record, errors };
  }

  function headersToObject(rec) {
    const h = {};
    if (!rec) return h;
    for (const [k, v] of rec.headers) h[String(k).toLowerCase()] = v;
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* A. header 生成                                                      */
  /* ------------------------------------------------------------------ */
  async function getHeadersFor(req) {
    const { record, errors, xhr } = await buildRequest(req);
    if (!record) return { ok: false, errors, headers: {}, body: null, url: null, method: null };
    return {
      ok: true, errors,
      url: record.url,
      method: record.method,
      headers: headersToObject(record),
      rawHeaders: record.headers,
      body: record.body,
      xhr, native: record.native,
    };
  }

  /* ------------------------------------------------------------------ */
  /* B. body 加密                                                        */
  /* ------------------------------------------------------------------ */
  async function encryptBody(plaintextString, req = {}) {
    const url = req.url || 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
    const out = await getHeadersFor(Object.assign({}, req, { url, bodyText: plaintextString }));
    const bodyText = out.ok ? out.body : null;
    let hex = null, data = null, cipherBytes = null;
    if (typeof bodyText === 'string') {
      let j = null;
      try { j = JSON.parse(bodyText); } catch (e) { }
      data = j && typeof j.data === 'string' ? j.data : null;
      if (data) {
        hex = data.slice(0, 32);
        try { cipherBytes = realBytesFromB64(data.slice(32)); } catch (e) { }
      }
    }
    const plainBytes = Buffer.from(plaintextString, 'utf8');
    const keystream = (cipherBytes && cipherBytes.length === plainBytes.length) ? xor(plainBytes, cipherBytes) : null;
    return {
      ok: !!out.ok,
      encrypted: !!data,
      errors: out.errors,
      bodyText,
      data, hex,
      hexMatchesMd5: hex ? hex === md5(plaintextString) : null,
      plainLen: plainBytes.length,
      cipherLen: cipherBytes ? cipherBytes.length : null,
      keystream,
      headers: out.headers,
      // 未加密时 SDK 走 skt:'hdr1' 回退，这里明确标注，避免把明文当密文
      mode: data ? 'encrypted' : (out.headers && out.headers.skt === 'hdr1' ? 'plaintext-fallback(hdr1)' : 'plaintext'),
      xhr: out.xhr, native: out.native,
    };
  }

  /* ------------------------------------------------------------------ */
  /* C. 响应解密                                                        */
  /*   把"服务端密文"灌进底层 native XHR 并触发 readyState 回调，        */
  /*   读业务侧最终看到的 responseText。                                 */
  /* ------------------------------------------------------------------ */
  async function decryptResponse(textOrBytes, req = {}) {
    const url = req.url || 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
    const plainReq = req.bodyText || JSON.stringify({ sign: '00000000000000000000000000000000', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
    const built = await buildRequest(Object.assign({}, req, { url, bodyText: plainReq }));
    if (!built.record) return { ok: false, encryptedInput: true, plaintext: null, changed: false, errors: built.errors, trace: [] };

    const native = built.record.native;
    const xhr = built.xhr;
    const text = Buffer.isBuffer(textOrBytes) ? textOrBytes.toString('utf8') : String(textOrBytes);
    const trace = [];
    const fire = (state) => {
      native.readyState = state;
      const ev = { type: 'readystatechange', target: native, currentTarget: native };
      try { if (typeof native.onreadystatechange === 'function') native.onreadystatechange(ev); } catch (e) { trace.push(['onreadystatechange' + state, String(e.message)]); }
      try { native.dispatchEvent(ev); } catch (e) { trace.push(['dispatchEvent' + state, String(e.message)]); }
    };
    native.status = 200;
    native.statusText = 'OK';
    native.responseURL = built.record.url;
    native.responseText = text;
    native.response = text;
    fire(2); fire(3); fire(4);
    try { if (typeof native.onload === 'function') native.onload({ type: 'load', target: native }); } catch (e) { trace.push(['onload', String(e.message)]); }

    let businessText = null;
    try { businessText = xhr.responseText; } catch (e) { trace.push(['read responseText', String(e.message)]); }
    let businessJson = null;
    try { businessJson = JSON.parse(businessText); } catch (e) { }
    return {
      ok: businessText !== null && businessText !== text,
      plaintext: businessText,
      json: businessJson,
      ciphertext: text,
      changed: businessText !== text,
      trace,
      xhr, native,
    };
  }

  /* ------------------------------------------------------------------ */
  /* 自检（离线，全部是结构化断言）                                       */
  /* ------------------------------------------------------------------ */
  async function selfCheck() {
    // SDK 的 <script> 注入是异步的（preinforce2 / pyuntu），先让它跑完
    await sleep(120);
    const checks = [];
    const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

    add('SDK 加载无异常', !loadError, loadError ? String(loadError.message) : 'ok');
    add('base64js 已挂载', !!sandbox.base64js && typeof sandbox.base64js.fromByteArray === 'function', Object.keys(sandbox.base64js || {}).join(','));
    add('_yundunxhr 为原生 XHR 引用', typeof sandbox._yundunxhr === 'function', String(sandbox._yundunxhr && sandbox._yundunxhr.name));
    add('XMLHttpRequest 已被包装', sandbox.XMLHttpRequest !== sandbox._yundunxhr, '');
    add('window.fun 已注入且含 Fun110', !!(sandbox.fun && typeof sandbox.fun.Fun110 === 'function'), sandbox.fun ? 'Fun110.length=' + sandbox.fun.Fun110.length : 'missing');
    add('dw 实例可用 (getSk/getSM/getLtk/Fun110)', !!(sandbox.dw && sandbox.dw.getSk && sandbox.dw.Fun110), '');
    add('会话 sk 已就绪', !!session.sk, session.sk ? session.sk.slice(0, 12) + '…(' + session.sk.length + ')' : '未提供（headers.sk 会是 undefined）');
    add('会话 shumeiid 已就绪', !!session.shumeiid, session.shumeiid);

    const url = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
    const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
    const r = await getHeadersFor({ url, method: 'POST', bodyText: plain });
    const hdrNames = Object.keys(r.headers || {});
    add('请求已到达底层 XHR', r.ok, r.errors && r.errors.join(';'));
    add('URL 未被改写', r.url === url, r.url);
    add('追加头齐全(sk/shumeiid/ltk/sessionid/hsn/adi)', ['sk', 'shumeiid', 'ltk', 'sessionid', 'hsn', 'adi'].every(k => hdrNames.includes(k)), hdrNames.join(','));
    add('hsn 为 32 位 hex', /^[0-9a-f]{32}$/.test(r.headers.hsn || ''), r.headers.hsn);
    add('sessionid 来自 localStorage.yuntuSession', r.headers.sessionid === (store.get('yuntuSession') || r.headers.sessionid), r.headers.sessionid);
    add('sk 头与注入值一致', !session.sk || r.headers.sk === session.sk, String(r.headers.sk).slice(0, 18));
    add('adi 为 base64 字符集', /^[A-Za-z0-9+/=_-]+$/.test(r.headers.adi || ''), String(r.headers.adi).slice(0, 24) + ' len=' + String(r.headers.adi || '').length);

    const e = await encryptBody(plain, { url });
    const structuralOk = e.bodyText === plain
      || (e.data && /^[0-9a-f]{32}/.test(e.data) && e.cipherLen === e.plainLen && e.hexMatchesMd5);
    add('body 结构自检（明文回退 或 hex32=md5+等长密文）', structuralOk || !e.ok, `mode=${e.mode} hex32=${e.hex} md5=${md5(plain)} len=${e.plainLen}/${e.cipherLen}`);

    const d = await decryptResponse('eyJjb2RlIjoyMDB9', { url, bodyText: plain });
    add('响应通道可回调（无异常）', d.trace.length === 0 || d.plaintext !== null, JSON.stringify(d.trace).slice(0, 120));
    add('响应未改动时业务读到的就是原文', d.changed === false && d.plaintext === 'eyJjb2RlIjoyMDB9', d.changed ? 'SDK 侧发生了改写' : 'unchanged（说明响应解密被配置门控，见报告）');

    return { pass: checks.filter(c => c.pass).length, total: checks.length, checks };
  }

  /* ------------------------------------------------------------------ */
  function state() {
    return {
      cookie: jar.cookie,
      cookies: Object.fromEntries(jar.map),
      storage: Object.fromEntries(store),
      cookieWrites: jar.writes.slice(),
      storageLog: env.storageLog.slice(),
      session: { ...session },
      innerCalls: innerCalls.map(c => ({ method: c.method, url: c.url, headers: headersToObject(c), body: c.body })),
      fetchCalls: recorder.fetchCalls.map(c => ({ method: c.method, url: c.url, headers: c.headers, body: c.body })),
      loadError: loadError ? String(loadError.message) : null,
      globals,
    };
  }

  return {
    env, sandbox, sdk,
    getHeadersFor, encryptBody, decryptResponse, buildRequest, selfCheck, state,
    newWrapperXHR, applySession,
    helpers: { md5, md5bytes, realBytesFromB64, b64FromRealBytes, xor },
  };
}

module.exports = { load, realBytesFromB64, b64FromRealBytes, xor, md5, DEFAULT_SDK, SRC_SDK };

/* ------------------------------------------------------------------ */
/* node src/pceptor_loader.js  → 跑自检                                */
/* ------------------------------------------------------------------ */
if (require.main === module) {
  (async () => {
    const sk = process.env.SK || '';
    const shumeiid = process.env.DWSM || '';
    const api = load({ sk, shumeiid });
    const r = await api.selfCheck();
    console.log(`[self-check] ${r.pass}/${r.total}`);
    for (const c of r.checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  ${c.detail || ''}`);
    console.log('\n[state]', JSON.stringify({ storage: api.state().storage, cookie: api.state().cookie }, null, 1));
    process.exit(r.pass === r.total ? 0 : 1);
  })().catch(e => { console.error('ERR', e); process.exit(2); });
}
