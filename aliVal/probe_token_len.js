// 反推 deviceToken 的 len / md5 计算对象
const fs = require('fs');
const crypto = require('crypto');
const { aesDecrypt, KEYS } = require('./utils/crypto');

const raw = fs.readFileSync('config/device_token_live.txt', 'utf8').trim().replace(/^"|"$/g, '');
const dcB64 = fs.readFileSync('config/device_config_live.txt', 'utf8').trim().replace(/^"|"$/g, '');

const inner = Buffer.from(raw, 'base64').toString('utf8');
const seg = inner.split('#');
console.log('段数:', seg.length);
seg.forEach((s, i) => console.log(`  [${i}] len=${s.length} head=${s.slice(0, 40)}`));

const devicePlain = aesDecrypt(dcB64, KEYS.RES_KEY, KEYS.AES_IV);
const dp = devicePlain.split('#');
const dynKey = Buffer.from(dp[0], 'base64').toString('utf8');
console.log('\nDeviceConfig 明文段数:', dp.length);
dp.forEach((s, i) => console.log(`  dc[${i}] = ${JSON.stringify(Buffer.from(s, 'base64').toString('utf8').slice(0, 60))}`));
console.log('动态 key:', dynKey);

const cipherB64 = seg[2];
console.log('\nciphertext base64 len:', cipherB64.length, '-> bytes:', Buffer.from(cipherB64, 'base64').length);
// 试多种 key/iv 组合解密
const ivs = { derivedIV: '0123456789ABCDEF', hexAscii: 'd35db7e39ebbf3d001083105' };
const candidateKeys = [];
const addK = (label, k) => { candidates(label, k); };
function candidates(label, k) { candidateKeys.push([label, k]); }
candidates('dynKey(utf8 16)', dynKey);
candidates('dynKey(hex->bytes)', Buffer.from(dynKey, 'hex').toString('latin1'));
candidates('REQ', KEYS.RES_KEY);
Object.entries(ivs).forEach(([lk, lv]) => candidateKeys.forEach(([kk, kv]) => {}));
let hit = null;
for (const [lk, kv] of candidateKeys) {
  for (const [ivName, iv] of Object.entries(ivs)) {
    for (const mode of ['aes-128-cbc', 'aes-128-ecb']) {
      try {
        const buf = Buffer.from(cipherB64, 'base64');
        const d = mode === 'aes-128-ecb' ? crypto.createDecipheriv(mode, Buffer.from(kv, 'latin1').subarray(0, 16), null) : crypto.createDecipheriv(mode, Buffer.from(kv, 'latin1').subarray(0, 16), Buffer.from(iv, 'latin1'));
        d.setAutoPadding(true);
        const out = Buffer.concat([d.update(buf), d.final()]).toString('utf8');
        const printable = (out.match(/[\x20-\x7e]/g) || []).length / out.length;
        console.log(`OK ${mode} key=${lk} iv=${ivName} printable=${printable.toFixed(2)} head=${JSON.stringify(out.slice(0, 80))}`);
        if (printable > 0.95 && !hit) hit = { key: kv, iv, mode, out, keyLabel: lk, ivName };
      } catch (e) {
        // console.log(`fail ${mode} key=${lk} iv=${ivName}: ${e.message}`);
      }
    }
  }
}

if (hit) {
  const plaintext = hit.out;
  console.log('\n=== 命中解密: key=' + hit.keyLabel + ' iv=' + hit.ivName + ' mode=' + hit.mode + ' ===');
  console.log('明文长度:', plaintext.length, '(utf8 bytes:', Buffer.byteLength(plaintext) + ')');
  console.log('明文前 300:', JSON.stringify(plaintext.slice(0, 300)));
  console.log('段数:', plaintext.split('#').length, '->', plaintext.split('#').map(s => s.length).join(','));
  const wantLen = Number(seg[3]), wantMd5 = seg[4];
  const md5s = {
    'md5(plaintext utf8)': crypto.createHash('md5').update(plaintext, 'utf8').digest('hex'),
    'md5(plaintext latin1)': crypto.createHash('md5').update(Buffer.from(plaintext, 'utf8')).digest('hex'),
    'md5(cipher bytes)': crypto.createHash('md5').update(Buffer.from(cipherB64, 'base64')).digest('hex'),
    'md5(cipher b64)': crypto.createHash('md5').update(cipherB64, 'utf8').digest('hex'),
    'md5(inner b64)': crypto.createHash('md5').update(raw, 'utf8').digest('hex'),
    'md5("WEB#"+deviceId)': crypto.createHash('md5').update(seg[0] + '#' + seg[1], 'utf8').digest('hex'),
    'md5(seg0#seg1#cipher)': crypto.createHash('md5').update(seg.slice(0, 3).join('#'), 'utf8').digest('hex'),
  };
  console.log('\nlen 目标:', wantLen, '  明文长度:', plaintext.length, '  bytes:', Buffer.byteLength(plaintext));
  console.log('md5 目标:', wantMd5);
  for (const [k, v] of Object.entries(md5s)) console.log(' ', v === wantMd5 ? 'MATCH' : '     ', k, v);
} else {
  console.log('\n没有候选 key 解出可读明文');
}
