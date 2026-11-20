'use strict';
// 把样本里的 base64 图落地成 PNG，方便人眼看图 + 作为离线测试固定输入
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'captcha_dump');

function decodeDataUrl(u) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(u);
  if (!m) return null;
  return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
}

(async () => {
  for (const f of ['capture_call.json', 'capture_call2.json']) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', f), 'utf8'));
    const resp = JSON.parse(j.requests[0].response_body);
    const d = resp.data;
    const dir = path.join(OUT, f.replace('.json', ''));
    fs.mkdirSync(dir, { recursive: true });

    const tgt = decodeDataUrl(d.image);
    if (tgt) {
      const meta = await sharp(tgt.buf).metadata();
      console.log(f, 'target:', meta.format, meta.width + 'x' + meta.height, 'bytes', tgt.buf.length);
      await sharp(tgt.buf).png().toFile(path.join(dir, 'target.png'));
    }
    for (let i = 0; i < d.bgList.length; i++) {
      const u = d.bgList[i];
      const dec = decodeDataUrl(u);
      if (!dec) { console.log(' ', f, 'bgList[' + i + '] NOT dataurl ->', u); continue; }
      const meta = await sharp(dec.buf).metadata();
      console.log(' ', f, 'bgList[' + i + ']', meta.format, meta.width + 'x' + meta.height, 'bytes', dec.buf.length);
      await sharp(dec.buf).png().toFile(path.join(dir, 'bg' + i + '.png'));
    }
    const bg = decodeDataUrl(d.bgImage || '');
    if (bg) {
      const meta = await sharp(bg.buf).metadata();
      console.log(' ', f, 'bgImage:', meta.format, meta.width + 'x' + meta.height);
      await sharp(bg.buf).png().toFile(path.join(dir, 'bgImage.png'));
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
      no: d.no, sessionId: d.sessionId, type: d.type, bcn: d.bcn, platform: d.platform, webp: d.webp,
    }, null, 2));
  }
})().catch(e => { console.error(e); process.exit(1); });
