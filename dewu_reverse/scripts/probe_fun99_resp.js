/**
 * probe_fun99_resp.js —— 直接调 fun.Fun99 尝试解密真实 200 响应密文。
 *
 * 依据（来自 artifacts/unpacked/pceptor.000.eval.js 的两处真实调用点）：
 *   fetch 路： 3568 = window.fun.Fun99(bodyText, '', headers.get('sks'), '')
 *   XHR  路：  233299 = Fun99(req.response, '', req.headers.sks, '')
 * 即 Fun99(密文, '', sks响应头, '')
 *
 * 只做本地计算：不发网络请求。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { createEnv } = require('../src/env_patch');

const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';

const respText = fs.readFileSync(path.join(ROOT, 'artifacts/resp_125.bin'), 'utf8').trim();

function desc(r) {
  if (typeof r === 'string') return 'string(' + r.length + ') ' + JSON.stringify(r.slice(0, 160));
  if (r === undefined) return 'undefined';
  if (r === null) return 'null';
  if (typeof r === 'object') return 'object keys=' + JSON.stringify(Object.keys(r).slice(0, 12));
  return typeof r + ' ' + String(r).slice(0, 160);
}

function run(label, file, evalName) {
  console.log('\n########## ' + label + ' ##########');
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: DWSM } });
  const w = env.window;
  console.log('[seed] localStorage.sk =', String(w.localStorage.getItem('sk')).slice(0, 20) + '…',
    '| dwsm =', String(w.localStorage.getItem('dwsm')).slice(0, 20) + '…');
  try {
    env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/' + file), 'utf8'), file);
  } catch (e) {
    console.log('[load FAIL]', String(e && e.message).slice(0, 300));
    env.dispose();
    return;
  }
  const g = env.globals();
  console.log('[globals] added=', JSON.stringify(g.added), 'changed=', JSON.stringify(g.changed));
  const fun = w.fun;
  console.log('[fun] typeof =', typeof fun, '| proto =', fun ? JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(fun))) : 'n/a');

  if (fun && typeof fun.Fun99 === 'function') {
    const cases = [
      ["Fun99(resp,'','1','')", () => fun.Fun99(respText, '', '1', '')],
      ["Fun99(resp,'','','')", () => fun.Fun99(respText, '', '', '')],
      ["Fun99(resp,'','1,hdw4','')", () => fun.Fun99(respText, '', '1,hdw4', '')],
      ["Fun99('hello','','','')", () => fun.Fun99('hello', '', '', '')],
      ["Fun99('hello','','1','')", () => fun.Fun99('hello', '', '1', '')],
      ['Fun99({a:1},"","","")', () => fun.Fun99({ a: 1 }, '', '', '')],
    ];
    for (const [lab, fn] of cases) {
      try {
        const r = fn();
        console.log('\n>> ' + lab + '\n   -> ' + desc(r));
        if (typeof r === 'string' && /^[\[{]/.test(r.trim())) {
          console.log('   >>> LOOKS LIKE JSON:', r.slice(0, 400));
        }
      } catch (e) {
        console.log('\n>> ' + lab + '\n   THROW ' + String(e && e.message).slice(0, 200));
      }
    }
  }
  env.dispose();
}

run('preinforce2.js', 'preinforce2.js', 'preinforce2');
