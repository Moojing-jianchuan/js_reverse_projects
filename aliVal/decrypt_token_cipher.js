// 解密 deviceToken 密文，分析 len 语义
const fs = require('fs');
const crypto = require('crypto');
const token = fs.readFileSync('config/token_verify.txt', 'utf8').trim();
const inner = Buffer.from(token, 'base64').toString('utf8');
const seg = inner.split('#');
const cipher = Buffer.from(seg[2], 'base64');
console.log('cipher bytes:', cipher.length, 'mod16:', cipher.length % 16, 'len段:', seg[3]);
const key = Buffer.from('1d23483593c11f7e', 'ascii');
const iv = Buffer.from('0123456789ABCDEF', 'ascii');
for (const off of [0, 1, 2]) {
  const body = cipher.slice(off);
  if (body.length % 16 !== 0) { console.log('off', off, 'not aligned', body.length); continue; }
  for (const pad of [true, false]) {
    try {
      const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
      d.setAutoPadding(pad);
      const out = Buffer.concat([d.update(body), d.final()]).toString('utf8');
      const pr = (out.match(/[\x20-\x7e]/g) || []).length / out.length;
      console.log(`off=${off} pad=${pad} len=${out.length} printable=${pr.toFixed(2)}`);
      if (pr > 0.9) {
        fs.writeFileSync('config/token_plain_dec.txt', out);
        console.log('head:', JSON.stringify(out.slice(0, 200)));
        console.log('tail:', JSON.stringify(out.slice(-200)));
        const parts = out.split('#');
        console.log('段数:', parts.length, ' 长度序列:', parts.map(s => s.length).join(','));
        console.log('len段值:', seg[3], '明文长度:', out.length, 'utf8bytes:', Buffer.byteLength(out));
        const cands = {
          'MD5(base#salt) 长度无关': 0,
        };
        console.log('1190 - 明文长度 =', Number(seg[3]) - out.length);
      }
    } catch (e) { console.log(`off=${off} pad=${pad} err`, e.message.slice(0, 60)); }
  }
}
