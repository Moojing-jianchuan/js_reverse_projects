/**
 * info 密文比明文长 1 字节 → 扫描偏移，找与 captcha 标定 ks 对齐的位置
 */
const loader = require('../src/preinforce_loader');
const SK = 'YOUR_SK_HERE';
const DATA = 'df74e6521fc1ea3752eddb701c5453b8w6bDlcK3F37Dv1AyGcK5GmlRd8OfcMKAw4/CnMO/w6sdcMKpw7goMsOQNMMpwo5kWsK7wpYRw4DDlyJ6YMOdw5MMFjvDm1BaCMKjwrPChSTCuxAyw4N4w44YK8KZWcKVwrHDn8OQKcKPMsO3PMKwR0BBwpvCksO2w4o+PF9Xw4lfRsKcwqbCrkXDhnzCgF3Cm2HCtMOpTUokWXjDiC3CiC3DoXHCpcOLMsKRJHQuw5rDqgDCrXvCrw==';

function real(b64) {
  const buf = Buffer.from(b64, 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

(async () => {
  const cipher = real(DATA.slice(32));
  const plain = Buffer.from(JSON.stringify({
    sign: 'f2b6b4c666227d52fdadf251f307445d',
    pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true
  }), 'utf8');
  const ksCap = Buffer.from(await loader.calibrateKeystream(SK));
  console.log(`cipher=${cipher.length} plain=${plain.length} ksCap=${ksCap.length}`);
  console.log('cipher head:', cipher.slice(0, 8).toString('hex'));
  console.log('ksCap  head:', ksCap.slice(0, 8).toString('hex'));

  for (let off = 0; off <= 4; off++) {
    const n = Math.min(plain.length, cipher.length - off);
    let same = 0;
    const ks = Buffer.alloc(n);
    for (let i = 0; i < n; i++) { ks[i] = plain[i] ^ cipher[i + off]; }
    for (let i = 0; i < n; i++) if (ks[i] === ksCap[i]) same++;
    console.log(`offset=${off}: 匹配 ${same}/${n} (${(same / n * 100).toFixed(1)}%)  推导ks前8=${ks.slice(0, 8).toString('hex')}`);
  }

  // 也试：明文头部少一个字节（如 {  被吃）
  for (let poff = 0; poff <= 2; poff++) {
    const n = Math.min(plain.length - poff, cipher.length);
    let same = 0;
    for (let i = 0; i < n; i++) if ((plain[i + poff] ^ cipher[i]) === ksCap[i]) same++;
    console.log(`plainOffset=${poff}: 匹配 ${same}/${n} (${(same / n * 100).toFixed(1)}%)`);
  }
})();
