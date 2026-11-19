"""诊断 11：页面内直接取 PNG —— Image / XHR / fetch 三条路各是什么结果。

用轮询标志位避开 RDP evaluate 不 await Promise 的限制。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
IMG = ("https://static-captcha.aliyuncs.com/qst/PUZZLE/online/915/"
       "ddea140c-c459-4b68-96cd-658d81dd69a4/back.png")

KICK = r"""
(function(){
  window.__t = {img: null, xhr: null, fetch: null, t0: Date.now()};
  var im = new Image();
  im.onload = function(){ window.__t.img = 'load ' + im.naturalWidth + 'x' + im.naturalHeight; };
  im.onerror = function(){ window.__t.img = 'error'; };
  im.src = %s;
  try {
    var x = new XMLHttpRequest();
    x.open('GET', %s);
    x.responseType = 'blob';
    x.onload = function(){ window.__t.xhr = 'load st=' + x.status + ' n=' + (x.response && x.response.size); };
    x.onerror = function(){ window.__t.xhr = 'error'; };
    x.ontimeout = function(){ window.__t.xhr = 'timeout'; };
    x.send();
  } catch(e){ window.__t.xhr = 'throw:' + e.message; }
  fetch(%s).then(function(r){ window.__t.fetch = 'st=' + r.status; })
            .catch(function(e){ window.__t.fetch = 'err:' + e.message; });
  return 'kicked';
})()
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:200]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6222)
    dbg.launch(URL, wait_page=12)
    try:
        for i in range(6):
            try:
                dbg.enable("aliVal")
                break
            except Exception:
                time.sleep(3)
        print("[kick]", ev(dbg, KICK % (json.dumps(IMG), json.dumps(IMG), json.dumps(IMG))))
        for i in range(8):
            time.sleep(2)
            print("[t+%ds]" % (2 * (i + 1)), str(ev(dbg, "JSON.stringify(window.__t)"))[:400])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
