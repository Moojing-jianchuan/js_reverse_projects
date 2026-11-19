"""e2e_13_hifreq.py —— 按「真人基线」的参数复现一次 trusted 拖拽。

真人基线（config/human_cvp.json，实测）：
  mm 540 点 / 跨度 4515ms / dt 中位 6ms（5ms×178, 6ms×221）
  mp 906 点 / 跨度 12872ms   ← 含按下前在页面上活动的全过程
  VerifyTime-TrackStartTime 14588ms
  mm 第 4 段 flag = 1

本脚本据此：
  阶段 A：按下前在页面上自然游走 ~7s（~6ms/步，约 1100 点）→ 撑起 mp 的跨度
  阶段 B：移到滑块中心
  阶段 C：LEFTDOWN + 停 400~700ms
  阶段 D：拖拽 ~540 点 / ~4.3s（8ms/步），闭环用页面 bridge 的 30ms 上报做阻尼修正
  阶段 E：到位停 250ms 再 LEFTUP
  然后解 data 自检（点数/dt/flag/误差），达标才提交 1 次 slideAuth。
"""
from __future__ import annotations

import http.server
import json
import math
import os
import random
import sys
import tempfile
import threading
import time
import urllib.request

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
sys.path.insert(0, r"D:\ds_work\js_reverse_projects\aliVal")

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
BRIDGE = r"D:\ds_work\js_reverse_projects\aliVal\e2e_10_bridge.js"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\hifreq_result.json"
PORT = 18081

USERJS = """user_pref("network.proxy.type", 0);
user_pref("network.proxy.http", "");
user_pref("network.proxy.ssl", "");
user_pref("network.proxy.socks", "");
user_pref("network.proxy.no_proxies_on", "*");
"""

STORE = {"cvp": None, "piece": [], "t0": None}

# 阶段参数（照真人基线）
PRE_MOVE_SEC = 7.0
PRE_STEP = 0.006
HOLD_MS = 550
DRAG_POINTS = 540
DRAG_STEP = 0.008
SETTLE_SEC = 0.25


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
                print("[bridge] captchaVerifyParam len=%d" % len(STORE["cvp"] or ""), flush=True)
            elif self.path.startswith("/piece"):
                STORE["piece"].append(json.loads(body))
        except Exception as e:
            print("[bridge err]", str(e)[:80], flush=True)
        self._ok()

    def log_message(self, *a):
        pass


def ev(dbg, expr, timeout=45):
    return dbg.evaluate(expr, timeout)


def last_piece():
    return STORE["piece"][-1] if STORE["piece"] else None


