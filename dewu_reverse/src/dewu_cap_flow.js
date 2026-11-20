#!/usr/bin/env node
/**
 * dewu_cap_flow.js —— 得物验证码（risk-stone）本地端到端链路
 * ============================================================================
 * 每一步都能单独跑，默认**不发网络请求**（离线自检），加 `--send` 才真发。
 *
 *   node src/dewu_cap_flow.js                 # 离线：本地生成 call 载荷 + 自解密自检
 *   node src/dewu_cap_flow.js --send           # 真发 captcha/call（1 次请求），存样本
 *   node src/dewu_cap_flow.js --send --verify  # 再发一次 captcha/verify（合成 datav3，仅作探针）
 *   node src/dewu_cap_flow.js --replay <json>  # 用已存的 call 响应构造并加密 verify 载荷（不发）
 *
 * 产出样本：artifacts/flow/<时间戳>/
 *   call_request.json / call_response.json / verify_request.json / verify_response.json / summary.json
 *
 * 依赖：src/env_patch.js（jsdom 补环境）+ src/preinforce_loader.js（d 的本地实现）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./preinforce_loader.js');

const ROOT = path.resolve(__dirname, '..');
const OUT_BASE = path.join(ROOT, 'artifacts/flow');
const HOST = 'https://app.dewu.com';
const PATH_CALL = '/api/v1/h5/risk-stone-captcha/captcha/call';
const PATH_VERIFY = '/api/v1/h5/risk-stone-captcha/captcha/verify';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function outDir(tag) {
  const dir = path.join(OUT_BASE, tag || stamp());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function save(dir, name, obj) {
  fs.writeFileSync(path.join(dir, name), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 本地生成 captcha/call 载荷（跑原始 SDK）
// ─────────────────────────────────────────────────────────────────────────────

async function buildCallPayload() {
  const cap = await L.runSdkCaptcha({}, { wait: 1500 });
  if (!cap.parsed) throw new Error('本地没能捕获到 captcha/call 请求（pyuntu 未触发）');
  const plain = cap.plain || L.decryptD(cap.parsed.d);
  return {
    body: cap.parsed,           // {d, sign}
    bodyText: cap.body,
    headers: (cap.xhrs.find(x => /captcha\/call/.test(x.url)) || {}).headers || {},
    plain,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 发送
// ─────────────────────────────────────────────────────────────────────────────

function headersFor(body) {
  return {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://www.dewu.com',
    'Referer': 'https://www.dewu.com/',
    'User-Agent': UA,
    // SDK 同款头（值取自 pceptor 的 Headers 构造；sk/sm 需要真实会话才有意义）
    'appid': 'h5',
    'bcn': 'dewu',
    'bcv': '1.3.1.20260331',
    'platform': 'h5',
    'lang': 'zh',
    'SK': '',
    'shumeiId': 'normal',
    'userId': '',
  };
}

async function post(urlPath, bodyObj) {
  const body = JSON.stringify(bodyObj);
  const t0 = Date.now();
  const r = await fetch(HOST + urlPath, { method: 'POST', headers: headersFor(body), body });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { }
  return { status: r.status, ms: Date.now() - t0, text, json, sentBody: body };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 由 call 响应构造 verify 载荷
// ─────────────────────────────────────────────────────────────────────────────

/**
 * call 响应里我们需要的：
 *   data.sessionId   → verify 明文的 sessionID
 *   data.type        → 挑战类型（2 = 图集点选）
 *   data.bgList/bgImage… → 图集，需人工/OCR 解出坐标
 *   token/sig 之类待定（未确认）
 */
function extractChallenge(respJson) {
  const d = (respJson && respJson.data) || {};
  return {
    code: respJson && respJson.code,
    msg: respJson && respJson.msg,
    sessionId: d.sessionId || d.sessionID || null,
    type: d.type === undefined ? null : d.type,
    keys: Object.keys(d),
    bgListLen: Array.isArray(d.bgList) ? d.bgList.length : (d.bgList ? Object.keys(d.bgList).length : 0),
  };
}

/**
 * verify 的明文外壳与 call 相同（同一函数 6246 生成：sessionID/bcv/type/c/webp/data），
 * 额外带上答题结果与耗时。字段集按源码推断，**未用真实 verify 样本确认**。
 */
