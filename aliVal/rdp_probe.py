"""RDP 最小验证：camoufox(Firefox 152) 的 -start-debugger-server 是否可用、能否 listTabs。

只做"通道验证"，不做断点（断点实现依赖后续 actor 协议细节）。
运行： python rdp_probe.py
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

EXE = r"C:\Users\卢\AppData\Local\camoufox\camoufox\Cache\browsers\whitenightshadow\152.0.4-beta.30-reverse.5\camoufox.exe"
PORT = 6123


class Rdp:
    def __init__(self, port, timeout=10):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=timeout)
        self.sock.settimeout(timeout)
        self.buf = b""
        self.hello = None

    def _read_packet(self):
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
                raise ConnectionError("socket closed")
            self.buf += chunk

    def read(self, timeout=10):
        self.sock.settimeout(timeout)
        return self._read_packet()

    def send(self, obj):
        data = json.dumps(obj).encode("utf-8")
        self.sock.sendall(str(len(data)).encode("ascii") + b":" + data)

    def request(self, obj, want_type=None, timeout=15):
        self.send(obj)
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = self.read(timeout=max(1, deadline - time.time()))
            if want_type is None or msg.get("type") == want_type or msg.get("from") == obj.get("to"):
                return msg
        return None


def main():
    if not os.path.exists(EXE):
        print("EXE not found:", EXE)
        return 1
    profile = tempfile.mkdtemp(prefix="rdp_probe_")
    args = [EXE, "-no-remote", "-profile", profile, "-start-debugger-server", str(PORT), "about:blank"]
    print("launching:", " ".join(args[:4]), "...")
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        rdp = None
        for i in range(30):
            time.sleep(1)
            try:
                rdp = Rdp(PORT)
                break
            except OSError:
                continue
        if not rdp:
            print("FAIL: cannot connect to RDP port", PORT)
            return 2
        hello = rdp.read()
        print("hello keys:", list(hello.keys())[:12])
        print("applicationType:", hello.get("applicationType"), "from:", hello.get("from"))
        rdp.send({"to": "root", "type": "listTabs"})
        tabs = None
        for _ in range(10):
            msg = rdp.read()
            if "tabs" in msg:
                tabs = msg
                break
        if not tabs:
            print("FAIL: listTabs got no tabs payload")
            return 3
        print("tabs count:", len(tabs.get("tabs", [])))
        for t in tabs.get("tabs", [])[:3]:
            print("  tab actor:", t.get("actor"), "| url:", str(t.get("url"))[:60])
        print("selected:", tabs.get("selected"))
        print("\nRESULT: RDP channel OK (hello + listTabs succeed) -> 断点方案（B）可行")
        return 0
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=8)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
