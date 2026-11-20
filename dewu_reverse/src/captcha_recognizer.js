'use strict';
/**
 * 得物「图集验证码」识别器 —— 纯 Node / 纯 CPU / 完全离线
 * ═══════════════════════════════════════════════════════════════════════════
 * 题目形态（基于 artifacts/capture_call.json、artifacts/capture_call2.json 的实测解码）：
 *   - `image`  ：题目图。实测 **100×21 的「文字标签」**（灰度 webp，黑字白底，样本为「沙发」），
 *                不是物体照片 —— 官方把类目名渲染成图片，用来防止直接读 JSON。
 *   - `bgList` ：6 张候选。5 张 80×80 照片（webp），第 6 张是 `blank.png` 占位（**URL**，不是 dataURL）；
 *                占位图所在的**下标不固定**（样本 A 在 5，样本 B 在 0）。
 *   - 正确候选 = 照片内容里出现「标签所指物体」的那一张。
 *
 * 因此内部按 mode 分流（三条独立通道）：
 *
 *   ① crop   题目图是「物体裁剪 / 同款小图」（另一种挑战变体）
 *            → 多尺度零均值归一化互相关(NCC) 为主 + 颜色直方图 + 结构相关。
 *            像素级可比，是本模块**准确率最高**的通道（见报告里的合成裁剪基准）。
 *   ② label  题目图是「文字标签」
 *            → 像素永远对不上照片，纯 CV 无解（数学上：文本渲染图与照片不在同一特征空间）。
 *              本模块不塞模型，改用「标签指纹 + 类目记忆库(gallery)」做图-图检索：
 *              指纹相同的标签，去比对历史上该类目**正确答案图**的描述子（HOG 边缘方向为主）。
 *              记忆库未命中 → 只给可解释的弱先验，并把 confidence 压到 ≤0.15，绝不假装确定。
 *   ③ oracle 调用方额外传入 `bgImage`（底图）
 *            → 实测 bgImage 是「正确答案候选」的大面积马赛克降质版：
 *              A 样本 50/64 个 8×8 块归属候选 0（红沙发），B 样本 26/64 块归属候选 3（绿沙发）。
 *              用「逐块颜色均值归属投票」即可反查答案，且对人眼判定 2/2 一致。
 *              生产环境这条通道能直接拿到答案，无需视觉模型。
 *
 * 依赖：仅 sharp（webp 解码 + 重采样）。
 * ═══════════════════════════════════════════════════════════════════════════
 */
const crypto = require('crypto');
const sharp = require('sharp');

// ───────────────────────────── 常量 ─────────────────────────────
const THUMB = 32;          // 结构缩略图边长
const HOG_S = 64;          // HOG 采样边长
const HOG_G = 4;           // HOG 网格（4×4 cell）
const HOG_B = 8;           // HOG 方向 bin
const HIST_BINS = 4;       // 每通道直方图 bin → 4^3 = 64 维
const BLOCK_G = 8;         // oracle 通道的块网格（8×8 = 64 块）

// 相似度权重
// W_IMAGE  ：图-图整体比对（oracle 的次要项）
// W_GALLERY：类目记忆库检索专用 —— **HOG 主导**。实测（跨样本 1-shot，见报告 §4）：
//            颜色直方图/感知哈希在"同是沙发但一红一绿"的场景会把答案压到最低分，
//            只有梯度方向结构（横竖家具线条 vs 海面/天空/草原）能挑出来，因此颜色权重归零。
const W_IMAGE = { hist: 0.2, phash: 0.15, struct: 0.2, hog: 0.45 };
const W_GALLERY = { hist: 0.0, phash: 0.0, struct: 0.1, hog: 0.9 };

// ───────────────────────────── 解码 ─────────────────────────────
function dataUrlToBuffer(u) {
  if (typeof u !== 'string') return null;
  const m = /^data:[^;]*;base64,(.*)$/s.exec(u.trim());
  if (!m) return null;
  try { return Buffer.from(m[1], 'base64'); } catch (e) { return null; }
}

function isDataUrl(u) {
  return typeof u === 'string' && /^data:[^;]*;base64,/s.test(u.trim());
}

