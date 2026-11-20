/**
 * 解剖 verify 的 d：还原明文，看 datav3（轨迹）结构
 * 依赖：先用 captcha 通道在「同一 sk + 同一 UA」下生成一份超长明文，导出足够长的 keystream
 * 用法: node scripts/analyze_verify_d.js
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const { createCapProbe, decodeD, deriveKeystream } = require('../src/dewu_cap_probe');

const ROOT = path.resolve(__dirname, '..');
const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';

// ① 从抓包导出里取 verify 的 d
const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/capture_verify.json'), 'utf8'));
function findD(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of ['request_post_data', 'body', 'postData']) {
    const v = obj[key];
    if (typeof v === 'string' && v.includes('"d"')) {
      try { const j = JSON.parse(v); if (j && j.d) return j; } catch (e) { }
    }
  }
  for (const v of Object.values(obj)) { const r = findD(v); if (r) return r; }
  return null;
}
const verifyBody = findD(cap);
if (!verifyBody) { console.log('抓包里没找到 verify 的 d'); process.exit(1); }
console.log('verify d 长度:', verifyBody.d.length, '| sign:', verifyBody.sign);
const verifyCipher = decodeD(verifyBody.d);
console.log('verify 密文字节:', verifyCipher.cipher ? verifyCipher.cipher.length : verifyCipher.length);

// ② 同 sk + 同 UA 下生成一条超长明文，导出 keystream
(async () => {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: DWSM } });
  const probe = createCapProbe(env, {});
  probe.installPreLoad();
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  probe.installPostLoad();

  const pad = 'A'.repeat(6000);   // 撑长 sessionId，UA 不变 → keystream 不变
  await probe.call({ sessionId: pad });
  const rep = probe.report();
  const ks = rep.data.keystream;
  console.log('标定 keystream 长度:', ks ? ks.length : 0, '| 明文长度:', rep.data.plaintextLen);
  if (!ks) { console.log('没拿到 keystream'); env.dispose(); return; }

  const cipher = verifyCipher.cipher || verifyCipher;
  const n = Math.min(cipher.length, ks.length);
  if (cipher.length > ks.length) console.log(`⚠ keystream 不够长：密文 ${cipher.length} > ks ${ks.length}，只能解前 ${n} 字节`);

  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = cipher[i] ^ ks[i];
  const text = out.toString('utf8');
  console.log('\n=== 解密前 600 字符 ===');
  console.log(text.slice(0, 600));

  // 尝试 JSON.parse
  let json = null;
  try { json = JSON.parse(text); } catch (e) { }
  if (!json) {
    // 尾部可能被截断，尝试补括号
    for (const tail of ['', '}', ']}', '}}', '"}}']) {
      try { json = JSON.parse(text + tail); break; } catch (e) { }
    }
  }
  if (json) {
    console.log('\n✅ JSON 解析成功，顶层字段:', Object.keys(json).join(','));
    fs.writeFileSync(path.join(ROOT, 'artifacts/verify_d_plaintext.json'), JSON.stringify(json, null, 1));
    const s = JSON.stringify(json);
    for (const key of ['datav3', 'datav3Fail', 'cRestStart', 'sessionID', 'isSuccess', 'type']) {
      if (s.includes('"' + key + '"')) {
        const v = json[key] !== undefined ? json[key] : (json.data && json.data[key]);
        console.log(`  ${key} =`, typeof v === 'string' ? v.slice(0, 300) + (v.length > 300 ? ` …(len ${v.length})` : '') : JSON.stringify(v).slice(0, 300));
      }
    }
  } else {
    console.log('\n未解析成 JSON（可能 keystream 不足或 UA 分支不同）');
    fs.writeFileSync(path.join(ROOT, 'artifacts/verify_d_plaintext_raw.txt'), text);
  }
  fs.writeFileSync(path.join(ROOT, 'artifacts/cap_ks_long.bin'), ks);
  env.dispose();
})().catch(e => console.error('ERR', e));
