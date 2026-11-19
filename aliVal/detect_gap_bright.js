// 缺口候选：亮连通域（半透明白块）
const fs = require('fs');
const { PNG } = require('pngjs');

function detect(path, thresh) {
  const img = PNG.sync.read(fs.readFileSync(path));
  const w = img.width, h = img.height;
  const g = (x, y) => { const i = (w * y + x) << 2; return (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000; };
  const seen = new Uint8Array(w * h);
  const comps = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const idx = y * w + x;
    if (seen[idx] || g(x, y) < thresh) continue;
    let cnt = 0, minx = x, maxx = x, miny = y, maxy = y;
    const stack = [[x, y]]; seen[idx] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop(); cnt++;
      if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || g(nx, ny) < thresh) continue;
        seen[ni] = 1; stack.push([nx, ny]);
      }
    }
    if (cnt > 500) comps.push({ cnt, x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 });
  }
  comps.sort((a, b) => b.cnt - a.cnt);
  return comps;
}

for (const f of process.argv.slice(2)) {
  console.log('\n=== ' + f);
  for (const t of [190, 205, 220]) {
    const c = detect(f, t).slice(0, 4);
    console.log('  thresh ' + t + ':', JSON.stringify(c));
  }
}
