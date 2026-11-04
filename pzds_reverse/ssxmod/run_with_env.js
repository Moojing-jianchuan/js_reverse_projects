'use strict';

/**
 * run_with_env.js
 *
 * 职责：
 * 1. 不补环境。
 * 2. 固定加载顺序：env_patch.js -> env_fill.js -> 1.js。
 * 3. 捕获异常。
 * 4. 输出 1.js 在补环境后的 cookie / storage / 关键结果。
 * 5. env_fill.js 会把环境访问日志写入 env_log.txt，不在控制台刷屏。
 */

process.on('uncaughtException', (e) => {
  console.error('[RUN][uncaughtException]', e && e.stack || e);
  process.exitCode = 1;
});

process.on('unhandledRejection', (e) => {
  console.error('[RUN][unhandledRejection]', e && e.stack || e);
  process.exitCode = 1;
});

function safe(fn, fallback) {
  try { return fn(); } catch (_) { return fallback; }
}

function cookieValue(name) {
  const cookie = safe(() => String(document.cookie || ''), '');
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + escaped + '=([^;]*)'));
  return m ? m[1] : '';
}

function dumpStorage(storage) {
  if (!storage) return {};
  if (typeof storage._dump === 'function') return storage._dump();

  const out = {};
  const len = Number(storage.length || 0);
  for (let i = 0; i < len; i++) {
    const k = storage.key(i);
    out[k] = storage.getItem(k);
  }
  return out;
}

console.log('[RUN] start');

try {
  require('./env_patch.js');
  console.log('[RUN] env_patch loaded');
} catch (e) {
  console.error('[RUN][env_patch failed]', e && e.stack || e);
  process.exitCode = 1;
}

try {
  require('./env_fill.js');
  console.log('[RUN] env_fill diagnostics loaded');
} catch (e) {
  console.error('[RUN][env_fill failed]', e && e.stack || e);
  process.exitCode = 1;
}

try {
  require('./hook_join.js');
  console.log('[RUN] hook_join loaded');
} catch (e) {
  console.error('[RUN][hook_join failed]', e && e.stack || e);
  process.exitCode = 1;
}

try {
  var _savedNode = process.versions.node;
  try { delete process.versions.node; } catch(_) { process.versions.node = undefined; }
  require('./1.js');
  console.log('[RUN] 1.js loaded');
} catch (e) {
  console.error('[RUN][1.js failed]', e && e.stack || e);
  process.exitCode = 1;
} finally {
  try { process.versions.node = _savedNode; } catch(_) {}
}

// 异步行为注入已禁用：浏览器首次加载时 g.len=0 / u.len=0 / e.len=0
// 零用户交互匹配浏览器真实首次页面加载状态，此时 dK[3] = -1|0|0|0|0
console.log('[RUN] behavior injection disabled (fresh page load state)');

setTimeout(() => {
  console.log('\n[RUN-RESULT]');

  const cookie = safe(() => String(document.cookie || ''), '');
  const itna = cookieValue('ssxmod_itna');
  const itna2 = cookieValue('ssxmod_itna2');

  console.log('[COOKIE]', cookie);
  console.log('[RESULT] ssxmod_itna.length =', itna.length);
  if (itna) console.log('[RESULT] ssxmod_itna.preview =', itna.slice(0, 220));
  console.log('[RESULT] ssxmod_itna2.length =', itna2.length);
  if (itna2) console.log('[RESULT] ssxmod_itna2.preview =', itna2.slice(0, 220));

  console.log('[LOCAL_STORAGE]', JSON.stringify(safe(() => dumpStorage(localStorage), {}), null, 2));
  console.log('[SESSION_STORAGE]', JSON.stringify(safe(() => dumpStorage(sessionStorage), {}), null, 2));

  if (typeof globalThis.__ENV_PATCH_DUMP__ === 'function') {
    console.log('[ENV_PATCH_DUMP]', JSON.stringify(safe(() => globalThis.__ENV_PATCH_DUMP__(), {}), null, 2));
  }

  if (typeof globalThis.__ENV_FILL_SUMMARY__ === 'function') {
    globalThis.__ENV_FILL_SUMMARY__({ print: false, reason: 'run_result' });
  }

  // Dump ITNA2 capture data
  var cap = globalThis.__ITNA2_CAPTURE__;
  if (cap) {
    console.log('[ITNA2_CAPTURE] dM4 =', JSON.stringify(cap.dM4));
    console.log('[ITNA2_CAPTURE] sub16 =', JSON.stringify(cap.sub16));
    console.log('[ITNA2_CAPTURE] fullPayload =', cap.fullPayload);
    console.log('[ITNA2_CAPTURE] fullPayloadLen =', cap.fullPayloadLen);
    console.log('[ITNA2_CAPTURE] gArrLen =', cap.gArrLen);
    if (cap.gArr && cap.gArr.length > 0) {
      console.log('[ITNA2_CAPTURE] gArr[0..4] =', JSON.stringify(Array.prototype.slice.call(cap.gArr, 0, 5)));
    }
    console.log('[ITNA2_CAPTURE] uArrLen =', cap.uArrLen);
    console.log('[ITNA2_CAPTURE] eArrLen =', cap.eArrLen);
  }

  console.log('[RUN] env log should be written to:', process.env.ENV_LOG_PATH || 'D:\\downloads\\cache\\js_reverse\\pzds_reverse\\ssxmod\\env_log.txt');

  process.exit(process.exitCode || 0);
}, Number(process.env.RUN_DUMP_DELAY || 1500));
