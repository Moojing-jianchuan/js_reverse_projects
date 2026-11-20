/**
 * scan_env_refs.js —— 从 artifacts/unpacked/ 的混淆源码里挖「SDK 真实读了哪些环境 API」
 *
 * 原理：JS DUN PROTECT 把字符串字面量编码成 '\u0058\u0059...' 形式，直接 grep 查不到关键字。
 * 本脚本先把 \uXXXX / \xXX 还原成字符，再按「标识符 → 出现次数 → 上下文片段」统计，
 * 用来给 src/env_patch.js 的补丁项定优先级：真读的项必须补，只出现一次的算保险。
 *
 * 用法: node scripts/scan_env_refs.js [--json out.json]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'artifacts', 'unpacked');

function decodeEscapes(src) {
  return src
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// 待统计的环境读值点（顺序即报告里的分组）
const PROBES = [
  // navigator
  'navigator.userAgent', 'navigator.platform', 'navigator.oscpu', 'navigator.appVersion',
  'navigator.appName', 'navigator.appCodeName', 'navigator.product', 'navigator.productSub',
  'navigator.vendor', 'navigator.vendorSub', 'navigator.buildID', 'navigator.language',
  'navigator.languages', 'navigator.hardwareConcurrency', 'navigator.deviceMemory',
  'navigator.maxTouchPoints', 'navigator.webdriver', 'navigator.doNotTrack',
  'navigator.cookieEnabled', 'navigator.onLine', 'navigator.pdfViewerEnabled',
  'navigator.plugins', 'navigator.mimeTypes', 'navigator.connection', 'navigator.gpu',
  'navigator.permissions', 'navigator.sendBeacon', 'navigator.userAgentData',
  // screen / window
  'screen.width', 'screen.height', 'screen.availWidth', 'screen.availHeight',
  'screen.colorDepth', 'screen.pixelDepth', 'devicePixelRatio', 'innerWidth', 'innerHeight',
  'outerWidth', 'outerHeight', 'screenX', 'screenY', 'window.name', 'window.chrome',
  'window.opera', 'isSecureContext',
  // document / DOM
  'document.compatMode', 'document.documentElement', 'document.body', 'document.cookie',
  'document.referrer', 'document.title', 'document.characterSet', 'document.readyState',
  'document.visibilityState', 'document.hidden', 'document.hasFocus', 'document.createElement',
  'document.head', 'document.all', 'document.documentMode', 'document.currentScript',
  'document.location', 'document.fonts', 'document.createElementNS', 'document.write',
  'document.getElementsByTagName', 'document.getElementById', 'document.querySelector',
  'document.addEventListener', 'document.domain', 'document.activeElement', 'document.forms',
  // 布局 / canvas / webgl / audio
  'clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight', 'scrollWidth', 'scrollHeight',
  'getBoundingClientRect', 'getComputedStyle', 'canvas', 'toDataURL', 'getContext', 'webgl',
  'WebGL', 'measureText', 'fillText', 'AudioContext', 'OfflineAudioContext',
  'createOscillator', 'createDynamicsCompressor', 'createAnalyser', 'startRendering',
  'getChannelData', 'ontouchstart', 'MediaSource', 'WebSocket', 'XMLHttpRequest',
  'localStorage', 'sessionStorage', 'indexedDB', 'withInMini', 'sk', 'yuntuSession',
  'toString', 'native code', 'Function.prototype', 'insertRule', 'createElement("style")',
  'appendChild', 'styleSheet', 'performance.now', 'Date.now', 'Math.random',
  // 站点自定义标记
  'jsdVipUserMark', 'base64js', 'fun', '_yundunxhr', 'regeneratorRuntime', 'dw',
];

// 取上下文，压掉控制字符
function ctxOf(text, idx, len) {
  const start = Math.max(0, idx - 90);
  const end = Math.min(text.length, idx + len + 90);
  return text.slice(start, end).replace(/[\s]+/g, ' ').trim();
}

const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.js'));
const report = {};

for (const f of files) {
  const raw = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
  const text = decodeEscapes(raw);
  const per = {};
  for (const probe of PROBES) {
    let idx = -1;
    const hits = [];
    while ((idx = text.indexOf(probe, idx + 1)) !== -1) {
      if (hits.length < 4) hits.push(ctxOf(text, idx, probe.length));
      per.__count = per.__count || {};
      per.__count[probe] = (per.__count[probe] || 0) + 1;
      if (hits.length >= 4) { // 只数前 4 处上下文，计数靠下面的循环继续
        idx = text.indexOf(probe, idx + probe.length);
        while (idx !== -1) { per.__count[probe]++; idx = text.indexOf(probe, idx + probe.length); }
        break;
      }
    }
    if (hits.length) per[probe] = hits;
  }
  report[f] = { size: raw.length, decoded_size: text.length, probes: per.__count || {}, contexts: per };
  delete per.__count;
}

// 汇总：跨文件合计，用于定优先级
const agg = {};
for (const f of Object.keys(report)) {
  for (const [probe, n] of Object.entries(report[f].probes)) {
    agg[probe] = (agg[probe] || 0) + n;
  }
}
const ranked = Object.entries(agg).sort((a, b) => b[1] - a[1]);

console.log('=== 环境读值点命中排序（跨三文件合计） ===');
for (const [probe, n] of ranked) {
  console.log(String(n).padStart(6), probe);
}

console.log('\n=== 每个文件的关键上下文（前 3 处） ===');
for (const [f, info] of Object.entries(report)) {
  console.log('\n--- ' + f + ' ---');
  for (const probe of Object.keys(info.contexts)) {
    if (!['document.compatMode', 'document.documentElement', 'clientWidth', 'clientHeight',
      'navigator.hardwareConcurrency', 'navigator.webdriver', 'navigator.plugins',
      'navigator.oscpu', 'navigator.platform', 'navigator.userAgent', 'toDataURL', 'getContext',
      'getBoundingClientRect', 'getComputedStyle', 'localStorage', 'withInMini', 'canvas',
      'document.hasFocus', 'screen.width', 'devicePixelRatio', 'insertRule', 'Function.prototype',
      'native code', 'performance.now', 'document.all'].includes(probe)) continue;
    console.log('[' + probe + '] x' + info.probes[probe]);
    for (const c of info.contexts[probe].slice(0, 2)) console.log('    ' + c.slice(0, 340));
  }
}

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
  fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ ranked, report }, null, 2));
  console.log('\n[json] ' + process.argv[jsonIdx + 1]);
}
