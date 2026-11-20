/**
 * cap_verify_builder.js —— 得物 `captcha/verify` 请求组装器
 * ============================================================================
 * 输入「挑战参数 + 作答坐标」，输出可直接发送的 `{d, sign}`（以及中间明文）。
 * 全程本地：不联网、不跑浏览器、不依赖 MCP。
 *
 * 依据（全部来自本仓库既有资产，不重写）：
 *   artifacts/verify_d_plaintext.json   一次真实 verify 的明文（已解密，服务端 code:1 验证成功）
 *   artifacts/capture_verify.json       同一次 verify 的真实 body（d=6556 字符 / sign）
 *   src/cap_solver.js                   genTrackFromTemplate()（真人轨迹模板仿射）、
 *                                       calibrateCaptchaKs()（标定 keystream）
 *   src/dewu_cap_probe.js               decodeD() / deriveKeystream()
 *
 * 已确认的算法（本次对拍再次全绿，见 scripts/test_verify_builder.js）：
 *   cipher    = plaintext_utf8 XOR keystream          （等长、偏移 0）
 *   d         = base64( UTF8( 每字节当字符(cipher) ) )  ← "mojibake base64" 的成因
 *   sign      = md5("d" + d + "048a9c4943398714b356a696503d2d36")
 *   keystream = F(sk, UA族)，同 sk 同 UA 下恒定，与明文长度/时间/随机数无关
 *
 * 用法（编程）：
 *   const { buildVerify, makeTrack } = require('./cap_verify_builder');
 *   const body = await buildVerify({
 *     sessionID,               // 来自 captcha/call 响应的 sessionId
 *     track: { sx, sy, ex, ey } 或 { pts, xys, pc, pn, trace },
 *     dataField,               // data 字段（环境指纹 JSON 字符串，必须是字符串，不能是对象）
 *     sk,                      // 会话 sk，用于标定 keystream（或直接传 ks）
 *   });                        // → { plain, d, sign, plainLen, dLen, cipherLen, c, fieldOrder, plainObj }
 *
 * 用法（CLI）：
 *   node src/cap_verify_builder.js --demo        # 真实样本参数 + 新随机 dje → d/sign + 自检
 *   node src/cap_verify_builder.js --demo --json out.json
 *
 * 字段顺序（必须严格一致，顺序影响密文、进而影响 sign）：
 *   sessionID,width,type,pts,xys,data,bcv,webp,c,pc,pn,trace
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 本 CLI 自己的参数快照（要在 require cap_solver 之前取）
const ARGV = process.argv.slice(2);

// cap_solver.js 顶层有一个「argv 含 --demo 就打印一条轨迹」的自执行分支，
// 这里既把 --demo 摘掉、又静音它 require 期的输出，保证本进程只输出自己的内容。
// （不改 cap_solver.js 一行。）
const _consoleLog = console.log;
{
  const i = process.argv.indexOf('--demo');
  if (i >= 0) process.argv.splice(i, 1);
}
console.log = () => {};
const { genTrackFromTemplate, calibrateCaptchaKs } = require('./cap_solver');
console.log = _consoleLog;
const { decodeD, deriveKeystream } = require('./dewu_cap_probe');

const ROOT = path.resolve(__dirname, '..');
const SALT = '048a9c4943398714b356a696503d2d36';

/** verify 明文顶层字段顺序（= 真实样本 Object.keys 顺序，逐字对拍已验证） */
const FIELD_ORDER = ['sessionID', 'width', 'type', 'pts', 'xys', 'data', 'bcv', 'webp', 'c', 'pc', 'pn', 'trace'];

/** 唯一被服务端接受的 verify 样本里的 `c`（rest/sqt/ojst 非 0 —— 与 call 恒 0 不同，别写反） */
const C_VERIFY_SAMPLE = 'v=1.3.1.20260331|rest=156|vrest=0|vreqt=4|sqt=73873|ojst=19';