function buildVerifyPlain({ sessionId, type, dataField, datav3, cRestStart }) {
  const now = cRestStart || Date.now();
  return {
    sessionID: sessionId || '',
    bcv: '1.3.1.20260331',
    type: type === null || type === undefined ? 2 : type,
    c: `v=1.3.1.20260331|rest=${Math.max(0, now - now)}|vrest=0|vreqt=0|sqt=0|ojst=0`,
    webp: 0,
    data: dataField || '{}',
    datav3: datav3 || '',
    datav3Fail: '',
    cRestStart: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const send = argv.includes('--send');
  const sendVerify = argv.includes('--verify');
  const tagIdx = argv.indexOf('--tag');

  const dir = outDir(tagIdx >= 0 ? argv[tagIdx + 1] : null);
  const summary = { startedAt: new Date().toISOString(), dir, steps: [] };

  // ---- 步骤 1：本地生成 call 载荷 ----
  console.log('=== 步骤 1/3：本地生成 captcha/call 载荷 ===');
  const call = await buildCallPayload();
  console.log('  d.len   :', call.body.d.length);
  console.log('  sign    :', call.body.sign);
  console.log('  明文长度:', call.plain.length);
  const callCheck = {
    dLen: call.body.d.length,
    sign: call.body.sign,
    plainLen: call.plain.length,
    signOk: L.signD(call.body.d) === call.body.sign,
    roundtripOk: L.decryptD(call.body.d) === call.plain,
    localReencodeOk: L.buildD(call.plain) === call.body.d,
  };
  console.log('  自检    : sign', callCheck.signOk, '| 解密往返', callCheck.roundtripOk, '| 本地重算', callCheck.localReencodeOk);
  save(dir, 'call_request.json', { headers: headersFor(''), body: call.body });
  save(dir, 'call_plaintext.json', call.plain);
  summary.steps.push({ step: 'build_call', ...callCheck });

  if (!send) {
    console.log('\n（未加 --send，到此为止。样本已存 ' + dir + '）');
    save(dir, 'summary.json', summary);
    return;
  }

  // ---- 步骤 2：真发 call ----
  console.log('\n=== 步骤 2/3：POST ' + PATH_CALL + ' ===');
  const r1 = await post(PATH_CALL, call.body);
  console.log('  HTTP', r1.status, '| 耗时', r1.ms, 'ms');
  console.log('  响应:', r1.text.slice(0, 400));
  save(dir, 'call_response.json', { status: r1.status, ms: r1.ms, text: r1.text, json: r1.json });
  const ch = extractChallenge(r1.json);
  console.log('  code/msg :', ch.code, '/', ch.msg);
  console.log('  sessionId:', ch.sessionId, '| type:', ch.type, '| bgList:', ch.bgListLen, '| data keys:', JSON.stringify(ch.keys));
  summary.steps.push({ step: 'send_call', status: r1.status, ms: r1.ms, code: ch.code, msg: ch.msg, sessionId: ch.sessionId, type: ch.type, bgListLen: ch.bgListLen });

  // ---- 步骤 3：构造并（可选）发送 verify ----
  console.log('\n=== 步骤 3/3：构造 captcha/verify 载荷 ===');
  const vPlain = buildVerifyPlain({
    sessionId: ch.sessionId,
    type: ch.type,
    dataField: (call.plain && (() => { try { return JSON.parse(call.plain).data; } catch (e) { return '{}'; } })()) || '{}',
    // 合成占位答案：真实值需要解图（type=2 图集点选），这里只为验证"载荷能否被服务端解密"
    datav3: '0,0,100|1,1,200',
    cRestStart: Date.now(),
  });
  const vBody = L.buildCaptchaBody(vPlain);
  console.log('  明文长度:', JSON.stringify(vPlain).length, '| d.len:', vBody.d.length, '| sign:', vBody.sign);
  console.log('  明文:', JSON.stringify(vPlain).slice(0, 200));
  save(dir, 'verify_request.json', { headers: headersFor(''), body: vBody, plain: vPlain });

  if (!sendVerify) {
    console.log('\n（未加 --verify，verify 只在本地构造，未发送。加 `--send --verify` 才会发。）');
    save(dir, 'summary.json', summary);
    return;
  }

  console.log('\n=== POST ' + PATH_VERIFY + ' ===');
  const r2 = await post(PATH_VERIFY, vBody);
  console.log('  HTTP', r2.status, '| 耗时', r2.ms, 'ms');
  console.log('  响应:', r2.text.slice(0, 400));
  save(dir, 'verify_response.json', { status: r2.status, ms: r2.ms, text: r2.text, json: r2.json });
  summary.steps.push({ step: 'send_verify', status: r2.status, ms: r2.ms, code: r2.json && r2.json.code, msg: r2.json && r2.json.msg });
  save(dir, 'summary.json', summary);

  console.log('\n样本目录:', dir);
}

if (require.main === module) {
  main().catch(e => { console.error('ERR', e && e.stack || e); process.exit(1); });
}

module.exports = { buildCallPayload, buildVerifyPlain, extractChallenge, post, headersFor };
