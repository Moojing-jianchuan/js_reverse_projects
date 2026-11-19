// 缺口检测 v4：shadow 轮廓 vs back 梯度（鲁棒版）
const fs = require('fs');
const { PNG } = require('pngjs');

function detect(backPath, shadowPath) {
  const back = PNG.sync.read(fs.readFileSync(backPath));
  const shad = PNG.sync.read(fs.readFileSync(shadowPath));
  const W = back.width, H = back.height;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const j = i << 2;
    gray[i] = (back.data[j] * 299 + back.data[j + 1] * 587 + back.data[j + 2] * 114) / 1000;
  }
  const g = (x, y) => { x = Math.min(Math.max(x, 0), W - 1); y = Math.min(Math.max(y, 0), H - 1); return gray[y * W + x]; };
  // 梯度幅值
  const grad = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = g(x + 1, y) - g(x - 1, y), gy = g(x, y + 1) - g(x, y - 1);
    grad[y * W + x] = Math.sqrt(gx * gx + gy * gy);
  }
  const sa = (x, y) => shad.data[((shad.width * y + x) << 2) + 3];
  let px = shad.width, py = shad.height, mx = 0, my = 0;
  for (let y = 0; y < shad.height; y++) for (let x = 0; x < shad.width; x++) if (sa(x, y) > 128) { if (x < px) px = x; if (x > mx) mx = x; if (y < py) py = y; if (y > my) my = y; }
  const pw = mx - px + 1, ph = my - py + 1;
  // 轮廓点（alpha 边界内 1px）
  const edge = [];
  for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) {
    if (sa(px + dx, py + dy) <= 128) continue;
    let isEdge = false;
    for (const [kx, ky] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = dx + kx, ny = dy + ky;
      if (nx < 0 || ny < 0 || nx >= pw || ny >= ph || sa(px + nx, py + ny) <= 128) { isEdge = true; break; }
    }
    if (isEdge) edge.push([dx, dy]);
  }
  const res = [];
  for (let y = 0; y + ph <= H; y++) for (let x = 0; x + pw <= W; x++) {
    let s = 0;
    for (const [dx, dy] of edge) s += grad[(y + dy) * W + (x + dx)];
    res.push({ x, y, score: s / edge.length });
  }
  res.sort((a, b) => b.score - a.score);
  return { W, H, shadowBox: [px, py, pw, ph], edgeCount: edge.length, top: res.slice(0, 6).map(r => ({ x: r.x, y: r.y, s: +r.score.toFixed(2) })) };
}

const pairs = JSON.parse(process.argv[2] || '[]');
for (const p of pairs) {
  const r = detect(p.back, p.shadow);
  console.log(`\n${p.name} shadowBox=${JSON.stringify(r.shadowBox)}`);
  console.log('  top:', JSON.stringify(r.top));
  if (p.truth !== undefined) console.log('  truth:', p.truth, ' top1 err:', r.top[0].x - p.truth);
}
module.exports = { detect };
