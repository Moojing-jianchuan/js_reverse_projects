// 验证 deviceToken 的 md5 公式：MD5("WEB#deviceId#cipher#len#daye,raolewoba!")
const fs = require('fs');
const crypto = require('crypto');
const token = fs.readFileSync('config/token_verify.txt', 'utf8').trim();
const inner = Buffer.from(token, 'base64').toString('utf8');
const seg = inner.split('#');
console.log('段:', seg.map(s => s.length));
console.log('len 段:', seg[3], ' md5 段:', seg[4]);
const base = seg.slice(0, 4).join('#');
const cands = {
  'base#daye,raolewoba!': base + '#daye,raolewoba!',
  'base+#daye,raolewoba!': base + '#daye,raolewoba!',
  'base': base,
  'base#daye,raolewoba': base + '#daye,raolewoba',
  'daye,raolewoba!': 'daye,raolewoba!',
  'base+daye,raolewoba!': base + 'daye,raolewoba!',
};
for (const [k, v] of Object.entries(cands)) {
  const h = crypto.createHash('md5').update(v, 'utf8').digest('hex');
  console.log((h === seg[4] ? 'MATCH ' : '      ') + k + ' -> ' + h);
}
// 也试 base64/hex 形式
const utf8 = Buffer.from(cands['base#daye,raolewoba!'], 'utf8');
console.log('md5(utf8 bytes) ->', crypto.createHash('md5').update(utf8).digest('hex'));
console.log('md5(inner) ->', crypto.createHash('md5').update(inner, 'utf8').digest('hex'));
console.log('md5(inner+daye) ->', crypto.createHash('md5').update(inner + '#daye,raolewoba!', 'utf8').digest('hex'));
