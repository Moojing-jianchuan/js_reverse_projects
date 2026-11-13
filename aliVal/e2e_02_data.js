// e2e_02_data.js — 离线生成 data：以真实样本轨迹为模板，按检测到的缺口重标定 x 与 slidePos
// 用法：
//   node e2e_02_data.js --gap 205 --arg copy --out data_p2.json
//   node e2e_02_data.js --gap 205 --arg empty
//   node e2e_02_data.js --gap 205 --arg random
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const C = require('./e2e_common');
const { buildData } = require('./feilin_data');

const ZOOM = 2.5; // 页面布局倍数：image 296px 宽 → 页面 740px，轨迹 x 距离 / 2.5 = image 坐标

function parseArgs(argv) {
  const o = { template: 'config/cvp_sample_1.json', gap: null, arg: 'copy', argValue: null, out: null, tweak: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--template') o.template = argv[++i];
    else if (k === '--gap') o.gap = parseInt(argv[++i], 10);
    else if (k === '--arg') o.arg = argv[++i];
    else if (k === '--argValue') o.argValue = argv[++i];
    else if (k === '--out') o.out = argv[++i];
    else if (k === '--tweak') o.tweak = argv[++i];   // 预留：轨迹后处理开关
    else if (k === '--xPos') o.xPos = parseInt(argv[++i], 10);
    else if (k === '--slidePos') o.slidePos = parseInt(argv[++i], 10);
  }
  return o;
}

function loadTemplate(file) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  const plain = zlib.inflateSync(Buffer.from(d.deflate_b64, 'base64')).toString('utf8');
  const nonce = plain.slice(0, 32);
  const payload = JSON.parse(plain.slice(32));
  return { file, plain, nonce, payload, deflate_b64: d.deflate_b64 };
}

// "x,y,t,flag" 或 "x,y,t, ,0"
function parsePts(s) {
  if (!s) return [];
  return s.split('|').map(seg => {
    const parts = seg.split(',');
    return { raw: parts, x: parseFloat(parts[0]), y: parseFloat(parts[1]), t: parseFloat(parts[2]), rest: parts.slice(3) };
  });
}
function fmtPts(pts) {
  return pts.map(p => [Math.round(p.x), Math.round(p.y), Math.round(p.t), ...p.rest].join(',')).join('|');
}

function pickArg(mode, tpl) {
  if (mode === 'empty') return '';
  if (mode === 'random') return crypto.randomBytes(10).toString('base64');
  if (mode === 'zero') return Buffer.alloc(10).toString('base64');
  return tpl.payload.arg; // copy
}

// 核心：把模板轨迹按 gap 重标定（x 方向绕起点线性缩放；t/y/flag 原样）
function buildOfflinePayload(opts = {}) {
  const o = { template: 'config/cvp_sample_1.json', gap: 200, arg: 'copy', argValue: null, zoom: ZOOM, ...opts };
  const tpl = loadTemplate(o.template);
  const T0 = tpl.payload.TrackList;

  const mmPts = parsePts(T0.mm), mpPts = parsePts(T0.mp);
  const mc = T0.mc.split(','); const mu = T0.mu.split(',');
  const startX = parseFloat(mc[0]);
  const endX = parseFloat(mu[0]);
  const sampleMovement = endX - startX;

  // xPos / slidePos 口径（本轮 browser 标定得出）：
  //   真实样本里 xPos = 拼图块最终位置（layout px）= 缺口自然px × 300/296 ≈ ×1.0135
  //                  slidePos = 手指位移 / 2.5
  //   两者比值实测 0.79~0.95（随拖动速度变化），标定轮（拖到视觉对齐）= 182/216 = 0.843
  const xPos = o.xPos != null ? o.xPos : Math.round(o.gap * 300 / 296);
  const slidePos = o.slidePos != null ? o.slidePos : Math.round(xPos / 0.843);

  // 目标：轨迹总位移 = slidePos * zoom（真实样本恒等式：movement/slidePos = 2.500）
  const targetMovement = slidePos * o.zoom;
  const scale = targetMovement / sampleMovement;
  const rescale = v => startX + (v - startX) * scale;

  const newMM = mmPts.map(p => ({ ...p, x: rescale(p.x) }));
  const newMP = mpPts.map(p => ({ ...p, x: rescale(p.x) }));

  const now = Date.now();
  const dT = now - tpl.payload.VerifyTime;
  const trackList = {
    mc: [Math.round(rescale(startX)), mc[1], mc[2], mc[3], mc[4]].join(','),
    tc: T0.tc,
    mu: [Math.round(rescale(endX)), mu[1], mu[2], mu[3], mu[4]].join(','),
    te: T0.te,
    mp: fmtPts(newMP),
    tmv: T0.tmv,
    mm: fmtPts(newMM),
    ks: T0.ks,
    fi: T0.fi,
    startTime: T0.startTime + dT,
    si: T0.si,
  };

  const arg = o.argValue != null ? o.argValue : pickArg(o.arg, tpl);
  const r = buildData({
    trackList,
    trackStartTime: trackList.startTime,
    verifyTime: tpl.payload.VerifyTime + dT,
    xPos,
    slidePos,
    arg,
  });

  const summary = {
    template: o.template,
    zoom: o.zoom,
    sampleMovement, targetMovement: +targetMovement.toFixed(1), scale: +scale.toFixed(4),
    gap: o.gap, slidePos: r.payload.slidePos, xPos: r.payload.xPos,
    argMode: o.arg, arg, argBytes: Buffer.from(arg, 'base64').length,
    trackStartTime: trackList.startTime, verifyTime: r.payload.VerifyTime, delta: r.payload.VerifyTime - trackList.startTime,
    mmPoints: newMM.length, mpPoints: newMP.length,
    mmFirst: newMM[0] && [Math.round(newMM[0].x), newMM[0].y, newMM[0].t, ...newMM[0].rest].join(','),
    mmLast: newMM[newMM.length - 1] && [Math.round(newMM[newMM.length - 1].x), newMM[newMM.length - 1].y, newMM[newMM.length - 1].t, ...newMM[newMM.length - 1].rest].join(','),
    lens: r.lens, nonce: r.nonce, dataHead16: r.data.slice(0, 16), dataLen: r.data.length,
  };
  return { data: r.data, payload: r.payload, plain: r.plain, T: r.T, deflated: r.deflated, summary };
}

module.exports = { buildOfflinePayload, loadTemplate, parsePts, ZOOM };

if (require.main === module) {
  const o = parseArgs(process.argv);
  if (!o.gap) { console.error('需要 --gap <image px>'); process.exit(2); }
  const r = buildOfflinePayload({ template: o.template, gap: o.gap, arg: o.arg, argValue: o.argValue, xPos: o.xPos, slidePos: o.slidePos });
  const name = o.out || `data_gap${o.gap}_arg-${o.arg}.json`;
  const f = C.saveJson(name, { summary: r.summary, data: r.data, payload: r.payload, deflate_b64: r.T });
  console.log(JSON.stringify(r.summary, null, 1));
  console.log('\ndata:', r.data.slice(0, 48) + '…');
  console.log('saved:', f);
}
