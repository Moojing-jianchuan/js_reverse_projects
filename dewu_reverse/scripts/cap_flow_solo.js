/**
 * 纯协议全链路 · 第 1-2 步：info 拿 485 的 sessionId → 用它发 captcha/call
 *
 * 依据（刚解开真实 call 明文得到）：
 *   call 的明文顶层是 6 个字段：sessionID,bcv,type,c,webp,data
 *   我们的旧模板漏了 sessionID → 服务端「请求失败」
 *   而 sessionID 来自 info 的 485 响应 data.sessionId
 *
 * 用法: node scripts/cap_flow_solo.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('../src/env_patch');
const { createCapProbe } = require('../src/dewu_cap_probe');
const { sign } = require('../src/dewu_sign');

const ROOT = path.resolve(__dirname, '..');
const SALT = '048a9c4943398714b356a696503d2d36';
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const randHex = n => crypto.randomBytes(n).toString('hex');
const randDje = () => { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < 32; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const SK = argOf('--sk') || 'YOUR_SK_HERE';
const SHUMEI = argOf('--shumei') || 'YOUR_SHUMEIID_HERE';
const ADI = argOf('--adi') || '0l3fG8GRVw2jhh7HWZ-JHAwr18HcOSGHJOw55Jw78iaMOWwqwkwqPCtMOewr7DvcOXw7vCmcO1w4fDmigA';
const LTK = argOf('--ltk') || 'GcKMwqfCo8OZKcKRw67ClsKYI8Kkwp/DksOUB8OmwpbCkMKnNjnCnn7DnMOnL8K8LA3Cv3TDminDg8ODw54fcsKeQWzCrcOxwqTChcO1wozDlcK7';
const SESSIONID_HDR = argOf('--sessionid') || 'yTtluHT1-zEsM-3xqr-4ZoT-i5B0HNfmzmi9cfxQ';
const HSN = argOf('--hsn') || '944821c9440f7599987dd159e0b6fe16';
const BCV = '1.3.1.20260331';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const URL_CALL = 'https://app.dewu.com/api/v1/h5/risk-stone-captcha/captcha/call';

const COOKIE = `sajssdk_2015_cross_new_user=1; sk=${SK}`;

async function getKs(minLen) {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk: SK, dwsm: SHUMEI } });
  const probe = createCapProbe(env, {});
  probe.installPreLoad();
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  probe.installPostLoad();
  await probe.call({ sessionId: 'A'.repeat(Math.max(2500, (minLen || 2000) + 800)) });
  const rep = probe.report();
  env.dispose();
  return rep.data.keystream;
}

(async () => {
  // ── 第 1 步：info（信封体）→ 485 拿 sessionId ──
  const enc = require('../src/pceptor_encrypt');
  await enc.calibrate({ sk: SK, shumeiid: SHUMEI, ua: UA });
  const params = { pickRuleId: 644479, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true };
  const p1 = { sign: sign(params), ...params };
  const built = enc.buildInfoEnvelope(JSON.stringify(p1));
  const dataField = typeof built === 'string' ? built : built.data;
  const infoBody = JSON.stringify({ data: dataField });
  console.log('[1] info 信封 d.len =', dataField.length);
  const infoHeaders = {
    'content-type': 'application/json', 'accept': '*/*', 'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.dewu.com', 'referer': 'https://www.dewu.com/', 'user-agent': UA,
    'hsn': HSN, 'adi': ADI, 'ltk': LTK, 'sessionid': SESSIONID_HDR,
    'shumeiid': SHUMEI, 'sk': SK, 'sks': '1,hdw4', 'skt': 'hdr1',
    'traceparent': `00-${randHex(16)}-${randHex(8)}-01`,
    'cookie': COOKIE,
  };
  const r1 = await fetch(URL_INFO, { method: 'POST', headers: infoHeaders, body: infoBody });
  const t1 = await r1.text();
  let j1 = null; try { j1 = JSON.parse(t1); } catch (e) { }
  console.log(`[1] info: status=${r1.status} code=${j1 && j1.code} msg=${j1 && j1.msg} len=${t1.length}`);
  const challengeSession = j1 && j1.data && j1.data.sessionId;
  if (!challengeSession) {
    console.log('    响应:', t1.slice(0, 200));
    if (r1.status === 200) {
      // 直接放行了：用 Fun99 解密看数据
      const { decryptInfoResponse } = require('../src/pceptor_decrypt');
      try {
        const out = await decryptInfoResponse(t1);
        const jj = typeof out === 'string' ? JSON.parse(out) : out;
        console.log('    ✅ info 直接 200，list =', (jj.data && jj.data.list || []).length);
      } catch (e) { console.log('    解密失败:', e.message.slice(0, 120)); }
    }
    return;
  }
  console.log('    ★ 挑战 sessionId:', challengeSession.slice(0, 40) + '…', '| len', challengeSession.length);

  // ── 第 2 步：用该 sessionId 发 call ──
  const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/call_plain_real.json'), 'utf8'));
  const inner = JSON.parse(real.data);
  inner.sk = SK; inner.shumeiId = SHUMEI; inner.dua = UA; inner.dje = randDje();
  if (inner.jcmp) inner.jcmp.dua = UA;
  const plainObj = { sessionID: challengeSession, bcv: real.bcv, type: real.type, c: real.c, webp: real.webp, data: JSON.stringify(inner) };
  const plain = JSON.stringify(plainObj);
  console.log('\n[2] call 明文长度:', plain.length);

  const ks = await getKs(plain.length);
  const p = Buffer.from(plain, 'utf8');
  const cipher = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) cipher[i] = p[i] ^ ks[i];
  const d = Buffer.from(cipher.toString('latin1'), 'utf8').toString('base64');
  const callSign = md5('d' + d + SALT);

  const callHeaders = {
    'content-type': 'application/json', 'accept': '*/*', 'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.dewu.com', 'referer': 'https://www.dewu.com/', 'user-agent': UA,
    'appid': 'h5', 'bcn': 'dewu', 'bcv': BCV, 'platform': 'h5', 'lang': 'zh',
    'shumeiid': SHUMEI, 'userid': '', 'sk': SK, 'SK': SK, 'skt': 'hdr1',
    'hsn': HSN, 'adi': ADI, 'ltk': LTK, 'sessionid': SESSIONID_HDR,
    'traceparent': `00-${randHex(16)}-${randHex(8)}-01`,
    'cookie': COOKIE,
  };
  const t0 = Date.now();
  const r2 = await fetch(URL_CALL, { method: 'POST', headers: callHeaders, body: JSON.stringify({ d, sign: callSign }) });
  const t2 = await r2.text();
  let j2 = null; try { j2 = JSON.parse(t2); } catch (e) { }
  console.log(`    status=${r2.status} ${Date.now() - t0}ms len=${t2.length}`);
  console.log('    code/msg:', j2 ? `${j2.code}/${j2.msg}` : '(非JSON)');
  if (j2 && j2.data) {
    console.log('    ★ bgList:', (j2.data.bgList || []).length, '张 | sessionId:', (j2.data.sessionId || '').slice(0, 30) + '…');
    fs.writeFileSync(path.join(ROOT, 'artifacts/cap_challenge.json'), JSON.stringify(j2, null, 1));
    console.log('    → artifacts/cap_challenge.json');
  } else { console.log('    响应:', t2.slice(0, 200)); }
})().catch(e => console.error('ERR', e));
