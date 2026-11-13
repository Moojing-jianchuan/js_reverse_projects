// e2e_10_bridge.js —— 页面侧桥：把拼图块实时位置/目标位置上报到 127.0.0.1:PORT，并截获 captchaVerifyParam
// 用法（MCP evaluate_js，world=main，返回页内取到的几何）：把本文件内容作为表达式执行；PORT 由入参注入。
// 返回 { gap, target, knobCenterClient, mozInnerScreen, dpr }
(async () => {
  const PORT = 18081;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) {
    const im = document.querySelector('#aliyunCaptcha-img');
    if (im && im.complete && im.naturalWidth) break;
    await sleep(250);
  }
  await sleep(400);

  const img = document.querySelector('#aliyunCaptcha-img');
  const pc = document.querySelector('#aliyunCaptcha-puzzle');
  const knob = document.querySelector('#aliyunCaptcha-sliding-slider');
  if (!img || !pc || !knob) return { err: 'captcha dom not ready' };

  // --- 缺口检测（与 e2e_gap.js v3 同算法）---
  const cv = el => { const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight; const x = c.getContext('2d'); x.drawImage(el, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
  const back = cv(img), shad = cv(pc);
  const W = back.width, H = back.height, SW = shad.width, SH = shad.height;
  const gb = (x, y) => { const i = (W * y + x) << 2; return (back.data[i] * 299 + back.data[i + 1] * 587 + back.data[i + 2] * 114) / 1000; };
  const sa = (x, y) => shad.data[((SW * y + x) << 2) + 3];
  let px = SW, py = SH, mx = -1, my = -1;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (sa(x, y) > 128) { if (x < px) px = x; if (x > mx) mx = x; if (y < py) py = y; if (y > my) my = y; }
  const pw = mx - px + 1, ph = my - py + 1;
  const M = (dx, dy) => dx >= 0 && dy >= 0 && dx < pw && dy < ph && sa(px + dx, py + dy) > 128;
  const R = 4, core = [];
  for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) { let ok = true; for (let ky = -R; ky <= R && ok; ky++) for (let kx = -R; kx <= R; kx++) if (!M(dx + kx, dy + ky)) { ok = false; break; } if (ok) core.push([dx, dy]); }
  const cands = [];
  for (let y = Math.max(2, py - 6); y <= Math.min(H - ph - 2, py + 6); y++) for (let x = 2; x + pw + 2 <= W; x++) {
    let s = 0, s2 = 0;
    for (const [dx, dy] of core) { const v = gb(x + dx, y + dy); s += v; s2 += v * v; }
    const m = s / core.length, sd = Math.sqrt(Math.max(0, s2 / core.length - m * m));
    cands.push({ x, y, m, sd });
  }
  const best = cands.filter(c => c.m > 150).sort((p, q) => p.sd - q.sd)[0];
  if (!best) return { err: 'gap not found' };
  const gap = best.x;
  const target = +(gap * (img.getBoundingClientRect().width / img.naturalWidth)).toFixed(2);

  // --- 遥测：30ms 上报块偏移 ---
  window.__loop = { gap, target, trusted: null, samples: 0 };
  addEventListener('mousemove', e => { window.__loop.trusted = e.isTrusted; }, true);
  if (window.__loopTimer) clearInterval(window.__loopTimer);
  window.__loopTimer = setInterval(() => {
    const ir = img.getBoundingClientRect(), pr = pc.getBoundingClientRect();
    const body = JSON.stringify({ off: +(pr.left - ir.left).toFixed(2), target: window.__loop.target, trusted: window.__loop.trusted, gap: window.__loop.gap });
    window.__loop.samples++;
    try { fetch('http://127.0.0.1:' + PORT + '/piece', { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } }).catch(() => { }); } catch (e) { }
  }, 30);

  // --- 截获 captchaVerifyParam（不发给站点，回传给本地接收器）---
  window.jQuery.__ajaxLog = [];
  window.jQuery.ajax = function (o) {
    const p = o && o.data && o.data.captchaVerifyParam;
    if (p) {
      window.jQuery.__ajaxLog.push({ url: o.url, len: p.length });
      try { fetch('http://127.0.0.1:' + PORT + '/param', { method: 'POST', body: JSON.stringify({ cvp: p }), headers: { 'Content-Type': 'text/plain' } }).catch(() => { }); } catch (e) { }
    }
    return { done: () => ({ fail: () => { } }), fail: () => { }, always: () => { } };
  };
  window.alert = m => { (window.__alerts = window.__alerts || []).push(String(m)); };

  const ir = img.getBoundingClientRect(), kr = knob.getBoundingClientRect();
  return {
    gap, target, shadowBox: [px, py, pw, ph],
    imgRect: [ir.left, ir.top, ir.width, ir.height],
    knobCenterClient: [+(kr.left + kr.width / 2).toFixed(1), +(kr.top + kr.height / 2).toFixed(1)],
    mozInnerScreen: [window.mozInnerScreenX, window.mozInnerScreenY],
    dpr: devicePixelRatio,
  };
})()