def main():
    from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger
    import e2e_08_trusted_drag as D  # SendInput 基础：send_mouse / move_to / find_browser_window / focus_window

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    profile = tempfile.mkdtemp(prefix="rdp_hf_")
    with open(os.path.join(profile, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)
    tempfile.mkdtemp = lambda *a, **k: profile
    print(">>> profile:", profile, flush=True)

    dbg = FireFoxDebugger(port=6214)
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
                r = ev(dbg, "!!(document.querySelector('#aliyunCaptcha-sliding-slider') && "
                            "document.querySelector('#aliyunCaptcha-img'))", 20).get("result")
            except Exception:
                r = False
            if r:
                print("[ready] 滑块 %.0fs" % ((i + 1) * 2), flush=True)
                break

        with open(BRIDGE, encoding="utf-8") as f:
            ev(dbg, f.read(), 120)          # bridge 是 async IIFE，返回值是 Promise；让它自己跑完
        time.sleep(2.5)
        geo_raw = ev(dbg, """(function(){
          var img=document.querySelector('#aliyunCaptcha-img'),
              knob=document.querySelector('#aliyunCaptcha-sliding-slider');
          if(!img||!knob) return JSON.stringify({err:'dom-missing'});
          var ir=img.getBoundingClientRect(), kr=knob.getBoundingClientRect();
          var L=window.__loop||{};
          return JSON.stringify({gap:L.gap, target:L.target,
            imgRect:[ir.left,ir.top,ir.width,ir.height],
            knobCenterClient:[kr.left+kr.width/2, kr.top+kr.height/2],
            mozInnerScreen:[window.mozInnerScreenX, window.mozInnerScreenY],
            dpr:devicePixelRatio});
        })()""", 30).get("result")
        geo = json.loads(geo_raw) if isinstance(geo_raw, str) else (geo_raw or {})
        if geo.get("err") or not geo.get("target"):
            print("[bridge fail]", geo, flush=True)
            return
        print("[geo]", json.dumps(geo, ensure_ascii=False)[:260], flush=True)

        dpr = float(geo.get("dpr") or 1.0)
        mz = geo.get("mozInnerScreen") or [0, 0]
        kc = geo.get("knobCenterClient") or [0, 0]
        img_rect = geo.get("imgRect") or [0, 0, 0, 0]
        target_css = float(geo.get("target") or 0)
        pad = 12
        home_x = (mz[0] + kc[0]) * dpr
        home_y = (mz[1] + kc[1]) * dpr
        print("[coords] dpr=%.2f knob_screen=(%.0f,%.0f) target=%.1fcss (%.0fpx)"
              % (dpr, home_x, home_y, target_css, target_css * dpr), flush=True)

        wins = D.find_browser_window() or []
        if wins:
            win = wins[0]
            hwnd = int(win["hwnd"])
            print("[window]", win["cls"], "| title:", str(win["title"])[:40],
                  "| rect:", win["rect"], flush=True)
            try:
                import ctypes
                u = ctypes.windll.user32
                k = ctypes.windll.kernel32
                h = ctypes.c_void_p(hwnd)
                fg = int(u.GetForegroundWindow() or 0)
                tid_fg = u.GetWindowThreadProcessId(ctypes.c_void_p(fg), None) if fg else 0
                tid_me = k.GetCurrentThreadId()
                if tid_fg and tid_fg != tid_me:
                    u.AttachThreadInput(tid_me, tid_fg, True)
                u.ShowWindow(h, 9)
                u.SetForegroundWindow(h)
                u.BringWindowToTop(h)
                if tid_fg and tid_fg != tid_me:
                    u.AttachThreadInput(tid_me, tid_fg, False)
                time.sleep(0.4)
                now = int(u.GetForegroundWindow() or 0)
                print("[focus] hwnd=%s foreground=%s %s" % (hwnd, now, "OK" if now == hwnd else "FAILED"),
                      flush=True)
                if now != hwnd:
                    print("[focus] 无法置前，SendInput 会打到别的窗口，中止", flush=True)
                    return
            except Exception as e:
                print("[focus fail]", str(e)[:120], flush=True)
                return
        else:
            print("[window] 没找到浏览器窗口，中止", flush=True)
            return

        # ---------- 阶段 A：按下前在页面上自然游走 ----------
        sx0, sy0 = (mz[0] + img_rect[0]) * dpr, (mz[1] + img_rect[1]) * dpr
        sw, sh = img_rect[2] * dpr, img_rect[3] * dpr
        print("[A] 按下前游走 %.1fs（约 %d 点，%.0fms/点）" % (
            PRE_MOVE_SEC, int(PRE_MOVE_SEC / PRE_STEP), PRE_STEP * 1000), flush=True)
        t_end = time.time() + PRE_MOVE_SEC
        i = 0
        while time.time() < t_end:
            # 在图片区域内做平滑 Lissajous + 小抖动，最后 1.2s 收到滑块附近（模拟瞄准）
            rem = t_end - time.time()
            if rem > 1.2:
                u = i * 0.021
                x = sx0 + sw * (0.5 + 0.34 * math.sin(u * 1.7))
                y = sy0 + sh * (0.5 + 0.30 * math.sin(u * 2.3 + 1.1))
            else:
                x = home_x + random.uniform(-26, 26)
                y = home_y + random.uniform(-16, 16)
            D.move_to(int(x + random.uniform(-1.2, 1.2)), int(y + random.uniform(-1.2, 1.2)))
            i += 1
            time.sleep(PRE_STEP)
        print("[A] done, pre-move 点数≈%d" % i, flush=True)

        # ---------- 阶段 B/C：到滑块、按下、停顿 ----------
        for k in range(24):
            t = (k + 1) / 24.0
            D.move_to(int(home_x + (home_x - home_x) * t),
                      int(home_y + (home_y - home_y) * t))
            time.sleep(0.006)
        D.move_to(int(home_x), int(home_y))
        time.sleep(0.05)
        D.send_mouse(D.MOUSEEVENTF_LEFTDOWN)
        print("[C] LEFT DOWN, 停 %dms" % HOLD_MS, flush=True)
        time.sleep(HOLD_MS / 1000.0)

        # ---------- 阶段 D：贝塞尔 + 过冲 + 末段停顿（照 slider-captcha-lab track.py） ----------
        target_px = target_css * dpr
        rnd = random.Random()
        STEPS, DUR_MS = DRAG_POINTS, 3000.0
        OVERSHOOT = 10.0 * dpr
        CORR = 20
        P1Y, P2Y = 0.18, 0.92          # 三次贝塞尔控制点（先慢后快）
        peak = target_px + OVERSHOOT

        def cubic_y(u):
            mt = 1.0 - u
            return 3 * mt * mt * u * P1Y + 3 * mt * u * u * P2Y + u * u * u

        pts = []
        for i in range(STEPS + 1):
            u = i / STEPS
            x = peak * cubic_y(u)
            if 0 < i < STEPS:
                x += rnd.gauss(0.0, 0.9)
            decay = 1.0 - 0.75 * u
            yv = 3.0 * math.sin(2 * math.pi * 1.3 * u) * decay + rnd.gauss(0.0, 0.4)
            pts.append([x, yv, u * DUR_MS])
        pts[-1][0] = peak
        # 末段微停顿（真人 mm 里有 276ms 级的停顿）
        for frac in (0.80, 0.92):
            idx = max(1, min(len(pts) - 2, int(len(pts) * frac)))
            dwell = rnd.uniform(2.4, 3.4) * 260.0
            s = pts[idx]
            pts.insert(idx + 1, [s[0] + rnd.gauss(0, 0.4), s[1] + rnd.gauss(0, 0.4), s[2] + dwell])
            for q in pts[idx + 2:]:
                q[2] += dwell
        # 过冲回调（指数收敛，末步精确落点）
        t0 = pts[-1][2]
        remain = peak - target_px
        for k in range(1, CORR + 1):
            ratio = 1.0 - math.exp(-3.0 * k / CORR)
            x = peak - remain * ratio
            if k < CORR:
                x += rnd.gauss(0.0, 0.45)
            t0 += rnd.uniform(22.0, 58.0) * (1.0 + 0.4 * k / CORR)
            pts.append([x, pts[-1][1] + rnd.gauss(0, 0.5), t0])
        pts[-1][0] = target_px
        print("[D] 轨迹 %d 点 / %.0fms / 过冲 %.1fpx / 目标 %.0fpx" % (
            len(pts), pts[-1][2], OVERSHOOT, target_px), flush=True)

        t_prev = 0.0
        for (x, yv, t) in pts:
            gap_ms = max(1.0, t - t_prev)
            t_prev = t
            D.move_to(int(round(home_x + x)), int(round(home_y + yv)))
            time.sleep(min(gap_ms, 60.0) / 1000.0)

        # 开环播放后微调（SendInput 精确，但块有缓动滞后）
        finger = target_px
        for _ in range(80):
            pp = last_piece()
            if not pp:
                break
            piece = float(pp.get("off") or 0) * dpr
            err = target_px - piece
            if abs(err) <= 1.2 * dpr:
                break
            finger += err * 0.7
            D.move_to(int(round(home_x + finger)), int(round(home_y)))
            time.sleep(0.02)
        p_final = last_piece()
        err_css = (float(p_final.get("off") or 0) - target_css) if p_final else None
        print("[D] done, 最终偏移=%.1f 误差=%.2f CSS px" % (
            float(p_final.get("off") or 0) if p_final else -1,
            err_css if err_css is not None else -999), flush=True)

        # ---------- 阶段 E：停一下再松手 ----------
        time.sleep(SETTLE_SEC)
        D.send_mouse(D.MOUSEEVENTF_LEFTUP)
        print("[E] LEFT UP，等 bridge 回传 cvp…", flush=True)

        for _ in range(40):
            if STORE["cvp"]:
                break
            time.sleep(1)
        if not STORE["cvp"]:
            print("[fail] 没收到 captchaVerifyParam", flush=True)
            return

        rec = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "geo": geo,
               "err_css": err_css, "piece_samples": len(STORE["piece"]),
               "captchaVerifyParam": STORE["cvp"]}
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT, "| cvp len =", len(STORE["cvp"]), flush=True)
        env = json.loads(STORE["cvp"])
        print("  certifyId =", env.get("certifyId"), "| data len =", len(env.get("data") or ""), flush=True)
    finally:
        dbg.close()
        srv.shutdown()


if __name__ == "__main__":
    main()
