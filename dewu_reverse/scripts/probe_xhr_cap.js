/**
 * 抓 dewuCap 发出的 captcha 请求完整形态（URL / headers / body）
 * 关键做法：在加载 pyuntu **之前** 包装 XMLHttpRequest 原型，截获 send 的入参
 * 用法: node scripts/probe_xhr_cap.js
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const env = createEnv({ blockNetwork: true, traceReads: false });
const w = env.window;

const captured = [];
const XHR = w.XMLHttpRequest;
const P = XHR.prototype;
const origOpen = P.open, origSend = P.send, origSetHeader = P.setRequestHeader;

P.open = function (method, url) {
  this.__cap = { method, url: String(url), headers: {} };
  return origOpen.apply(this, arguments);
};
P.setRequestHeader = function (k, v) {
  if (this.__cap) this.__cap.headers[k] = String(v);
  return origSetHeader.apply(this, arguments);
};
P.send = function (body) {
  if (this.__cap) {
    this.__cap.body = body === undefined || body === null ? null : String(body);
    captured.push(this.__cap);
  }
  return origSend.apply(this, arguments);
};

env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');

console.log('dewuCap typeof:', typeof w.dewuCap);
try { w.dewuCap({}); } catch (e) { console.log('dewuCap 抛错:', e.message); }

setTimeout(() => {
  console.log('\n=== 捕获到 ' + captured.length + ' 个 XHR ===');
  for (const c of captured) {
    console.log('\nURL    :', c.method, c.url);
    console.log('headers:', JSON.stringify(c.headers, null, 1));
    const b = c.body || '';
    console.log('bodyLen:', b.length);
    console.log('body   :', b.slice(0, 600) + (b.length > 600 ? ' ...' : ''));
    // 如果 body 是 {d, sign} 结构，把两个字段单独统计
    try {
      const j = JSON.parse(b);
      if (j && typeof j === 'object') {
        for (const k of Object.keys(j)) {
          const v = j[k];
          console.log(`  field ${k}: len=${String(v).length} head=${String(v).slice(0, 80)}`);
        }
      }
      fs.writeFileSync(path.join(ROOT, 'artifacts', 'cap_call_body.json'), b);
      console.log('  → 已存 artifacts/cap_call_body.json');
    } catch (e) { console.log('  body 非 JSON'); }
  }
  env.dispose();
  process.exit(0);
}, 1500);
