/**
 * 得物纯协议过码器（骨架 + 轨迹生成）
 *
 * 依据：从真实 verify 的 d 明文还原出的字段结构（artifacts/verify_d_plaintext.json）
 *   {"sessionID","width","type":5,"pts":"sx,sy,ts|ex,ey,cost","xys":"x,y,t|...",
 *    "data":"<环境指纹 JSON>","bcv","webp","c":"v=..|rest=..|vrest=..|vreqt=..|sqt=..|ojst=..",
 *    "pc":"x1,y1|x2,y2","pn":N,"trace":"32hex"}
 *
 * 用法:
 *   node src/cap_solver.js --demo            只打印生成的轨迹与明文（不发请求）
 *   node src/cap_solver.js --call            发 captcha/call 拿挑战
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEnv } = require('./env_patch');
const { createCapProbe } = require('./dewu_cap_probe');

const ROOT = path.resolve(__dirname, '..');
const SALT = '048a9c4943398714b356a696503d2d36';
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const randHex = n => crypto.randomBytes(n).toString('hex');
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));

// ───────────────────────── 轨迹生成 ─────────────────────────
/**
 * 生成一条"人手拖拽"轨迹。
 *
 * 参数不再是猜的，而是按真实样本（用户手动拖拽，artifacts/track_stats.json）标定：
 *   点数 126 · 总时长 1102ms · 速度前 1/4=0.70 → 后 1/4=0.11 px/ms（减速曲线）
 *   dt 非等距（3~89ms，16 种不同取值）· x 单调不减 · y 有 1 次回拉
 *   位移示例：x +127 / y -377（终点由「选中图位置 → 白框中心」决定，不是这里写死的）
 */
function genTrack(opt) {
  const o = Object.assign({
    sx: 274, sy: 626,          // 起点：被选中图片的页面坐标（由调用方按布局算出）
    ex: 401, ey: 249,          // 终点：白框中心的页面坐标（同上）
    durationMs: rndInt(950, 1250),
    points: rndInt(118, 134),
    now: Date.now(),
  }, opt || {});

  const n = o.points;
  const ts0 = o.now;
  const dx = o.ex - o.sx, dy = o.ey - o.sy;

  // 速度权重：easeOutQuad 的导数（1-p）→ 前快后慢；再叠加两处微停顿
  const w = [];
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    let wi = Math.max(0.05, 1 - p);
    if (i === Math.floor(n * 0.45) || i === Math.floor(n * 0.78)) wi *= 0.35;
    w.push(wi);
  }
  const wSum = w.reduce((a, b) => a + b, 0);

  const xys = [`${o.sx},${o.sy},${ts0}`];   // 首点：绝对坐标 + 绝对时间戳
  let t = 0;
  for (let i = 1; i < n; i++) {
    const p = i / (n - 1);
    // 位置：按权重累积（保证 x 单调）
    const frac = w.slice(0, i + 1).reduce((a, b) => a + b, 0) / wSum;
    const x = Math.round(o.sx + dx * frac);
    // y：主方向 + 轻微抖动（允许 1 次回拉）
    const jit = (i === Math.floor(n * 0.62)) ? -Math.abs(dy) * 0.012 : 0;
    const y = Math.round(o.sy + dy * frac + jit + Math.sin(p * Math.PI * 5) * 0.8);
    // 时间：非等距（3~89ms，长尾）
    const dt = Math.max(3, Math.round((o.durationMs / n) * rnd(0.25, 4.2)));
    t += dt;
    xys.push(`${x},${y},${t}`);
  }

  return {
    xys: xys.join('|'),
    pts: `${o.sx},${o.sy},${ts0}|${o.ex},${o.ey},${o.durationMs}`,
    pc: `${(o.sx * 2.32).toFixed(2)},${(o.sy * 0.44).toFixed(2)}|${(o.ex * 2.32).toFixed(2)},${(o.ey * 1.31).toFixed(2)}`,
    pn: rndInt(900, 1400),
    trace: randHex(16).toUpperCase(),
    durationMs: o.durationMs,
    points: n,
  };
}

// ───────────────────────── 环境指纹 data ─────────────────────────
function buildDataField(envTpl, sk, dwsm, ua) {
  const inner = JSON.parse(envTpl);
  inner.sk = sk; inner.shumeiId = dwsm; inner.dua = ua;
  if (inner.jcmp) { inner.jcmp.dua = ua; inner.jcmp.dlocalSk = sk ? null : null; }
  return JSON.stringify(inner);
}

// ───────────────────────── 模板轨迹（推荐） ─────────────────────────
/**
 * 用「真人轨迹模板」做仿射变换，而不是凭空造曲线。
 *
 * 依据：真实样本 126 点（用户手动拖拽），保留了人手特有的节流节奏（dt 只有 16 种取值、
 * 分布 3~89ms）、前快后慢的速度曲线、以及 1 次 y 回拉。这些特征靠随机生成很难逼近
 * （实测：自造曲线前 1/4 速度只有真人的 46%，dt 取值数量是真人的 2.4 倍）。
 *
 * 做法：把模板轨迹归一化到 [0,1]，再按新的「起点→终点」缩放平移，dt 序列原样保留。
 * 这样生成出来的轨迹在形状与节奏上都与真人同源，只是换了落点。
 */
