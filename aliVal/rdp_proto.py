"""枚举 RDP 协议方法：向 root 要 protocolDescription，抽出 watcher/target/frame 的能力。

若 protocolDescription 不可用，退回到 omni.ja 静态搜索（提示信息会给出）。
"""
import json
import shutil
import socket
import subprocess
import sys
import tempfile
import time

EXE = r"C:\Users\卢\AppData\Local\camoufox\camoufox\Cache\browsers\whitenightshadow\152.0.4-beta.30-reverse.5\camoufox.exe"
PORT = 6125


def log(*a):
    print(*a, flush=True)


class Rdp:
    def __init__(self, port, timeout=25):
        self.s = socket.create_connection(("127.0.0.1", port), timeout=timeout)
        self.s.settimeout(timeout)
        self.buf = b""
        self.prefix = None

    def _pkt(self):
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
            c = self.s.recv(1 << 20)
            if not c:
                raise ConnectionError("closed")
            self.buf += c

    def recv(self, t=25):
        self.s.settimeout(t)
        return self._pkt()

    def send(self, o):
        if self.prefix and "prefix" not in o:
            o = dict(o, prefix=self.prefix)
        d = json.dumps(o).encode()
        self.s.sendall(str(len(d)).encode() + b":" + d)

    def call(self, o, t=60):
        self.send(o)
        end = time.time() + t
        while time.time() < end:
            m = self.recv(max(1, end - time.time()))
            if m.get("from") == o.get("to"):
                return m
        return None


def main():
    profile = tempfile.mkdtemp(prefix="rdp_proto_")
    proc = subprocess.Popen([EXE, "-no-remote", "-profile", profile,
                             "-start-debugger-server", str(PORT), "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rdp = None
    try:
        for _ in range(40):
            time.sleep(1)
            try:
                rdp = Rdp(PORT); break
            except OSError:
                continue
        if not rdp:
            log("FAIL connect"); return 2
        h = rdp.recv(20)
        rdp.prefix = h.get("testConnectionPrefix")
        log("hello:", h.get("applicationType"), "prefix:", bool(rdp.prefix))

        r = rdp.call({"to": "root", "type": "protocolDescription"}, t=90)
        if not r or "error" in r:
            log("protocolDescription not available:", json.dumps(r)[:300] if r else None)
            log("建议：解压 omni.ja 搜索 watchTargets / getWatcher 定义")
            return 3
        types = r.get("types", {})
        log("types count:", len(types))
        keys = sorted(types.keys())
        # 只打我们关心的
        want = [k for k in keys if any(x in k.lower() for x in ("watcher", "target", "thread", "frame", "tab", "root"))]
        log("relevant types:", want[:20])
        for k in want[:12]:
            spec = types.get(k) or {}
            methods = spec.get("methods") or {}
            log(f"\n== {k} ({len(methods)} methods)")
            for mname, m in list(methods.items())[:40]:
                req = list((m.get("request") or {}).keys())
                log(f"   {mname}({', '.join(req)})")
        # 存一份完整规范，便于后续实现
        with open("config/rdp_protocol.json", "w", encoding="utf-8") as f:
            json.dump(types, f, ensure_ascii=False)
        log("\nsaved: config/rdp_protocol.json")
        return 0
    finally:
        try:
            if rdp: rdp.s.close()
        except Exception: pass
        try:
            proc.terminate(); proc.wait(timeout=8)
        except Exception:
            try: proc.kill()
            except Exception: pass
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
