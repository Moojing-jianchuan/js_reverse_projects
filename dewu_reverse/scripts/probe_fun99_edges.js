/**
 * probe_fun99_edges.js —— 定参收尾：
 *  A) sks 参数（第 3 参）到底影响什么
 *  B) UA 是否参与选择密钥/分支
 *  C) 伪造/截断密文时 Fun99 的行为（= 判断是不是等长流式变换、有没有完整性校验）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const { createEnv } = require('../src/env_patch');

const SRC = fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8');
const respText = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8').trim();
const md5 = s => crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
const FF = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const CR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function mk(ua) {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
  if (ua) {
    Object.defineProperty(w.navigator, 'userAgent', { get: () => ua, configurable: true });
    Object.defineProperty(w.navigator, 'appVersion', { get: () => ua.replace('Mozilla/', ''), configurable: true });
  }
  env.evalSource(SRC, 'preinforce2.js');
  return { env, w };
}
function call(w, ...a) {
  try { return w.fun.Fun99(...a); } catch (e) { return 'THROW:' + e.message; }
}
function show(label, r) {
  let ok = 'non-JSON';
  try { const j = JSON.parse(r); ok = 'JSON ok code=' + j.code + ' list=' + (j.data && j.data.list ? j.data.list.length : 'n/a'); } catch (e) { }
  console.log('  ' + label.padEnd(40) + ' len=' + String(r).length + ' md5=' + md5(r) + '  ' + ok +
    '  head=' + JSON.stringify(String(r).slice(0, 60)));
  return r;
}

// ── A) sks 参数矩阵 ─────────────────────────────────────────────────────────
console.log('=== A) 第 3 参（真实调用点传响应头 sks）取值矩阵 ===');
{
  const { env, w } = mk(FF);
  for (const sks of ['1', '', '0', '2', '1,hdw4', 'hdw4', 'a,b,c', '1,1,1,1']) {
    show('sks=' + JSON.stringify(sks), call(w, respText, '', sks, ''));
  }
  console.log('  --- 第 2 / 4 / 5 参是否影响 ---');
  show('2nd=resp,4th="#h5"', call(w, respText, respText, '1', '#h5'));
  show('5th="1"', call(w, respText, '', '1', '', '1'));
  env.dispose();
}

// ── B) UA 分支 ─────────────────────────────────────────────────────────────
console.log('\n=== B) UA 分支（决定是否解出合法 JSON） ===');
{
  for (const [label, ua] of [['firefox', FF], ['chrome', CR], ['空 UA', '']]) {
    const { env, w } = mk(ua);
    show(label, call(w, respText, '', '1', ''));
    env.dispose();
  }
}

// ── C) 伪造 / 截断密文 ─────────────────────────────────────────────────────
console.log('\n=== C) 伪造/截断密文的行为 ===');
const realCipher = (() => {
  const b = Buffer.from(respText, 'base64');
  const s = b.toString('utf8');
  const o = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
})();
const wrap = (bytes) => Buffer.from(bytes.toString('latin1'), 'utf8').toString('base64');
{
  const { env, w } = mk(FF);
  console.log('  真实密文 cipher bytes =', realCipher.length, '| 明文 utf8 bytes = 14760（见 probe_resp_crypto）');

  show('全 0x00 × 16', call(w, wrap(Buffer.alloc(16)), '', '1', ''));
  show('全 0x00 × 256', call(w, wrap(Buffer.alloc(256)), '', '1', ''));
  show('随机 × 256', call(w, wrap(crypto.randomBytes(256)), '', '1', ''));
  const flip = Buffer.from(realCipher); flip[0] ^= 0xff;
  show('真实密文 首字节取反', call(w, wrap(flip), '', '1', ''));
  const mid = Buffer.from(realCipher); mid[Math.floor(mid.length / 2)] ^= 0x01;
  show('真实密文 中间字节翻转', call(w, wrap(mid), '', '1', ''));
  const trunc = realCipher.slice(0, Math.floor(realCipher.length / 2));
  show('真实密文 截断一半', call(w, wrap(trunc), '', '1', ''));
  const head = realCipher.slice(0, 64);
  show('真实密文 前 64 字节', call(w, wrap(head), '', '1', ''));
  const tailDrop = realCipher.slice(0, realCipher.length - 4);
  show('真实密文 去掉尾 4 字节', call(w, wrap(tailDrop), '', '1', ''));
  env.dispose();
}
