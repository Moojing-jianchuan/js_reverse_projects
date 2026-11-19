"""诊断 4：图片/iframe 假设。

记录所有 img（含 detached）的 src、complete、naturalWidth，以及 Image 构造的 onload/onerror；
再检查 srcdoc iframe 内部是否才是真正的验证码宿主。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\cuamoufox")
sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\diag_img.json"

ARM = r"""
(function(){
  if (window.__i) return 'already';
  var L = window.__i = {imgs: [], err: [], cvp: null, inst: null, btoa: []};
  // 记录所有 Image 构造与加载结果
  try {
    var _Img = window.Image;
    window.Image = function(w, h){
      var im = new _Img(w, h);
      var rec = {src: null, ok: null};
      L.imgs.push(rec);
      try{
        var d = Object.getOwnPropertyDescriptor(_Img.prototype, 'src');
        Object.defineProperty(im, 'src', {
          set: function(v){ rec.src = String(v).slice(-60); d.set.call(im, v); },
          get: function(){ return d.get.call(im); },
          configurable: true
        });
      }catch(e){}
      im.addEventListener('load', function(){ rec.ok = 'load ' + im.naturalWidth + 'x' + im.naturalHeight; });
      im.addEventListener('error', function(){ rec.ok = 'error'; });
      return im;
    };
    window.Image.prototype = _Img.prototype;
  } catch(e){}
  // btoa 出口
  var _b = window.btoa;
  window.btoa = function(s){
    var out = _b.apply(this, arguments);
    try { if (typeof out === 'string' && out.length > 200) L.btoa.push({len: out.length, head: out.slice(0, 12)}); } catch(e){}
    return out;
  };
  return 'armed';
})()
"""

INIT = r"""
(function(){
  try {
    var el = document.getElementById('captcha-element');
    el.style.cssText = 'position:relative;display:block;width:360px;height:44px;left:auto;top:auto;transform:none;margin:40px auto;';
    window.initAliyunCaptcha({
      SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
      captchaVerifyCallback: function(p){ window.__i.cvp = String(p); return Promise.resolve({captchaResult:true,bizResult:false}); },
      onBizResultCallback: function(){},
      getInstance: function(inst){ window.__i.inst = typeof inst; },
      slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5
    });
    return 'init-called';
  } catch(e) { return 'init-err:' + (e && e.message); }
})()
"""

READ = r"""
JSON.stringify({
  imgs: window.__i.imgs.slice(-8),
  domImgs: [].slice.call(document.querySelectorAll('img')).map(function(i){
     return {src: (i.src||'').split('/').pop(), nw: i.naturalWidth, complete: i.complete, w: Math.round(i.width)}; }),
  iframes: [].slice.call(document.querySelectorAll('iframe')).map(function(f){
     var out = {src: (f.src||'srcdoc').slice(0,50), w: Math.round(f.getBoundingClientRect().width)};
     try { var d = f.contentDocument;
       out.innerLen = d ? d.documentElement.innerHTML.length : -1;
       out.kids = d ? d.body.children.length : -1;
       out.inner = d ? d.body.innerHTML.slice(0,200) : null;
     } catch(e){ out.err = e.message; }
     return out; }),
  elKids: document.getElementById('captcha-element').childNodes.length,
  inst: window.__i.inst, cvpLen: (window.__i.cvp||'').length,
  btoa: window.__i.btoa.slice(-5)
})
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6215)
    dbg.launch(URL, wait_page=10)
    out = {}
    try:
        for i in range(6):
            try:
                dbg.enable("aliVal")
                break
            except Exception as e:
                print("[enable retry %d] %s" % (i, str(e)[:50]))
                time.sleep(3)
        print("[arm]", ev(dbg, ARM))
        print("[init]", ev(dbg, INIT, timeout=60))
        for i in range(8):
            time.sleep(2)
            raw = ev(dbg, READ)
            print("[t+%ds]" % (2 * (i + 1)), str(raw)[:1500])
            out["t%d" % i] = raw
    finally:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT)
        dbg.close()


if __name__ == "__main__":
    main()
