// 用集成后的 feilin_data.armour 复算两组真实样本，逐字节比对 data 全串
// 并做 armour/unarmour 往返测试（unarmour(armour(T)) === T）
const fs = require('fs');
const zlib = require('zlib');
const { armour, unarmour } = require('./feilin_data');

let pass = 0, roundTripPass = 0;
for (const f of ['config/cvp_sample_1.json', 'config/cvp_sample_2.json']) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const T = d.deflate_b64;                       // 真实同轮 T
  const want = d.cvp_blob;                       // 真实 data（base64）
  const got = Buffer.from(armour(T)).toString('base64');
  const gotRaw = Buffer.from(armour(T));
  const diff = [...gotRaw].filter((b, i) => b !== Buffer.from(want, 'base64')[i]).length;
  const ok = got === want;
  if (ok) pass++;
  console.log(`\n== ${f}`);
  console.log('  T len =', T.length, '| data want len =', want.length, '| got len =', got.length);
  console.log('  first3 got =', [...gotRaw.slice(0, 3)].map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('  >>> data 全串相等:', ok, '| 逐字节差异:', diff);
  if (!ok) {
    console.log('  want head:', want.slice(0, 40));
    console.log('  got  head:', got.slice(0, 40));
  }

  // 往返测试：真 data → unarmour → T；armour → unarmour → T
  const backT = unarmour(Buffer.from(want, 'base64')).toString('latin1');
  const rt1 = backT === T;
  const rt2 = unarmour(armour(T)).toString('latin1') === T;
  if (rt1 && rt2) roundTripPass++;
  console.log('  >>> unarmour(真 data) === T :', rt1, '| unarmour(armour(T)) === T :', rt2);
  if (!rt1) console.log('    roundtrip got head:', backT.slice(0, 32), ' want:', T.slice(0, 32));

  // 再解一次 payload，确认 T 与 payload 自洽
  const plain = zlib.inflateSync(Buffer.from(T, 'base64')).toString('utf8');
  console.log('  payload 前缀 nonce =', plain.slice(0, 32));
}
console.log(`\n[RESULT] data 复算 ${pass}/2 通过 | 往返 ${roundTripPass}/2 通过`);
process.exit(pass === 2 && roundTripPass === 2 ? 0 : 1);
