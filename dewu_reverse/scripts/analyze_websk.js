/**
 * 用已破解的固定 keystream 去解 dav.dewu.com/webSk 的响应
 * 假设：SDK 各接口共用同一张硬编码 keystream（captcha 的 d 已证明）
 * 用法: node scripts/analyze_websk.js
 */
const fs = require('fs');
const path = require('path');
const { getKeystream } = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const hex = fs.readFileSync(path.join(ROOT, 'artifacts/websk_resp.txt'), 'utf8').trim();
console.log('响应文本长度:', hex.length, '| 是否纯 HEX:', /^[0-9A-Fa-f]+$/.test(hex));

const cipher = Buffer.from(hex, 'hex');
console.log('密文字节数:', cipher.length);

const ks = getKeystream();
console.log('keystream 长度:', ks.length);

function xor(buf, k, off = 0) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ k[(i + off) % k.length];
  return out;
}

const plain = xor(cipher, ks, 0);
console.log('\n=== XOR(offset=0) 前 300 字节 ===');
console.log(JSON.stringify(plain.slice(0, 300).toString('latin1')));
const printable = (plain.slice(0, 200).toString('latin1').match(/[ -~]/g) || []).length;
console.log('可打印率(前200):', (printable / 200).toFixed(2));

// 是否 JSON
try {
  const obj = JSON.parse(plain.toString('utf8'));
  console.log('✅ 直接 JSON.parse 成功:', JSON.stringify(obj).slice(0, 400));
} catch (e) {
  console.log('JSON.parse 失败:', e.message.slice(0, 80));
  // 试 latin1 -> 再 JSON
  try {
    const t = plain.toString('latin1');
    const obj = JSON.parse(t);
    console.log('✅ latin1 JSON 成功:', JSON.stringify(obj).slice(0, 400));
  } catch (e2) {
    // 扫描偏移，找 JSON 起点 {"
    let best = null;
    for (let off = 0; off < 512; off++) {
      const p = xor(cipher.slice(0, 64), ks, off);
      const s = p.toString('latin1');
      if (s.startsWith('{"') || s.startsWith('{')) { console.log('发现候选偏移', off, JSON.stringify(s.slice(0, 80))); if (!best) best = off; }
    }
    if (best === null) console.log('偏移 0..511 内没有以 { 开头的明文');
  }
}

fs.writeFileSync(path.join(ROOT, 'artifacts/websk_plain_off0.bin'), plain);
console.log('\n→ 结果已存 artifacts/websk_plain_off0.bin');
