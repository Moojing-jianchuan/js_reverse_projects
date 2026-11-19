#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
e2e_12_clean_profile.py — 全新 profile + 单进程（launch → 注入 → trusted 拖拽 → 页面原生 POST → 读 device 诊断）

关键点（父 agent 的怀疑点）：历史上的 e2e/rdp 脚本都用
    tempfile.mkdtemp = lambda: PROFILE          # 指向同一个 static/profile_noproxy
把 profile 钉死在一个目录，P8~P12 全在同一份 localStorage/IndexedDB/device-SDK 状态上累积。
本脚本 **不 monkeypatch mkdtemp**：FireFoxDebugger.launch() 自己会 mkdtemp(prefix="rdp_dbg_")，
所以每次都是干净 profile；跑完 dbg.close() 会杀进程并按 profile 清理。

同时把 device 链路（cloudauth / device.saf）的失败原因抓出来：
  · XHR 的 error / timeout / abort / readyState / statusText / 响应头
  · performance.getEntriesByType('resource') 的 transferSize / duration / responseStatus / nextHopProtocol

用法：
  python e2e_12_clean_profile.py --mode dry      # 只拖不提交（patch $.ajax 抓 param），看 device 链路是否 200
  python e2e_12_clean_profile.py --mode native   # 页面原生 POST（消耗 1 次 slideAuth）
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import json
import os
import random
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger  # noqa: E402

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'static', 'work', 'e2e')
os.makedirs(WORK, exist_ok=True)

user32 = ctypes.windll.user32
user32.SetProcessDPIAware()
MOVE, LEFTDOWN, LEFTUP, ABS = 0x0001, 0x0002, 0x0004, 0x8000

STATE = {'off': None, 'target': None, 'gap': None, 'trusted': None, 'ts': 0.0}


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n).decode('utf-8', 'replace')
        try:
            j = json.loads(body)
        except Exception:
            j = {}
        STATE.update(off=j.get('off'), target=j.get('target'), gap=j.get('gap'), trusted=j.get('trusted'), ts=time.time())
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, *a):
        pass


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wt.LONG), ("dy", wt.LONG), ("mouseData", wt.DWORD),
                ("dwFlags", wt.DWORD), ("time", wt.DWORD), ("dwExtraInfo", ctypes.POINTER(wt.ULONG))]


class INPUT(ctypes.Structure):
    class _I(ctypes.Union):
        _fields_ = [("mi", MOUSEINPUT), ("ki", ctypes.c_byte * 28), ("hi", ctypes.c_byte * 8)]
    _anonymous_ = ("i",)
    _fields_ = [("type", wt.DWORD), ("i", _I)]


def send_mouse(flags, dx=0, dy=0):
    inp = INPUT()
    inp.type = 0
    inp.mi = MOUSEINPUT(dx, dy, 0, flags, 0, None)
    if user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT)) != 1:
        raise ctypes.WinError(ctypes.get_last_error())


def move_to(px, py):
    sw, sh = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
    send_mouse(MOVE | ABS, int(round(px * 65535.0 / max(1, sw - 1))), int(round(py * 65535.0 / max(1, sh - 1))))


def find_window():
    out = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        b = ctypes.create_unicode_buffer(512)
        user32.GetClassNameW(hwnd, b, 512)
        if 'Mozilla' in b.value:
            r = wt.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            out.append(((r.right - r.left) * (r.bottom - r.top), hwnd))
        return True

    user32.EnumWindows(cb, 0)
    out.sort(reverse=True)
    return out


def focus(hwnd):
    user32.ShowWindow(hwnd, 9)
    fg = user32.GetForegroundWindow()
    cur = ctypes.windll.kernel32.GetCurrentThreadId()
    tid = user32.GetWindowThreadProcessId(fg, None) if fg else 0
    att = bool(user32.AttachThreadInput(tid, cur, True)) if tid and tid != cur else False
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    user32.SetFocus(hwnd)
    if att:
        user32.AttachThreadInput(tid, cur, False)
    time.sleep(0.35)
    return user32.GetForegroundWindow() == hwnd


