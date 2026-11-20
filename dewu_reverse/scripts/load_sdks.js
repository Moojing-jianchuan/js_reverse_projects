/**
 * load_sdks.js —— 三个风控 SDK 在 env_patch 沙箱里的加载验收
 *
 *   node scripts/load_sdks.js          # 每个 SDK 各起一个干净沙箱（隔离验收）
 *   node scripts/load_sdks.js --seq    # 顺序加载 preinforce2 → pceptor → pyuntu（贴页面真实顺序）
 *   node scripts/load_sdks.js --one pyuntu.js
 *
 * 验收口径：不抛异常 + 张榜（SDK 挂到 window 上的全局）符合预期。
 * 注意：SDK 被 eval 进 jsdom 的 window 域，所以它看到的 Function/Object 等都是该域的原生对象。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const JS_DIR = path.resolve(__dirname, '..', 'artifacts', 'js');
const ORDER = ['preinforce2.js', 'pceptor.js', 'pyuntu.js'];

/**
 * 对照组：未打补丁的裸 jsdom（只为记录「哪些检测点是加载阶段就致命的」）
 * 用法 node scripts/load_sdks.js --raw
 */
function makeRawEnv() {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const notices = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => notices.push(String(e && e.message || e).slice(0, 200)));
  vc.on('error', () => undefined);
  vc.on('warn', () => undefined);
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.dewu.com/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
  });
  return {
    window: dom.window,
    evalSource(code, file) { return dom.window.eval(String(code) + '\n//# sourceURL=' + file); },
    globals() { return { added: [], changed: [] }; },
    jsdomNotices: notices,
    netLog: [],
    patchLog: [],
    dispose() { try { dom.window.close(); } catch (e) { /* ignore */ } },
  };
}

function runOne(env, file) {
  const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
  const t0 = Date.now();
  const rec = { file, ok: true, error: null, stack: null, ms: 0, added: [], changed: [], notices: 0, net: 0 };
  try {
    env.evalSource(code, file);
  } catch (e) {
    rec.ok = false;
    rec.error = (e && e.message ? e.message : String(e)).slice(0, 300);
    rec.stack = String((e && e.stack) || '').split('\n').slice(1, 4).join('\n');
  }
  rec.ms = Date.now() - t0;
  const g = env.globals();
  rec.added = g.added;
  rec.changed = g.changed;
  rec.notices = env.jsdomNotices.length;
  rec.net = env.netLog.length;
  return rec;
}

function report(rec) {
  const flag = rec.ok ? 'OK  ' : 'THROW';
  console.log(`[${flag}] ${rec.file.padEnd(16)} ${String(rec.ms).padStart(5)}ms  新增全局 ${rec.added.length} 个 / 覆盖 ${rec.changed.length} 个 / jsdom告警 ${rec.notices} / 拦截请求 ${rec.net}`);
  if (rec.added.length) console.log('        新增: ' + rec.added.join(', '));
  if (rec.changed.length) console.log('        覆盖: ' + rec.changed.join(', '));
  if (!rec.ok) {
    console.log('        异常: ' + rec.error);
    if (rec.stack) console.log(String(rec.stack).split('\n').map((l) => '        ' + l).join('\n'));
  }
  return rec.ok;
}

function runAll(opts) {
  const o = opts || {};
  const seq = o.seq || process.argv.includes('--seq');
  const results = [];

  if (!seq) {
    console.log('模式：每个 SDK 一个干净沙箱');
    for (const f of ORDER) {
      const env = createEnv({ traceReads: true });
      const rec = runOne(env, f);
      rec.reads = env.readCounts();
      results.push(rec);
      report(rec);
      printReads(rec.reads);
      env.dispose();
    }
  } else {
    console.log('模式：单沙箱顺序加载 ' + ORDER.join(' → '));
    const env = createEnv({ traceReads: true });
    for (const f of ORDER) {
      const rec = runOne(env, f);
      rec.reads = env.readCounts();
      results.push(rec);
      report(rec);
      printReads(rec.reads, f);
    }
    console.log('最终 window 新增全局: ' + JSON.stringify(env.globals().added));
    console.log('最终 window 覆盖全局: ' + JSON.stringify(env.globals().changed));
    env.dispose();
  }

  const allOk = results.every((r) => r.ok);
  console.log('\n结论：' + (allOk ? '三个 SDK 全部加载完成，无异常' : '存在抛异常的 SDK，见上'));
  return { results, allOk };
}

/** 打印「SDK 加载阶段实际读了什么」——这是「一定会读」的运行期证据 */
function printReads(reads, tag) {
  const top = (reads || []).filter((r) => r.n > 0).slice(0, 26);
  if (!top.length) return;
  console.log('        实际读值' + (tag ? '（累计到 ' + tag + '）' : '') + ': '
    + top.map((r) => r.label + '×' + r.n).join(', '));
}

if (require.main === module) {
  const oneIdx = process.argv.indexOf('--one');
  if (process.argv.includes('--raw')) {
    console.log('对照组：裸 jsdom（无任何补丁），用于定位「加载阶段就致命」的检测点');
    for (const f of ORDER) {
      const env = makeRawEnv();
      const rec = runOne(env, f);
      report(rec);
      env.dispose();
    }
    process.exitCode = 0;
  } else if (oneIdx !== -1) {
    const f = process.argv[oneIdx + 1];
    const env = createEnv();
    const rec = runOne(env, f);
    report(rec);
    console.log('patchLog: ' + env.patchLog.length + ' 条');
    env.dispose();
    process.exitCode = rec.ok ? 0 : 1;
  } else {
    const { allOk } = runAll({ seq: process.argv.includes('--seq') });
    process.exitCode = allOk ? 0 : 1;
  }
}

module.exports = { runAll, runOne, ORDER, JS_DIR };
