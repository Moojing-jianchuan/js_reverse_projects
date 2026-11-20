/**
 * verify_env.js —— 环境补丁自检：**基线 vs jsdom 原值 vs 补后值** 三方对比表
 *
 * 六步法第 4-6 步（读值差异 → 打补丁 → 内部验证）的落地脚本：
 *   node scripts/verify_env.js            # 打印对比表 + 汇总
 *   node scripts/verify_env.js --sdk      # 顺带跑三个 SDK 的加载验收
 *
 * 判定口径：补后值必须与「真实浏览器基线」一致才算 PASS。
 * 基线取不到的项（例如基线里只记录了对象类型）用「合规性判定」（类型/格式/存在性）。
 */
'use strict';

const crypto = require('crypto');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createEnv, loadBundle, bval, DEFAULT_BUNDLE, DEFAULT_ORIGIN } = require('../src/env_patch');

const bundle = loadBundle(DEFAULT_BUNDLE);

// ─────────────────────────────────────────────────────────────────────────────
// 未打补丁的 jsdom（对照组）：与 createEnv 同参数，但不跑任何补丁
// ─────────────────────────────────────────────────────────────────────────────
function makeRaw() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => undefined);
  vc.on('error', () => undefined);
  vc.on('warn', () => undefined);
  const dom = new JSDOM('<!doctype html><html lang="zh-CN"><head></head><body></body></html>', {
    url: DEFAULT_ORIGIN, referrer: DEFAULT_ORIGIN, contentType: 'text/html',
    pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
  });
  return dom.window;
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const j = (v) => {
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return '<function>';
  try { return JSON.stringify(v); } catch (e) { return String(v); }
};

