/**
 * probe_resp_zlib_decisive.js —— 判定「解密后的中间产物是不是 zlib 流」
 * 1) 用截断密文让 Fun99 走失败分支，把它吐出来的东西 base64 解码 → 看是不是 zlib
 * 2) 暴力枚举 zlib 参数，找能让 deflate(明文) 长度 = 密文字节数(7372) 的组合
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..');
const { createEnv } = require('../src/env_patch');

const SDK = fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8');
const respText = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8').trim();
const plainStr = fs.readFileSync(path.join(ROOT, 'artifacts/info_decrypted_raw.txt'), 'utf8').trim();

const cipher = (() => {
  const b = Buffer.from(respText, 'base64');
  const s = b.toString('utf8');
  const o = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
})();
const wrap = (bytes) => Buffer.from(Buffer.from(bytes).toString('latin1'), 'utf8').toString('base64');

const env = createEnv({ blockNetwork: true, traceReads: false });
const w = env.window;
env.evalSource(SDK, 'preinforce2.js');

console.log('=== 1) 截断密文 -> Fun99 失败分支产物 ===');
const half = cipher.slice(0, 3686);
const outHalf = w.fun.Fun99(wrap(half), '', '1', '');
console.log('  type=' + typeof outHalf + ' len=' + String(outHalf).length);
console.log('  head=' + JSON.stringify(String(outHalf).slice(0, 80)));

let buf = null;
if (typeof outHalf === 'string' && /^[A-Za-z0-9+/=]+$/.test(outHalf)) {
  buf = Buffer.from(outHalf, 'base64');
  console.log('  base64 -> bytes =', buf.length, '| head hex =', buf.slice(0, 8).toString('hex'),
    '| 是否 zlib 头(78 ??) =', (buf[0] === 0x78));
  try {
    const inf = zlib.inflateSync(buf);
    console.log('  inflate 成功! len=' + inf.length, '前 100:', JSON.stringify(inf.toString('utf8').slice(0, 100)));
  } catch (e) {
    console.log('  inflate 失败:', e.code || e.message);
    try {
      const inf2 = zlib.inflateSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      console.log('  inflate(部分流) 成功 len=' + inf2.length + ' 前 100:', JSON.stringify(inf2.toString('utf8').slice(0, 100)));
    } catch (e2) { console.log('  部分流也失败:', e2.code || e2.message); }
    try {
      const inf3 = zlib.inflateRawSync(buf.slice(2), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      console.log('  inflateRaw(跳过2字节头,部分流) len=' + inf3.length + ' 前 100:', JSON.stringify(inf3.toString('utf8').slice(0, 100)));
    } catch (e3) { console.log('  inflateRaw 也失败:', e3.code || e3.message); }
  }
}

// 全 0 输入的失败产物是不是 Uint8Array 序列化
console.log('\n=== 2) 全 0 密文 -> 失败分支产物（判断是否 Uint8Array） ===');
const outZero = w.fun.Fun99(wrap(Buffer.alloc(32)), '', '1', '');
console.log('  type=' + typeof outZero + ' len=' + String(outZero).length + ' 内容=' + String(outZero).slice(0, 200));

// 截断产物在多个长度上是否总是 78 9c 开头
console.log('\n=== 3) 多长度截断，看产物头字节 ===');
for (const n of [8, 16, 32, 100, 1000, 3000, 3686, 7371]) {
  const r = w.fun.Fun99(wrap(cipher.slice(0, n)), '', '1', '');
  let h = 'n/a';
  try {
    const b = Buffer.from(String(r), 'base64');
    h = b.slice(0, 6).toString('hex');
  } catch (e) { }
  console.log('  n=' + String(n).padStart(5) + ' out.type=' + typeof r + ' len=' + String(r).length + ' headhex=' + h + ' 前缀=' + JSON.stringify(String(r).slice(0, 20)));
}
env.dispose();

// ── 4) 暴力枚举 zlib 参数 ──────────────────────────────────────────────────
console.log('\n=== 4) 暴力找 deflate(明文) 长度 == 7372 ===');
const TARGET = cipher.length;
const pb = Buffer.from(plainStr, 'utf8');
const pbEscaped = Buffer.from(JSON.stringify(JSON.parse(plainStr)).replace(/[\u0080-\uffff]/g,
  c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')), 'utf8');
const inputs = { raw: pb, unicodeEscaped: pbEscaped };
console.log('  raw bytes=', pb.length, ' unicodeEscaped bytes=', pbEscaped.length);

const found = [];
for (const [iname, ib] of Object.entries(inputs)) {
  for (let level = 0; level <= 9; level++) {
    for (let windowBits = 8; windowBits <= 15; windowBits++) {
      for (let memLevel = 1; memLevel <= 9; memLevel++) {
        let out;
        try { out = zlib.deflateSync(ib, { level, windowBits, memLevel }); } catch (e) { continue; }
        if (out.length === TARGET) found.push({ iname, level, windowBits, memLevel });
      }
    }
  }
}
console.log('  精确命中:', found.length ? JSON.stringify(found) : '无');
if (!found.length) {
  // 记录最接近
  let best = null;
  for (const [iname, ib] of Object.entries(inputs)) {
    for (let level = 0; level <= 9; level++) {
      for (let windowBits = 8; windowBits <= 15; windowBits++) {
        for (let memLevel = 1; memLevel <= 9; memLevel++) {
          let out; try { out = zlib.deflateSync(ib, { level, windowBits, memLevel }); } catch (e) { continue; }
          const d = out.length - TARGET;
          if (!best || Math.abs(d) < Math.abs(best.d)) best = { iname, level, windowBits, memLevel, len: out.length, d };
        }
      }
    }
  }
  console.log('  最接近:', JSON.stringify(best));
}