function loadTemplate() {
  const p = path.join(ROOT, 'artifacts/verify_d_plaintext.json');
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!j.xys) return null;
  const seg = j.xys.split('|');
  const pts = seg.map(s => s.split(',').map(Number));
  const x0 = pts[0][0], y0 = pts[0][1];
  const xN = pts[pts.length - 1][0], yN = pts[pts.length - 1][1];
  const dt = [];
  for (let i = 2; i < pts.length; i++) dt.push(Math.max(3, pts[i][2] - pts[i - 1][2]));
  // 归一化形状
  const shape = pts.map(p => ({
    fx: xN === x0 ? 0 : (p[0] - x0) / (xN - x0),
    fy: yN === y0 ? 0 : (p[1] - y0) / (yN - y0),
  }));
  return { shape, dt, points: pts.length, durationMs: pts[pts.length - 1][2], src: { x0, y0, xN, yN } };
}

/** 按模板形状 + 新起终点生成轨迹 */
function genTrackFromTemplate(opt) {
  const o = Object.assign({ sx: 274, sy: 626, ex: 401, ey: 249, now: Date.now() }, opt || {});
  const tpl = loadTemplate();
  if (!tpl) return genTrack(o);
  const { shape, dt } = tpl;
  const dx = o.ex - o.sx, dy = o.ey - o.sy;
  // 时长随位移缩放：人手拖得越短越快（保留速度量级，避免"短距离慢速"这种机器特征）
  const srcLen = Math.hypot(tpl.src.xN - tpl.src.x0, tpl.src.yN - tpl.src.y0) || 1;
  const newLen = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1.6, Math.max(0.45, newLen / srcLen));
  const xys = [`${o.sx},${o.sy},${o.now}`];
  let t = 0;
  for (let i = 1; i < shape.length; i++) {
    const x = Math.round(o.sx + dx * shape[i].fx);
    const y = Math.round(o.sy + dy * shape[i].fy);
    t += Math.max(3, Math.round((dt[i - 2] || 8) * scale));
    xys.push(`${x},${y},${t}`);
  }
  return {
    xys: xys.join('|'),
    pts: `${o.sx},${o.sy},${o.now}|${o.ex},${o.ey},${t}`,
    pc: `${(o.sx * 2.32).toFixed(2)},${(o.sy * 0.44).toFixed(2)}|${(o.ex * 2.32).toFixed(2)},${(o.ey * 1.31).toFixed(2)}`,
    pn: rndInt(900, 1400),
    trace: randHex(16).toUpperCase(),
    durationMs: t,
    points: shape.length,
    scale: +scale.toFixed(3),
    fromTemplate: true,
  };
}
function encryptCaptcha(plainObj, ks) {
  const plain = JSON.stringify(plainObj);
  const p = Buffer.from(plain, 'utf8');
  if (ks.length < p.length) throw new Error(`keystream 不足：需要 ${p.length}，只有 ${ks.length}`);
  const cipher = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) cipher[i] = p[i] ^ ks[i];
  const d = Buffer.from(cipher.toString('latin1'), 'utf8').toString('base64');
  return { d, sign: md5('d' + d + SALT), plain };
}

/** 用 pyuntu 通道标定 captcha keystream（同一 sk + UA 下恒定） */
async function calibrateCaptchaKs(sk, dwsm, needLen) {
  const env = createEnv({ blockNetwork: true, traceReads: false, seedStorage: { sk, dwsm } });
  const probe = createCapProbe(env, {});
  probe.installPreLoad();
  env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
  probe.installPostLoad();
  await probe.call({ sessionId: 'A'.repeat(Math.max(2000, (needLen || 1500) + 600)) });
  const rep = probe.report();
  env.dispose();
  return rep.data.keystream;
}

// ───────────────────────── 组装 verify 明文 ─────────────────────────
function buildVerifyPlain(opts) {
  const o = Object.assign({
    sessionID: '', width: 384, type: 5, track: null,
    dataField: '', bcv: '1.3.1.20260331', webp: 1,
    c: 'v=1.3.1.20260331|rest=156|vrest=0|vreqt=4|sqt=73873|ojst=19',
    rest: 156, vrest: 0, vreqt: 4, sqt: 73873, ojst: 19,
  }, opts || {});
  const tr = o.track || genTrack();
  const c = `v=${o.bcv}|rest=${o.rest}|vrest=${o.vrest}|vreqt=${o.vreqt}|sqt=${o.sqt}|ojst=${o.ojst}`;
  // 字段顺序必须与真实样本一致：sessionID,width,type,pts,xys,data,bcv,webp,c,pc,pn,trace
  return {
    sessionID: o.sessionID,
    width: o.width,
    type: o.type,
    pts: tr.pts,
    xys: tr.xys,
    data: o.dataField,
    bcv: o.bcv,
    webp: o.webp,
    c,
    pc: tr.pc,
    pn: tr.pn,
    trace: tr.trace,
  };
}

// ───────────────────────── CLI ─────────────────────────
const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

(async () => {
  if (argv.includes('--demo')) {
    const tr = genTrack();
    console.log('轨迹点数:', tr.points, '| 时长:', tr.durationMs, 'ms');
    console.log('xys:', tr.xys.slice(0, 300) + '…');
    console.log('pts:', tr.pts);
    console.log('pc :', tr.pc);
    console.log('pn :', tr.pn, '| trace:', tr.trace);
    const plain = buildVerifyPlain({ sessionID: 'DEMO_SESSION_ID', dataField: '{"dua":"…"}', track: tr });
    console.log('\nverify 明文（前 400）:', JSON.stringify(plain).slice(0, 400));
    console.log('字段顺序:', Object.keys(plain).join(','));
    return;
  }
  console.log('用法: node src/cap_solver.js --demo');
  console.log('（完整 call/verify 流程需新鲜 sk，见 docs/cap_solver_plan.md）');
})().catch(e => console.error('ERR', e));

module.exports = { genTrack, genTrackFromTemplate, loadTemplate, buildVerifyPlain, encryptCaptcha, calibrateCaptchaKs, buildDataField, md5 };
