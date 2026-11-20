'use strict';
/**
 * 得物图集验证码识别器 —— 离线自测 / 准确率报告生成器
 *
 *   node scripts/test_recognizer.js              # 全量
 *   node scripts/test_recognizer.js --quick      # 合成基准只跑少量样本
 *
 * 输出：
 *   1) 每个真实样本的候选打分表（top1/top2/margin/confidence/耗时）
 *   2) oracle 通道 vs 人眼黄金标签
 *   3) label 通道「跨样本 1-shot 留一」检验（真正的准确率，不是自匹配）
 *   4) crop 通道合成裁剪基准（已知真值，可量化 top1）
 *   5) 结果落盘 artifacts/recognizer_test_results.json
 *
 * 关于"标准答案"：官方响应不含答案，离线无法直接知道。
 * 这里用三条独立证据交叉定标（见 docs/captcha_recognizer_report.md §3）：
 *   人眼看图 · oracle(bgImage 块投票) · 语义(标签「沙发」= 照片里确有沙发)
 * 三者对 2 个样本给出完全一致的结论 → 作为本轮黄金标签。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const R = require('../src/captcha_recognizer');
const I = R._internal;

const ROOT = path.resolve(__dirname, '..');
const QUICK = process.argv.includes('--quick');

// ── 黄金标签（人眼 + oracle + 语义三方一致）
const GOLDEN = {
  'capture_call.json': { answer: 0, human: '红沙发房间（标签为「沙发」）' },
  'capture_call2.json': { answer: 3, human: '绿沙发房间（标签为「沙发」）' },
};

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
const pad = (s, n) => String(s).padEnd(n);
const num = v => (typeof v === 'number' ? v.toFixed(3) : String(v));

// ── 确定性随机（保证基准可复现）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 样本装载
function loadSample(file) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', file), 'utf8'));
  const d = JSON.parse(j.requests[0].response_body).data;
  return d;
}

function decodeSizes(u) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(u || '');
  if (!m) return { mime: 'url', bytes: 0 };
  const buf = Buffer.from(m[2], 'base64');
  return { mime: m[1], bytes: buf.length };
}

// ── 生成合成裁剪题（已知真值）
async function makeCropDataUrl(srcBuf, rect, outW, outH, quality) {
  const buf = await sharp(srcBuf)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .extract(rect)
    .resize(outW, outH, { fit: 'fill' })
    .webp({ quality })
    .toBuffer();
  return 'data:image/webp;base64,' + buf.toString('base64');
}

async function metaOf(u) {
  const b = I.dataUrlToBuffer(u);
  const m = await sharp(b).metadata();
  return { w: m.width, h: m.height, fmt: m.format };
}

(async () => {
  const results = { generatedAt: new Date().toISOString(), node: process.version, samples: {}, oracle: {}, labelLoo: {}, cropBench: {}, timing: {} };
  const files = Object.keys(GOLDEN).filter(f => fs.existsSync(path.join(ROOT, 'artifacts', f)));

  console.log(`${C.b}══ 0. 环境 ══${C.x}`);
  console.log(`node ${process.version}  样本 ${files.length} 个`);

  // ═══════════════════════════════════════════════════════
  // 1. 每个样本：候选信息 + 三通道打分
  // ═══════════════════════════════════════════════════════
  console.log(`\n${C.b}══ 1. 真实样本：候选缩略信息 + 各通道打分 ══${C.x}`);
  const gallery = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'label_gallery.json'), 'utf8'));

  for (const f of files) {
    const d = loadSample(f);
    const gt = GOLDEN[f].answer;
    const tMeta = await metaOf(d.image);
    console.log(`\n${C.b}${f}${C.x}  no=${d.no}  sessionId=${String(d.sessionId).slice(0, 12)}…`);
    console.log(`  题目图 image: ${tMeta.w}×${tMeta.h} ${tMeta.fmt} ${decodeSizes(d.image).bytes}B  → 黄金标签 #${gt}（${GOLDEN[f].human}）`);
    console.log(`  候选 bgList (${d.bgList.length} 项):`);
    for (let i = 0; i < d.bgList.length; i++) {
      const s = decodeSizes(d.bgList[i]);
      const mark = i === gt ? `${C.g}★答案${C.x}` : '     ';
      if (s.mime === 'url') {
        console.log(`    [${i}] ${mark} ${C.d}占位占位 URL${C.x}  ${d.bgList[i]}`);
      } else {
        const m = await metaOf(d.bgList[i]);
        console.log(`    [${i}] ${mark} ${m.w}×${m.h} ${C.d}${s.mime} ${s.bytes}B${C.x}`);
      }
    }

    const row = {};
    for (const [mode, opt] of [['auto', {}], ['label', { gallery }], ['oracle', {}]]) {
      const inp = Object.assign({ image: d.image, bgList: d.bgList }, mode === 'oracle' ? { bgImage: d.bgImage } : {});
      const r = await R.recognize(inp, Object.assign({ mode: mode === 'auto' ? 'auto' : mode }, opt));
      const hit = r.index === gt;
      console.log(`  ${pad(mode, 7)} ${hit ? C.g + 'HIT ' + C.x : C.r + 'miss' + C.x}  index=${r.index} conf=${num(r.confidence)} ` +
        `top1=${num(r.meta.top1)} top2=${num(r.meta.top2)} margin=${num(r.meta.margin)} ${C.d}${r.meta.elapsedMs}ms ch=${r.meta.channel}${C.x}`);
      console.log(`          scores: [${r.scores.map(v => num(v)).join(', ')}]`);
      row[mode] = { index: r.index, hit, confidence: r.confidence, scores: r.scores, elapsedMs: r.meta.elapsedMs, channel: r.meta.channel, warnings: r.meta.warnings };
    }
    // auto 在传入 bgImage 时走 oracle；这里额外跑一次"纯视觉 auto"（不传 bgImage）
    const autoVisual = await R.recognize({ image: d.image, bgList: d.bgList }, { mode: 'auto' });
    row['auto-visual'] = { index: autoVisual.index, hit: autoVisual.index === gt, confidence: autoVisual.confidence, scores: autoVisual.scores, channel: autoVisual.meta.channel, warnings: autoVisual.meta.warnings };
    console.log(`  ${pad('auto(纯视觉)', 14)} ${row['auto-visual'].hit ? C.g + 'HIT ' + C.x : C.d + 'miss' + C.x}  index=${autoVisual.index} conf=${num(autoVisual.confidence)} ch=${autoVisual.meta.channel}`);
    results.samples[f] = { no: d.no, golden: gt, target: tMeta, rows: row };
  }

  // ═══════════════════════════════════════════════════════
  // 2. oracle 通道准确率（对照黄金标签）
  // ═══════════════════════════════════════════════════════
  console.log(`\n${C.b}══ 2. oracle 通道（bgImage 块投票）vs 黄金标签 ══${C.x}`);
  let oracleHit = 0, oracleN = 0;
  for (const f of files) {
    const d = loadSample(f);
    const gt = GOLDEN[f].answer;
    const r = await R.recognize({ image: d.image, bgList: d.bgList, bgImage: d.bgImage }, { mode: 'oracle' });
    const hit = r.index === gt;
    if (hit) oracleHit++;
    oracleN++;
    const votes = r.meta.detail.filter(x => !x.placeholder).map(x => `${x.i}:${x.votes}/${Math.round(x.blockShare * 100)}%`);
    console.log(`  ${f}  → index=${r.index} ${hit ? C.g + 'HIT' + C.x : C.r + 'miss' + C.x} conf=${num(r.confidence)}  票型 {${votes.join('  ')}}  ${C.d}${r.meta.elapsedMs}ms${C.x}`);
    results.oracle[f] = { index: r.index, hit, confidence: r.confidence, detail: r.meta.detail };
  }
  console.log(`  ${C.b}oracle 准确率: ${oracleHit}/${oracleN}${C.x}（n=${oracleN}，样本太少，仅作一致性证据）`);

  // ═══════════════════════════════════════════════════════
  // 3. label 通道：跨样本 1-shot 留一检验
  // ═══════════════════════════════════════════════════════
  console.log(`\n${C.b}══ 3. label 通道：跨样本 1-shot 留一检验（真正的准确率）══${C.x}`);
  console.log(`  ${C.d}做法：用 A 样本的答案图当"类目记忆"，去 B 样本里找同类；再反向。绝不与自身比对。${C.x}`);
  if (files.length >= 2) {
    // 预取特征
    const cache = {};
    for (const f of files) {
      const d = loadSample(f);
      const feats = [];
      for (const u of d.bgList) feats.push(I.isDataUrl(u) ? await I.buildFeatures(I.dataUrlToBuffer(u)) : null);
      cache[f] = { d, feats };
    }
    for (const [trainF, testF] of [[files[0], files[1]], [files[1], files[0]]]) {
      const train = cache[trainF], test = cache[testF];
      const tFeats = await I.buildFeatures(I.dataUrlToBuffer(train.d.image));
      const fp = I.labelFingerprint(tFeats).fp;
      const gi = I.featureToGalleryImage(train.feats[GOLDEN[trainF].answer]);
      const looGallery = { version: 1, entries: { [fp]: { label: '沙发(人工标注)', w: tFeats.w, h: tFeats.h, images: [gi] } } };
      const r = await R.recognize({ image: test.d.image, bgList: test.d.bgList }, { mode: 'label', gallery: looGallery });
      const gt = GOLDEN[testF].answer;
      const hit = r.index === gt;
      console.log(`  训练=${pad(trainF, 20)} → 测试=${pad(testF, 20)} index=${r.index} ${hit ? C.g + 'HIT' + C.x : C.r + 'miss' + C.x} conf=${num(r.confidence)}`);
      console.log(`       scores: [${r.scores.map(v => num(v)).join(', ')}]  ${C.d}（答案 #${gt}）${C.x}`);
      results.labelLoo[`${trainF}->${testF}`] = { index: r.index, golden: gt, hit, confidence: r.confidence, scores: r.scores };
    }
    const looHits = Object.values(results.labelLoo).filter(x => x.hit).length;
    console.log(`  ${C.b}label 1-shot 留一: ${looHits}/${Object.keys(results.labelLoo).length}${C.x} ${C.d}（n=2，margins 很小，不能当稳定准确率）${C.x}`);
  }

  // ═══════════════════════════════════════════════════════
  // 4. crop 通道：合成裁剪基准（已知真值）
  // ═══════════════════════════════════════════════════════
  console.log(`\n${C.b}══ 4. crop 通道合成裁剪基准（从候选图随机裁块当题目图，真值已知）══${C.x}`);
  const K = QUICK ? 2 : 5;
  const rnd = mulberry32(20261120);
  const bench = { total: 0, hit: 0, byKind: {}, rows: [], elapsed: [] };

  for (const f of files) {
    const d = loadSample(f);
    const gt = GOLDEN[f].answer;
    const bufs = d.bgList.map(u => (I.isDataUrl(u) ? I.dataUrlToBuffer(u) : null));
    // 题源：正确答案 + 2 个干扰项（干扰项用例检验"是否真的按内容排序"，而不是只会猜答案）
    const sources = [gt];
    const distract = bufs.map((b, i) => i).filter(i => i !== gt && bufs[i]);
    sources.push(distract[0], distract[distract.length - 1]);

    for (const src of sources) {
      const buf = bufs[src];
      if (!buf) continue;
      const m = await sharp(buf).metadata();
      const runs = [];
      for (let k = 0; k < K; k++) {
        runs.push({ hard: false });
      }
      runs.push({ hard: true });   // 额外一个"极端压缩"用例：裁块→缩到 30px 宽→webp q=25
      for (const run of runs) {
        const cw = Math.round(m.width * (0.4 + rnd() * 0.45));
        const chh = Math.round(m.height * (0.4 + rnd() * 0.45));
        const left = Math.round(rnd() * (m.width - cw));
        const top = Math.round(rnd() * (m.height - chh));
        const outW = run.hard ? 30 : 76 + Math.round(rnd() * 40);
        const outH = Math.max(8, Math.round(outW * (chh / cw)));
        const q = run.hard ? 25 : 70 + Math.round(rnd() * 20);
        const cropUrl = await makeCropDataUrl(buf, { left, top, width: cw, height: chh }, outW, Math.min(run.hard ? 24 : 64, outH), q);
        const r = await R.recognize({ image: cropUrl, bgList: d.bgList }, { mode: 'crop' });
        const hit = r.index === src;
        const kind = (src === gt ? '答案源' : '干扰源') + (run.hard ? '/极端压缩' : '');
        bench.total++; if (hit) bench.hit++;
        bench.byKind[kind] = bench.byKind[kind] || { total: 0, hit: 0 };
        bench.byKind[kind].total++; if (hit) bench.byKind[kind].hit++;
        bench.elapsed.push(r.meta.elapsedMs);
        bench.rows.push({ file: f, src, kind, hard: !!run.hard, rect: [left, top, cw, chh], out: [outW, outH], q, index: r.index, hit, top1: r.meta.top1, top2: r.meta.top2, margin: r.meta.margin, confidence: r.confidence });
        console.log(`  ${pad(f, 20)} src#${src}(${kind}) 裁[${left},${top},${cw}×${chh}]→${outW}×${outH} q${q}  index=${r.index} ${hit ? C.g + 'HIT' + C.x : C.r + 'miss' + C.x} ` +
          `top1=${num(r.meta.top1)} top2=${num(r.meta.top2)} m=${num(r.meta.margin)} conf=${num(r.confidence)} ${C.d}${r.meta.elapsedMs}ms${C.x}`);
      }
    }
  }
  console.log(`\n  ${C.b}合成基准 top1: ${bench.hit}/${bench.total} = ${(100 * bench.hit / bench.total).toFixed(1)}%${C.x}  ` +
    `(随机基线 20%；答案源 ${bench.byKind['答案源'].hit}/${bench.byKind['答案源'].total}，干扰源 ${bench.byKind['干扰源'].hit}/${bench.byKind['干扰源'].total})`);
  const el = bench.elapsed.slice().sort((a, b) => a - b);
  console.log(`  单题耗时: 中位 ${el[el.length >> 1]}ms  P90 ${el[Math.floor(el.length * 0.9)]}ms  max ${el[el.length - 1]}ms`);
  results.cropBench = bench;

  // ═══════════════════════════════════════════════════════
  // 5. 置信度分布 & 确定性
  // ═══════════════════════════════════════════════════════
  console.log(`\n${C.b}══ 5. 置信度分布 / 分隔度 ══${C.x}`);
  const hitRows = bench.rows.filter(r => r.hit), missRows = bench.rows.filter(r => !r.hit);
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  console.log(`  crop HIT  用例 conf 均值 ${num(avg(hitRows.map(r => r.confidence)))}  margin 均值 ${num(avg(hitRows.map(r => r.margin)))}`);
  console.log(`  crop miss 用例 conf 均值 ${num(avg(missRows.map(r => r.confidence)))}  margin 均值 ${num(avg(missRows.map(r => r.margin)))}`);
  const d0 = loadSample(files[0]);
  const a1 = await R.recognize({ image: d0.image, bgList: d0.bgList, bgImage: d0.bgImage }, { mode: 'oracle' });
  const a2 = await R.recognize({ image: d0.image, bgList: d0.bgList, bgImage: d0.bgImage }, { mode: 'oracle' });
  console.log(`  确定性: 同输入两次 → index ${a1.index}/${a2.index} scores ${JSON.stringify(a1.scores) === JSON.stringify(a2.scores) ? '一致' : '不一致'}`);
  results.confidence = { cropHitConf: avg(hitRows.map(r => r.confidence)), cropMissConf: avg(missRows.map(r => r.confidence)), deterministic: a1.index === a2.index && JSON.stringify(a1.scores) === JSON.stringify(a2.scores) };

  // ═══════════════════════════════════════════════════════
  // 汇总
  // ═══════════════════════════════════════════════════════
  console.log(`\n${C.b}══ 汇总 ══${C.x}`);
  console.log(`  oracle(bgImage 块投票) : ${oracleHit}/${oracleN}`);
  const lh = Object.values(results.labelLoo).filter(x => x.hit).length, ln = Object.keys(results.labelLoo).length;
  console.log(`  label 1-shot 留一      : ${lh}/${ln}  ${C.d}(n=${ln}, 仅 2 个真实样本，不可外推)${C.x}`);
  console.log(`  label 无记忆库(弱先验) : 不构成准确率（文字标签 vs 照片，纯 CV 无解）`);
  console.log(`  crop 合成基准          : ${bench.hit}/${bench.total} = ${(100 * bench.hit / bench.total).toFixed(1)}%`);

  const out = path.join(ROOT, 'artifacts', 'recognizer_test_results.json');
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\n结果已写入 ${path.relative(ROOT, out)}`);
})().catch(e => { console.error(e); process.exit(1); });
