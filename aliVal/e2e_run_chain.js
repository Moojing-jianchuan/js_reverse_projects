// e2e_run_chain.js — 一条链：InitCaptcha → 下载图 → 检测 gap → 离线 data → slideAuth → 证据落盘
// 用法：
//   node e2e_run_chain.js --tag P2 --arg copy            # 自动检测 gap
//   node e2e_run_chain.js --tag P3 --arg empty --token capture
//   node e2e_run_chain.js --tag P5 --gap 205             # 手指定 gap
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const C = require('./e2e_common');
const { detect } = require('./e2e_gap');
const { buildOfflinePayload } = require('./e2e_02_data');
const { submitSlideAuth } = require('./e2e_03_slideauth');

function argvMap() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  return o;
}

(async () => {
  const o = argvMap();
  const tag = o.tag || 'chain';
  const token = o.token || 'capture';
  const argMode = o.arg || 'copy';
  const zoom = o.zoom ? parseFloat(o.zoom) : 2.5;

  // 1) InitCaptcha（复用 e2e_01_init.js，脚本化调用）
  //    --maxGap N：反复 InitCaptcha 直到检测到的 gap ≤ N（滑块行程有限，gap 太大时所需手指位移会超出滑轨）
  const maxGap = o.maxGap ? parseInt(o.maxGap, 10) : null;
  const maxSd = o.maxSd ? parseFloat(o.maxSd) : 10;
  let init = null, initFile = null, g = null;
  for (let attempt = 1; attempt <= 8; attempt++) {
    console.log('== step1 InitCaptcha (deviceToken source =', token, ') attempt', attempt);
    const initOut = execFileSync(process.execPath, [path.join(__dirname, 'e2e_01_init.js'), token], { encoding: 'utf8', maxBuffer: 8 << 20 });
    initFile = (initOut.match(/INIT_JSON=(.+)/) || [])[1];
    if (!initFile) { console.error('InitCaptcha 失败:\n' + initOut); process.exit(1); }
    init = JSON.parse(fs.readFileSync(initFile.trim(), 'utf8'));
    console.log('   certifyId =', init.initBody.CertifyId, '| StaticPath =', init.initBody.StaticPath);

    // 2) 缺口检测
    console.log('== step2 gap detect');
    g = detect(init.back.path, init.shadow.path);
    console.log('   image', g.image, 'shadowBox', g.shadowBox, '| gap =', g.gap, '| gapY =', g.gapY, '| conf', JSON.stringify(g.confidence));
    if (!g.ok) { console.error('   检测失败:', g.reason); continue; }
    const needMotion = Math.round((Math.round(g.gap * 300 / 296) / 0.785) * 2.5);
    console.log('   预估手指位移 =', needMotion, 'px（滑轨行程 650）| sd =', g.confidence.sd);
    if ((maxGap == null || g.gap <= maxGap) && g.confidence.sd <= maxSd) break;
    console.log('   → 不满足 maxGap/maxSd，重新 InitCaptcha');
  }
  const gap = o.gap ? parseInt(o.gap, 10) : g.gap;

  // 3) 离线 data
  const gen = o.gen || 'template';
  console.log('== step3 build data offline (gen =', gen, ', gap =', gap, ', arg =', argMode, ', zoom =', zoom, ')');
  const built = gen === 'human'
    ? require('./e2e_15_human_track').buildHumanData({ gap, xPos: o.xPos ? parseInt(o.xPos, 10) : null, slidePos: o.slidePos ? parseInt(o.slidePos, 10) : null, flag: o.flag != null ? String(o.flag) : '1' })
    : gen === 'trusted'
    ? require('./e2e_09_gen_trusted').buildTrustedData({ gap, xPos: o.xPos ? parseInt(o.xPos, 10) : null, slidePos: o.slidePos ? parseInt(o.slidePos, 10) : null, flag: o.flag != null ? String(o.flag) : '1' })
    : buildOfflinePayload({ gap, arg: argMode, zoom, argValue: o.argValue || null, xPos: o.xPos ? parseInt(o.xPos, 10) : null, slidePos: o.slidePos ? parseInt(o.slidePos, 10) : null });
  console.log('   ' + JSON.stringify(built.summary));
  const dataFile = C.saveJson(`data_${tag}_${C.ts()}.json`, { summary: built.summary, data: built.data, payload: built.payload, deflate_b64: built.T });

  // 4) slideAuth
  console.log('== step4 slideAuth');
  const rec = await submitSlideAuth({ initFile, dataFile, tag });

  const line = {
    tag, when: new Date().toISOString(), certifyId: init.initBody.CertifyId, gapDetected: g.gap, gapUsed: gap,
    gapBright: g.gapBright, agree: g.agree, argMode, arg: built.summary.arg, dataLen: built.data.length,
    dataHead16: built.data.slice(0, 16), verdict: rec.verdict, resp: rec.respBody, post: rec.post,
  };
  C.ensureWork();
  fs.appendFileSync(path.join(C.WORK, 'runs.jsonl'), JSON.stringify(line) + '\n');
  console.log('\n== RESULT', JSON.stringify(line));
})().catch(e => { console.error('ERR', e.stack || e.message); process.exit(1); });
