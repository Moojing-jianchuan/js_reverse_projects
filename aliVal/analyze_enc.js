// 判断 enc 是「6-bit 编码」还是「字节加密」：看字节取值集合与分布
const fs = require('fs');
const zlib = require('zlib');

const pair = { data: 'config/sample_data.b64', deflate: 'config/sample_deflate.b64' };
for (const [k, f] of Object.entries(pair)) if (!fs.existsSync(f)) { console.log('missing', f); process.exit(0); }

const data = Buffer.from(fs.readFileSync(pair.data, 'utf8').trim(), 'base64');
const deflate = Buffer.from(fs.readFileSync(pair.deflate, 'utf8').trim(), 'base64');
const magic = data.slice(0, 3);
const enc = data.slice(3);

console.log('magic =', [...magic].map(x => x.toString(16)).join(' '));
console.log('deflate len =', deflate.length, '| enc len =', enc.length,
  '| ratio =', (enc.length / deflate.length).toFixed(4), '| 4/3 =', (4 / 3).toFixed(4));

// 直方图
const hist = new Array(256).fill(0);
for (const b of enc) hist[b]++;
const distinct = hist.map((c, i) => [i, c]).filter(([, c]) => c > 0);
console.log('distinct byte values =', distinct.length);
const vals = distinct.map(([i]) => i);
console.log('min =', Math.min(...vals), 'max =', Math.max(...vals));

if (distinct.length <= 80) {
  console.log('取值集合 =', vals.map(v => v.toString(16).padStart(2, '0')).join(' '));
  const asChars = vals.map(v => (v >= 32 && v < 127 ? String.fromCharCode(v) : '.')).join('');
  console.log('对应字符 =', asChars);
}

// 高 4 位 / 低 4 位分布（看是否 6-bit 打包）
const hi = new Array(256).fill(0), lo = new Array(256).fill(0);
for (const b of enc) { hi[b >> 4]++; lo[b & 15]++; }
console.log('高 4 位分布 =', hi.map((c, i) => c ? i.toString(16) + ':' + c : '').filter(Boolean).join(' '));
console.log('低 4 位分布 =', lo.map((c, i) => c ? i.toString(16) + ':' + c : '').filter(Boolean).join(' '));

console.log('\nenc 前 24:', enc.slice(0, 24).toString('hex'));
console.log('deflate 前 24:', deflate.slice(0, 24).toString('hex'));
console.log('XOR 前 24:', Buffer.from(enc.slice(0, 24).map((b, i) => b ^ (deflate[i] || 0))).toString('hex'));

// 若 enc 是纯 6-bit 值（0..63），长度应等于 ceil(deflate*8/6)
console.log('\nceil(8/6*deflate) =', Math.ceil(deflate.length * 8 / 6),
  '| deflate*4/3 floor =', Math.floor(deflate.length * 4 / 3));
