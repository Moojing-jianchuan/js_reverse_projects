/**
 * probe_resp_crypto.js —— 密文格式 / 压缩假设 / 明文结构 / UA 分支
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const { createEnv } = require('../src/env_patch');

const respText = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8').trim();
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

function decrypt(ua) {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
  if (ua) {
    Object.defineProperty(w.navigator, 'userAgent', { get: () => ua, configurable: true });
    Object.defineProperty(w.navigator, 'appVersion', { get: () => ua.replace('Mozilla/', ''), configurable: true });
  }
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8'), 'preinforce2.js');
  const uaUsed = w.navigator.userAgent;
  let r;
  try { r = w.fun.Fun99(respText, '', '1', ''); } catch (e) { r = 'THROW:' + e.message; }
  env.dispose();
  return { r, uaUsed };
}

const FF = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const out = {};

for (const [label, ua] of [['default(env bundle UA)', null], ['firefox', FF]]) {
  const { r, uaUsed } = decrypt(ua);
  console.log('\n=== ' + label + ' ===');
  console.log('  UA  :', uaUsed);
  console.log('  type:', typeof r, 'len:', String(r).length);
  let parsed = null;
  try { parsed = JSON.parse(r); } catch (e) { console.log('  JSON.parse FAIL:', e.message); }
  if (parsed) {
    console.log('  JSON ok. code=', parsed.code, 'msg=', parsed.msg,
      '| data keys=', parsed.data ? Object.keys(parsed.data) : null);
    if (parsed.data && Array.isArray(parsed.data.list)) {
      console.log('  data.list length =', parsed.data.list.length);
      console.log('  第一件:', JSON.stringify(parsed.data.list[0]).slice(0, 300));
      console.log('  最后一件:', JSON.stringify(parsed.data.list[parsed.data.list.length - 1]).slice(0, 200));
    }
    console.log('  其它顶层字段:', Object.keys(parsed).join(','));
    out[label] = r;
  }
  console.log('  md5:', md5(String(r)));
}

// UA 分支对比只保留 firefox 的明文继续分析
const plain = out['firefox'];
if (!plain) { console.log('\n!! firefox 路线没有明文，停止'); process.exit(0); }

console.log('\n=== 密文字节恢复 ===');
const b64bytes = Buffer.from(respText, 'base64');
const asUtf8 = b64bytes.toString('utf8');
console.log('  base64 -> bytes          :', b64bytes.length);
console.log('  bytes -> utf8 含替换符   :', (asUtf8.match(/\uFFFD/g) || []).length, '(0 = 是合法 UTF-8，说明是 mojibake 信封)');
const cipher = Buffer.alloc(asUtf8.length);
for (let i = 0; i < asUtf8.length; i++) cipher[i] = asUtf8.charCodeAt(i) & 0xff;
const pbuf = Buffer.from(plain, 'utf8');
console.log('  cipher bytes             :', cipher.length);
console.log('  plain utf8 bytes         :', pbuf.length);

console.log('\n=== 压缩假设：deflate(plain) 与 cipher 长度 ===');
const variants = {
  'deflateSync(def)': zlib.deflateSync(pbuf),
  'deflateRawSync(def)': zlib.deflateRawSync(pbuf),
  'gzipSync(def)': zlib.gzipSync(pbuf),
  'deflateSync(lvl9)': zlib.deflateSync(pbuf, { level: 9 }),
  'deflateRawSync(lvl9)': zlib.deflateRawSync(pbuf, { level: 9 }),
  'brotli(q11)': zlib.brotliCompressSync(pbuf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }),
};
for (const [k, v] of Object.entries(variants)) {
  console.log('  ' + k.padEnd(22) + 'len=' + v.length + (v.length === cipher.length ? '   <<< 长度命中' : ''));
}

console.log('\n=== 若为 deflate 长度命中项：抽 keystream 看结构 ===');
for (const [k, v] of Object.entries(variants)) {
  if (v.length !== cipher.length) continue;
  const ks = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) ks[i] = cipher[i] ^ v[i];
  console.log('  [' + k + '] ks head64:', ks.slice(0, 64).toString('hex'));
  console.log('  ks 唯一字节数:', new Set(ks).size, '/', ks.length);
  const ascii = ks.toString('latin1');
  console.log('  ks 可打印比例:', (ascii.match(/[ -~]/g) || []).length / ks.length);
  fs.writeFileSync(path.join(ROOT, 'artifacts/resp_ks_from_' + k.replace(/[^\w]/g, '') + '.bin'), ks);
}

console.log('\n=== cipher 头 32 字节 hex / latin1 ===');
console.log('  hex   :', cipher.slice(0, 32).toString('hex'));
console.log('  latin1:', JSON.stringify(cipher.slice(0, 32).toString('latin1')));
console.log('  sks-length 头值 = 14740；plain utf8 bytes =', pbuf.length, '；plain chars =', plain.length);
