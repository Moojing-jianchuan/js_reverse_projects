/**
 * sk_bootstrap.js —— /webSk 签发链路的本地自举工具（**不发任何请求**）
 * ==================================================================
 * 两种模式：
 *
 *   1) 抓请求（默认）：在沙箱里触发 window.dw.init()，把 SDK 真正会发的
 *      POST https://dav.dewu.com/webSk 报文打印出来（含 curl 模板）。
 *      → node src/sk_bootstrap.js
 *
 *   2) 解响应：把已经抓到的 /webSk 响应（hex 文本）喂回沙箱的 fetch，
 *      让 SDK 自己走 120167() 的 AES-CBC 解密 + 落盘逻辑，然后打印
 *      sk / dwsm / ak。
 *      → node src/sk_bootstrap.js --response artifacts/webSk_response.hex
 *
 * 为什么必须让 SDK 自己解：响应是 hex 文本 + AES-CBC(sm/ua 派生 key)，
 * 手写解密要先复现 18233() 的密钥派生；喂回 SDK 则完全免推导。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const pceptor = require('./pceptor_loader');

const ROOT = path.resolve(__dirname, '..');
const arg = process.argv.slice(2);
const respIdx = arg.indexOf('--response');
const respFile = respIdx >= 0 ? arg[respIdx + 1] : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fmtHeaders(h) {
  if (!h) return {};
  const o = {};
  if (h._m && typeof h._m.forEach === 'function') h._m.forEach((v, k) => { o[k] = v; });
  else if (typeof h.forEach === 'function') h.forEach((v, k) => { o[k] = v; });
  else Object.assign(o, h);
  return o;
}

(async () => {
  const opts = { sk: process.env.SK || '', shumeiid: process.env.DWSM || '' };

  /* 拿到响应时：把响应喂给 SDK 的 fetch，让它自己解密 + 落盘 */
  if (respFile) {
    const hex = fs.readFileSync(path.resolve(respFile), 'utf8').trim();
    opts.fetchImpl = (url) => {
      if (!/\/webSk$/.test(url)) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}), headers: { get: () => null } });
      }
      return Promise.resolve({
        ok: true, status: 200, url,
        text: () => Promise.resolve(hex),
        json: () => Promise.resolve(JSON.parse(hex)),
        headers: { get: () => null },
      });
    };
    const api = pceptor.load(opts);
    await sleep(150);
    const dw = api.sandbox.dw;
    try { dw.init({}); } catch (e) { console.log('[init throw]', String(e.message)); }
    await sleep(600);
    const st = api.state();
    console.log('=== /webSk 响应解包结果（由 SDK 自己解） ===');
    console.log('  sk        =', st.storage.sk || '(未写入)');
    console.log('  dwsm      =', st.storage.dwsm || '(未写入)');
    console.log('  sessionStorage.ak =', st.storage.ak || '(sessionStorage 未镜像到 state，见 sandbox.sessionStorage)');
    console.log('  cookie    =', st.cookie);
    console.log('  内存态 88125 (sk) =', (() => { try { return api.sandbox.dw.getSk(); } catch (e) { return '<throw>'; } })());
    if (!st.storage.sk) {
      console.log('\n[提示] 没有写入 sk：要么响应不是该会话的密文（key 由 sm/UA 派生，换机即失效），');
      console.log('       要么解密抛错被 SDK 吞掉。可打开 api.env.consoleLog / api.sdk.loadError 进一步看。');
    }
    process.exit(0);
  }

  /* 默认：抓请求 */
  const api = pceptor.load(opts);
  await sleep(150);
  const dw = api.sandbox.dw;
  if (!dw || typeof dw.init !== 'function') {
    console.error('[fatal] window.dw.init 不可用，SDK 未正确加载');
    process.exit(2);
  }
  try { dw.init({}); } catch (e) { console.log('[init throw]', String(e.message)); }
  await sleep(400);

  const calls = api.env.recorder.fetchCalls;
  const webSk = calls.filter(c => /\/webSk$/.test(c.url));
  console.log('=== SDK 在沙箱里发出的 fetch 调用 ===');
  for (const c of calls) console.log('  ', c.method, c.url, '| body:', String(c.body).slice(0, 120));

  if (!webSk.length) {
    console.error('\n[!] 没有捕获到 /webSk。检查 artifacts/unpacked/pceptor.000.eval.js 是否存在，或 dw.init 是否抛错。');
    process.exit(3);
  }
  const c = webSk[webSk.length - 1];
  const headers = fmtHeaders(c.headers);
  const body = typeof c.body === 'string' ? c.body : JSON.stringify(c.body);

  console.log('\n=== 要发的请求（照此在干净会话里发一次即可拿到 sk）===');
  console.log('  POST https://dav.dewu.com/webSk');
  console.log('  credentials: include   (必须带上会话 cookie)');
  for (const [k, v] of Object.entries(headers)) console.log(`  ${k}: ${v}`);
  console.log('  body:', body);

  console.log('\n=== curl 模板（把 <COOKIE> 换成干净会话的 cookie 串）===');
  const hdrArgs = Object.entries(headers).map(([k, v]) => `-H '${k}: ${v}'`).join(' ');
  console.log(`curl 'https://dav.dewu.com/webSk' -X POST ${hdrArgs} -H 'Cookie: <COOKIE>' --data-raw '${body}'`);
  console.log('\n注意：目前沙箱里的 body 只有 sign（指纹载荷 95950 为空对象）；');
  console.log('      真机 body 会带上完整指纹字段，sign 也随之不同，所以上面的 body 不能直接当"有效请求"用。');
  console.log('\n下一步：把响应（hex 文本）存成文件后执行');
  console.log('  node src/sk_bootstrap.js --response <file>');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
