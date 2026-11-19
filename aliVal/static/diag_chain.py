"""诊断 3：initAliyunCaptcha 内部链条在哪一步停住。

做法（只调一次 init）：
  - 包 window.FEILIN.initFeiLin，记录入参 deviceConfig、是否回调、回调返回值
  - 包 Document.prototype.createElement / Node.prototype.appendChild，记录 UI 创建
  - 包 Image / XMLHttpRequest.open，记录后续网络
  - 包 __ALIYUN_CAPTCHA_UTILS.throwError / consoleError，抓内部抛错
然后 init 一次，逐秒观察。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\diag_chain.json"

ARM = r"""
(function(){
  if (window.__c) return 'already';
  var L = window.__c = {fe: [], cb: [], dom: [], net: [], err: [], cvp: null, biz: null};
  // FEILIN 设备阶段
  if (window.FEILIN && window.FEILIN.initFeiLin && !window.FEILIN.__w) {
    var _if = window.FEILIN.initFeiLin;
    window.FEILIN.initFeiLin = function(dc, cb){
      L.fe.push({at: Date.now(), dc: typeof dc === 'object' ? Object.keys(dc).join(',') : String(dc).slice(0,120),
                 dcLen: dc && dc.deviceConfig ? String(dc.deviceConfig).length : 0});
      if (typeof cb === 'function'){
        var wrapped = function(){
          try { L.cb.push({at: Date.now(), args: [].slice.call(arguments).map(function(a){
             try { return (a && typeof a === 'object') ? JSON.stringify(a).slice(0,400) : String(a); } catch(e){ return '?'; }
          })}); } catch(e){}
          return cb.apply(this, arguments);
        };
        return _if.call(window.FEILIN, dc, wrapped);
      }
      return _if.apply(window.FEILIN, arguments);
    };
    window.FEILIN.__w = 1;
  }
  // 内部报错
  var U = window.__ALIYUN_CAPTCHA_UTILS;
  if (U){
    ['throwError','consoleError'].forEach(function(k){
      if (typeof U[k] === 'function' && !U[k].__w){
        var o = U[k];
        var w = function(){ try{ L.err.push(k + ':' + [].slice.call(arguments).join('|').slice(0,300)); }catch(e){}; return o.apply(this, arguments); };
        w.__w = 1; U[k] = w;
      }
    });
  }
  // DOM 创建
  var _ce = Document.prototype.createElement;
  Document.prototype.createElement = function(tag){
    try { L.dom.push('+' + tag + ' @' + (new Error().stack || '').split('\n')[2]); } catch(e){}
    return _ce.apply(this, arguments);
  };
  // 网络
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m,u){ try{ L.net.push(m+' '+String(u).slice(0,70)); }catch(e){}; return _open.apply(this,arguments); };
  return 'armed';
})()
"""

INIT = r"""
(function(){
  try {
    window.initAliyunCaptcha({
      SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
      captchaVerifyCallback: function(p){
        window.__c.cvp = String(p); window.__c.cvpAt = Date.now();
        return Promise.resolve({captchaResult: true, bizResult: false});
      },
      onBizResultCallback: function(b){ window.__c.biz = b; },
      getInstance: function(inst){ window.__c.inst = typeof inst; window.__c.instAt = Date.now(); },
      slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5
    });
    return 'init-called';
  } catch(e) { return 'init-err:' + (e && e.message); }
})()
"""

READ = r"""
JSON.stringify({
  fe: window.__c.fe.slice(-4), cb: window.__c.cb.slice(-4),
  dom: window.__c.dom.slice(-12), net: window.__c.net.slice(-8),
  err: window.__c.err.slice(-8),
  inst: window.__c.inst || null, cvpLen: (window.__c.cvp||'').length,
  elKids: document.getElementById('captcha-element').childNodes.length,
  elSize: (function(){var r=document.getElementById('captcha-element').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})()
})
"""

PREP = r"""
(function(){
  var el = document.getElementById('captcha-element');
  el.style.cssText = 'position:relative;display:block;width:360px;height:44px;min-height:44px;'
                   + 'left:auto;top:auto;transform:none;margin:40px auto;';
  var r = el.getBoundingClientRect();
  return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)});
})()
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6214)
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
        print("[prep]", ev(dbg, PREP))
        time.sleep(1)
        print("[init]", ev(dbg, INIT, timeout=60))
        for i in range(10):
            time.sleep(2)
            raw = ev(dbg, READ)
            print("[t+%ds]" % (2 * (i + 1)), str(raw)[:1800])
            try:
                out["t%d" % i] = json.loads(raw)
            except Exception:
                out["t%d" % i] = raw
            d = out["t%d" % i]
            if isinstance(d, dict) and (d.get("cvpLen") or d.get("inst") or d.get("elKids")):
                if d.get("elKids"):
                    break
    finally:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT)
        dbg.close()


if __name__ == "__main__":
    main()
