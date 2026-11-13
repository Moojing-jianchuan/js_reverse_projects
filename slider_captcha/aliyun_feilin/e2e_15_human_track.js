// e2e_15_human_track.js —— 按 kangleyao/slider-captcha-lab 的 human_track.py (feedback 变体) 重构轨迹
//
// 真人形态（该项目 30 条真人样本实测）：
//   慢逼近（45~60% 帧，只吃 15~30% 距离）
//   → 谷底犹豫（3~6 帧，微位移 + dt 40~110ms）
//   → 末端甩鞭（16~28 帧，86~94% 距离，dt 2.5~6ms，峰值速度 5000~15000 px/s）
//   → 收尾（5~10 帧，dt 6~16ms）
// 附加指纹：dx 量化到 0.5px 网格、4% 零位移帧、55% 概率末端回拉、y 线性漂移 25~90px
//
// 用法：node e2e_15_human_track.js            # 只生成并自检
//       node e2e_15_human_track.js --submit   # 走完整链（InitCaptcha → gap → data → slideAuth）
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { buildData, unarmour } = require('./feilin_data');

const ZOOM = 2.5;

function rnd() { return crypto.randomInt(0, 1e6) / 1e6; }
function uni(a, b) { return a + rnd() * (b - a); }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

// ---------------- 轨迹生成（feedback 变体核心形态）----------------
function generateTrack(D) {
  // 1) 时长与帧数（真人 p50 = 1.62s / 127 帧）
  const r = rnd();
  const totalMs = r < 0.35 ? uni(650, 1000) : (r < 0.70 ? uni(1050, 1700) : uni(1700, 2600));
  const frames = ri(120, 180);

  // 2) 前段：慢逼近，占 45~60% 帧、只吃 15~30% 距离
  const split = Math.floor(frames * uni(0.45, 0.60));
  const frontBudget = D * uni(0.15, 0.30);
  const frontDt = uni(4.5, 6.5);

  const pts = [];
  const w = [];
  for (let i = 0; i < split; i++) {
    const u = i / Math.max(1, split - 1);
    w.push(0.55 + 0.45 * Math.cos(Math.PI * u * 0.9)); // 速度缓慢下降
  }
  const wSum = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < split; i++) {
    pts.push({ dx: frontBudget * w[i] / wSum, dt: frontDt * uni(0.75, 1.3) });
  }

  // 3) 谷底犹豫：3~6 帧，微位移 + 长 dt（看缺口）
  const valleyN = ri(3, 6);
  const valleyDx = D * uni(0.02, 0.05);
  for (let i = 0; i < valleyN; i++) pts.push({ dx: valleyDx / valleyN, dt: uni(40, 110) });

  // 4) 末端甩鞭：剩余距离的 86~94%，dt 2.5~6ms
  const rest = D - frontBudget - valleyDx;
  const flickN = ri(16, 28);
  const pk = uni(0.35, 0.60), sig = uni(0.07, 0.11);
  const shape = [];
  for (let j = 0; j < flickN; j++) {
    const ph = j / Math.max(1, flickN - 1);
    shape.push(0.05 + Math.exp(-((ph - pk) ** 2) / (2 * sig * sig)));
  }
  const sSum = shape.reduce((a, b) => a + b, 0);
  const flickShare = uni(0.86, 0.94);
  const flickDx = rest * flickShare;
  const peakDx = flickDx * Math.max(...shape) / sSum;
  const targetPeak = uni(7000, 12000);           // 真人 p50 9722
  const peakDt = Math.max(1.5, peakDx / targetPeak * 1000);
  for (let j = 0; j < flickN; j++) {
    const share = shape[j] / Math.max(...shape);
    pts.push({ dx: flickDx * shape[j] / sSum, dt: Math.max(1.8, peakDt * (0.6 + 0.8 * (1 - share))) });
  }

  // 5) 收尾：中速滑行
  const coastN = ri(5, 10);
  const coastDx = rest - flickDx;
  for (let i = 0; i < coastN; i++) pts.push({ dx: coastDx / coastN, dt: uni(6, 16) });

  // 6) 整数量化噪声（真实鼠标的半像素取样）
  const grid = uni(0.42, 0.58);
  for (const p of pts) {
    let q = Math.round(p.dx / grid) * grid;
    if (q > 0.5 && rnd() < 0.35) q += (rnd() < 0.5 ? -1 : 1) * grid;
    p.dx = Math.max(0.01, q);
  }
  // 距离守恒
  const fixDist = () => {
    const cur = pts.reduce((a, p) => a + p.dx, 0);
    const diff = D - cur;
    if (Math.abs(diff) > 1e-9) {
      const idx = pts.reduce((best, p, i, arr) => (p.dx > arr[best].dx ? i : best), 0);
      pts[idx].dx = Math.max(0.01, pts[idx].dx + diff);
    }
  };
  fixDist();

  // 7) 零位移帧（真人 4%）：把 dx 置 0，距离摊给右邻
  const nZero = Math.max(1, Math.round(pts.length * uni(0.03, 0.07)));
  for (let k = 0; k < nZero; k++) {
    const i = ri(2, Math.max(3, Math.floor(split * 0.9)));
    if (pts[i].dx > 0.05) {
      const d = pts[i].dx;
      pts[i].dx = 0.0;
      pts[i + 1].dx += d;
    }
  }

  // 8) 中途反向微调（1~3 次小幅回拉再补回）
  for (let k = 0, n = ri(1, 3); k < n; k++) {
    const i = ri(Math.floor(pts.length * 0.25), Math.max(Math.floor(pts.length * 0.25) + 2, Math.floor(pts.length * 0.80)));
    if (i + 3 >= pts.length) continue;
    const pull = uni(0.8, 2.2);
    pts[i].dx = Math.max(0.01, pts[i].dx - pull * 0.6);
    pts[i + 1].dx = Math.max(0.01, pts[i + 1].dx - pull * 0.4);
    pts[i + 2].dx += pull;
  }

  // 9) 末端回拉（55% 概率，最后 6~13 帧 dx 变负）
  if (rnd() < 0.55 && pts.length > 20) {
    const backN = ri(6, 13);
    const backTotal = uni(3.0, 12.0);
    const ws = [];
    for (let k = 0; k < backN; k++) ws.push(1.0 + Math.sin(Math.PI * (k + 1) / backN));
    const wsSum = ws.reduce((a, b) => a + b, 0);
    const mainN = pts.length - backN;
    const mainSum = pts.slice(0, mainN).reduce((a, p) => a + p.dx, 0);
    const need = D + backTotal;
    if (mainSum > 1) {
      const k2 = need / mainSum;
      for (let i = 0; i < mainN; i++) pts[i].dx = Math.max(0.01, pts[i].dx * k2);
    }
    for (let k = 0; k < backN; k++) {
      pts[mainN + k].dx = -backTotal * ws[k] / wsSum;
      pts[mainN + k].dt = (k === 0 ? uni(40, 140) : uni(3.5, 10.0));
    }
    fixDist();
  }

  // 10) y 路径：手臂线性漂移 + 手腕振荡（真人 y std ≈ 38px）
  const drift = rnd() < 0.75 ? -uni(50, 150) : uni(20, 60);
  const yAmp = uni(15, 35);
  const yCyc = uni(0.5, 1.1);
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    acc += pts[i].dx;
    const u = Math.min(1, Math.max(0, i / (pts.length - 1)));
    const env = Math.pow(Math.sin(Math.PI * u), 1.7);
    pts[i].x = acc;
    pts[i].y = drift * u + yAmp * env * Math.sin(2 * Math.PI * yCyc * u);
  }

  return pts;
}

