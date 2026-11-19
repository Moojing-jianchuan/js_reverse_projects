// data 1.5.4：自定义 base64 字母表解码 + AES 尝试
const crypto = require('crypto');
const fs = require('fs');

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';
const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function decodeWith(alphabet, str) {
  const map = {}; for (let i = 0; i < alphabet.length; i++) map[alphabet[i]] = i;
  const out = [];
  let buf = 0, bits = 0;
  for (const ch of str) {
    if (ch === '=') break;
    const v = map[ch];
    if (v === undefined) return null;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return Buffer.from(out);
}

const dataStr = fs.readFileSync('config/data_sample.txt', 'utf8').trim();
console.log('data str len:', dataStr.length, 'charset ok:', /^[A-Za-z0-9+/=]+$/.test(dataStr));
const stdDec = Buffer.from(dataStr, 'base64');
const cusDec = decodeWith(ALPHA, dataStr);
console.log('std bytes:', stdDec.length, stdDec.slice(0, 12).toString('hex'));
console.log('custom bytes:', cusDec ? cusDec.length : 'n/a', cusDec ? cusDec.slice(0, 12).toString('hex') : '');
if (cusDec) {
  const ent = (buf) => { const h = new Array(256).fill(0); for (const b of buf) h[b]++; let e = 0; for (const c of h) if (c) { const p = c / buf.length; e -= p * Math.log2(p); } return e.toFixed(2); };
  console.log('entropy std:', ent(stdDec), 'custom:', ent(cusDec));
}

const keys = {
  'field0-ascii': Buffer.from('1d23483593c11f7e', 'ascii'),
  'REQ': Buffer.from('45f8ac1e1de14397', 'ascii'),
  'RES': Buffer.from('87f879f135f27da7', 'ascii'),
  'FLAG': Buffer.from('c175a358550d02e2', 'ascii'),
  'ACCESS': Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
  'UPLOAD': Buffer.from('a549a55c60a39aa0', 'ascii'),
  'PREID': Buffer.from('75ae5c150d235802', 'ascii'),
};
const iv0 = Buffer.from('0123456789ABCDEF', 'ascii');

function tryDecrypt(label, buf, off) {
  const body = buf.slice(off);
  if (body.length % 16 !== 0) return;
  for (const [kn, k] of Object.entries(keys)) {
    for (const [vn, iv] of [['iv012', iv0], ['zero', Buffer.alloc(16)]]) {
      try {
        const d = crypto.createDecipheriv('aes-128-cbc', k, iv);
        const out = Buffer.concat([d.update(body), d.final()]);
        const txt = out.toString('utf8');
        const pr = (txt.match(/[\x20-\x7e]/g) || []).length / txt.length;
        if (pr > 0.9) console.log(`[${label}] off=${off} key=${kn} iv=${vn} printable=${pr.toFixed(3)} :: ${JSON.stringify(txt.slice(0, 200))}`);
      } catch (e) { }
    }
  }
}
for (const [label, buf] of [['std', stdDec], ['custom', cusDec]]) {
  if (!buf) continue;
  for (let off = 0; off <= 16; off++) tryDecrypt(label, buf, off);
}
console.log('done');
