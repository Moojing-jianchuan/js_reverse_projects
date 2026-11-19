"""等 window.AliyunCaptcha 定义后，直接查它的原型，并尝试手动 new + init 挂载。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, RdpError

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

PROTO = r"""
JSON.stringify({
  type: typeof window.AliyunCaptcha,
  proto: window.AliyunCaptcha ? Object.getOwnPropertyNames(window.AliyunCaptcha.prototype) : null,
  statics: window.AliyunCaptcha ? Object.getOwnPropertyNames(window.AliyunCaptcha) : null,
  ctorLen: window.AliyunCaptcha ? window.AliyunCaptcha.length : null
})
"""

BASIC = r"""
(function(){
  var el = document.getElementById('captcha-element');
  el.style.cssText = 'position:relative;display:block;width:360px;height:44px;';
  window.__cvp = null;
  var cfg = {
    SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
    captchaVerifyCallback: function(p){ window.__cvp = String(p); return Promise.resolve({captchaResult:true, bizResult:true}); },
    onBizResultCallback: function(){ return null; },
    getInstance: function(i){ window.__capInst = i; },
    slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5,
    region: 'cn', prefix: '1sfr0c'
  };
  try {
    var inst = new window.AliyunCaptcha();
    window.__capInst = inst;
    try { inst.config = cfg; } catch(e) {}
    try { inst.init && inst.init(); } catch(e) { return 'init-err:' + e.message; }
    return 'constructed:' + Object.getOwnPropertyNames(Object.getPrototypeOf(inst)).join(',');
  } catch(e) { return 'ctor-err:' + (e && e.message); }
})()
"""

READ = r"""
JSON.stringify({
  elLen: document.getElementById('captcha-element').innerHTML.length,
  elSize: (function(){var r=document.getElementById('captcha-element').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})(),
  html: document.getElementById('captcha-element').innerHTML.slice(0,200),
  knobs: [].slice.call(document.querySelectorAll('[class*=slide],[id*=slide]')).map(function(e){
    var r=e.getBoundingClientRect();
    return {cls:String(e.className).slice(0,40), w:Math.round(r.width), h:Math.round(r.height)};
  }).filter(function(o){return o.w>15&&o.h>15;}).slice(0,6)
})
"""


def main():
    dbg = FireFoxDebugger(port=6191)
    dbg.launch(URL, wait_page=6)
    try:
        for _ in range(6):
            try:
                dbg.enable("aliVal")
                break
            except RdpError:
                time.sleep(2)
        ready = False
        for i in range(12):
            time.sleep(2)
            try:
                r = dbg.evaluate("typeof window.AliyunCaptcha", timeout=25).get("result")
            except Exception:
                continue
            if r == "function":
                ready = True
                print("[ready] aliyun=function at ~%ds" % ((i + 1) * 2))
                break
        if not ready:
            print("[not ready]")
            return
        print("[proto]", dbg.evaluate(PROTO, timeout=30).get("result"))
        print("[construct]", dbg.evaluate(BASIC, timeout=40).get("result"))
        for i in range(5):
            time.sleep(2)
            print("[t+%ds]" % ((i + 1) * 2), dbg.evaluate(READ, timeout=30).get("result"))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
