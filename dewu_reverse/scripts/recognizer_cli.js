'use strict';
/**
 * 识别器 CLI —— 喂一个 captcha/call 的响应（或整份抓包导出），打印识别结果
 *
 *   node scripts/recognizer_cli.js artifacts/capture_call2.json
 *   node scripts/recognizer_cli.js artifacts/capture_call2.json --mode crop
 *   node scripts/recognizer_cli.js resp_body.json --no-oracle
 *   node scripts/recognizer_cli.js resp.json --save results.json
 *
 * 支持两种输入：
 *   ① 抓包导出（{requests:[{url,response_body}]}）—— 自动挑 captcha/call
 *   ② 裸响应体 `{code,data:{bgList,image,bgImage}}`
 *
 * 默认行为：
 *   有 bgImage → 走 oracle（bgImage 块投票，实测准）；否则按题目图类型走 label / crop。
 *   `--no-oracle` 用于**纯视觉**评测（假装拿不到 bgImage）。
 */
const fs = require('fs');
const path = require('path');
const R = require('../src/captcha_recognizer');

const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

function extractData(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (j && j.data && Array.isArray(j.data.bgList)) return j.data;
  if (j && Array.isArray(j.body ? j.body.data && j.body.data.bgList ? [1] : [] : [])) { /* noop */ }
  if (j && j.body && j.body.data && Array.isArray(j.body.data.bgList)) return j.body.data;
  if (j && Array.isArray(j.requests)) {
    for (const r of j.requests) {
      if (!/captcha\/call/.test(r.url || '')) continue;
      const b = typeof r.response_body === 'string' ? JSON.parse(r.response_body) : r.response_body;
      if (b && b.data && Array.isArray(b.data.bgList)) return b.data;
    }
  }
  throw new Error('输入里找不到 captcha/call 响应（需要 data.bgList / data.image）');
}

(async () => {
  const file = argv[0];
  if (!file) {
    console.log('用法: node scripts/recognizer_cli.js <capture.json|resp_body.json> [--mode auto|crop|label|oracle] [--no-oracle] [--save out.json]');
    process.exit(2);
  }
  const d = extractData(file);
  const mode = flag('--no-oracle') ? (val('--mode') || 'auto') : (val('--mode') || 'auto');
  const inp = { image: d.image, bgList: d.bgList };
  if (!flag('--no-oracle') && d.bgImage && mode !== 'crop' && mode !== 'label') inp.bgImage = d.bgImage;

  let gallery = null;
  const gp = path.resolve(__dirname, '..', 'data', 'label_gallery.json');
  if (fs.existsSync(gp)) { try { gallery = JSON.parse(fs.readFileSync(gp, 'utf8')); } catch (e) {} }

  const r = await R.recognize(inp, { mode, gallery });
  console.log(`输入     : ${file}  no=${d.no || '-'}`);
  console.log(`通道     : ${r.meta.channel}  (mode=${r.meta.mode}) ${r.meta.channelNote || ''}`);
  console.log(`题目图   : ${r.meta.target ? r.meta.target.w + '×' + r.meta.target.h + ' ' + r.meta.target.type : '不可用'}` +
    (r.meta.labelFp ? `   标签指纹 ${r.meta.labelFp}` : ''));
  console.log(`命中下标 : ${r.index}    置信度 ${r.confidence}`);
  console.log('每项得分 :');
  r.scores.forEach((s, i) => {
    const ph = r.meta.detail.find(x => x.i === i && x.placeholder);
    console.log(`  [${i}] ${r.index === i ? '★' : ' '} score=${s.toFixed(4)}${ph ? '  (占位:' + ph.reason + ')' : ''}`);
  });
  if (r.meta.warnings.length) r.meta.warnings.forEach(w => console.log('警告     : ' + w));
  const save = val('--save');
  if (save) { fs.writeFileSync(save, JSON.stringify(r, null, 2)); console.log('已保存   :', save); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
