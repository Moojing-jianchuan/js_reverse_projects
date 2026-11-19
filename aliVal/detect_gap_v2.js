// 缺口检测 A/B：形状内/外对比度（边界安全）
const fs = require('fs');
const { PNG } = require('pngjs');

const load = (p) => PNG.sync.read(fs.readFileSync(p));
const back = load(process.argv[2] || 'config/images/cur_back.png');
const shad = load(process.argv[3] || 'config/images/cur_shadow.png');
const gb = (x, y) => { const xx = Math.min(Math.max(x, 0), back.width - 1), yy = Math.min(Math.max(y, 0), back.height - 1); const i = (back.width * yy + xx) << 2; return (back.data[i] * 299 + back.data[i + 1] * 587 + back.data[i + 2] * 114) / 1000; };
const sa = (x, y) => shad.data[((shad.width * y + x) << 2) + 3];

let px = shad.width, py = shad.height, mx = 0, my = 0;
for (let y = 0; y < shad.height; y++) for (let x = 0; x < shad.width; x++) if (sa(x, y) > 128) { if (x < px) px = x; if (x > mx) mx = x; if (y < py) py = y; if (y > my) my = y; }
const pw = mx - px + 1, ph = my - py + 1;
console.log('shadow bbox', [px, py, pw, ph], 'back', back.width + 'x' + back.height);

const inside = [];
for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) if (sa(px + dx, py + dy) > 128) inside.push([dx, dy]);
const ring = [];
for (let dy = -3; dy < ph + 3; dy++) for (let dx = -3; dx < pw + 3; dx++) {
  if (dx >= 0 && dy >= 0 && dx < pw && dy < ph && sa(px + dx, py + dy) > 128) continue;
  let near = false;
  for (let ky = -3; ky <= 3 && !near; ky++) for (let kx = -3; kx <= 3; kx++) {
    const nx = dx + kx, ny = dy + ky;
    if (nx >= 0 && ny >= 0 && nx < pw && ny < ph && sa(px + nx, py + ny) > 128) { near = true; break; }
  }
  if (near) ring.push([dx, dy]);
}
const results = [];
for (let y = 3; y + ph + 3 <= back.height; y++) for (let x = 3; x + pw + 3 <= back.width; x++) {
  let si = 0, sr = 0;
  for (const [dx, dy] of inside) si += gb(x + dx, y + dy);
  for (const [dx, dy] of ring) sr += gb(x + dx, y + dy);
  const mi = si / inside.length, mr = sr / ring.length;
  const contrast = Math.abs(mi - mr);
  let varIn = 0;
  for (const [dx, dy] of inside) { const v = gb(x + dx, y + dy) - mi; varIn += v * v; }
  varIn /= inside.length;
  results.push({ x, y, contrast: +contrast.toFixed(1), varIn: +Math.sqrt(varIn).toFixed(1), score: +(contrast / (1 + Math.sqrt(varIn))).toFixed(2) });
}
const byScore = [...results].sort((a, b) => b.score - a.score).slice(0, 10);
console.log('top by score:', byScore);
const byContrast = [...results].sort((a, b) => b.contrast - a.contrast).slice(0, 6);
console.log('top by contrast:', byContrast);
