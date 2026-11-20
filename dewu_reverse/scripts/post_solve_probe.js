/**
 * 过码成功后的「一次跑完」探针（由 auto_captcha.py 调用）
 *   1) 解密页面那次 info 200 的响应，确认它到底能不能解、解出多少条
 *   2) 用同一枚 sk 本地连发 pageNum=2/3，测「一次放行能用几次」
 * 用法: node scripts/post_solve_probe.js <ctx.json>
 *   ctx = { sk, shumeiid, ua, headers:{...}, infoBody200, cookie }
 */
const fs = require('fs');
const path = require('path');
const { sign } = require('../src/dewu_sign');
const enc = require('../src/pceptor_encrypt');

const ROOT = path.resolve(__dirname, '..');
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const UA_DEFAULT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

(async () => {
  const ctx = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const ua = ctx.ua || UA_DEFAULT;
  console.log(`[ctx] sk=${(ctx.sk || '').slice(0, 16)}… shumeiid=${(ctx.shumeiid || '').slice(0, 20)}… hasInfoBody=${!!ctx.infoBody200}`);

  // ── ① 解密页面那次 200 响应 ──
  if (ctx.infoBody200) {
    const { decryptInfoResponse } = require('../src/pceptor_decrypt');
    try {
      const out = await decryptInfoResponse(ctx.infoBody200);
      const j = typeof out === 'string' ? JSON.parse(out) : out;
      const list = (j.data && j.data.list) || [];
      console.log(`[decrypt] ✅ code=${j.code} total=${j.data && j.data.total} list=${list.length}`);
      if (list[0]) console.log(`[decrypt]    第一条: ${String(list[0].title || '').slice(0, 40)} | spuId=${list[0].spuId}`);
      if (ctx.sksLength) console.log(`[decrypt]    响应头 sks-length=${ctx.sksLength}（供对照明文长度）`);
      fs.writeFileSync(path.join(ROOT, 'artifacts/info_decrypted_from_page.json'), JSON.stringify(j, null, 1));
      console.log('[decrypt]    → artifacts/info_decrypted_from_page.json');
    } catch (e) {
      console.log(`[decrypt] ❌ 失败: ${String(e.message).slice(0, 200)}`);
      fs.writeFileSync(path.join(ROOT, 'artifacts/info_body_failed.txt'), String(ctx.infoBody200).slice(0, 5000));
    }
  } else {
    console.log('[decrypt] 跳过（没抓到 200 的响应体）');
  }

  // ── ② 额度模型：同 sk 连续本地请求 ──
  const base = ctx.headers || {};
  const mk = () => ({
    'content-type': 'application/json',
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.dewu.com',
    'referer': 'https://www.dewu.com/',
    'user-agent': ua,
    'appid': 'h5', 'bcn': 'dewu', 'bcv': base.bcv || '1.3.1.20260331',
    'platform': 'h5', 'lang': 'zh',
    'shumeiid': ctx.shumeiid || base.shumeiid,
    'sk': ctx.sk, 'SK': ctx.sk, 'sks': '1,hdw4', 'skt': 'hdr1',
    'userid': base.userid || '',
    'hsn': base.hsn || '', 'adi': base.adi || '', 'ltk': base.ltk || '',
    'sessionid': base.sessionid || '',
    'cookie': `sajssdk_2015_cross_new_user=1; sk=${ctx.sk}`,
  });

  console.log('\n[calibrate] 标定 info 信封 keystream…');
  try {
    await enc.calibrate({ sk: ctx.sk, shumeiid: ctx.shumeiid, ua });
  } catch (e) {
    console.log('[calibrate] ❌', String(e.message).slice(0, 160));
    return;
  }

  const results = [];
  for (const pageNum of [2, 3, 4]) {
    const params = { pickRuleId: 644479, pageNum, pageSize: 24, filterUnbid: true, showCspu: true };
    const p = { sign: sign(params), ...params };
    const b = enc.buildInfoEnvelope(JSON.stringify(p));
    const data = typeof b === 'string' ? b : b.data;
    const t0 = Date.now();
    let status = 0, out = null, msg = '';
    try {
      const r = await fetch(URL_INFO, { method: 'POST', headers: mk(), body: JSON.stringify({ data }) });
      status = r.status;
      const text = await r.text();
      try { out = JSON.parse(text); msg = `${out.code}/${out.msg}`; } catch (e) { msg = text.slice(0, 60); }
      if (status === 200 && out) {
        const { decryptInfoResponse } = require('../src/pceptor_decrypt');
        try {
          const d = await decryptInfoResponse(text);
          const jj = typeof d === 'string' ? JSON.parse(d) : d;
          msg += ` | list=${(jj.data && jj.data.list || []).length}`;
        } catch (e) { msg += ' | 解密失败'; }
      }
    } catch (e) {
      msg = 'transport: ' + String(e.message).slice(0, 60);
    }
    console.log(`[probe] page${pageNum}: status=${status} ${Date.now() - t0}ms ${msg}`);
    results.push({ pageNum, status, msg });
    if (status !== 200) break;
    await new Promise(r => setTimeout(r, 600));
  }

  const summary = {
    at: new Date().toISOString(),
    sk: (ctx.sk || '').slice(0, 20) + '…',
    results,
    verdict: results.length && results[0].status === 200
      ? '一次放行可继续本地取数（时间窗模型）'
      : '第一次本地请求就被拒（次数模型 / 额度已被页面消费）',
  };
  fs.writeFileSync(path.join(ROOT, 'artifacts/quota_probe.json'), JSON.stringify(summary, null, 1));
  console.log(`\n[verdict] ${summary.verdict}`);
  console.log('[verdict] → artifacts/quota_probe.json');
})().catch(e => console.error('ERR', e));
