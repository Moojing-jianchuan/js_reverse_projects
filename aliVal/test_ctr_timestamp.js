// 检验 keystream 是否 = AES-CTR(key, nonce=明文时间戳) 派生（命中即可离线造 data）
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const deflate = Buffer.from(fs.readFileSync('config/sample_deflate.b64', 'utf8').trim(), 'base64');
const data = Buffer.from(fs.readFileSync('config/sample_data.b64', 'utf8').trim(), 'base64');
const json = zlib.inflateSync(deflate).toString('utf8');
const obj = JSON.parse(json.slice(32));
const trackStart = obj.TrackStartTime, verifyTime = obj.VerifyTime, startTime = obj.TrackList.startTime;
console.log('TrackStartTime', trackStart, 'VerifyTime', verifyTime, 'startTime', startTime);

const enc = data.slice(3);
const b64text = Buffer.from(deflate.toString('base64'), 'latin1');
console.log('enc', enc.length, 'b64', b64text.length);

// 候选对齐：enc 对应 base64text 的偏移
function ksFor(off) {
  const ks = Buffer.alloc(enc.length);
  for (let i = 0; i < enc.length; i++) ks[i] = enc[i] ^ (b64text[i + off] || 0);
  return ks;
}

const keys = {
  dyn: Buffer.from('1d23483593c11f7e', 'ascii'),
  REQ: Buffer.from('45f8ac1e1de14397', 'ascii'),
  RES: Buffer.from('87f879f135f27da7', 'ascii'),
  FLAG: Buffer.from('c175a358550d02e2', 'ascii'),
  UPLOAD: Buffer.from('a549a55c60a39aa0', 'ascii'),
  PREID: Buffer.from('75ae5c150d235802', 'ascii'),
  ACCESS: Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
};
// nonce 候选（16 字节）
function nNonce(v) {
  const b = Buffer.alloc(16);
  const s = String(v);
  b.write(s.slice(0, 16), 0, 'ascii');
  return b;
}
function u64be(v) { const b = Buffer.alloc(16); b.writeUInt32BE(Math.floor(v / 4294967296), 4); b.writeUInt32BE(v >>> 0, 8); return b; }
function u64le(v) { const b = Buffer.alloc(16); b.writeUInt32LE(v >>> 0, 0); b.writeUInt32LE(Math.floor(v / 4294967296), 4); return b; }
function hexNonce(v) { const b = Buffer.alloc(16); Buffer.from(v.toString(16), 'hex').copy(b); return b; }

const nonces = {
  trackStart_ascii: nNonce(trackStart), verify_ascii: nNonce(verifyTime), start_ascii: nNonce(startTime),
  trackStart_u64be: u64be(trackStart), verify_u64be: u64be(verifyTime), start_u64be: u64be(startTime),
  trackStart_u64le: u64le(trackStart), trackStart_hex: hexNonce(trackStart),
  zero: Buffer.alloc(16), iv012: Buffer.from('0123456789ABCDEF', 'ascii'),
};

let found = false;
for (const off of [0, 3]) {
  const ks = ksFor(off);
  for (const [kn, k] of Object.entries(keys)) {
    for (const [nn, nonce] of Object.entries(nonces)) {
      for (const counterStart of [0, 1, 3]) {
        const ctr = Buffer.concat([nonce.subarray(0, 8), Buffer.alloc(8)]);
        ctr.writeUInt32BE(counterStart, 12);
        try {
          const c = crypto.createCipheriv('aes-128-ctr', k, ctr);
          c.setAutoPadding(false);
          const stream = Buffer.concat([c.update(Buffer.alloc(ks.length)), c.final()]);
          let same = 0;
          for (let i = 0; i < Math.min(16, ks.length); i++) if (stream[i] === ks[i]) same++;
          if (same >= 8) console.log(`HIT? off=${off} key=${kn} nonce=${nn} ctr=${counterStart} 前16一致 ${same}`);
          if (stream.subarray(0, 16).equals(ks.subarray(0, 16))) { console.log(`\n*** MATCH *** off=${off} key=${kn} nonce=${nn} counterStart=${counterStart}`); found = true; }
        } catch (e) { }
      }
    }
  }
}
if (!found) console.log('未命中：keystream 不是「key+明文时间戳」的 AES-CTR');
// 也检查 ks 前 16 字节是否等于某个 hash
const hashes = {
  'md5(deflate)': crypto.createHash('md5').update(deflate).digest(),
  'md5(deflate)hex': Buffer.from(crypto.createHash('md5').update(deflate).digest('hex').slice(0, 32), 'ascii'),
  'sha256(deflate)[:16]': crypto.createHash('sha256').update(deflate).digest().subarray(0, 16),
};
const ks0 = ksFor(0);
for (const [n, h] of Object.entries(hashes)) if (h.subarray(0, 16).equals(ks0.subarray(0, 16))) console.log('HIT hash:', n);
console.log('ks0 head', ks0.slice(0, 16).toString('hex'));
