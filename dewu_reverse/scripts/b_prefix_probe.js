/**
 * B-4：破“多出来的 1 字节”
 * 假设：真实浏览器把 data 加密成 XOR(prefix + 明文, ks)，prefix 是"环境缺值标记"串（'',或 L/W/H/U 组合）。
 *      jsdom 里 8 项探测值全为真 → prefix='' → 密文 124B；线上 125B → prefix 恰 1 个字符。
 * 手法：用 jsdom 标定出的 ks 去对线上抓包做穷举 —— 找使 (c+明文) XOR ks == 线上密文 的那个 c。
 * 用法: node scripts/b_prefix_probe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const KS = fs.readFileSync(path.join(ROOT, 'artifacts/b_ks.bin'));
const CAPTURED_DATA = 'df74e6521fc1ea3752eddb701c5453b8w6bDlcK3F37Dv1AyGcK5GmlRd8OfcMKAw4/CnMO/w6sdcMKpw7goMsOQNMMpwo5kWsK7wpYRw4DDlyJ6YMOdw5MMFjvDm1BaCMKjwrPChSTCuxAyw4N4w44YK8KZWcKVwrHDn8OQKcKPMsO3PMKwR0BBwpvCksO2w4o+PF9Xw4lfRsKcwqbCrkXDhnzCgF3Cm2HCtMOpTUokWXjDiC3CiC3DoXHCpcOLMsKRJHQuw5rDqgDCrXvCrw==';
const CAPTURED_PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';

function realBytes(b64) {
  const raw = Buffer.from(String(b64), 'base64');
  const t = raw.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}
const cipher = realBytes(CAPTURED_DATA.slice(32));
const plain = Buffer.from(CAPTURED_PLAIN, 'utf8');
console.log('captured cipherLen', cipher.length, '| plainLen', plain.length, '| ksLen', KS.length);
console.log('cipher head:', cipher.slice(0, 8).toString('hex'));

/* 1) 前缀假设：cipher[i] = (prefix+plain)[i] ^ KS[i] */
const hits = [];
for (let c = 0; c < 256; c++) {
  let ok = 0;
  const n = Math.min(cipher.length, KS.length);
  for (let i = 0; i < n; i++) {
    const src = i === 0 ? c : plain[i - 1];
    if ((src ^ KS[i]) === cipher[i]) ok++;
  }
  if (ok === n) hits.push(c);
}
console.log('\n[prefix] 完整匹配的 prefix 字节:', hits.map(h => h + "('" + String.fromCharCode(h) + "')").join(', ') || '无');

/* 2) 后缀假设：cipher[i] = plain[i] ^ KS[i]（前 124），第 125 字节是尾部附加明文 */
{
  let ok = 0;
  const n = 124;
  for (let i = 0; i < n; i++) if ((plain[i] ^ KS[i]) === cipher[i]) ok++;
  console.log('[suffix] 前 124 字节直接对齐:', ok + '/' + n, '| 尾部多余字节 plain 化:', (cipher[124] ^ KS[124]).toString(16), JSON.stringify(String.fromCharCode(cipher[124] ^ KS[124])));
}

/* 3) 逐位置报告，看清差在哪 */
{
  console.log('\n[i] cap^KS vs plain(shift0) / plain(shift1)');
  for (let i = 0; i < 6; i++) {
    const p0 = (i < plain.length) ? plain[i] : -1;
    const p1 = (i - 1 >= 0 && i - 1 < plain.length) ? plain[i - 1] : -1;
    console.log(`  i=${i} cap=${cipher[i]} plain0=${p0} plain1=${p1} ks=${KS[i]} -> x0=${cipher[i] ^ KS[i]} x1=${cipher[i] ^ KS[i]}` + (p1 === (cipher[i] ^ KS[i]) ? '  <=shift1 命中' : '') + (p0 === (cipher[i] ^ KS[i]) ? '  <=shift0 命中' : ''));
  }
  // 全量统计
  let s0 = 0, s1 = 0;
  for (let i = 0; i < 124; i++) { if ((plain[i] ^ KS[i]) === cipher[i]) s0++; if (i >= 1 && (plain[i - 1] ^ KS[i]) === cipher[i]) s1++; }
  console.log('  shift0 命中', s0 + '/124', '| shift1(i>=1) 命中', s1 + '/123');
}

/* 4) 用 prefix + 明文 复算整条 data，与抓包逐字比对 */
if (hits.length) {
  const pre = Buffer.from([hits[0]]);
  const src = Buffer.concat([pre, plain]);
  const out = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] ^ KS[i];
  const b64 = Buffer.from(out.toString('latin1'), 'utf8').toString('base64');
  const data = md5(CAPTURED_PLAIN) + b64;
  console.log('\n[rebuilt] data == captured:', data === CAPTURED_DATA);
  console.log('  rebuilt:', data.slice(0, 90));
  console.log('  captured:', CAPTURED_DATA.slice(0, 90));
}