/**
 * 解码成 RGBA 原始像素（**已把 alpha 合成到白底**）。
 *
 * 两个实测坑，都会让"题目图"看起来全黑：
 *  1) webp 可能是**单通道灰度**(channels=1) 或灰度+alpha(2)。按固定 4 字节步长读会读到别的通道
 *     （早期版本因此把亮度全算成 0、把文字标签误判成照片裁剪）。
 *  2) 题目图是 **透明底上的黑色字形**（rgba≈(0,0,0,0)）。若不 flatten，平均亮度恒为 0，
 *     任何"白底文字"的判别都会失效。页面渲染时底色是白的，所以这里按白底合成。
 */
async function decodeRGBA(buf) {
  const { data, info } = await sharp(buf)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const n = info.width * info.height;
  const out = Buffer.alloc(n * 4);
  if (ch >= 3) {
    for (let i = 0; i < n; i++) {
      out[i * 4] = data[i * ch];
      out[i * 4 + 1] = data[i * ch + 1];
      out[i * 4 + 2] = data[i * ch + 2];
      out[i * 4 + 3] = ch >= 4 ? data[i * ch + 3] : 255;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const v = data[i * ch];
      out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v;
      out[i * 4 + 3] = ch === 2 ? data[i * ch + 1] : 255;
    }
  }
  return { data: out, w: info.width, h: info.height, ch: 4, srcChannels: ch };
}

/** 解码成 w×h 的灰度 Float32（0..1），fit=fill 拉伸（与页面 object-fit:fill 一致），alpha 合成白底 */
async function decodeGray(buf, w, h) {
  const { data, info } = await sharp(buf)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (ch >= 3) out[i] = (0.299 * data[i * ch] + 0.587 * data[i * ch + 1] + 0.114 * data[i * ch + 2]) / 255;
    else out[i] = data[i * ch] / 255;
  }
  return out;
}

// ───────────────────────────── 基础工具 ─────────────────────────────
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function resizeGray(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return src;
  const out = new Float32Array(dw * dh);
  const sx = sw / dw, sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(sh - 1, y0 + 1));
    const wy = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < dw; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.max(0, Math.min(sw - 1, x0 + 1));
      const wx = Math.max(0, Math.min(1, fx - x0));
      const a = src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx;
      const b = src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx;
      out[y * dw + x] = a * (1 - wy) + b * wy;
    }
  }
  return out;
}

function normalizeZeroMean(v) {
  const n = v.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += v[i];
  const mean = s / n;
  const out = new Float32Array(n);
  let ss = 0;
  for (let i = 0; i < n; i++) { const d = v[i] - mean; out[i] = d; ss += d * d; }
  const norm = Math.sqrt(ss) || 1;
  for (let i = 0; i < n; i++) out[i] /= norm;
  return out;
}

/** 相关系数 -1..1 */
function corr(a, b) {
  const na = normalizeZeroMean(a), nb = normalizeZeroMean(b);
  let s = 0;
  for (let i = 0; i < na.length; i++) s += na[i] * nb[i];
  return s;
}

// ───────────────────────────── 颜色直方图 ─────────────────────────────
function colorHistogram(rgba) {
  const { data, w, h } = rgba;
  const hist = new Float32Array(HIST_BINS ** 3);
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const ri = Math.min(HIST_BINS - 1, (data[i * 4] * HIST_BINS) >> 8);
    const gi = Math.min(HIST_BINS - 1, (data[i * 4 + 1] * HIST_BINS) >> 8);
    const bi = Math.min(HIST_BINS - 1, (data[i * 4 + 2] * HIST_BINS) >> 8);
    hist[(ri * HIST_BINS + gi) * HIST_BINS + bi] += 1;
  }
  for (let i = 0; i < hist.length; i++) hist[i] /= n;
  return hist;
}

function histIntersection(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.min(a[i], b[i]);
  return clamp01(s);
}

// ───────────────────────────── pHash ─────────────────────────────
function dct1d(v, n) {
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += v[i] * Math.cos((Math.PI * (2 * i + 1) * k) / (2 * n));
    out[k] = s;
  }
  return out;
}

