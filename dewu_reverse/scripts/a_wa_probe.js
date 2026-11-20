/**
 * A-5：查 CryptoJS 词阵列（WordArray）为何 sigBytes 变成天文数字
 * 打点：Latin1.parse 的返回、WordArray.init 的入参/出参、concat 的入参
 * 用法: node scripts/a_wa_probe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'artifacts/unpacked/preinforce2.000.eval.js');
const PYUNTU = path.join(ROOT, 'artifacts/unpacked/pyuntu.000.eval.js');
const OUT = path.join(ROOT, 'artifacts/instrumented/preinforce2.wa.js');
const P = '\uFC5E';

let src = fs.readFileSync(SRC, 'utf8');
const log = (tag, expr) => `try{(globalThis.__wa=globalThis.__wa||[]).push("${tag} "+${expr});}catch(__e){}`;

/* 1) Latin1.parse: return new WordArray.init(words, len) */
const t1 = `return new ${P}119119 .init(${P}227576,${P}129415);`;
const r1 = `{var __r=new ${P}119119 .init(${P}227576,${P}129415);${log('L1parse', `"len="+${P}129415+"/"+(typeof ${P}129415)+" wlen="+(${P}227576&&${P}227576.length)+" rsb="+__r.sigBytes+" rwl="+__r.words.length`)}return __r;}`;

/* 2) WordArray.init 本体（在 Hasher 之前定义的那个）*/
const t2 = null; // 由下面的定位决定

/* 3) concat 入口 */
const t3 = `concat:function (${P}22102){`;
const r3 = `concat:function (${P}22102){${log('concat', `"thisSB="+this.sigBytes+" thatSB="+(${P}22102&&${P}22102.sigBytes)+" thatWL="+(${P}22102&&${P}22102.words&&${P}22102.words.length)`)}`;

/* 4) MD5._doFinalize 入口 */
const t4 = `_doFinalize:function (){`;
const r4 = `_doFinalize:function (){${log('fin', `"nDataBytes="+this._nDataBytes+"/"+(typeof this._nDataBytes)+" dataSB="+this._data.sigBytes+" wlen="+this._data.words.length`)}`;

/* 5) _doFinalize 里调用 _process() 之前 */
const t5 = `this ._process()`;
const r5 = `((globalThis.__wa=globalThis.__wa||[]).push("preProcess dataSB="+this._data.sigBytes+" wlen="+this._data.words.length),this ._process())`;

let n = 0;
for (const [t, r] of [[t1, r1], [t3, r3], [t4, r4], [t5, r5]]) {
  if (t && src.includes(t)) { src = src.replace(t, r); n++; console.log('injected:', t.slice(0, 40)); }
  else console.log('MISS:', t && t.slice(0, 40));
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, src);

const resolveScript = (url) => {
  const u = String(url);
  if (/preinforce/i.test(u)) return fs.readFileSync(OUT, 'utf8');
  if (/pyuntu/i.test(u)) return fs.readFileSync(PYUNTU, 'utf8');
  return null;
};

(async () => {
  const { load } = require('../src/pceptor_loader');
  const api = load({
    sk: 'YOUR_SK_HERE',
    shumeiid: 'YOUR_SHUMEIID_HERE',
    resolveScript,
  });
  const w = api.sandbox, ctx = api.sdk.ctx;
  await new Promise(r => setTimeout(r, 500));
  console.log('fun?', !!(w.fun && w.fun.Fun110));
  w.__PLAIN = '{"a":1}';
  w.__MAP = { SK: 'YOUR_SK_HERE' };
  try {
    vm.runInContext(`window.__out = fun.Fun110(window.__PLAIN,'post','',false,window.__MAP)`, ctx, { timeout: 4000 });
    console.log('returned');
  } catch (e) { console.log('THROW:', String(e.message).slice(0, 80)); }
  const wa = w.__wa || [];
  console.log('__wa(' + wa.length + '):');
  for (const l of wa.slice(0, 25)) console.log('  ', l);
  process.exit(0);
})();
