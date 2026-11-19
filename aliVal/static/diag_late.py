"""诊断 6：不提前 attach 调试器，等 25s 后再 enable，看件面是否已自行渲染。

如果 25s 时容器已有内容 => 之前的失败是「调试器 attach 触发的反调试 / 时序」；
如果仍是空 => 渲染确实被别的东西挡住。
顺便确认 #captcha-element 是否还在（有几次 evaluate 报 el is null）。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\diag_late.json"

READ = r"""
JSON.stringify({
  href: location.href, title: document.title,
  hasEl: !!document.getElementById('captcha-element'),
  elKids: (document.getElementById('captcha-element')||{}).childNodes ? document.getElementById('captcha-element').childNodes.length : -1,
  elHtml: (document.getElementById('captcha-element')||{}).innerHTML ? document.getElementById('captcha-element').innerHTML.slice(0,200) : null,
  bodyKids: [].slice.call(document.body.children).map(function(e){
     var b=e.getBoundingClientRect();
     return e.tagName+'#'+(e.id||'')+'['+Math.round(b.width)+'x'+Math.round(b.height)+']';}),
  capIds: [].slice.call(document.querySelectorAll('[id^=aliyunCaptcha]')).map(function(e){
     var b=e.getBoundingClientRect(); return e.id+'['+Math.round(b.width)+'x'+Math.round(b.height)+']';}),
  inst: typeof window.captcha,
  feilin: typeof window.FEILIN,
  scripts: [].slice.call(document.querySelectorAll('script[src]')).map(function(s){return s.src.split('/').pop().slice(0,40);}),
  styles: [].slice.call(document.querySelectorAll('style')).length
})
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6217)
    dbg.launch(URL, wait_page=25)
    try:
        for i in range(6):
            try:
                dbg.enable("aliVal")
                print("[enable] ok")
                break
            except Exception as e:
                print("[enable retry %d] %s" % (i, str(e)[:50]))
                time.sleep(3)
        for k in range(3):
            print("[t+%ds]" % (25 + k * 5), str(ev(dbg, READ))[:1200])
            time.sleep(5)
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
