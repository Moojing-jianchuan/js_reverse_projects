// data 1.5.4：非分组模式尝试（CTR/CFB/OFB）
const crypto = require('crypto');
const fs = require('fs');

const raw = Buffer.from(fs.readFileSync('config/data_sample.txt', 'utf8').trim(), 'base64');
const keys = {
  'field0': Buffer.from('1d23483593c11f7e', 'ascii'),
  'REQ': Buffer.from('45f8ac1e1de14397', 'ascii'),
  'RES': Buffer.from('87f879f135f27da7', 'ascii'),
  'FLAG': Buffer.from('c175a358550d02e2', 'ascii'),
  'UPLOAD': Buffer.from('a549a55c60a39aa0', 'ascii'),
  'PREID': Buffer.from('75ae5c150d235802', 'ascii'),
  'ACCESS': Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
  'dev-umid': Buffer.from('3419ad18254a414a', 'ascii'),
};
const ivs = {
  iv012: Buffer.from('0123456789ABCDEF', 'ascii'),
  field0: Buffer.from('1d23483593c11f7e', 'ascii'),
  zero: Buffer.alloc(16),
  ctxtHead: raw.slice(3, 19),
};
const modes = ['aes-128-ctr', 'aes-128-cfb', 'aes-128-ofb', 'aes-128-cfb8', 'aes-128-cfb1'];
const jsony = (s) => { const t = s.replace(/[^\x20-\x7e]/g, ' '); return /"(mousemove|mouseclick|pointerEvent|startTime|clientType|timestamp)"/.test(t); };
let found = 0;
for (let off = 0; off <= 24; off++) {
  const body = raw.slice(off);
  for (const [kn, k] of Object.entries(keys)) {
    for (const [vn, iv] of Object.entries(ivs)) {
      for (const m of modes) {
        try {
          const d = crypto.createDecipheriv(m, k, iv);
          const out = Buffer.concat([d.update(body), d.final()]).toString('utf8');
          if (jsony(out) || /[\x20-\x7e]{1,}/.test(out) && (out.match(/[\x20-\x7e]/g) || []).length / out.length > 0.92) {
            const pr = (out.match(/[\x20-\x7e]/g) || []).length / out.length;
            console.log(`HIT off=${off} key=${kn} iv=${vn} mode=${m} printable=${pr.toFixed(2)} :: ${JSON.stringify(out.slice(0, 260))}`);
            found++;
          }
        } catch (e) { }
      }
    }
  }
}
console.log('found:', found);