// ─────────────────────────────────────────────────────────────────────────────
// 检测点清单
//   how: 'SDK实读' —— scan_env_refs.js 在解混淆源码里找到的读值点
//        '兜底'    —— 基线有值、SDK 当前未读到，补上是为防改版
// ─────────────────────────────────────────────────────────────────────────────
const CHECKS = [
  {
    id: 'navigator.userAgent', how: 'SDK实读',
    note: 'preinforce2 用 /\\(([^)]+)\\)/ 抽平台；pceptor 用它判 iOS/Android',
    base: () => bval(bundle.navigator.userAgent),
    run: (w) => w.navigator.userAgent,
  },
  {
    id: 'navigator.platform', how: 'SDK实读',
    note: 'pceptor: navigator.platform.indexOf("iPad"/"iPhone"/"iPod")',
    base: () => bval(bundle.navigator.platform),
    run: (w) => w.navigator.platform,
  },
  {
    id: 'navigator.oscpu', how: '兜底',
    note: 'Firefox 独有；jsdom 无 → 与基线对齐',
    base: () => bval(bundle.navigator.oscpu),
    run: (w) => w.navigator.oscpu,
  },
  {
    id: 'navigator.vendor / productSub', how: '兜底',
    note: 'jsdom 给的是 Chrome 语义(Apple Computer / 20030107)，与 Gecko 矛盾',
    base: () => [bval(bundle.navigator.vendor), bval(bundle.navigator.productSub)],
    run: (w) => [w.navigator.vendor, w.navigator.productSub],
  },
  {
    id: 'navigator.appVersion / appName / product', how: '兜底',
    note: 'UA 一致性：Firefox 的 appVersion 是 "5.0 (Windows)"',
    base: () => [bval(bundle.navigator.appVersion), bval(bundle.navigator.appName), bval(bundle.navigator.product)],
    run: (w) => [w.navigator.appVersion, w.navigator.appName, w.navigator.product],
  },
  {
    id: 'navigator.hardwareConcurrency', how: '兜底',
    note: 'jsdom 默认 32 恰好等于基线 32，但仍显式锁定',
    base: () => bval(bundle.navigator.hardwareConcurrency),
    run: (w) => w.navigator.hardwareConcurrency,
  },
  {
    id: 'navigator.webdriver', how: '兜底',
    note: 'jsdom 是 undefined；真实 Firefox 是 false',
    base: () => bval(bundle.navigator.webdriver),
    run: (w) => w.navigator.webdriver,
  },
  {
    id: 'navigator.plugins（对象树）', how: '兜底',
    note: 'length + item/namedItem + [0].name；jsdom 长度 0 且无 item',
    base: () => [bval(bundle.navigator.plugins).length, bval(bundle.navigator.plugins)[0].name,
      typeof ({}).item],
    run: (w) => {
      const p = w.navigator.plugins;
      return [p.length, p[0] && p[0].name, typeof p.item,
        p.namedItem('PDF Viewer') && p.namedItem('PDF Viewer').name,
        (() => { try { return Array.from(p).length; } catch (e) { return 'no-iter'; } })()];
    },
    shape: ([len, name, itemType, namedItemName, iterLen]) =>
      len === 5 && name === 'PDF Viewer' && itemType === 'function' && namedItemName === 'PDF Viewer' && iterLen === 5,
  },
  {
    id: 'navigator.mimeTypes', how: '兜底',
    note: 'Firefox 内置 PDF viewer 的 2 个 MimeType',
    base: () => [bval(bundle.navigator.mimeTypes).length, bval(bundle.navigator.mimeTypes)[0].type],
    run: (w) => [w.navigator.mimeTypes.length, w.navigator.mimeTypes[0] && w.navigator.mimeTypes[0].type],
  },
  {
    id: 'navigator.doNotTrack / pdfViewerEnabled', how: '兜底',
    note: 'Firefox 的 doNotTrack 是字符串 "unspecified"（不是 null）',
    base: () => [bval(bundle.navigator.doNotTrack), bval(bundle.navigator.pdfViewerEnabled)],
    run: (w) => [w.navigator.doNotTrack, w.navigator.pdfViewerEnabled],
  },
  {
    id: 'navigator.connection.effectiveType', how: '兜底',
    note: 'NetworkInformation；jsdom 无',
    base: () => 'object(NetworkInformation)',
    run: (w) => (w.navigator.connection ? 'object(NetworkInformation)' : 'undefined'),
    shape: (v) => v === 'object(NetworkInformation)',
  },
  {
    id: 'Firefox 应缺失项', how: '兜底',
    note: 'userAgentData/deviceMemory/getBattery 在 Firefox 里不存在，补上反而暴露 Chrome',
    base: () => ['undefined', 'undefined', 'undefined'],
    run: (w) => [typeof w.navigator.userAgentData, typeof w.navigator.deviceMemory, typeof w.navigator.getBattery],
  },
  {
    id: 'navigator.sendBeacon.toString()', how: 'SDK实读',
    note: 'pceptor 直接判 .includes("native code")',
    base: () => 'function sendBeacon() {\\n    [native code]\\n}',
    run: (w) => (typeof w.navigator.sendBeacon === 'function' ? w.navigator.sendBeacon.toString() : 'undefined'),
    shape: (v) => /^function sendBeacon\(\) \{\n {4}\[native code\]\n\}$/.test(v),
  },
  {
    id: 'screen 尺寸/色深', how: 'SDK实读',
    note: 'preinforce2: screen.width/height；pceptor/pyuntu: availWidth/availHeight/pixelDepth',
    base: () => [bval(bundle.screen.width), bval(bundle.screen.height), bval(bundle.screen.availWidth),
      bval(bundle.screen.availHeight), bval(bundle.screen.colorDepth), bval(bundle.screen.pixelDepth)],
    run: (w) => [w.screen.width, w.screen.height, w.screen.availWidth, w.screen.availHeight,
      w.screen.colorDepth, w.screen.pixelDepth],
  },
  {
    id: 'screen.orientation.type', how: '兜底',
    note: 'jsdom 无 ScreenOrientation 实例',
    base: () => bval(bundle.screen.mozOrientation),
    run: (w) => (w.screen.orientation && w.screen.orientation.type) || w.screen.mozOrientation,
  },
  {
    id: 'window inner/outer 尺寸', how: 'SDK实读',
    note: 'preinforce2 逐项做存在性三元（innerWidth? "" : "W" 之类）',
    base: () => [bval(bundle.window.metrics.innerWidth), bval(bundle.window.metrics.innerHeight),
      bval(bundle.window.metrics.outerWidth), bval(bundle.window.metrics.outerHeight)],
    run: (w) => [w.innerWidth, w.innerHeight, w.outerWidth, w.outerHeight],
  },
  {
    id: 'devicePixelRatio', how: 'SDK实读',
    note: 'pceptor 指纹字段 dpr；pyuntu 同',
    base: () => bval(bundle.window.metrics.devicePixelRatio),
    run: (w) => w.devicePixelRatio,
  },
  {
    id: 'document.compatMode', how: 'SDK实读',
    note: 'pceptor/pyuntu: 用它选 documentElement 还是 body 取视口尺寸',
    base: () => bval(bundle.window.document.compatMode),
    run: (w) => w.document.compatMode,
  },
  {
    id: 'document.documentElement.clientWidth/Height', how: 'SDK实读',
    note: 'SDK 的视口尺寸读取路径，jsdom 恒为 0',
    base: () => [1906, 969],
    run: (w) => [w.document.documentElement.clientWidth, w.document.documentElement.clientHeight],
    shape: ([a, b]) => a > 0 && b > 0,
  },
  {
    id: 'document.hasFocus()', how: '兜底',
    note: 'jsdom 恒 false',
    base: () => true,
    run: (w) => w.document.hasFocus(),
  },
  {
    id: 'document readyState/visibilityState/hidden', how: '兜底',
    note: 'jsdom 是 loading',
    base: () => ['complete', 'visible', false],
    run: (w) => [w.document.readyState, w.document.visibilityState, w.document.hidden],
  },
  {
    id: 'Object.prototype.toString.call(document)', how: '兜底',
    note: 'jsdom 是 [object Document]；Firefox 是 [object HTMLDocument]',
    base: () => '[object HTMLDocument]',
    run: (w) => Object.prototype.toString.call(w.document),
  },
  {
    id: 'Object.prototype.toString.call(navigator/screen)', how: '兜底',
    note: 'jsdom 与 Firefox 一致（[object Navigator]/[object Screen]），确认补丁没把它们改坏',
    base: () => ['[object Navigator]', '[object Screen]'],
    run: (w) => [Object.prototype.toString.call(w.navigator), Object.prototype.toString.call(w.screen)],
  },
  {
    id: 'Function.prototype.toString(DOM方法)', how: '兜底',
    note: 'jsdom 直接吐源码；Firefox 是 "function name() {\\n    [native code]\\n}"',
    base: () => 'function createElement() {\n    [native code]\n}',
    run: (w) => w.document.createElement.toString(),
    shape: (v) => /^function createElement\(\) \{\n {4}\[native code\]\n\}$/.test(v),
  },
  {
    id: 'Object.prototype.toString.toString()', how: 'SDK实读',
    note: 'pceptor: .includes("native code") 判原生性',
    base: () => 'function toString() {\n    [native code]\n}',
    run: (w) => Object.prototype.toString.toString(),
    shape: (v) => /native code/.test(v),
  },
  {
    id: 'WebSocket.toString()', how: 'SDK实读',
    note: 'pceptor: .includes("native code") 判原生性',
    base: () => 'function WebSocket() {\n    [native code]\n}',
    run: (w) => (typeof w.WebSocket === 'function' ? w.WebSocket.toString() : 'undefined'),
    shape: (v) => /native code/.test(v),
  },
  {
    id: 'canvas.toDataURL() 指纹', how: 'SDK实读',
    note: 'pceptor: 2d 上 fill/arc 后 toDataURL()；比字节与 sha256',
    base: () => ({ len: bundle.canvas.data_url_length, sha256: bundle.canvas.data_url_sha256 }),
    run: (w) => {
      const c = w.document.createElement('canvas'); c.width = 240; c.height = 60;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top'; ctx.font = "14px 'Arial'";
        ctx.fillStyle = '#f60'; ctx.fillRect(0, 0, 240, 60);
        ctx.arc(75, 30, 25, 0, Math.PI * 2, true); ctx.fill('evenodd');
        ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 2, 2);
      }
      const url = c.toDataURL();
      return { len: url.length, sha256: sha256(url) };
    },
    shape: (v) => v.len === bundle.canvas.data_url_length && v.sha256 === bundle.canvas.data_url_sha256,
  },
  {
    id: 'canvas.measureText(14px Arial)', how: 'SDK实读',
    note: 'pceptor 用 measureText 做字体/画布指纹',
    base: () => bundle.canvas.measure_text["14px 'Arial'"].width,
    run: (w) => {
      const c = w.document.createElement('canvas'); const ctx = c.getContext('2d');
      if (!ctx) return 'no-2d-context';
      ctx.font = "14px 'Arial'";
      return ctx.measureText(bundle.canvas.sample_text || 'test').width;
    },
    shape: (v) => Math.abs(v - bundle.canvas.measure_text["14px 'Arial'"].width) < 0.001,
  },
  {
    id: 'WebGL VENDOR/RENDERER/UNMASKED', how: 'SDK实读',
    note: 'pceptor: getContext("webgl") → getParameter(...) → getExtension("WEBGL_debug_renderer_info")',
    base: () => [bundle.webgl.vendor, bundle.webgl.renderer, bundle.webgl.unmasked_renderer],
    run: (w) => {
      const gl = w.document.createElement('canvas').getContext('webgl');
      if (!gl) return 'null-context';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return [gl.getParameter(gl.VENDOR), gl.getParameter(gl.RENDERER),
        dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null];
    },
    shape: (v) => Array.isArray(v) && v[0] === bundle.webgl.vendor && v[2] === bundle.webgl.unmasked_renderer,
  },
  {
    id: 'WebGL 扩展数量 / 关键参数', how: 'SDK实读',
    note: '扩展列表长度与 MAX_TEXTURE_SIZE 常被当作设备指纹',
    base: () => [bundle.webgl.extension_count, bundle.webgl.parameters.MAX_TEXTURE_SIZE],
    run: (w) => {
      const gl = w.document.createElement('canvas').getContext('webgl');
      if (!gl) return 'null-context';
      return [gl.getSupportedExtensions().length, gl.getParameter(gl.MAX_TEXTURE_SIZE)];
    },
  },
  {
    id: '<style> 插入 + insertRule + getComputedStyle', how: 'SDK实读',
    note: 'pyuntu 的 style-loader 需要真实 <style> 目标与 CSSOM；getComputedStyle 需要真实属性值',
    base: () => ({ rules: 2, widthFromBaseline: bundle.css.values.width }),
    run: (w) => {
      const st = w.document.createElement('style');
      st.appendChild(w.document.createTextNode('a{color:red}'));
      w.document.head.appendChild(st);
      let rules = 0;
      try {
        st.sheet.insertRule('b{color:blue}', 0);
        rules = st.sheet.cssRules.length;
      } catch (e) { return 'insertRule-failed:' + e.message; }
      const cs = w.getComputedStyle(w.document.documentElement);
      return { rules, widthFromBaseline: cs.width, hasComputed: typeof cs.getPropertyValue === 'function' };
    },
    shape: (v) => v && v.rules === 2 && v.hasComputed === true,
  },
  {
    id: 'DOM 布局 offset/client 非零', how: '兜底',
    note: 'SDK 造隐藏元素量尺寸时 jsdom 恒 0（pyuntu 用 canvas.getBoundingClientRect 算缩放）',
    base: () => ({ offsetW: 100, offsetH: 100, rectW: 100 }),
    run: (w) => {
      const d = w.document.createElement('div');
      d.setAttribute('style', 'width:100px;height:100px;position:absolute;left:-9999px');
      w.document.body.appendChild(d);
      const rect = d.getBoundingClientRect();
      const out = { offsetW: d.offsetWidth, offsetH: d.offsetHeight, rectW: rect.width };
      w.document.body.removeChild(d);
      return out;
    },
    shape: (v) => v && v.offsetW === 100 && v.offsetH === 100 && v.rectW === 100,
  },
  {
    id: 'AudioContext / OfflineAudioContext', how: '兜底',
    note: 'scan_env_refs 在三份源码里命中 0 次 → 只是保险；按基线给 sampleRate',
    base: () => [bundle.audio.sample_rate, bundle.audio.offline_sample_rate],
    run: (w) => {
      if (typeof w.AudioContext !== 'function') return 'missing';
      return [new w.AudioContext().sampleRate, new w.OfflineAudioContext(1, 5000, 44100).sampleRate];
    },
  },
  {
    id: 'Date 时区偏移 / 本地化', how: '兜底',
    note: '基线 -480 / Asia/Shanghai；Node 进程时区不设就跟着机器走',
    base: () => [bval(bundle.timing.timezoneOffset), bval(bundle.timing.timezone)],
    run: (w) => [new w.Date(0).getTimezoneOffset(), w.Intl.DateTimeFormat().resolvedOptions().timeZone],
  },
  {
    id: 'Node 特征清除', how: '兜底',
    note: 'process/require/Buffer/global 若可见即沙箱标记',
    base: () => ['undefined', 'undefined', 'undefined', 'undefined'],
    run: (w) => [typeof w.process, typeof w.require, typeof w.Buffer, typeof w.global],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 表格渲染（中文按 2 列宽计算，保证对齐）
// ─────────────────────────────────────────────────────────────────────────────
function dispWidth(s) {
  let n = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    n += (c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3)
      || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60)
      || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1f9ff))) ? 2 : 1;
  }
  return n;
}
function pad(s, w) { const d = dispWidth(s); return d >= w ? s : s + ' '.repeat(w - d); }
function clip(s, max) {
  const str = String(s).replace(/\n/g, '\\n');
  return dispWidth(str) <= max ? str : str.slice(0, Math.max(4, max - 1)) + '…';
}
function renderTable(rows, headers) {
  const widths = headers.map((h, i) => Math.max(dispWidth(h), ...rows.map((r) => dispWidth(clip(r[i], 60)))));
  const line = (cells) => cells.map((c, i) => pad(clip(c, 60), widths[i])).join(' │ ');
  const out = [];
  out.push(line(headers));
  out.push(widths.map((w) => '─'.repeat(w)).join('─┼─'));
  for (const r of rows) out.push(line(r));
  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────────────────────
function main() {
  console.log('基线 bundle : ' + path.relative(process.cwd(), DEFAULT_BUNDLE));
  console.log('jsdom 版本  : ' + require('jsdom/package.json').version + '   node: ' + process.version);
  console.log('');

  // 先取「jsdom 原值」再建补丁沙箱：createEnv 会强制 process.env.TZ，若先建 env，
  // 同一个进程里的裸 jsdom 也会被带着改时区，这一列就不干净了。
  const rawWin = makeRaw();
  const rawVals = CHECKS.map((chk) => {
    try { return chk.run(rawWin); } catch (e) { return '<err: ' + String(e.message).slice(0, 40) + '>'; }
  });
  rawWin.close();

  const env = createEnv();
  const patchedWin = env.window;

  const rows = [];
  let pass = 0;
  const fails = [];

  for (let i = 0; i < CHECKS.length; i++) {
    const chk = CHECKS[i];
    let baseVal; let patchedVal;
    try { baseVal = chk.base(); } catch (e) { baseVal = '<base err: ' + e.message + '>'; }
    const rawVal = rawVals[i];
    try { patchedVal = chk.run(patchedWin); } catch (e) { patchedVal = '<err: ' + String(e.message).slice(0, 40) + '>'; }

    const ok = chk.shape ? !!chk.shape(patchedVal) : j(patchedVal) === j(baseVal);
    if (ok) pass += 1; else fails.push({ id: chk.id, base: j(baseVal), patched: j(patchedVal) });

    rows.push([
      chk.id,
      chk.how,
      j(baseVal),
      j(rawVal),
      j(patchedVal),
      ok ? 'PASS' : 'FAIL',
    ]);
  }

  console.log(renderTable(rows, ['检测点', '类别', '基线值(Camoufox)', 'jsdom 原值', '补后值', '结果']));
  console.log('');
  console.log(`汇总：${pass}/${CHECKS.length} 项通过` + (fails.length ? `，${fails.length} 项未通过` : '（全部通过）'));
  if (fails.length) {
    for (const f of fails) console.log('  FAIL ' + f.id + '\n       基线 ' + f.base + '\n       补后 ' + f.patched);
  }

  console.log('');
  console.log('补丁条数        : ' + env.patchLog.length);
  console.log('jsdom 未实现告警: ' + (env.jsdomNotices.length ? env.jsdomNotices.length + ' 条（已收进 buffer，未污染 stdout）' : '0 条'));
  console.log('缺失的站点状态  : ' + (env.storageMissing.length ? env.storageMissing.join(', ') + '（只有 key 名/长度，无值 → 见报告「待主会话取证」）' : '无'));

  // 附：补丁清单（便于和 docs/env_report.md 对照）
  if (process.argv.includes('--log')) {
    console.log('\n--- patchLog ---');
    env.patchLog.forEach((l, i) => console.log(String(i + 1).padStart(3) + '. ' + l));
  }

  if (process.argv.includes('--sdk')) {
    console.log('\n=== SDK 加载验收 ===');
    require('./load_sdks').runAll({ verbose: true });
  }

  env.dispose();
  process.exitCode = fails.length ? 1 : 0;
}

if (require.main === module) main();
module.exports = { CHECKS, makeRaw, sha256 };
