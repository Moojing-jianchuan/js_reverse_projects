'use strict';
/**
 * 反向定位：把 bgImage 按 8×8 网格取块均值，逐块找「最接近的候选」，打印"块归属图"。
 * 若答案图确实是 bgImage 的来源，块归属应大面积集中在其下标上。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');
const b64 = u => { const m = /^data:[^;]*;base64,(.*)$/s.exec(u || ''); return m ? Buffer.from(m[1], 'base64') : null; };

async function rgb(buf, w, h) {
  const { data, info } = await sharp(buf).resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    if (ch >= 3) { out[i * 3] = data[i * ch] / 255; out[i * 3 + 1] = data[i * ch + 1] / 255; out[i * 3 + 2] = data[i * ch + 2] / 255; }
    else { const v = data[i * ch] / 255; out[i * 3] = v; out[i * 3 + 1] = v; out[i * 3 + 2] = v; }
  }
  return out;
}

(async () => {
  const G = 8, S = 80, B = S / G;
  const blockMeans = (img) => {
    const m = new Float32Array(G * G * 3);
    for (let by = 0; by < G; by++) for (let bx = 0; bx < G; bx++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) {
        const o = (y * S + x) * 3; r += img[o]; g += img[o + 1]; b += img[o + 2]; n++;
      }
      const k = (by * G + bx) * 3;
      m[k] = r / n; m[k + 1] = g / n; m[k + 2] = b / n;
    }
    return m;
  };

  for (const f of ['capture_call.json', 'capture_call2.json']) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', f), 'utf8'));
    const d = JSON.parse(j.requests[0].response_body).data;
    console.log('=====', f);
    const gb = blockMeans(await rgb(b64(d.bgImage), S, S));
    const cm = [];
    for (let i = 0; i < d.bgList.length; i++) {
      const buf = b64(d.bgList[i]);
      cm.push(buf ? blockMeans(await rgb(buf, S, S)) : null);
    }
    const tally = new Array(cm.length).fill(0);
    const map = [];
    for (let by = 0; by < G; by++) {
      let line = '';
      for (let bx = 0; bx < G; bx++) {
        const k = (by * G + bx) * 3;
        let bi = -1, bd = 1e9;
        for (let i = 0; i < cm.length; i++) {
          if (!cm[i]) continue;
          const dr = gb[k] - cm[i][k], dg = gb[k + 1] - cm[i][k + 1], db = gb[k + 2] - cm[i][k + 2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bd) { bd = dist; bi = i; }
        }
        tally[bi]++;
        line += bi < 0 ? '?' : bi;
      }
      map.push(line);
    }
    console.log('  逐块最接近的候选（8×8 网格）:');
    map.forEach(l => console.log('   ', l));
    console.log('  块归属计数:', tally);
  }
})().catch(e => { console.error(e); process.exit(1); });
