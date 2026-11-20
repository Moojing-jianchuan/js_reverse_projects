/**
 * B-5：实证“多出来的 1 字节”是什么
 * 手法：在 jsdom 里把 Fun110 依赖的若干 window/screen 属性逐个置为 falsy（0 / '' / []），
 *       看 data 长度与密文对齐方式如何变化 —— 直接判定标记串是前置还是后置、由哪些属性构成。
 * 用法: node scripts/b_marker_probe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('../src/env_patch');
const ROOT = path.resolve(__dirname, '..');
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';

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
const p = Buffer.from(PLAIN, 'utf8');

const variants = [
  ['baseline', () => { }],
  ['outerWidth=0', () => { try { Object.defineProperty(w, 'outerWidth', { value: 0, configurable: true, writable: true }); } catch (e) { } }],
  ['screen.width=0', () => { try { Object.defineProperty(w.screen, 'width', { value: 0, configurable: true }); } catch (e) { } }],
  ['innerHeight=0', () => { try { Object.defineProperty(w, 'innerHeight', { value: 0, configurable: true, writable: true }); } catch (e) { } }],
  ['languages=[]', () => { try { Object.defineProperty(w.navigator, 'languages', { value: [], configurable: true }); } catch (e) { } }],
  ['outerWidth=0+screenH=0', () => {
    try { Object.defineProperty(w, 'outerWidth', { value: 0, configurable: true, writable: true }); } catch (e) { }
    try { Object.defineProperty(w.screen, 'height', { value: 0, configurable: true }); } catch (e) { }
  }],
];

let baseKs = null;
for (const [label, mutate] of variants) {
  mutate();
  let data = null;
  try {
    const r = F110.call(fun, PLAIN, 'post', '', false, keyMap);
    data = JSON.parse(r.d).data;
  } catch (e) { console.log(label, 'THROW', String(e.message).slice(0, 80)); continue; }
  const cipher = realBytes(data.slice(32));
  const hex = data.slice(0, 32);
  const x = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) x[i] = cipher[i] ^ (i < p.length ? p[i] : 0);
  if (!baseKs) baseKs = Buffer.from(x);
  let same = 0;
  for (let i = 0; i < Math.min(x.length, baseKs.length); i++) if (x[i] === baseKs[i]) same++;
  console.log(`[${label}] data.len=${data.length} cipherLen=${cipher.length} hexOK=${hex === md5(PLAIN)} b64head=${data.slice(32, 60)}`);
  console.log(`    XOR-plain head hex: ${x.slice(0, 12).toString('hex')} | 与 baseline 前段一致 ${same}/${Math.min(x.length, baseKs.length)}`);
}
env.dispose();
process.exit(0);
