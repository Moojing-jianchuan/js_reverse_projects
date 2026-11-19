// 综合缺口检测：形状对比度 + 亮度连通域 + 裁剪放大
const fs = require('fs');
const { PNG } = require('pngjs');
const load = (p) => PNG.sync.read(fs.readFileSync(p));

function analyze(backPath, shadowPath, cropOut) {
  const back = load(backPath), shad = load(shadowPath);
  const gb = (x, y) => { x = Math.min(Math.max(x, 0), back.width - 1); y = Math.min(Math.max(y, 0), back.height - 1); const i = (back.width * y + x) << 2; return (back.data[i] * 299 + back.data[i + 1] * 587 + back.data[i + 2] * 114) / 1000; };
  const sa = (x, y) => shad.data[((shad.width * y + x) << 2) + 3];
  let px = shad.width, py = shad.height, mx = 0, my = 0;
  for (let y = 0; y < shad.height; y++) for (let x = 0; x < shad.width; x++) if (sa(x, y) > 128) { if (x < px) px = x; if (x > mx) mx = x; if (y < py) py = y; if (y > my) my = y; }
  const pw = mx - px + 1, ph = my - py + 1;
  const inside = [], ring = [];
  for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) if (sa(px + dx, py + dy) > 128) inside.push([dx, dy]);
  for (let dy = -3; dy < ph + 3; dy++) for (let dx = -3; dx < pw + 3; dx++) {
    if (dx >= 0 && dy >= 0 && dx < pw && dy < ph && sa(px + dx, py + dy) > 128) continue;
    let near = false;
    for (let ky = -3; ky <= 3 && !near; ky++) for (let kx = -3; kx <= 3; kx++) { const nx = dx + kx, ny = dy + ky; if (nx >= 0 && ny >= 0 && nx < pw && ny < ph && sa(px + nx, py + ny) > 128) { near = true; break; } }
    if (near) ring.push([dx, dy]);
  }
  const scores = [];
  for (let y = 3; y + ph + 3 <= back.height; y++) for (let x = 3; x + pw + 3 <= back.width; x++) {
    let si = 0, sr = 0;
    for (const [dx, dy] of inside) si += gb(x + dx, y + dy);
    for (const [dx, dy] of ring) sr += gb(x + dx, y + dy);
    const mi = si / inside.length, mr = sr / ring.length;
    let v = 0; for (const [dx, dy] of inside) { const t = gb(x + dx, y + dy) - mi; v += t * t; }
    scores.push({ x, y, sc: Math.abs(mi - mr) / (1 + Math.sqrt(v / inside.length)), contrast: Math.abs(mi - mr), mi: +mi.toFixed(1) });
  }
  scores.sort((a, b) => b.sc - a.sc);
  // 亮度连通域（缺口常被填亮/填白）
  const bright = [];
  const seen = new Uint8Array(back.width * back.height);
  const stack = [];
  for (let y = 0; y < back.height; y++) for (let x = 0; x < back.width; x++) {
    const idx = y * back.width + x;
    if (seen[idx] || gb(x, y) < 205) continue;
    let cnt = 0, minx = x, maxx = x, miny = y, maxy = y; stack.push([x, y]); seen[idx] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop(); cnt++;
      if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= back.width || ny >= back.height) continue;
        const ni = ny * back.width + nx;
        if (seen[ni] || gb(nx, ny) < 205) continue;
        seen[ni] = 1; stack.push([nx, ny]);
      }
    }
    if (cnt > 400) bright.push({ cnt, box: [minx, miny, maxx - minx + 1, maxy - miny + 1] });
  }
  bright.sort((a, b) => b.cnt - a.cnt);
  // 裁剪：以 top 分数位置为中心
  if (cropOut) {
    const t = scores[0];
    const X0 = Math.max(0, t.x - 30), Y0 = Math.max(0, t.y - 30), W = 110, H = 110, S = 4;
    const dst = new PNG({ width: W * S, height: H * S });
    for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
      const sx = Math.min(X0 + Math.floor(x / S), back.width - 1), sy = Math.min(Y0 + Math.floor(y / S), back.height - 1);
      const si = ((back.width * sy) + sx) << 2, di = ((W * S * y) + x) << 2;
      dst.data[di] = back.data[si]; dst.data[di + 1] = back.data[si + 1]; dst.data[di + 2] = back.data[si + 2]; dst.data[di + 3] = 255;
    }
    fs.writeFileSync(cropOut, PNG.sync.write(dst));
  }
  return { back: [back.width, back.height], shadowBox: [px, py, pw, ph], topScore: scores.slice(0, 6).map(s => ({ x: s.x, y: s.y, sc: +s.sc.toFixed(2), contrast: +s.contrast.toFixed(0), meanIn: s.mi })), bright };
}

const r = analyze(process.argv[2], process.argv[3], process.argv[4]);
console.log(JSON.stringify(r, null, 1));