// ---------------- 自检：与真人指纹对齐 ----------------
function audit(pts) {
  const v = [], dxs = [], dts = [];
  let maxV = 0, maxAt = 0;
  for (let i = 0; i < pts.length; i++) {
    const dt = Math.max(pts[i].dt, 0.001);
    const sp = Math.abs(pts[i].dx) / dt * 1000;
    v.push(sp); dxs.push(pts[i].dx); dts.push(pts[i].dt);
    if (sp > maxV) { maxV = sp; maxAt = i / Math.max(1, pts.length - 1); }
  }
  const ys = pts.map(p => p.y);
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const yStd = Math.sqrt(ys.reduce((a, b) => a + (b - my) ** 2, 0) / ys.length);
  const zero = dxs.filter(d => Math.abs(d) < 1e-9).length;
  const neg = dxs.filter(d => d < 0).length;
  const sortedDt = [...dts].sort((a, b) => a - b);
  const med = sortedDt[Math.floor(sortedDt.length / 2)];
  return {
    frames: pts.length,
    durationMs: Math.round(dts.reduce((a, b) => a + b, 0)),
    distance: +dxs.reduce((a, b) => a + b, 0).toFixed(2),
    speedMax: Math.round(maxV), peakAt: +maxAt.toFixed(3),
    yStd: +yStd.toFixed(1),
    dtMed: +med.toFixed(2), dtMax: Math.round(Math.max(...dts)),
    zeroPct: +(zero / pts.length * 100).toFixed(1),
    negFrames: neg,
  };
}

