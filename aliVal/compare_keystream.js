// 两个样本的 keystream 比对：enc ^ base64text，寻找使两次 ks 一致的对齐
const fs = require('fs');
const S = JSON.parse(fs.readFileSync('config/btoa_capture.json', 'utf8'));
const deflateB = Buffer.from(S[1].b64, 'base64');
const dataB = Buffer.from(S[2].b64, 'base64');
const enc = dataB.slice(3);
const b64 = Buffer.from(deflateB.toString('base64'), 'latin1');
console.log('enc', enc.length, 'b64', b64.length);

// 追加样本2（后一轮采样：deflate 639 / data 852）
const s2deflate = fs.existsSync('config/sample_deflate.b64') ? Buffer.from(fs.readFileSync('config/sample_deflate.b64', 'utf8').trim(), 'base64') : null;
const s2data = fs.existsSync('config/sample_data.b64') ? Buffer.from(fs.readFileSync('config/sample_data.b64', 'utf8').trim(), 'base64') : null;
if (!s2deflate || !s2data) { console.log('缺少样本2文件 config/sample_data.b64'); process.exit(0); }
const enc2 = s2data.slice(3);
const b64b = Buffer.from(s2deflate.toString('base64'), 'latin1');
console.log('enc2', enc2.length, 'b64b', b64b.length);

const ks1 = Buffer.alloc(enc.length);
for (let i = 0; i < enc.length; i++) ks1[i] = enc[i] ^ b64[i];
const ks2at = (k) => { const out = Buffer.alloc(enc.length); for (let i = 0; i < enc.length; i++) out[i] = enc2[i] ^ (b64b[i + k] || 0); return out; };
let best = null;
for (let k = -6; k <= 6; k++) {
  const ks2 = ks2at(k);
  let same = 0;
  for (let i = 0; i < enc.length; i++) if (ks1[i] === ks2[i]) same++;
  const rate = same / enc.length;
  if (!best || rate > best.rate) best = { k, rate };
  console.log(`offset ${k}: ks 一致率 ${(rate * 100).toFixed(1)}%`);
}
console.log('best', best);
// 打印最佳对齐下的 ks 前 32 字节
const ks2b = ks2at(best.k);
console.log('ks1 head', ks1.slice(0, 32).toString('hex'));
console.log('ks2 head', ks2b.slice(0, 32).toString('hex'));
// ks 是否周期
const periods = [];
for (let p = 1; p < 128; p++) { let same = 0; for (let i = 0; i + p < ks1.length; i++) if (ks1[i] === ks1[i + p]) same++; periods.push({ p, rate: same / (ks1.length - p) }); }
periods.sort((a, b) => b.rate - a.rate);
console.log('ks1 周期 top5', periods.slice(0, 5).map(x => `${x.p}:${(x.rate * 100).toFixed(1)}%`));
