"""await initAliyunCaptcha，直接看它成功还是失败，以及发了哪些请求。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

HOOK = r"""
(function(){
  if (window.__net) return 'already';
  window.__net = [];
  var _f = window.fetch;
  window.fetch = function(input, init){
    try {
      var u = typeof input === 'string' ? input : (input && input.url);
      if (!/^data:/.test(String(u))) window.__net.push({t:'fetch', m:(init&&init.method)||'GET', u:String(u)});
    } catch(e){}
    return _f.apply(this, arguments);
  };
  var _o = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){ try{ window.__net.push({t:'xhr', m:m, u:String(u)}); }catch(e){}; return _o.apply(this, arguments); };
  return 'hooked';
})()
"""

INIT_AWAIT = r"""
(async function(){
  try {
    if (typeof window.initAliyunCaptcha !== 'function') return 'no-fn';
    var cfg = {
      SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
      captchaVerifyCallback: function(p){ window.__cvp = String(p); return Promise.resolve({captchaResult:true, bizResult:true}); },
      onBizResultCallback: function(){ return null; },
      getInstance: function(inst){ window.__capInst = inst; },
      slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5
    };
    var r = window.initAliyunCaptcha(cfg);
    var v = (r && typeof r.then === 'function') ? await r : r;
    return 'resolved:' + String(v).slice(0, 120);
  } catch (e) {
    return 'rejected:' + String((e && (e.message || e.errorMessage)) || e).slice(0, 300);
  }
})()
"""

STATE = r"""
JSON.stringify({
  inst: typeof window.__capInst,
  instKeys: window.__capInst ? Object.keys(window.__capInst).slice(0, 40) : null,
  protoKeys: window.__capInst ? Object.getOwnPropertyNames(Object.getPrototypeOf(window.__capInst)).slice(0, 40) : null,
  elLen: document.getElementById('captcha-element').innerHTML.length,
  elSize: (function(){var r=document.getElementById('captcha-element').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})(),
  net: (window.__net||[]).slice(0, 15)
})
"""


def main():
    dbg = FireFoxDebugger(port=6179)
    dbg.launch(URL, wait_page=6)
    try:
        dbg.enable("aliVal")
        print("[hook]", dbg.evaluate(HOOK).get("result"))
        t0 = time.time()
        r = dbg.evaluate(INIT_AWAIT, timeout=60)
        res = r.get("result")
        txt = res if isinstance(res, str) else json.dumps(res, ensure_ascii=False)
        print("[init]", (txt or "")[:400], "| %.1fs" % (time.time() - t0))
        time.sleep(2)
        st = dbg.evaluate(STATE).get("result")
        print("[state]", (st if isinstance(st, str) else json.dumps(st, ensure_ascii=False))[:1400])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
