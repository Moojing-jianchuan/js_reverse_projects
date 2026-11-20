/**
 * B-4b：判定线上抓包是 shift0（无前缀）还是 shift1（1 字符前缀），并给出最佳 prefix 字节与匹配率
 * 用法: node scripts/b_prefix_probe2.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const KS = fs.readFileSync(path.join(ROOT, 'artifacts/b_ks.bin'));

const CAP = 'df74e6521fc1ea3752eddb701c5453b8w6bDlcK3F37Dv1AyGcK5GmlRd8OfcMKAw4/CnMO/w6sdcMKpw7goMsOQNMMpwo5kWsK7wpYRw4DDlyJ6YMOdw5MMFjvDm1BaCMKjwrPChSTCuxAyw4N4w44YK8KZWcKVwrHDn8OQKcKPMsO3PMKwR0BBwpvCksO2w4o+PF9Xw4lfRsKcwqbCrkXDhnzCgF3Cm2HCtMOpTUokWXjDiC3CiC3DoXHCpcOLMsKRJHQuw5rDqgDCrXvCrw==';
const PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';

function realBytes(b64) {
  const raw = Buffer.from(String(b64), 'base64');
  const t = raw.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}
const c = realBytes(CAP.slice(32));
const p = Buffer.from(PLAIN, 'utf8');
console.log('cipherLen', c.length, 'plainLen', p.length);

const map0 = [], map1 = [];
for (let i = 0; i < c.length; i++) {
  const x = c[i] ^ KS[i];
  map0.push(i < p.length && x === p[i] ? '1' : '0');
  map1.push(i >= 1 && i - 1 < p.length && x === p[i - 1] ? '1' : '0');
}
const cnt = a => a.filter(x => x === '1').length;
console.log('shift0 map:', map0.join(''), '=>', cnt(map0) + '/' + c.length);
console.log('shift1 map:', map1.join(''), '=>', cnt(map1) + '/' + c.length);

/* 最佳 prefix 字节（只考查 i=0，其余按 shift1） */
let best = { c: -1, ok: -1 };
for (let ch = 0; ch < 256; ch++) {
  let ok = 0;
  for (let i = 0; i < c.length; i++) {
    const src = i === 0 ? ch : (i - 1 < p.length ? p[i - 1] : -1);
    if (src >= 0 && (src ^ KS[i]) === c[i]) ok++;
  }
  if (ok > best.ok) best = { c: ch, ok };
}
console.log('best prefix byte:', best.c, JSON.stringify(String.fromCharCode(best.c)), '->', best.ok + '/' + c.length);

/* 逐段命中率（看是不是"前 N 字节同 ks，后面 ks 不同"） */
for (let s = 0; s < c.length; s += 20) {
  const seg0 = map0.slice(s, s + 20).join('');
  const seg1 = map1.slice(s, s + 20).join('');
  console.log(`  [${s}-${Math.min(s + 19, c.length - 1)}] shift0=${cnt([...seg0])}/${seg0.length} shift1=${cnt([...seg1])}/${seg1.length}`);
}
