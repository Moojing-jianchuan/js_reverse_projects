/**
 * A-2：profile 五参分支的纯自旋点
 * 用法: node --cpu-prof --cpu-prof-dir=artifacts/prof2 scripts/a_hang_prof.js [ms]
 */
'use strict';
const { load } = require('../src/pceptor_loader');
const SK = 'YOUR_SK_HERE';
const SM = 'YOUR_SHUMEIID_HERE';
const PLAIN = '{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}';
const MS = Number(process.argv[2] || 3000);

(async () => {
  const api = load({ sk: SK, shumeiid: SM });
  const w = api.sandbox;
  await new Promise(r => setTimeout(r, 400));
  console.log('calling Fun110 5-arg (hangs, will exit after ' + MS + 'ms)');
  setTimeout(() => { console.log('exit'); process.exit(0); }, MS);
  w.fun.Fun110(PLAIN, 'post', '', false, { SK: SK, ShumeiId: SM });
  console.log('returned?!');
})();
