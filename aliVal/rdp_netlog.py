"""记录 XHR 的请求与响应（重点是 InitCaptcha 的返回），定位初始化失败原因。"""
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
  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){
    try { this.__m = m; this.__u = String(u); } catch(e){}
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(b){
    var self = this;
    try {
      var rec = {m: this.__m, u: this.__u, req: String(b == null ? '' : b).slice(0, 300),
                 status: null, resp: null, err: null};
      window.__nlog.push(rec);
      this.addEventListener('load', function(){
        try {
          rec.status = self.status;
          var t = self.responseText || '';
          rec.resp = t.length > 400 ? (t.slice(0, 400) + '...[len ' + t.length + ']') : t;
        } catch(e) { rec.err = String(e); }
      });
      this.addEventListener('error', function(){ rec.err = 'xhr-error'; });
      this.addEventListener('timeout', function(){ rec.err = 'xhr-timeout'; });
    } catch(e){}
    return _send.apply(this, arguments);
  };
  return 'hooked';
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
  instAt: window.__instAt || null,
  cvpLen: (window.__cvp || '').length,
  elLen: document.getElementById('captcha-element').innerHTML.length,
  net: (window.__nlog || []).map(function(r){ return {m:r.m, u:String(r.u).slice(0,90), status:r.status,
      req:r.req.slice(0,120), resp:r.resp, err:r.err}; })
})
"""


def main():
    dbg = FireFoxDebugger(port=6180)
    dbg.launch(URL, wait_page=6)
    try:
        dbg.enable("aliVal")
        print("[hook]", dbg.evaluate(HOOK).get("result"))
        print("[init]", dbg.evaluate(INIT).get("result"))
        for i in range(6):
            time.sleep(2.5)
            st = dbg.evaluate(READ).get("result")
            d = json.loads(st) if isinstance(st, str) else {}
            print("[t=%ds] inst=%s el=%s cvp=%s reqs=%d" % (2 + i * 2, d.get("inst"), d.get("elLen"),
                                                           d.get("cvpLen"), len(d.get("net") or [])))
            if d.get("inst") == "object" or d.get("elLen", 0) > 0:
                break
        with open(r"D:\ds_work\js_reverse_projects\aliVal\config\netlog_init.json", "w", encoding="utf-8") as f:
            f.write(st if isinstance(st, str) else json.dumps(d, ensure_ascii=False, indent=1))
        print("[net]")
        for r in (d.get("net") or []):
            print("   ", r.get("m"), str(r.get("u"))[:70], "status:", r.get("status"),
                  "| req:", str(r.get("req"))[:60], "| resp:", str(r.get("resp"))[:180])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