function pHashFromGray(g) {
  const n = THUMB;
  const tmp = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    const row = new Float64Array(n);
    for (let x = 0; x < n; x++) row[x] = g[y * n + x];
    const d = dct1d(row, n);
    for (let x = 0; x < n; x++) tmp[y * n + x] = d[x];
  }
  const coef = new Float64Array(64);
  let ci = 0;
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < n; y++) {
        const c = Math.cos((Math.PI * (2 * y + 1) * u) / (2 * n));
        if (c === 0) continue;
        for (let x = 0; x < n; x++) s += tmp[y * n + x] * c * Math.cos((Math.PI * (2 * x + 1) * v) / (2 * n));
      }
      coef[ci++] = s;
    }
  }
  const rest = Array.from(coef).slice(1).sort((a, b) => a - b);
  const med = rest[rest.length >> 1];
  const bits = new Uint8Array(8);
  for (let i = 0; i < 63; i++) if (coef[i + 1] > med) bits[(i / 8) | 0] |= 1 << (i % 8);
  return bits;
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = a[i] ^ b[i]; while (x) { d += x & 1; x >>= 1; } }
  return d;
}

// ───────────────────────────── HOG-lite ─────────────────────────────
/**
 * 4×4 cell × 8 方向 梯度方向直方图（L2 归一化）。
 * 为什么用它：文字标签场景下 gallery 只能做「同类目图-图检索」。实测在 2 个真实样本的
 * 跨样本 1-shot 检索上，HOG 是唯一 2/2 命中的描述子（layout/直方图/HSV 全部失败）——
 * 因为室内带沙发的场景以横竖结构为主，与海面/天空/草原等纹理可分。
 */
function hogLite(g, S, G, B) {
  const cell = S / G;
  const out = new Float32Array(G * G * B);
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const dx = g[y * S + x + 1] - g[y * S + x - 1];
      const dy = g[(y + 1) * S + x] - g[(y - 1) * S + x];
      const mag = Math.hypot(dx, dy);
      if (mag < 1e-6) continue;
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI;
      const bin = Math.min(B - 1, Math.floor((ang / Math.PI) * B));
      const cx = Math.min(G - 1, Math.floor(x / cell));
      const cy = Math.min(G - 1, Math.floor(y / cell));
      out[(cy * G + cx) * B + bin] += mag;
    }
  }
  let s = 0;
  for (let i = 0; i < out.length; i++) s += out[i] * out[i];
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= s;
  return out;
}

// ───────────────────────────── 多尺度模板匹配 ─────────────────────────────
/**
 * 候选图上滑动模板，取零均值归一化互相关(NCC)最大值。
 * 积分图算窗口均值/方差，模板零均值化 → 窗口内积即协方差，除以两边标准差得 NCC。
 */
