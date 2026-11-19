// gap detection v5: NCC + edge gradient + inner gradient (translucent block signature)
const fs = require('fs');
const { PNG } = require('pngjs');

function prepare(backPath, shadowPath) {
  const back = PNG.sync.read(fs.readFileSync(backPath));
  const shad = PNG.sync.read(fs.readFileSync(shadowPath));
  const W = back.width, H = back.height;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const j = i << 2; gray[i] = (back.data[j] * 299 + back.data[j + 1] * 587 + back.data[j + 2] * 114) / 1000; }
  const g = (x, y) => gray[Math.min(Math.max(y, 0), H - 1) * W + Math.min(Math.max(x, 0), W - 1)];
  const grad = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const gx = g(x + 1, y) - g(x - 1, y), gy = g(x, y + 1) - g(x, y - 1); grad[y * W + x] = Math.hypot(gx, gy); }
  const sa = (x, y) => shad.data[((shad.width * y + x) << 2) + 3];
  const sg = (x, y) => { const i = ((shad.width * y + x) << 2); return (shad.data[i] * 299 + shad.data[i + 1] * 587 + shad.data[i + 2] * 114) / 1000; };
  let px = shad.width, py = shad.height, mx = 0, my = 0;
  for (let y = 0; y < shad.height; y++) for (let x = 0; x < shad.width; x++) if (sa(x, y) > 128) { if (x < px) px = x; if (x > mx) mx = x; if (y < py) py = y; if (y > my) my = y; }
  const pw = mx - px + 1, ph = my - py + 1;
  const edge = [], inner = [];
  for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) {
    if (sa(px + dx, py + dy) <= 128) continue;
    inner.push([dx, dy]);
    let isEdge = false;
    for (const [kx, ky] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = dx + kx, ny = dy + ky; if (nx < 0 || ny < 0 || nx >= pw || ny >= ph || sa(px + nx, py + ny) <= 128) { isEdge = true; break; } }
    if (isEdge) edge.push([dx, dy]);
  }
  return { W, H, gray, grad, sa, sg, box: [px, py, pw, ph], edge, inner };
}

function scoreAt(ctx, x, y) {
  const { W, grad, gray, box, edge, inner, sg } = ctx;
  const [px, py] = box;
  let n = 0, sb = 0, ss = 0, sbb = 0, sss = 0, sbs = 0, gsum = 0;
  for (const [dx, dy] of inner) {
    const idx = (y + dy) * W + (x + dx);
    const b = gray[idx], s = sg(px + dx, py + dy);
    n++; sb += b; ss += s; sbb += b * b; sss += s * s; sbs += b * s; gsum += grad[idx];
  }
  const mb = sb / n, ms = ss / n;
  const cov = sbs / n - mb * ms;
  const vb = sbb / n - mb * mb, vs = sss / n - ms * ms;
  const ncc = (vb > 1e-6 && vs > 1e-6) ? cov / Math.sqrt(vb * vs) : 0;
  let es = 0;
  for (const [dx, dy] of edge) es += grad[(y + dy) * W + (x + dx)];
  const eg = es / edge.length;
  const ig = gsum / n;
  let varIn = 0;
  for (const [dx, dy] of inner) { const t = gray[(y + dy) * W + (x + dx)] - mb; varIn += t * t; }
  const sdIn = Math.sqrt(varIn / n);
  return { ncc, eg, ig, sdIn, mean: mb };
}

function detect(backPath, shadowPath, weights = {}) {
  const ctx = prepare(backPath, shadowPath);
  const { W, H, box } = ctx;
  const [px, py, pw, ph] = box;
  const w = { edgeGrad: 2, ncc: 1, flat: 1, sd: 1 / 60, ...weights };
  const out = [];
  for (let y = 0; y + ph <= H; y++) for (let x = 0; x + pw <= W; x++) {
    const s = scoreAt(ctx, x, y);
    const score = w.edgeGrad * (s.eg / (1 + s.ig)) + w.ncc * s.ncc - w.flat * (s.ig / 20) - w.sd * s.sdIn;
    out.push({ x, y, score, ...s });
  }
  out.sort((a, b) => b.score - a.score);
  return { box, top: out.slice(0, 6).map(r => ({ x: r.x, y: r.y, sc: +r.score.toFixed(2), ncc: +r.ncc.toFixed(2), eg: +r.eg.toFixed(1), ig: +r.ig.toFixed(1), sd: +r.sdIn.toFixed(1) })) };
}

if (require.main === module) {
  const cases = JSON.parse(fs.readFileSync(process.argv[2] || 'config/gap_cases.json', 'utf8'));
  for (const c of cases) {
    const r = detect(c.back, c.shadow);
    const err = c.truth !== undefined ? r.top[0].x - c.truth : null;
    console.log(`${c.name}: truth=${c.truth} top1=${r.top[0].x},${r.top[0].y} err=${err} | ${JSON.stringify(r.top.slice(0, 3))}`);
  }
}
module.exports = { detect };
