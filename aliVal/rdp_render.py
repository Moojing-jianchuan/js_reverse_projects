"""给验证码容器设置可见尺寸后再初始化（容器 0×0 很可能导致 embed 模式不渲染）。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
FULL_LOG = r"D:\ds_work\js_reverse_projects\aliVal\config\netlog_full.json"

HOOK = r"""
(function(){
  if (window.__nlog) return 'already';
  window.__nlog = [];
  var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){ try{this.__m=m;this.__u=String(u);}catch(e){}; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var s = this;
    try { var r = {m:this.__m,u:this.__u,req:String(b==null?'':b),status:null,resp:null};
          window.__nlog.push(r);
          this.addEventListener('load', function(){ try{ r.status=s.status; r.resp=s.responseText||''; }catch(e){} }); } catch(e){}
    return _send.apply(this, arguments);
  };
  return 'hooked';
})()
"""

PREP = r"""
(function(){
  var el = document.getElementById('captcha-element');
  el.style.cssText = 'display:block;width:360px;height:44px;min-height:44px;position:relative;';
  var b = document.getElementById('button');
  if (b) b.style.cssText = 'display:inline-block;margin-top:8px;';
  var r = el.getBoundingClientRect();
  return JSON.stringify({w:Math.round(r.width), h:Math.round(r.height)});
})()
"""

INIT = r"""
(function(){
  try {
    window.initAliyunCaptcha({
      SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
      captchaVerifyCallback: function(p){ window.__cvp = String(p); return Promise.resolve({captchaResult:true, bizResult:true}); },
      onBizResultCallback: function(){ return null; },
      getInstance: function(inst){ window.__capInst = inst; window.__instAt = Date.now(); },
      slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5
    });
    return 'init-called';
  } catch(e) { return 'init-err:' + (e && e.message); }
})()
"""

READ = r"""
JSON.stringify({
  inst: typeof window.__capInst,
  protoKeys: window.__capInst ? Object.getOwnPropertyNames(Object.getPrototypeOf(window.__capInst)).slice(0,40) : null,
  elLen: document.getElementById('captcha-element').innerHTML.length,
  elSize: (function(){var r=document.getElementById('captcha-element').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})(),
  sliders: [].slice.call(document.querySelectorAll('[class*=slide],[class*=Slide],[id*=slide]')).map(function(e){
      var r=e.getBoundingClientRect();
      return {id:e.id, cls:String(e.className).slice(0,50), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)};
    }).filter(function(o){return o.w>10 && o.h>10;}),
  cvpLen: (window.__cvp||'').length
})
"""


def ev(dbg, expr, timeout=60):
    return dbg.evaluate(expr, timeout)


def wait_idle(dbg, tries=8):
    for i in range(tries):
        try:
            r = ev(dbg, "1+1", timeout=25)
            if r.get("result") == 2:
                return True
        except Exception as e:
            print("[busy %d] %s" % (i, str(e)[:40]))
        time.sleep(3)
    return False


def main():
    dbg = FireFoxDebugger(port=6182)
    dbg.launch(URL, wait_page=2)
    try:
        info = None
        for attempt in range(4):
            try:
                info = dbg.enable("aliVal")
                break
            except Exception as e:
                print("[enable retry %d] %s" % (attempt, str(e)[:70]))
                time.sleep(3)
        if not info:
            print("[enable failed]")
            return
        print("[idle]", wait_idle(dbg))
        print("[hook]", ev(dbg, HOOK).get("result"))
        for i in range(12):
            try:
                if ev(dbg, "typeof window.initAliyunCaptcha === 'function'", timeout=15).get("result") is True:
                    break
            except Exception:
                pass
            time.sleep(2)
        print("[prep]", ev(dbg, PREP).get("result"))
        print("[init]", ev(dbg, INIT).get("result"))
        for i in range(8):
            time.sleep(2)
            st = ev(dbg, READ).get("result")
            d = json.loads(st) if isinstance(st, str) else {}
            print("[t+%ds] inst=%s el=%s size=%s sliders=%d cvp=%s" %
                  ((i + 1) * 2, d.get("inst"), d.get("elLen"), d.get("elSize"),
                   len(d.get("sliders") or []), d.get("cvpLen")))
            if d.get("sliders"):
                print("[sliders]", json.dumps(d["sliders"], ensure_ascii=False)[:500])
            if d.get("inst") == "object":
                print("[proto]", json.dumps(d.get("protoKeys"), ensure_ascii=False)[:400])
            if d.get("cvpLen"):
                break
        log = ev(dbg, "JSON.stringify(window.__nlog||[])").get("result") or "[]"
        with open(FULL_LOG, "w", encoding="utf-8") as f:
            f.write(log)
        print("[netlog saved]", FULL_LOG)
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
