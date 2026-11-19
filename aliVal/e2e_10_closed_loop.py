#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
e2e_10_closed_loop.py — 单进程闭环 trusted 拖拽（Windows SendInput + 页面回环遥测）

为什么这样闭环：拖动中途不能重启 pwsh（会抢前台，Firefox 失活会合成 mouseup 把这一轮作废）。
所以把"读块位置"改成**页面主动上报**：页面里一个 30ms 的 setInterval 把
`#aliyunCaptcha-puzzle` 相对 `#aliyunCaptcha-img` 的 left 偏移 + 目标偏移 POST 到
http://127.0.0.1:PORT/piece ；本进程用一个 HTTP 线程收下，拖拽循环直接用最新值做阻尼修正。
整个拖拽只在本进程内，无 RDP、无 pwsh 重启、无前台切换。

页面侧注入（e2e_10_bridge.js，由 MCP 在浏览器里执行一次即可）会：
  · 用 canvas 算缺口 gap → 目标块偏移 target = gap * 750/296
  · 上报 {off, target, trusted, gap}
  · patch $.ajax，把 captchaVerifyParam POST 到 /param（本脚本落盘，不自动提交）

用法：
  python e2e_10_closed_loop.py --x 627.8 --y 687 --inner-x 13 --inner-y 75 --dpr 1.25 --dry-run
  python e2e_10_closed_loop.py ... --submit            # 松手后调用 node e2e_07_post_live.js 提交一次
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

user32 = ctypes.windll.user32
user32.SetProcessDPIAware()

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_ABSOLUTE = 0x8000
SW_RESTORE = 9

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'static', 'work', 'e2e')
PARAM_FILE = os.path.join(WORK, 'cvp_live.json')
TELEMETRY = os.path.join(WORK, 'closed_loop_telemetry.json')
os.makedirs(WORK, exist_ok=True)

