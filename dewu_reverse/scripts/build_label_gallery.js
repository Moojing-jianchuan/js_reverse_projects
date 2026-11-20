'use strict';
/**
 * 自举「类目记忆库」：data/label_gallery.json
 *
 * 为什么需要它：题目图是**文字标签**（如「沙发」），和候选照片不在同一特征空间，
 * 纯 CPU 的相似度算法无法直接打分。能做的只有「同类标签 → 该类目历史正确答案图」的图-图检索。
 * 而"历史正确答案"从哪来？——用 oracle 通道（bgImage 块投票）自动标注，无需人工。
 *
 * 用法：
 *   node scripts/build_label_gallery.js              # 扫 artifacts 下所有 captcha/call 样本
 *   node scripts/build_label_gallery.js --dry        # 只打印，不落盘
 *
 * 产出结构：
 *   { version, builtAt, entries: { "<labelFp>": { label, w, h, images: [ {sha, hist, phash, thumb, hog, src} ] } } }
 */
const fs = require('fs');
const path = require('path');
const R = require('../src/captcha_recognizer');
const I = R._internal;

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

/** 收集样本：capture_*.json 里 captcha/call 的响应体 */
function collectSamples() {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'artifacts'))) {
    if (!/\.json$/.test(f)) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', f), 'utf8')); } catch (e) { continue; }
    if (!j || !Array.isArray(j.requests)) continue;
    for (const r of j.requests) {
      if (!/captcha\/call/.test(r.url || '')) continue;
      let body;
      try { body = JSON.parse(r.response_body); } catch (e) { continue; }
      const d = body && body.data;
      if (!d || !Array.isArray(d.bgList) || !d.image || !d.bgImage) continue;
      out.push({ file: f, data: d });
    }
  }
  return out;
}

(async () => {
  const samples = collectSamples();
  console.log(`扫描到 ${samples.length} 个 captcha/call 样本`);

  const gallery = { version: 1, builtAt: new Date().toISOString(), entries: {} };

  for (const s of samples) {
    const d = s.data;
    // 1) 题目图 → 标签指纹
    const tFeats = await I.buildFeatures(I.dataUrlToBuffer(d.image));
    const tInfo = I.classifyTarget(tFeats);
    const fp = I.labelFingerprint(tFeats);
    if (tInfo.type !== 'label') {
      console.log(`  ! ${s.file}: 题目图不是文字标签(${tInfo.type})，跳过`);
      continue;
    }

    // 2) oracle 通道定答案下标
    let feats = [];
    for (const u of d.bgList) {
      if (!I.isDataUrl(u)) { feats.push(null); continue; }
      feats.push(await I.buildFeatures(I.dataUrlToBuffer(u)));
    }
    const bgFeats = await I.buildFeatures(I.dataUrlToBuffer(d.bgImage));
    const { share } = I.oracleVote(bgFeats, feats, I.BLOCK_G);
    let best = -1, bestS = -1;
    share.forEach((v, i) => { if (v > bestS) { bestS = v; best = i; } });
    if (best < 0) { console.log(`  ! ${s.file}: oracle 未能定答案`); continue; }

    const entry = gallery.entries[fp.fp] || (gallery.entries[fp.fp] = { label: null, w: fp.w, h: fp.h, images: [] });
    const gi = I.featureToGalleryImage(feats[best], { src: `${s.file}#${best}`, oracleShare: +bestS.toFixed(3) });
    if (!entry.images.some(x => x.sha === gi.sha)) entry.images.push(gi);
    console.log(`  ✓ ${s.file}: 标签 ${fp.fp} (${fp.w}×${fp.h}) ← 答案候选 #${best}（oracle 得票 ${(bestS * 100).toFixed(1)}%）`);
  }

  const target = path.join(ROOT, 'data', 'label_gallery.json');
  if (DRY) {
    console.log(JSON.stringify(gallery, null, 2).slice(0, 800));
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(gallery, null, 2));
  const n = Object.values(gallery.entries).reduce((a, e) => a + e.images.length, 0);
  console.log(`\n写入 ${path.relative(ROOT, target)}：${Object.keys(gallery.entries).length} 个标签类目 / ${n} 张答案图`);
})().catch(e => { console.error(e); process.exit(1); });
