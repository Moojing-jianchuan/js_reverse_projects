/**
 * probe_resp_zlib_hunt.js —— 找服务器用的 deflate 参数：
 * 目标：让 deflate(明文) 的字节数正好 = 密文字节数(7372)。命中后抽 keystream 看结构。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..');

const respText = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8').trim();
const plain = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/info_decrypted_sample.json'), 'utf8'));
const plainStr = fs.existsSync(path.join(ROOT, 'artifacts/info_decrypted_raw.txt'))
  ? fs.readFileSync(path.join(ROOT, 'artifacts/info_decrypted_raw.txt'), 'utf8')
  : null;

const cipher = (() => {
  const b = Buffer.from(respText, 'base64');
  const s = b.toString('utf8');
  const o = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
})();
console.log('cipher bytes =', cipher.length, '| cipher head hex =', cipher.slice(0, 8).toString('hex'));

const bodies = {
  'raw(文件里的原文)': plainStr,
  'JSON.stringify(obj)': JSON.stringify(plain),
  'JSON.stringify(obj,null,0)': JSON.stringify(plain, null, 0),
};
const pbufs = {};
for (const [k, v] of Object.entries(bodies)) if (typeof v === 'string') pbufs[k] = Buffer.from(v, 'utf8');
for (const [k, b] of Object.entries(pbufs)) console.log('  plain[' + k + '] =', b.length, 'bytes');

const TARGET = cipher.length;
const hits = [];
const strategies = {
  DEFAULT: zlib.constants.Z_DEFAULT_STRATEGY,
  FILTERED: zlib.constants.Z_FILTERED,
  HUFFMAN_ONLY: zlib.constants.Z_HUFFMAN_ONLY,
  RLE: zlib.constants.Z_RLE,
  FIXED: zlib.constants.Z_FIXED,
};

for (const [pname, pb] of Object.entries(pbufs)) {
  for (let lvl = 0; lvl <= 9; lvl++) {
    for (const [sname, sv] of Object.entries(strategies)) {
      for (const memLevel of [8, 9]) {
        let out;
        try { out = zlib.deflateSync(pb, { level: lvl, strategy: sv, memLevel }); } catch (e) { continue; }
        const d = out.length - TARGET;
        if (Math.abs(d) <= 24) {
          hits.push({ pname, lvl, sname, memLevel, len: out.length, diff: d });
        }
      }
    }
  }
}
console.log('\n=== 长度接近 7372 的 deflate 组合（±24） ===');
if (!hits.length) console.log('  无命中');
for (const h of hits) console.log('  ' + JSON.stringify(h));

// 全量长度分布（便于报告写明"最近多少"）
let best = null;
for (const [pname, pb] of Object.entries(pbufs)) {
  for (let lvl = 0; lvl <= 9; lvl++) {
    const n = zlib.deflateSync(pb, { level: lvl }).length;
    if (!best || Math.abs(n - TARGET) < Math.abs(best.len - TARGET)) best = { pname, lvl, len: n };
  }
}
console.log('\n最接近：', JSON.stringify(best), '差值 =', best.len - TARGET);

// 直接看密文是否是 zlib 流（不可能，但记录）
try { zlib.inflateSync(cipher); console.log('cipher 本身就是 zlib？是'); } catch (e) { console.log('cipher 本身不是 zlib 流（预期）:', String(e.code || e.message)); }
for (const off of [0, 1, 2]) {
  try { const o = zlib.inflateSync(cipher.slice(off)); console.log('cipher[' + off + ':] inflate 成功 len=' + o.length); } catch (e) { }
}
