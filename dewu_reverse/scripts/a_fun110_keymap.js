/**
 * A-0：Fun110 五参（keyMap）分支行为与耗时探测
 * 用法: node scripts/a_fun110_keymap.js [comboIndex]
 *   不带参数 → 依次跑 combo 0..4，每次前先打印，便于定位卡在哪一条
 * 目的：确认 (payload, method, '', useQuery?, keyMap) 哪一组能返回 data 信封，以及耗时量级
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { load } = require('../src/pceptor_loader');
const md5 = s => require('crypto').createHash('md5').update(s, 'utf8').digest('hex');

const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const PLAIN = JSON.stringify({
  sign: md5('pickRuleId=644479&pageNum=1&pageSize=24&filterUnbid=true&showCspu=true' + '048a9c4943398714b356a696503d2d36'),
  pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true
});

const comboIdx = process.argv[2] === undefined ? null : Number(process.argv[2]);

(async () => {
  const api = load({ sk: SK, shumeiid: SM });
  const w = api.sandbox;
  await new Promise(r => setTimeout(r, 400));

  const fun = w.fun;
  if (!fun) { console.log('NO FUN'); process.exit(1); }

  // 观测：JSON.stringify / base64js.fromByteArray
  const obs = [];
  const oStr = w.JSON.stringify.bind(w.JSON);
  w.JSON.stringify = function (v, r, s) {
    const out = oStr(v, r, s);
    if (typeof out === 'string') obs.push(['JSON.stringify', out.length, out.slice(0, 120)]);
    return out;
  };
  const oFB = w.base64js.fromByteArray;
  w.base64js.fromByteArray = function (bytes) {
    const out = oFB.apply(this, arguments);
    let hex = '';
    try { hex = Array.from(bytes).slice(0, 48).map(b => (b & 0xff).toString(16).padStart(2, '0')).join(''); } catch (e) { }
    obs.push(['fromByteArray', bytes && bytes.length, hex, out.length]);
    return out;
  };

  const keyMap = { SK: SK, Sk: SK, sk: SK, ShumeiId: SM, shumeiId: SM, shumeiid: SM };
  const combos = [
    ['plain,post,"",false,(no map)', () => fun.Fun110(PLAIN, 'post', '', false)],
    ['plain,post,"",true ,(no map)', () => fun.Fun110(PLAIN, 'post', '', true)],
    ['plain,post,"",false,{SK..}', () => fun.Fun110(PLAIN, 'post', '', false, keyMap)],
    ['plain,post,"",true ,{SK..}', () => fun.Fun110(PLAIN, 'post', '', true, keyMap)],
    ['""   ,post,"",false,{SK..}', () => fun.Fun110('', 'post', '', false, { SK: SK, ShumeiId: SM })],
  ];

  const list = comboIdx === null ? combos.map((_, i) => i) : [comboIdx];
  for (const i of list) {
    const [name, fn] = combos[i];
    process.stdout.write(`\n[combo ${i}] ${name}\n  calling...`);
    const t0 = Date.now();
    let out, err = null;
    try { out = fn(); } catch (e) { err = String(e && e.message || e).slice(0, 200); }
    const dt = Date.now() - t0;
    console.log(` ${dt} ms`);
    if (err) { console.log('  THROW:', err); continue; }
    const s = JSON.stringify(out);
    console.log('  keys:', out && Object.keys(out), '| c:', out && out.c);
    const d = out && out.d;
    if (typeof d === 'string') {
      console.log('  d.len:', d.length, '| d.head:', d.slice(0, 120));
      try {
        const j = JSON.parse(d);
        if (j && typeof j.data === 'string') {
          const data = j.data;
          console.log('  ENVELOPE! data.len:', data.length, '| hex32:', data.slice(0, 32), '| ==md5(plain):', data.slice(0, 32) === md5(PLAIN));
          console.log('  data[32..]:', data.slice(32, 120));
        } else if (typeof j.data === 'string') {
          console.log('  data(no hex32 match):', j.data.slice(0, 80));
        }
      } catch (e) { }
    }
    if (obs.length) { console.log('  obs:', JSON.stringify(obs.slice(-30), null, 0).slice(0, 2600)); obs.length = 0; }
  }
  process.exit(0);
})();
