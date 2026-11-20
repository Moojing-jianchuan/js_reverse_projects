/**
 * 用真实成功的 call 的 d，反推其明文，并与我们的模板逐字段对比
 * 目的：定位「请求失败」到底缺了什么（明文长度差 200+）
 * 用法: node scripts/diff_call_plain.js
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const { createCapProbe, decodeD } = require('../src/dewu_cap_probe');

const ROOT = path.resolve(__dirname, '..');
const SK = 'YOUR_SK_HERE';
const SHUMEI = 'YOUR_SHUMEIID_HERE';

async function getKs(minLen) {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: SHUMEI } });
  const probe = createCapProbe(env, {});
  probe.installPreLoad();
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  probe.installPostLoad();
  await probe.call({ sessionId: 'A'.repeat(Math.max(2500, (minLen || 2000) + 800)) });
  const rep = probe.report();
  env.dispose();
  return rep.data.keystream;
}

function findCallD(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of ['request_post_data', 'body']) {
    const v = obj[k];
    if (typeof v === 'string' && v.includes('"d"') && (obj.url || '').includes('captcha/call')) {
      try { const j = JSON.parse(v); if (j && j.d) return j; } catch (e) { }
    }
  }
  for (const v of Object.values(obj)) { const r = findCallD(v); if (r) return r; }
  return null;
}

(async () => {
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/capture_call2.json'), 'utf8'));
  const body = findCallD(cap);
  if (!body) { console.log('没找到 call 的 d'); return; }
  const cipher = decodeD(body.d);
  const buf = cipher.cipher || cipher;
  console.log('真实 call: d len', body.d.length, '| 密文', buf.length, '字节');

  const ks = await getKs(buf.length);
  console.log('ks 长度:', ks.length);
  const n = Math.min(buf.length, ks.length);
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = buf[i] ^ ks[i];
  const text = out.toString('utf8');
  console.log('\n=== 真实 call 明文前 500 ===');
  console.log(text.slice(0, 500));

  let json = null;
  try { json = JSON.parse(text); } catch (e) { console.log('JSON.parse 失败:', e.message.slice(0, 80)); }
  if (json) {
    fs.writeFileSync(path.join(ROOT, 'artifacts/call_plain_real.json'), JSON.stringify(json, null, 1));
    console.log('\n✅ 解析成功 | 顶层:', Object.keys(json).join(','));
    const inner = JSON.parse(json.data);
    console.log('data 字段数:', Object.keys(inner).length);
    console.log('data keys:', Object.keys(inner).join(','));

    // 与我们的模板对比
    const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/cap_d_plaintext.json'), 'utf8'));
    const tplInner = JSON.parse(tpl.data);
    const realKeys = new Set(Object.keys(inner));
    const tplKeys = new Set(Object.keys(tplInner));
    const missing = [...realKeys].filter(k => !tplKeys.has(k));
    const extra = [...tplKeys].filter(k => !realKeys.has(k));
    console.log('\n=== 与模板差异 ===');
    console.log('模板缺的字段:', missing.length ? missing.join(',') : '（无）');
    console.log('模板多的字段:', extra.length ? extra.join(',') : '（无）');
    for (const k of Object.keys(inner)) {
      const a = JSON.stringify(inner[k]), b = JSON.stringify(tplInner[k]);
      if (a !== b && a && a.length < 200) console.log(`  值不同 ${k}: 真实=${String(a).slice(0, 90)} 模板=${String(b).slice(0, 90)}`);
    }
    console.log('\n明文长度: 真实', JSON.stringify(json).length, '| 模板', JSON.stringify(tpl).length);
  }
})().catch(e => console.error('ERR', e));
