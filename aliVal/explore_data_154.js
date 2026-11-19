// 探索 data（1.5.4）结构：偏移 + 多种 key 组合
const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const raw = Buffer.from(fs.readFileSync('config/data_sample.txt', 'utf8').trim(), 'base64');
console.log('total bytes:', raw.length);
console.log('head hex:', raw.slice(0, 48).toString('hex'));
console.log('tail hex:', raw.slice(-16).toString('hex'));

const keys = {
  'field0-ascii': Buffer.from('1d23483593c11f7e', 'ascii'),
  'field0-hexbytes': Buffer.from('1d23483593c11f7e', 'hex'),
  'REQ': Buffer.from('45f8ac1e1de14397', 'ascii'),
  'RES': Buffer.from('87f879f135f27da7', 'ascii'),
  'FLAG': Buffer.from('c175a358550d02e2', 'ascii'),
  'ACCESS_SEC': Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
  'md5(field0)': crypto.createHash('md5').update('1d23483593c11f7e').digest(),
  'md5(field0)hex16': Buffer.from(crypto.createHash('md5').update('1d23483593c11f7e').digest('hex').slice(0, 16), 'ascii'),
};
const ivs = { zero: Buffer.alloc(16), iv012: Buffer.from('0123456789ABCDEF', 'ascii'), field0: Buffer.from('1d23483593c11f7e', 'ascii') };

let hits = 0;
for (const [kn, k] of Object.entries(keys)) {
  if (k.length !== 16) continue;
  for (const [vn, iv] of Object.entries(ivs)) {
    for (let off = 0; off <= 40; off++) {
      const body = raw.slice(off);
      if (body.length % 16 !== 0) continue;
      try {
        const d = crypto.createDecipheriv('aes-128-cbc', k, iv);
        d.setAutoPadding(false);
        const out = Buffer.concat([d.update(body), d.final()]);
        const txt = out.toString('utf8');
        const printable = (txt.match(/[\x20-\x7e]/g) || []).length / txt.length;
        if (printable > 0.85) {
          console.log(`[CBC-nopad] key=${kn} iv=${vn} off=${off} printable=${printable.toFixed(2)} head=${JSON.stringify(txt.slice(0, 100))}`);
          hits++;
        }
      } catch (e) { }
      try {
        const d = crypto.createDecipheriv('aes-128-cbc', k, iv);
        d.setAutoPadding(true);
        const out = Buffer.concat([d.update(body), d.final()]);
        const txt = out.toString('utf8');
        const printable = (txt.match(/[\x20-\x7e]/g) || []).length / txt.length;
        if (printable > 0.85) {
          console.log(`[CBC-pad] key=${kn} iv=${vn} off=${off} printable=${printable.toFixed(2)} head=${JSON.stringify(txt.slice(0, 140))}`);
          hits++;
        }
      } catch (e) { }
    }
  }
}
console.log('hits:', hits);
// zlib 检查
for (let off = 0; off < 24; off++) {
  try { const out = zlib.inflateSync(raw.slice(off)); console.log('inflate ok off=' + off, out.length, JSON.stringify(out.toString('utf8').slice(0, 120))); } catch (e) { }
}
