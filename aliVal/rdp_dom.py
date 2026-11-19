"""点开验证码并 dump 滑块相关 DOM，确定合成拖拽要打哪个节点。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

PROBE = r"""
(function(){
  var out = {};
  out.ids = [].slice.call(document.querySelectorAll('[id]')).map(function(e){return e.tagName+'#'+e.id}).slice(0,80);
  out.captchaNodes = [].slice.call(document.querySelectorAll('[id*=aptcha],[class*=aptcha],[id*=slid],[class*=slid],[id*=puzzle],[class*=puzzle]'))
      .map(function(e){var r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,cls:String(e.className).slice(0,80),
      x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}).slice(0,40);
  out.iframes = [].slice.call(document.querySelectorAll('iframe')).map(function(f){return {id:f.id,src:String(f.src).slice(0,80),
      w:Math.round(f.getBoundingClientRect().width)}});
  return JSON.stringify(out);
})()
"""


def main():
    dbg = FireFoxDebugger(port=6171)
    dbg.launch(URL, wait_page=8)
    try:
        print("[enable]", json.dumps(dbg.enable("aliVal"), ensure_ascii=False)[:160])
        r = dbg.evaluate("(function(){var b=document.getElementById('button');if(!b)return 'no-button';b.click();return 'clicked';})()")
        print("[click]", r.get("result"))
        time.sleep(4)
        res = dbg.evaluate(PROBE)
        data = json.loads(res.get("result") or "{}")
        print("[ids]", json.dumps(data.get("ids"), ensure_ascii=False)[:1500])
        print("[captchaNodes]", json.dumps(data.get("captchaNodes"), ensure_ascii=False)[:2000])
        print("[iframes]", json.dumps(data.get("iframes"), ensure_ascii=False)[:600])
        with open(r"D:\ds_work\js_reverse_projects\aliVal\config\slider_dom.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
