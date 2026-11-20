/**
 * 解码落盘探针：接管 sandbox 内的 eval / Function，把每一段还原出来的脚本写到磁盘，
 * 以便定位"哪一段、哪一行"在当前环境里炸掉。
 * 用法: node scripts/decode_dump.js preinforce2
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { makeSandbox, ROOT } = require('./sandbox_factory.js');

const which = process.argv[2] || 'preinforce2';
const dirMap = { preinforce2: 'artifacts/js/preinforce2.js', pceptor: 'artifacts/js/pceptor.js', pyuntu: 'artifacts/js/pyuntu.js' };
const file = dirMap[which];
const outDir = path.join(ROOT, 'artifacts/stage2', which);
fs.mkdirSync(outDir, { recursive: true });

let idx = 0;
const ctx = makeSandbox({ uaFamily: 'chrome', hooks: false, globalExtras: {
  __dump: (kind, src) => {
    if (typeof src !== 'string' || src.length < 40) return;
    const p = path.join(outDir, String(idx++).padStart(3, '0') + '.' + kind + '.js');
    fs.writeFileSync(p, src);
  }
} });

// 在 context 内部接管 eval / Function（保持 realm 内建）
vm.runInContext(`
(function(){
  var G = globalThis;
  var realEval = G.eval;
  G.eval = function (s) { if (typeof s === 'string') G.__dump('eval', s); return realEval(s); };
  var RealFunction = G.Function;
  function HookedFunction() {
    var args = Array.prototype.slice.call(arguments);
    if (args.length) G.__dump('fn', String(args[args.length - 1]));
    return RealFunction.apply(this, args);
  }
  HookedFunction.prototype = RealFunction.prototype;
  G.Function = HookedFunction;
})();
`, ctx);

const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
try {
  vm.runInContext(code, ctx, { filename: which + '.js', timeout: 40000 });
  console.log('[OK]', which, 'executed');
} catch (e) {
  console.log('[THROW]', e && e.constructor && e.constructor.name, '-', String(e && e.message).slice(0, 200));
  const st = String(e && e.stack || '');
  const m = st.match(/<anonymous>:(\d+):(\d+)/);
  console.log('at line', m && m[1], 'col', m && m[2]);
  console.log(st.split('\n').slice(0, 4).join('\n'));
  if (m) {
    // 找最近落盘的那一段，打印该行上下文
    const files = fs.readdirSync(outDir).sort();
    for (const f of files.slice(-4)) {
      const src = fs.readFileSync(path.join(outDir, f), 'utf8');
      const lines = src.split('\n');
      const ln = parseInt(m[1], 10);
      console.log('\n--- ' + f + ' (' + lines.length + ' lines) line ' + ln + ' ---');
      console.log(JSON.stringify(lines.slice(Math.max(0, ln - 3), ln + 2).join('\n')).slice(0, 1500));
    }
  }
}
console.log('dumped', idx, 'stages to', outDir);
