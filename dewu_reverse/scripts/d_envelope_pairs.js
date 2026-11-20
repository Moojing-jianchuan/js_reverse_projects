/**
 * D-1：生成对拍样本 artifacts/envelope_pairs.json
 * 每条记录：明文 / data / hex32 / 密文字节(hex) / ks 头 / SDK 直出与纯算法是否逐字一致
 * 用法: node scripts/d_envelope_pairs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pe = require('../src/pceptor_encrypt');

const ROOT = path.resolve(__dirname, '..');
const pairs = [];

const cases = [
  ['info-644479-p1', pe.infoPlain({})],
  ['info-644479-p2', pe.infoPlain({ pageNum: 2 })],
  ['info-644443-p1-size12', pe.infoPlain({ pickRuleId: 644443, pageSize: 12 })],
];

for (const [id, plain] of cases) {
  const pure = pe.buildInfoEnvelope(plain, { debug: true });
  const sdk = pe.sdkEnvelope(plain);
  const ks = pe.xor(Buffer.from(plain, 'utf8'), pure.cipher);
  pairs.push({
    id,
    source: 'local(jsdom preinforce2.Fun110 + pure algorithm)',
    sk: pe.DEFAULT_SK,
    shumeiid: pe.DEFAULT_SM,
    ua: pe.sdkEnvelope ? undefined : undefined,
    plain,
    plainLen: Buffer.byteLength(plain),
    sign: JSON.parse(plain).sign,
    hex: pure.hex,
    hexMatchesMd5: pure.hex === pe.md5(plain),
    data: pure.data,
    dataLen: pure.data.length,
    b64: pure.b64,
    cipherHex: pure.cipher.toString('hex'),
    cipherLen: pure.cipher.length,
    keystreamHeadHex: ks.subarray(0, 16).toString('hex'),
    sdkEqualsPure: sdk.data === pure.data,
    sdkMs: sdk.ms,
    pureMs: pure.ms,
  });
  console.log(`[${id}] plain=${Buffer.byteLength(plain)} cipher=${pure.cipher.length} hex=${pure.hex.slice(0, 8)}… sdk==pure:${sdk.data === pure.data}`);
}

// 线上抓包样本（对端 UA 分支不同：ks 只有前 29 字节与本机表一致）
const CAP_DATA = 'df74e6521fc1ea3752eddb701c5453b8w6bDlcK3F37Dv1AyGcK5GmlRd8OfcMKAw4/CnMO/w6sdcMKpw7goMsOQNMMpwo5kWsK7wpYRw4DDlyJ6YMOdw5MMFjvDm1BaCMKjwrPChSTCuxAyw4N4w44YK8KZWcKVwrHDn8OQKcKPMsO3PMKwR0BBwpvCksO2w4o+PF9Xw4lfRsKcwqbCrkXDhnzCgF3Cm2HCtMOpTUokWXjDiC3CiC3DoXHCpcOLMsKRJHQuw5rDqgDCrXvCrw==';
const CAP_PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';
const capCipher = pe.realBytesFromB64(CAP_DATA.slice(32));
const capKs = pe.xor(Buffer.from(CAP_PLAIN, 'utf8'), capCipher);
const localKs = pe.getKs({});
let same = 0;
for (let i = 0; i < Math.min(124, capKs.length); i++) if (capKs[i] === localKs[i]) same++;
pairs.push({
  id: 'captured-browser-87',
  source: 'real browser capture (artifacts/ 既有样本)',
  note: '对端 UA 分支与本机不同：ks 前 29 字节一致，之后分叉；密文 125B vs 明文 124B（多 1 字节，落在末尾一侧）',
  plain: CAP_PLAIN,
  plainLen: Buffer.byteLength(CAP_PLAIN),
  hex: CAP_DATA.slice(0, 32),
  hexMatchesMd5: CAP_DATA.slice(0, 32) === pe.md5(CAP_PLAIN),
  data: CAP_DATA,
  dataLen: CAP_DATA.length,
  cipherHex: capCipher.toString('hex'),
  cipherLen: capCipher.length,
  keystreamHeadHex: capKs.subarray(0, 16).toString('hex'),
  ksAgreesWithLocal: same + '/124',
});
console.log(`[captured] cipherLen=${capCipher.length} plainLen=${Buffer.byteLength(CAP_PLAIN)} ks 与本机一致 ${same}/124`);

const out = { generatedAt: new Date().toISOString(), count: pairs.length, pairs };
fs.writeFileSync(path.join(ROOT, 'artifacts/envelope_pairs.json'), JSON.stringify(out, null, 1));
console.log('\nwritten artifacts/envelope_pairs.json', pairs.length, 'pairs');
pe.closeSession();
process.exit(0);
