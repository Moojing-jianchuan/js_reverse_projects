// e2e_09_gen_trusted.js — 按"trusted 输入"的字段形态离线生成 data
//
// 依据（本轮 trusted 对照实验，见 static/REPORT_C.md §6）：
//   SendInput 真实鼠标 →  mm/mp 每点第 4 段 = 1，mc/mu 第 5 段 = 1
//   dispatchEvent 合成  →  mm/mp 每点第 4 段 = 0，mc/mu 第 5 段 = 0
//   历史样本 cvp_sample_1/2 与我们的 P1~P5 全是 0 → 服务端看到的是"合成输入"
//
// 轨迹形态照 trusted 实测样本（certifyId=Qsgdk60kTT）：
//   mm 174 点 / mp 479 点（mm ⊂ mp，约 1:3 抽样）、总时长 ~1.6s、缓出、y 抖动、末点超出 mu
//   xPos = 块最终位置/2.5，slidePos = 手指位移/2.5，实测 xPos/slidePos = 0.785
const crypto = require('crypto');
const C = require('./e2e_common');
const { buildData } = require('./feilin_data');

const ZOOM = 2.5;

function rnd(seedRef) { return crypto.randomInt(0, 1000) / 1000; }

function buildTrustedData(opts = {}) {
  const gap = opts.gap;
  const xPos = opts.xPos != null ? opts.xPos : Math.round(gap * 300 / 296);
  const slidePos = opts.slidePos != null ? opts.slidePos : Math.round(xPos / 0.785);
  const flag = opts.flag != null ? String(opts.flag) : '1';
  const startX = opts.startX != null ? opts.startX : 628;
  const startY = opts.startY != null ? opts.startY : 690;
  const mmN = opts.mmN != null ? opts.mmN : 540;
  const stepPerMm = opts.stepPerMm != null ? opts.stepPerMm : 1;   // mp 点数 = mm * 2（实测 479/174≈2.75）
  const preMs = opts.preMs != null ? opts.preMs : 3000;            // 按下前在页面停留
  const dragMs = opts.dragMs != null ? opts.dragMs : 4500;         // 拖动总时长
  const si = opts.si || '1906,1920,844,1906,844,907,955,0.24182627200619075,1920';
  const arg = opts.arg != null ? opts.arg : crypto.randomBytes(10).toString('base64');

  const movement = slidePos * ZOOM;   // 手指屏幕位移
  const rawN = mmN * stepPerMm + 1;

  // 原始指针采样（mp）：缓出 + 纵向抖动 + 时间抖动
  const raw = [];
  let tAcc = 0;
  for (let i = 0; i <= rawN; i++) {
    const p = i / rawN;
    const ease = 1 - Math.pow(1 - p, 2.2);
    const x = startX + movement * ease;
    const y = startY + Math.sin(p * Math.PI * 3) * 1.5;
    raw.push({ x: Math.round(x), y: Math.round(y), t: tAcc, flag });
    // 真实 trusted 样本：mp 479 点 / 鼠标移动 ~1.6s → 每点约 3.4ms
    const dt = 6 + Math.round(rnd() * 3) + (p > 0.92 ? 8 : 0);
    tAcc += dt;
  }
  const dragActualMs = tAcc;
  // mm：等间隔抽样（每 stepPerMm 个取一个），保证末点 = mu
  const mm = [];
  for (let i = 0; i < raw.length; i += stepPerMm) mm.push(raw[i]);
  if (mm[mm.length - 1].t !== raw[raw.length - 1].t) mm.push(raw[raw.length - 1]);

  const now = Date.now();
  const verifyTime = now;
  const trackStart = verifyTime - dragActualMs - preMs - 80;
  const shift = (p) => ({ ...p, t: preMs + p.t });
  const mmPts = mm.map(shift), mpPts = raw.map(shift);
  const tDown = preMs;
  const tUp = preMs + dragActualMs;

  // 末点：mouseup 之后的位置（真实样本里 x 超出 mu 120~170，flag=1）
  const tail = { x: Math.round(startX + movement + 170), y: Math.round(startY + 110), t: tUp + 18, flag };

  const fmt = p => [p.x, p.y, p.t, p.flag].join(',');
  const trackList = {
    mc: [startX, startY, tDown, ' ', flag].join(','),
    tc: '',
    mu: [Math.round(startX + movement), Math.round(startY + movement * 0.02), tUp, ' ', flag].join(','),
    te: '',
    mp: mpPts.map(fmt).join('|'),
    tmv: '',
    mm: mmPts.map(fmt).join('|') + '|' + fmt(tail),
    ks: '',
    fi: '',
    startTime: trackStart,
    si,
  };

  const r = buildData({
    trackList,
    trackStartTime: trackStart,
    verifyTime,
    xPos,
    slidePos,
    arg,
  });

  const summary = {
    gap, xPos: r.payload.xPos, slidePos: r.payload.slidePos, flag,
    movement: +movement.toFixed(1), dragActualMs, preMs,
    mmPoints: mmPts.length + 1, mpPoints: mpPts.length,
    xPosOverSlidePos: +(xPos / slidePos).toFixed(3),
    arg, argBytes: Buffer.from(arg, 'base64').length,
    dt: verifyTime - trackStart,
    dataLen: r.data.length, dataHead16: r.data.slice(0, 16), nonce: r.nonce, lens: r.lens,
    mmHead: trackList.mm.slice(0, 60) + '…',
    mc: trackList.mc, mu: trackList.mu,
  };
  return { data: r.data, payload: r.payload, T: r.T, summary };
}

module.exports = { buildTrustedData };

if (require.main === module) {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  if (!o.gap) { console.error('需要 --gap <image px>'); process.exit(2); }
  const r = buildTrustedData({
    gap: parseInt(o.gap, 10),
    xPos: o.xPos ? parseInt(o.xPos, 10) : null,
    slidePos: o.slidePos ? parseInt(o.slidePos, 10) : null,
    flag: o.flag != null ? o.flag : '1',
  });
  const f = C.saveJson(o.out || `data_trusted_gap${o.gap}.json`, { summary: r.summary, data: r.data, payload: r.payload, deflate_b64: r.T });
  console.log(JSON.stringify(r.summary, null, 1));
  console.log('saved:', f);
}
