/**
 * A-4：给 preinforce2 的 245 个扁平化状态机循环装步数计数器，
 *      跑 Fun110 五参，定位自旋的循环；并对目标循环记录状态与关键变量。
 * 产出：artifacts/instrumented/preinforce2.spin.js
 * 用法: node scripts/a_spin_trace.js [LIMIT] [TRACE_OFFSET]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js');
const PYUNTU = path.join(ROOT, 'artifacts/unpacked/pyuntu.000.eval.js');
const OUT = path.join(ROOT, 'artifacts/instrumented/preinforce2.spin.js');
const LIMIT = Number(process.argv[2] || 300000);
const TRACE_OFF = Number(process.argv[3] || -1);
const P = '\uFC5E';

const { load } = require('../src/pceptor_loader');
const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';

/* ---- 1. 装计数器 ---- */
const src = fs.readFileSync(SRC, 'utf8');
const re = /for\(var\s+(\uFC5E?\d+)\s*=\s*(\uFC5E?197302\s*\|\|\s*\uFC5E?33319\[[^\]]+\])\s*;;\s*\)\{/g;
let n = 0;
const out = src.replace(re, (m, name, init, off) => {
  n++;
  const trace = (Number(off) === TRACE_OFF)
    ? `try{var __tr=globalThis.__tr||(globalThis.__tr=[]);if(__tr.length===0){__tr.push("STACK:"+String(new Error().stack).replace(/\\n/g," <- ").slice(0,900));}` +
      `if(__tr.length<200)__tr.push(` +
      `"st="+${name}+" sbT="+(typeof ${P}189517)+" sb="+${P}189517+" dataT="+(typeof ${P}91356)+" wlen="+(${P}91356&&${P}91356.words&&${P}91356.words.length)+" nBytes="+${P}123695);}catch(__e2){}`
    : '';
  return `for(var ${name}=${init},__n=0;;){${trace}` +
    `if(__n++>${LIMIT}){try{(globalThis.__spins=globalThis.__spins||[]).push(${off});}catch(__e){}throw new Error('SPIN');}`;
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// 额外：记录 Hasher._append 收到的原始 message（类型 / sigBytes / 长度 / 头 60 字符）
const MSG = `_append:function (${P}57873){`;
const LOG = `_append:function (${P}57873){try{(globalThis.__ap=globalThis.__ap||[]).push(typeof ${P}57873+"|sb="+(${P}57873&&${P}57873.sigBytes)+"|len="+String(${P}57873).length+"|hd="+String(${P}57873).slice(0,60));}catch(__e3){}`;
let out2 = out;
if (out.includes(MSG)) {
  out2 = out.replace(MSG, LOG);
  console.log('# _append trace injected');
} else {
  console.log('# !! _append trace target not found');
}
fs.writeFileSync(OUT, out2);
console.log(`instrumented ${n} loops -> ${OUT} (${out.length} B) traceOff=${TRACE_OFF}`);

/* ---- 2. 加载（用装过的 preinforce2） ---- */
const resolveScript = (url) => {
  const u = String(url);
  if (/preinforce/i.test(u)) return fs.readFileSync(OUT, 'utf8');
  if (/pyuntu/i.test(u)) return fs.readFileSync(PYUNTU, 'utf8');
  return null;
};

(async () => {
  const api = load({ sk: SK, shumeiid: SM, resolveScript });
  const w = api.sandbox;
  const ctx = api.sdk.ctx;
  await new Promise(r => setTimeout(r, 500));
  console.log('fun?', !!(w.fun && w.fun.Fun110));
  w.__PLAIN = PLAIN;
  w.__MAP = { SK: SK, ShumeiId: SM };
  const t0 = Date.now();
  try {
    vm.runInContext(`window.__out = fun.Fun110(window.__PLAIN,'post','',false,window.__MAP)`, ctx, { timeout: 60000 });
    console.log('returned after', Date.now() - t0, 'ms');
  } catch (e) {
    console.log('THROW after', Date.now() - t0, 'ms:', String(e.message).slice(0, 120));
  }
  console.log('spins:', JSON.stringify(w.__spins || []));
  const tr = w.__tr || [];
  console.log('trace(' + tr.length + '):');
  for (const line of tr.slice(0, 24)) console.log('  ', line);
  const ap = w.__ap || [];
  console.log('_append calls(' + ap.length + '):');
  for (const line of ap.slice(0, 12)) console.log('  ', line);
  try { const o = w.__out; if (o) console.log('out.c:', o.c, '| d.head:', String(o.d).slice(0, 80)); } catch (e) { }
  process.exit(0);
})();
