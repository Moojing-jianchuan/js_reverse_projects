'use strict';
/**
 * 对比若干「纯 CPU 图描述子」在跨样本 1-shot 检索上的表现：
 * 用 A 样本的正确答案图当 gallery，去除 B 样本里"同类的那张"。
 * 目标：找到能把"沙发"排第一的描述子（若存在），否则如实记录全部失败。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');
const b64 = u => { const m = /^data:[^;]*;base64,(.*)$/s.exec(u || ''); return m ? Buffer.from(m[1], 'base64') : null; };

async function gray(buf, w, h) {
  const { data, info } = await sharp(buf).resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = ch >= 3 ? (0.299 * data[i * ch] + 0.587 * data[i * ch + 1] + 0.114 * data[i * ch + 2]) / 255 : data[i * ch] / 255;
  return out;
}
async function rgb(buf, w, h) {
  const { data, info } = await sharp(buf).resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; const out = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    if (ch >= 3) { out[i * 3] = data[i * ch] / 255; out[i * 3 + 1] = data[i * ch + 1] / 255; out[i * 3 + 2] = data[i * ch + 2] / 255; }
    else { const v = data[i * ch] / 255; out[i * 3] = v; out[i * 3 + 1] = v; out[i * 3 + 2] = v; }
  }
  return out;
}
const corr = (a, b) => {
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sa = 0, sb = 0, sab = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sa += da * da; sb += db * db; sab += da * db; }
  return sab / (Math.sqrt(sa * sb) || 1);
};

// 描述子 1：空间颜色直方图 3×3 网格 × 12 bin(每通道量化 4 级, 取 r,g,b 三通道各自 4 bin)
function spatialColor(img, S = 48, G = 3) {
  const out = [];
  const cell = S / G;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const h = new Float64Array(16);
    for (let y = Math.floor(gy * cell); y < Math.floor((gy + 1) * cell); y++) {
      for (let x = Math.floor(gx * cell); x < Math.floor((gx + 1) * cell); x++) {
        const o = (y * S + x) * 3;
        const r = Math.min(3, Math.floor(img[o] * 4)), g = Math.min(3, Math.floor(img[o + 1] * 4)), b = Math.min(3, Math.floor(img[o + 2] * 4));
        // 编码亮度和色相粗分：用 (r>>1,g>>1,b>>1) 4维 + 颜色占比
        h[(r * 4 + g) % 16] += 1; h[(b * 4 + r) % 16] += 0.5;
      }
    }
    const n = h.reduce((a, b) => a + b, 0) || 1;
    out.push(...Array.from(h).map(v => v / n));
  }
  return Float32Array.from(out);
}

// 描述子 2：HOG-lite（4×4 cell，每 cell 8 方向梯度直方图）
function hogLite(g, S = 64, G = 4, B = 8) {
  const cell = S / G, out = new Float32Array(G * G * B);
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const dx = g[y * S + x + 1] - g[y * S + x - 1];
      const dy = g[(y + 1) * S + x] - g[(y - 1) * S + x];
      const mag = Math.hypot(dx, dy);
      let ang = Math.atan2(dy, dx); if (ang < 0) ang += Math.PI;
      const bin = Math.min(B - 1, Math.floor((ang / Math.PI) * B));
      const cx = Math.min(G - 1, Math.floor(x / cell)), cy = Math.min(G - 1, Math.floor(y / cell));
      out[(cy * G + cx) * B + bin] += mag;
    }
  }
  // L2 归一化
  let s = 0; for (const v of out) s += v * v; s = Math.sqrt(s) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= s;
  return out;
}

// 描述子 3：色相直方图（HSV H 12 bin + S 4 bin + V 4 bin）
function hsvHist(img, S = 48) {
  const out = new Float32Array(12 + 8);
  let n = 0;
  for (let i = 0; i < S * S; i++) {
    const r = img[i * 3], g = img[i * 3 + 1], b = img[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 1e-6) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    const s = mx === 0 ? 0 : d / mx;
    out[Math.min(11, Math.floor(h / 30))] += 1;
    out[12 + Math.min(3, Math.floor(s * 4))] += 0.5;
    n++;
  }
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

// 描述子 4：亮度布局 8×8 均值（去掉色彩，纯构图）
function layout(g, S = 48, G = 8) {
  const cell = S / G, out = new Float32Array(G * G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let s = 0, n = 0;
    for (let y = Math.floor(gy * cell); y < Math.floor((gy + 1) * cell); y++)
      for (let x = Math.floor(gx * cell); x < Math.floor((gx + 1) * cell); x++) { s += g[y * S + x]; n++; }
    out[gy * G + gx] = s / n;
  }
  return out;
}

(async () => {
  const load = async f => {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', f), 'utf8'));
    const d = JSON.parse(j.requests[0].response_body).data;
    const items = [];
    for (const u of d.bgList) {
      const buf = b64(u); if (!buf) { items.push(null); continue; }
      items.push({
        g64: await gray(buf, 64, 64), g48: await gray(buf, 48, 48), rgb48: await rgb(buf, 48, 48),
      });
    }
    return items;
  };
  const A = await load('capture_call.json');
  const B = await load('capture_call2.json');
  const ansA = 0, ansB = 3;

  const desc = {
    'spatialColor': it => spatialColor(it.rgb48),
    'hogLite': it => hogLite(it.g64),
    'hsvHist': it => hsvHist(it.rgb48),
    'layout8x8': it => layout(it.g48),
    'layout+hog': it => Float32Array.from([...layout(it.g48), ...hogLite(it.g64)]),
    'spatialColor+hog': it => Float32Array.from([...spatialColor(it.rgb48), ...hogLite(it.g64)]),
  };

  for (const [name, f] of Object.entries(desc)) {
    const va = A.map(x => x ? f(x) : null), vb = B.map(x => x ? f(x) : null);
    const rb = vb.map((v, i) => ({ i, s: v ? corr(v, va[ansA]) : -9 })).sort((x, y) => y.s - x.s);
    const ra = va.map((v, i) => ({ i, s: v ? corr(v, vb[ansB]) : -9 })).sort((x, y) => y.s - x.s);
    console.log(`[${name}] A图→B: top1=${rb[0].i} ${rb[0].i === ansB ? 'HIT' : 'miss'} (${rb[0].s.toFixed(3)}) | B图→A: top1=${ra[0].i} ${ra[0].i === ansA ? 'HIT' : 'miss'} (${ra[0].s.toFixed(3)})`);
    console.log('   B排名:', vb.map((v, i) => (v ? corr(v, va[ansA]) : -9).toFixed(2)).join(' '));
    console.log('   A排名:', va.map((v, i) => (v ? corr(v, vb[ansB]) : -9).toFixed(2)).join(' '));
  }
})().catch(e => { console.error(e); process.exit(1); });
