// 阿里云 FeiLin 滑块验证码 — 纯协议过滑块（无浏览器）
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { PNG } = require('pngjs');
const { KEYS, ar, sign, decryptDeviceConfig, encryptData } = require('./utils/crypto');

// ============ 常量 ============
const SCENE_ID = 'vollz84f';
const APP_KEY = 'ab034ec0643f91399eb33e062dc7fae1';
const INIT_URL = 'https://1sfr0c.captcha-open.aliyuncs.com/';
// DeviceData 是固定值（同一浏览器设备指纹不变，从真实抓包提取）
const DEVICE_DATA = 'byAgDBTTWK6iQ63aLnMRvywYbJ50c453wUz9CdNf4pWB+H4EOu7koqzwbASi1Zy3sWCm2jwwwiPUQHhhx5AUIUGuizY9NadaDGYiM90yjbrYiQI7cR2+MG6l9pYCb5KEfvJ/K6ek8QWgZCnss1zWnnLBU6k2E3HLDpLb78vCTTdCd+Jhfq1uJhANXNELJodm';

// ============ HTTP 请求 ============
function postForm(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const opts = {
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
        'Origin': 'https://tool.manmanbuy.com',
        'Referer': 'https://tool.manmanbuy.com/',
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ============ 1. InitCaptcha ============
function initCaptcha() {
  const params = {
    AaduaneId: KEYS.KEY_ID, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', Format: 'JSON',
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), Version: '2023-03-05',
    Action: 'InitCaptcha', SceneId: SCENE_ID, Language: 'cn', Mode: 'embed', DeviceData: DEVICE_DATA,
    SignatureNonce: crypto.randomUUID(),
  };
  params.Signature = sign(params, KEYS.KEY_SECRET);
  return postForm(INIT_URL, params).then(r => JSON.parse(r.body));
}

// ============ 2. 缺口识别（back.png 找缺口左边缘）============
function detectGap(backPngPath) {
  const png = PNG.sync.read(fs.readFileSync(backPngPath));
  const gray = (x, y) => {
    const i = (png.width * y + x) << 2;
    return (png.data[i] * 299 + png.data[i + 1] * 587 + png.data[i + 2] * 114) / 1000;
  };
  // 逐行找相邻像素灰度骤降列（亮→暗，即缺口左边缘），不依赖背景参考
  const edges = [];
  for (let y = 0; y < png.height; y++) {
    let prev = gray(0, y);
    for (let x = 1; x < png.width; x++) {
      const g = gray(x, y);
      if (prev - g > 25) { edges.push(x); break; }
      prev = g;
    }
  }
  // 聚类（相邻 ±3 合并），取行数最多的簇中心
  const clusters = [];
  edges.forEach(x => {
    const c = clusters.find(c => Math.abs(c.center - x) <= 3);
    if (c) { c.center = (c.center * c.count + x) / (c.count + 1); c.count++; }
    else clusters.push({ center: x, count: 1 });
  });
  if (!clusters.length) return 0;
  clusters.sort((a, b) => b.count - a.count);
  return Math.round(clusters[0].center);
}

// ============ 3. 轨迹生成（模拟拖动，距离 = gapX）============
function genTrajectory(gapX, startX = 632, startY = 759) {
  const startTime = Date.now();
  const points = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    // 模拟真实拖动：先快后慢，带微小抖动
    const eased = 1 - Math.pow(1 - progress, 2);
    const x = Math.round(startX + gapX * eased);
    const y = startY + (i % 3) - 1; // 微小 y 抖动
    const t = Math.round(progress * 300 + Math.random() * 15); // 时间偏移
    points.push({ x, y, t });
  }
  const json = JSON.stringify({
    mousemove: points, mouseclick: [], keyup: [], scrollTop: [], scrollLeft: [],
    pointerEvent: [], clientType: 'desktop', startTime, timestamp: String(startTime),
  });
  return json;
}

// ============ 主流程 ============
async function main() {
  console.log('[1] InitCaptcha ...');
  const init = await initCaptcha();
  console.log('    CertifyId:', init.CertifyId, 'CaptchaType:', init.CaptchaType);
  if (!init.Success) throw new Error('InitCaptcha failed: ' + init.Code);

  console.log('[2] 解密 DeviceConfig → 动态密钥');
  const field0 = decryptDeviceConfig(init.DeviceConfig);
  console.log('    动态密钥:', field0);

  // 下载图片（back.png / shadow.png）
  const imgBase = 'https://static-captcha.aliyuncs.com/';
  const backPath = './config/images/back.png';
  const backUrl = imgBase + init.Image;
  const backBuf = await new Promise((resolve, reject) => {
    https.get(backUrl, { headers: { Referer: 'https://tool.manmanbuy.com/' } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
  fs.writeFileSync(backPath, backBuf);

  console.log('[3] 缺口识别');
  const gapX = detectGap(backPath);
  console.log('    缺口距离:', gapX);

  console.log('[4] 轨迹生成 + data 加密');
  const traj = genTrajectory(gapX);
  const data = encryptData(traj, field0);
  console.log('    data 前缀:', data.slice(0, 12) + '...');

  // captchaVerifyParam（deviceToken 需要设备指纹，这里用占位）
  const captchaVerifyParam = JSON.stringify({
    sceneId: SCENE_ID, certifyId: init.CertifyId,
    deviceToken: '', // TODO: 设备指纹
    data,
  });
  console.log('[5] captchaVerifyParam 已生成（deviceToken 待设备指纹）');
  return { init, gapX, data, captchaVerifyParam };
}

if (require.main === module) {
  main().then(r => console.log('done, data length:', r.data.length)).catch(e => console.error('ERROR:', e.message));
}

module.exports = { initCaptcha, detectGap, genTrajectory, main };
