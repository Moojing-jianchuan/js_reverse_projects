/**
 * 分析 Chrome UA 分支下的 keystream：
 *  ks_chrome[i] = plain[i] ^ cipher[i]，与已知 KS 比对（前缀、偏移、差分、XOR 常量）。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const L = require('../src/preinforce_loader.js');

const KS = L.getKeystream();
const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/ua_chrome_d.json'), 'utf8'));
const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/ua_firefox_d.json'), 'utf8'));

function cipherOf(d) {
  const raw = Buffer.from(d, 'base64');
  const s = raw.toString('utf8');
  return Buffer.from([...s].map(c => c.charCodeAt(0) & 0xff));
}
function ksOf(rec) {
  const cipher = cipherOf(rec.d);
  const plain = Buffer.from(rec.plain[0], 'utf8');
  const n = Math.min(cipher.length, plain.length);
  const ks = Buffer.alloc(n);
  for (let i = 0; i < n; i++) ks[i] = plain[i] ^ cipher[i];
  return { cipher, plain, ks };
}

const F = ksOf(b), C = ksOf(a);
console.log('Firefox: plain', F.plain.length, 'cipher', F.cipher.length, 'ks 前16', F.ks.slice(0, 16).toString('hex'));
console.log('Chrome : plain', C.plain.length, 'cipher', C.cipher.length, 'ks 前16', C.ks.slice(0, 16).toString('hex'));

// yt 字段
for (const [n, r] of [['Firefox', F], ['Chrome', C]]) {
  try {
    const j = JSON.parse(r.plain.toString('utf8'));
    const d = JSON.parse(j.data);
    console.log(n, '→ yt =', d.yt, '| dua 前 40 =', String(d.dua).slice(0, 40));
  } catch (e) { console.log(n, '明文解析失败', e.message.slice(0, 60)); }
}

// 1) KS 里搜 Chrome 的 ks 前 16 字节
const needle = C.ks.slice(0, 16);
const idx = KS.indexOf(needle);
console.log('\n[1] Chrome ks 前16字节 在已知 KS 中的位置:', idx);

// 2) 是否 = KS 的某个偏移（用 32 字节再验一次）
for (let off = 0; off + 32 < KS.length; off++) {
  let same = 0;
  for (let i = 0; i < 32; i++) if (KS[off + i] === C.ks[i]) same++;
  if (same === 32) { console.log('[2] 等于 KS 偏移', off); break; }
}

// 3) Chrome ks 是否自身是"常量异或" KS ^ K
const xorK = Buffer.alloc(32);
for (let i = 0; i < 32; i++) xorK[i] = KS[i] ^ C.ks[i];
let consistent = true;
for (let i = 0; i < Math.min(2000, C.ks.length); i++) {
  if ((KS[i] ^ C.ks[i]) !== xorK[i % 32]) { consistent = false; break; }
}
console.log('[3] Chrome ks = KS XOR 固定32字节常量 ?', consistent, '| 常量', xorK.toString('hex'));

// 4) 统计：Chrome ks 与 KS 的相同字节比例
let same = 0; const n = Math.min(C.ks.length, KS.length);
for (let i = 0; i < n; i++) if (C.ks[i] === KS[i]) same++;
console.log('[4] Chrome ks 与 KS 相同字节:', same, '/', n, '（随机期望 ~' + (n / 256).toFixed(1) + '）');

// 5) 明文长度关系：+62 字符
console.log('[5] 明文长度差:', C.plain.length - F.plain.length);

// 6) 保存 Chrome 观察到的 ks 供后续
fs.writeFileSync(path.join(ROOT, 'artifacts/keystream_chrome_probe.bin'), C.ks);
console.log('\n已存 artifacts/keystream_chrome_probe.bin（', C.ks.length, '字节）');