function nccMax(candGray, cw, ch, tplGray, tw0, th0, scales, opt) {
  const o = Object.assign({ stride: 1, minSide: 6 }, opt || {});
  const W = cw + 1;
  const I = new Float64Array(W * (ch + 1));
  const I2 = new Float64Array(W * (ch + 1));
  for (let y = 0; y < ch; y++) {
    let rs = 0, rs2 = 0;
    for (let x = 0; x < cw; x++) {
      const v = candGray[y * cw + x];
      rs += v; rs2 += v * v;
      I[(y + 1) * W + (x + 1)] = I[y * W + (x + 1)] + rs;
      I2[(y + 1) * W + (x + 1)] = I2[y * W + (x + 1)] + rs2;
    }
  }
  const boxSum = (A, x, y, w, h) =>
    A[(y + h) * W + (x + w)] - A[y * W + (x + w)] - A[(y + h) * W + x] + A[y * W + x];

  let best = { score: -1, x: 0, y: 0, scale: 1, tw: 0, th: 0 };
  for (const s of scales) {
    const tw = Math.max(o.minSide, Math.round(tw0 * s));
    const th = Math.max(o.minSide, Math.round(th0 * s));
    if (tw > cw || th > ch) continue;
    const tpl = resizeGray(tplGray, tw0, th0, tw, th);
    const n = tw * th;
    const tz = new Float32Array(n);
    let tsum = 0;
    for (let i = 0; i < n; i++) tsum += tpl[i];
    const tmean = tsum / n;
    let tvar = 0;
    for (let i = 0; i < n; i++) { tz[i] = tpl[i] - tmean; tvar += tz[i] * tz[i]; }
    const tnorm = Math.sqrt(tvar);
    if (tnorm < 1e-6) continue;      // 平坦模板（纯白/纯色）不参与匹配
    for (let y = 0; y + th <= ch; y += o.stride) {
      for (let x = 0; x + tw <= cw; x += o.stride) {
        const s1 = boxSum(I, x, y, tw, th);
        const s2 = boxSum(I2, x, y, tw, th);
        const varw = s2 - (s1 * s1) / n;
        if (varw <= 1e-9) continue;
        let dot = 0;
        for (let ty = 0; ty < th; ty++) {
          const crow = (y + ty) * cw + x;
          const trow = ty * tw;
          for (let tx = 0; tx < tw; tx++) dot += tz[trow + tx] * candGray[crow + tx];
        }
        const score = dot / (tnorm * Math.sqrt(varw));
        if (score > best.score) best = { score, x, y, scale: s, tw, th };
      }
    }
  }
  return best;
}

// ───────────────────────────── 单图特征 ─────────────────────────────
async function buildFeatures(buf) {
  const rgba = await decodeRGBA(buf);
  const gThumb = await decodeGray(buf, THUMB, THUMB);
  const g64 = await decodeGray(buf, HOG_S, HOG_S);
  // 全分辨率灰度（模板匹配用；长边封顶 160 控制复杂度）
  const long = Math.max(rgba.w, rgba.h);
  const k = Math.min(1, 160 / long);
  const gw = Math.max(1, Math.round(rgba.w * k));
  const gh = Math.max(1, Math.round(rgba.h * k));
  const grayFull = await decodeGray(buf, gw, gh);

  let sum = 0, sum2 = 0, minL = 1, maxL = 0;
  const nPix = rgba.w * rgba.h;
  for (let i = 0; i < nPix; i++) {
    const l = (0.299 * rgba.data[i * 4] + 0.587 * rgba.data[i * 4 + 1] + 0.114 * rgba.data[i * 4 + 2]) / 255;
    sum += l; sum2 += l * l;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }
  const mean = sum / nPix;
  const std = Math.sqrt(Math.max(0, sum2 / nPix - mean * mean));

  return {
    buf, w: rgba.w, h: rgba.h, rgba,
    hist: colorHistogram(rgba),
    gThumb, phash: pHashFromGray(gThumb), thumbN: normalizeZeroMean(gThumb),
    g64, hog: hogLite(g64, HOG_S, HOG_G, HOG_B),
    grayFull, gw, gh,
    lum: { mean, std, min: minL, max: maxL },
  };
}

// ───────────────────────────── 占位白图判定 ─────────────────────────────
function isBlankLike(f) {
  return f.lum.std < 0.02 || (f.lum.mean > 0.97 && f.lum.std < 0.06);
}

// ───────────────────────────── 目标图类型判定 ─────────────────────────────
/**
 * label（文字标签）：宽高比 ≥2.2、高 ≤48、白底、少量深色墨迹
 * crop （物体裁剪）：其余
 */
function classifyTarget(f) {
  const aspect = f.w / f.h;
  const g = f.gThumb;
  let ink = 0, bright = 0;
  for (let i = 0; i < g.length; i++) {
    if (g[i] < 0.55) ink++;
    if (g[i] > 0.88) bright++;
  }
  const n = g.length;
  const inkRatio = ink / n, brightRatio = bright / n;
  const textLike = aspect >= 2.2 && f.h <= 48 && brightRatio > 0.4 && inkRatio > 0.01 && inkRatio < 0.5;
  return { type: textLike ? 'label' : 'crop', aspect: +aspect.toFixed(3), inkRatio: +inkRatio.toFixed(3), brightRatio: +brightRatio.toFixed(3) };
}