def read_off(max_age=0.6):
    if STATE['off'] is None or time.time() - STATE['ts'] > max_age:
        return None
    return float(STATE['off'])


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * t * (t * (t * 6 - 15) + 10)


BRIDGE = r"""
(async () => {
  const PORT = %(port)d, PATCH = %(patch)s;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 60; i++) { const im = document.querySelector('#aliyunCaptcha-img'); if (im && im.complete && im.naturalWidth) break; await sleep(250); }
  await sleep(600);
  const img = document.querySelector('#aliyunCaptcha-img'), pc = document.querySelector('#aliyunCaptcha-puzzle'), knob = document.querySelector('#aliyunCaptcha-sliding-slider');
  if (!img || !pc || !knob) return { err: 'dom not ready' };
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
  const gap = best.x, target = +(gap * (img.getBoundingClientRect().width / img.naturalWidth)).toFixed(2);

  // 遥测
  window.__loop = { gap, target, trusted: null, samples: 0 };
  addEventListener('mousemove', e => { window.__loop.trusted = e.isTrusted; }, true);
  if (window.__loopTimer) clearInterval(window.__loopTimer);
  window.__loopTimer = setInterval(() => {
    const ir = img.getBoundingClientRect(), pr = pc.getBoundingClientRect();
    const body = JSON.stringify({ off: +(pr.left - ir.left).toFixed(2), target: window.__loop.target, trusted: window.__loop.trusted, gap: window.__loop.gap });
    try { fetch('http://127.0.0.1:' + PORT + '/piece', { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } }).catch(() => { }); } catch (e) { }
  }, 30);

  // ---- device 链路响应体全量抓取（XHR / fetch / sendBeacon 三条路径）----
  window.__dev = [];
  const DEVRX = /cloudauth-device|device\.saf|captcha-open\.aliyuncs\.com/;
  const _fetch = window.fetch;
  window.fetch = function () {
    const u = String(arguments[0] && (arguments[0].url || arguments[0]));
    const p = _fetch.apply(this, arguments);
    if (DEVRX.test(u)) {
      p.then(r => { try { r.clone().text().then(t => window.__dev.push({ via: 'fetch', u: u.slice(0, 70), status: r.status, body: String(t).slice(0, 800) })).catch(() => { }); } catch (e) { } }).catch(() => { });
    }
    return p;
  };
  if (navigator.sendBeacon) {
    const _sb = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) {
      if (DEVRX.test(String(u))) window.__dev.push({ via: 'beacon', u: String(u).slice(0, 70), size: (d && d.length) || 0 });
      return _sb(u, d);
    };
  }

  // ---- 网络诊断：XHR 全量记录（错误类型 / readyState / statusText / 响应头）----
  window.__net = [];
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = String(u); return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    const x = this;
    const rec = { u: String(x.__u || ''), m: String(x.__m || ''), err: null, status: null, readyState: null, statusText: null, hdrs: null, at: Date.now() };
    const done = () => {
      try {
        rec.status = x.status; rec.readyState = x.readyState; rec.statusText = x.statusText;
        rec.hdrs = (x.getAllResponseHeaders() || '').slice(0, 200);
        if (String(x.__u || '').indexOf('slideAuth') >= 0) rec.resp = String(x.responseText || '').slice(0, 200);
        if (typeof b === 'string' && b.indexOf('captchaVerifyParam') >= 0) window.__sentParam = b.length;
      } catch (e) { }
      window.__net.push(rec);
    };
    x.addEventListener('loadend', done);
    x.addEventListener('error', () => { rec.err = 'error'; });
    x.addEventListener('timeout', () => { rec.err = 'timeout'; });
    x.addEventListener('abort', () => { rec.err = 'abort'; });
    // device 域名：把完整响应体也留下（判据用）
    if (DEVRX.test(String(x.__u || ''))) {
      x.addEventListener('loadend', () => {
        try {
          window.__dev.push({ via: 'xhr', u: String(x.__u).slice(0, 70), m: String(x.__m || ''), status: x.status, statusText: x.statusText, readyState: x.readyState, body: String(x.responseText || '').slice(0, 800), hdrs: (x.getAllResponseHeaders() || '').slice(0, 300) });
        } catch (e) { }
      });
    }
    return XS.apply(this, arguments);
  };

  // 可选：抓 param 但不发给站点（dry-run 模式）
  if (PATCH && window.jQuery) {
    window.jQuery.__ajaxLog = [];
    window.jQuery.ajax = function (o) {
      const p = o && o.data && o.data.captchaVerifyParam;
      if (p) {
        window.jQuery.__ajaxLog.push({ len: p.length });
        try { fetch('http://127.0.0.1:' + PORT + '/param', { method: 'POST', body: JSON.stringify({ cvp: p }), headers: { 'Content-Type': 'text/plain' } }).catch(() => { }); } catch (e) { }
      }
      return { done: () => ({ fail: () => { } }), fail: () => { }, always: () => { } };
    };
  }
  window.alert = m => { (window.__alerts = window.__alerts || []).push(String(m)); };
  const kr = knob.getBoundingClientRect();
  window.__geo = { gap, target, sd: +best.sd.toFixed(2), knobCenterClient: [+(kr.left + kr.width / 2).toFixed(1), +(kr.top + kr.height / 2).toFixed(1)], dpr: devicePixelRatio, mozInnerScreen: [window.mozInnerScreenX, window.mozInnerScreenY] };
  return 'geo-set';
})()
"""

