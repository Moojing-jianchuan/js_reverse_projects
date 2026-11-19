#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
e2e_08_trusted_drag.py — 用 Windows 原生 SendInput 产生 **trusted** 鼠标拖拽（不碰 Playwright）

为什么这样做：event.isTrusted=true 的本质是"事件来自系统输入队列"。ctypes 调 user32.SendInput
注入 MOUSEEVENTF_MOVE / LEFTDOWN / LEFTUP，浏览器会当作真实硬件事件，页面里 isTrusted === true。

坐标：SendInput 用**屏幕绝对坐标**（MOUSEEVENTF_ABSOLUTE + 0..65535 归一化）。
      页面侧给出 viewport 左上角的屏幕坐标（Firefox 专有 window.mozInnerScreenX/Y，单位是 CSS px）
      与 dpr，本脚本按 screen = inner + client*dpr 换算，所以参数一律传**client（viewport）坐标**。

子命令（便于在两次调用之间用 MCP 读页面状态做闭环修正）：
  python e2e_08_trusted_drag.py down   --x 443 --y 692 --inner-x 0 --inner-y 0 --dpr 1
  python e2e_08_trusted_drag.py move   --x 843 --y 692 ...
  python e2e_08_trusted_drag.py glide  --x 443 --y 692 --to-x 843 --to-y 694 --steps 40 --ms 16
  python e2e_08_trusted_drag.py up     --x 843 --y 692 ...
  python e2e_08_trusted_drag.py info                 # 只打印窗口/屏幕信息，不动鼠标
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import sys
import time

user32 = ctypes.windll.user32
user32.SetProcessDPIAware()

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_ABSOLUTE = 0x8000
SW_RESTORE = 9


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
    inp.type = 0  # INPUT_MOUSE
    inp.mi = MOUSEINPUT(dx, dy, 0, flags, 0, None)
    n = user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
    if n != 1:
        raise ctypes.WinError(ctypes.get_last_error())


def to_abs(px, py):
    """屏幕像素 → SendInput 归一化绝对坐标（虚拟屏幕）"""
    sw = user32.GetSystemMetrics(0)
    sh = user32.GetSystemMetrics(1)
    ax = int(round(px * 65535.0 / max(1, sw - 1)))
    ay = int(round(py * 65535.0 / max(1, sh - 1)))
    return ax, ay


def move_to(px, py):
    ax, ay = to_abs(px, py)
    send_mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, ax, ay)


def find_browser_window():
    """枚举顶层窗口，找 Mozilla/camoufox 窗口（类名含 Mozilla 或标题含 Firefox）"""
    found = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        buf = ctypes.create_unicode_buffer(512)
        user32.GetClassNameW(hwnd, buf, 512)
        cls = buf.value
        tbuf = ctypes.create_unicode_buffer(512)
        user32.GetWindowTextW(hwnd, tbuf, 512)
        title = tbuf.value
        if 'Mozilla' in cls or 'Firefox' in title or 'firefox' in title:
            r = wt.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            found.append({'hwnd': hwnd, 'cls': cls, 'title': title,
                          'rect': (r.left, r.top, r.right, r.bottom),
                          'w': r.right - r.left, 'h': r.bottom - r.top})
        return True

    user32.EnumWindows(cb, 0)
    # 取面积最大的那个（主窗口）
    found.sort(key=lambda w: w['w'] * w['h'], reverse=True)
    return found