/** 标签指纹：32×32 二值 + 行列墨迹投影量化 → 容忍重编码 */
function labelFingerprint(f) {
  const g = f.gThumb, n = THUMB;
  const bits = Buffer.alloc((n * n) / 8);
  for (let i = 0; i < n * n; i++) if (g[i] < 0.72) bits[i >> 3] |= 1 << (i % 8);
  const col = new Array(n).fill(0), row = new Array(n).fill(0);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (g[y * n + x] < 0.72) { col[x]++; row[y]++; }
  }
  const q = v => v.map(t => Math.min(3, Math.round((t / n) * 3)).toString(16)).join('');
  const sig = q(col) + '|' + q(row);
  const fp = 'L' + crypto.createHash('sha256').update(bits).update(sig).digest('hex').slice(0, 16);
  return { fp, sig, w: f.w, h: f.h, ink: f.lum };
}

// ───────────────────────────── 图-图相似度 ─────────────────────────────
function imageSim(a, b, w) {
  const ww = w || W_IMAGE;
  const hist = histIntersection(a.hist, b.hist);
  const phash = clamp01(1 - hamming(a.phash, b.phash) / 64);
  const struct = clamp01((corr(a.gThumb, b.gThumb) + 1) / 2);
  const hog = clamp01((corr(a.hog, b.hog) + 1) / 2);
  const score = clamp01(ww.hist * hist + ww.phash * phash + ww.struct * struct + ww.hog * hog);
  return { hist, phash, struct, hog, score };
}

// ───────────────────────────── oracle：bgImage 块投票 ─────────────────────────────
/**
 * bgImage 是正确答案图 + 大面积马赛克块。马赛克把块内细节抹平，但块均值仍保留原图配色。
 * → 取 8×8 块均值，逐块找最接近的候选，按「次小距离 - 最小距离」加权投票。
 * 实测：A 样本 50/64 票给候选 0，B 样本 26/64 票给候选 3，均与人眼判定一致。
 */
function blockMeans(rgba, G) {
  const { data, w, h } = rgba;
  const out = new Float32Array(G * G * 3);
  for (let by = 0; by < G; by++) {
    for (let bx = 0; bx < G; bx++) {
      const x0 = Math.floor((bx * w) / G), x1 = Math.floor(((bx + 1) * w) / G);
      const y0 = Math.floor((by * h) / G), y1 = Math.floor(((by + 1) * h) / G);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * 4;
          r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
        }
      }
      const k = (by * G + bx) * 3;
      out[k] = r / n / 255; out[k + 1] = g / n / 255; out[k + 2] = b / n / 255;
    }
  }
  return out;
}

function oracleVote(bgFeats, candFeats, G) {
  const gb = blockMeans(bgFeats.rgba, G);
  const cm = candFeats.map(f => f && !f.placeholder ? blockMeans(f.rgba, G) : null);
  const votes = new Float64Array(candFeats.length);
  const wins = new Array(candFeats.length).fill(0);
  let total = 0;
  for (let bi = 0; bi < G * G; bi++) {
    const k = bi * 3;
    let b1 = -1, d1 = 1e9, d2 = 1e9;
    for (let i = 0; i < cm.length; i++) {
      if (!cm[i]) continue;
      const dr = gb[k] - cm[i][k], dg = gb[k + 1] - cm[i][k + 1], db = gb[k + 2] - cm[i][k + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < d1) { d2 = d1; d1 = d; b1 = i; } else if (d < d2) d2 = d;
    }
    if (b1 < 0) continue;
    // 置信权重：与次优的差距越大，这一票越可信
    const wgt = clamp01((d2 - d1) / 0.02) + 0.05;
    votes[b1] += wgt;
    wins[b1]++;
    total += wgt;
  }
  const share = new Array(candFeats.length).fill(0);
  for (let i = 0; i < share.length; i++) share[i] = total > 0 ? votes[i] / total : 0;
  return { share, wins };
}

// ───────────────────────────── gallery（类目记忆库） ─────────────────────────────
const EMPTY_GALLERY = { version: 1, entries: {} };

