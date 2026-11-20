/**
 * 绾崗璁繃鐮?路 绗?1 姝?v3锛氭敼鐢ㄣ€宑aptcha 閫氶亾銆嶇殑 keystream锛坧yuntu 鐨?dewuCap 娲剧敓锛? * 涓婁竴鐗堢敤 calibrateKeystream锛堥偅鏄?info 淇″皝鐨?Fun110 閫氶亾锛夆啋 鏈嶅姟绔洖銆岃姹傚け璐ャ€嶏紝璇存槑琛ㄧ敤閿欎簡
 * 鐢ㄦ硶: node scripts/cap_call_solo3.js [--sk <sk>] [--dwsm <dwsm>]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('../src/env_patch');
const { createCapProbe } = require('../src/dewu_cap_probe');
const loader = require('../src/preinforce_loader');

const ROOT = path.resolve(__dirname, '..');
const URL_CALL = 'https://app.dewu.com/api/v1/h5/risk-stone-captcha/captcha/call';
const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const SK = argOf('--sk') || 'YOUR_SK_HERE';
const DWSM = argOf('--dwsm') || 'YOUR_SHUMEIID_HERE';
// 娉ㄦ剰锛歨eader 閲岀殑 shumeiid 涓?cookie 閲岀殑 dwsm 鏄袱涓笉鍚岃澶囨爣璇嗭紙瀹炴祴涓嶅悓锛?const SHUMEI = argOf('--shumei') || 'YOUR_SHUMEIID_HERE';
const ADI = argOf('--adi') || '0l3fG8GRVw2jhh7HWZ-JHAwr18HcOSGHJOw55Jw78iaMOWwqwkwqPCtMOewr7DvcOXw7vCmcO1w4fDmigA';
const LTK = argOf('--ltk') || 'GcKMwqfCo8OZKcKRw67ClsKYI8Kkwp/DksOUB8OmwpbCkMKnNjnCnn7DnMOnL8K8LA3Cv3TDminDg8ODw54fcsKeQWzCrcOxwqTChcO1wozDlcK7';
const SESSIONID = argOf('--sessionid') || 'yTtluHT1-zEsM-3xqr-4ZoT-i5B0HNfmzmi9cfxQ';
const BCV = '1.3.1.20260331';
const HSN = argOf('--hsn') || '944821c9440f7599987dd159e0b6fe16';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const SALT = '048a9c4943398714b356a696503d2d36';

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const randHex = n => crypto.randomBytes(n).toString('hex');
const randDje = () => { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < 32; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

/** pyuntu 閫氶亾鐨?keystream锛氳窇涓€娆?dewuCap锛岀敤宸茬煡鏄庢枃鍙嶆帹 */
async function getCaptchaKs(minLen) {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: DWSM } });
  const probe = createCapProbe(env, {});
  probe.installPreLoad();
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  probe.installPostLoad();
  const pad = 'A'.repeat(Math.max(2000, minLen + 500));
  await probe.call({ sessionId: pad });
  const rep = probe.report();
  env.dispose();
  return rep.data.keystream;
}

(async () => {
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/cap_d_plaintext.json'), 'utf8'));
  const inner = JSON.parse(tpl.data);
  inner.sk = SK; inner.shumeiId = SHUMEI; inner.dua = UA; inner.dje = randDje();
  if (inner.jcmp) { inner.jcmp.dua = UA; inner.jcmp.dlocalSk = null; }
  const plainObj = { bcv: BCV, type: tpl.type, c: tpl.c, webp: tpl.webp, data: JSON.stringify(inner) };
  const plain = JSON.stringify(plainObj);
  console.log('鏄庢枃闀垮害:', plain.length, '| 瀛楁鏁?', Object.keys(inner).length);

  console.log('鏍囧畾 captcha 閫氶亾 keystream鈥?);
  const ks = await getCaptchaKs(plain.length);
  console.log('ks 闀垮害:', ks ? ks.length : 0, '| head:', ks ? Buffer.from(ks).slice(0, 8).toString('hex') : '-');
  if (!ks || ks.length < Buffer.byteLength(plain)) { console.log('ks 涓嶈冻'); return; }

  // 鎵嬪姩鍔犲瘑锛歝ipher = plain XOR ks 鈫?mojibake base64
  const p = Buffer.from(plain, 'utf8');
  const cipher = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) cipher[i] = p[i] ^ ks[i];
  const latin = cipher.toString('latin1');
  const d = Buffer.from(latin, 'utf8').toString('base64');
  const sign = md5('d' + d + SALT);
  console.log('d len:', d.length, '| sign:', sign);

  const headers = {
    'content-type': 'application/json', 'accept': '*/*', 'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.dewu.com', 'referer': 'https://www.dewu.com/', 'user-agent': UA,
    'appid': 'h5', 'bcn': 'dewu', 'bcv': BCV, 'platform': 'h5', 'lang': 'zh',
    'shumeiId': SHUMEI, 'userId': '', 'SK': SK, 'sk': SK, 'skt': 'hdr1', 'hsn': HSN, 'adi': ADI, 'ltk': LTK, 'sessionid': SESSIONID,
    // 浠ヤ笅涓夐」涓哄悓浼氳瘽鎶撳寘鎵€寰楋紙浼氳瘽绾э級锛屽厛澶嶇敤鐪嬫槸鍚﹁В闄ゃ€岃姹傚け璐ャ€?    'sessionid': 'YDws1wDl-SuNf-TsOO-cFir-cQcV58mCG183jMCs',
    'ltk': 'e8KMwqfDgMORPcKiw47Ds8KjTcKWwrPCn8OxXMOmwpbCkMKnNjnClHnDksOnL8K8LA3Cv3TDminDg8ODw54fcsKeQWzCrMKHw5DCjsO1wo7DnsOI',
    'traceparent': `00-${randHex(16)}-${randHex(8)}-01`,
    'cookie': `sajssdk_2015_cross_new_user=1; sk=${SK}`,
  };
  const t0 = Date.now();
  const r = await fetch(URL_CALL, { method: 'POST', headers, body: JSON.stringify({ d, sign }) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { }
  console.log(`\nstatus=${r.status} ${Date.now() - t0}ms len=${text.length}`);
  console.log('code/msg:', j ? `${j.code}/${j.msg}` : '(闈濲SON)');
  if (j && j.data) {
    console.log('data keys:', Object.keys(j.data).join(','));
    if (j.data.sessionId) console.log('鈽?sessionId:', j.data.sessionId);
    if (j.data.bgList) console.log('鈽?bgList:', j.data.bgList.length, '寮?);
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_call_resp.json'), JSON.stringify(j, null, 1));
    console.log('鈫?artifacts/cap_call_resp.json');
  } else { console.log('鍝嶅簲:', text.slice(0, 300)); }
})().catch(e => console.error('ERR', e));

