// 检验 keystream 是否来自 AES-CTR/ECB 计数器（对 base64 文本等长加密）
const fs = require('fs');
const crypto = require('crypto');

const S = JSON.parse(fs.readFileSync('config/btoa_capture.json', 'utf8'));
const deflate = Buffer.from(S[1].b64, 'base64');
const data = Buffer.from(S[2].b64, 'base64');
const enc = data.slice(3);
const b64text = Buffer.from(deflate.toString('base64'), 'latin1').slice(3, 3 + enc.length);
const ks = Buffer.alloc(enc.length);
for (let i = 0; i < enc.length; i++) ks[i] = enc[i] ^ b64text[i];
console.log('ks head:', ks.slice(0, 32).toString('hex'));

const keys = {
  dyn: Buffer.from('1d23483593c11f7e', 'ascii'),
  REQ: Buffer.from('45f8ac1e1de14397', 'ascii'),
  RES: Buffer.from('87f879f135f27da7', 'ascii'),
  FLAG: Buffer.from('c175a358550d02e2', 'ascii'),
  UPLOAD: Buffer.from('a549a55c60a39aa0', 'ascii'),
  PREID: Buffer.from('75ae5c150d235802', 'ascii'),
  ACCESS: Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
};
const nonces = {
  zero: Buffer.alloc(16),
  iv012: Buffer.from('0123456789ABCDEF', 'ascii'),
  dyn: Buffer.from('1d23483593c11f7e', 'ascii'),
};
let hit = false;
for (const [kn, k] of Object.entries(keys)) {
  for (const [nn, nonce] of Object.entries(nonces)) {
    // ECB 计数器：counter||nonce 或 nonce 本身
    for (const [label, block] of [['nonce', nonce], ['zero', Buffer.alloc(16)]]) {
      try {
        const c = crypto.createCipheriv('aes-128-ecb', k, null);
        c.setAutoPadding(false);
        const blk = Buffer.concat([c.update(block), c.final()]);
        if (blk.equals(ks.slice(0, 16))) { console.log(`HIT ECB block: key=${kn} block=${label}`); hit = true; }
      } catch (e) { }
    }
    // CTR：enc = CTR(deflate)? 直接对 deflate 做 CTR 应得到 449 长度，不匹配，跳过
  }
}
// 另一假设：ks 是 MD5(key||counter) 的重复
for (const [kn, k] of Object.entries(keys)) {
  for (let ctr = 0; ctr < 64; ctr++) {
    const cand = crypto.createHash('md5').update(Buffer.concat([k, Buffer.from([ctr])])).digest();
    if (cand.equals(ks.slice(0, 16))) { console.log(`HIT md5 block: key=${kn} ctr=${ctr}`); hit = true; }
  }
}
// 检查 ks 是否与 enc 或 b64text 有比例关系（简单替换 + 位置偏移）
const diff = new Map();
for (let i = 0; i < enc.length; i++) {
  const d = (enc[i] - b64text[i] + 256) & 0xff;
  diff.set(d, (diff.get(d) || 0) + 1);
}
const top = [...diff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('差值分布 top5:', top, '种类:', diff.size);
console.log(hit ? '命中' : '未命中（keystream 非简单计数器/CTR 派生）');
