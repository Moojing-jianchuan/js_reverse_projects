"""manual_drag4.py —— 真人手拖，用页面桥把 captchaVerifyParam 直接回传到本地，绕开整页跳转。

和前几版的区别：
  * bridge 替换了 jQuery.ajax —— 页面不会真的提交、也不会跳转，数据直接 POST 到 127.0.0.1:18081
  * 因此「松手瞬间页面重载导致丢数据」的问题不存在
  * 顺带 hook window.btoa 记录同一轮的 T（deflate 的 base64），用于和注入轮做逐字段对比
  * 每轮全新 profile（避免 device SDK 状态累积）
"""
from __future__ import annotations

import http.server
import json
import os
import sys
import tempfile
import threading
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\human_cvp.json"
BRIDGE = r"D:\ds_work\js_reverse_projects\aliVal\e2e_10_bridge.js"
PORT = 18081

USERJS = """user_pref("network.proxy.type", 0);
user_pref("network.proxy.http", "");
user_pref("network.proxy.ssl", "");
user_pref("network.proxy.socks", "");
user_pref("network.proxy.no_proxies_on", "*");
"""

STORE = {"cvp": None, "piece": [], "at": None}


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def do_OPTIONS(self):
        self._cors()

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n).decode("utf-8", "replace")
            if self.path.startswith("/param"):
                obj = json.loads(body)
                STORE["cvp"] = obj.get("cvp")
                STORE["at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                print("[bridge] 收到 captchaVerifyParam, len=%d" % len(STORE["cvp"] or ""), flush=True)
            elif self.path.startswith("/piece"):
                STORE["piece"].append(json.loads(body))
        except Exception as e:
            print("[bridge err]", str(e)[:80], flush=True)
        self._cors()

    def log_message(self, *a):
        pass


BTOA_HOOK = r"""
(function(){
  if (window.__bt2) return 'already';
  window.__bt2 = [];
  var _b = window.btoa;
  window.btoa = function(s){
    var out = _b.apply(this, arguments);
    try {
      if (typeof out === 'string' && out.length > 300 && out.indexOf('eJ') === 0) {
        window.__bt2.push(out);
      }
    } catch(e){}
    return out;
  };
  return 'btoa-hooked';
})()
"""

BANNER = r"""
(function(text, color){
  var b = document.getElementById('__banner4');
  if (!b) { b = document.createElement('div'); b.id = '__banner4';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'font:16px/1.7 -apple-system,Segoe UI,sans-serif;padding:12px;text-align:center;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.4)';
    document.documentElement.appendChild(b); }
  b.style.background = color; b.style.color = '#fff'; b.textContent = text;
  return 'ok';
})(%s, %s)
"""


def ev(dbg, expr, timeout=45):
    return dbg.evaluate(expr, timeout)


def main():
    from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(">>> 本地接收器已启动 127.0.0.1:%d" % PORT, flush=True)

    profile = tempfile.mkdtemp(prefix="rdp_human_")
    with open(os.path.join(profile, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)
    tempfile.mkdtemp = lambda *a, **k: profile
    print(">>> profile:", profile, flush=True)

    dbg = FireFoxDebugger(port=6213)
    dbg.launch(URL, wait_page=12)
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
                d = json.loads(ev(dbg, "JSON.stringify({s:!!document.querySelector('#aliyunCaptcha-sliding-slider'),"
                                       "i:!!document.querySelector('#aliyunCaptcha-img')})", 20).get("result") or "{}")
            except Exception:
                continue
            if d.get("s") and d.get("i"):
                print("[ready] 滑块 + 图片就绪 %.0fs" % ((i + 1) * 2), flush=True)
                break

        ev(dbg, BTOA_HOOK, 20)
        with open(BRIDGE, encoding="utf-8") as f:
            bridge_src = f.read()
        geo = ev(dbg, bridge_src, 90).get("result")
        print("[bridge]", json.dumps(geo, ensure_ascii=False)[:300], flush=True)
        ev(dbg, BANNER % (json.dumps("【现在可以拖了】把滑块拖到缺口，松手即可（不会跳走）"), json.dumps("#00a854")), 20)

        print("#" * 70, flush=True)
        print("# 请切到浏览器，把滑块拖到缺口后松手。页面不会跳走，数据会回传到本地。", flush=True)
        print("#" * 70, flush=True)

        got = None
        for i in range(80):   # ~240s
            time.sleep(3)
            if STORE["cvp"]:
                got = STORE["cvp"]
                break
            if i % 4 == 3:
                print("[waiting %ds] piece 上报 %d 次" % ((i + 1) * 3, len(STORE["piece"])), flush=True)

        if not got:
            print("[timeout] 没收到 captchaVerifyParam", flush=True)
            return

        bt = ev(dbg, "JSON.stringify(window.__bt2 || [])", 30).get("result")
        bts = json.loads(bt) if isinstance(bt, str) else []
        rec = {"captured_at": STORE["at"], "captchaVerifyParam": got,
               "deflate_candidates": bts, "piece_samples": len(STORE["piece"]),
               "bridge_geo": geo}
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, indent=1)
        print("\n[saved]", OUT, flush=True)
        print("  cvp len =", len(got), flush=True)
        print("  btoa(eJ…) 候选 =", [len(x) for x in bts], flush=True)
        try:
            env = json.loads(got)
            blob = env.get("data") or ""
            print("  certifyId =", env.get("certifyId"), "| data len =", len(blob),
                  "| data head =", blob[:16], flush=True)
        except Exception:
            pass
    finally:
        dbg.close()
        srv.shutdown()


if __name__ == "__main__":
    main()
