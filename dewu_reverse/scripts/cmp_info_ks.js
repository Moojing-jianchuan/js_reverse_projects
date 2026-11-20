/**
 * 离线判定：info 的 {data} 密文所用 keystream，是否与 captcha 标定出来的 ks 相同
 * 样本：id 87（HTTP 200 放行态）
 * 用法: node scripts/cmp_info_ks.js
 */
const loader = require('../src/preinforce_loader');

const SK = 'YOUR_SK_HERE';

// id 87 的 data（hex 前缀 + b64）
const DATA = 'df74e6521fc1ea3752eddb701c5453b8w6bDlcK3F37Dv1AyGcK5GmlRd8OfcMKAw4/CnMO/w6sdcMKpw7goMsOQNMMpwo5kWsK7wpYRw4DDlyJ6YMOdw5MMFjvDm1BaCMKjwrPChSTCuxAyw4N4w44YK8KZWcKVwrHDn8OQKcKPMsO3PMKwR0BBwpvCksO2w4o+PF9Xw4lfRsKcwqbCrkXDhnzCgF3Cm2HCtMOpTUokWXjDiC3CiC3DoXHCpcOLMsKRJHQuw5rDqgDCrXvCrw==';

function real(b64) {
  const buf = Buffer.from(b64, 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

(async () => {
  const hex = DATA.slice(0, 32);
  const cipher = real(DATA.slice(32));
  console.log('hex 前缀:', hex);
  console.log('密文长度:', cipher.length);

  // 明文候选（与 hex=md5(明文) 自校验）
  const plain = JSON.stringify({
    sign: 'f2b6b4c666227d52fdadf251f307445d',
    pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true
  });
  console.log('明文长度:', Buffer.byteLength(plain), '| md5(明文):', loader.md5(plain), '| 与 hex 一致:', loader.md5(plain) === hex);

  const p = Buffer.from(plain, 'utf8');
  const ksInfo = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) ksInfo[i] = p[i] ^ cipher[i];
  console.log('\ninfo 密文反推 keystream(前16):', ksInfo.slice(0, 16).toString('hex'));

  console.log('标定 captcha keystream(需 2s)…');
  const ksCap = await loader.calibrateKeystream(SK);
  console.log('captcha keystream (前16):', Buffer.from(ksCap).slice(0, 16).toString('hex'));

  let same = 0;
  const n = Math.min(ksInfo.length, ksCap.length);
  for (let i = 0; i < n; i++) if (ksInfo[i] === ksCap[i]) same++;
  console.log(`\n相同字节: ${same}/${n}  (${(same / n * 100).toFixed(1)}%)`);
  console.log(same === n ? '✅ 同一张 keystream → info 的 {data} 可用 captcha 标定结果生成'
    : same / n > 0.9 ? '⚠ 高度接近但非全同 → 可能 UA/版本差异'
      : '❌ 不同表 → info 用的是另一套 keystream，需要另行标定');
})();
