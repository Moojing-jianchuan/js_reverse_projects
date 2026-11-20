// 用 145(会话2) 的密文与已知明文求 keystream，并与会话1(279/283) 的 keystream 对比
const crypto = require('crypto');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

function real(b64) {
  const buf = Buffer.from(b64, 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

const plain = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });
const p = Buffer.from(plain, 'latin1');
console.log('plainLen', p.length, 'md5(plain)', md5(p));

const b145 = 'w7oBQMO0w6PCksKbwoEWRGtbw4rCp8KPHFzDrmNSVDTDtTd0w5zDusO2YBrDm8OzwqpAwqUxJcKUw4YTwp4/V8O5w5rDnMKvwobDv1PCvMKlI8OxesOrLcOjeBsxw63Dk05iw7wLVsKYUkw3ZT7ClwNVC8K6aMO5NsOzP1PCmk4qPsKUPRDDvMKZwo7Cmgc5wpnCrQZTw6LDm8Oiw6TCqhDDrcKXT8O3w7FOIsKJw4pbwpLCpAcZLHI=';
const c145 = real(b145);
console.log('cipher145 len', c145.length);
const ks145 = Buffer.alloc(p.length);
for (let i = 0; i < p.length; i++) ks145[i] = p[i] ^ c145[i];
console.log('ks(145)   :', ks145.toString('hex'));

const ks1 = Buffer.from('91720f5562388428ae908038bbe70a98fe7e2cc9f4c49eb9c8e802e54871bdf57c6341e38d0e3e1734ed81d18d937c402843e44aa8b6cb3c493e667baefa8db23529a9a4bed98eac87592856fc5c41bb7fd9f574146e022ae04a78f8e10faf2104c48ef1d7a5de315e13b5ce7a6d1f3e53b700f1ff9f89', 'hex');
console.log('ks(sess1) :', ks1.toString('hex'));
let same = 0;
for (let i = 0; i < ks1.length; i++) if (ks1[i] === ks145[i]) same++;
console.log('相同字节数', same, '/', ks1.length);
