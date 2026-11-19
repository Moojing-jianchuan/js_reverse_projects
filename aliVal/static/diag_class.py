"""诊断 10：window.AliyunCaptcha 就是 pe 包里的控件类（t.AliyunCaptcha=rS）。

侦察它的原型方法、构造签名，为「自己 new 一个实例并驱动」做准备。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\diag_class.json"

RECON = r"""
(function(){
  var A = window.AliyunCaptcha;
  var o = {type: typeof A, len: A && A.length, name: A && A.name};
  try {
    o.src = String(A).slice(0, 400);
  } catch(e){}
  try {
    o.proto = A ? Object.getOwnPropertyNames(A.prototype) : null;
  } catch(e){ o.proto = 'err'; }
  try {
    o.statics = A ? Object.getOwnPropertyNames(A) : null;
  } catch(e){}
  return JSON.stringify(o);
})()
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:200]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6221)
    dbg.launch(URL, wait_page=12)
    try:
        for i in range(6):
            try:
                dbg.enable("aliVal")
                break
            except Exception:
                time.sleep(3)
        raw = ev(dbg, RECON)
        print("[recon]", str(raw)[:2000])
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(str(raw))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
