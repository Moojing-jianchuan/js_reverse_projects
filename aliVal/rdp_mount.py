"""耐心等页面自己 mount 滑块（dynamicJS 是惰性加载，之前观察窗口太短），
mount 后 hook btoa/XHR 并模拟拖拽，一次性抓 cvp + T + device_config。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, RdpError

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\cvp_v3.json"

HOOK = r"""
(function(){
  if (window.__hooked_v3) return 'already';
  window.__hooked_v3 = 1;
  window.__bt = []; window.__nlog = []; window.__devcfg = null;
  var _btoa = window.btoa;
  window.btoa = function(s){
    var out = _btoa.apply(this, arguments);
    try { if (typeof out === 'string' && out.length > 200) {
            window.__bt.push({len: out.length, head: out.slice(0, 6), v: out}); } } catch(e){}
    return out;
  };
  var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){ try{this.__m=m;this.__u=String(u);}catch(e){}; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var s = this;
    try {
      var rec = {m:this.__m, u:this.__u, req:String(b==null?'':b), status:null, resp:null};
      window.__nlog.push(rec);
      this.addEventListener('load', function(){
        try { rec.status = s.status; rec.resp = s.responseText || '';
              if (/captcha-open|cloudauth-device/.test(rec.u)) {
                var j = JSON.parse(rec.resp);
                if (j && j.ResultObject && j.ResultObject.DeviceConfig) window.__devcfg = j.ResultObject.DeviceConfig;
              }
        } catch(e){}
      });
    } catch(e){}
    return _send.apply(this, arguments);
  };
  if (window.jQuery && jQuery.ajax) {
    var _ajax = jQuery.ajax;
    jQuery.ajax = function(opts){
      try { window.__nlog.push({m:'jq', u:(opts&&opts.url)||'', req:JSON.stringify(opts&&opts.data||{}).slice(0,3000)}); } catch(e){}
      return _ajax.apply(this, arguments);
    };
  }
  return 'hooked';
})()
"""

STATE = r"""
JSON.stringify({
  aliyun: typeof window.AliyunCaptcha,
  elLen: document.getElementById('captcha-element').innerHTML.length,
  elSize: (function(){var e=document.getElementById('captcha-element');var r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})(),
  cvpLen: (window.__cvp||'').length,
  bt: (window.__bt||[]).length,
  devcfg: (window.__devcfg||'').length,
  knobs: [].slice.call(document.querySelectorAll('[class*=slider],[class*=slide],[id*=slider],[id*=slide]')).map(function(e){
    var r=e.getBoundingClientRect();
    return {id:e.id||'', cls:String(e.className).slice(0,40), w:Math.round(r.width), h:Math.round(r.height), x:Math.round(r.x), y:Math.round(r.y)};
  }).filter(function(o){return o.w>15 && o.h>15;}).slice(0,8)
})
"""

DRAG = r"""
(function(){
  var cands = [].slice.call(document.querySelectorAll('[class*=slider],[class*=slide],[id*=slider],[id*=slide]'))
    .filter(function(e){var r=e.getBoundingClientRect();return r.width>20 && r.width<120 && r.height>20 && r.height<80;});
  var knob = cands[0];
  if (!knob) return JSON.stringify({ok:false, why:'no-knob', n:cands.length});
  var r = knob.getBoundingClientRect();
  var x0 = r.x + r.width/2, y0 = r.y + r.height/2;
  var dx = window.__dx || 200, target = x0 + dx;
  function fire(type, x, y){
    var o = {bubbles:true, cancelable:true, clientX:x, clientY:y, view:window,
             buttons: type==='mouseup'?0:1, button:0, pointerId:1, pointerType:'mouse', isPrimary:true};
    try { knob.dispatchEvent(new PointerEvent(type.replace('mouse','pointer'), o)); } catch(e){}
    knob.dispatchEvent(new MouseEvent(type, o));
    try { document.dispatchEvent(new PointerEvent(type.replace('mouse','pointer'), o)); } catch(e){}
    document.dispatchEvent(new MouseEvent(type, o));
  }
  fire('mousedown', x0, y0);
  var steps = 30, span = target - x0;
  for (var i=1;i<=steps;i++){
    var t = i/steps;
    fire('mousemove', x0 + span*t + (i%3)*0.8, y0 + Math.sin(t*5)*1.2);
  }
  fire('mouseup', target, y0);
  return JSON.stringify({ok:true, knob:{id:knob.id, cls:String(knob.className).slice(0,50),
                         x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width)}, dx:dx});
})()
"""


def ev(dbg, expr, timeout=40):
    return dbg.evaluate(expr, timeout)


def main():
    dx = float(sys.argv[1]) if len(sys.argv) > 1 else 200.0
    dbg = FireFoxDebugger(port=6190)
    dbg.launch(URL, wait_page=6)
    try:
        for _ in range(6):
            try:
                dbg.enable("aliVal")
                break
            except RdpError:
                time.sleep(2)
        print("[hook]", ev(dbg, HOOK).get("result"))

        mounted = None
        for i in range(20):
            time.sleep(2)
            try:
                st = ev(dbg, STATE, timeout=30).get("result")
            except Exception as e:
                print("[t+%ds] busy %s" % ((i + 1) * 2, str(e)[:40]))
                continue
            d = json.loads(st) if isinstance(st, str) else {}
            print("[t+%ds] aliyun=%s el=%s size=%s knobs=%d cvp=%s bt=%s dev=%s" %
                  ((i + 1) * 2, d.get("aliyun"), d.get("elLen"), d.get("elSize"),
                   len(d.get("knobs") or []), d.get("cvpLen"), d.get("bt"), d.get("devcfg")))
            if d.get("knobs"):
                mounted = d
                break
        if not mounted:
            print("[no mount] 40s 内没出现滑块")
            return
        print("[knobs]", json.dumps(mounted["knobs"], ensure_ascii=False)[:400])

        ev(dbg, "window.__dx = %f; 'ok'" % dx)
        print("[drag]", ev(dbg, DRAG).get("result"))
        for i in range(6):
            time.sleep(2)
            try:
                st = ev(dbg, STATE, timeout=30).get("result")
            except Exception:
                continue
            d = json.loads(st) if isinstance(st, str) else {}
            print("[after %ds] cvp=%s bt=%s dev=%s" % ((i + 1) * 2, d.get("cvpLen"),
                                                       d.get("bt"), d.get("devcfg")))
            if d.get("cvpLen") or d.get("bt"):
                break

        cap = ev(dbg, "JSON.stringify({cvp: window.__cvp||'', "
                      "bt: (window.__bt||[]).map(function(b){return {len:b.len, head:b.head, v:b.v};}),"
                      "dev: window.__devcfg||'', net: (window.__nlog||[]).map(function(r){return {m:r.m,u:String(r.u).slice(0,90),req:(r.req||'').slice(0,200)}})})",
                 timeout=40).get("result")
        data = json.loads(cap) if isinstance(cap, str) else {}
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT, "| cvp:", len(data.get("cvp") or ""),
              "| bt:", len(data.get("bt") or []), "| dev:", len(data.get("dev") or ""))
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
