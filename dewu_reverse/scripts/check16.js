/**
 * 离线试验：keystream 与 sk/adi/shumeiid 的关系；sk 是否是压缩/加密的会话密钥。
 */
'use strict';
const crypto = require('crypto');
const zlib = require('zlib');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

const SK_HEADER = 'YOUR_SK_HERE';
const ADI = 'f7g-Hfi3gp2C6Q8zlIuj7gw5x6wr95XALDnANDYMKYwrQ7w5DDksKGwobCgMKVE8OYw6TDhShlSnzDnAjDrHB3SMKRbMKmwpgew4DCtWHCo8K7wppENMOTw4TCgw==';
const LTK = 'AMOMwprDtMOmJsKiw6zDscKuIMOVwrPCoMOGfMOmwpbCkMKnNjjDl3rDksOiL8K8LA3Cv3TDminDg8ODw54fcsKeQWzDnMKGw5TDvsO6w7zDn8K5';
const SHUMEI = 'YOUR_SHUMEIID_HERE';
const KS = Buffer.from('91720f5562388428ae908038bbe70a98fe7e2cc9f4c49eb9c8e802e54871bdf57c6341e38d0e3e1734ed81d18d937c402843e44aa8b6cb3c493e667baefa8db23529a9a4bed98eac87592856fc5c41bb7fd9f574146e022ae04a78f8e10faf2104c48ef1d7a5de315e13b5ce7a6d1f3e53b700f1ff9f89', 'hex');

function b64both(s) {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm + '='.repeat((4 - norm.length % 4) % 4);
  return Buffer.from(pad, 'base64');
}
function mojibake(buf) {
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}
function tryInflate(buf, label) {
  for (const [name, fn] of [['inflateSync', zlib.inflateSync], ['inflateRawSync', zlib.inflateRawSync], ['gunzipSync', zlib.gunzipSync], ['brotli', zlib.brotliDecompressSync]]) {
    try {
      const out = fn(buf);
      console.log('   ', label, name, 'OK ->', out.length, 'bytes:', JSON.stringify(out.toString('latin1').slice(0, 80)));
      return out;
    } catch (e) { }
  }
  return null;
}

console.log('=== sk header ===', SK_HEADER.length, 'chars');
const skRaw = b64both(SK_HEADER);
console.log('  b64 ->', skRaw.length, 'bytes, hex head', skRaw.slice(0, 16).toString('hex'));
const skMoj = mojibake(skRaw);
console.log('  mojibake ->', skMoj.length, 'bytes, hex head', skMoj.slice(0, 16).toString('hex'));
tryInflate(skRaw, 'skRaw');
tryInflate(skMoj, 'skMoj');

console.log('\n=== adi ===');
const adiRaw = b64both(ADI);
const adiMoj = mojibake(adiRaw);
console.log('  raw', adiRaw.length, 'hex', adiRaw.slice(0, 24).toString('hex'));
console.log('  moj', adiMoj.length, 'hex', adiMoj.slice(0, 24).toString('hex'), JSON.stringify(adiMoj.toString('latin1').slice(0, 60)));
tryInflate(adiRaw, 'adiRaw'); tryInflate(adiMoj, 'adiMoj');

console.log('\n=== ltk ===');
const ltkRaw = b64both(LTK);
const ltkMoj = mojibake(ltkRaw);
console.log('  raw', ltkRaw.length, 'hex', ltkRaw.slice(0, 24).toString('hex'));
console.log('  moj', ltkMoj.length, JSON.stringify(ltkMoj.toString('latin1').slice(0, 80)));
tryInflate(ltkRaw, 'ltkRaw'); tryInflate(ltkMoj, 'ltkMoj');

console.log('\n=== keystream 溯源 ===');
const ksHex = KS.toString('hex');
const cands = {
  'md5(sk)': md5(Buffer.from(SK_HEADER)),
  'md5(sk b64decoded)': md5(skRaw),
  'md5(shumeiid)': md5(Buffer.from(SHUMEI)),
  'md5(sk+shumeiid)': md5(Buffer.from(SK_HEADER + SHUMEI)),
  'md5(ltkMoj)': md5(ltkMoj),
  'md5(adiMoj)': md5(adiMoj),
};
for (const [k, v] of Object.entries(cands)) console.log('  ', k, '=', v, v === ksHex.slice(0, 32) ? '<== KS PREFIX MATCH' : '');

// keystream 是否出现在任何解码产物里
const hay = [skRaw, skMoj, adiRaw, adiMoj, ltkMoj];
const names = ['skRaw', 'skMoj', 'adiRaw', 'adiMoj', 'ltkMoj'];
const needle = KS.slice(0, 8);
hay.forEach((h, i) => {
  const idx = h.indexOf(needle);
  console.log('  keystream[0:8] in', names[i], '?', idx);
});

// keystream 是否有结构：看它是不是 md5 链 / 重复块
console.log('\n  keystream[0:32] =', ksHex.slice(0, 32));
console.log('  16字节分块唯一性:', new Set(ksHex.match(/.{32}/g)).size, '块, 总', Math.ceil(ksHex.length / 32));
