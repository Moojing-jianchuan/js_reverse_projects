// e2e_gap.js — 缺口检测 v3（本项目的最终判定口径）
//
// 三处判据联合（对 3 张真实图逐张目视校验一致，误差 ≤2px）：
//   1) shadow.png 的 alpha 包围盒 (px,py,pw,ph) 给出拼图块形状；**py 与 back.png 里缺口的 y 基本重合**
//      （实测 py=107→命中 y=108；py=64→66；py=67→68），所以 y 只需在 py±6 内搜索；
//   2) 缺口是"亮且内部平整"的实心填充：取 mask 腐蚀 4px 的 core（1175 点），
//      在 y∈[py-6,py+6] 上滑 x，要求 core 均值 > 150，按 core 标准差升序取最优（越小越像纯色填充）；
//   3) 返回值 gap = 拼图块元素的 translate x（shadow 坐标 dx=0 即 translate=0），
//      即"把块放到图片坐标 x=gap 就对齐缺口"，与服务端答案口径一致。
//
// 为什么不能全图搜索：全图会被"天空/云层"这类大片亮而平滑的区域占据假峰
// （历史 detect_gap_* 的 188/207 分歧、以及 shape 法在 img2 上错答 207 都是这个原因）。
const fs = require('fs');
const { PNG } = require('pngjs');

function detect(backPath, shadowPath, opts = {}) {
  const yTol = opts.yTol == null ? 6 : opts.yTol;
  const erode = opts.erode == null ? 4 : opts.erode;
  const back = PNG.sync.read(fs.readFileSync(backPath));
  const shad = PNG.sync.read(fs.readFileSync(shadowPath));
  const W = back.width, H = back.height, SW = shad.width, SH = shad.height;
  const gb = (x, y) => { const i = (W * y + x) << 2; return (back.data[i] * 299 + back.data[i + 1] * 587 + back.data[i + 2] * 114) / 1000; };
  const sa = (x, y) => shad.data[((SW * y + x) << 2) + 3];

  let px = SW, py = SH, mx = -1, my = -1;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (sa(x, y) > 128) { if (x < px) px = x; if (x > mx) mx = x; if (y < py) py = y; if (y > my) my = y; }
  const pw = mx - px + 1, ph = my - py + 1;
  const M = (dx, dy) => dx >= 0 && dy >= 0 && dx < pw && dy < ph && sa(px + dx, py + dy) > 128;

  const core = [];
  for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) {
    let ok = true;
    for (let ky = -erode; ky <= erode && ok; ky++) for (let kx = -erode; kx <= erode; kx++) if (!M(dx + kx, dy + ky)) { ok = false; break; }
    if (ok) core.push([dx, dy]);
  }

  const cands = [];
  const y0 = Math.max(2, py - yTol), y1 = Math.min(H - ph - 2, py + yTol);
  for (let y = y0; y <= y1; y++) {
    for (let x = 2; x + pw + 2 <= W; x++) {
      let a = 0, a2 = 0;
      for (const [dx, dy] of core) { const v = gb(x + dx, y + dy); a += v; a2 += v * v; }
      const m = a / core.length, sd = Math.sqrt(Math.max(0, a2 / core.length - m * m));
      cands.push({ x, y, m: +m.toFixed(1), sd: +sd.toFixed(2) });
    }
  }
  const bright = cands.filter(c => c.m > 150).sort((a, b) => a.sd - b.sd);
  if (!bright.length) return { ok: false, reason: 'no bright-flat candidate', image: [W, H], shadowBox: [px, py, pw, ph] };

  // 取最平整候选的 x 邻域众数（±2 内）
  const best = bright[0];
  const cluster = bright.filter(c => Math.abs(c.x - best.x) <= 2 && Math.abs(c.y - best.y) <= 1);
  const xs = cluster.map(c => c.x).sort((a, b) => a - b);
  const gap = xs[Math.floor(xs.length / 2)];
  return {
    ok: true,
    image: [W, H], shadowBox: [px, py, pw, ph], corePoints: core.length,
    gap, gapY: best.y, confidence: { mean: best.m, sd: best.sd, cluster: xs.length },
    top: bright.slice(0, 5),
  };
}

module.exports = { detect };

if (require.main === module) {
  console.log(JSON.stringify(detect(process.argv[2], process.argv[3]), null, 1));
}
