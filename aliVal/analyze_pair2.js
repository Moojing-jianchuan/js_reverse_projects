// 解压 T 拿 nonce，并检验 keystream 是否由 (key, nonce) 派生
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { aesDecrypt, KEYS } = require('./utils/crypto');

const d = JSON.parse(fs.readFileSync('config/cvp_capture.json', 'utf8'));
const dataRaw = Buffer.from(d.cvp_blob, 'base64');
const enc = dataRaw.slice(3);
const T = Buffer.from(d.deflate_b64, 'latin1');
const Tbody = T.slice(3);
const ks = Buffer.from(enc.map((b, i) => b ^ (Tbody[i] || 0)));

const plain = zlib.inflateSync(Buffer.from(d.deflate_b64, 'base64'));
const nonce = plain.slice(0, 32).toString('latin1');
console.log('plain len =', plain.length);
console.log('nonce     =', nonce, '| /^[0-9a-f]{32}$/', /^[0-9a-f]{32}$/.test(nonce));
console.log('json head =', plain.slice(32, 120).toString('utf8'));

let key = null;
try {
  const parts = aesDecrypt(d.device_config, KEYS.RES_KEY, KEYS.AES_IV).split('#');
  key = Buffer.from(parts[0], 'base64').toString('utf8');
} catch (e) { console.log('key err', e.message); }
console.log('key       =', JSON.stringify(key));

console.log('\nks   head64 =', ks.slice(0, 64).toString('hex'));
console.log('ks   ascii  =', JSON.stringify(ks.slice(0, 64).toString('latin1')));
console.log('Tbody ascii =', JSON.stringify(Tbody.slice(0, 64).toString('latin1')));
console.log('nonce ascii =', JSON.stringify(nonce));

// ks 里是否直接包含 nonce / key 的字符？
const ksStr = ks.toString('latin1');
console.log('\nks contains nonce?', ksStr.includes(nonce));
console.log('ks contains key?  ', key ? ksStr.includes(key) : null);

// 统计 ks 的 ASCII 比例与分布
const ascii = [...ks].filter(b => b >= 0x20 && b < 0x7f).length;
console.log('ks ASCII printable =', (ascii / ks.length * 100).toFixed(1) + '%',
            '| >=0x80 =', ([...ks].filter(b => b >= 0x80).length / ks.length * 100).toFixed(1) + '%');

// 候选流测试
function test(name, stream) {
  if (!stream || !stream.length) return;
  const n = Math.min(stream.length, ks.length);
  let same = 0, same7 = 0;
  for (let i = 0; i < n; i++) {
    if (stream[i] === ks[i]) same++;
    if (stream[i] === (ks[i] & 0x7f)) same7++;
  }
  console.log(`  ${name.padEnd(34)} n=${n} raw=${(same / n * 100).toFixed(1)}% &0x7f=${(same7 / n * 100).toFixed(1)}%`);
}

function rc4(keyBuf, len) {
  const S = [...Array(256).keys()];
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + S[i] + keyBuf[i % keyBuf.length]) & 0xff; const t = S[i]; S[i] = S[j]; S[j] = t; }
  const out = Buffer.alloc(len); let i = 0; j = 0;
  for (let k = 0; k < len; k++) { i = (i + 1) & 0xff; j = (j + S[i]) & 0xff; const t = S[i]; S[i] = S[j]; S[j] = t; out[k] = S[(S[i] + S[j]) & 0xff]; }
  return out;
}

if (key) {
  const ku = Buffer.from(key, 'utf8');
  const nu = Buffer.from(nonce, 'utf8');
  console.log('\n[candidates]');
  test('RC4(key)', rc4(ku, ks.length));
  test('RC4(nonce)', rc4(nu, ks.length));
  test('RC4(key||nonce)', rc4(Buffer.concat([ku, nu]), ks.length));
  test('RC4(nonce||key)', rc4(Buffer.concat([nu, ku]), ks.length));
  let m = Buffer.alloc(0), s = Buffer.alloc(0);
  for (let i = 0; m.length < ks.length && i < 300; i++) {
    m = Buffer.concat([m, crypto.createHash('md5').update(ku).update(nu).update(Buffer.from([i & 0xff, (i >> 8) & 0xff])).digest()]);
    s = Buffer.concat([s, crypto.createHash('sha256').update(ku).update(nu).update(Buffer.from([i & 0xff])).digest()]);
  }
  test('MD5(key||nonce||i16)', m);
  test('SHA256(key||nonce||i8)', s);
  for (const [nm, kk] of [['aes-128-ctr key', Buffer.from(key, 'utf8')], ['aes-256-ctr sha256(key)', crypto.createHash('sha256').update(ku).digest()]]) {
    for (const [ivn, iv] of [['iv0', Buffer.alloc(16)], ['ivNonceHex', Buffer.from(nonce, 'hex')], ['ivKey', Buffer.from((key + '0'.repeat(16)).slice(0, 16), 'utf8')]]) {
      try {
        const c = crypto.createCipheriv(nm.startsWith('aes-128') ? 'aes-128-ctr' : 'aes-256-ctr', kk, iv);
        test(`${nm}/${ivn}`, Buffer.concat([c.update(Buffer.alloc(ks.length)), c.final()]));
      } catch (e) { }
    }
  }
}

// ks 与 T 的逐位关系：enc = T ^ ks 反推 —— 若暗层是"逐 4 字符→3 字节"，先看分组
console.log('\n[group check] enc/ks by 4-byte groups (first 8)');
for (let g = 0; g < 8; g++) {
  const e = enc.slice(g * 4, g * 4 + 4), k = ks.slice(g * 4, g * 4 + 4), t = Tbody.slice(g * 4, g * 4 + 4);
  console.log('  g' + g, 'T=' + t.toString('hex'), 'ks=' + k.toString('hex'), 'enc=' + e.toString('hex'));
}
