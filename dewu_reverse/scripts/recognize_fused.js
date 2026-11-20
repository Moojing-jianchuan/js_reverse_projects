/**
 * 三通道融合识别器（带阈值闸门）
 *
 * 通道来源（src/captcha_recognizer.js）：
 *   oracle —— bgImage 逐块归属投票；子会话实测 2/2，是最强的信号
 *   crop   —— 多尺度 NCC + 直方图 + HOG；对「文字标签 vs 照片」场景弱（纯视觉 0/2），
 *             所以只作为「一致性校验」而非独立判据
 *   label  —— 标签指纹 + 类目记忆库；冷启动时全 0，命中时才有语义价值
 *
 * 融合规则（保守优先，宁可 reject 也不乱提交）：
 *   1. oracle 与 crop 的 top1 一致  → 采信，置信度 + 一致加成
 *   2. 不一致                        → 取置信度高的那个，但乘惩罚系数
 *   3. 最终置信度 < 阈值             → decision = "reject"（不提交，交由上层换一题重试）
 *
 * 用法: node scripts/recognize_fused.js <call_resp.json> [--threshold 0.72]
 * 输出: {ok, index, confidence, decision, agree, channels:{oracle,crop,label}, elapsedMs}
 */
const fs = require('fs');
const { recognize } = require('../src/captcha_recognizer');

const argv = process.argv.slice(2);
const file = argv[0];
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const THRESHOLD = parseFloat(val('--threshold') || '0.72');

const argmax = a => {
  let bi = -1, bv = -Infinity;
  (a || []).forEach((v, i) => { if (v > bv) { bv = v; bi = i; } });
  return { index: bi, score: bv === -Infinity ? 0 : bv };
};

(async () => {
  if (!file) { console.log(JSON.stringify({ ok: false, error: 'need call_resp.json' })); return; }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = raw.data || raw;
  if (!d.bgList || !d.bgList.length) {
    console.log(JSON.stringify({ ok: false, error: '缺少 bgList' }));
    return;
  }

  const t0 = Date.now();
  const runOne = async (mode) => {
    try {
      const r = await recognize({ image: d.image, bgList: d.bgList, bgImage: d.bgImage }, { mode });
      const am = argmax(r.scores);
      return { mode, index: r.index, confidence: r.confidence || 0, scores: r.scores, top: am, error: null };
    } catch (e) {
      return { mode, index: -1, confidence: 0, scores: [], top: { index: -1, score: 0 }, error: String(e.message || e).slice(0, 160) };
    }
  };

  const [oracle, crop, label] = await Promise.all([
    d.bgImage ? runOne('oracle') : Promise.resolve({ mode: 'oracle', index: -1, confidence: 0, scores: [], top: { index: -1, score: 0 }, error: '无 bgImage' }),
    runOne('crop'),
    runOne('label'),
  ]);

  // ── 融合（数据驱动：阈值 0.72 是按 4 次实跑 + 2 个已知真值样本切出来的）
  //
  // 关键取舍：crop 通道对「文字标签 vs 照片」场景系统性失效（子会话实测纯视觉 0/2），
  // 拿它做一致性惩罚会把正确答案也压下去（实测：样本A oracle conf 0.89 被压到 0.53）。
  // 所以改为「oracle 主导、crop 只做兜底」，并直接用 oracle 的置信度做阈值判定：
  //   实跑成功 conf = 0.765 / 0.872  → 过线
  //   实跑失败 conf = 0.676 / 0.697  → 被挡
  // 代价是已知真值的样本B（oracle 0.615）会被保守拒掉 —— 宁可换题重试，也不乱提交。
  let primary = null, confidence = 0;

  if (oracle.index >= 0 && oracle.confidence > 0) {
    primary = 'oracle';
    confidence = oracle.confidence;
  } else if (crop.index >= 0 && crop.confidence > 0) {
    primary = 'crop';
    confidence = crop.confidence * 0.70;   // 无 bgImage 时的兜底，折价使用
  } else if (label.index >= 0 && label.confidence > 0) {
    primary = 'label';
    confidence = label.confidence * 0.60;
  }

  if (!primary) {
    console.log(JSON.stringify({ ok: false, error: '所有通道都无结果', channels: { oracle, crop, label } }));
    return;
  }

  const agree = [oracle, crop, label]
    .filter(c => c.index >= 0 && c.index === (primary === 'oracle' ? oracle.index : primary === 'crop' ? crop.index : label.index))
    .map(c => c.mode);
  const disagree = [oracle, crop, label]
    .filter(c => c.index >= 0 && c.index !== (primary === 'oracle' ? oracle.index : primary === 'crop' ? crop.index : label.index))
    .map(c => ({ name: c.mode, index: c.index, conf: c.confidence }));

  confidence = +Math.min(0.98, confidence).toFixed(4);
  const decision = confidence >= THRESHOLD ? 'auto' : 'reject';

  console.log(JSON.stringify({
    ok: true,
    index: primary === 'oracle' ? oracle.index : primary === 'crop' ? crop.index : label.index,
    confidence,
    threshold: THRESHOLD,
    decision,
    agree,
    disagree,
    primary,
    channels: {
      oracle: { index: oracle.index, conf: oracle.confidence, error: oracle.error },
      crop: { index: crop.index, conf: crop.confidence, error: crop.error },
      label: { index: label.index, conf: label.confidence, error: label.error },
    },
    elapsedMs: Date.now() - t0,
  }));
})().catch(e => console.log(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 300) })));
