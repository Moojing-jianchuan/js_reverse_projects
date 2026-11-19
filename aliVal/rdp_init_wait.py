"""等 initAliyunCaptcha 就绪后再用我们自己的回调初始化，观察实例与滑块渲染。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

HOOK = r"""
(function(){
  if (window.__nlog) return 'already';
  window.__nlog = [];
  var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){ try{this.__m=m;this.__u=String(u);}catch(e){}; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var s = this;
    try { var r = {m:this.__m,u:this.__u,req:String(b==null?'':b).slice(0,200),status:null,resp:null};
          window.__nlog.push(r);
          this.addEventListener('load', function(){ try{ r.status=s.status; var t=s.responseText||'';
            r.resp = t.length>300 ? t.slice(0,300)+'...['+t.length+']' : t; }catch(e){} }); } catch(e){}
    return _send.apply(this, arguments);
  };
  return 'hooked';
})()
"""

WAIT_FN = "typeof window.initAliyunCaptcha === 'function'"

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
  inst: typeof window.__capInst, instAt: window.__instAt || null,
  protoKeys: window.__capInst ? Object.getOwnPropertyNames(Object.getPrototypeOf(window.__capInst)).slice(0, 30) : null,
  elLen: document.getElementById('captcha-element').innerHTML.length,
  elSize: (function(){var r=document.getElementById('captcha-element').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})(),
  cvpLen: (window.__cvp||'').length,
  bodyKids: [].slice.call(document.body.children).map(function(e){return e.tagName+'#'+e.id+'.'+String(e.className).slice(0,30);})
})
"""


def main():
    dbg = FireFoxDebugger(port=6181)
    dbg.launch(URL, wait_page=3)
    try:
        dbg.enable("aliVal")
        print("[hook]", dbg.evaluate(HOOK).get("result"))

        ok = False
        for i in range(15):
            try:
                v = dbg.evaluate(WAIT_FN, timeout=20).get("result")
            except Exception as e:
                print("[poll %d] busy: %s" % (i, str(e)[:60]))
                time.sleep(3)
                continue
            if v is True:
                print("[ready] after ~%ds" % (i * 3))
                ok = True
                break
            time.sleep(3)
        if not ok:
            print("[never ready] initAliyunCaptcha still not a function")
            return

        print("[init]", dbg.evaluate(INIT).get("result"))
        for i in range(8):
            time.sleep(2)
            st = dbg.evaluate(READ).get("result")
            d = json.loads(st) if isinstance(st, str) else {}
            print("[t+%ds] inst=%s el=%s size=%s cvp=%s" % ((i + 1) * 2, d.get("inst"), d.get("elLen"),
                                                           d.get("elSize"), d.get("cvpLen")))
            if d.get("inst") == "object":
                print("[proto]", json.dumps(d.get("protoKeys"), ensure_ascii=False)[:400])
            if d.get("elLen", 0) > 0:
                print("[bodyKids]", json.dumps(d.get("bodyKids"), ensure_ascii=False)[:500])
                break
        with open(r"D:\ds_work\js_reverse_projects\aliVal\config\netlog_init2.json", "w", encoding="utf-8") as f:
            f.write(dbg.evaluate("JSON.stringify(window.__nlog||[])").get("result") or "[]")
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
