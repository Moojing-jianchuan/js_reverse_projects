// 用同轮样本算 keystream：enc = data[3:] ，T = deflate_b64
// 并检查 keystream 是否由 DeviceConfig 解出的 key 派生
const fs = require('fs');
const crypto = require('crypto');
const { aesDecrypt, KEYS } = require('./utils/crypto');

const d = JSON.parse(fs.readFileSync('config/cvp_capture.json', 'utf8'));
const enc = Buffer.from(d.cvp_blob, 'base64').slice(3);
const T = Buffer.from(d.deflate_b64, 'latin1');
const Tbody = T.slice(3);

console.log('enc len =', enc.length, '| T len =', T.length, '| T[3:] len =', Tbody.length,
            '| equal =', enc.length === Tbody.length);
console.log('magic =', [...Buffer.from(d.cvp_blob, 'base64').slice(0, 3)].map(x => x.toString(16)).join(' '));

const ks = Buffer.from(enc.map((b, i) => b ^ (Tbody[i] || 0)));
const ks7 = Buffer.from(enc.map((b, i) => (b & 0x7f) ^ (Tbody[i] || 0)));

function stats(buf, label) {
  const hist = new Array(256).fill(0);
  for (const b of buf) hist[b]++;
  const distinct = hist.filter(c => c > 0).length;
  const zeros = hist[0];
  console.log(`\n[${label}] len=${buf.length} distinct=${distinct} zeros=${zeros} (${(zeros / buf.length * 100).toFixed(2)}%)`);
  console.log('  head32 =', buf.slice(0, 32).toString('hex'));
  // 周期检测
  let best = { p: 0, rate: 1 };
  for (let p = 1; p <= Math.min(128, buf.length >> 1); p++) {
    let same = 0;
    for (let i = 0; i + p < buf.length; i++) if (buf[i] === buf[i + p]) same++;
    const rate = same / (buf.length - p);
    if (rate > best.rate) best = { p, rate };
  }
  console.log('  best period =', best.p, 'match rate =', (best.rate * 100).toFixed(2) + '%');
  return buf;
}

stats(ks, 'ks = enc ^ T[3:]');
stats(ks7, '(enc&0x7f) ^ T[3:]');

// 解 key
let key = null;
try {
  const plain = aesDecrypt(d.device_config, KEYS.RES_KEY, KEYS.AES_IV);
  const parts = plain.split('#');
  key = Buffer.from(parts[0], 'base64').toString('utf8');
  console.log('\n[DeviceConfig] parts =', parts.length, '| key =', JSON.stringify(key),
              '| version =', Buffer.from(parts[3] || '', 'base64').toString('utf8'));
} catch (e) {
  console.log('\n[DeviceConfig] decrypt failed:', e.message);
}

// 候选：key 派生流
function testStream(name, stream) {
  if (!stream || !stream.length) return;
  let same = 0;
  const n = Math.min(stream.length, ks7.length);
  for (let i = 0; i < n; i++) if (stream[i] === ks7[i]) same++;
  console.log(`  ${name}: n=${n} match=${(same / n * 100).toFixed(2)}%`);
}

if (key) {
  console.log('\n[candidates vs (enc&0x7f)^T[3:]]');
  const ku = Buffer.from(key, 'utf8');
  // RC4
  function rc4(keyBuf, len) {
    const S = [...Array(256).keys()];
    let j = 0;
    for (let i = 0; i < 256; i++) { j = (j + S[i] + keyBuf[i % keyBuf.length]) & 0xff; [S[i], S[j]] = [S[j], S[i]]; }
    const out = Buffer.alloc(len); let i = 0; j = 0;
    for (let k = 0; k < len; k++) { i = (i + 1) & 0xff; j = (j + S[i]) & 0xff; [S[i], S[j]] = [S[j], S[i]]; out[k] = S[(S[i] + S[j]) & 0xff]; }
    return out;
  }
  testStream('RC4(key)', rc4(ku, ks7.length));
  // MD5(key||i) 链
  let md5s = Buffer.alloc(0);
  for (let i = 0; md5s.length < ks7.length && i < 200; i++) md5s = Buffer.concat([md5s, crypto.createHash('md5').update(ku).update(Buffer.from([i])).digest()]);
  testStream('MD5(key||i)', md5s);
  let sha = Buffer.alloc(0);
  for (let i = 0; sha.length < ks7.length && i < 200; i++) sha = Buffer.concat([sha, crypto.createHash('sha256').update(ku).update(Buffer.from([i])).digest()]);
  testStream('SHA256(key||i)', sha);
  // AES-256-CTR(key padded, iv=zeros)
  try {
    const k32 = crypto.createHash('sha256').update(ku).digest();
    const c = crypto.createCipheriv('aes-256-ctr', k32, Buffer.alloc(16));
    testStream('AES256CTR(sha256(key), iv=0)', Buffer.concat([c.update(Buffer.alloc(ks7.length)), c.final()]));
  } catch (e) {}
  try {
    const c = crypto.createCipheriv('aes-128-ctr', Buffer.from(key, 'utf8'), Buffer.alloc(16));
    testStream('AES128CTR(key16, iv=0)', Buffer.concat([c.update(Buffer.alloc(ks7.length)), c.final()]));
  } catch (e) { console.log('  AES128CTR(key16) skipped:', e.message); }
}

// 与 T 的相关性：ks 是否与 T 无关（换位置后仍稳定无法验证，先看是否等于 T 的简单函数）
let sameAsT = 0;
for (let i = 0; i < ks7.length; i++) if (ks7[i] === Tbody[i]) sameAsT++;
console.log('\n[ks7 == T[3:]]', (sameAsT / ks7.length * 100).toFixed(2) + '%');
console.log('ks7 head32 =', ks7.slice(0, 32).toString('hex'));
