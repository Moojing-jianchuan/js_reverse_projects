// 强候选：明文 JSON 开头 32 hex 就是 nonce
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const cases = [
  { name: 'A', deflate: 'config/sample_deflate.b64', data: 'config/sample_data.b64' },
];
const S = JSON.parse(fs.readFileSync('config/btoa_capture.json', 'utf8'));
const deflateA = Buffer.from(S[1].b64, 'base64');
const dataA = Buffer.from(S[2].b64, 'base64');

const samples = [
  { name: 'sample2(639)', deflate: deflateA.length === 639 ? deflateA : Buffer.from(fs.readFileSync('config/sample_deflate.b64', 'utf8').trim(), 'base64'), data: dataA.length === 852 ? dataA : Buffer.from(fs.readFileSync('config/sample_data.b64', 'utf8').trim(), 'base64') },
];

const keys = {
  dyn: Buffer.from('1d23483593c11f7e', 'ascii'),
  REQ: Buffer.from('45f8ac1e1de14397', 'ascii'),
  RES: Buffer.from('87f879f135f27da7', 'ascii'),
  FLAG: Buffer.from('c175a358550d02e2', 'ascii'),
  UPLOAD: Buffer.from('a549a55c60a39aa0', 'ascii'),
  PREID: Buffer.from('75ae5c150d235802', 'ascii'),
  ACCESS: Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
};

for (const s of samples) {
  const json = zlib.inflateSync(s.deflate).toString('utf8');
  const prefixHex = json.slice(0, 32);
  const nonce = Buffer.from(prefixHex, 'hex');
  console.log(`\n[${s.name}] deflate=${s.deflate.length} json=${json.length} 前缀=${prefixHex} (${nonce.length} 字节)`);
  const enc = s.data.slice(3);
  const b64text = Buffer.from(s.deflate.toString('base64'), 'latin1');
  console.log('enc', enc.length, 'b64', b64text.length);
  let found = false;
  for (const off of [0, 3]) {
    const ks = Buffer.alloc(enc.length);
    for (let i = 0; i < enc.length; i++) ks[i] = enc[i] ^ (b64text[i + off] || 0);
    for (const [kn, k] of Object.entries(keys)) {
      for (const ctrVariant of [0, 1, 3]) {
        const ctr = Buffer.alloc(16);
        nonce.copy(ctr, 0, 0, 8);        // 前 8 字节 nonce
        ctr.writeUInt32BE(ctrVariant, 12);
        try {
          const c = crypto.createCipheriv('aes-128-ctr', k, ctr);
          c.setAutoPadding(false);
          const stream = Buffer.concat([c.update(Buffer.alloc(32)), c.final()]);
          if (stream.subarray(0, 16).equals(ks.subarray(0, 16))) { console.log(`*** MATCH CTR *** off=${off} key=${kn} ctr=${ctrVariant}`); found = true; }
        } catch (e) { }
        // ECB(nonce) 作为第一块 keystream
        try {
          const c = crypto.createCipheriv('aes-128-ecb', k, null); c.setAutoPadding(false);
          const blk = Buffer.concat([c.update(nonce), c.final()]);
          if (blk.equals(ks.subarray(0, 16))) { console.log(`*** MATCH ECB(nonce) *** off=${off} key=${kn}`); found = true; }
        } catch (e) { }
      }
      // AES-CBC with iv=nonce，对 base64 文本加密，比对前 16 字节
      for (const off of [0, 3]) {
        try {
          const c = crypto.createCipheriv('aes-128-cbc', k, nonce); c.setAutoPadding(false);
          const blk = Buffer.concat([c.update(Buffer.from(b64text.slice(off, off + 16), 'latin1')), c.final()]);
          const ks = Buffer.alloc(enc.length);
          for (let i = 0; i < enc.length; i++) ks[i] = enc[i] ^ (b64text[i + off] || 0);
          if (blk.subarray(0, 16).equals(ks.subarray(0, 16))) { console.log(`*** MATCH CBC-over-text *** off=${off} key=${kn}`); found = true; }
        } catch (e) { }
      }
    }
  }
  if (!found) {
    // 打印 keystream 与 nonce 的关系样本，便于人工判断
    const ks0 = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) ks0[i] = enc[i] ^ b64text[i];
    console.log('ks[0:16] =', ks0.toString('hex'));
    console.log('nonce    =', nonce.toString('hex'));
  }
}
