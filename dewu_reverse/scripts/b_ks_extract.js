/**
 * B-3：标定 keystream 表 + 验证决定因素
 *  - 与线上抓包样本逐字比对
 *  - 用超长明文抽出 ks（≥2048B），再用另一条长明文复验整表一致
 *  - 换 shumeiid / 换 UA 各自重标，确认 ks = F(sk, shumeiid, UA)
 * 产出：artifacts/b_ks.bin / artifacts/b_ks_meta.json
 * 用法: node scripts/b_ks_extract.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const UA_DEFAULT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const CAPTURED_DATA = 'df74e6521fc1ea3752eddb701c5453b8w6bDlcK3F37Dv1AyGcK5GmlRd8OfcMKAw4/CnMO/w6sdcMKpw7goMsOQNMMpwo5kWsK7wpYRw4DDlyJ6YMOdw5MMFjvDm1BaCMKjwrPChSTCuxAyw4N4w44YK8KZWcKVwrHDn8OQKcKPMsO3PMKwR0BBwpvCksO2w4o+PF9Xw4lfRsKcwqbCrkXDhnzCgF3Cm2HCtMOpTUokWXjDiC3CiC3DoXHCpcOLMsKRJHQuw5rDqgDCrXvCrw==';
const CAPTURED_PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

function realBytes(b64) {
  const raw = Buffer.from(String(b64), 'base64');
  const t = raw.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

function makeSession(opts) {
  const o = opts || {};
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: o.sk || SK, dwsm: o.sm || SM } });
  const w = env.window;
  if (o.ua) {
    try {
      Object.defineProperty(w.navigator, 'userAgent', { get: () => o.ua, configurable: true });
      Object.defineProperty(w.navigator, 'appVersion', { get: () => String(o.ua).replace('Mozilla/', ''), configurable: true });
    } catch (e) { }
  }
  for (const f of ['pceptor.js', 'preinforce2.js']) env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js', f), 'utf8'), f);
  const fun = w.fun;
  const F110 = fun.Fun110 || Object.getPrototypeOf(fun).Fun110;
  const keyMap = { SK: o.sk || SK, Sk: o.sk || SK, sk: o.sk || SK, ShumeiId: o.sm || SM, shumeiId: o.sm || SM, shumeiid: o.sm || SM };
  return {
    env, w, fun,
    call(plain) {
      const r = F110.call(fun, plain, 'post', '', false, keyMap);
      return r;
    },
    dispose() { try { env.dispose(); } catch (e) { } },
  };
}

function ksFrom(plain, data, len) {
  const cipher = realBytes(data.slice(32));
  const p = Buffer.from(plain, 'utf8');
  const n = Math.min(p.length, cipher.length, len || 1e9);
  const ks = Buffer.alloc(n);
  for (let i = 0; i < n; i++) ks[i] = p[i] ^ cipher[i];
  return { ks, cipher, p };
}

const meta = { sk: SK, sm: SM, ua: UA_DEFAULT, findings: {} };

/* ---- 1) 与线上抓包逐字比对 ---- */
const s1 = makeSession({});
const r1 = s1.call(CAPTURED_PLAIN);
const data1 = JSON.parse(r1.d).data;
meta.findings.capturedDataEqual = data1 === CAPTURED_DATA;
meta.findings.capturedDataLen = data1.length;
const capDec = realBytes(CAPTURED_DATA.slice(32));
meta.findings.capturedCipherLen = capDec.length;
meta.findings.capturedPlainLen = Buffer.byteLength(CAPTURED_PLAIN);
console.log('[1] data == captured:', data1 === CAPTURED_DATA, '| dataLen', data1.length);
console.log('    cipherLen', capDec.length, '| plainLen', Buffer.byteLength(CAPTURED_PLAIN), '| delta', capDec.length - Buffer.byteLength(CAPTURED_PLAIN));

/* ---- 2) 超长明文抽 ks ---- */
const PAD = 'a'.repeat(2048);
const LONG_A = JSON.stringify({ sign: md5('A'), pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true, pad: PAD });
const LONG_B = JSON.stringify({ sign: md5('B'), pickRuleId: 644443, pageNum: 3, pageSize: 12, filterUnbid: false, showCspu: true, pad: PAD });
const ra = s1.call(LONG_A), rb = s1.call(LONG_B);
const A = ksFrom(LONG_A, JSON.parse(ra.d).data, 2200);
const B = ksFrom(LONG_B, JSON.parse(rb.d).data, 2200);
let sameAB = 0;
const mAB = Math.min(A.ks.length, B.ks.length);
for (let i = 0; i < mAB; i++) if (A.ks[i] === B.ks[i]) sameAB++;
meta.findings.ksLen = A.ks.length;
meta.findings.ksSelfMatch = sameAB + '/' + mAB;
console.log('[2] ks len', A.ks.length, '| 两条不同明文整表一致:', sameAB + '/' + mAB);

/* ---- 3) 短明文也用同一张表 ---- */
const ks124 = ksFrom(CAPTURED_PLAIN, data1, 124).ks;
let sameShort = 0;
for (let i = 0; i < 124; i++) if (ks124[i] === A.ks[i]) sameShort++;
meta.findings.ksShortVsLong = sameShort + '/124';
console.log('[3] 124B 明文反推 ks 与长表一致:', sameShort + '/124');

fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/b_ks.bin'), A.ks);
meta.ksSha256 = crypto.createHash('sha256').update(A.ks).digest('hex');

/* ---- 4) 换 shumeiid ---- */
const SM2 = '2026112099999999' + SM.slice(16);
const s2 = makeSession({ sm: SM2 });
const r2 = s2.call(CAPTURED_PLAIN);
const ks2 = ks124 ? ksFrom(CAPTURED_PLAIN, JSON.parse(r2.d).data, 124).ks : null;
let sameSM = 0;
for (let i = 0; i < 124; i++) if (ks2[i] === A.ks[i]) sameSM++;
meta.findings.ksVsOtherSm = sameSM + '/124';
console.log('[4] 换 shumeiid 后 ks 与基准一致:', sameSM + '/124');
s2.dispose();

/* ---- 5) 换 UA ---- */
const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const s3 = makeSession({ ua: UA_CHROME });
const r3 = s3.call(CAPTURED_PLAIN);
const ks3 = ksFrom(CAPTURED_PLAIN, JSON.parse(r3.d).data, 124).ks;
let sameUA = 0;
for (let i = 0; i < 124; i++) if (ks3[i] === A.ks[i]) sameUA++;
meta.findings.ksVsOtherUa = sameUA + '/124';
meta.findings.uaChromeSample = JSON.parse(r3.d).data;
console.log('[5] 换 UA(Chrome) 后 ks 与基准一致:', sameUA + '/124');
console.log('    Chrome UA 下 data.head:', JSON.parse(r3.d).data.slice(0, 48));
s3.dispose();

/* ---- 6) 新进程内重标一次（决定论）---- */
const s4 = makeSession({});
const r4 = s4.call(CAPTURED_PLAIN);
meta.findings.deterministic2ndEnv = JSON.parse(r4.d).data === data1;
console.log('[6] 同一进程内第二个 env 结果一致:', meta.findings.deterministic2ndEnv);
s4.dispose();
s1.dispose();

fs.writeFileSync(path.join(ROOT, 'artifacts/b_ks_meta.json'), JSON.stringify(meta, null, 1));
console.log('\nfindings:', JSON.stringify(meta.findings, null, 1));
process.exit(0);
