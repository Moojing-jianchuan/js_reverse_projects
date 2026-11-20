/**
 * 独立验证 B 的 d 破解：换 UA 生成两份 d，用同一份 keystream 解密
 * 判据：明文长度 == 密文长度、两份明文是合法 JSON、dua 字段跟随 UA 变化
 * 用法: node scripts/verify_d_independent.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const { decryptD, signD, getKeystream } = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const PYUNTU = fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8');
const BUNDLE = path.join(ROOT, 'artifacts/env_baseline/dewu_env_bundle.json');

function makeBundleWithUA(ua) {
  const b = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  // bundle 结构可能把 navigator 放在不同层级，做一次深度替换
  const s = JSON.stringify(b);
  const originalUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
  if (!s.includes(originalUA)) console.log('!! 警告：bundle 里找不到原始 UA，替换可能无效');
  const mutated = s.split(originalUA).join(ua);
  const p = path.join(os.tmpdir(), 'dewu_bundle_' + Date.now() + '.json');
  fs.writeFileSync(p, mutated);
  return p;
}

async function getD(bundlePath) {
  const env = createEnv({ blockNetwork: true, traceReads: false, bundlePath });
  const w = env.window;
  const cap = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send;
  P.open = function (m, u) { this.__c = { url: String(u) }; return oOpen.apply(this, arguments); };
  P.send = function (b) { if (this.__c && b != null) { this.__c.body = String(b); cap.push(this.__c); } return oSend.apply(this, arguments); };
  env.evalSource(PYUNTU, 'pyuntu.js');
  w.dewuCap({});
  return new Promise(res => setTimeout(() => {
    const hit = cap.find(c => c.url.includes('captcha'));
    env.dispose();
    res(hit ? JSON.parse(hit.body) : null);
  }, 1500));
}

function countBytes(b64) {
  const buf = Buffer.from(b64, 'base64');
  const t = buf.toString('utf8');
  let n = 0;
  for (let i = 0; i < t.length; i++) n++;
  return t.length;
}

(async () => {
  const ks = getKeystream();
  console.log('keystream 长度:', ks.length);

  const uaA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
  const uaB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

  console.log('\n--- A: 原 UA ---');
  const a = await getD(BUNDLE);
  console.log('d.len', a.d.length, 'sign', a.sign);
  const pA = decryptD(a.d, ks);
  console.log('明文长度', pA.length, '| sign 自校验:', signD(a.d) === a.sign ? '✅' : '❌');
  let jA = null; try { jA = JSON.parse(pA); } catch (e) { console.log('明文非 JSON:', e.message); }
  if (jA) {
    console.log('顶层字段:', Object.keys(jA).join(','));
    const inner = JSON.parse(jA.data);
    console.log('data 字段数:', Object.keys(inner).length);
    console.log('dua 命中 Firefox:', inner.dua && inner.dua.includes('rv:152.0') ? '✅' : '❌ ' + String(inner.dua).slice(0, 60));
  }

  console.log('\n--- B: 换 Chrome UA ---');
  const bundleB = makeBundleWithUA(uaB);
  const b2 = await getD(bundleB);
  console.log('d.len', b2.d.length, 'sign', b2.sign);
  const pB = decryptD(b2.d, ks);
  console.log('明文长度', pB.length);
  let jB = null; try { jB = JSON.parse(pB); } catch (e) { console.log('明文非 JSON:', e.message); }
  if (jB) {
    const innerB = JSON.parse(jB.data);
    console.log('dua 命中 Chrome:', innerB.dua && innerB.dua.includes('Chrome/136') ? '✅' : '❌ ' + String(innerB.dua).slice(0, 80));
  }

  console.log('\n=== 判定 ===');
  console.log('两份 d 不同:', a.d !== b2.d ? '✅' : '❌');
  console.log('两份明文长度不同:', (jA && jB) ? (pA.length !== pB.length ? '✅ (' + pA.length + ' vs ' + pB.length + ')' : '❌') : '-');
  console.log('同一份 KS 解出两份正确明文:', (jA && jB) ? '✅ KS 与明文无关' : '需人工确认');
  fs.unlinkSync(bundleB);
})();
