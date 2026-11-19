// 检验 data 编码层是否为「6-bit → 固定字节」映射表（若是，则可离线复现）
// 样本1: deflate 449 -> enc 597 ; 样本2: deflate 639 -> enc 849
const fs = require('fs');
const zlib = require('zlib');

const S = JSON.parse(fs.readFileSync('config/btoa_capture.json', 'utf8'));
const deflateB = Buffer.from(S[1].b64, 'base64');      // deflate 数据
const dataB = Buffer.from(S[2].b64, 'base64');         // magic(3) + enc
const enc = dataB.slice(3);
console.log('deflate', deflateB.length, 'enc', enc.length);
const stdB64 = deflateB.toString('base64');
console.log('std base64 len', stdB64.length, 'enc len', enc.length, 'diff', stdB64.length - enc.length);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function sixBits(buf) {
  const out = [];
  for (const byte of buf) {
    for (let s = 2; s >= 0; s--) out.push((byte >> (s * 2)) & ((1 << 6) - 1) >> 0);
  }
  return out;
}
// 直接从 deflate 的位流取 6-bit 组（与 base64 相同分组，但不受字母表影响）
const bits = sixBits(deflateB);
console.log('6-bit groups', bits.length, 'expected b64 len', Math.ceil(deflateB.length * 8 / 6));

// 对每个偏移量，检查 enc[i] 与 bits[i+off] 的映射是否为函数
for (const off of [0, 1, 2, 3]) {
  const map = new Map();   // 6bit value -> Set(byte)
  let n = 0;
  for (let i = 0; i + off < bits.length && i < enc.length; i++) {
    const v = bits[i + off], b = enc[i];
    if (!map.has(v)) map.set(v, new Set());
    map.get(v).add(b);
    n++;
  }
  let funcLike = 0;
  for (const [, set] of map) if (set.size === 1) funcLike++;
  const avg = [...map.values()].reduce((a, s) => a + s.size, 0) / map.size;
  console.log(`off=${off}: 覆盖 ${n} 组, 6bit 值种类 ${map.size}, 每值平均字节数 ${avg.toFixed(2)}, 纯函数值个数 ${funcLike}`);
}

// 另一个假设：enc 是 8-bit 流加密，长度应等于 deflate —— 直接比较长度
console.log('若为流加密，enc 长度应 =', deflateB.length, '实际', enc.length);