const BCV_DEFAULT = '1.3.1.20260331';
const WIDTH_DEFAULT = 384;
const TYPE_DEFAULT = 5;

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const rndHex = (n) => crypto.randomBytes(n).toString('hex').toUpperCase();
const rndInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
/** SDK 的 dje：32 字符 [0-9A-Za-z] 随机串（每次调用都变，是纯 nonce，不参与加密） */
function randomDje() {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.randomBytes(32);
  let s = '';
  for (let i = 0; i < 32; i++) s += A[b[i] % A.length];
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. c 计时串
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 组 c：`v=<bcv>|rest=..|vrest=..|vreqt=..|sqt=..|ojst=..`
 *
 * 源码证据（artifacts/unpacked/pyuntu.readable.js）：
 *   call 路径 @114209  c = 'v='+V+'|rest='+(new Date().valueOf()-T0)+'|vrest='+0+'|vreqt='+R+'|sqt=0|ojst=0'
 *   verify 路径 @115287 c = 'v='+V+'|rest='+A+'|vrest='+B+'|vreqt='+R+'|sqt='+C+'|ojst=0'
 *   verify 路径 @133225 c = 'v='+V+'|rest='+A+'|vrest='+B+'|vreqt='+R+'|sqt='+C+'|ojst='+D
 *   → call 里 sqt/ojst 是硬编码 0；verify 里 sqt/ojst 是变量（与真实样本 73873/19 吻合）
 *
 * 实测差异（两份真实样本，见 docs/verify_builder_report.md §3）：
 *   call   全 0
 *   verify rest=156 vrest=0 vreqt=4 sqt=73873 ojst=19
 */
function makeC(o) {
  const x = Object.assign(
    { bcv: BCV_DEFAULT, rest: 0, vrest: 0, vreqt: 0, sqt: 0, ojst: 0 },
    o || {}
  );
  const num = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('c 的计时项必须是可转成数字的值，收到: ' + JSON.stringify(v));
    return Math.trunc(n);
  };
  return (
    'v=' + x.bcv +
    '|rest=' + num(x.rest) +
    '|vrest=' + num(x.vrest) +
    '|vreqt=' + num(x.vreqt) +
    '|sqt=' + num(x.sqt) +
    '|ojst=' + num(x.ojst)
  );
}

