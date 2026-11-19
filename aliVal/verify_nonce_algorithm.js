// 用「明文前缀 32hex = nonce」+ 动态 key 复算 enc，验证算法
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const deflate = Buffer.from(fs.readFileSync('config/sample_deflate.b64', 'utf8').trim(), 'base64');
const data = Buffer.from(fs.readFileSync('config/sample_data.b64', 'utf8').trim(), 'base64');
const json = zlib.inflateSync(deflate).toString('utf8');
const nonceHex = json.slice(0, 32);
const nonce = Buffer.from(nonceHex, 'hex');
const enc = data.slice(3);
console.log('deflate', deflate.length, 'enc', enc.length, 'nonce', nonceHex);
console.log('enc head', enc.slice(0, 16).toString('hex'));

const keys = {
  dyn: Buffer.from('1d23483593c11f7e', 'ascii'),
  REQ: Buffer.from('45f8ac1e1de14397', 'ascii'),
  RES: Buffer.from('87f879f135f27da7', 'ascii'),
  FLAG: Buffer.from('c175a358550d02e2', 'ascii'),
  ACCESS: Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
};

const ivs = { nonce, iv012: Buffer.from('0123456789ABCDEF', 'ascii'), zero: Buffer.alloc(16) };

function cmp(label, buf) {
  if (buf.length === enc.length) {
    if (buf.equals(enc)) { console.log('*** EXACT MATCH ***', label); return true; }
    let same = 0; for (let i = 0; i < buf.length; i++) if (buf[i] === enc[i]) same++;
    if (same / buf.length > 0.3) console.log(`  near ${label} 一致率 ${(same / buf.length * 100).toFixed(1)}%`);
  }
  return false;
}

let hit = false;
for (const [kn, k] of Object.entries(keys)) {
  for (const [vn, iv] of Object.entries(ivs)) {
    // 1) 直接对 deflate 加密
    for (const [mn, fn] of [
      ['cbc', (b, k, iv) => { const c = crypto.createCipheriv('aes-128-cbc', k, iv); return Buffer.concat([c.update(b), c.final()]); }],
      ['ctr', (b, k, iv) => { const c = crypto.createCipheriv('aes-128-ctr', k, iv); return Buffer.concat([c.update(b), c.final()]); }],
      ['cfb', (b, k, iv) => { const c = crypto.createCipheriv('aes-128-cfb', k, iv); return Buffer.concat([c.update(b), c.final()]); }],
      ['ofb', (b, k, iv) => { const c = crypto.createCipheriv('aes-128-ofb', k, iv); return Buffer.concat([c.update(b), c.final()]); }],
    ]) {
      let out;
      try { out = fn(deflate, k, iv); } catch (e) { continue; }
      // a) 密文直接比
      if (out.length === enc.length && out.equals(enc)) { console.log(`*** MATCH raw ${mn} key=${kn} iv=${vn}`); hit = true; }
      // b) base64 后取 [3:] / [0:]
      const b64 = Buffer.from(out.toString('base64'), 'latin1');
      if (cmp(`${mn}+b64[3:] key=${kn} iv=${vn}`, b64.subarray(3))) hit = true;
      if (cmp(`${mn}+b64 key=${kn} iv=${vn}`, b64)) hit = true;
      // c) base64 无 padding 取 [3:]
      const b64n = Buffer.from(out.toString('base64').replace(/=+$/, ''), 'latin1');
      if (cmp(`${mn}+b64nopad[3:] key=${kn} iv=${vn}`, b64n.subarray(3))) hit = true;
    }
    // 2) 对 base64(deflate) 文本加密
    const txt = Buffer.from(deflate.toString('base64'), 'latin1');
    for (const [mn, fn] of [
      ['cbc-text', (b, k, iv) => { const c = crypto.createCipheriv('aes-128-cbc', k, iv); return Buffer.concat([c.update(b), c.final()]); }],
      ['ctr-text', (b, k, iv) => { const c = crypto.createCipheriv('aes-128-ctr', k, iv); return Buffer.concat([c.update(b), c.final()]); }],
      ['cfb-text', (b, k, iv) => { const c = crypto.createCipheriv('aes-128-cfb', k, iv); return Buffer.concat([c.update(b), c.final()]); }],
    ]) {
      let out; try { out = fn(txt, k, iv); } catch (e) { continue; }
      if (out.length === enc.length && out.equals(enc)) { console.log(`*** MATCH ${mn} key=${kn} iv=${vn}`); hit = true; }
      if (out.length >= 3 && out.subarray(3, 3 + enc.length).equals(enc)) { console.log(`*** MATCH ${mn}[3:] key=${kn} iv=${vn}`); hit = true; }
    }
  }
}
console.log(hit ? '\n命中' : '\n未命中：nonce 已知但算法/密钥组合仍未匹配');
// 输出 enc 前 16 字节与各 key 的 AES-CTR(nonce) 流对比，便于人工判断
for (const [kn, k] of Object.entries(keys)) {
  const c = crypto.createCipheriv('aes-128-ctr', k, nonce);
  const s = Buffer.concat([c.update(Buffer.alloc(16)), c.final()]);
  console.log(`  ctr(${kn}) head ${s.toString('hex')}`);
}