STATE = {'off': None, 'target': None, 'trusted': None, 'gap': None, 'ts': 0.0,
         'param': None, 'param_ts': 0.0}


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n).decode('utf-8', 'replace')
        try:
            j = json.loads(body)
        except Exception:
            j = {}
        if self.path.startswith('/piece'):
            STATE['off'] = j.get('off')
            STATE['target'] = j.get('target')
            STATE['trusted'] = j.get('trusted')
            STATE['gap'] = j.get('gap')
            STATE['ts'] = time.time()
        elif self.path.startswith('/param'):
            raw = j.get('cvp')
            STATE['param'] = raw
            STATE['param_ts'] = time.time()
            try:
                obj = json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                obj = None
            with open(PARAM_FILE, 'w', encoding='utf-8') as f:
                json.dump({'received_at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'source': 'e2e_10_closed_loop', 'cvp': obj}, f, ensure_ascii=False, indent=1)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'text/plain')
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
    sw = user32.GetSystemMetrics(0)
    sh = user32.GetSystemMetrics(1)
    ax = int(round(px * 65535.0 / max(1, sw - 1)))
    ay = int(round(py * 65535.0 / max(1, sh - 1)))
    send_mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, ax, ay)


def find_browser_window():
    found = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        b = ctypes.create_unicode_buffer(512)
        user32.GetClassNameW(hwnd, b, 512)
        if 'Mozilla' in b.value:
            r = wt.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            found.append({'hwnd': hwnd, 'w': r.right - r.left, 'h': r.bottom - r.top, 'rect': (r.left, r.top, r.right, r.bottom)})
        return True

    user32.EnumWindows(cb, 0)
    found.sort(key=lambda w: w['w'] * w['h'], reverse=True)
    return found


def focus_window(hwnd):
    user32.ShowWindow(hwnd, SW_RESTORE)
    fg = user32.GetForegroundWindow()
    cur = ctypes.windll.kernel32.GetCurrentThreadId()
    fg_tid = user32.GetWindowThreadProcessId(fg, None) if fg else 0
    att = False
    if fg_tid and fg_tid != cur:
        att = bool(user32.AttachThreadInput(fg_tid, cur, True))
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    user32.SetFocus(hwnd)
    if att:
        user32.AttachThreadInput(fg_tid, cur, False)
    time.sleep(0.35)
    return user32.GetForegroundWindow() == hwnd


def read_off(max_age=0.5):
    """取页面最近一次上报的块偏移；太旧就当无效"""
    if STATE['off'] is None or time.time() - STATE['ts'] > max_age:
        return None
    return float(STATE['off'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=18081)
    ap.add_argument('--x', type=float, required=True, help='滑轨中心 client X')
    ap.add_argument('--y', type=float, required=True, help='滑轨中心 client Y')
    ap.add_argument('--inner-x', type=float, dest='inner_x', required=True)
    ap.add_argument('--inner-y', type=float, dest='inner_y', required=True)
    ap.add_argument('--dpr', type=float, default=1.25)
    ap.add_argument('--tol', type=float, default=2.0, help='对齐容差（CSS px）')
    ap.add_argument('--max-iter', type=int, default=12)
    ap.add_argument('--damp', type=float, default=0.7)
    ap.add_argument('--substeps', type=int, default=3, help='每次修正拆成几个小步（提高轨迹密度，逼近真人 174 点）')
    ap.add_argument('--hold-ms', type=int, default=260)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--submit', action='store_true')
    ap.add_argument('--submit-after-ms', type=int, default=1500)
    a = ap.parse_args()

    # 1) 回环接收（页面 30ms 上报一次）
    srv = HTTPServer(('127.0.0.1', a.port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print('[loop] receiver on 127.0.0.1:%d' % a.port)

    # 2) 等页面开始上报（最多 3s）
    t0 = time.time()
    while time.time() - t0 < 3 and read_off() is None:
        time.sleep(0.05)
    off0 = read_off()
    target = STATE['target']
    print('[loop] telemetry ready: off=%s target=%s gap=%s trusted=%s' % (off0, target, STATE['gap'], STATE['trusted']))
    if target is None:
        print('ERR: 页面没上报 target（bridge 没注入？）', file=sys.stderr)
        return 2

    wins = find_browser_window()
    if not wins:
        print('ERR: 没找到浏览器窗口（需非 headless）', file=sys.stderr)
        return 2
    hwnd = wins[0]['hwnd']

    # 3) 抢前台（focus-click 落在页面空白处）
    move_to(a.inner_x + 12 * a.dpr, a.inner_y + 12 * a.dpr)
    time.sleep(0.2)
    ok = focus_window(hwnd)
    print('[loop] focus=%s hwnd=%s' % (ok, hwnd))

    sx = a.inner_x + a.x * a.dpr
    sy = a.inner_y + a.y * a.dpr
    move_to(sx, sy)
    time.sleep(0.18)
    send_mouse(MOUSEEVENTF_LEFTDOWN)
    print('[loop] mousedown @client(%.1f,%.1f) screen(%.1f,%.1f)' % (a.x, a.y, sx, sy))

    # 4) 闭环：每步按阻尼推 remaining，读页面回报修正
    trace = []
    cur = 0.0            # 已命令的 client 位移
    for it in range(1, a.max_iter + 1):
        time.sleep(0.06)
        off = read_off()
        if off is None:
            trace.append({'it': it, 'off': None, 'note': 'no telemetry'})
            continue
        err = target - off
        trace.append({'it': it, 'off': round(off, 1), 'target': round(target, 1), 'err': round(err, 1), 'commanded': round(cur, 1)})
        print('  it%02d off=%.1f err=%+.1f' % (it, off, err))
        if abs(err) <= a.tol:
            break
        step = err * a.damp
        cur += step
        move_to(sx + cur * a.dpr, sy)
        # 拆成若干小步（密度逼近真人轨迹），末了精确落点
        for k in range(1, max(1, a.substeps)):
            move_to(sx + (cur - step + step * k / max(1, a.substeps)) * a.dpr, sy + ((k % 2) * 2 - 1))
            time.sleep(0.010)
        move_to(sx + cur * a.dpr, sy)

    # 5) 停一下等缓动收敛，再确认
    time.sleep(a.hold_ms / 1000.0)
    off_final = read_off(2.0)
    err_final = None if off_final is None else target - off_final
    print('[loop] settle: off=%s err=%s' % (off_final, err_final))

    send_mouse(MOUSEEVENTF_LEFTUP)
    print('[loop] mouseup')

    # 6) 等页面交出 captchaVerifyParam
    t0 = time.time()
    while time.time() - t0 < max(3.0, a.submit_after_ms / 1000.0) and STATE['param'] is None:
        time.sleep(0.05)
    cvp = None
    if STATE['param']:
        try:
            cvp = json.loads(STATE['param'])
        except Exception:
            cvp = {'raw': STATE['param'][:80]}

    tele = {
        'gap': STATE['gap'], 'target': round(float(target), 1),
        'off_final': None if off_final is None else round(off_final, 1),
        'err_final': None if err_final is None else round(err_final, 1),
        'trusted_seen': STATE['trusted'],
        'iterations': len([t for t in trace if t.get('off') is not None]),
        'trace': trace,
        'submit': bool(a.submit) and not a.dry_run,
        'cvp': {'certifyId': cvp.get('certifyId'), 'dataLen': len(cvp.get('data') or '')} if isinstance(cvp, dict) else None,
    }
    with open(TELEMETRY, 'w', encoding='utf-8') as f:
        json.dump(tele, f, ensure_ascii=False, indent=1)
    print('[loop] telemetry ->', TELEMETRY)
    print(json.dumps({k: tele[k] for k in ('gap', 'target', 'off_final', 'err_final', 'trusted_seen', 'iterations', 'cvp')}, ensure_ascii=False))

    if a.submit and not a.dry_run and STATE['param']:
        print('[loop] submitting via node e2e_07_post_live.js ...')
        r = subprocess.run(['node', os.path.join(HERE, 'e2e_07_post_live.js'), PARAM_FILE, 'P8-closed-loop'],
                           capture_output=True, text=True, cwd=HERE)
        print(r.stdout.strip())
        if r.stderr.strip():
            print('[stderr]', r.stderr.strip()[:400])
    elif a.dry_run:
        print('[loop] --dry-run：未提交（ajax 已被页面 patch 拦截，未消耗配额）')

    srv.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
