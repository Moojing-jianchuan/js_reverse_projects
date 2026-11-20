// 测试响应体是否也用同一 keystream(XOR) 加密
const fs = require('fs');

const raw = fs.readFileSync('D:/ds_work/js_reverse_projects/dewu_reverse/artifacts/resp_125.bin');
const text = raw.toString('utf8');
console.log('len text', text.length, 'head', JSON.stringify(text.slice(0, 80)));

// 响应可能是 base64 文本（= UTF-8 编码的 mojibake），先还原真实字节
function realBytesFromB64(b64) {
  const buf = Buffer.from(b64, 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

let body = text.trim();
let cipher = null;
if (/^[A-Za-z0-9+/=\r\n]+$/.test(body)) {
  cipher = realBytesFromB64(body);
  console.log('decoded cipher bytes', cipher.length);
}

const ks = Buffer.from('91720f5562388428ae908038bbe70a98fe7e2cc9f4c49eb9c8e802e54871bdf57c6341e38d0e3e1734ed81d18d937c402843e44aa8b6cb3c493e667baefa8db23529a9a4bed98eac87592856fc5c41bb7fd9f574146e022ae04a78f8e10faf2104c48ef1d7a5de315e13b5ce7a6d1f3e53b700f1ff9f89', 'hex');

if (cipher) {
  const out = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) out[i] = cipher[i] ^ ks[i % ks.length];
  console.log('xor(offset0):', JSON.stringify(out.toString('latin1').slice(0, 120)));
  // 试试从头扫描偏移
  let best = null;
  for (let off = 0; off < 64; off++) {
    const o2 = Buffer.alloc(64);
    for (let i = 0; i < 64; i++) o2[i] = cipher[i + off] ^ ks[i];
    const s = o2.toString('latin1');
    const score = (s.match(/[ -~]/g) || []).length;
    if (score > 55) console.log('offset', off, JSON.stringify(s));
  }
  console.log('cipher hex head:', cipher.slice(0, 48).toString('hex'));
  console.log('cipher latin1 head:', JSON.stringify(cipher.slice(0, 48).toString('latin1')));
}
