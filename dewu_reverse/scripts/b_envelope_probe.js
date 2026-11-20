/**
 * B-2：在同一次 jsdom 会话里用同一条 sk/sm 打多组明文，抽取「明文 → 信封」并反推 keystream
 * 产出：artifacts/b_samples.json（多组对拍 + ks 一致性结论）
 * 用法: node scripts/b_envelope_probe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/** 得物 info 的 sign：键名排序拼接 key+value，再拼固定盐，md5 */
const SALT = '048a9c4943398714b356a696503d2d36';
function signOf(obj) {
  const body = Object.keys(obj).sort().map(k => k + obj[k]).join('');
  return md5(body + SALT);
}
function infoPlain(over) {
  const o = Object.assign({ pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }, over || {});
  const plain = { sign: signOf(o) };
  for (const k of ['pickRuleId', 'pageNum', 'pageSize', 'filterUnbid', 'showCspu']) plain[k] = o[k];
  return JSON.stringify(plain);
}

/** mojibake base64 → 真实密文字节（UTF-8 层的反向还原） */
function realBytes(b64) {
  const raw = Buffer.from(String(b64), 'base64');
  const t = raw.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: SM } });
const w = env.window;
for (const f of ['pceptor.js', 'preinforce2.js']) env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js', f), 'utf8'), f);
const fun = w.fun;
const F110 = fun.Fun110 || Object.getPrototypeOf(fun).Fun110;
const keyMap = { SK: SK, Sk: SK, sk: SK, ShumeiId: SM, shumeiId: SM, shumeiid: SM };

const cases = [
  ['captured-87', infoPlain({})],
  ['pageNum2', infoPlain({ pageNum: 2 })],
  ['pickRule2', infoPlain({ pickRuleId: 644443, pageSize: 12 })],
];

const out = { sk: SK, shumeiid: SM, ua: w.navigator.userAgent, samples: [] };
let refKs = null, refOff = null;

for (const [id, plain] of cases) {
  const t0 = Date.now();
  const r = F110.call(fun, plain, 'post', '', false, keyMap);
  const dt = Date.now() - t0;
  const j = JSON.parse(r.d);
  const data = j.data;
  const hex = data.slice(0, 32);
  const cipher = realBytes(data.slice(32));
  const p = Buffer.from(plain, 'utf8');
  const rec = {
    id, plain, plainLen: p.length, data, dataLen: data.length,
    hex, hexMatchesMd5: hex === md5(plain), cipherLen: cipher.length,
    delta: cipher.length - p.length, c: r.c, a: r.a, b: r.b, e: r.e, ms: dt,
    cipherHex: cipher.toString('hex'),
  };
  // 偏移扫描：cipher[i+off] XOR plain[i] 得到 ks
  const scans = [];
  for (let off = 0; off <= 3; off++) {
    const n = Math.min(p.length, cipher.length - off);
    const ks = Buffer.alloc(n);
    for (let i = 0; i < n; i++) ks[i] = p[i] ^ cipher[i + off];
    const rec2 = { off, ksHead: ks.slice(0, 16).toString('hex'), ks };
    if (refKs) {
      let same = 0;
      const m = Math.min(ks.length, refKs.length);
      for (let i = 0; i < m; i++) if (ks[i] === refKs[i]) same++;
      rec2.matchVsRef = same + '/' + m;
      rec2.matchPct = +(same / m * 100).toFixed(2);
    }
    scans.push(rec2);
  }
  rec.scans = scans.map(s => ({ off: s.off, ksHead: s.ksHead, matchVsRef: s.matchVsRef, matchPct: s.matchPct }));

  // 选出一致性最高的偏移作为主 ks
  const best = refKs ? scans.slice().sort((x, y) => (y.matchPct || 0) - (x.matchPct || 0))[0] : scans[0];
  rec.chosenOff = best.off;
  rec.ksHead = best.ksHead;
  rec.prefixByte = cipher.length > p.length ? '0x' + cipher.slice(0, cipher.length - p.length).toString('hex') : '(none)';
  if (!refKs) { refKs = best.ks; refOff = best.off; }
  out.samples.push(rec);
  console.log(`[${id}] ${dt}ms plain=${p.length} cipher=${cipher.length} delta=${rec.delta} hexOK=${rec.hexMatchesMd5} c=${r.c}`);
  console.log(`   data.len=${data.length} data.head=${data.slice(0, 48)}`);
  console.log(`   scans: ${rec.scans.map(s => `off${s.off}:${s.matchVsRef || '-'}`).join(' ')}`);
  console.log(`   chosenOff=${rec.chosenOff} ksHead=${rec.ksHead}`);
}

out.ksStable = out.samples.every(s => s.scans[s.chosenOff] && (!s.scans[s.chosenOff].matchVsRef || s.scans[s.chosenOff].matchPct === 100));
out.refOff = refOff;
out.refKsHex = refKs ? refKs.toString('hex') : null;
fs.writeFileSync(path.join(ROOT, 'artifacts/b_samples.json'), JSON.stringify(out, null, 1));
console.log('\nksStable:', out.ksStable, '| refOff:', refOff);
console.log('refKs(前32B):', refKs ? refKs.slice(0, 32).toString('hex') : null);
env.dispose();
process.exit(0);
