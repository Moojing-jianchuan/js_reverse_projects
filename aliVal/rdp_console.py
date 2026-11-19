"""实时监听页面 console / pageError，看验证码初始化到底报什么错。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"


def main():
    dbg = FireFoxDebugger(port=6177)
    dbg.launch(URL, wait_page=6)
    try:
        dbg.enable("aliVal")
        ca = dbg.console
        print("[consoleActor]", ca)
        r = dbg.rdp.call({"to": ca, "type": "startListeners",
                          "listeners": ["PageError", "ConsoleAPI", "LogMessage"]}, 20)
        print("[startListeners]", json.dumps(r, ensure_ascii=False)[:300])

        dbg.rdp.drain(0.2)
        print("[click]", dbg.evaluate("(function(){var b=document.getElementById('button');b&&b.click();return 'clicked';})()").get("result"))

        end = time.time() + 12
        seen = []
        while time.time() < end:
            ev = dbg.rdp.wait_event(
                lambda e: e.get("type") in ("pageError", "consoleAPICall", "logMessage"), 3)
            if not ev:
                continue
            t = ev.get("type")
            if t == "pageError":
                seen.append(("pageError", ev.get("pageError") or ev.get("errorMessage")))
            elif t == "consoleAPICall":
                args = (ev.get("message") or {}).get("arguments") or []
                seen.append(("consoleAPI", [str(a)[:200] for a in args]))
            else:
                seen.append(("logMessage", str(ev)[:300]))
        print("[events]", len(seen))
        for kind, msg in seen[:20]:
            print("  ", kind, ":", json.dumps(msg, ensure_ascii=False)[:400])

        # 状态快照
        st = dbg.evaluate("JSON.stringify({captcha: typeof window.captcha,"
                          "inst: typeof window.__capInst,"
                          "feilin: typeof window.FEILIN,"
                          "el: document.getElementById('captcha-element').innerHTML.length,"
                          "children: document.body.children.length})")
        print("[state]", st.get("result"))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
