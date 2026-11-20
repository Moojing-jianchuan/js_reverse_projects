/**
 * 单题识别 wrapper：喂一份 captcha/call 响应 JSON，输出 {index,confidence,mode}
 * 注意：captcha_recognizer.recognize() 是 async，必须 await
 * 用法: node scripts/recognize_one.js <call_resp.json>
 */
const fs = require('fs');
const { recognize } = require('../src/captcha_recognizer');

const file = process.argv[2];
if (!file) { console.error('用法: node scripts/recognize_one.js <call_resp.json>'); process.exit(2); }

(async () => {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = raw.data || raw;
  if (!d.bgList || !d.image) {
    console.log(JSON.stringify({ ok: false, error: '缺少 bgList/image', keys: Object.keys(d) }));
    return;
  }
  const t0 = Date.now();
  const r = await recognize({ image: d.image, bgList: d.bgList, bgImage: d.bgImage });
  const meta = r.meta || {};
  console.log(JSON.stringify({
    ok: true,
    index: r.index,
    confidence: r.confidence,
    mode: meta.mode || r.mode || null,
    scores: r.scores,
    elapsedMs: Date.now() - t0,
    bgListLen: d.bgList.length,
    hasBgImage: !!d.bgImage,
    warnings: meta.warnings || [],
  }));
})().catch(e => {
  console.log(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 300) }));
});
