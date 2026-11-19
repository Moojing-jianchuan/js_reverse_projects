// 解密页面 SDK 生成的 data（控制组输入观察）
const crypto = require('crypto');
const fs = require('fs');

const dc = fs.readFileSync('config/device_config_now.txt', 'utf8').trim();
const RES_KEY = '87f879f135f27da7', IV = '0123456789ABCDEF';
const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(RES_KEY), Buffer.from(IV));
d.setAutoPadding(true);
const plain = Buffer.concat([d.update(Buffer.from(dc, 'base64')), d.final()]).toString('utf8');
const parts = plain.split('#');
console.log('DeviceConfig 段:', parts.length);
parts.forEach((s, i) => { let v; try { v = Buffer.from(s, 'base64').toString('utf8'); } catch (e) { v = s; } console.log(`  [${i}] ${JSON.stringify(v.slice(0, 70))}`); });
const key = Buffer.from(parts[0], 'base64').toString('utf8');
console.log('动态 key:', key, 'len', key.length);

const dataB64 = fs.readFileSync(process.argv[2] || 'config/data_sample.txt', 'utf8').trim();
const raw = Buffer.from(dataB64, 'base64');
console.log('data bytes:', raw.length, 'magic:', [...raw.slice(0, 3)].map(b => b.toString(16)));
const ct = raw.slice(3);
for (const iv of [IV, key]) {
  try {
    const dd = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv));
    dd.setAutoPadding(true);
    const out = Buffer.concat([dd.update(ct), dd.final()]).toString('utf8');
    console.log('\n解密成功 iv=' + JSON.stringify(iv) + ' 明文长度', out.length);
    console.log(out.slice(0, 1500));
  } catch (e) { console.log('iv=' + JSON.stringify(iv) + ' 失败:', e.message); }
}
