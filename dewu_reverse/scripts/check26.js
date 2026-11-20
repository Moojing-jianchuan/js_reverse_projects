/**
 * 楠岃瘉 26锛歴k 鐨?ZWSP 璇箟 鈥斺€?cookie/localStorage 閲屽甫 \u200b 鏃讹紝header sk 鍙栧摢涓€娈? * 鍚屾椂楠岃瘉 getSk() 涓庡惎鍔ㄦ湡 174861 鐨勫彇鍊煎彛寰? */
'use strict';
process.on('unhandledRejection', r => console.log('[unhandledRejection]', String((r && r.message) || r)));
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';

(async () => {
  for (const skCookie of ['PART0\u200bPART1', 'ONLYONE', 'A\u200bB\u200bC']) {
    const api = pceptor.load({ cookies: { sk: skCookie }, storage: { sk: skCookie } });
    await sleep(60);
    const dw = api.sandbox.dw;
    const getSk = (() => { try { return dw.getSk(); } catch (e) { return '<throw ' + e.message + '>'; } })();
    const seen = [];
    api.env.recorder.onSend = n => seen.push({ url: n.__url, headers: n.__reqHeaders.slice() });
    const xhr = api.newWrapperXHR();
    xhr.open('POST', URL_INFO, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send('{"a":1}');
    for (let i = 0; i < 40 && !seen.length; i++) await sleep(5);
    const h = {};
    if (seen[0]) for (const [k, v] of seen[0].headers) h[k.toLowerCase()] = v;
    console.log('\n[cookie sk]', JSON.stringify(skCookie));
    console.log('  storage sk  =', JSON.stringify(api.state().storage['sk']));
    console.log('  dw.getSk()  =', JSON.stringify(getSk));
    console.log('  header sk   =', JSON.stringify(h.sk));
    console.log('  header sks  =', JSON.stringify(h.sks));
    console.log('  header skt  =', JSON.stringify(h.skt));
  }
})();