DIAG = r"""
JSON.stringify((() => {
  const dev = /cloudauth-device|device\.saf|aliyuncs\.com/;
  const perf = (performance.getEntriesByType('resource') || [])
    .filter(e => dev.test(e.name))
    .map(e => ({ name: e.name.slice(0, 70), dur: Math.round(e.duration), transfer: e.transferSize, enc: e.encodedBodySize, status: e.responseStatus, proto: e.nextHopProtocol, init: e.initiatorType }));
  return { net: (window.__net || []).slice(-12), dev: (window.__dev || []).slice(-20), perf, sentParamLen: window.__sentParam || 0, alerts: window.__alerts || [], trusted: window.__loop && window.__loop.trusted };
})())
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['dry', 'native'], default='dry')
    ap.add_argument('--port', type=int, default=18082)
    ap.add_argument('--block', type=int, default=430)
    ap.add_argument('--dt-min', type=int, dest='dt_min', default=8)
    ap.add_argument('--dt-max', type=int, dest='dt_max', default=11)
    ap.add_argument('--min-moves', type=int, dest='min_moves', default=460)
    ap.add_argument('--tol', type=float, default=1.2)
    ap.add_argument('--gain', type=float, default=0.98)
    ap.add_argument('--pre-hold', type=int, dest='pre_hold', default=500)
    ap.add_argument('--post-hold', type=int, dest='post_hold', default=260)
    a = ap.parse_args()

    srv = HTTPServer(('127.0.0.1', a.port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    # 端口
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    rdp_port = s.getsockname()[1]
    s.close()

    print('[clean] launching with FRESH profile (no mkdtemp monkeypatch), rdp port', rdp_port, flush=True)
    dbg = FireFoxDebugger(port=rdp_port)
    dbg.launch(URL, wait_page=14)
    print('[clean] profile =', getattr(dbg, 'profile', None), flush=True)
    dbg.enable()
    time.sleep(1.0)

    expr = BRIDGE % {'port': a.port, 'patch': 'true' if a.mode == 'dry' else 'false'}
    dbg.evaluate(expr, timeout=20)          # async IIFE：结果写在 window.__geo
    geo = None
    t0 = time.time()
    while time.time() - t0 < 35:
        rr = dbg.evaluate('JSON.stringify(window.__geo || null)', timeout=15)
        raw = rr.get('result') if isinstance(rr, dict) else None
        if isinstance(raw, str) and raw not in ('null', 'undefined', ''):
            try:
                geo = json.loads(raw)
            except Exception:
                geo = None
            if geo:
                break
        time.sleep(0.4)
    print('[clean] bridge ->', json.dumps(geo, ensure_ascii=False)[:300], flush=True)
    if not geo or 'target' not in geo:
        print('ERR: bridge 注入失败', flush=True)
        dbg.close()
        return 2

    t0 = time.time()
    while time.time() - t0 < 3 and read_off() is None:
        time.sleep(0.05)
    if read_off() is None or abs(read_off()) > 5:
        print('ERR: 遥测未就绪或块偏移不是 0 (off=%s)' % read_off(), flush=True)
        dbg.close()
        return 3

    wins = find_window()
    if not wins:
        print('ERR: 没找到浏览器窗口（非 headless？）', flush=True)
        dbg.close()
        return 2
    hwnd = wins[0][1]
    inner_x, inner_y = geo['mozInnerScreen']
    dpr = geo['dpr']
    kx, ky = geo['knobCenterClient']
    target = STATE['target']

    move_to(inner_x * dpr + 12 * dpr, inner_y * dpr + 12 * dpr)
    time.sleep(0.2)
    ok = focus(hwnd)
    sx = inner_x * dpr + kx * dpr
    sy = inner_y * dpr + ky * dpr
    move_to(sx, sy)
    time.sleep(0.2)
    send_mouse(LEFTDOWN)
    print('[clean] focus=%s mousedown client(%.1f,%.1f) 瞄准 %dms' % (ok, kx, ky, a.pre_hold), flush=True)
    time.sleep(a.pre_hold / 1000.0)

    moves, cur, trace = 0, 0.0, []
    # 单程 430 点（ease）+ 精修
    off = read_off() or 0.0
    rem = target - off
    trace.append({'phase': 'main', 'off': off, 'rem': rem})
    for i in range(1, a.block + 1):
        x = cur + rem * a.gain * ease(i / a.block)
        move_to(sx + x * dpr, sy + random.choice([-2, -1, -1, 0, 0, 1, 1, 2]))
        moves += 1
        time.sleep(random.randint(a.dt_min, a.dt_max) / 1000.0)
    cur += rem * a.gain

    for _ in range(8):
        off = read_off()
        if off is None:
            break
        rem = target - off
        trace.append({'phase': 'fine', 'off': round(off, 2), 'rem': round(rem, 2)})
        if abs(rem) <= a.tol:
            break
        for i in range(1, 8):
            x = cur + rem * 0.5 * ease(i / 7)
            move_to(sx + x * dpr, sy + random.choice([-1, 0, 1]))
            moves += 1
            time.sleep(random.randint(a.dt_min, a.dt_max) / 1000.0)
        cur += rem * 0.5
        time.sleep(0.06)

    while moves < a.min_moves:
        move_to(sx + (cur + random.choice([-1, 1])) * dpr, sy + random.choice([-1, 0, 1]))
        moves += 1
        time.sleep(random.randint(a.dt_min, a.dt_max + 4) / 1000.0)
    for _ in range(3):
        move_to(sx + cur * dpr, sy)
        time.sleep(0.02)

    time.sleep(a.post_hold / 1000.0)
    off_final = read_off(2.0)
    err = None if off_final is None else target - off_final
    print('[clean] moves=%d off_final=%s err=%s' % (moves, off_final, err), flush=True)
    send_mouse(LEFTUP)
    time.sleep(2.5)

    r2 = dbg.evaluate(DIAG, timeout=40)
    raw2 = r2.get('result') if isinstance(r2, dict) else None
    try:
        diag = json.loads(raw2) if isinstance(raw2, str) else raw2
    except Exception:
        diag = {'raw': str(raw2)[:400]}
    out = {'mode': a.mode, 'profile': getattr(dbg, 'profile', None), 'gap': STATE['gap'],
           'target': target, 'off_final': off_final, 'err': err, 'moves': moves,
           'trace': trace[-6:], 'diag': diag}
    with open(os.path.join(WORK, 'clean_profile_%s.json' % a.mode), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('[clean] DIAG', json.dumps(diag, ensure_ascii=False)[:1500], flush=True)

    dbg.close()
    srv.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
