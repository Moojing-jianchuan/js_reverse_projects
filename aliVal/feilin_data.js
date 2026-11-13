// FeiLin data 生成器骨架：外层链路已由 static/REPORT_A.md 证明，暗层留接口
// 用法：node feilin_data.js --demo
const zlib = require('zlib');
const crypto = require('crypto');

const MAGIC = Buffer.from([0x25, 0x13, 0x27]);

// 1) payload：nonce(32 hex 明文) ‖ JSON，键顺序固定
function buildPayload({ trackList, trackStartTime, verifyTime, xPos, slidePos, arg, nonce }) {
  const n = nonce || crypto.randomBytes(16).toString('hex'); // 32 个 [0-9a-f]
  const obj = {
    TrackList: trackList,
    TrackStartTime: trackStartTime,
    VerifyTime: verifyTime,
    xPos: String(xPos),
    slidePos: String(slidePos),
    arg: arg,
  };
  return { nonce: n, plain: n + JSON.stringify(obj), payload: obj };
}

// 2) T = base64(zlib_deflate(plain))，等价于 pako.deflate 默认参数(level 6) + window.btoa
function deflateToT(plain) {
  const deflated = zlib.deflateSync(Buffer.from(plain, 'latin1'), { level: 6 });
  return { deflated, T: deflated.toString('base64') };
}

// 3) 暗层 armour：已完全解出（static/REPORT_A4.md）
//    - 输入 T（deflate 的 base64 原文，纯 ASCII），输出与 T 等长的字节串，
//      其中前 3 字节恰好是 0x25 0x13 0x27（由算法 + T 恒以 "eJ" 开头决定，不是常量）
//    - 无密钥：只依赖构建常量 SEED 与固定的初始 64 项表
//    - 结构：用 SEED 打乱 64 项表 → 逐字符做「表项 + 状态推进 + 自修改 swap」→ 输出等长字节
const ARMOUR_TABLE = [
  32, 50, 10, 51, 6, 44, 37, 16, 46, 11, 62, 19, 43, 25, 23, 30,
  60, 33, 53, 34, 7, 26, 12, 48, 5, 2, 20, 4, 61, 13, 47, 49,
  18, 29, 27, 22, 1, 17, 39, 56, 41, 38, 55, 31, 15, 58, 52, 40,
  8, 57, 45, 35, 59, 36, 42, 54, 63, 3, 24, 28, 14, 9, 0, 21,
];
const ARMOUR_SEED = '3e627e1b4c63f913';
const MASK63 = 63;

function _swap3xor(a, i, j) {
  a[i] ^= a[j];
  a[j] ^= a[i];
  a[i] ^= a[j];
}

function armour(T, seed = ARMOUR_SEED) {
  const r = ARMOUR_TABLE.slice();
  const n = String(seed);
  const s = String(T); // 纯 ASCII；浏览器侧的 unescape(encodeURIComponent(s)) 在此为恒等

  // 阶段 1：用种子打乱 64 项表
  for (let i = 0, t = 0; i < r.length; i++) {
    t = ((((i + t) + r[i] + r[t]) >> 1) + n.charCodeAt(i % n.length)) & MASK63;
    if (i !== t) _swap3xor(r, i, t);
  }

  // 阶段 2：逐字符变换（状态 e/a 自推进，表在过程中被自修改）
  const out = Buffer.alloc(s.length);
  let e = 0, a = 0;
  for (let i = 0; i < s.length; i++) {
    a = ((e ^ a) + (r[e] ^ r[a])) & MASK63;
    if (e !== a) _swap3xor(r, e, a);
    let m = s.charCodeAt(i) + e + r[e];
    m = m - (a + r[a]);
    m = m ^ (r[e] + r[a]);
    m = m ^ r[(r[e] + r[a]) & MASK63];
    out[i] = m & 0xff;
    e = (e + 1) & MASK63;
  }
  return out; // 长度 = |T|，前 3 字节即 25 13 27
}

// 4) data = base64( armour(T) )   ← armour 的输出已经自带 0x25 0x13 0x27
function wrap(enc) {
  return Buffer.from(enc).toString('base64');
}

// 3b) armour 的逆变换（新增，2026-11-13）
//   正向：out[i] = ((c + e + r[e]) - (a + r[a])) ^ (r[e]+r[a]) ^ r[(r[e]+r[a]) & 63]，随后 e = (e+1) & 63
//   逆变换：c = ((out ^ r[k] ^ (r[e]+r[a])) + (a + r[a]) - e - r[e]) & 0xff，其中 k=(r[e]+r[a])&63
//   表打乱阶段与状态推进（a / swap / e）只依赖表本身，故可原样重放；只有 charCode 那一步需要解方程。
//   用于：把历史/线上的 data 解回 T → inflate → payload（e2e_05_decode.js 已用它解了 8 个真实样本）。
function unarmour(bytes, seed = ARMOUR_SEED) {
  const r = ARMOUR_TABLE.slice();
  const n = String(seed);
  for (let i = 0, t = 0; i < r.length; i++) {
    t = ((((i + t) + r[i] + r[t]) >> 1) + n.charCodeAt(i % n.length)) & MASK63;
    if (i !== t) _swap3xor(r, i, t);
  }
  const out = Buffer.alloc(bytes.length);
  let e = 0, a = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = ((e ^ a) + (r[e] ^ r[a])) & MASK63;
    if (e !== a) _swap3xor(r, e, a);
    const k = (r[e] + r[a]) & MASK63;
    const m = bytes[i] ^ r[k] ^ (r[e] + r[a]);
    out[i] = (m + (a + r[a]) - e - r[e]) & 0xff;
    e = (e + 1) & MASK63;
  }
  return out;
}

function buildData(input, opts = {}) {
  const { nonce, plain, payload } = buildPayload(input);
  const { deflated, T } = deflateToT(plain);
  const enc = armour(T, opts.seed || ARMOUR_SEED);
  const data = wrap(enc);
  return { nonce, plain, payload, deflated, T, enc, data,
           lens: { plain: plain.length, deflated: deflated.length, T: T.length, enc: enc.length, data: data.length } };
}

module.exports = { buildPayload, deflateToT, armour, unarmour, wrap, buildData, MAGIC, ARMOUR_TABLE, ARMOUR_SEED };

if (require.main === module) {
  const demo = buildData({
    trackList: { mc: '627,749,22236, ,0', tc: '', mu: '1147,749,2996, ,0', te: '',
                 mp: '639,750,2384,0', tmv: '', mm: '627,749,22235,0', ks: '', fi: '',
                 startTime: 1794412689730 },
    trackStartTime: 1794412689730,
    verifyTime: 1794412712539,
    xPos: 170, slidePos: 208, arg: 'PgQU8DYPLRdiDw==',
  });
  console.log('nonce =', demo.nonce);
  console.log('lens  =', demo.lens);
  console.log('T     =', demo.T.slice(0, 24), '…', 'head', demo.T.slice(0, 2));
  console.log('data  =', demo.data.slice(0, 32), '…');
  console.log('\n校验：T 长度应为 ceil(deflate/3)*4 =', Math.ceil(demo.deflated.length / 3) * 4,
              '| enc 应为 T-3 =', demo.T.length - 3, '| 实际 enc =', demo.enc.length);
  const back = Buffer.from(demo.data, 'base64');
  console.log('data 前 3 字节 =', [...back.slice(0, 3)].map(x => x.toString(16)).join(' '));
}
