// 对比「真人手拖」与「注入轨迹」的 payload 结构 / dt 分布
const fs = require('fs');
const zlib = require('zlib');
const { unarmour } = require('./feilin_data');

function payloadFromData(dataB64) {
  const raw = Buffer.from(dataB64, 'base64');            // 含 3 字节魔数
  const T = unarmour(raw).toString('latin1');            // ← unarmour 直接还原出完整 T（'eJ…'）
  const plain = zlib.inflateSync(Buffer.from(T, 'base64')).toString('utf8');
  return { T, nonce: plain.slice(0, 32), payload: JSON.parse(plain.slice(32)), inflated: plain.length };
}

function trackStats(track) {
  const pts = (track || '').split('|').filter(Boolean).map(s => s.split(','));
  const ts = pts.map(p => Number(p[2])).filter(Number.isFinite);
  const dts = [];
  for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1]);
  if (!dts.length) return { n: pts.length, dts: [] };
  const s = [...dts].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: pts.length, dts, min: s[0], p25: q(.25), med: q(.5), p75: q(.75), p90: q(.9),
           max: s[s.length - 1], distinct: new Set(dts).size, span: ts[ts.length - 1] - ts[0] };
}

function report(label, dataB64) {
  const p = payloadFromData(dataB64);
  const tl = p.payload.TrackList || {};
  const mm = trackStats(tl.mm), mp = trackStats(tl.mp);
  console.log(`\n===== ${label}`);
  console.log(`  dataLen(b64)=${dataB64.length}  T=${p.T.length}  inflated=${p.inflated}  nonce=${p.nonce}`);
  console.log(`  顶层: xPos=${p.payload.xPos} slidePos=${p.payload.slidePos} arg=${JSON.stringify(p.payload.arg)}`);
  console.log(`  VerifyTime-TrackStartTime = ${p.payload.VerifyTime - p.payload.TrackStartTime} ms`);
  for (const [nm, st] of [['mm', mm], ['mp', mp]]) {
    if (!st.n) { console.log(`  ${nm}: 空`); continue; }
    const hist = {};
    st.dts.forEach(d => hist[d] = (hist[d] || 0) + 1);
    const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(`  ${nm}: 点数=${st.n} 跨度=${st.span}ms | dt min=${st.min} p25=${st.p25} 中位=${st.med} p75=${st.p75} p90=${st.p90} max=${st.max} 不同值=${st.distinct}`);
    console.log(`      最常见 dt: ${top.map(([k, v]) => k + 'ms×' + v).join('  ')}`);
  }
  console.log(`  mm 采样片段: ${String(tl.mm).slice(0, 110)}`);
}

// 真人
if (fs.existsSync('config/human_cvp.json')) {
  const h = JSON.parse(fs.readFileSync('config/human_cvp.json', 'utf8'));
  const env = JSON.parse(h.captchaVerifyParam);
  report('真人手拖 (config/human_cvp.json)', env.data);
}
// 注入 / SDK 自产样本
for (const f of ['config/cvp_sample_1.json', 'config/cvp_sample_2.json']) {
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  report(f, d.cvp_blob);
}
