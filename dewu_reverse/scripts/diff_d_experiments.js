/**
 * 用「差分法」绕过 keystream 假设，直接判定加密结构：
 *  - 实验1：同 env 同输入两次 dewuCap → XOR 差异位置（找随机/时间字段的偏移）
 *  - 实验2：UA 等长改动（rv:152.0 → rv:152.9）→ XOR 差异是否局限在 UA 段（判定是否为位置对齐的流密码）
 *  - 实验3：UA 加长 → 长度变化后前缀是否对齐
 * 用法: node scripts/diff_d_experiments.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const PYUNTU = fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8');
const BUNDLE = path.join(ROOT, 'artifacts/env_baseline/dewu_env_bundle.json');

function realBytes(b64) {
  const buf = Buffer.from(b64, 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

function bundleWithUA(ua) {
  const originalUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
  const s = fs.readFileSync(BUNDLE, 'utf8');
  const p = path.join(os.tmpdir(), 'b_' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(p, s.split(originalUA).join(ua));
  return p;
}

async function getDBytes(bundlePath, delayMs = 0) {
  const env = createEnv({ blockNetwork: true, traceReads: false, bundlePath });
  const w = env.window;
  const cap = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send;
  P.open = function (m, u) { this.__c = { url: String(u) }; return oOpen.apply(this, arguments); };
  P.send = function (b) { if (this.__c && b != null) { this.__c.body = String(b); cap.push(this.__c); } return oSend.apply(this, arguments); };
  env.evalSource(PYUNTU, 'pyuntu.js');
  if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  w.dewuCap({});
  return new Promise(res => setTimeout(() => {
    const hit = cap.find(c => c.url.includes('captcha'));
    env.dispose();
    res(hit ? realBytes(JSON.parse(hit.body).d) : null);
  }, 1200));
}

function diffReport(name, a, b) {
  const n = Math.min(a.length, b.length);
  const diffs = [];
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diffs.push(i);
  console.log(`\n[${name}] lenA=${a.length} lenB=${b.length} 差异字节数=${diffs.length}`);
  if (diffs.length) {
    const first = diffs[0], last = diffs[diffs.length - 1];
    console.log(`  差异区间: [${first} .. ${last}]  跨度=${last - first + 1}`);
    console.log(`  前 20 个差异偏移: ${diffs.slice(0, 20).join(',')}`);
    // 判断是否“聚集成段”还是“全局扩散”
    const span = last - first + 1;
    const density = diffs.length / Math.max(1, span);
    console.log(`  段内密度=${density.toFixed(3)}  ${density > 0.9 ? '（连续段 → 位置对齐的流密码）' : '（稀疏/分散 → 需进一步看）'}`);
  }
  return diffs;
}

(async () => {
  const UA0 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
  const UA_EQ = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.9) Gecko/20100101 Firefox/152.0';   // 等长
  const UA_LONG = UA0 + ' ExtraToken/1.0';                                                          // +15

  console.log('=== 实验1：同 env 同输入，两次调用 ===');
  const a1 = await getDBytes(BUNDLE);
  const a2 = await getDBytes(BUNDLE);
  diffReport('same-input twice', a1, a2);

  console.log('\n=== 实验2：UA 等长改动 ===');
  const b1 = await getDBytes(bundleWithUA(UA_EQ));
  diffReport('UA equal-length change', a1, b1);

  console.log('\n=== 实验3：UA 加长 ===');
  const c1 = await getDBytes(bundleWithUA(UA_LONG));
  diffReport('UA longer', a1, c1);

  fs.writeFileSync(path.join(ROOT, 'artifacts/d_samples.json'), JSON.stringify({
    a1: a1.toString('hex'), a2: a2.toString('hex'), b1: b1.toString('hex'), c1: c1.toString('hex')
  }));
  console.log('\n→ 样本已存 artifacts/d_samples.json');
})();
