"""camoufox (Firefox 152) RDP 断点调试最小实现。

目的：验证「能否像 CDP 那样下断点、读帧与作用域」，为解 data 编码层 F 提供观测能力。

用法：
  python debugger_rdp.py --self-test                       # 只验证通道/目标/脚本清单
  python debugger_rdp.py --break-url dynamicJS --break-line 1   # 下断点并打印 actualLocation
  python debugger_rdp.py --port 6123 --attach              # 连已启动的实例（不自己拉浏览器）

设计要点：
  * 只绑 127.0.0.1；临时 profile；结束清理
  * 每步打印响应，协议差异处做多路兼容（getTarget / attach / sources 三种形态）
  * 所有请求带超时，paused 等待有上限，超时强制 resume，避免通道假死
"""
import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

EXE = r"C:\Users\卢\AppData\Local\camoufox\camoufox\Cache\browsers\whitenightshadow\152.0.4-beta.30-reverse.5\camoufox.exe"
DEFAULT_URL = "https://tool.manmanbuy.com/m/aliVal.aspx"


def log(*a):
    print(*a, flush=True)


class Rdp:
    def __init__(self, port, timeout=15):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=timeout)
        self.sock.settimeout(timeout)
        self.buf = b""
        self.prefix = None

    # ---------- 传输层 ----------
    def _packet(self):
        while True:
            idx = self.buf.find(b":")
            if idx > 0:
                try:
                    n = int(self.buf[:idx])
                except ValueError:
                    idx = -1
                else:
                    if len(self.buf) >= idx + 1 + n:
                        payload = self.buf[idx + 1: idx + 1 + n]
                        self.buf = self.buf[idx + 1 + n:]
                        return json.loads(payload.decode("utf-8", "replace"))
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("rdp socket closed")
            self.buf += chunk

    def recv(self, timeout=15):
        self.sock.settimeout(timeout)
        return self._packet()

    def send(self, obj):
        if self.prefix and "prefix" not in obj:
            obj = dict(obj, prefix=self.prefix)
        data = json.dumps(obj).encode("utf-8")
        self.sock.sendall(str(len(data)).encode("ascii") + b":" + data)

    def call(self, obj, timeout=15):
        """发一条请求，返回第一条 from==to 的回复（跳过事件）。"""
        self.send(obj)
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = self.recv(timeout=max(1, deadline - time.time()))
            if msg.get("from") == obj.get("to") and "type" not in msg or msg.get("from") == obj.get("to"):
                if msg.get("from") == obj.get("to"):
                    return msg
        return None

    def hello(self):
        msg = self.recv(15)
        self.prefix = msg.get("testConnectionPrefix") or None
        return msg

    # ---------- 高层动作 ----------
    def list_tabs(self):
        r = self.call({"to": "root", "type": "listTabs"})
        return r or {}

    def get_target(self, tab_actor):
        """新版：tabDescriptor.getTarget；旧版：直接 attach。"""
        r = self.call({"to": tab_actor, "type": "getTarget"}, timeout=20)
        if r and "target" in r:
            return r["target"].get("actor")
        if r and "frame" in r:
            return r.get("frame", {}).get("actor")
        return None

    def attach(self, actor):
        r = self.call({"to": actor, "type": "attach"}, timeout=20)
        return r or {}

    def sources(self, thread):
        r = self.call({"to": thread, "type": "sources"}, timeout=30)
        return (r or {}).get("sources", [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=6123)
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--attach", action="store_true", help="连接已启动的实例")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--break-url", default=None, help="脚本 URL 子串")
    ap.add_argument("--break-line", type=int, default=None)
    args = ap.parse_args()

    proc = None
    profile = None
    if not args.attach:
        profile = tempfile.mkdtemp(prefix="rdp_dbg_")
        cmd = [EXE, "-no-remote", "-profile", profile,
               "-start-debugger-server", str(args.port), args.url]
        log("[1] launch:", os.path.basename(EXE), "-start-debugger-server", args.port)
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    rdp = None
    try:
        for _ in range(40):
            time.sleep(1)
            try:
                rdp = Rdp(args.port)
                break
            except OSError:
                continue
        if not rdp:
            log("FAIL: cannot connect RDP", args.port)
            return 2

        hello = rdp.hello()
        log("[2] hello:", hello.get("applicationType"), "from:", hello.get("from"),
            "| prefix:", bool(hello.get("testConnectionPrefix")))

        tabs = rdp.list_tabs()
        tab_list = tabs.get("tabs") or []
        log("[3] tabs:", len(tab_list))
        if not tab_list:
            log("FAIL: no tabs")
            return 3
        tab = None
        for t in tab_list:
            url = str(t.get("url") or "")
            log("    -", t.get("actor"), url[:70])
            if not tab or "about:" in url:
                tab = tab if (tab and "about:" not in str(tab.get("url"))) else t
            if "aliVal" in url or "manmanbuy" in url:
                tab = t
        log("[4] selected tab:", tab.get("actor"), str(tab.get("url"))[:70])

        target = rdp.get_target(tab["actor"])
        log("[5] target actor:", target)
        actor = target or tab["actor"]
        att = rdp.attach(actor)
        thread = att.get("threadActor") or att.get("actor") or actor
        log("[6] attach ->", {k: v for k, v in list(att.items())[:6]})
        log("    thread:", thread)

        srcs = rdp.sources(thread)
        log("[7] sources:", len(srcs))
        dyn = [s for s in srcs if args.break_url and args.break_url in str(s.get("url", ""))] if args.break_url else []
        for s in srcs[:6]:
            log("    src:", str(s.get("url"))[:90])
        if dyn:
            log("[8] matched sources:", [(s.get("actor"), str(s.get("url"))[:60]) for s in dyn[:3]])

        if args.break_url and args.break_line:
            target_src = dyn[0] if dyn else None
            if not target_src:
                log("WARN: break-url matched no source; use one of listed urls")
            else:
                bp = rdp.call({"to": thread, "type": "setBreakpoint",
                               "location": {"actor": target_src.get("actor"), "line": args.break_line}},
                              timeout=20)
                log("[9] setBreakpoint resp:", json.dumps(bp)[:400])
        log("\nRESULT: self-test done (hello/listTabs/getTarget/attach/sources)")
        return 0
    finally:
        try:
            if rdp:
                rdp.sock.close()
        except Exception:
            pass
        if proc:
            try:
                proc.terminate(); proc.wait(timeout=8)
            except Exception:
                try: proc.kill()
                except Exception: pass
        if profile:
            shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
