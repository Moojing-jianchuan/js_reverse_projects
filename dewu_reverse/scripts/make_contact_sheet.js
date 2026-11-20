'use strict';
/**
 * 生成人眼复核用的联系图（contact sheet）：
 *   第 1 行：题目图(target) · 底图(bgImage) · 候选0 · 候选1
 *   第 2 行：候选2 · 候选3 · 候选4 · 候选5
 * 黄金标签所在的格子画**绿色边框**；占位（blank.png）画灰框。
 *
 *   node scripts/make_contact_sheet.js
 *   输出 artifacts/captcha_dump/<sample>_sheet.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const GOLDEN = { 'capture_call.json': 0, 'capture_call2.json': 3 };
const TILE = 160, PAD = 6, GAP = 10;

async function tile(file, label, caption) {
  // label: 'gt' | 'blank' | ''
  const rect = label === 'gt' ? '#22c55e' : label === 'blank' ? '#9ca3af' : '#d1d5db';
  const size = TILE + PAD * 2;
  let inner;
  if (file) {
    inner = await sharp(file).resize(TILE, TILE, { fit: 'contain', background: { r: 255, g: 255, b: 255 }, kernel: 'nearest' }).png().toBuffer();
  } else {
    inner = await sharp({ create: { width: TILE, height: TILE, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  }
  const cap = caption ? `<text x="${size / 2}" y="${size - 12}" font-family="sans-serif" font-size="20"
      text-anchor="middle" fill="#111">${caption}</text>` : '';
  const svg = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="none" stroke="${rect}" stroke-width="${label ? 6 : 2}"/>
    ${cap}
  </svg>`);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: inner, left: PAD, top: PAD }, { input: svg, left: 0, top: 0 }])
    .png().toBuffer();
}

(async () => {
  for (const f of Object.keys(GOLDEN)) {
    const dir = path.join(ROOT, 'artifacts', 'captcha_dump', f.replace('.json', ''));
    const d = JSON.parse(JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', f), 'utf8')).requests[0].response_body).data;
    const gt = GOLDEN[f];

    const tiles = [];
    tiles.push(await tile(path.join(dir, 'target.png'), '', '目标图'));        // 题目图
    tiles.push(await tile(path.join(dir, 'bgImage.png'), '', 'bgImage'));     // 底图
    for (let i = 0; i < 6; i++) {
      const p = path.join(dir, 'bg' + i + '.png');
      if (!fs.existsSync(p)) { tiles.push(await tile(null, 'blank', '#' + i + ' blank')); continue; } // URL 占位
      tiles.push(await tile(p, i === gt ? 'gt' : '', (i === gt ? '#' + i + ' ★' : '#' + i)));
    }
    const size = TILE + PAD * 2;
    const W = 4 * size + 5 * GAP, H = 2 * size + 3 * GAP;
    const out = sharp({ create: { width: W, height: H, channels: 4, background: { r: 245, g: 245, b: 246, alpha: 1 } } });
    const comps = tiles.map((b, i) => ({
      input: b,
      left: GAP + (i % 4) * (size + GAP),
      top: GAP + Math.floor(i / 4) * (size + GAP),
    }));
    const target = path.join(dir, 'sheet.png');
    await out.composite(comps).png().toFile(target);
    console.log('写出', path.relative(ROOT, target));
  }
})().catch(e => { console.error(e); process.exit(1); });
