"""camoufox RDP 断点调试 —— v2：走 watcher → frame target → thread 三层模型。

用法：
  python debugger_rdp2.py --self-test
  python debugger_rdp2.py --break-url dynamicJS.js --break-line 1
"""
import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

EXE = r"C:\Users\卢\AppData\Local\camoufox\camoufox\Cache\browsers\whitenightshadow\152.0.4-beta.30-reverse.5\camoufox.exe"
URL = "https://tool.manmanbuy.com/m/aliVal.aspx"


def log(*a):
    print(*a, flush=True)


class Rdp:
    def __init__(self, port, timeout=20):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=timeout)
        self.sock.settimeout(timeout)
        self.buf = b""
        self.prefix = None
        self.events = []

    def _packet(self):
        while True:
            i = self.buf.find(b":")
            if i > 0:
                try:
                    n = int(self.buf[:i])
                except ValueError:
                    i = -1
                else:
                    if len(self.buf) >= i + 1 + n:
                        p = self.buf[i + 1: i + 1 + n]
                        self.buf = self.buf[i + 1 + n:]
                        return json.loads(p.decode("utf-8", "replace"))
            c = self.sock.recv(65536)
            if not c:
                raise ConnectionError("closed")
            self.buf += c

    def recv(self, timeout=20):
        self.sock.settimeout(timeout)
        return self._packet()

    def send(self, obj):
        if self.prefix and "prefix" not in obj:
            obj = dict(obj, prefix=self.prefix)
        d = json.dumps(obj).encode()
        self.sock.sendall(str(len(d)).encode() + b":" + d)

    def call(self, obj, timeout=20, stop_types=()):
        self.send(obj)
        end = time.time() + timeout
        while time.time() < end:
            m = self.recv(max(1, end - time.time()))
            if m.get("from") == obj.get("to"):
                if m.get("type") in stop_types:
                    return m
                if m.get("type") in ("frameUpdate", "target-available", "target-destroyed"):
                    self.events.append(m)
                    continue
                return m
            self.events.append(m)
        return None

    def hello(self):
        m = self.recv(20)
        self.prefix = m.get("testConnectionPrefix")
        return m

    def find_actor(self, obj, pattern):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in ("actor", "threadActor") and isinstance(v, str) and pattern in v:
                    return v
            for v in obj.values():
                r = self.find_actor(v, pattern)
                if r:
                    return r
        elif isinstance(obj, list):
            for v in obj:
                r = self.find_actor(v, pattern)
                if r:
                    return r
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=6124)
    ap.add_argument("--attach", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--break-url", default=None)
    ap.add_argument("--break-line", type=int, default=None)
    ap.add_argument("--wait", type=int, default=8, help="页面加载等待秒数")
    a = ap.parse_args()

    proc = profile = None
    if not a.attach:
        profile = tempfile.mkdtemp(prefix="rdp2_")
        proc = subprocess.Popen([EXE, "-no-remote", "-profile", profile,
                                 "-start-debugger-server", str(a.port), URL],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    rdp = None
    try:
        for _ in range(45):
            time.sleep(1)
            try:
                rdp = Rdp(a.port); break
            except OSError:
                continue
        if not rdp:
            log("FAIL connect"); return 2
        h = rdp.hello()
        log("[1] hello:", h.get("applicationType"), "| prefix:", bool(h.get("testConnectionPrefix")))
        log("[2] waiting page load", a.wait, "s ...")
        time.sleep(a.wait)

        tabs = rdp.call({"to": "root", "type": "listTabs"})
        tl = (tabs or {}).get("tabs", [])
        log("[3] tabs:", [(t.get("actor"), str(t.get("url"))[:60]) for t in tl])
        tab = next((t for t in tl if "aliVal" in str(t.get("url"))), tl[0] if tl else None)
        if not tab:
            log("FAIL no tab"); return 3

        tgt = rdp.call({"to": tab["actor"], "type": "getTarget"}, timeout=25)
        target = rdp.find_actor(tgt, "") or (tgt or {}).get("target", {}).get("actor")
        log("[4] target:", target, "| keys:", list((tgt or {}).keys())[:8])
        if not target:
            log("FAIL no target"); return 4

        watch = rdp.call({"to": tab["actor"], "type": "getWatcher"}, timeout=25)
        watcher = (watch or {}).get("actor")
        log("[5] watcher:", watcher, "| resp:", json.dumps(watch)[:260])
        thread = None
        if not watcher:
            att = rdp.call({"to": target, "type": "attach"}, timeout=25)
            log("[5b] attach(target):", json.dumps(att)[:300])
            thread = (att or {}).get("threadActor")
        if not watcher and not thread:
            frame_actor = ((tgt or {}).get("frame") or {}).get("actor")
            log("[5c] frame actor:", frame_actor)
            if frame_actor and frame_actor != target:
                att2 = rdp.call({"to": frame_actor, "type": "attach"}, timeout=25)
                log("[5d] attach(frame):", json.dumps(att2)[:300])
                thread = (att2 or {}).get("threadActor")
        if not watcher and not thread:
            log("FAIL no watcher/thread")
            return 5

        frames = []
        if watcher:
            wt = rdp.call({"to": watcher, "type": "watchTargets", "targetType": "frame"},
                          timeout=25, stop_types=("target-available",))
            log("[6] watchTargets keys:", list((wt or {}).keys())[:8])
            frames = [e for e in rdp.events if e.get("type") == "target-available"]
            if not frames and wt:
                frames = [wt]
            for f in frames:
                thread = rdp.find_actor(f, "thread") or thread
            log("[7] target-available events:", len(frames), "| thread:", thread)
            if frames:
                log("[7x] first event:", json.dumps(frames[0])[:700])
                for f in frames:
                    cand = rdp.find_actor(f, "Target") or rdp.find_actor(f, "target")
                    if cand:
                        log("[7y] candidate target actor:", cand)
                        att3 = rdp.call({"to": cand, "type": "attach"}, timeout=25)
                        log("[7z] attach resp:", json.dumps(att3)[:300])
                        thread = (att3 or {}).get("threadActor") or thread
                        if thread:
                            break

        if not thread:
            # 兜底：直接对 frame target attach
            for f in frames:
                ta = rdp.find_actor(f, "frame") or rdp.find_actor(f, "Target")
                if ta:
                    att = rdp.call({"to": ta, "type": "attach"}, timeout=20)
                    thread = (att or {}).get("threadActor")
                    log("[7b] fallback attach:", ta, "->", thread)
                    if thread:
                        break

        if not thread:
            log("RESULT: 通道可用，但未拿到 threadActor（协议层级需再适配）")
            return 6

        src = rdp.call({"to": thread, "type": "sources"}, timeout=30)
        srcs = (src or {}).get("sources", [])
        log("[8] sources:", len(srcs))
        for s in srcs[:8]:
            log("    ", str(s.get("url"))[:95])

        if a.break_url and a.break_line:
            match = [s for s in srcs if a.break_url in str(s.get("url", ""))]
            log("[9] matched:", [(s.get("actor"), str(s.get("url"))[:50]) for s in match[:2]])
            if match:
                bp = rdp.call({"to": thread, "type": "setBreakpoint",
                               "location": {"actor": match[0].get("actor"), "line": a.break_line}},
                              timeout=25)
                log("[10] setBreakpoint:", json.dumps(bp)[:500])

        log("\nRESULT: OK — 能拿到 thread 与脚本清单（断点基础设施成立）")
        return 0
    finally:
        try:
            if rdp: rdp.sock.close()
        except Exception: pass
        if proc:
            try: proc.terminate(); proc.wait(timeout=8)
            except Exception:
                try: proc.kill()
                except Exception: pass
        if profile: shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
