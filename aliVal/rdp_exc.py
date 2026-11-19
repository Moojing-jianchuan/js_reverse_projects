"""在页面重新加载时开启「异常即暂停」，抓出 dynamicJS/feilin 初始化失败的真实异常。

背景：AliyunCaptcha.js 里实例创建条件是
    "function" == typeof window.AliyunCaptcha && !0 === r.dynamicJSLoaded && a()
实测 window.AliyunCaptcha 一直是 undefined，怀疑 pe.0xx.js 执行时报错。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, RdpError

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"


def set_exc(dbg, mode="all", ignore_caught="false"):
    try:
        r = dbg.rdp.call({"to": dbg.thread, "type": "pauseOnExceptions",
                          "pauseOnExceptions": mode,
                          "ignoreCaughtExceptions": ignore_caught}, 10)
        return r
    except RdpError as e:
        return {"error": str(e)[:100]}


def main():
    dbg = FireFoxDebugger(port=6188)
    dbg.launch(URL, wait_page=1)
    try:
        for _ in range(6):
            try:
                dbg.enable("aliVal")
                break
            except RdpError:
                time.sleep(1)
        print("[exc-mode]", set_exc(dbg))
        print("[reload]", dbg.rdp.call({"to": dbg.target, "type": "reload"}, 20))

        # reload 后重建会话并立刻开启异常暂停
        time.sleep(0.4)
        for _ in range(20):
            try:
                dbg.enable("aliVal")
                break
            except RdpError:
                time.sleep(0.4)
        print("[thread]", dbg.thread, "| exc:", set_exc(dbg))

        end = time.time() + 45
        seen = 0
        while time.time() < end and seen < 4:
            p = dbg.rdp.wait_event(lambda e: e.get("type") == "paused", 10)
            if not p:
                continue
            seen += 1
            why = p.get("why") or {}
            fr = p.get("frame") or {}
            where = fr.get("where") or {}
            print("\n[paused %d] why=%s" % (seen, json.dumps(why, ensure_ascii=False)[:300]))
            print("   where:", json.dumps(where, ensure_ascii=False)[:200])
            if why.get("type") == "exception":
                exc = why.get("exception") or {}
                print("   exception:", json.dumps(exc, ensure_ascii=False)[:600])
                fa = fr.get("actor")
                if fa:
                    for expr in ("String(arguments && arguments[0] && arguments[0].message)",
                                 "String(arguments && arguments[0] && arguments[0].stack || '')"):
                        r = dbg.frame_eval(fa, expr, 15)
                        print("   eval:", str(r.get("result"))[:500])
            try:
                print("   frames:", json.dumps([(f.get("displayName"), (f.get("where") or {}).get("line"))
                                                for f in dbg.frames()], ensure_ascii=False)[:300])
            except Exception as e:
                print("   frames err:", str(e)[:60])
            dbg.resume()
        print("\n[total pauses]", seen)
        st = dbg.evaluate("JSON.stringify({aliyun: typeof window.AliyunCaptcha,"
                          "feilin: typeof window.FEILIN,"
                          "dyn: (window.AliyunCaptchaConfig||{}).prefix||null,"
                          "el: document.getElementById('captcha-element').innerHTML.length})", timeout=30)
        print("[state]", st.get("result"))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
