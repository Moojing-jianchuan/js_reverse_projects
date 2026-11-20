/**
 * 纯协议过码 · 第 1 步：发 captcha/call 拿挑战
 * 需要：新鲜 sk（会话凭据）、call 的 d（captcha keystream 加密）
 * 用法: node scripts/cap_call_solo.js [--sk <sk>]
 */
const fs = require('fs');
const path = require('path');
const loader = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const URL_CALL = 'https://app.dewu.com/api/v1/h5/risk-stone-captcha/captcha/call';

const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const SK = argOf('--sk') || 'YOUR_SK_HERE';
const DWSM = argOf('--dwsm') || 'YOUR_SHUMEIID_HERE';
const BCV = '1.3.1.20260331';

(async () => {
  // call 的明文模板（bcv/type/c/webp/data），data 里的 sk/shumeiId 自动带入
  const tpl = loader.callPlainTemplate({ sk: SK, shumeiId: DWSM, bcv: BCV });
  const plain = typeof tpl === 'string' ? tpl : JSON.stringify(tpl);
  console.log('call 明文:', plain.slice(0, 260) + '…', '| len', plain.length);

  const ks = await loader.calibrateKeystream(SK);
  const d = loader.buildD(JSON.parse(plain), ks);
  const dStr = typeof d === 'string' ? d : d.d;
  const sign = loader.signD(dStr);
  console.log('d len:', dStr.length, '| sign:', sign, '| 自校验:', loader.signD(dStr) === sign);

  const headers = {
    'content-type': 'application/json',
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.dewu.com',
    'referer': 'https://www.dewu.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    'appid': 'h5', 'bcn': 'dewu', 'bcv': BCV, 'platform': 'h5', 'lang': 'zh',
    'shumeiId': DWSM, 'userId': '', 'SK': SK, 'skt': 'hdr1',
    'cookie': `sajssdk_2015_cross_new_user=1; sk=${SK}`,
  };

  const t0 = Date.now();
  const r = await fetch(URL_CALL, { method: 'POST', headers, body: JSON.stringify({ d: dStr, sign }) });
  const text = await r.text();
  console.log(`\nstatus=${r.status} ${Date.now() - t0}ms len=${text.length}`);
  let j = null; try { j = JSON.parse(text); } catch (e) { }
  console.log('code/msg:', j ? `${j.code}/${j.msg}` : '(非JSON)');
  if (j && j.data) {
    console.log('data keys:', Object.keys(j.data).join(','));
    if (j.data.sessionId) console.log('★ sessionId:', j.data.sessionId);
    if (j.data.bgList) console.log('★ bgList:', j.data.bgList.length, '张');
    const dump = JSON.stringify(j, null, 1);
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_call_resp.json'), dump);
    console.log('→ 已存 artifacts/cap_call_resp.json');
    console.log('head:', dump.slice(0, 500));
  } else {
    console.log('响应:', text.slice(0, 300));
  }
})().catch(e => console.error('ERR', e));
