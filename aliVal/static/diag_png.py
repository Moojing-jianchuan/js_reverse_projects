"""诊断 8：验证码 PNG 到底能不能在本环境加载（onload / onerror / 尺寸）。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
IMG = ("https://static-captcha.aliyuncs.com/qst/PUZZLE/online/915/"
       "ddea140c-c459-4b68-96cd-658d81dd69a4/back.png")

TEST = r"""
(function(){
  return new Promise(function(res){
    var out = {src: %s, steps: []};
    var im = new Image();
    im.onload = function(){ out.onload = im.naturalWidth + 'x' + im.naturalHeight; res(JSON.stringify(out)); };
    im.onerror = function(e){ out.onerror = 'error'; res(JSON.stringify(out)); };
    im.src = %s;
    setTimeout(function(){ out.timeout = 'no-event'; out.complete = im.complete;
      out.nw = im.naturalWidth; res(JSON.stringify(out)); }, 12000);
  });
})()
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6219)
    dbg.launch(URL, wait_page=10)
    try:
        for i in range(6):
            try:
                dbg.enable("aliVal")
                break
            except Exception as e:
                print("[enable retry] %s" % str(e)[:50])
                time.sleep(3)
        print("[img-test]", ev(dbg, TEST % (json.dumps(IMG), json.dumps(IMG)), timeout=40))
        print("[fetch-test]", ev(dbg, """
        fetch(%s).then(function(r){ return 'status='+r.status+' type='+(r.headers.get('content-type')||''); })
          .catch(function(e){ return 'fetch-err:'+e.message; })""" % json.dumps(IMG), timeout=40))
        print("[canvas-webgl]", ev(dbg, """
        (function(){ try { var c=document.createElement('canvas');
          var gl=c.getContext('webgl'); return gl ? ('webgl-ok ' + (gl.getParameter(gl.VERSION)||'')) : 'webgl-null'; }
          catch(e){ return 'webgl-err:'+e.message; } })()"""))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
