"""e2e_14_simple.py —— 直接拖滑块（平滑版，无逐帧抖动）。

一个人会做的动作：
  1. 鼠标移到滑块（短、平滑）
  2. 按下，停 400~700ms
  3. 一条平滑的贝塞尔轨迹拖到缺口（y 只有一次 ±2px 的平缓漂移）
  4. 到位后最多修正 3 次（每次只前移差值，不来回），停 250ms 松手

不做的事（上一版做错的地方）：
  * 不给每一帧叠加随机抖动 —— 那会让指针高频乱跳，不是人的行为
  * 不做每帧的"滞后补偿" —— 那会形成正反馈震荡
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import http.server
import json
import math
import os
import random
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
sys.path.insert(0, r"D:\ds_work\js_reverse_projects\aliVal")

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
BRIDGE = r"D:\ds_work\js_reverse_projects\aliVal\e2e_10_bridge.js"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\simple_result.json"
PORT = 18081
SUBMIT_URL = "https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"

USERJS = """user_pref("network.proxy.type", 0);
user_pref("network.proxy.http", "");
user_pref("network.proxy.ssl", "");
user_pref("network.proxy.socks", "");
user_pref("network.proxy.no_proxies_on", "*");
"""

STORE = {"cvp": None, "piece": []}
STEPS = 540
DUR_MS = 4200.0

user32 = ctypes.windll.user32


class H(http.server.BaseHTTPRequestHandler):
    def _ok(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def do_OPTIONS(self):
        self._ok()

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n).decode("utf-8", "replace")
            if self.path.startswith("/param"):
                STORE["cvp"] = json.loads(body).get("cvp")
                print("[bridge] cvp len=%d" % len(STORE["cvp"] or ""), flush=True)
            elif self.path.startswith("/piece"):
                STORE["piece"].append(json.loads(body))
        except Exception as e:
            print("[bridge err]", str(e)[:80], flush=True)
        self._ok()

    def log_message(self, *a):
        pass


def ev(dbg, expr, timeout=45):
    return dbg.evaluate(expr, timeout)


def piece_css():
    p = STORE["piece"][-1] if STORE["piece"] else None
    return float(p.get("off") or 0) if p else None


def main():
    from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger
    import e2e_08_trusted_drag as D

    submit = "--submit" in sys.argv
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    profile = tempfile.mkdtemp(prefix="rdp_simple_")
    with open(os.path.join(profile, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)
    tempfile.mkdtemp = lambda *a, **k: profile

    dbg = FireFoxDebugger(port=6215)
    dbg.launch(URL, wait_page=10)
    try:
        for _ in range(12):
            try:
                dbg.enable("aliVal")
                break
            except Exception:
                time.sleep(2)
        for i in range(25):
            time.sleep(2)
            try:
                ok = ev(dbg, "!!(document.querySelector('#aliyunCaptcha-sliding-slider') && "
                             "document.querySelector('#aliyunCaptcha-img'))", 20).get("result")
            except Exception:
                ok = False
            if ok:
                print("[ready] %.0fs" % ((i + 1) * 2), flush=True)
                break

        with open(BRIDGE, encoding="utf-8") as f:
            ev(dbg, f.read(), 120)
        time.sleep(2.5)
        raw = ev(dbg, """(function(){
          var img=document.querySelector('#aliyunCaptcha-img'),
              knob=document.querySelector('#aliyunCaptcha-sliding-slider');
          if(!img||!knob) return JSON.stringify({err:'dom'});
          var ir=img.getBoundingClientRect(), kr=knob.getBoundingClientRect(), L=window.__loop||{};
          return JSON.stringify({gap:L.gap, target:L.target,
            imgRect:[ir.left,ir.top,ir.width,ir.height],
            knob:[kr.left+kr.width/2, kr.top+kr.height/2],
            dpr:devicePixelRatio});
        })()""", 30).get("result")
        geo = json.loads(raw) if isinstance(raw, str) else {}
        if not geo or geo.get("err") or not geo.get("target"):
            print("[bridge fail]", geo, flush=True)
            return

        dpr = float(geo["dpr"])
        wins = D.find_browser_window() or []
        if not wins:
            print("[fail] no window", flush=True)
            return
        hwnd = int(wins[0]["hwnd"])
        h = ctypes.c_void_p(hwnd)

        # 窗口置前
        fg = int(user32.GetForegroundWindow() or 0)
        tid_fg = user32.GetWindowThreadProcessId(ctypes.c_void_p(fg), None) if fg else 0
        tid_me = ctypes.windll.kernel32.GetCurrentThreadId()
        if tid_fg and tid_fg != tid_me:
            user32.AttachThreadInput(tid_me, tid_fg, True)
        user32.ShowWindow(h, 9)
        user32.SetForegroundWindow(h)
        user32.BringWindowToTop(h)
        if tid_fg and tid_fg != tid_me:
            user32.AttachThreadInput(tid_me, tid_fg, False)
        time.sleep(0.35)
        if int(user32.GetForegroundWindow() or 0) != hwnd:
            print("[fail] 窗口没置前", flush=True)
            return

        # 内容区左上角的屏幕坐标（ClientToScreen，最可靠）
        pt = wt.POINT(0, 0)
        user32.ClientToScreen(h, ctypes.byref(pt))
        origin_x, origin_y = pt.x, pt.y
        home_x = origin_x + geo["knob"][0] * dpr
        home_y = origin_y + geo["knob"][1] * dpr
        target_px = float(geo["target"]) * dpr
        print("[geo] gap=%s target=%.1f css | origin=(%d,%d) knob=(%.0f,%.0f) dpr=%.2f"
              % (geo["gap"], geo["target"], origin_x, origin_y, home_x, home_y, dpr), flush=True)

        # ---- 1) 从图片区域平滑移到滑块（不点击，纯移动，避免触发验证码的按下监听）----
        ir = geo["imgRect"]
        sx = origin_x + ir[0] * dpr
        sy = origin_y + (ir[1] + ir[3] * 0.5) * dpr
        for i in range(40):
            t = (i + 1) / 40.0
            e = t * t * (3 - 2 * t)
            D.move_to(int(round(sx + (home_x - sx) * e)), int(round(sy + (home_y - sy) * e)))
            time.sleep(0.015)
        D.move_to(int(round(home_x)), int(round(home_y)))
        time.sleep(0.08)
        sx, sy = home_x - 110 * dpr, home_y + 38 * dpr
        for i in range(16):
            t = (i + 1) / 16.0
            e = t * t * (3 - 2 * t)
            D.move_to(int(round(sx + (home_x - sx) * e)), int(round(sy + (home_y - sy) * e)))
            time.sleep(0.012)
        D.move_to(int(round(home_x)), int(round(home_y)))
        time.sleep(0.05)

        # ---- 2) 按下 + 瞄准 ----
        # 第一次交互可能只用于激活窗口（被吞掉），先点一次再正式按下
        D.send_mouse(D.MOUSEEVENTF_LEFTDOWN)
        time.sleep(0.05)
        D.send_mouse(D.MOUSEEVENTF_LEFTUP)
        time.sleep(0.3)

        D.send_mouse(D.MOUSEEVENTF_LEFTDOWN)
        hold = (random.uniform(420, 680)) / 1000.0
        print("[down] 停 %.0fms" % (hold * 1000), flush=True)
        time.sleep(hold)

        # 校验"按下真的抓住了滑块"：先移动 12px 看块是否跟随
        probe = 12.0
        D.move_to(int(round(home_x + probe)), int(round(home_y)))
        time.sleep(0.12)
        c0 = piece_css()
        print("[probe] 移动 %.0fpx 后块偏移 = %s CSS px" % (probe, c0), flush=True)
        if not c0 or abs(c0) < 1.0:
            print("[abort] 按下没有抓住滑块（块没跟随），把鼠标位置放回并松开", flush=True)
            D.send_mouse(D.MOUSEEVENTF_LEFTUP)
            return
        # 回退这 12px，继续正常拖拽
        D.move_to(int(round(home_x)), int(round(home_y)))
        time.sleep(0.08)

        # ---- 3) 平滑拖拽（无逐帧抖动，y 一次平缓漂移）----
        P1Y, P2Y = 0.18, 0.92

        def cubic_y(u):
            mt = 1.0 - u
            return 3 * mt * mt * u * P1Y + 3 * mt * u * u * P2Y + u * u * u

        t_prev = 0.0
        for i in range(STEPS + 1):
            u = i / STEPS
            x = target_px * cubic_y(u)
            y = 2.0 * math.sin(math.pi * u)          # 中途最多 2px，两端为 0
            t = u * DUR_MS
            D.move_to(int(round(home_x + x)), int(round(home_y + y)))
            time.sleep(max(0.001, (t - t_prev) / 1000.0))
            t_prev = t

        # ---- 4) 到位后最多修正 3 次（只前移差值，不回拉）----
        for _ in range(3):
            time.sleep(0.30)
            cur = piece_css()
            if cur is None:
                break
            err = float(geo["target"]) - cur
            print("   修正前误差 %.2f css" % err, flush=True)
            if abs(err) <= 1.2:
                break
            if err > 0:
                D.move_to(int(round(home_x + target_px + err * dpr)), int(round(home_y)))
        time.sleep(0.25)
        cur = piece_css()
        err_css = (float(geo["target"]) - cur) if cur is not None else None
        print("[drag] 最终误差 %s css" % ("%.2f" % err_css if err_css is not None else "n/a"), flush=True)

        # ---- 5) 松手 ----
        D.send_mouse(D.MOUSEEVENTF_LEFTUP)
        print("[up] 等 cvp…", flush=True)
        for _ in range(40):
            if STORE["cvp"]:
                break
            time.sleep(1)
        if not STORE["cvp"]:
            print("[fail] 没收到 cvp", flush=True)
            return

        rec = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "geo": geo, "err_css": err_css,
               "captchaVerifyParam": STORE["cvp"]}
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, indent=1)
        env = json.loads(STORE["cvp"])
        print("[saved]", OUT, "| cvp=%d data=%d" % (len(STORE["cvp"]), len(env.get("data") or "")), flush=True)

        if not submit:
            print("（未提交；加 --submit 才发）", flush=True)
            return
        body = urllib.parse.urlencode({"captchaVerifyParam": STORE["cvp"]}).encode()
        req = urllib.request.Request(SUBMIT_URL, data=body, method="POST", headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": UA, "Origin": "https://tool.manmanbuy.com",
            "Referer": "https://tool.manmanbuy.com/m/aliVal.aspx",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01",
        })
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode("utf-8", "replace")
            print("[submit] HTTP %s in %.2fs → %s" % (r.status, time.time() - t0, txt[:200]), flush=True)
    finally:
        dbg.close()
        srv.shutdown()


if __name__ == "__main__":
    main()
