"""诊断验证码为什么没渲染：配置、初始化函数、容器内容、控制台错误。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

DIAG = r"""
(function(){
  var o = {};
  try { o.config = JSON.stringify(window.AliyunCaptchaConfig); } catch(e){ o.config = 'err'; }
  try { o.initType = typeof window.initAliyunCaptcha; } catch(e){}
  try { o.initSrc = String(window.initAliyunCaptcha).slice(0, 200); } catch(e){}
  try { o.captchaEl = document.getElementById('captcha-element').outerHTML.slice(0, 400); } catch(e){}
  try { o.aliyunGlobals = Object.keys(window).filter(function(k){return /aliyun|feilin|captcha|z_um/i.test(k);}); } catch(e){}
  try { o.scriptSrcs = [].slice.call(document.querySelectorAll('script[src]')).map(function(s){return s.src.split('/').pop();}); } catch(e){}
  try { o.btnOnclick = String(document.getElementById('button').onclick); } catch(e){}
  try { o.zum = typeof window.z_um; } catch(e){}
  return JSON.stringify(o);
})()
"""

INIT = r"""
(function(){
  try {
    if (typeof window.initAliyunCaptcha !== 'function') return 'no-init-fn';
    var cfg = window.AliyunCaptchaConfig;
    if (!cfg) return 'no-config';
    window.initAliyunCaptcha(cfg);
    return 'called';
  } catch(e) { return 'err:' + (e && e.message); }
})()
"""


def main():
    dbg = FireFoxDebugger(port=6172)
    dbg.launch(URL, wait_page=10)
    try:
        print("[enable]", json.dumps(dbg.enable("aliVal"), ensure_ascii=False)[:150])
        d = json.loads(dbg.evaluate(DIAG).get("result") or "{}")
        for k, v in d.items():
            print(" ", k, "=", json.dumps(v, ensure_ascii=False)[:700])

        # 列出 console 里已有的错误（consoleActor.getCachedMessages）
        try:
            msgs = dbg.rdp.call({"to": dbg.console, "type": "getCachedMessages",
                                 "messageTypes": ["PageError", "ConsoleAPI"]}, 20)
            got = msgs.get("messages") or []
            print("[console]", len(got))
            for m in got[-12:]:
                print("   ", m.get("level") or m.get("errorMessage") or str(m)[:140])
        except Exception as e:
            print("[console err]", e)

        print("[init call]", dbg.evaluate(INIT).get("result"))
        time.sleep(4)
        box = dbg.evaluate("(function(){var e=document.getElementById('captcha-element');"
                           "var r=e?e.getBoundingClientRect():null;"
                           "return JSON.stringify({w:r&&r.width,h:r&&r.height,html:e?e.innerHTML.slice(0,300):null})})()")
        print("[captcha-element]", box.get("result"))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