const thumbToB64 = g => Buffer.from(Array.from(g, v => Math.round(clamp01(v) * 255))).toString('base64');
const b64ToThumb = b64 => {
  const buf = Buffer.from(b64, 'base64');
  const g = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) g[i] = buf[i] / 255;
  return g;
};

/** 特征 → 可持久化 gallery 条目 */
function featureToGalleryImage(f, extra) {
  return Object.assign({
    sha: crypto.createHash('sha256').update(f.buf).digest('hex').slice(0, 16),
    w: f.w, h: f.h,
    hist: Array.from(f.hist, x => +x.toFixed(4)),
    phash: Buffer.from(f.phash).toString('hex'),
    thumb: thumbToB64(f.gThumb),
    hog: Array.from(f.hog, x => +x.toFixed(4)),
  }, extra || {});
}

function galleryImageToFeature(gi) {
  const thumb = b64ToThumb(gi.thumb);
  return {
    w: gi.w, h: gi.h,
    hist: Float32Array.from(gi.hist),
    phash: Uint8Array.from(Buffer.from(gi.phash, 'hex')),
    gThumb: thumb, thumbN: normalizeZeroMean(thumb),
    hog: Float32Array.from(gi.hog),
  };
}

function scoreAgainstGallery(f, entry) {
  if (!entry || !entry.images || !entry.images.length) return null;
  let best = null;
  for (const gi of entry.images) {
    const sim = imageSim(f, galleryImageToFeature(gi), W_GALLERY);
    if (!best || sim.score > best.score) best = Object.assign({}, sim, { sha: gi.sha });
  }
  best.support = entry.images.length;
  return best;
}

// ───────────────────────────── 主入口 ─────────────────────────────
/**
 * @param {object}   input
 * @param {string}   input.image     题目图（dataURL）
 * @param {string[]} input.bgList    候选图（dataURL；URL 项视为占位，保留下标对齐）
 * @param {string}  [input.bgImage]  底图（dataURL）。传入即启用 oracle 通道
 * @param {object}  [options]
 * @param {'auto'|'crop'|'label'|'oracle'} [options.mode='auto']
 * @param {object}  [options.gallery]      label 记忆库 {entries:{fp:{label,images:[]}}}
 * @param {string}  [options.labelText]    已知标签文本（仅用于输出标注）
 * @param {number}  [options.nccScales]    自定义 NCC 尺度序列
 * @returns {Promise<{index:number, scores:number[], confidence:number, meta:object}>}
 */
