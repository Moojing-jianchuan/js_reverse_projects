/**
 * test_verify_builder.js —— cap_verify_builder 的逐字对拍 + 参数化回归
 * ============================================================================
 * 核心断言（必须全绿）：
 *   A. 用真实样本的全部参数（sessionID/width/type/pts/xys/data/bcv/webp/c/pc/pn/trace 照抄），
 *      用「已知明文反推的 ks」重新加密 → d / sign 与真实抓包**逐字节相同**，
 *      再用 decodeD 解回来 → 明文与原始明文**逐字节相同**。
 *   B. 把 ks 换成 calibrateCaptchaKs(sk) 现标的表 → 结果同样与真实 d/sign 逐字节相同
 *      （证明"标定 ks"这条工程路径与真实样本一致）。
 *   C. 换一张不同的 ks 重加密 → d 必然不同，但 decryptD 解回仍是同一明文
 *      （证明"同明文 + 任意 ks + decryptD"这条链路自洽）。
 *   D. 字段顺序 / 类型 / c 计时项 / 轨迹参数化 / 负向输入。
 *
 * 不发任何网络请求。用法：
 *   node scripts/test_verify_builder.js           # 全部
 *   node scripts/test_verify_builder.js -v        # 打印每条断言的细节
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const B = require('../src/cap_verify_builder');
const { loadTemplate } = require('../src/cap_solver');
const { decodeD } = require('../src/dewu_cap_probe');

const VERBOSE = process.argv.includes('-v');
const results = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  const mark = cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${mark}  ${name}${cond || !detail ? '' : '   ← ' + detail}`);
  if (VERBOSE && detail) console.log('        ' + detail);
}
function eq(name, a, b, note) {
  const same = a === b;
  ok(name, same, same ? (note || '') : `${note ? note + ' | ' : ''}got=${JSON.stringify(trunc(a))} want=${JSON.stringify(trunc(b))}`);
}
function trunc(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > 120 ? s.slice(0, 120) + '…' : s;
}
function section(t) { console.log('\n\x1b[36m' + t + '\x1b[0m'); }

(async () => {
  // ───────────────────────────────────────────────────────────────────────────
  section('0. 装载真实样本（不造数据）');
  const sample = B.loadSamplePlain();               // 已解密明文对象（键序 = 真实键序）
  const real = B.loadSampleBody();                  // 真实 body {d, sign}
  const samplePlainStr = JSON.stringify(sample);    // 紧凑 JSON = SDK 加密前的原文
  const sampleData = JSON.parse(sample.data);
  const SK = sampleData.sk;
  const DWSM = sampleData.shumeiId;

  eq('明文对象键顺序 = FIELD_ORDER', Object.keys(sample).join(','), B.FIELD_ORDER.join(','), 'sanity');
  eq('真实 d 长度', real.body.d.length, 6556);
  const dec = decodeD(real.body.d);
  eq('decodeD → 密文字节数', dec.cipher.length, 3285);
  eq('明文 UTF-8 字节数 == 密文字节数（流密码等长）', Buffer.byteLength(samplePlainStr, 'utf8'), dec.cipher.length);
  ok('d 是 mojibake base64（base64 解出的字节数 > 密文字节数）', dec.utf8Len > dec.cipher.length,
    `base64→${dec.utf8Len} bytes → UTF-8 回压→${dec.cipher.length} bytes`);
  eq('sign == md5("d"+d+SALT)', B.md5('d' + real.body.d + B.SALT), real.body.sign, '真实样本自检');

  // 两份 ks：① 已知明文反推  ② 用样本自己的 sk 现标
  const ksDerived = B.ksFromKnownPair(real.body.d, samplePlainStr);
  eq('反推 ks 长度 == 明文长度', ksDerived.length, 3285);
  const ksCalib = await B.resolveKs({ sk: SK, dwsm: DWSM, needLen: 3400 });
  ok('标定 ks 长度足够', ksCalib.length >= 3285, `ks=${ksCalib.length} bytes`);
  ok('标定 ks 前 3285 字节 == 反推 ks',
    Buffer.from(ksCalib.slice(0, 3285)).equals(ksDerived),
    '若 FAIL：sk/UA 与产生样本那次不一致（ks = F(sk, UA族)）');

  // ───────────────────────────────────────────────────────────────────────────
  section('A. 逐字对拍：真实参数 + 反推 ks → d/sign 与抓包完全一致');
  const trackReal = { pts: sample.pts, xys: sample.xys, pc: sample.pc, pn: sample.pn, trace: sample.trace };
  const buildArgs = {
    sessionID: sample.sessionID,
    width: sample.width,
    type: sample.type,
    track: trackReal,
    dataField: sample.data,          // data 是「字符串」，不能传对象
    bcv: sample.bcv,
    webp: sample.webp,
    c: sample.c,
    ks: ksDerived,
  };
  const outA = B.buildVerify(buildArgs);
  const rA = await outA;
  eq('明文逐字节相同', Buffer.from(rA.plain, 'utf8').equals(Buffer.from(samplePlainStr, 'utf8')), true);
  eq('明文长度', rA.plainLen, 3285);
  eq('d 逐字节相同', rA.d === real.body.d, true, 'd 不是"看起来一样"，是字符串全等');
  eq('sign 相同', rA.sign, real.body.sign);
  const backA = B.decryptPlain(rA.d, ksDerived);
  eq('decryptD(d) 解回明文逐字节相同', backA === samplePlainStr, true);
  eq('解回明文再 JSON.parse 的 12 字段值全同',
    JSON.stringify(JSON.parse(backA)) === JSON.stringify(sample), true);
  eq('整条 body {d,sign} 与抓包全等',
    JSON.stringify({ d: rA.d, sign: rA.sign }), JSON.stringify({ d: real.body.d, sign: real.body.sign }));

  // ───────────────────────────────────────────────────────────────────────────
  section('B. 逐字对拍：ks 用 calibrateCaptchaKs(sk) 现标（异步路径）');
  const outB = await B.buildVerify(Object.assign({}, buildArgs, { ks: undefined, sk: SK, dwsm: DWSM }));
  eq('d 与真实样本相同（标定路径）', outB.d === real.body.d, true);
  eq('sign 与真实样本相同（标定路径）', outB.sign, real.body.sign);
  eq('明文与真实样本相同（标定路径）', outB.plain === samplePlainStr, true);

  // ───────────────────────────────────────────────────────────────────────────
  section('C. 换 ks 重加密：d 变、明文不变（链路自洽）');
  const ksAlt = Buffer.alloc(5000);
  for (let i = 0; i < ksAlt.length; i++) ksAlt[i] = (i * 37 + 11) & 0xff;
  const outC = await B.buildVerify(Object.assign({}, buildArgs, { ks: ksAlt }));
  ok('换了 ks → d 必然不同', outC.d !== real.body.d);
  eq('换了 ks → 明文仍逐字节相同', outC.plain === samplePlainStr, true);
  eq('换了 ks → decryptD 解回仍是同一明文', B.decryptPlain(outC.d, ksAlt) === samplePlainStr, true);
  eq('换了 ks → sign 仍满足 md5 公式', outC.sign, B.md5('d' + outC.d + B.SALT));

  // ───────────────────────────────────────────────────────────────────────────
  section('D1. 字段顺序 / 类型（真实样本的 12 字段）');
  eq('fieldOrder 12 项', rA.fieldOrder.length, 12);
  eq('fieldOrder 严格等于 FIELD_ORDER', rA.fieldOrder.join(','), B.FIELD_ORDER.join(','));
  const pObj = JSON.parse(rA.plain);
  eq('width 是 number', typeof pObj.width, 'number');
  eq('type 是 number', typeof pObj.type, 'number');
  eq('webp 是 number', typeof pObj.webp, 'number');
  eq('pn 是字符串（真实样本 "1123"）', typeof pObj.pn, 'string');
  eq('pn 值', pObj.pn, '1123');
  eq('data 是字符串且可再解析', typeof pObj.data === 'string' && !!JSON.parse(pObj.data), true);
  eq('data 内层字段数', Object.keys(JSON.parse(pObj.data)).length, 34);
  eq('data 内层键序与样本一致', Object.keys(JSON.parse(pObj.data)).join(','), Object.keys(sampleData).join(','));
  eq('trace 32 位大写 hex', /^[0-9A-F]{32}$/.test(pObj.trace), true);

  // ───────────────────────────────────────────────────────────────────────────
  section('D2. c 计时项（verify 非 0 / call 恒 0 —— 别写反）');
  const pc = B.parseC(sample.c);
  eq('verify 样本 rest', pc.rest, 156);
  eq('verify 样本 vrest', pc.vrest, 0);
  eq('verify 样本 vreqt', pc.vreqt, 4);
  eq('verify 样本 sqt', pc.sqt, 73873);
  eq('verify 样本 ojst', pc.ojst, 19);
  eq('parseC → makeC 往返一致', B.makeC(Object.assign({ bcv: sample.bcv }, pc)), sample.c);
  eq('C_VERIFY_SAMPLE 常量与样本 c 全等', B.C_VERIFY_SAMPLE, sample.c);
  const callPlain = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/call_plain_real.json'), 'utf8'));
  const pcc = B.parseC(callPlain.c);
  eq('call 样本 rest/vrest/vreqt/sqt/ojst 全 0',
    [pcc.rest, pcc.vrest, pcc.vreqt, pcc.sqt, pcc.ojst].join(','), '0,0,0,0,0');
  eq('makeC 默认（不传 timings）= call 形态',
    B.makeC({ bcv: B.BCV_DEFAULT }), 'v=' + B.BCV_DEFAULT + '|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0');
  ok('makeC 拒绝非数字计时项', (() => { try { B.makeC({ rest: 'abc' }); return false; } catch (e) { return true; } })());

  // ───────────────────────────────────────────────────────────────────────────
  section('D3. 轨迹：makeTrack 默认行为必须与 genTrackFromTemplate 逐字一致');
  const NOW = 1795152693039;
  const tpl = loadTemplate();
  eq('模板点数', tpl.points, 126);
  eq('模板总时长 1102ms', tpl.durationMs, 1102);
  // ⚠ 口径修正：track_stats.json 里的 "16 种 dt" 是把它自己算出的首段坏值也算进去了；
  //   模板真实 dt（第 2 点起相邻差）只有 15 种：3,4,5,6,7,8,10,11,12,16,17,23,33,89,139
  const dtKinds = new Set(tpl.dt.map((d) => Math.max(3, d))).size;
  eq('模板 dt 取值种类（真实口径）', dtKinds, 15);
  eq('模板 dt 最小值', Math.min(...tpl.dt.map((d) => Math.max(3, d))), 3);
  eq('模板 dt 最大值', Math.max(...tpl.dt), 139);

  const g = B.makeTrack({ sx: 274, sy: 626, ex: 401, ey: 249, now: NOW });
  const { genTrackFromTemplate } = require('../src/cap_solver');
  const g0 = genTrackFromTemplate({ sx: 274, sy: 626, ex: 401, ey: 249, now: NOW });
  eq('xys 与 genTrackFromTemplate 完全一致', g.xys === g0.xys, true);
  eq('pts 与 genTrackFromTemplate 完全一致', g.pts === g0.pts, true);
  eq('durationMs 与 genTrackFromTemplate 一致', g.durationMs, g0.durationMs);
  eq('点数 126', g.points, 126);
  eq('jitter 默认关闭', g.jitter, 0);
  eq('scale 默认 1（同位移长度）', g.scale, 1);

  const ptsArr = g.xys.split('|').map((s) => s.split(',').map(Number));
  eq('首点 = 起点', `${ptsArr[0][0]},${ptsArr[0][1]}`, '274,626');
  const lastP = ptsArr[ptsArr.length - 1];
  eq('末点 = 终点', `${lastP[0]},${lastP[1]}`, '401,249');
  eq('首点时间戳 = now（绝对值毫秒）', ptsArr[0][2], NOW);
  ok('x 单调不减（全列）', ptsArr.every((p, i) => i === 0 || p[0] >= ptsArr[i - 1][0]));
  ok('时间严格递增（第 2 点起；首点是绝对时间戳，不与相对时间比较）',
    ptsArr.slice(2).every((p, i) => p[2] > ptsArr[i + 1][2]));
  ok('首点用绝对时间戳、后续用相对时间戳（真实样本同款混合格式）',
    ptsArr[0][2] > 1e12 && ptsArr[1][2] < 1000,
    `t0=${ptsArr[0][2]} t1=${ptsArr[1][2]}`);
  const dts = [];
  for (let i = 1; i < ptsArr.length; i++) dts.push(ptsArr[i][2] - ptsArr[i - 1][2]);
  ok('dt 非等距（取值 >1 种）', new Set(dts).size > 1, `kinds=${new Set(dts).size}`);
  eq('末点相对时间 == pts 里的 cost', lastP[2], Number(g.pts.split('|')[1].split(',')[2]));
  // 真实样本的 y 列（第 2 点起）从 0 涨到 249，单调不减；首点 y=626 属于另一套基准
  const yCol = ptsArr.slice(1).map((p) => p[1]);
  ok('y 列（第 2 点起）单调不减', yCol.every((v, i) => i === 0 || v >= yCol[i - 1]),
    `first=${yCol[0]} last=${yCol[yCol.length - 1]}`);
  eq('y 列末值 == 模板末值 249', yCol[yCol.length - 1], 249);
  ok('y 列与首点 y 不连续（首点 626 → 第 2 点 0，SDK 混用两套 y 基准）', ptsArr[0][1] === 626 && yCol[0] === 0);

  // ───────────────────────────────────────────────────────────────────────────
  section('D3b. pts 与 xys 不在同一坐标系（真实样本事实；换算关系“未确认”）');
  const sPts = sample.pts.split('|').map((s) => s.split(',').map(Number));
  const sXys = sample.xys.split('|').map((s) => s.split(',').map(Number));
  eq('pts 首点 (62,57) 与 xys 首点 (274,626) 不同', `${sPts[0][0]},${sPts[0][1]}`, '62,57');
  eq('pts 末点 (189,306) 与 xys 末点 (401,249) 不同', `${sPts[1][0]},${sPts[1][1]}`, '189,306');
  eq('x 方向偏移两端恒定 = 212（像纯平移）', `${sXys[0][0] - sPts[0][0]},${sXys[125][0] - sPts[1][0]}`, '212,212');
  ok('y 方向偏移两端不同（+569 / -57）→ 不是纯平移，pts 的 y 基准 未确认',
    (sXys[0][1] - sPts[0][1]) !== (sXys[125][1] - sPts[1][1]),
    `${sXys[0][1] - sPts[0][1]} vs ${sXys[125][1] - sPts[1][1]}`);
  eq('pts 的 cost == xys 末点相对时间', sPts[1][2], sXys[125][2]);

  // ───────────────────────────────────────────────────────────────────────────
  section('D4. 轨迹参数化：任意起终点 / 时长随位移缩放 / scale / jitter');
  const short_ = B.makeTrack({ sx: 100, sy: 700, ex: 140, ey: 660, now: NOW });   // 位移 ~56
  const long_ = B.makeTrack({ sx: 100, sy: 700, ex: 380, ey: 260, now: NOW });    // 位移 ~521
  ok('短位移 → 时长更短', short_.durationMs < long_.durationMs, `${short_.durationMs} < ${long_.durationMs}`);
  ok('短位移 scale < 长位移 scale', short_.scale < long_.scale, `${short_.scale} < ${long_.scale}`);
  const s1 = B.makeTrack({ sx: 100, sy: 700, ex: 380, ey: 260, now: NOW, scale: 1 });
  const s2 = B.makeTrack({ sx: 100, sy: 700, ex: 380, ey: 260, now: NOW, scale: 2 });
  ok('scale=2 → 时长约为 2 倍', Math.abs(s2.durationMs / s1.durationMs - 2) < 0.08,
    `${s1.durationMs} → ${s2.durationMs}`);
  const s05 = B.makeTrack({ sx: 100, sy: 700, ex: 380, ey: 260, now: NOW, scale: 0.5 });
  ok('scale=0.5 → 时长约为一半', Math.abs(s05.durationMs / s1.durationMs - 0.5) < 0.08,
    `${s1.durationMs} → ${s05.durationMs}`);
  const horiz = B.makeTrack({ sx: 50, sy: 300, ex: 330, ey: 300, now: NOW });
  eq('水平轨迹末点', horiz.xys.split('|').slice(-1)[0].split(',').slice(0, 2).join(','), '330,300');
  const base = B.makeTrack({ sx: 100, sy: 700, ex: 380, ey: 260, now: NOW });
  const j0 = B.makeTrack({ sx: 100, sy: 700, ex: 380, ey: 260, now: NOW, seed: 7 });
  const jA = B.makeTrack({ sx: 100, sy: 700, ex: 380, ey: 260, now: NOW, seed: 7, jitter: 2 });
  const jB = B.makeTrack({ sx: 100, sy: 700, ex: 380, ey: 260, now: NOW, seed: 7, jitter: 2 });
  ok('jitter 默认关闭（不扰动 == 无 seed 无 jitter）', j0.xys === base.xys, '抖动开关不影响默认输出');
  ok('jitter=2 改变了轨迹', jA.xys !== j0.xys);
  eq('jitter + 同 seed → 可复现', jA.xys, jB.xys);
  ok('jitter 后点数不变', jA.points === j0.points);
  ok('jitter 后末点仍落在终点附近（±jitter）',
    Math.abs(jA.points && Number(jA.xys.split('|').slice(-1)[0].split(',')[0]) - 380) <= 2 &&
    Math.abs(Number(jA.xys.split('|').slice(-1)[0].split(',')[1]) - 260) <= 2,
    `末点=${jA.xys.split('|').slice(-1)[0]}`);

  // ───────────────────────────────────────────────────────────────────────────
  section('D5. buildVerify 用 {sx,sy,ex,ey} 内部生成轨迹 + 往返');
  const fresh = await B.buildVerify({
    sessionID: sample.sessionID,
    track: { sx: 260, sy: 640, ex: 392, ey: 254, now: NOW },
    dataField: sample.data,
    sk: SK,
    dwsm: DWSM,
    c: sample.c,
  });
  const fp = JSON.parse(fresh.plain);
  eq('生成的 pts/xys 自洽（pts 起点 == xys 首点）',
    fp.pts.split('|')[0], fp.xys.split('|')[0]);
  eq('生成的 pts 终点 == 传入终点', fp.pts.split('|')[1].split(',').slice(0, 2).join(','), '392,254');
  eq('生成后字段顺序不变', fresh.fieldOrder.join(','), B.FIELD_ORDER.join(','));
  const freshBack = B.decryptPlain(fresh.d, ksCalib);
  eq('生成载荷 decryptD 往返一致', freshBack, fresh.plain);
  ok('生成载荷明文长度 > 3000 字节', fresh.plainLen > 3000, `${fresh.plainLen} bytes`);
  ok('两次生成（不同 now/trace）d 必不同', fresh.d !== rA.d);

  // ───────────────────────────────────────────────────────────────────────────
  section('D5b. 只给 {pts,xys} 的半套轨迹 → 自动补 pc/pn/trace');
  const halfPlain = B.assemblePlain({
    sessionID: 'S',
    track: { pts: sample.pts, xys: sample.xys },
    dataField: sample.data,
    c: sample.c,
  });
  eq('pts/xys 原样保留', halfPlain.pts === sample.pts && halfPlain.xys === sample.xys, true);
  eq('pc 被补齐（非 "undefined"）', halfPlain.pc !== 'undefined' && /\d,\d/.test(halfPlain.pc), true);
  ok('pn 被补齐为数字字符串', /^\d+$/.test(halfPlain.pn), halfPlain.pn);
  ok('trace 被补齐为 32 位大写 hex', /^[0-9A-F]{32}$/.test(halfPlain.trace), halfPlain.trace);

  // ───────────────────────────────────────────────────────────────────────────
  section('D6. 负向输入：该炸就炸');
  ok('dataField 传对象 → 抛错', (() => {
    try { B.assemblePlain({ sessionID: 'x', track: trackReal, dataField: {} }); return false; } catch (e) { return /dataField 必须是字符串/.test(e.message); }
  })());
  ok('ks 太短 → 抛错且提示重标', (() => {
    try { B.encryptPlain('x'.repeat(100), Buffer.alloc(10)); return false; } catch (e) { return /keystream 不足/.test(e.message); }
  })());
  ok('makeTrack 缺参数 → 抛错', (() => {
    try { B.makeTrack({ sx: 1, sy: 2 }); return false; } catch (e) { return /sx,sy,ex,ey/.test(e.message); }
  })());
  ok('ksFromKnownPair 长度不匹配 → 抛错', (() => {
    try { B.ksFromKnownPair(real.body.d, '{"a":1}'); return false; } catch (e) { return /长度不一致/.test(e.message); }
  })());

  // ───────────────────────────────────────────────────────────────────────────
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log('\n' + '─'.repeat(72));
  console.log(`总计 ${results.length} 条断言 | \x1b[32mPASS ${pass}\x1b[0m | ${fail ? '\x1b[31mFAIL ' + fail + '\x1b[0m' : 'FAIL 0'}`);
  if (fail) {
    console.log('\n失败项：');
    for (const r of results.filter((x) => !x.pass)) console.log('  ✗ ' + r.name + (r.detail ? '  ← ' + r.detail : ''));
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(2); });
