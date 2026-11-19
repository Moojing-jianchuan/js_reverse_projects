"""修正版：AliyunCaptcha.js 是把 config 挂在 **prototype** 上再 new 的
    (var e=window.AliyunCaptcha.prototype; e.config=r; e.deviceConfig=ne; new window.AliyunCaptcha)
所以照它的方式挂 prototype.config 再构造。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, RdpError

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

BUILD = r"""
(function(){
  var el = document.getElementById('captcha-element');
  el.style.cssText = 'position:relative;display:block;width:360px;height:44px;';
  window.__cvp = null;
  var cfg = {
    SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
    captchaVerifyCallback: function(p){ window.__cvp = String(p); return Promise.resolve({captchaResult:true, bizResult:true}); },
    onBizResultCallback: function(){ return null; },
    getInstance: function(i){ window.__capInst2 = i; },
    slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5,
    region: 'cn', prefix: '1sfr0c', verifyType: '2.0'
  };
  var P = window.AliyunCaptcha.prototype;
  P.config = cfg;
  P.deviceConfig = window.__devCfgObj || {};
  try {
    var inst = new window.AliyunCaptcha();
    window.__capInst2 = inst;
    var own = Object.keys(inst).slice(0, 40);
    for (var k in P) { if (typeof P[k] === 'function') own.push('proto:' + k); }
    var calls = [];
    ['init','render','mount','start','create','bindEvents','initDom','show'].forEach(function(n){
      if (typeof inst[n] === 'function') { try { inst[n](); calls.push(n + ':ok'); } catch(e) { calls.push(n + ':err:' + e.message); } }
    });
    return JSON.stringify({ok:true, keys:own, calls:calls});
  } catch(e) { return JSON.stringify({ok:false, err:String(e && e.message)}); }
})()
"""

READ = r"""
JSON.stringify({
  elLen: document.getElementById('captcha-element').innerHTML.length,
  elSize: (function(){var r=document.getElementById('captcha-element').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})(),
  html: document.getElementById('captcha-element').innerHTML.slice(0,240),
  cvp: (window.__cvp||'').length,
  all: [].slice.call(document.querySelectorAll('div')).filter(function(e){
      var c=String(e.className||''); return /captcha|slide|puzzle/i.test(c); }).map(function(e){
      var r=e.getBoundingClientRect(); return String(e.className).slice(0,40)+':'+Math.round(r.width)+'x'+Math.round(r.height); }).slice(0,10)
})
"""


def main():
    dbg = FireFoxDebugger(port=6192)
    dbg.launch(URL, wait_page=6)
    try:
        for _ in range(6):
            try:
                dbg.enable("aliVal")
                break
            except RdpError:
                time.sleep(2)
        for i in range(12):
            time.sleep(2)
            try:
                if dbg.evaluate("typeof window.AliyunCaptcha", timeout=25).get("result") == "function":
                    print("[ready] ~%ds" % ((i + 1) * 2))
                    break
            except Exception:
                pass
        print("[build]", dbg.evaluate(BUILD, timeout=60).get("result"))
        for i in range(5):
            time.sleep(2)
            print("[t+%ds]" % ((i + 1) * 2), dbg.evaluate(READ, timeout=30).get("result"))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
