// 解压已有 deflate 样本，确认 payload 结构与 nonce 位置（离线）
const fs = require('fs');
const zlib = require('zlib');

const files = ['config/sample_deflate.b64', 'config/compressed.inflated.txt'];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const raw = fs.readFileSync(f, 'utf8').trim();
  let buf;
  try { buf = Buffer.from(raw, 'base64'); } catch (e) { continue; }
  console.log('\n===', f, 'b64len', raw.length, 'declen', buf.length, 'head', buf.slice(0, 4).toString('hex'));
  let out = null;
  for (const [name, fn] of [['inflateSync', zlib.inflateSync], ['inflateRawSync', zlib.inflateRawSync], ['gunzipSync', zlib.gunzipSync]]) {
    try { out = fn(buf); console.log('  解压成功:', name, '→', out.length, 'bytes'); break; } catch (e) { }
  }
  if (!out) { console.log('  解压失败'); continue; }
  const text = out.toString('utf8');
  console.log('  文本前 320:', JSON.stringify(text.slice(0, 320)));
  const hex32 = text.match(/[0-9a-f]{32}/gi);
  console.log('  16字节hex 候选:', hex32 ? hex32.slice(0, 5) : null);
  try {
    const j = JSON.parse(text);
    console.log('  JSON keys:', Object.keys(j).join(','));
    for (const k of Object.keys(j)) {
      const v = j[k];
      console.log('   ', k, '=', typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200));
    }
  } catch (e) {
    console.log('  非 JSON（前 8 字节 hex）:', out.slice(0, 8).toString('hex'));
  }
}
