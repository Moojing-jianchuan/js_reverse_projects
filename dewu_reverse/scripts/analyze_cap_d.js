/**
 * 分析 artifacts/cap_d_capture.json：
 *  1) d = base64(UTF8(bytestring(cipher))) 逐层还原，求 cipher 真实长度；
 *  2) 与捕获到的明文 JSON 对比长度 → 判定是否"同长度流密码"；
 *  3) 求 keystream = cipher XOR plaintext，看是否常量（=硬编码密钥/固定流）；
 *  4) 暴力试 sign 的拼接规则（yd_md5）。
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/cap_d_capture.json'), 'utf8'));
const xhr = cap.xhrs[0];
const body = JSON.parse(xhr.body);
const d = body.d;
const sign = body.sign;

// ---- 1) 还原 cipher 字符串 ----
const rawBytes = Buffer.from(d, 'base64');            // 1969 bytes
const cipherStr = rawBytes.toString('utf8');          // 每个 cipher char = 一个 0..255 的字符
const cipherBytes = Buffer.alloc(cipherStr.length);
for (let i = 0; i < cipherStr.length; i++) cipherBytes[i] = cipherStr.charCodeAt(i) & 0xff;

console.log('d.len                =', d.length);
console.log('base64 解码字节数      =', rawBytes.length);
console.log('UTF8 解码后 cipher 长度 =', cipherStr.length, '(= 真实密文字节数)');
console.log('cipher 前 32 字节 hex  =', cipherBytes.slice(0, 32).toString('hex'));
console.log('cipher 字节分布: <0x80 =', cipherBytes.filter(b => b < 0x80).length, ', >=0x80 =', cipherBytes.filter(b => b >= 0x80).length);

// ---- 2) 找明文 ----
const cands = cap.jsCalls.filter(c => !c.text.startsWith('['));
console.log('\n候选明文（非数组）:');
for (const c of cands) console.log('  len', c.len, JSON.stringify(c.text.slice(0, 80)));
const plain = cands.find(c => c.len === cipherStr.length) || cands.find(c => Math.abs(c.len - cipherStr.length) <= 4);
if (!plain) {
  console.log('\n!! 没有与 cipher 长度相同的明文候选；列出全部长度:', cands.map(c => c.len));
} else {
  console.log('\n==> 选中的明文 len =', plain.len, '（与 cipher 长度差', cipherStr.length - plain.len, '）');
  const p = Buffer.from(plain.text, 'utf8');
  console.log('明文 UTF-8 字节数 =', p.length);
  const n = Math.min(p.length, cipherBytes.length);
  const ks = Buffer.alloc(n);
  for (let i = 0; i < n; i++) ks[i] = p[i] ^ cipherBytes[i];
  console.log('keystream(前 64 hex) =', ks.slice(0, 64).toString('hex'));
  console.log('keystream ASCII 可读率 =', (ks.toString('latin1').match(/[ -~]/g) || []).length + '/' + n);

  // 明文尾部（d 可能只在明文尾部追加/前缀随机）
  const tail = plain.text.slice(-200);
  console.log('\n明文尾部 200:', JSON.stringify(tail));

  // 保存
  fs.writeFileSync(path.join(ROOT, 'artifacts/cap_plain_call.json'), plain.text);
  fs.writeFileSync(path.join(ROOT, 'artifacts/cap_keystream_call.bin'), ks);

  // ---- 3) 明文是否就是完整 JSON 且能被解析 ----
  try { const j = JSON.parse(plain.text); console.log('\n明文是合法 JSON，顶层字段:', Object.keys(j)); }
  catch (e) { console.log('\n明文不是合法 JSON（可能被截断/被加密包裹）:', e.message.slice(0, 80)); }
}

// ---- 4) sign 规则暴力 ----
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const salts = ['048a9c4943398714b356a696503d2d36', 'dewu', 'h5', '1.3.1.20260331', 'dw', ''];
const parts = { d, plain: plain ? plain.text : '', sign: '' };
const tried = new Set();
let hit = null;
const combos = [];
for (const [pn, pv] of Object.entries(parts)) {
  for (const s of salts) {
    combos.push([`md5(${pn}+'${s}')`, md5(pv + s)]);
    combos.push([`md5('${s}'+${pn})`, md5(s + pv)]);
    combos.push([`md5(${pn}+':'+'${s}')`, md5(pv + ':' + s)]);
  }
  combos.push([`md5(${pn})`, md5(pv)]);
  combos.push([`md5(md5(${pn}))`, md5(md5(pv))]);
}
combos.push(['md5(JSON.stringify({d}))', md5(JSON.stringify({ d }))]);
combos.push(['md5(d+sign-less body)', md5(xhr.body)]);
combos.push(['md5(hsn-style bcv|appid)', md5('1.3.1.20260331h5')]);
for (const [k, v] of combos) { if (tried.has(k)) continue; tried.add(k); if (v === sign) { hit = k; console.log('\n*** sign 命中:', k); break; } }
if (!hit) console.log('\nsign 未命中已试的', tried.size, '种拼接');
console.log('实际 sign =', sign);

// ---- 5) 16 字节随机 ----
const nonceB64 = (cap.b64calls.find(c => c.api === 'fromByteArray' && c.inLen === 16) || {}).outHead;
if (nonceB64) {
  console.log('\n16 字节随机 (base64) =', nonceB64);
  console.log('  → bytes hex =', Buffer.from(nonceB64, 'base64').toString('hex'));
  console.log('  → UTF8 解码 =', JSON.stringify(Buffer.from(nonceB64, 'base64').toString('utf8')));
}
