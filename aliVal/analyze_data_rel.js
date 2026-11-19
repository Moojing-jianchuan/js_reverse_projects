// data(600B) 与 deflate(449B) 的关系分析
const fs = require('fs');
const zlib = require('zlib');
const items = JSON.parse(fs.readFileSync('config/btoa_capture.json', 'utf8'));
const data = Buffer.from(items[2].b64, 'base64');
const comp = Buffer.from(items[1].b64, 'base64');
const json = zlib.inflateSync(comp);
console.log('data', data.length, 'comp', comp.length, 'json', json.length);
console.log('json head:', JSON.stringify(json.slice(0, 40).toString('latin1')));
console.log('json tail:', JSON.stringify(json.slice(-60).toString('latin1')));
const body = data.slice(3);
console.log('body len', body.length, 'mod16', body.length % 16);
console.log('data hex[0..64]:', data.slice(0, 64).toString('hex'));
console.log('comp hex[0..64]:', comp.slice(0, 64).toString('hex'));

// 是否 body 包含 deflate 片段
for (const n of [4, 6, 8, 16]) {
  const idx = body.indexOf(comp.slice(0, n));
  if (idx >= 0) console.log(`body 包含 comp 前 ${n} 字节 @${idx}`);
}

// XOR 分析：body 与 comp 对比（长度不同，比较重叠部分）
const minLen = Math.min(body.length, comp.length);
const x = Buffer.alloc(minLen);
for (let i = 0; i < minLen; i++) x[i] = body[i] ^ comp[i];
const ent = (buf) => { const h = new Array(256).fill(0); for (const b of buf) h[b]++; let e = 0; for (const c of h) if (c) { const p = c / buf.length; e -= p * Math.log2(p); } return e; };
console.log('XOR(body,comp) 熵:', ent(x).toFixed(2), 'head:', x.slice(0, 32).toString('hex'));
// 找周期
const periods = [];
for (let p = 2; p < 64; p++) {
  let same = 0;
  for (let i = 0; i + p < x.length; i++) if (x[i] === x[i + p]) same++;
  periods.push({ p, rate: +(same / (x.length - p)).toFixed(3) });
}
periods.sort((a, b) => b.rate - a.rate);
console.log('XOR 周期性 top:', periods.slice(0, 6));

// 自相关：body 内部重复
const per2 = [];
for (let p = 1; p < 200; p++) { let same = 0; for (let i = 0; i + p < body.length; i++) if (body[i] === body[i + p]) same++; per2.push({ p, rate: +(same / (body.length - p)).toFixed(3) }); }
per2.sort((a, b) => b.rate - a.rate);
console.log('body 自相关 top:', per2.slice(0, 6));

// 尝试：body[5:] 作为 AES-CBC 密文，用 comp 的 md5/各种 key 尝试解密
const crypto = require('crypto');
const keyCands = {
  field0: Buffer.from('1d23483593c11f7e', 'ascii'),
  REQ: Buffer.from('45f8ac1e1de14397', 'ascii'),
  RES: Buffer.from('87f879f135f27da7', 'ascii'),
  FLAG: Buffer.from('c175a358550d02e2', 'ascii'),
  UPLOAD: Buffer.from('a549a55c60a39aa0', 'ascii'),
  PREID: Buffer.from('75ae5c150d235802', 'ascii'),
  ACCESS: Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
  'md5(field0)hex16': Buffer.from(crypto.createHash('md5').update('1d23483593c11f7e').digest('hex').slice(0, 16), 'ascii'),
};
const ivCands = { iv012: Buffer.from('0123456789ABCDEF', 'ascii'), zero: Buffer.alloc(16), field0: Buffer.from('1d23483593c11f7e', 'ascii') };
for (const [off, label] of [[0, 'body[0:]'], [5, 'body[5:]']]) {
  const b = body.slice(off);
  if (b.length % 16 !== 0) continue;
  for (const [kn, k] of Object.entries(keyCands)) {
    for (const [vn, iv] of Object.entries(ivCands)) {
      for (const pad of [true, false]) {
        try {
          const d = crypto.createDecipheriv('aes-128-cbc', k, iv);
          d.setAutoPadding(pad);
          const out = Buffer.concat([d.update(b), d.final()]);
          const s = out.toString('latin1');
          const hitZ = out[0] === 0x78 && (out[1] === 0x9c || out[1] === 0x01 || out[1] === 0xda);
          const pr = (s.match(/[\x20-\x7e]/g) || []).length / s.length;
          if (hitZ || pr > 0.9) console.log(`[${label}] key=${kn} iv=${vn} pad=${pad} zlibHead=${hitZ} printable=${pr.toFixed(2)} head=${JSON.stringify(s.slice(0, 60))}`);
        } catch (e) { }
      }
    }
  }
}
