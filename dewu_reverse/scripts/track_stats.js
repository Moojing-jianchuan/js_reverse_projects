/**
 * 用真实拖拽样本反推轨迹特征（用于标定生成器参数）
 * 数据源：artifacts/verify_d_plaintext.json 的 xys / pts / pc
 * 用法: node scripts/track_stats.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/verify_d_plaintext.json'), 'utf8'));

const seg = j.xys.split('|');
console.log('=== 原始样本 ===');
console.log('点数:', seg.length, '| width:', j.width, '| 总时长(pts):', j.pts.split('|')[1]);
console.log('pts:', j.pts);
console.log('pc :', j.pc);

// 首点：x,y,绝对时间戳；其余：x,y,相对时间
const first = seg[0].split(',').map(Number);
const pts = [];
for (let i = 0; i < seg.length; i++) {
  const p = seg[i].split(',').map(Number);
  pts.push({ x: p[0], y: p[1], t: p[2] });
}
console.log('\n首点:', JSON.stringify(pts[0]), '| 末点:', JSON.stringify(pts[pts.length - 1]));

// 差值分析（i>=1 之后 t 是相对毫秒）
const steps = [];
for (let i = 1; i < pts.length; i++) {
  const dx = pts[i].x - pts[i - 1].x;
  const dy = pts[i].y - pts[i - 1].y;
  const dt = pts[i].t - pts[i - 1].t;
  const dist = Math.hypot(dx, dy);
  steps.push({ i, dx, dy, dt, dist, v: dt > 0 ? dist / dt : 0 });
}

const dts = steps.map(s => s.dt);
const vs = steps.map(s => s.v);
const dists = steps.map(s => s.dist);
const dys = steps.map(s => s.dy);
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const max = a => Math.max.apply(null, a);
const min = a => Math.min.apply(null, a);

console.log('\n=== 步进统计（' + steps.length + ' 步） ===');
console.log('dt  : min', min(dts), 'max', max(dts), 'avg', avg(dts).toFixed(1), '| 不同值', new Set(dts).size);
console.log('dist: min', min(dists).toFixed(2), 'max', max(dists).toFixed(2), 'avg', avg(dists).toFixed(2));
console.log('速度: min', min(vs).toFixed(3), 'max', max(vs).toFixed(3), 'avg', avg(vs).toFixed(3), 'px/ms');
console.log('dy  : min', min(dys), 'max', max(dys), '| 负值(回拉)次数', dys.filter(d => d < 0).length);

// 速度曲线：前段加速、后段减速？
const half = Math.floor(vs.length / 2);
console.log('\n=== 速度曲线分段 ===');
console.log('前 1/4 平均速度:', avg(vs.slice(0, Math.floor(vs.length / 4))).toFixed(3));
console.log('中 1/2 平均速度:', avg(vs.slice(half - 5, half + 5)).toFixed(3));
console.log('后 1/4 平均速度:', avg(vs.slice(-Math.floor(vs.length / 4))).toFixed(3));

// 时间间隔是否等距（机器特征 vs 人手）
const dtUniq = [...new Set(dts)].sort((a, b) => a - b);
console.log('\n=== dt 分布（判断是否等距采样） ===');
console.log('取值:', dtUniq.slice(0, 15).join(','), dtUniq.length > 15 ? '…' : '');
console.log('是否等距:', dtUniq.length <= 2 ? '是（机器特征）' : '否（人手特征）');

// 采样点间隔与图片宽度的关系
console.log('\n=== 与图宽的关系 ===');
console.log('总位移 x:', pts[pts.length - 1].x - pts[0].x, '| 图宽 width =', j.width);
console.log('x 是否单调不减:', steps.every(s => s.dx >= 0) ? '是' : '否（有回拉）');

// 输出生成器应匹配的目标参数
console.log('\n=== 生成器应匹配的硬指标 ===');
const stats = {
  points: seg.length,
  durationMs: Number(j.pts.split('|')[1].split(',')[2]),
  dtMin: min(dts), dtMax: max(dts), dtAvg: +avg(dts).toFixed(1),
  vMax: +max(vs).toFixed(3), vAvg: +avg(vs).toFixed(3),
  totalDx: pts[pts.length - 1].x - pts[0].x,
  totalDy: pts[pts.length - 1].y - pts[0].y,
  yBacktracks: dys.filter(d => d < 0).length,
  xMonotonic: steps.every(s => s.dx >= 0),
  dtNonUniform: dtUniq.length > 2,
};
console.log(JSON.stringify(stats, null, 1));
fs.writeFileSync(path.join(ROOT, 'artifacts/track_stats.json'), JSON.stringify(stats, null, 1));
