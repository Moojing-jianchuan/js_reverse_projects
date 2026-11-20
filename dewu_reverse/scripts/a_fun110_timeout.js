/**
 * A-1：在 vm 内带 timeout 调用 Fun110 五参分支，定位卡点
 * 用法: node scripts/a_fun110_timeout.js [timeoutMs] [useQuery:0|1]
 * 手法：vm.runInContext(..., {timeout}) 能打断同步死循环；配合 hook 观察"走到哪一步"
 */
'use strict';
const vm = require('vm');
const { load } = require('../src/pceptor_loader');

const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';
const TIMEOUT = Number(process.argv[2] || 2000);
const USEQ = process.argv[3] === '1';

(async () => {
  const api = load({ sk: SK, shumeiid: SM });
  const { sandbox: w } = api;
  const ctx = api.sdk.ctx;
  await new Promise(r => setTimeout(r, 400));

  // 内部 console 全部留存
  const logs = [];
  for (const k of ['log', 'warn', 'error', 'info']) {
    const o = w.console[k];
    w.console[k] = function (...a) { logs.push([k, a.map(x => { try { return String(x).slice(0, 160); } catch (e) { return '?'; } }).join(' ')]); return o.apply(this, a); };
  }
  // 进度标记
  const marks = [];
  const oFB = w.base64js.fromByteArray;
  w.base64js.fromByteArray = function (b) { let h = ''; try { h = Array.from(b).slice(0, 24).map(x => (x & 0xff).toString(16).padStart(2, '0')).join(''); } catch (e) { } marks.push(['fromByteArray', b && b.length, h]); return oFB.apply(this, arguments); };
  const oTB = w.base64js.toByteArray;
  w.base64js.toByteArray = function (s) { marks.push(['toByteArray', String(s).length, String(s).slice(0, 40)]); return oTB.apply(this, arguments); };
  const oParse = w.JSON.parse;
  w.JSON.parse = function (s) { marks.push(['JSON.parse', String(s).length, String(s).slice(0, 60)]); return oParse.apply(this, arguments); };
  const oStringify = w.JSON.stringify;
  w.JSON.stringify = function (v) { const out = oStringify.apply(this, arguments); if (typeof out === 'string' && out.length > 100) marks.push(['JSON.stringify', out.length, out.slice(0, 90)]); return out; };

  // 深一层：42471 = 重复键 XOR（String.fromCharCode 每字节一次）；charCodeAt 计数
  let fcc = 0, cca = 0, rexec = 0;
  const oFCC = w.String.fromCharCode;
  w.String.fromCharCode = function () { fcc++; return oFCC.apply(this, arguments); };
  const oCCA = w.String.prototype.charCodeAt;
  w.String.prototype.charCodeAt = function () { cca++; return oCCA.apply(this, arguments); };
  const oExec = w.RegExp.prototype.exec;
  w.RegExp.prototype.exec = function () { rexec++; return oExec.apply(this, arguments); };
  const counter = () => ({ fcc, cca, rexec });

  w.__PLAIN = PLAIN;
  w.__MAP = { SK: SK, Sk: SK, sk: SK, ShumeiId: SM, shumeiId: SM, shumeiid: SM };
  const code = `(function(){ try { window.__out = fun.Fun110(window.__PLAIN,'post','',${USEQ},window.__MAP); return 'OK'; } catch(e) { return 'THROW:'+ (e && e.message); } })()`;

  let r, err = null;
  const t0 = Date.now();
  try { r = vm.runInContext(code, ctx, { timeout: TIMEOUT }); }
  catch (e) { err = String(e && e.message).slice(0, 120); console.log('STACK:\n' + String(e && e.stack).slice(0, 1500)); }
  const dt = Date.now() - t0;
  console.log(`timeout=${TIMEOUT} useQuery=${USEQ} -> ${dt}ms  ret=${err ? 'ERR:' + err : r}`);

  console.log('marks:', JSON.stringify(marks, null, 0).slice(0, 2000));
  console.log('counters:', JSON.stringify(counter()));
  console.log('logs :', JSON.stringify(logs.slice(0, 40), null, 0).slice(0, 1200));
  try {
    const out = w.__out;
    if (out) {
      console.log('out keys:', Object.keys(out), '| c:', out.c);
      console.log('a.len', out.a && out.a.length, 'b.len', out.b && out.b.length, 'd.len', out.d && String(out.d).length, 'e.len', out.e && out.e.length);
      console.log('d.head:', String(out.d).slice(0, 140));
    }
  } catch (e) { }
  process.exit(0);
})();
