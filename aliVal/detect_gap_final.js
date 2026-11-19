// 缺口检测（综合）：亮块连通域 + 形状对比度，输出候选
const fs = require('fs');
const { PNG } = require('pngjs');

const backPath = process.argv[2], shadowPath = process.argv[3];
const back = PNG.sync.read(fs.readFileSync(backPath));
const shad = PNG.sync.read(fs.readFileSync(shadowPath));
const W = back.width, H = back.height;
const gb = (x, y) => { const i = (W * y + x) << 2; return (back.data[i] * 299 + back.data[i + 1] * 587 + back.data[i + 2] * 114) / 1000; };
const sa = (x, y) => shad.data[((shad.width * y + x) << 2) + 3];
let px = shad.width, py = shad.height, mx = 0, my = 0;
for (let y = 0; y < shad.height; y++) for (let x = 0; x < shad.width; x++) if (sa(x, y) > 128) { if (x < px) px = x; if (x > mx) mx = x; if (y < py) py = y; if (y > my) my = y; }
const pw = mx - px + 1, ph = my - py + 1;

// 亮块
function brightComps(thresh) {
  const seen = new Uint8Array(W * H), out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (seen[idx]) continue;
    if (gb(x, y) < thresh) { seen[idx] = 1; continue; }
    let cnt = 0, minx = x, maxx = x, miny = y, maxy = y;
    const st = [[x, y]]; seen[idx] = 1;
    while (st.length) {
      const [cx, cy] = st.pop(); cnt++;
      if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (seen[ni]) continue;
        if (gb(nx, ny) < thresh) { seen[ni] = 1; continue; }
        seen[ni] = 1; st.push([nx, ny]);
      }
    }
    const w = maxx - minx + 1, h = maxy - miny + 1;
    if (cnt > 900 && w >= pw - 10 && w <= pw + 14 && h >= ph - 10 && h <= ph + 14) out.push({ x: minx, y: miny, w, h, cnt });
  }
  return out.sort((a, b) => b.cnt - a.cnt);
}

// 形状对比度
const inside = [], ring = [];
for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) if (sa(px + dx, py + dy) > 128) inside.push([dx, dy]);
for (let dy = -3; dy < ph + 3; dy++) for (let dx = -3; dx < pw + 3; dx++) {
  if (dx >= 0 && dy >= 0 && dx < pw && dy < ph && sa(px + dx, py + dy) > 128) continue;
  let near = false;
  for (let ky = -3; ky <= 3 && !near; ky++) for (let kx = -3; kx <= 3; kx++) { const nx = dx + kx, ny = dy + ky; if (nx >= 0 && ny >= 0 && nx < pw && ny < ph && sa(px + nx, py + ny) > 128) { near = true; break; } }
  if (near) ring.push([dx, dy]);
}
const score = [];
for (let y = 3; y + ph + 3 <= H; y++) for (let x = 3; x + pw + 3 <= W; x++) {
  let si = 0, sr = 0;
  for (const [dx, dy] of inside) si += gb(x + dx, y + dy);
  for (const [dx, dy] of ring) sr += gb(x + dx, y + dy);
  const mi = si / inside.length, mr = sr / ring.length;
  let v = 0; for (const [dx, dy] of inside) { const t = gb(x + dx, y + dy) - mi; v += t * t; }
  score.push({ x, y, sc: Math.abs(mi - mr) / (1 + Math.sqrt(v / inside.length)) });
}
score.sort((a, b) => b.sc - a.sc);
const bright = brightComps(195).concat(brightComps(205), brightComps(215));
const uniq = [];
for (const b of bright) if (!uniq.find(u => Math.abs(u.x - b.x) <= 3 && Math.abs(u.y - b.y) <= 3)) uniq.push(b);
console.log(JSON.stringify({
  size: [W, H], shadowBox: [px, py, pw, ph],
  brightTop: uniq.slice(0, 5),
  shapeTop: score.slice(0, 5).map(s => ({ x: s.x, y: s.y, sc: +s.sc.toFixed(2) })),
  pick: uniq.length ? { x: uniq[0].x, src: 'bright' } : { x: score[0].x, src: 'shape' },
}, null, 1));
