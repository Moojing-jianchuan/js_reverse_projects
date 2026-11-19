"""诊断 7：完全被动观察页面自身 init 40s，抓全量请求/响应 + SDK 关键全局。

关注：
  window.RMD / CAPTCHA_LANG / __CloseAliyunCaptcha 是否被 SDK 写入
  InitCaptcha 响应全文（是否有 DeviceConfig / PowVerifyString / Question）
  FEILIN.initFeiLin 是否被调用
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\diag_full.json"

ARM = r"""
(function(){
  if (window.__f) return 'already';
  var L = window.__f = {net: [], fe: [], html: [], cvp: null, inst: null, btoa: [], err: []};
  var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m,u){ try{this.__m=m;this.__u=String(u);}catch(e){}; return _open.apply(this,arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var s = this, rec = {m: this.__m, u: this.__u, req: String(b==null?'':b).slice(0,300), status: null, resp: null};
    try { L.net.push(rec); } catch(e){}
    try { this.addEventListener('load', function(){
      try {
        rec.status = s.status;
        var t = s.responseText || '';
        rec.resp = t.length > 1200 ? t.slice(0, 1200) + '...[' + t.length + ']' : t;
      } catch(e){ rec.resp = 'err:' + e.message; }
    }); } catch(e){}
    return _send.apply(this, arguments);
  };
  if (window.FEILIN && window.FEILIN.initFeiLin && !window.FEILIN.__w){
    var _if = window.FEILIN.initFeiLin;
    window.FEILIN.initFeiLin = function(dc, cb){
      try { L.fe.push({dc: dc && Object.keys(dc).join(','), dl: dc && dc.deviceConfig ? String(dc.deviceConfig).length : 0}); } catch(e){}
      if (typeof cb === 'function'){
        return _if.call(window.FEILIN, dc, function(){
          try { L.fe.push({cb: 'called', args: [].slice.call(arguments).map(function(a){ try{return typeof a === 'object' ? JSON.stringify(a).slice(0,200) : String(a);}catch(e){return '?';}})}); } catch(e){}
          return cb.apply(this, arguments);
        });
      }
      return _if.apply(window.FEILIN, arguments);
    };
    window.FEILIN.__w = 1;
  }
  var _iah = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(pos, html){
    try { L.html.push({target: this.id || String(this.className||''), len: String(html).length,
                       head: String(html).slice(0,100).replace(/\s+/g,' ')}); } catch(e){}
    return _iah.apply(this, arguments);
  };
  var _b = window.btoa;
  window.btoa = function(s){
    var o = _b.apply(this, arguments);
    try { if (typeof o === 'string' && o.length > 150) L.btoa.push({len: o.length, head: o.slice(0,10)}); } catch(e){}
    return o;
  };
  return 'armed';
})()
"""

READ = r"""
JSON.stringify({
  RMD: typeof window.RMD === 'undefined' ? 'undef' : window.RMD,
  lang: window.CAPTCHA_LANG || null,
  closeFn: typeof window.__CloseAliyunCaptcha,
  capInstVar: typeof window.captcha,
  fe: window.__f.fe.slice(-3),
  html: window.__f.html.slice(-3),
  btoa: window.__f.btoa.slice(-5),
  elKids: (document.getElementById('captcha-element')||{childNodes:{length:-1}}).childNodes.length,
  capIds: [].slice.call(document.querySelectorAll('[id^=aliyunCaptcha]')).length,
  net: window.__f.net.map(function(n){ return n.m+' '+String(n.u).slice(0,48)+' st='+n.status+' rl='+(n.resp?n.resp.length:0); })
})
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6218)
    dbg.launch(URL, wait_page=8)
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
        for i in range(8):
            time.sleep(5)
            raw = ev(dbg, READ)
            print("[t+%ds]" % (8 + 5 * (i + 1)), str(raw)[:1200])
            out["t%d" % i] = raw
        net = ev(dbg, "JSON.stringify(window.__f.net||[])")
        with open(r"D:\ds_work\js_reverse_projects\aliVal\static\net_full.json", "w", encoding="utf-8") as f:
            f.write(net or "[]")
        print("[net saved] len", len(net or ""))
    finally:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT)
        dbg.close()


if __name__ == "__main__":
    main()