async function recognize(input, options) {
  const o = Object.assign({ mode: 'auto', gallery: EMPTY_GALLERY }, options || {});
  const t0 = Date.now();
  const warnings = [];

  if (!input || !Array.isArray(input.bgList) || input.bgList.length === 0) {
    throw new Error('recognize: bgList 必须是非空数组');
  }

  // ── 候选解码
  const cands = [];
  for (let i = 0; i < input.bgList.length; i++) {
    const u = input.bgList[i];
    if (!isDataUrl(u)) {
      cands.push({ i, placeholder: true, reason: 'not-dataurl', feats: null, raw: String(u).slice(0, 64) });
      continue;
    }
    try {
      const feats = await buildFeatures(dataUrlToBuffer(u));
      if (isBlankLike(feats)) cands.push({ i, placeholder: true, reason: 'blank', feats });
      else cands.push({ i, placeholder: false, feats });
    } catch (e) {
      warnings.push(`bgList[${i}] 解码失败: ${e.message}`);
      cands.push({ i, placeholder: true, reason: 'decode-error', feats: null });
    }
  }

  // ── 题目图解码
  let targetFeats = null;
  let targetIsUrl = false;
  if (isDataUrl(input.image)) {
    targetFeats = await buildFeatures(dataUrlToBuffer(input.image));
  } else {
    targetIsUrl = true;
    warnings.push('image 不是 dataURL：离线模式无法 fetch，题目通道不可用');
  }
  const targetInfo = targetFeats ? classifyTarget(targetFeats) : { type: 'unknown' };

  // ── 选通道
  let mode = o.mode;
  if (mode === 'auto') {
    if (input && isDataUrl(input.bgImage)) mode = 'oracle';
    else mode = targetInfo.type === 'label' ? 'label' : 'crop';
  }

  const scores = new Array(input.bgList.length).fill(0);
  const detail = [];
  let extra = {};

  // ── ① oracle
  if (mode === 'oracle') {
    const bgFeats = await buildFeatures(dataUrlToBuffer(input.bgImage));
    const G = input.bgList.length > 6 ? 10 : BLOCK_G;
    const { share, wins } = oracleVote(bgFeats, cands.map(c => c.placeholder ? null : c.feats), G);
    cands.forEach(c => {
      if (c.placeholder) { detail.push({ i: c.i, placeholder: true, reason: c.reason, score: 0 }); return; }
      const sim = imageSim(c.feats, bgFeats);
      scores[c.i] = clamp01(share[c.i]);
      detail.push({ i: c.i, placeholder: false, score: +scores[c.i].toFixed(4), votes: wins[c.i], blockShare: +share[c.i].toFixed(4), imageSim: +sim.score.toFixed(4) });
    });
    extra = { channel: 'oracle', oracleGrid: G, note: 'bgImage 逐块归属投票（实测与正确答案一致 2/2）' };
  }

  // ── ② crop
  if (mode === 'crop') {
    const scales = o.nccScales || [0.35, 0.45, 0.55, 0.7, 0.85, 1.0, 1.2, 1.45, 1.75, 2.1];
    if (!targetFeats) {
      warnings.push('题目图不可用，crop 通道无法计算');
    } else {
      cands.forEach(c => {
        if (c.placeholder) { detail.push({ i: c.i, placeholder: true, reason: c.reason, score: 0 }); return; }
        const ncc = nccMax(c.feats.grayFull, c.feats.gw, c.feats.gh,
          targetFeats.grayFull, targetFeats.gw, targetFeats.gh, scales, { stride: 1 });
        const sim = imageSim(c.feats, targetFeats);
        const nccScore = clamp01(ncc.score);
        const score = clamp01(0.60 * nccScore + 0.20 * sim.hist + 0.20 * sim.hog);
        scores[c.i] = score;
        detail.push({
          i: c.i, placeholder: false, score: +score.toFixed(4),
          ncc: +nccScore.toFixed(4), nccRaw: +ncc.score.toFixed(4),
          at: [ncc.x, ncc.y], scale: ncc.scale, tpl: [ncc.tw, ncc.th],
          hist: +sim.hist.toFixed(4), hog: +sim.hog.toFixed(4),
        });
      });
      extra = { channel: 'crop', note: '多尺度 NCC(0.60) + 颜色直方图(0.20) + HOG(0.20)' };
    }
  }

  // ── ③ label
  let labelInfo = null, galleryHit = false, support = 0;
  if (mode === 'label') {
    if (!targetFeats) {
      warnings.push('题目图不可用，label 通道无法计算');
    } else {
      labelInfo = labelFingerprint(targetFeats);
      const entry = (o.gallery && o.gallery.entries) ? o.gallery.entries[labelInfo.fp] : null;
      if (entry && Array.isArray(entry.images) && entry.images.length) {
        galleryHit = true;
        support = entry.images.length;
        cands.forEach(c => {
          if (c.placeholder) { detail.push({ i: c.i, placeholder: true, reason: c.reason, score: 0 }); return; }
          const gs = scoreAgainstGallery(c.feats, entry);
          scores[c.i] = gs.score;
          detail.push({
            i: c.i, placeholder: false, score: +gs.score.toFixed(4),
            hist: +gs.hist.toFixed(4), phash: +gs.phash.toFixed(4),
            struct: +gs.struct.toFixed(4), hog: +gs.hog.toFixed(4), matchSha: gs.sha,
          });
        });
        extra = {
          channel: 'label-gallery',
          note: `标签指纹 ${labelInfo.fp} 命中记忆库（${support} 张历史答案图${entry.label ? '，类目「' + entry.label + '」' : ''}）`,
        };
      } else {
        warnings.push(`标签指纹 ${labelInfo.fp} 未命中记忆库：文字标签与照片不在同一特征空间，` +
          '纯 CV 无法判定；需 OCR+语义模型，或先积累该类目的答案图');
        cands.forEach(c => {
          if (c.placeholder) { detail.push({ i: c.i, placeholder: true, reason: c.reason, score: 0 }); return; }
          const sal = centerSaliency(c.feats);
          scores[c.i] = sal;
          detail.push({ i: c.i, placeholder: false, score: +sal.toFixed(4), saliency: +sal.toFixed(4), weak: true });
        });
        extra = { channel: 'label-weak', note: '记忆库未命中，仅输出中心显著度先验（不可信）', needsLabelSemantics: true };
      }
    }
  }

  // ── 排序 + 置信度
  const ranked = scores
    .map((s, i) => ({ i, s, placeholder: !!(cands[i] && cands[i].placeholder) }))
    .filter(x => !x.placeholder)
    .sort((a, b) => b.s - a.s);

  const index = (ranked.length && ranked[0].s > 0) ? ranked[0].i : -1;
  const top1 = ranked.length ? ranked[0].s : 0;
  const top2 = ranked.length > 1 ? ranked[1].s : 0;
  const margin = top1 - top2;
  const normMargin = clamp01(margin / 0.20);

  let confidence = clamp01(0.60 * top1 + 0.40 * normMargin);
  // 通道级校准：证据强度不同，置信度天花板不同
  if (extra.channel === 'oracle') {
    confidence = Math.min(confidence, 0.98);
    if (top1 < 0.25) confidence *= 0.7;                 // 票数太分散 → 打法不确定
  } else if (extra.channel === 'crop') {
    confidence = Math.min(confidence, 0.92);
  } else if (extra.channel === 'label-gallery') {
    // 记忆库是启发式：HOG 在 n=2 的留一检验里只赢 0.01~0.04 分，天花板压到 0.55，别让它冒充确定答案
    confidence *= Math.min(1, 0.5 + 0.12 * support);
    confidence = Math.min(confidence, 0.55);
  } else {
    confidence = Math.min(confidence, 0.15);            // 弱先验
  }

  return {
    index,
    scores,
    confidence: +confidence.toFixed(4),
    meta: {
      mode,
      channel: extra.channel || null,
      channelNote: extra.note || null,
      needsLabelSemantics: !!extra.needsLabelSemantics,
      targetType: targetInfo.type,
      target: targetFeats ? { w: targetFeats.w, h: targetFeats.h, ...targetInfo } : null,
      labelFp: labelInfo ? labelInfo.fp : null,
      labelText: o.labelText || null,
      targetIsUrl,
      ranked: ranked.map(r => ({ index: r.i, score: +r.s.toFixed(4) })),
      top1: +top1.toFixed(4), top2: +top2.toFixed(4), margin: +margin.toFixed(4),
      detail,
      warnings,
      elapsedMs: Date.now() - t0,
    },
  };
}

/** 中心显著度（弱先验，只让排序可解释，不作结论） */
function centerSaliency(f) {
  const g = f.gThumb, n = THUMB;
  let inner = 0, innerN = 0, outer = 0, outerN = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = g[y * n + x];
      const inC = x > n * 0.2 && x < n * 0.8 && y > n * 0.2 && y < n * 0.8;
      if (inC) { inner += v; innerN++; } else { outer += v; outerN++; }
    }
  }
  return clamp01(Math.abs(inner / innerN - outer / outerN) * 1.6);
}

module.exports = {
  recognize,
  // 供测试 / gallery 自举脚本复用
  _internal: {
    dataUrlToBuffer, isDataUrl, decodeRGBA, decodeGray, buildFeatures,
    colorHistogram, histIntersection, pHashFromGray, hamming, nccMax, hogLite,
    imageSim, corr, labelFingerprint, classifyTarget, isBlankLike, centerSaliency,
    featureToGalleryImage, galleryImageToFeature, scoreAgainstGallery,
    blockMeans, oracleVote, resizeGray, THUMB, HOG_S, HOG_G, HOG_B, BLOCK_G, W_IMAGE, W_GALLERY,
  },
};