/** 反解 c（便于对拍与排查） */
function parseC(cStr) {
  const out = {};
  for (const seg of String(cStr).split('|')) {
    const i = seg.indexOf('=');
    if (i < 0) continue;
    const k = seg.slice(0, i);
    const v = seg.slice(i + 1);
    out[k] = k === 'v' ? v : Number(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 轨迹参数化（包一层 genTrackFromTemplate）
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} o
 *   sx,sy,ex,ey  起终点（页面坐标）。任意。
 *   now          轨迹首点的绝对时间戳（毫秒），默认 Date.now()
 *   scale        dt 时长倍率。不传 = 沿用 genTrackFromTemplate 的自动缩放
 *                （clamp(新位移/模板位移, 0.45, 1.6)，位移越短越快）
 *   jitter       轻微扰动幅度（px / ms），默认 0 = 关闭（模板本身已含真人噪声）
 *   seed         可选伪随机种子（同 seed → 同轨迹，便于复现）
 *   pts/pc/pn/trace  显式覆盖（覆盖值原样使用，不做任何换算）
 *
 * 返回 { pts, xys, pc, pn, trace, durationMs, points, scale, jitter }
 *
 * ⚠ pts 的坐标系与 xys 不同（见 docs/verify_builder_report.md §2）：
 *   真实样本 pts 首尾 = (62,57) / (189,306)，而 xys 首尾 = (274,626) / (401,249)。
 *   genTrackFromTemplate 沿用「pts 与 xys 同坐标」的写法 —— 这是**未确认**的假设，
 *   代码里保留原行为（不擅自改既有资产），需要时用 opts.pts 覆盖。
 */
function makeTrack(o) {
  const opt = Object.assign({}, o || {});
  if (opt.sx === undefined || opt.sy === undefined || opt.ex === undefined || opt.ey === undefined) {
    throw new Error('makeTrack 需要 sx,sy,ex,ey');
  }
  const seed = opt.seed;
  const rnd = seed === undefined ? Math.random : mulberry32(hashSeed(seed));
  const now = opt.now === undefined ? Date.now() : opt.now;

  // 第一阶段：完全交给既有模板实现（保证默认行为与 genTrackFromTemplate 逐字一致）
  const tr = genTrackFromTemplate({ sx: opt.sx, sy: opt.sy, ex: opt.ex, ey: opt.ey, now });

  const jitter = opt.jitter || 0;
  let scaleMul = 1;
  if (opt.scale !== undefined) {
    const auto = tr.scale || 0;                // genTrackFromTemplate 报出来的自动倍率
    scaleMul = auto > 0 ? Number(opt.scale) / auto : Number(opt.scale);
  }

  let xys = tr.xys;
  let durationMs = tr.durationMs;
  if (jitter > 0 || scaleMul !== 1) {
    const ptsArr = xys.split('|').map((s) => s.split(',').map(Number));
    const t0 = ptsArr[0][2];
    let t = 0;
    const out = [`${ptsArr[0][0]},${ptsArr[0][1]},${t0}`];
    for (let i = 1; i < ptsArr.length; i++) {
      const dtRaw = Math.max(1, ptsArr[i][2] - ptsArr[i - 1][2]);
      let dt = Math.max(1, Math.round(dtRaw * scaleMul));
      if (jitter > 0) dt = Math.max(1, dt + Math.round((rnd() * 2 - 1) * jitter));
      t += dt;
      let x = ptsArr[i][0];
      let y = ptsArr[i][1];
      if (jitter > 0) {
        x += Math.round((rnd() * 2 - 1) * jitter);
        y += Math.round((rnd() * 2 - 1) * jitter);
      }
      out.push(`${x},${y},${t}`);
    }
    xys = out.join('|');
    durationMs = t;
  }

  return {
    pts: opt.pts !== undefined ? opt.pts : `${opt.sx},${opt.sy},${now}|${opt.ex},${opt.ey},${durationMs}`,
    xys,
    pc: opt.pc !== undefined ? opt.pc : tr.pc,
    pn: opt.pn !== undefined ? opt.pn : String(rndInt(900, 1400)),
    trace: opt.trace !== undefined ? opt.trace : rndHex(16),
    durationMs,
    points: xys.split('|').length,
    scale: +((tr.scale || 1) * scaleMul).toFixed(3),
    jitter,
    fromTemplate: !!tr.fromTemplate,
  };
}

// 可选可复现随机（seed）
function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 明文组装（纯函数，不需要 keystream）
// ─────────────────────────────────────────────────────────────────────────────
/** 把 track 归一成 {pts,xys,pc,pn,trace}：给两点了就生成，给全量就原样用，给一半就补齐 */
function resolveTrack(track) {
  const t = track || {};
  if (t.pts && t.xys) {
    if (t.pc !== undefined && t.pn !== undefined && t.trace !== undefined) return t;
    // 只给了 pts/xys：用 xys 的首末点反推起终点，补出 pc/pn/trace
    const seg = String(t.xys).split('|');
    const a = seg[0].split(',').map(Number);
    const b = seg[seg.length - 1].split(',').map(Number);
    const gen = makeTrack({ sx: a[0], sy: a[1], ex: b[0], ey: b[1], now: a[2] });
    return {
      pts: t.pts,
      xys: t.xys,
      pc: t.pc !== undefined ? t.pc : gen.pc,
      pn: t.pn !== undefined ? t.pn : gen.pn,
      trace: t.trace !== undefined ? t.trace : gen.trace,
    };
  }
  return makeTrack(t);
}

/**
 * 组 verify 明文对象（字段顺序 = FIELD_ORDER）。
 * @param {object} o
 *   sessionID   string（call 响应里的 sessionId；verify 必带）
 *   width       number，默认 384（挑战图宽度）
 *   type        number，默认 5（call 是 0）
 *   track       {pts,xys,pc,pn,trace} 或 {sx,sy,ex,ey}
 *   dataField   string —— 环境指纹 JSON **字符串**（不是对象；对象会被多包一层引号）
 *   bcv/webp    string/number
 *   c           完整 c 串；或 bcv+timings 现拼（timings → makeC）
 *   timings     {rest,vrest,vreqt,sqt,ojst}
 */
function assemblePlain(o) {
  const x = Object.assign({}, o || {});
  const tr = resolveTrack(x.track);
  const bcv = x.bcv === undefined ? BCV_DEFAULT : x.bcv;
  const c = x.c !== undefined ? String(x.c) : makeC(Object.assign({ bcv }, x.timings || {}));

  if (x.dataField !== undefined && typeof x.dataField !== 'string') {
    throw new Error('dataField 必须是字符串（SDK 里 data 是被 JSON.stringify 过的子串），收到 ' + typeof x.dataField);
  }
  const plain = {
    sessionID: x.sessionID === undefined || x.sessionID === null ? '' : String(x.sessionID),
    width: x.width === undefined ? WIDTH_DEFAULT : Number(x.width),
    type: x.type === undefined ? TYPE_DEFAULT : Number(x.type),
    pts: String(tr.pts),
    xys: String(tr.xys),
    data: x.dataField === undefined ? '' : x.dataField,
    bcv,
    webp: x.webp === undefined ? 1 : Number(x.webp),
    c,
    pc: String(tr.pc),
    pn: String(tr.pn),                       // 真实样本里 pn 是字符串 "1123"（不是数字）
    trace: String(tr.trace),
  };
  // 自检：字段顺序必须与真实样本一致，否则密文/sign 必然不同
  const got = Object.keys(plain);
  if (got.join(',') !== FIELD_ORDER.join(',')) {
    throw new Error('字段顺序错乱：' + got.join(',') + ' ≠ ' + FIELD_ORDER.join(','));
  }
  return plain;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 加密（= SDK 的 ENC(JSON.stringify(payload))）
// ─────────────────────────────────────────────────────────────────────────────
/** 明文对象/字符串 + ks → {plain, d, sign} */
function encryptPlain(plainIn, ks) {
  const plain = typeof plainIn === 'string' ? plainIn : JSON.stringify(plainIn);
  if (!ks || typeof ks.length !== 'number' || !ks.length) throw new Error('缺少 keystream');
  const p = Buffer.from(plain, 'utf8');
  if (ks.length < p.length) {
    throw new Error(`keystream 不足：明文 ${p.length} 字节，ks 只有 ${ks.length} 字节（用 calibrateCaptchaKs 重新标定）`);
  }
  const cipher = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) cipher[i] = p[i] ^ ks[i];
  // 关键：每个密文字节当成一个 0..255 的"字符"再按 UTF-8 编码，最后 base64
  const d = Buffer.from(cipher.toString('latin1'), 'utf8').toString('base64');
  return { plain, d, sign: md5('d' + d + SALT), cipher };
}

/** 解密：d → 明文（复用 dewu_cap_probe.decodeD，逐字节级反向） */
function decryptPlain(d, ks) {
  const { cipher } = decodeD(d);
  if (ks.length < cipher.length) throw new Error(`keystream 不足：密文 ${cipher.length}，ks ${ks.length}`);
  const out = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) out[i] = cipher[i] ^ ks[i];
  return out.toString('utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. keystream 解析（ks 直接用 / sk 现标 / 缓存）
// ─────────────────────────────────────────────────────────────────────────────
const _ksCache = new Map();   // key: sk → {buf, dwsm}

/**
 * 取 keystream。
 * @param {object} o  { ks?:Buffer|Uint8Array, sk?:string, dwsm?:string, needLen?:number, fresh?:boolean }
 * @returns {Promise<Buffer>}
 */
async function resolveKs(o) {
  const x = o || {};
  if (x.ks) {
    const b = Buffer.isBuffer(x.ks) ? x.ks : Buffer.from(x.ks);
    if (x.needLen && b.length < x.needLen) throw new Error(`传入的 ks 太短：${b.length} < 需要 ${x.needLen}`);
    return b;
  }
  const sk = x.sk === undefined || x.sk === null ? '' : String(x.sk);
  const needLen = Number(x.needLen || 1500);
  const key = sk + '\u0000' + (x.dwsm || '');
  const hit = _ksCache.get(key);
  if (hit && !x.fresh && hit.buf.length >= needLen) return hit.buf;
  const calibLen = Math.max(needLen + 256, 2000);
  const buf = Buffer.from(await calibrateCaptchaKs(sk, x.dwsm, calibLen));
  if (!x.keepCache) _ksCache.set(key, { buf });
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. 对外主入口
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 组装 verify 请求体。
 *
 * 同步情形：传了 ks → 直接返回 {plain,d,sign,...}
 * 异步情形：只传 sk → 返回 Promise（内部现标 keystream，同一个 sk 只标一次，之后走缓存）
 *           `await buildVerify(...)` 对两种情形都适用。
 */
function buildVerify(o) {
  const x = Object.assign({}, o || {});
  const plainObj = assemblePlain(x);
  const plain = JSON.stringify(plainObj);

  if (x.ks) {
    const r = encryptPlain(plain, Buffer.isBuffer(x.ks) ? x.ks : Buffer.from(x.ks));
    return finish(r, plainObj, x);
  }

  return (async () => {
    const ks = await resolveKs({
      sk: x.sk,
      dwsm: x.dwsm,
      needLen: Buffer.byteLength(plain, 'utf8') + 32,
      fresh: x.freshKs,
    });
    const r = encryptPlain(plain, ks);
    return finish(r, plainObj, x);
  })();
}

function finish(r, plainObj, x) {
  return {
    plain: r.plain,
    d: r.d,
    sign: r.sign,
    plainObj,
    plainLen: Buffer.byteLength(r.plain, 'utf8'),
    dLen: r.d.length,
    cipherLen: r.cipher.length,
    c: plainObj.c,
    fieldOrder: Object.keys(plainObj),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. 真实样本取用（对拍用；不是"再造一份数据"）
// ─────────────────────────────────────────────────────────────────────────────
/** 读 artifacts/verify_d_plaintext.json（已解密的明文对象，字段顺序即真实顺序） */
function loadSamplePlain() {
  const p = path.join(ROOT, 'artifacts/verify_d_plaintext.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 从 artifacts/capture_verify.json 取那次 verify 的真实 body {d, sign} */
function loadSampleBody() {
  const p = path.join(ROOT, 'artifacts/capture_verify.json');
  const cap = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of cap.requests || []) {
    if (!/captcha\/verify/.test(String(r.url))) continue;
    if (typeof r.request_post_data !== 'string') continue;
    try {
      const j = JSON.parse(r.request_post_data);
      if (j && j.d && j.sign) return { body: j, requestId: r.id, timestamp: r.timestamp, url: r.url };
    } catch (e) { /* 继续找 */ }
  }
  throw new Error('capture_verify.json 里没有带 d/sign 的 verify 请求');
}

/**
 * 已知明文反推 keystream：ks = cipher XOR plaintext。
 * 这是最硬的标定方式（不依赖 sk/UA 推断），用于对拍时的"基准 ks"。
 * @returns {Buffer}
 */
function ksFromKnownPair(dStr, plainStr) {
  const { cipher } = decodeD(dStr);
  const p = Buffer.from(plainStr, 'utf8');
  if (p.length !== cipher.length) {
    throw new Error(`明文/密文长度不一致：${p.length} vs ${cipher.length}（明文可能被重排或多了空格）`);
  }
  return deriveKeystream(cipher, plainStr);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. CLI
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const argv = ARGV;
  const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

  if (!argv.includes('--demo')) {
    console.log('用法:');
    console.log('  node src/cap_verify_builder.js --demo [--json out.json]');
    console.log('  编程: const { buildVerify, makeTrack } = require("./src/cap_verify_builder");');
    return;
  }

  const sample = loadSamplePlain();
  const real = loadSampleBody();
  const sk = JSON.parse(sample.data).sk;
  const dwsm = JSON.parse(sample.data).shumeiId;

  // 真实样本参数照抄，只把 data.dje 换成新的随机串（模拟"同会话下的下一次作答"）
  // 注意：直接改解析后的对象再 JSON.stringify —— 键序与样本完全一致；
  //       不用 cap_solver.buildDataField（它会重写 jcmp.dlocalSk/jcamp.dua，改变样本原值）
  const dataObj = JSON.parse(sample.data);
  const oldDje = dataObj.dje;
  dataObj.dje = randomDje();
  const dataField = JSON.stringify(dataObj);

  const track = { pts: sample.pts, xys: sample.xys, pc: sample.pc, pn: sample.pn, trace: sample.trace };

  console.log('=== 1) 输入（真实样本参数 + 新随机 dje）===');
  console.log('  sessionID :', sample.sessionID.slice(0, 24) + '…（' + sample.sessionID.length + ' 字符）');
  console.log('  dje       :', oldDje, '→', dataObj.dje);
  console.log('  pts       :', track.pts);
  console.log('  xys       :', track.xys.split('|').length, '点');
  console.log('  c         :', sample.c, '（真实 verify 样本：rest/sqt/ojst 非 0）');
  console.log('  sk        :', sk.slice(0, 16) + '…');

  console.log('\n=== 2) 标定 keystream（sk + Firefox UA）===');
  const t0 = Date.now();
  const ks = await resolveKs({ sk, dwsm, needLen: 4000 });
  console.log('  ks 长度   :', ks.length, '| 耗时', Date.now() - t0, 'ms');
  const ksDerived = ksFromKnownPair(real.body.d, JSON.stringify(sample));
  console.log('  与真实样本反推 ks 前', ksDerived.length, '字节一致:',
    ks.slice(0, ksDerived.length).equals(ksDerived));

  console.log('\n=== 3) 组装 + 加密 ===');
  const out = await buildVerify({
    sessionID: sample.sessionID,
    width: sample.width,
    type: sample.type,
    track,
    dataField,
    bcv: sample.bcv,
    webp: sample.webp,
    c: sample.c,
    ks,
  });
  console.log('  字段顺序  :', out.fieldOrder.join(','));
  console.log('  明文长度  :', out.plainLen, '字节');
  console.log('  d 长度    :', out.dLen, '字符');
  console.log('  d         :', out.d.slice(0, 96) + '…');
  console.log('  sign      :', out.sign);

  console.log('\n=== 4) 自检 ===');
  const back = decryptPlain(out.d, ks);
  console.log('  decodeD(d) == 明文          :', back === out.plain);
  console.log('  sign == md5("d"+d+SALT)     :', out.sign === md5('d' + out.d + SALT));
  const plainObj = JSON.parse(out.plain);
  console.log('  JSON 可解析 + 12 字段        :', Object.keys(plainObj).length === 12);
  console.log('  data 里的 dje 已更新         :', JSON.parse(plainObj.data).dje === dataObj.dje);
  console.log('  与真实样本 d 的差异字节数    :', (() => {
    if (out.d === real.body.d) return 0;
    const a = Buffer.from(out.d), b = Buffer.from(real.body.d);
    let n = 0; const m = Math.min(a.length, b.length);
    for (let i = 0; i < m; i++) if (a[i] !== b[i]) n++;
    return n + Math.abs(a.length - b.length);
  })() + '（只有 dje 变了，属于预期内的差异）');

  const jsonOut = argOf('--json');
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({
      request: { d: out.d, sign: out.sign },
      plainLen: out.plainLen, dLen: out.dLen, c: out.c,
      plainHead: out.plain.slice(0, 300), dje: dataObj.dje,
    }, null, 1), 'utf8');
    console.log('\n→ 已写', jsonOut);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
}

module.exports = {
  // 主入口
  buildVerify,
  assemblePlain,
  encryptPlain,
  decryptPlain,
  resolveKs,
  // 轨迹
  makeTrack,
  resolveTrack,
  // c
  makeC,
  parseC,
  // 样本 / 对拍辅助
  loadSamplePlain,
  loadSampleBody,
  ksFromKnownPair,
  // 常量与小工具
  FIELD_ORDER,
  C_VERIFY_SAMPLE,
  BCV_DEFAULT,
  WIDTH_DEFAULT,
  TYPE_DEFAULT,
  SALT,
  md5,
  randomDje,
};
