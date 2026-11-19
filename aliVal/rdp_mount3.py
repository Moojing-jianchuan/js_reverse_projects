"""v3：mount 已通（滑块 100x100 渲染成功）。本次修正拖拽筛选、等图片加载、抓完立即保存。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, RdpError

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\cvp_v5.json"

HOOK = r"""
(function(){
  if (window.__h5) return 'already';
  window.__h5 = 1;
  window.__bt = []; window.__nlog = []; window.__devcfg = null; window.__cvp = null; window.__init = null;
  var _btoa = window.btoa;
  window.btoa = function(s){
    var out = _btoa.apply(this, arguments);
    try { if (typeof out === 'string' && out.length > 200)
            window.__bt.push({len: out.length, head: out.slice(0, 4), v: out}); } catch(e){}
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
          if (j && j.CertifyId) window.__init = {certifyId:j.CertifyId, image:j.Image, puzzle:j.PuzzleImage, staticPath:j.StaticPath};
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
    inst.init();
    return 'built';
  } catch(e) { return 'err:' + (e && e.message); }
})()
"""

IMGSTATE = r"""
JSON.stringify([].slice.call(document.querySelectorAll('#captcha-element img')).map(function(i){
  return {id:i.id, complete:i.complete, w:i.naturalWidth, h:i.naturalHeight, hidden:i.hidden, src:String(i.src).slice(0,70)};
}))
"""

DRAG = r"""
(function(){
  var knob = null, info = [];
  [].slice.call(document.querySelectorAll('#captcha-element [id*=slider],#captcha-element [class*=slider]')).forEach(function(e){
    var r = e.getBoundingClientRect();
    info.push({id:e.id||'', cls:String(e.className).slice(0,30), w:Math.round(r.width), h:Math.round(r.height)});
    if (!knob && r.width >= 30 && r.width <= 130 && r.height >= 25 && r.height <= 130) knob = e;
  });
  if (!knob) return JSON.stringify({ok:false, why:'no-knob', seen:info});
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
                         from:Math.round(x0), to:Math.round(target), span:Math.round(span), seen:info});
})()
"""

SNAP = r"""
JSON.stringify({
  cvp: window.__cvp || null,
  bt: (window.__bt||[]).map(function(b){return {len:b.len, head:b.head, v:b.v};}),
  dev: window.__devcfg || null,
  init: window.__init || null,
  net: (window.__nlog||[]).map(function(r){return {m:r.m,u:String(r.u).slice(0,80),req:(r.req||'').slice(0,400),status:r.status};})
})
"""


def ev(dbg, expr, timeout=45):
    return dbg.evaluate(expr, timeout)


def ev_retry(dbg, expr, tries=4, timeout=45):
    """页面主线程被 FeiLin 初始化占满时，evaluate 会超时；重试到它有反应为止。"""
    last = ""
    for i in range(tries):
        try:
            r = ev(dbg, expr, timeout)
            v = r.get("result")
            if v is not None:
                return v
            last = "none"
        except Exception as e:
            last = str(e)[:60]
        time.sleep(2)
    return "failed:" + last


def save(dbg, path):
    cap = ev(dbg, SNAP, timeout=45).get("result")
    data = json.loads(cap) if isinstance(cap, str) else {}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return data


def main():
    dx = float(sys.argv[1]) if len(sys.argv) > 1 else 200.0
    dbg = FireFoxDebugger(port=6194)
    dbg.launch(URL, wait_page=2)
    try:
        for _ in range(8):
            try:
                dbg.enable("aliVal")
                break
            except RdpError:
                time.sleep(1.5)
        print("[hook]", ev_retry(dbg, HOOK, tries=4))
        for i in range(14):
            time.sleep(2)
            try:
                st = ev(dbg, "JSON.stringify({a:typeof window.AliyunCaptcha, init:!!window.__init, dev:(window.__devcfg||'').length})",
                        timeout=25).get("result")
                d = json.loads(st) if isinstance(st, str) else {}
            except Exception:
                continue
            if d.get("a") == "function" and d.get("init"):
                print("[ready ~%ds] dev=%s" % ((i + 1) * 2, d.get("dev")))
                break

        print("[build]", ev(dbg, BUILD, timeout=60).get("result"))
        for i in range(6):
            time.sleep(1.5)
            im = ev(dbg, IMGSTATE, timeout=25).get("result")
            print("[img t+%.1fs]" % ((i + 1) * 1.5), im)
            try:
                arr = json.loads(im) if isinstance(im, str) else []
            except Exception:
                arr = []
            if arr and all(x.get("w", 0) > 0 for x in arr):
                print("[img ok]")
                break

        ev(dbg, "window.__dx = %f; 'ok'" % dx)
        print("[drag]", ev(dbg, DRAG, timeout=40).get("result"))
        got = None
        for i in range(5):
            time.sleep(1.2)
            d = save(dbg, OUT)
            cvp = d.get("cvp") or ""
            print("[after %.1fs] cvp=%s bt=%s" % ((i + 1) * 1.2, len(cvp),
                                                 [b.get("len") for b in (d.get("bt") or [])]))
            if cvp:
                got = d
                break
        if got:
            print("[cvp head]", (got.get("cvp") or "")[:80])
            print("[bt heads]", [(b.get("len"), b.get("head")) for b in (got.get("bt") or [])])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
