// 从页面 btoa 捕获的三段数据离线分析
const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

function b64ToBuf(b64) { return Buffer.from(b64, 'base64'); }

function tryInflate(buf) {
  for (const fn of ['inflateSync', 'inflateRawSync', 'gunzipSync']) {
    try { const out = zlib[fn](buf); return { fn, out }; } catch (e) { }
  }
  return null;
}

function analyze(name, b64) {
  const buf = b64ToBuf(b64);
  console.log(`\n=== ${name} : ${buf.length} bytes, head=${buf.slice(0, 12).toString('hex')}`);
  const inf = tryInflate(buf);
  if (inf) {
    const txt = inf.out.toString('utf8');
    console.log(`  [inflate ${inf.fn}] -> ${inf.out.length} bytes, printable head:`);
    console.log('  ' + txt.slice(0, 1200));
    fs.writeFileSync(`config/${name}.inflated.txt`, txt);
    return { buf, inflated: inf.out, text: txt };
  }
  const pr = (buf.toString('latin1').match(/[\x20-\x7e]/g) || []).length / buf.length;
  console.log(`  not compressed, printable=${pr.toFixed(2)}`);
  return { buf };
}

const items = JSON.parse(fs.readFileSync('config/btoa_capture.json', 'utf8'));
const tok = analyze('tok', items[0].b64);
const comp = analyze('compressed', items[1].b64);
const data = analyze('data', items[2].b64);

if (comp && comp.inflated) {
  console.log('\n压缩数据字节数:', comp.inflated.length);
  console.log('data 长度:', data.buf.length, '= magic3 +', data.buf.length - 3);
}

// 用已知明文/压缩数据尝试各种加密
const keys = {
  field0: Buffer.from('1d23483593c11f7e', 'ascii'),
  REQ: Buffer.from('45f8ac1e1de14397', 'ascii'),
  RES: Buffer.from('87f879f135f27da7', 'ascii'),
  FLAG: Buffer.from('c175a358550d02e2', 'ascii'),
  UPLOAD: Buffer.from('a549a55c60a39aa0', 'ascii'),
  PREID: Buffer.from('75ae5c150d235802', 'ascii'),
  ACCESS: Buffer.from('FqJB6iRNVYdEGpwb', 'ascii'),
};
const ivs = { iv012: Buffer.from('0123456789ABCDEF', 'ascii'), field0: keys.field0, zero: Buffer.alloc(16) };
const body = data.buf.slice(3);
console.log('\n---- 结构探测 ----');
console.log('body len:', body.length, 'mod16:', body.length % 16);
for (const cut of [0, 1, 2, 3, 4, 5, 8, 16]) {
  const b = body.slice(cut);
  if (b.length % 16 === 0) console.log(`  body[${cut}:] len=${b.length} (16 对齐)`);
}
if (comp.inflated) {
  const plain = comp.inflated;
  console.log('压缩明文 len:', plain.length, 'AES-CBC 后应:', Math.ceil(plain.length / 16) * 16);
  for (const [kn, k] of Object.entries(keys)) {
    for (const [vn, iv] of Object.entries(ivs)) {
      for (const mode of ['aes-128-cbc', 'aes-128-ecb', 'aes-128-ctr', 'aes-128-cfb', 'aes-128-ofb']) {
        try {
          const c = mode === 'aes-128-ecb' ? crypto.createCipheriv(mode, k, null) : crypto.createCipheriv(mode, k, iv);
          const enc = Buffer.concat([c.update(plain), c.final()]);
          const idx = body.indexOf(enc.slice(0, 16));
          if (idx >= 0) console.log(`  MATCH 加密段: key=${kn} iv=${vn} mode=${mode} at body offset ${idx}, encLen=${enc.length}`);
          // 也试 enc 的前16字节出现在 body 任意位置 或 body 包含整个 enc
          if (body.indexOf(enc) >= 0) console.log(`  MATCH FULL: key=${kn} iv=${vn} mode=${mode} encLen=${enc.length}`);
        } catch (e) { }
      }
    }
  }
}