def focus_window(hwnd):
    """把窗口提到前台。SetForegroundWindow 受前台锁限制，这里用 AttachThreadInput 绕过。"""
    user32.ShowWindow(hwnd, SW_RESTORE)
    fg = user32.GetForegroundWindow()
    cur_tid = ctypes.windll.kernel32.GetCurrentThreadId()
    fg_tid = user32.GetWindowThreadProcessId(fg, None) if fg else 0
    attached = False
    if fg_tid and fg_tid != cur_tid:
        attached = bool(user32.AttachThreadInput(fg_tid, cur_tid, True))
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    user32.SetFocus(hwnd)
    if attached:
        user32.AttachThreadInput(fg_tid, cur_tid, False)
    time.sleep(0.35)
    return user32.GetForegroundWindow() == hwnd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['info', 'focus', 'down', 'up', 'move', 'glide', 'startdrag', 'full'])
    ap.add_argument('--dist', type=float, default=0, help='full: 客户端像素位移（向右）')
    ap.add_argument('--no-focus', action='store_true', dest='no_focus',
                    help='拖动中途调用时必须加：不要再抢前台（会注入额外的 down/up，把这一轮弄脏）')
    ap.add_argument('--x', type=float, help='client X (viewport px)')
    ap.add_argument('--y', type=float, help='client Y (viewport px)')
    ap.add_argument('--to-x', type=float, dest='to_x')
    ap.add_argument('--to-y', type=float, dest='to_y')
    ap.add_argument('--inner-x', type=float, dest='inner_x', default=0.0)
    ap.add_argument('--inner-y', type=float, dest='inner_y', default=0.0)
    ap.add_argument('--dpr', type=float, default=1.0)
    ap.add_argument('--steps', type=int, default=40)
    ap.add_argument('--ms', type=int, default=16)
    ap.add_argument('--jitter', type=float, default=1.0)
    ap.add_argument('--hold', type=int, default=0, help='到达后保持不动多少 ms（等缓动跟上）')
    a = ap.parse_args()

    wins = find_browser_window()
    if not wins:
        print('ERR: 没找到浏览器窗口（需要非 headless 启动）', file=sys.stderr)
        return 2
    w = wins[0]

    if a.cmd == 'info':
        print('screen=%dx%d' % (user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)))
        for x in wins:
            print('win hwnd=%s cls=%s title=%r rect=%s size=%dx%d' % (x['hwnd'], x['cls'], x['title'][:40], x['rect'], x['w'], x['h']))
        print('foreground=%s' % user32.GetForegroundWindow())
        return 0

    if not a.no_focus:
        focus_window(w['hwnd'])

    if a.cmd == 'focus':
        r = wt.RECT()
        user32.GetWindowRect(w['hwnd'], ctypes.byref(r))
        print('ok focus hwnd=%s rect=(%d,%d,%d,%d) fg=%s' % (w['hwnd'], r.left, r.top, r.right, r.bottom, user32.GetForegroundWindow()))
        return 0

    sx = a.inner_x + a.x * a.dpr
    sy = a.inner_y + a.y * a.dpr
    if a.cmd == 'startdrag':
        # 先把光标停到页面空白处 → 抢前台（此时产生的 focus-click 落在空白，不会弄脏这一轮）
        move_to(a.inner_x + 12 * a.dpr, a.inner_y + 12 * a.dpr)
        time.sleep(0.2)
        ok = focus_window(w['hwnd'])
        time.sleep(0.35)
        move_to(sx, sy)
        time.sleep(0.15)
        send_mouse(MOUSEEVENTF_LEFTDOWN)
        print('ok startdrag focus=%s client(%.1f,%.1f) screen(%.1f,%.1f)' % (ok, a.x, a.y, sx, sy))
        return 0
    if a.cmd == 'full':
        # 单进程完成整个拖拽：park → focus（focus-click 落在空白）→ 回滑轨 → down → 分段移动 → 停 → up
        # 全部在一个进程里做完，避免中途 pwsh 抢前台导致 Firefox 合成 mouseup 把这一轮弄脏
        move_to(a.inner_x + 12 * a.dpr, a.inner_y + 12 * a.dpr)
        time.sleep(0.2)
        ok = focus_window(w['hwnd'])
        time.sleep(0.35)
        move_to(sx, sy)
        time.sleep(0.15)
        send_mouse(MOUSEEVENTF_LEFTDOWN)
        time.sleep(0.08)
        tx = sx + a.dist * a.dpr
        ty = sy
        t0 = time.time()
        for i in range(1, a.steps + 1):
            p = i / a.steps
            e = 1 - (1 - p) ** 1.6
            x = sx + (tx - sx) * e
            y = sy + ((i % 3) - 1) * a.jitter
            move_to(x, y)
            time.sleep(a.ms / 1000.0)
        move_to(tx, ty)
        if a.hold:
            time.sleep(a.hold / 1000.0)
        send_mouse(MOUSEEVENTF_LEFTUP)
        print('ok full focus=%s dist=%.1f steps=%d took=%.0fms hold=%dms'
              % (ok, a.dist, a.steps, (time.time() - t0) * 1000, a.hold))
        return 0
    if a.cmd in ('down', 'up', 'move'):
        move_to(sx, sy)
        time.sleep(0.05)
        if a.cmd == 'down':
            send_mouse(MOUSEEVENTF_LEFTDOWN)
        elif a.cmd == 'up':
            send_mouse(MOUSEEVENTF_LEFTUP)
        print('ok %s at screen(%.1f,%.1f) from client(%.1f,%.1f) inner(%.1f,%.1f) dpr=%s'
              % (a.cmd, sx, sy, a.x, a.y, a.inner_x, a.inner_y, a.dpr))
        return 0

    # glide：分段真实移动（先快后慢 + 纵向抖动）
    tx = a.inner_x + a.to_x * a.dpr
    ty = a.inner_y + a.to_y * a.dpr
    t0 = time.time()
    for i in range(1, a.steps + 1):
        # ease-out：位移按 1-(1-p)^1.6 推进，末尾变慢
        p = i / a.steps
        e = 1 - (1 - p) ** 1.6
        x = sx + (tx - sx) * e
        y = sy + (ty - sy) * e
        if a.jitter and 0 < i < a.steps:
            y += ((i % 3) - 1) * a.jitter
        move_to(x, y)
        time.sleep(a.ms / 1000.0)
    move_to(tx, ty)
    if a.hold:
        time.sleep(a.hold / 1000.0)
    print('ok glide client(%.1f,%.1f)->(%.1f,%.1f) screen(%.1f,%.1f)->(%.1f,%.1f) steps=%d ms=%d took=%.0fms'
          % (a.x, a.y, a.to_x, a.to_y, sx, sy, tx, ty, a.steps, a.ms, (time.time() - t0) * 1000))
    return 0


if __name__ == '__main__':
    sys.exit(main())
