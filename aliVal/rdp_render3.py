"""根因线索：页面把 #button 设成 visibility:hidden、#captcha-element 无尺寸。
先修样式再让页面重新初始化，看滑块是否渲染。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

FIX_STYLE = r"""
(function(){
  var el = document.getElementById('captcha-element');
  var b = document.getElementById('button');
  el.style.cssText = 'position:relative;display:block;width:360px;height:44px;'
                   + 'min-height:44px;overflow:visible;';
  if (b) b.style.cssText = 'visibility:visible;display:inline-block;margin-top:12px;';
  var re = el.getBoundingClientRect(), rb = b ? b.getBoundingClientRect() : null;
  return JSON.stringify({el:[Math.round(re.width),Math.round(re.height)],
                         btn: rb ? [Math.round(rb.width),Math.round(rb.height)] : null,
                         btnVis: b ? getComputedStyle(b).visibility : null});
})()
"""

INIT_ONCE = r"""
(function(){
  if (window.__initCalled) return 'already-called';
  window.__initCalled = 1;
  try {
    window.initAliyunCaptcha({
      SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
      captchaVerifyCallback: function(p){ window.__cvp = String(p); return Promise.resolve({captchaResult:true, bizResult:true}); },
      onBizResultCallback: function(){ return null; },
      getInstance: function(inst){ window.__capInst = inst; window.__instAt = Date.now(); },
      slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5
    });
    return 'called';
  } catch(e) { return 'err:' + (e && e.message); }
})()
"""

READ = r"""
JSON.stringify({
  inst: typeof window.__capInst,
  elLen: document.getElementById('captcha-element').innerHTML.length,
  elSize: (function(){var r=document.getElementById('captcha-element').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})(),
  html: document.getElementById('captcha-element').innerHTML.slice(0, 300),
  sliders: [].slice.call(document.querySelectorAll('[class*=slide],[class*=Slide],[id*=slide],[class*=captcha]')).map(function(e){
      var r=e.getBoundingClientRect();
      return {id:e.id||'', cls:String(e.className).slice(0,40), w:Math.round(r.width), h:Math.round(r.height), x:Math.round(r.x), y:Math.round(r.y)};
    }).filter(function(o){return o.w>10 && o.h>10;}).slice(0,10)
})
"""


def main():
    dbg = FireFoxDebugger(port=6186)
    dbg.launch(URL, wait_page=10)
    try:
        print("[enable]", json.dumps(dbg.enable("aliVal"), ensure_ascii=False)[:90])
        for i in range(6):
            try:
                if dbg.evaluate("typeof window.initAliyunCaptcha === 'function'", timeout=20).get("result") is True:
                    break
            except Exception as e:
                print("[wait busy]", str(e)[:50])
            time.sleep(2)
        print("[fix]", dbg.evaluate(FIX_STYLE, timeout=30).get("result"))
        print("[init]", dbg.evaluate(INIT_ONCE, timeout=40).get("result"))
        for i in range(6):
            time.sleep(2)
            st = dbg.evaluate(READ, timeout=30).get("result")
            d = json.loads(st) if isinstance(st, str) else {}
            print("[t+%ds] inst=%s el=%s size=%s nodes=%d" % ((i + 1) * 2, d.get("inst"),
                                                              d.get("elLen"), d.get("elSize"),
                                                              len(d.get("sliders") or [])))
            if d.get("elLen", 0) > 0 or d.get("sliders"):
                print("[html]", d.get("html"))
                print("[nodes]", json.dumps(d.get("sliders"), ensure_ascii=False)[:600])
                break
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
