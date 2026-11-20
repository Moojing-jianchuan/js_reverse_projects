/**
 * 分析 dewuCap 产出的 captcha/call 载荷：d 的结构 + sign 的签名规则
 * 用法: node scripts/analyze_cap_call.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const bodyPath = path.join(ROOT, 'artifacts', 'cap_call_body.json');
const raw = fs.readFileSync(bodyPath, 'utf8');
const { d, sign } = JSON.parse(raw);

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const SALT = '048a9c4943398714b356a696503d2d36';

function realBytesFromB64(b64) {
  const buf = Buffer.from(b64, 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

console.log('=== 载荷概况 ===');
console.log('d.length   :', d.length);
console.log('sign       :', sign);

const bytes = realBytesFromB64(d);
console.log('d 真实字节 :', bytes.length, '（与 b64 文本长度比', (bytes.length / d.length).toFixed(3), '）');
console.log('头 32 字节 :', bytes.slice(0, 32).toString('hex'));
console.log('尾 16 字节 :', bytes.slice(-16).toString('hex'));

// 熵估计
const freq = new Array(256).fill(0);
for (const b of bytes) freq[b]++;
let H = 0;
for (const f of freq) if (f) { const p = f / bytes.length; H -= p * Math.log2(p); }
console.log('字节熵     :', H.toFixed(3), 'bits/byte', H > 7.5 ? '（≈随机/加密）' : '（有结构）');

// 明文口子：试着直接按 latin1 看
console.log('latin1 head:', JSON.stringify(bytes.slice(0, 60).toString('latin1')));

// ==== sign 规则穷举 ====
console.log('\n=== sign 规则对拍 ===');
const cands = {
  'md5(d)': md5(d),
  'md5(d+SALT)': md5(d + SALT),
  'md5(SALT+d)': md5(SALT + d),
  'md5("d"+d+SALT)': md5('d' + d + SALT),
  'md5("d"+d)': md5('d' + d),
  'md5(JSON{d})': md5(JSON.stringify({ d })),
  'md5(bytesLatin1)': md5(bytes.toString('latin1')),
  'md5(bytesHex)': md5(bytes.toString('hex')),
};
let hit = false;
for (const [k, v] of Object.entries(cands)) {
  const ok = v === sign;
  if (ok) hit = true;
  console.log(` ${ok ? '✅' : '  '} ${k} = ${v}`);
}
if (!hit) console.log(' → 以上都不匹配，sign 的输入不是简单的 d+盐');

// 在 d 的真实字节里找可读串（可能藏着明文头，如时间戳/sessionId/"withInMini"）
console.log('\n=== d 内可读串扫描 ===');
const txt = bytes.toString('latin1');
const words = txt.match(/[ -~]{4,}/g) || [];
console.log('可读片段数:', words.length);
console.log(words.slice(0, 20).map(w => JSON.stringify(w)).join(' '));

fs.writeFileSync(path.join(ROOT, 'artifacts', 'cap_call_d_bytes.bin'), bytes);
console.log('\n→ d 的真实字节已存 artifacts/cap_call_d_bytes.bin');