function report(label, a) {
  console.log(`\n[${label}]`);
  console.log(`  帧数 ${a.frames} | 时长 ${a.durationMs}ms | 距离 ${a.distance}px`);
  console.log(`  速度峰值 ${a.speedMax} px/s @ ${(a.peakAt * 100).toFixed(0)}%   (真人 9722 @ 74.5%)`);
  console.log(`  y std ${a.yStd}px  (真人 38)   dt 中位 ${a.dtMed}ms  (真人 5.1)   dt 最大 ${a.dtMax}`);
  console.log(`  零位移 ${a.zeroPct}%  (真人 4%)   负位移帧 ${a.negFrames}`);
}



// ---------------- 构造完整 payload（给 e2e_run_chain 用）----------------
function buildHumanData(opts = {}) {
  const gap = opts.gap;
  const xPos = opts.xPos != null ? opts.xPos : Math.round(gap * 300 / 296);
  const slidePos = opts.slidePos != null ? opts.slidePos : Math.round(xPos / 0.785);
  const flag = opts.flag != null ? String(opts.flag) : '1';
  const D = slidePos * ZOOM;                 // 手指需要走的屏幕位移
  const pts = generateTrack(D);

  const startX = opts.startX != null ? opts.startX : 628;
  const startY = opts.startY != null ? opts.startY : 690;
  const preMs = opts.preMs != null ? opts.preMs : 900;

  let t = preMs;
  const rawPts = [];
  for (const p of pts) {
    t += p.dt;
    rawPts.push({ x: Math.round(startX + p.x), y: Math.round(startY + p.y), t: Math.round(t), flag });
  }
  const tDown = preMs;
  const tUp = rawPts[rawPts.length - 1].t;
  const fmt = p => [p.x, p.y, p.t, p.flag].join(',');
  const last = rawPts[rawPts.length - 1];

  const now = Date.now();
  const trackStart = now - (tUp + 60);
  const trackList = {
    mc: [startX, startY, tDown, ' ', flag].join(','),
    tc: '',
    mu: [last.x, last.y, tUp, ' ', flag].join(','),
    te: '',
    mp: rawPts.map(fmt).join('|'),
    tmv: '',
    mm: rawPts.map(fmt).join('|'),
    ks: '',
    fi: '',
    startTime: trackStart,
    si: opts.si || '1906,1920,844,1906,844,907,955,0.24182627200619075,1920',
  };
  const arg = opts.arg != null ? opts.arg : crypto.randomBytes(10).toString('base64');
  const r = buildData({ trackList, trackStartTime: trackStart, verifyTime: now, xPos, slidePos, arg });
  const a = audit(pts);
  r.summary = Object.assign({ gap, xPos: String(xPos), slidePos: String(slidePos), flag,
    movement: Math.round(D), frames: a.frames, durationMs: a.durationMs,
    speedMax: a.speedMax, peakAt: a.peakAt, yStd: a.yStd, dtMed: a.dtMed,
    zeroPct: a.zeroPct, negFrames: a.negFrames, arg,
    dataLen: r.data.length, dataHead16: r.data.slice(0, 16) }, {});
  return r;
}

module.exports = { generateTrack, audit, buildHumanData };

if (require.main === module) {
  const submit = process.argv.includes('--submit');
  for (const D of [250, 480, 620]) {
    report(`D=${D}px`, audit(generateTrack(D)));
  }
  if (!submit) {
    console.log('\n（只做形态自检；加 --submit 走完整链）');
    process.exit(0);
  }
  const { execFileSync } = require('child_process');
  // 完整链：InitCaptcha → gap → 轨迹 → data → slideAuth
  execFileSync(process.execPath, ['e2e_run_chain.js', '--gen', 'human', '--submit'], { stdio: 'inherit' });
}
