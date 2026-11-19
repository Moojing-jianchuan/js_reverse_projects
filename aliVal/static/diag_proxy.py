"""诊断 12：给调试器用的 camoufox 一个自己的 profile，user.js 里关掉系统代理。

系统 WinINET 代理 127.0.0.1:7897 会让浏览器访问 static-captcha.aliyuncs.com 永久挂起，
而 shell 里 curl 直连 100ms 就 200 —— 这是滑块不渲染的直接原因（图片预载 Lr() 永不 settle）。
"""
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
IMG = ("https://static-captcha.aliyuncs.com/qst/PUZZLE/online/915/"
       "ddea140c-c459-4b68-96cd-658d81dd69a4/back.png")
PROFILE = r"D:\ds_work\js_reverse_projects\aliVal\static\profile_noproxy"

USERJS = """user_pref("network.proxy.type", 0);
user_pref("network.proxy.http", "");
user_pref("network.proxy.ssl", "");
user_pref("network.predictor.enabled", false);
user_pref("network.dns.disablePrefetch", true);
"""

KICK = r"""
(function(){
  window.__t = {img: null, xhr: null};
  var im = new Image();
  im.onload = function(){ window.__t.img = 'load ' + im.naturalWidth + 'x' + im.naturalHeight; };
  im.onerror = function(){ window.__t.img = 'error'; };
  im.src = %s;
  var x = new XMLHttpRequest();
  x.open('GET', %s);
  x.onload = function(){ window.__t.xhr = 'st=' + x.status + ' len=' + (x.responseText||'').length; };
  x.onerror = function(){ window.__t.xhr = 'error'; };
  x.send();
  return 'kicked';
})()
"""

READ = r"""
JSON.stringify({
  t: window.__t || null,
  RMD: typeof window.RMD === 'undefined' ? 'undef' : window.RMD,
  elKids: (document.getElementById('captcha-element')||{childNodes:{length:-1}}).childNodes.length,
  capIds: [].slice.call(document.querySelectorAll('[id^=aliyunCaptcha]')).map(function(e){
     var b=e.getBoundingClientRect(); return e.id+'['+Math.round(b.width)+'x'+Math.round(b.height)+']';}),
  inst: typeof window.captcha
})
"""


def seed_profile():
    os.makedirs(PROFILE, exist_ok=True)
    with open(os.path.join(PROFILE, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:200]}
    return r.get("result")


def main():
    seed_profile()
    # 让 FireFoxDebugger.launch 用我们预置好 user.js 的 profile
    tempfile.mkdtemp = lambda *a, **k: PROFILE
    dbg = FireFoxDebugger(port=6223)
    dbg.launch(URL, wait_page=12)
    try:
        for i in range(6):
            try:
                dbg.enable("aliVal")
                break
            except Exception:
                time.sleep(3)
        print("[page itself]", str(ev(dbg, READ))[:600])
        print("[kick]", ev(dbg, KICK % (json.dumps(IMG), json.dumps(IMG))))
        for i in range(6):
            time.sleep(2)
            print("[t+%ds]" % (2 * (i + 1)), str(ev(dbg, READ))[:600])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
