"""诊断 5：SDK 到底有没有执行 initEmbed（往容器插 HTML）。

包 Element.prototype.insertAdjacentHTML / innerHTML setter / Node.insertBefore，
记录目标 id 与 HTML 片段长度，判断 HTML 构建卡在哪。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\diag_html.json"

ARM = r"""
(function(){
  if (window.__d) return 'already';
  var L = window.__d = {iah: [], ih: [], ib: [], cvp: null, inst: null, btoa: []};
  function who(el){
    try { return el ? (el.tagName + '#' + (el.id||'') + '.' + String(el.className||'').slice(0,30)) : 'null'; }
    catch(e){ return '?'; }
  }
  var _iah = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(pos, html){
    try { L.iah.push({t: who(this), pos: pos, len: String(html).length,
                      head: String(html).slice(0, 160).replace(/\s+/g, ' '),
                      stk: (new Error().stack || '').split('\n')[2] || ''}); } catch(e){}
    return _iah.apply(this, arguments);
  };
  var d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (d && d.set){
    Object.defineProperty(Element.prototype, 'innerHTML', {
      set: function(v){
        try { L.ih.push({t: who(this), len: String(v).length, head: String(v).slice(0,120).replace(/\s+/g,' ')}); } catch(e){}
        return d.set.call(this, v);
      },
      get: d.get, configurable: true
    });
  }
  var _ib = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(n, ref){
    try { L.ib.push({parent: who(this), child: who(n), ref: who(ref)}); } catch(e){}
    return _ib.apply(this, arguments);
  };
  var _b = window.btoa;
  window.btoa = function(s){
    var out = _b.apply(this, arguments);
    try { if (typeof out === 'string' && out.length > 150) L.btoa.push({len: out.length, head: out.slice(0,10)}); } catch(e){}
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
      captchaVerifyCallback: function(p){ window.__d.cvp = String(p); return Promise.resolve({captchaResult:true,bizResult:false}); },
      onBizResultCallback: function(){},
      getInstance: function(inst){ window.__d.inst = typeof inst; },
      slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5
    });
    return 'init-called';
  } catch(e) { return 'init-err:' + (e && e.message); }
})()
"""

READ = r"""
JSON.stringify({
  iah: (window.__d.iah||[]).slice(-6),
  ih: (window.__d.ih||[]).slice(-6),
  ib: (window.__d.ib||[]).slice(-8),
  btoa: (window.__d.btoa||[]).slice(-4),
  elKids: document.getElementById('captcha-element').childNodes.length,
  inst: window.__d.inst, cvpLen: (window.__d.cvp||'').length,
  capIds: [].slice.call(document.querySelectorAll('[id^=aliyunCaptcha]')).map(function(e){
     var b=e.getBoundingClientRect();
     return e.id+'['+Math.round(b.width)+'x'+Math.round(b.height)+']';})
})
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6216)
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
        for i in range(6):
            time.sleep(2)
            raw = ev(dbg, READ)
            print("[t+%ds]" % (2 * (i + 1)), str(raw)[:1600])
            out["t%d" % i] = raw
    finally:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT)
        dbg.close()


if __name__ == "__main__":
    main()
