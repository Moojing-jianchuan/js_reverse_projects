// enc_repro.js — 纯 JS 复现 FeiLin VM 暗层（pe.069 bytecode F + pool q），逐字节验证。
//
// 反汇编结论（pe.069: 解释器 L [210609,214587)，字节码 F [218834,263590) 1498 words，
// 常量池 q [218317,218831) 135 entries；调用点 tc:296633 `L(0,[],F,q,eO,e7)`）：
//
//   局部名表（由 XOR+fromCharCode lambda 解出）：
//     u.e=Boolean  u.a=Number  u.h=String
//     u.m="atob"   u.C="btoa"   u.l="encodeURIComponent"
//     u.c="decodeURIComponent"  u.f="escape"  u.s="unescape"
//
//   o = unescape(encodeURIComponent(arguments[0]))     // UTF-8 -> latin1（输入是 ASCII 时=恒等）
//   n = arguments[1]                                    // 种子串
//   r = [64 项固定置换表]
//
//   // 阶段 1：用 n 打乱 r
//   for (i = 0, t = 0; i < 64; i++) {
//       t = (((i + t) + r[i] + r[t]) >> 1) + n.charCodeAt(i % n.length);
//       t = t & 63;
//       if (i !== t) swap3xor(r, i, t);
//   }
//   // 阶段 2：逐字符变换
//   out = ""; e = 0; a = 0;
//   for (i = 0; i < o.length; i++) {
//       a = ((e ^ a) + (r[e] ^ r[a])) & 63;
//       if (e !== a) swap3xor(r, e, a);
//       m  = o.charCodeAt(i) + e + r[e];
//       m  = m - (a + r[a]);
//       m  = m ^ (r[e] + r[a]);
//       m  = m ^ r[(r[e] + r[a]) & 63];
//       m  = m & 255;
//       out += String.fromCharCode(m);
//       e = (e + 1) & 63;
//   }
//   return btoa(out);
//
// 种子 = "3e627e1b4c63f913"（**每次构建固定的常量**，与 nonce/key 无关）：
//   tc:306599  e7 = [ n8.w($, nO), tg + n8.X(eP, 59, 287) ]
//   tg = eP(9,89)  (tc:279554)   eP(i,k) = nc(k-3, i)
//   nc(86, 9)   = "3e627e1b"
//   nc(284, 59) = "4c63f913"
//
// usage: node enc_repro.js [sample.json ...]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TABLE = [32, 50, 10, 51, 6, 44, 37, 16, 46, 11, 62, 19, 43, 25, 23, 30,
  60, 33, 53, 34, 7, 26, 12, 48, 5, 2, 20, 4, 61, 13, 47, 49,
  18, 29, 27, 22, 1, 17, 39, 56, 41, 38, 55, 31, 15, 58, 52, 40,
  8, 57, 45, 35, 59, 36, 42, 54, 63, 3, 24, 28, 14, 9, 0, 21];

const SEED = '3e627e1b4c63f913';

function swap3xor(a, i, j) {
  a[i] ^= a[j];
  a[j] ^= a[i];
  a[i] ^= a[j];
}

function armour(input, seed = SEED) {
  const MASK = 63;
  const r = TABLE.slice();
  const n = String(seed);
  const o = unescape(encodeURIComponent(input));
  // 阶段 1
  for (let i = 0, t = 0; i < r.length; i++) {
    t = ((((i + t) + r[i] + r[t]) >> 1) + n.charCodeAt(i % n.length)) & MASK;
    if (i !== t) swap3xor(r, i, t);
  }
  // 阶段 2
  const bytes = Buffer.alloc(o.length);
  let e = 0, a = 0;
  for (let i = 0; i < o.length; i++) {
    a = ((e ^ a) + (r[e] ^ r[a])) & MASK;
    if (e !== a) swap3xor(r, e, a);
    let m = o.charCodeAt(i) + e + r[e];
    m = m - (a + r[a]);
    m = m ^ (r[e] + r[a]);
    m = m ^ r[(r[e] + r[a]) & MASK];
    bytes[i] = m & 0xff;
    e = (e + 1) & MASK;
  }
  return { b64: Buffer.from(bytes.toString('latin1'), 'latin1').toString('base64'), bytes, table: r };
}

// ---------------------------------------------------------------------------
function verify(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const T = d.deflate_b64.trim();
  const data = d.cvp_blob.trim();
  const T2 = d.deflate_b64.trim();
  const payload = zlib.inflateSync(Buffer.from(T, 'base64'));
  const nonce = payload.subarray(0, 32).toString('latin1');

  const { b64, bytes, table } = armour(T);
  const expect = Buffer.from(data, 'base64');

  console.log(`\n===== ${path.basename(file)}`);
  console.log(`  T (deflate_b64)      len=${T.length}   head=${T.slice(0, 16)}`);
  console.log(`  data (cvp_blob)      len=${data.length}  b64decode=${expect.length} B  first3=${expect.subarray(0, 3).toString('hex')}`);
  console.log(`  nonce (payload 前缀)  ${nonce}`);
  console.log(`  our output           len=${b64.length}  b64decode=${bytes.length} B  first3=${bytes.subarray(0, 3).toString('hex')}`);

  const fullEq = b64 === data;
  console.log(`  >>> data 全串相等: ${fullEq}`);
  let diffs = 0;
  if (bytes.length === expect.length) {
    for (let i = 0; i < bytes.length; i++) if (bytes[i] !== expect[i]) diffs++;
  }
  console.log(`  >>> enc 逐字节不等数: ${diffs} / ${expect.length}`);

  // 明示 nonce 无关性：换 nonce 不影响结果
  const alt = armour(T, SEED);
  console.log(`  >>> 同 T 再算一次（确定性）: ${alt.b64 === b64}`);

  // enc 与 T[3:] 的关系（ks 只在 0..2 位置受 magic 影响）
  let same = 0;
  for (let i = 3; i < Math.min(bytes.length, T.length); i++) if (bytes[i] === T.charCodeAt(i)) same++;
  console.log(`  >>> enc[i] == T[i] 的位置数(i>=3): ${same}/${Math.min(bytes.length, T.length) - 3}`);

  return { fullEq, diffs, table, bytes, expect };
}

const files = process.argv.slice(2);
if (!files.length) files.push('../../config/cvp_sample_1.json', '../../config/cvp_sample_2.json');
const results = [];
for (const f of files) {
  try { results.push(verify(path.resolve(f))); } catch (e) { console.log(f, 'ERR', e.message); }
}

if (results.length === 2 && results[0].table && results[1].table) {
  const same = results[0].table.every((v, i) => v === results[1].table[i]);
  console.log(`\n===== 两组样本打乱后的 64 表是否相同: ${same}  (种子固定 ⇒ 应相同)`);
  console.log(`  表: [${results[0].table.join(',')}]`);
}
