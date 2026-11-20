/**
 * 时效定位：改 Date.now / performance.now / 各种计时源，看 d 明文里哪些字段跟着动。
 * 全部离线，不发请求。
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');

function capture(patchFn) {
  const env = createEnv({ blockNetwork: true, traceReads: false });
  const w = env.window;
  const strings = [];
  const oStr = w.JSON.stringify.bind(w.JSON);
  w.JSON.stringify = function (v, r, s) {
    const out = oStr(v, r, s);
    if (typeof out === 'string' && out.length > 60) strings.push(out);
    return out;
  };
  const xhrs = [];
  const P = w.XMLHttpRequest.prototype;
  const oOpen = P.open, oSend = P.send;
  P.open = function (m, u) { this.__c = { m, u: String(u) }; return oOpen.apply(this, arguments); };
  P.send = function (b) { if (this.__c) { this.__c.body = b == null ? null : String(b); xhrs.push(this.__c); } return oSend.apply(this, arguments); };

  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  if (patchFn) { try { patchFn(w); } catch (e) { console.log('patch fail', e.message); } }
  try { w.dewuCap({}); } catch (e) { console.log('dewuCap err', e.message); }

  return new Promise(resolve => {
    setTimeout(() => {
      const res = { strings, xhrs, plain: null, d: null };
      for (const c of xhrs) {
        try { const j = JSON.parse(c.body); if (j.d) { res.d = j.d; res.sign = j.sign; } } catch (e) { }
      }
      if (res.d) {
        const raw = Buffer.from(res.d, 'base64');
        const s = raw.toString('utf8');
        const n = s.length;
        const cand = strings.find(x => x.length === n);
        if (cand) res.plain = cand;
      }
      env.dispose();
      resolve(res);
    }, 1200);
  });
}

function diff(a, b, label) {
  console.log('\n===== ' + label + ' =====');
  if (!a.plain || !b.plain) { console.log('  缺明文，跳过'); return; }
  if (a.plain === b.plain) { console.log('  明文完全相同（该源不影响 d）'); return; }
  const ja = JSON.parse(a.plain), jb = JSON.parse(b.plain);
  const da = JSON.parse(ja.data), db = JSON.parse(jb.data);
  for (const k of Object.keys(jb)) if (JSON.stringify(jb[k]) !== JSON.stringify(ja[k])) console.log('  top.' + k, ':', JSON.stringify(ja[k]).slice(0, 80), '->', JSON.stringify(jb[k]).slice(0, 80));
  for (const k of Object.keys(db)) if (JSON.stringify(db[k]) !== JSON.stringify(da[k])) console.log('  data.' + k, ':', JSON.stringify(da[k]).slice(0, 80), '->', JSON.stringify(db[k]).slice(0, 80));
}

(async () => {
  const base = await capture(null);
  console.log('baseline: d?', !!base.d, 'plain?', !!base.plain);
  if (base.plain) {
    const j = JSON.parse(base.plain);
    console.log('  c =', j.c);
    console.log('  dje =', JSON.parse(j.data).dje);
  }

  const t = await capture(w => {
    const T = 1763600000000;
    w.Date.now = () => T;
    try { w.performance.now = () => 12345; } catch (e) { }
    w.__T = T;
  });
  console.log('\nDate.now/performance.now 固定后: d?', !!t.d);
  if (t.plain) { const j = JSON.parse(t.plain); console.log('  c =', j.c); console.log('  dje =', JSON.parse(j.data).dje); }
  diff(base, t, 'baseline vs 时间源固定');

  // 只改 performance.now
  const p = await capture(w => { try { w.performance.now = () => 987654; } catch (e) { } });
  if (p.plain) { const j = JSON.parse(p.plain); console.log('\n只改 performance.now 后 c =', j.c); }
  diff(base, p, 'baseline vs performance.now=987654');

  // 只改 Date.now
  const dt = await capture(w => { w.Date.now = () => 1763600000000; });
  if (dt.plain) { const j = JSON.parse(dt.plain); console.log('\n只改 Date.now 后 c =', j.c); }
  diff(base, dt, 'baseline vs Date.now 固定');
  process.exit(0);
})();
