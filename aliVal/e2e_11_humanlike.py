#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
e2e_11_humanlike.py — 用 SendInput 复现"真人手工"那组动力学（460 点 / ~9ms / 先瞄后拖 / 三段式缓动 / 精修）

真人成功那一轮（config/manual_drag2_result.json，只读）：
  down=1 move=460 up=1，trustedDown=1 trustedMove=460（全 isTrusted）
  knob 258→0（松手回弹），piece 0→627，btoa 16 次（最后一串 len=3211 = data）
  xhr 200 → {"captchaVerifyResult":true,"bizResult":true}

本脚本复现的动力学参数：
  · mousemove 总数 ~440~480（按 40 点一块，块间闭环修正）
  · 每点间隔 8~14ms（真人 460 点 / ~4s）
  · LEFTDOWN 之后先静置 300~800ms 再动（真人先瞄缺口）
  · 块内 ease（慢-快-慢），纵向 ±1~2px 抖动
  · 松手前静置 200~300ms，目标误差 ≤1 CSS px
  · 闭环读数：页面桥 30ms 上报块偏移（127.0.0.1:PORT/piece），本进程内不切换前台

用法：
  python e2e_11_humanlike.py --x 155.8 --y 749.4 --inner-x 13 --inner-y 75 --dpr 1.25 --dry-run
  python e2e_11_humanlike.py ... --submit
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import json
import os
import random
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

user32 = ctypes.windll.user32
user32.SetProcessDPIAware()

MOVE, LEFTDOWN, LEFTUP, ABS = 0x0001, 0x0002, 0x0004, 0x8000
SW_RESTORE = 9
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'static', 'work', 'e2e')
PARAM_FILE = os.path.join(WORK, 'cvp_live.json')
TELE = os.path.join(WORK, 'humanlike_telemetry.json')
os.makedirs(WORK, exist_ok=True)

STATE = {'off': None, 'target': None, 'trusted': None, 'gap': None, 'ts': 0.0, 'param': None}


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n).decode('utf-8', 'replace')
        try:
            j = json.loads(body)
        except Exception:
            j = {}
        if self.path.startswith('/piece'):
            STATE.update(off=j.get('off'), target=j.get('target'), trusted=j.get('trusted'),
                         gap=j.get('gap'), ts=time.time())
        elif self.path.startswith('/param'):
            raw = j.get('cvp')
            STATE['param'] = raw
            try:
                obj = json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                obj = None
            with open(PARAM_FILE, 'w', encoding='utf-8') as f:
                json.dump({'received_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
                           'source': 'e2e_11_humanlike', 'cvp': obj}, f, ensure_ascii=False, indent=1)
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
            out.append({'hwnd': hwnd, 'a': (r.right - r.left) * (r.bottom - r.top)})
        return True

    user32.EnumWindows(cb, 0)
    out.sort(key=lambda w: w['a'], reverse=True)
    return out


