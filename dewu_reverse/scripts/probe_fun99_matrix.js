/**
 * probe_fun99_matrix.js —— 解密链路的稳定性 / 环境无关性 / keystream 关系
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const { createEnv } = require('../src/env_patch');
const { createLegacyContext } = require('./legacy_sandbox.js');

const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';
const respText = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8').trim();

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

// ── 1) jsdom（env_patch）路线，多组 seed / 两次调用 ─────────────────────────
function runJsdom(label, opts) {
  const env = createEnv({ blockNetwork: true, traceReads: false, ...opts });
  const w = env.window;
  if (opts && opts.ua) {
    Object.defineProperty(w.navigator, 'userAgent', { get: () => opts.ua, configurable: true });
  }
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8'), 'preinforce2.js');
  const out = [];
  for (let i = 0; i < 2; i++) {
    try { out.push(w.fun.Fun99(respText, '', '1', '')); } catch (e) { out.push('THROW:' + e.message); }
  }
  const r = out[0];
  console.log(('  ' + label).padEnd(46), '-> len=' + String(r).length, 'md5=' + md5(String(r)), 'stable=' + (out[0] === out[1]));
  env.dispose();
  return r;
}

// ── 2) legacy vm（极简沙箱）路线 ────────────────────────────────────────────
function runLegacy(label, opts) {
  const { sb, ctx } = createLegacyContext(opts || {});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js'), 'utf8'), ctx, { filename: 'preinforce2.payload.js' });
  const r = sb.fun.Fun99(respText, '', '1', '');
  console.log(('  ' + label).padEnd(46), '-> len=' + String(r).length, 'md5=' + md5(String(r)));
  return r;
}

console.log('=== A) jsdom env 路线 ===');
const a1 = runJsdom('seed{sk,dwsm}', { seedStorage: { sk: SK, dwsm: DWSM } });
const a2 = runJsdom('no seed', {});
const a3 = runJsdom('seed sk=BOGUS', { seedStorage: { sk: 'BOGUS_SK_' + 'x'.repeat(88) } });
const a4 = runJsdom('chrome UA', { seedStorage: { sk: SK, dwsm: DWSM }, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });

console.log('\n=== B) legacy vm 路线 ===');
const b1 = runLegacy('legacy default');
const b2 = runLegacy('legacy seed sk', { localStorage: { sk: SK, dwsm: DWSM } });

console.log('\n=== C) 一致性 ===');
const all = [a1, a2, a3, a4, b1, b2].map(x => md5(String(x)));
console.log('  所有路线 md5 唯一值:', JSON.stringify([...new Set(all)]));

// ── 3) 密文格式 & keystream 关系 ───────────────────────────────────────────
console.log('\n=== D) 密文 / 明文 keystream 关系 ===');
const plain = String(a1);
function realBytesFromB64(b64) {
  const buf = Buffer.from(b64, 'base64');
  const s = buf.toString('utf8');
  const o = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
}
const cipher = realBytesFromB64(respText);
const pbuf = Buffer.from(plain, 'utf8');
console.log('  rawText chars      :', respText.length);
console.log('  base64->utf8 bytes :', Buffer.from(respText, 'base64').length);
console.log('  cipher bytes       :', cipher.length);
console.log('  plain bytes        :', pbuf.length);
console.log('  plain head         :', JSON.stringify(plain.slice(0, 80)));
if (cipher.length === pbuf.length) {
  const ks = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) ks[i] = cipher[i] ^ pbuf[i];
  console.log('  ks head64 hex      :', ks.slice(0, 64).toString('hex'));
  console.log('  ks[0:32] latin1    :', JSON.stringify(ks.slice(0, 32).toString('latin1')));
  // 是否常量单字节？
  const uniq = new Set(ks);
  console.log('  ks 不同字节数      :', uniq.size, 'of', ks.length);
  // 与请求侧 keystream 比
  for (const f of ['keystream.bin', 'keystream_1301.bin']) {
    const p = path.join(ROOT, 'artifacts', f);
    if (!fs.existsSync(p)) continue;
    const rks = fs.readFileSync(p);
    let hit = -1;
    for (let off = 0; off < Math.min(rks.length, 256); off++) {
      let ok = 0;
      const n = Math.min(48, rks.length - off);
      for (let i = 0; i < n; i++) if (rks[off + i] === ks[i]) ok++;
      if (ok >= n - 1) { hit = off; break; }
    }
    console.log('  比对 ' + f.padEnd(20) + 'len=' + rks.length + ' 前48字节匹配偏移=' + hit);
  }
  fs.writeFileSync(path.join(ROOT, 'artifacts/resp_ks.bin'), ks);
  console.log('  -> 保存 artifacts/resp_ks.bin');
} else {
  console.log('  !! 长度不等，说明不是等长流式变换');
}
