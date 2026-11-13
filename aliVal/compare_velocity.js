// 对比「真人」与「我们生成」的轨迹速度曲线（dx/dt），看"变速"差在哪
const fs = require('fs');
const zlib = require('zlib');
const { unarmour } = require('./feilin_data');

function mmFromDataFile(file, getData) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dataB64 = getData(d);
  if (!dataB64) return null;
  const T = unarmour(Buffer.from(dataB64, 'base64')).toString('latin1');
  const plain = zlib.inflateSync(Buffer.from(T, 'base64')).toString('utf8');
  const payload = JSON.parse(plain.slice(32));
  return payload.TrackList.mm || '';
}

function analyze(mm, label) {
  const pts = mm.split('|').filter(Boolean).map(s => s.split(','));
  const arr = pts.map(p => ({ x: +p[0], y: +p[1], t: +p[2] })).filter(p =>
    Number.isFinite(p.x) && Number.isFinite(p.t));
  if (arr.length < 5) { console.log(`\n[${label}] 点太少`); return; }
  const v = [];      // px/ms
  const dxs = [];
  for (let i = 1; i < arr.length; i++) {
    const dt = arr[i].t - arr[i - 1].t;
    const dx = arr[i].x - arr[i - 1].x;
    dxs.push(dx);
    if (dt > 0) v.push({ i, v: dx / dt, dt, dx });
  }
  const vs = v.map(o => o.v).sort((a, b) => a - b);
  const q = p => vs[Math.min(vs.length - 1, Math.floor(vs.length * p))];
  const maxV = vs[vs.length - 1];
  const peakAt = v.findIndex(o => o.v === maxV) / v.length;
  const dxsSorted = [...dxs].sort((a, b) => a - b);
  const dq = p => dxsSorted[Math.min(dxsSorted.length - 1, Math.floor(dxsSorted.length * p))];

  // 速度曲线形状：前 1/3、中 1/3、后 1/3 的平均速度
  const n = v.length;
  const seg = [v.slice(0, n / 3), v.slice(n / 3, 2 * n / 3), v.slice(2 * n / 3, n)]
    .map(a => a.reduce((s, o) => s + o.v, 0) / Math.max(1, a.length));

  // 加速度符号变化次数（抖动/停顿的指标）
  let flips = 0;
  for (let i = 2; i < v.length; i++) {
    if (Math.sign(v[i].v - v[i - 1].v) !== Math.sign(v[i - 1].v - v[i - 2].v)) flips++;
  }

  console.log(`\n===== ${label}  (${arr.length} 点, 跨度 ${arr[arr.length - 1].t - arr[0].t}ms)`);
  console.log(`  速度 px/ms: 中位 ${q(0.5).toFixed(3)} p90 ${q(0.9).toFixed(3)} 最大 ${maxV.toFixed(3)}  (峰值在 ${(peakAt * 100).toFixed(0)}% 处)`);
  console.log(`  每步 dx: 中位 ${dq(0.5)} p90 ${dq(0.9)} 最大 ${dxsSorted[dxsSorted.length - 1]}`);
  console.log(`  三段平均速度: ${seg.map(x => x.toFixed(3)).join('  →  ')}   (加速比 后/前 = ${(seg[2] / Math.max(1e-6, seg[0])).toFixed(2)})`);
  console.log(`  加速度符号翻转 ${flips} 次 (占 ${(flips / v.length * 100).toFixed(0)}%)`);
  console.log(`  前 12 步 dx: ${dxs.slice(0, 12).join(' ')}`);
  console.log(`  后 12 步 dx: ${dxs.slice(-12).join(' ')}`);
}

try {
  const human = mmFromDataFile('config/human_cvp.json', d => JSON.parse(d.captchaVerifyParam).data);
  if (human) analyze(human, '真人手拖');
} catch (e) { console.log('human ERR', e.message); }

for (const f of ['config/simple_result.json', 'config/hifreq_result.json']) {
  if (!fs.existsSync(f)) continue;
  try {
    const mm = mmFromDataFile(f, d => JSON.parse(d.captchaVerifyParam).data);
    if (mm) analyze(mm, f.split('/').pop());
  } catch (e) { console.log(f, 'ERR', e.message); }
}
