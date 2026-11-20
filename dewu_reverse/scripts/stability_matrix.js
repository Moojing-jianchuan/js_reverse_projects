/**
 * 稳定性矩阵：同一环境下重复加载 N 次，看成功率。
 * 目的：定位"随机源 / 假 Date / hook"是否让 JSDUN 的初始化变成不确定。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { makeSandbox, ROOT } = require('./sandbox_factory.js');

const target = process.argv[2] || 'preinforce2';
const map = { preinforce2: 'artifacts/js/preinforce2.js', pceptor: 'artifacts/js/pceptor.js', pyuntu: 'artifacts/js/pyuntu.js' };
const code = fs.readFileSync(path.join(ROOT, map[target]), 'utf8');

function run(opts, n) {
  let ok = 0, globals = {};
  for (let i = 0; i < n; i++) {
    const ctx = makeSandbox(Object.assign({ uaFamily: 'chrome' }, opts));
    try {
      vm.runInContext(code, ctx, { filename: target + '.js', timeout: 20000 });
      const g = vm.runInContext('typeof fun === "object" && fun && typeof fun.Fun110 === "function" ? "fun" : (typeof jsdVipUserMark !== "undefined" ? "mark-only" : "none")', ctx);
      globals[g] = (globals[g] || 0) + 1;
      if (g === 'fun') ok++;
    } catch (e) {
      const k = 'THROW:' + String(e.message).slice(0, 40);
      globals[k] = (globals[k] || 0) + 1;
    }
  }
  return { ok, n, globals };
}

const variants = [
  ['default (fakeDate, real crypto)', { hooks: false }],
  ['deterministicRandom', { hooks: false, seed: { deterministicRandom: true } }],
  ['hooks:json', { hooks: true, jsonMin: 40 }],
  ['hooks:json + determine', { hooks: true, jsonMin: 40, seed: { deterministicRandom: true } }],
];

for (const [label, opts] of variants) {
  const r = run(opts, 5);
  console.log(label.padEnd(32), 'ok', r.ok + '/' + r.n, JSON.stringify(r.globals));
}