def focus(hwnd):
    user32.ShowWindow(hwnd, SW_RESTORE)
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
    """块内 ease：慢-快-慢（smootherstep）"""
    t = min(1.0, max(0.0, t))
    return t * t * t * (t * (t * 6 - 15) + 10)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=18081)
    ap.add_argument('--x', type=float, required=True)
    ap.add_argument('--y', type=float, required=True)
    ap.add_argument('--inner-x', type=float, dest='inner_x', required=True)
    ap.add_argument('--inner-y', type=float, dest='inner_y', required=True)
    ap.add_argument('--dpr', type=float, default=1.25)
    ap.add_argument('--block', type=int, default=30, help='每块点数（真人 460 点 / 12 块 ≈ 38）')
    ap.add_argument('--max-blocks', type=int, dest='max_blocks', default=12)
    ap.add_argument('--dt-min', type=int, dest='dt_min', default=8)
    ap.add_argument('--dt-max', type=int, dest='dt_max', default=14)
    ap.add_argument('--pre-hold-min', type=int, dest='pre_hold_min', default=300)
    ap.add_argument('--pre-hold-max', type=int, dest='pre_hold_max', default=800)
    ap.add_argument('--post-hold', type=int, dest='post_hold', default=260)
    ap.add_argument('--tol', type=float, default=1.0)
    ap.add_argument('--fine-rounds', type=int, dest='fine_rounds', default=6)
    ap.add_argument('--fine-steps', type=int, dest='fine_steps', default=8)
    ap.add_argument('--fine-gain', type=float, dest='fine_gain', default=0.6)
    ap.add_argument('--gain', type=float, default=0.7, help='每块只推进剩余距离的 70%%，阻尼避免震荡')
    ap.add_argument('--min-moves', type=int, dest='min_moves', default=520, help='补抖动到至少这么多点（对齐真人 460）')
    ap.add_argument('--autosubmit', action='store_true', help='满足 mm>=--min-mm 且 误差<=--max-err 才自动提交')
    ap.add_argument('--min-mm', type=int, dest='min_mm', default=400)
    ap.add_argument('--max-err', type=float, dest='max_err', default=2.5)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--submit', action='store_true')
    a = ap.parse_args()

    srv = HTTPServer(('127.0.0.1', a.port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    t0 = time.time()
    while time.time() - t0 < 3 and read_off() is None:
        time.sleep(0.05)
    target = STATE['target']
    if target is None:
        print('ERR: 页面没上报 target（bridge 未注入？）', file=sys.stderr)
        return 2
    off0 = read_off(1.0)
    print('[hl] telemetry ok: gap=%s target=%.2f off=%s' % (STATE['gap'], target, off0))
    if off0 is None or abs(off0) > 5:
        print('ERR: 起始块偏移不是 0（off=%s）——页面不是新的一轮（多半是注入了另一个 tab，或没 reload）。'
              '先 reload + 重新注入 bridge 再跑。' % off0, file=sys.stderr)
        srv.shutdown()
        return 3

    wins = find_window()
    if not wins:
        print('ERR: 没找到浏览器窗口', file=sys.stderr)
        return 2
    hwnd = wins[0]['hwnd']

    move_to(a.inner_x + 12 * a.dpr, a.inner_y + 12 * a.dpr)
    time.sleep(0.2)
    ok = focus(hwnd)
    sx = a.inner_x + a.x * a.dpr
    sy = a.inner_y + a.y * a.dpr
    move_to(sx, sy)
    time.sleep(0.2)
    send_mouse(LEFTDOWN)

    pre = random.randint(a.pre_hold_min, a.pre_hold_max)
    print('[hl] focus=%s mousedown, 瞄准静置 %dms' % (ok, pre))
    time.sleep(pre / 1000.0)

    cur = 0.0           # 已命令的 client 位移
    moves = 0
    trace = []
    converged = False
    for blk in range(1, a.max_blocks + 1):
        off = read_off()
        if off is None:
            off = 0.0
        rem = target - off
        trace.append({'blk': blk, 'off': round(off, 2), 'rem': round(rem, 2), 'moves': moves})
        print('  blk%02d off=%.2f rem=%+.2f' % (blk, off, rem))
        if abs(rem) <= a.tol:
            converged = True
            break
        step_total = rem * a.gain
        for i in range(1, a.block + 1):
            # 块内按 ease 推进：块首块尾都慢，中间快
            frac = ease(i / a.block)
            x = cur + step_total * frac
            y_jit = random.choice([-2, -1, -1, 0, 0, 1, 1, 2])
            move_to(sx + x * a.dpr, sy + y_jit)
            moves += 1
            time.sleep(random.randint(a.dt_min, a.dt_max) / 1000.0)
        cur += step_total

    # 精修：误差仍 > tol 就用小步逼近
    for _ in range(a.fine_rounds):
        off = read_off()
        if off is None:
            break
        rem = target - off
        if abs(rem) <= a.tol:
            converged = True
            break
        print('  fine: off=%.2f rem=%+.2f' % (off, rem))
        for i in range(1, a.fine_steps + 1):
            x = cur + rem * a.fine_gain * ease(i / a.fine_steps)
            move_to(sx + x * a.dpr, sy + random.choice([-1, 0, 1]))
            moves += 1
            time.sleep(random.randint(a.dt_min, a.dt_max) / 1000.0)
        cur += rem * a.fine_gain
        time.sleep(0.06)

    # 手部微颤：在对齐点附近 ±1px 来回，既像真人又不改变落点，同时把点数补到真人量级（~460）
    off_now = read_off(1.0)
    base = (off_now if off_now is not None else target)
    if moves < a.min_moves:
        jit = [1, -1, 1, 0, -1, 1, -1, 0]
        k = 0
        while moves < a.min_moves:
            dy = random.choice([-1, 0, 1])
            dx = jit[k % len(jit)]
            move_to(sx + (cur + dx) * a.dpr, sy + dy)
            moves += 1
            k += 1
            time.sleep(random.randint(a.dt_min, a.dt_max + 6) / 1000.0)
        # 抖完回到对齐点
        for _ in range(3):
            move_to(sx + cur * a.dpr, sy)
            time.sleep(0.02)
        print('[hl] tremor done, moves=%d' % moves)

    time.sleep(a.post_hold / 1000.0)
    off_final = read_off(2.0)
    err_final = None if off_final is None else target - off_final
    print('[hl] settle off=%s err=%s | moves=%d | converged=%s' % (off_final, err_final, moves, converged))
    send_mouse(LEFTUP)
    print('[hl] mouseup')

    t0 = time.time()
    while time.time() - t0 < 4 and STATE['param'] is None:
        time.sleep(0.05)

    tele = {
        'gap': STATE['gap'], 'target': round(float(target), 2),
        'off_final': None if off_final is None else round(off_final, 2),
        'err_final': None if err_final is None else round(err_final, 2),
        'trusted_seen': STATE['trusted'], 'moves': moves, 'converged': converged,
        'pre_hold_ms': pre, 'block': a.block, 'dt': [a.dt_min, a.dt_max],
        'trace': trace, 'param_received': STATE['param'] is not None,
    }
    with open(TELE, 'w', encoding='utf-8') as f:
        json.dump(tele, f, ensure_ascii=False, indent=1)
    print('[hl] telemetry ->', TELE)

    if STATE['param']:
        r = subprocess.run(['node', os.path.join(HERE, 'e2e_11_stats.js')], capture_output=True, text=True, cwd=HERE)
        print(r.stdout.strip())
        stats = None
        for line in r.stdout.splitlines():
            if line.startswith('[stats] '):
                try:
                    stats = json.loads(line[len('[stats] '):])
                except Exception:
                    stats = None
        gate = bool(stats and stats.get('mmN', 0) >= a.min_mm
                    and abs(err_final if err_final is not None else 999) <= a.max_err
                    and stats.get('mmFlags') == ['1'] and stats.get('mpFlags') == ['1']
                    and stats.get('mc5') == '1' and stats.get('mu5') == '1')
        print('[hl] autosubmit gate: mm>=%d & err<=%.1f & flags==1 -> %s' % (a.min_mm, a.max_err, gate))
        if a.autosubmit and gate and not a.dry_run:
            r2 = subprocess.run(['node', os.path.join(HERE, 'e2e_07_post_live.js'), PARAM_FILE, 'P10-humanlike'],
                                capture_output=True, text=True, cwd=HERE)
            print(r2.stdout.strip())
        elif a.autosubmit and not gate:
            print('[hl] gate 不满足，不提交（不消耗配额）')

    if a.submit and not a.dry_run and STATE['param']:
        r = subprocess.run(['node', os.path.join(HERE, 'e2e_07_post_live.js'), PARAM_FILE, 'P10-humanlike'],
                           capture_output=True, text=True, cwd=HERE)
        print(r.stdout.strip())
    elif a.dry_run:
        print('[hl] --dry-run：未提交（页面 $.ajax 已 patch，未消耗配额）')

    srv.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
