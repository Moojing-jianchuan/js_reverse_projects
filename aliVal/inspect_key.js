// 解当前 DeviceConfig，确认 FeiLin 的 key 来源与取值（离线，不需要浏览器）
const fs = require('fs');
const path = require('path');
const { aesDecrypt, KEYS } = require('./utils/crypto');

const files = [
  'config/device_config_live.txt',
  'config/device_config_now.txt',
];

function tryFile(f) {
  if (!fs.existsSync(f)) return;
  const b64 = fs.readFileSync(f, 'utf8').trim();
  console.log('\n===', path.basename(f), 'len', b64.length);
  let plain;
  try {
    plain = aesDecrypt(b64, KEYS.RES_KEY, KEYS.AES_IV);
  } catch (e) {
    console.log('  解密失败:', e.message);
    return;
  }
  console.log('  明文长度:', plain.length);
  const parts = plain.split('#');
  console.log('  分段数:', parts.length);
  parts.forEach((p, i) => {
    let asText = '';
    try { asText = Buffer.from(p, 'base64').toString('utf8'); } catch (e) { asText = '<not-b64>'; }
    const printable = /^[\x20-\x7e]{1,80}$/.test(asText);
    console.log(`  [${i}] raw=${p.slice(0, 40)}${p.length > 40 ? '…' : ''} | b64->${printable ? JSON.stringify(asText) : '<binary/' + asText.length + '>'}`);
  });
  // 找出所有像 key 的段（长度 16/24/32 的可打印串）
  parts.forEach((p, i) => {
    const t = Buffer.from(p, 'base64').toString('utf8');
    if (/^[\x20-\x7e]{16,64}$/.test(t)) console.log(`  ★ 候选 key [${i}] = ${JSON.stringify(t)}`);
    if (/^[0-9a-f]{32}$/i.test(p)) console.log(`  ★ 32hex [${i}] = ${p}`);
  });
}

files.forEach(tryFile);

// 同时打印已有样本的规模，便于后续对齐
['config/sample_deflate.b64', 'config/sample_data.b64', 'config/data_fresh.txt', 'config/data_from_page.txt'].forEach((f) => {
  if (!fs.existsSync(f)) return;
  const raw = fs.readFileSync(f, 'utf8').trim();
  let head = '', decLen = 0, magic = '';
  try {
    const b = Buffer.from(raw, 'base64');
    decLen = b.length;
    magic = [...b.slice(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join(' ');
    head = b.slice(3, 11).toString('hex');
  } catch (e) { }
  console.log(`\n[sample] ${path.basename(f)} b64len=${raw.length} declen=${decLen} magic=${magic} next8=${head}`);
});
