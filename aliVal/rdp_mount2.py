"""完整链路：等 window.AliyunCaptcha 就绪 → 用页面自己的 InitCaptcha 结果补全 config
→ 挂 prototype.config → new + init → 拖拽 → 抓 captchaVerifyParam 与同轮 btoa(T)。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, RdpError

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\cvp_v4.json"

HOOK = r"""
(function(){
  if (window.__h4) return 'already';
  window.__h4 = 1;
  window.__bt = []; window.__nlog = []; window.__devcfg = null; window.__cvp = null;
  var _btoa = window.btoa;
  window.btoa = function(s){
    var out = _btoa.apply(this, arguments);
    try { if (typeof out === 'string' && out.length > 200) window.__bt.push(out); } catch(e){}
    return out;
  };
  var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m,u){ try{this.__m=m;this.__u=String(u);}catch(e){}; return _open.apply(this,arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var s = this;
    try {
      var rec = {m:this.__m, u:this.__u, req:String(b==null?'':b), status:null, resp:''};
      window.__nlog.push(rec);
      this.addEventListener('load', function(){
        try { rec.status = s.status; rec.resp = s.responseText || '';
          var j = JSON.parse(rec.resp);
          if (j && j.ResultObject && j.ResultObject.DeviceConfig) window.__devcfg = j.ResultObject.DeviceConfig;
          if (j && j.CertifyId) window.__init = {certifyId:j.CertifyId, image:j.Image, puzzle:j.PuzzleImage, staticPath:j.StaticPath, type:j.CaptchaType};
        } catch(e){}
      });
    } catch(e){}
    return _send.apply(this, arguments);
  };
  return 'hooked';
})()
"""

BUILD = r"""
(function(){
  var el = document.getElementById('captcha-element');
  el.style.cssText = 'position:relative;display:block;width:360px;height:44px;';
  var init = window.__init || {};
  var base = 'https://static-captcha.aliyuncs.com/';
  var cfg = {
    SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
    captchaVerifyCallback: function(p){ window.__cvp = String(p); return Promise.resolve({captchaResult:true, bizResult:true}); },
    onBizResultCallback: function(){ return null; },
    getInstance: function(i){ window.__capInst2 = i; },
    slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5,
    region: 'cn', prefix: '1sfr0c', verifyType: '2.0',
    Image: init.image ? base + init.image : undefined,
    PuzzleImage: init.puzzle ? base + init.puzzle : undefined,
    certifyId: init.certifyId
  };
  var P = window.AliyunCaptcha.prototype;
  P.config = cfg;
  P.deviceConfig = window.__devCfgObj || {};
  try {
    var inst = new window.AliyunCaptcha();
    window.__capInst2 = inst;
    var calls = [];
    ['init','bindEvents','show'].forEach(function(n){
      if (typeof inst[n] === 'function') { try { inst[n](); calls.push(n + ':ok'); } catch(e) { calls.push(n + ':err:' + e.message); } }
    });
    return JSON.stringify({ok:true, calls:calls, init:init});
  } catch(e) { return JSON.stringify({ok:false, err:String(e && e.message), init:init}); }
})()
"""

READ = r"""
JSON.stringify({
  elLen: document.getElementById('captcha-element').innerHTML.length,
  cvp: (window.__cvp||'').length,
  bt: (window.__bt||[]).map(function(s){return s.length;}),
  imgs: [].slice.call(document.querySelectorAll('#captcha-element img')).map(function(i){
      return {id:i.id, w:i.naturalWidth, h:i.naturalHeight, src:String(i.src).slice(0,60), hidden:i.hidden}; }),
  knobs: [].slice.call(document.querySelectorAll('#captcha-element [class*=slider],#captcha-element [id*=slider]'))
      .map(function(e){var r=e.getBoundingClientRect();
        return {id:e.id||'', cls:String(e.className).slice(0,30), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)};})
      .filter(function(o){return o.w>10 && o.h>10;})
})
"""

DRAG = r"""
(function(){
  var knob = null;
  [].slice.call(document.querySelectorAll('#captcha-element [class*=slider],#captcha-element [id*=slider]')).forEach(function(e){
    var r = e.getBoundingClientRect();
    if (r.width > 30 && r.width < 120 && r.height > 30 && r.height < 80 && !knob) knob = e;
  });
  if (!knob) return JSON.stringify({ok:false, why:'no-knob'});
  var r = knob.getBoundingClientRect();
  var x0 = r.x + r.width/2, y0 = r.y + r.height/2;
  var target = x0 + (window.__dx || 200);
  function fire(kind, x, y){
    var o = {bubbles:true, cancelable:true, clientX:x, clientY:y, view:window,
             buttons: kind==='mouseup'?0:1, button:0, pointerId:1, pointerType:'mouse', isPrimary:true};
    try { knob.dispatchEvent(new PointerEvent(kind.replace('mouse','pointer'), o)); } catch(e){}
    knob.dispatchEvent(new MouseEvent(kind, o));
    try { document.dispatchEvent(new PointerEvent(kind.replace('mouse','pointer'), o)); } catch(e){}
    document.dispatchEvent(new MouseEvent(kind, o));
  }
  fire('mousedown', x0, y0);
  var steps = 30, span = (target - x0);
  for (var i=1;i<=steps;i++){
    var t=i/steps;
    fire('mousemove', x0 + span*t + (i%3)*0.7, y0 + Math.sin(t*5)*1.1);
  }
  fire('mouseup', target, y0);
  return JSON.stringify({ok:true, knob:{id:knob.id, cls:String(knob.className).slice(0,40)},
                         from:Math.round(x0), to:Math.round(target), dx:Math.round(span)});
})()
"""


def ev(dbg, expr, timeout=45):
    return dbg.evaluate(expr, timeout)


def main():
    dx = float(sys.argv[1]) if len(sys.argv) > 1 else 200.0
    dbg = FireFoxDebugger(port=6193)
    dbg.launch(URL, wait_page=2)
    try:
        for _ in range(8):
            try:
                dbg.enable("aliVal")
                break
            except RdpError:
                time.sleep(1.5)
        print("[hook]", ev(dbg, HOOK).get("result"))

        # 等 AliyunCaptcha 就绪 + InitCaptcha 结果
        for i in range(14):
            time.sleep(2)
            try:
                st = ev(dbg, "JSON.stringify({a: typeof window.AliyunCaptcha, init: window.__init||null, dev:(window.__devcfg||'').length})",
                        timeout=25).get("result")
                d = json.loads(st) if isinstance(st, str) else {}
            except Exception as e:
                print("[t+%ds] busy %s" % ((i + 1) * 2, str(e)[:40]))
                continue
            print("[t+%ds] aliyun=%s init=%s dev=%s" % ((i + 1) * 2, d.get("a"),
                  bool(d.get("init")), d.get("dev")))
            if d.get("a") == "function" and d.get("init"):
                break

        print("[build]", ev(dbg, BUILD, timeout=60).get("result"))
        for i in range(4):
            time.sleep(2)
            print("[render t+%ds]" % ((i + 1) * 2), ev(dbg, READ, timeout=30).get("result"))

        ev(dbg, "window.__dx = %f; 'ok'" % dx)
        print("[drag]", ev(dbg, DRAG, timeout=40).get("result"))
        for i in range(6):
            time.sleep(2)
            r = ev(dbg, READ, timeout=30).get("result")
            d = json.loads(r) if isinstance(r, str) else {}
            print("[after %ds] cvp=%s bt=%s" % ((i + 1) * 2, d.get("cvp"), d.get("bt")))
            if d.get("cvp") or d.get("bt"):
                break

        cap = ev(dbg, "JSON.stringify({cvp: window.__cvp||null, bt: (window.__bt||[]), dev: window.__devcfg||null, init: window.__init||null, "
                      "net: (window.__nlog||[]).map(function(r){return {m:r.m,u:String(r.u).slice(0,80),req:(r.req||'').slice(0,300),status:r.status};})})",
                 timeout=45).get("result")
        data = json.loads(cap) if isinstance(cap, str) else {}
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT)
        print("  cvp:", len(data.get("cvp") or ""), "| btoa:", [len(x) for x in (data.get("bt") or [])],
              "| dev:", len(data.get("dev") or ""), "| init:", (data.get("init") or {}).get("certifyId"))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
