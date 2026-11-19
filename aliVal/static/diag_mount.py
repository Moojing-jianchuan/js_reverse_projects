"""诊断：为什么 #captcha-element 一直 0x0 / innerHTML 空。

纯 RDP，不用 Playwright。分三段：
  A. 页面自身 init 之后，容器与全 DOM 的托管情况
  B. 给容器设尺寸后，是否自动挂载（ResizeObserver / 重排触发）
  C. 只调一次 initAliyunCaptcha（自己的回调），看是否挂载 + 是否产出 cvp
同时 hook XHR/jQuery.ajax，记录 Action=Log1 的 ResultObject.DeviceConfig。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\diag_mount.json"

HOOK = r"""
(function(){
  if (window.__h) return 'already';
  window.__h = {net: [], jq: [], err: [], dev: []};
  // 1) XHR：记录请求 + 解析 DeviceConfig
  var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m,u){ try{this.__m=m;this.__u=String(u);}catch(e){}; return _open.apply(this,arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var s=this, rec={m:this.__m,u:this.__u,len:0,dev:null,certify:null};
    try{ rec.len = String(b==null?'':b).length; }catch(e){}
    window.__h.net.push(rec);
    try{
      this.addEventListener('load', function(){
        try{
          var t = s.responseText || '';
          var j = JSON.parse(t);
          var ro = j && j.ResultObject;
          if (ro && ro.DeviceConfig){ rec.dev = String(ro.DeviceConfig); window.__device_config = rec.dev; window.__h.dev.push(rec.dev); }
          if (j && j.CertifyId) rec.certify = String(j.CertifyId);
        }catch(e){}
      });
    }catch(e){}
    return _send.apply(this,arguments);
  };
  // 2) jQuery.ajax（页面 captchaVerifyCallback 用它提交）
  var wrapJq = function(){
    if (!window.jQuery || !window.jQuery.ajax || window.jQuery.ajax.__w) return false;
    var _aj = window.jQuery.ajax;
    var w = function(o){
      try{
        var d = o && o.data;
        if (d && typeof d === 'object' && d.captchaVerifyParam){
          window.__h.jq.push(d.captchaVerifyParam); window.__cvp = d.captchaVerifyParam;
        }
      }catch(e){}
      return _aj.apply(window.jQuery, arguments);
    };
    w.__w = 1;
    window.jQuery.ajax = w;
    return true;
  };
  window.__wrapJq = wrapJq; wrapJq();
  // 3) 全局错误
  window.addEventListener('error', function(e){ try{ window.__h.err.push(String(e.message)+' @'+String(e.filename)); }catch(_){} });
  return 'hooked';
})()
"""

DIAG = r"""
(function(){
  var o = {};
  var el = document.getElementById('captcha-element');
  var cs = el ? getComputedStyle(el) : {};
  var r = el ? el.getBoundingClientRect() : {};
  o.el = el ? {
    html: el.innerHTML.slice(0,300),
    childNodes: el.childNodes.length,
    shadow: el.shadowRoot ? 'open' : 'none',
    w: Math.round(r.width), h: Math.round(r.height),
    display: cs.display, position: cs.position, visibility: cs.visibility, opacity: cs.opacity,
    overflow: cs.overflow, transform: cs.transform, zIndex: cs.zIndex,
    attrs: [].slice.call(el.attributes).map(function(a){return a.name+'='+a.value;})
  } : 'missing';
  o.readyState = document.readyState;
  o.bodyKids = [].slice.call(document.body.children).map(function(e){
    var b = e.getBoundingClientRect();
    return e.tagName+'#'+(e.id||'')+'.'+String(e.className||'').slice(0,40)+' ['+Math.round(b.width)+'x'+Math.round(b.height)+']';
  });
  o.captchaish = [].slice.call(document.querySelectorAll('*')).filter(function(e){
    var s = (e.id||'') + ' ' + String(e.className||'') + ' ' + e.tagName;
    return /captcha|aliyun|slide|feilin|puzzle/i.test(s);
  }).slice(0,40).map(function(e){
    var b=e.getBoundingClientRect();
    return e.tagName+'#'+(e.id||'')+'.'+String(e.className||'').slice(0,40)+' ['+Math.round(b.width)+'x'+Math.round(b.height)+']';
  });
  o.styles = [].slice.call(document.querySelectorAll('style')).map(function(s){return (s.textContent||'').length;}).slice(0,20);
  o.styleLinks = [].slice.call(document.querySelectorAll('link[rel=stylesheet]')).map(function(l){return l.href.split('/').pop();});
  o.iframes = [].slice.call(document.querySelectorAll('iframe')).map(function(f){
    var b=f.getBoundingClientRect();
    return (f.src||'srcdoc').slice(0,80)+' ['+Math.round(b.width)+'x'+Math.round(b.height)+']';
  });
  o.inst = typeof window.captcha;
  o.utils = window.__ALIYUN_CAPTCHA_UTILS ? Object.keys(window.__ALIYUN_CAPTCHA_UTILS) : null;
  o.gv = Object.keys(window).filter(function(k){return /captcha|aliyun|feilin|_FN|z_um/i.test(k);});
  o.net = (window.__h && window.__h.net || []).map(function(n){return n.m+' '+String(n.u).slice(0,60)+' len='+n.len+' dev='+(n.dev?n.dev.length:0);});
  o.devN = (window.__h && window.__h.dev || []).length;
  o.jq = (window.__h && window.__h.jq || []).length;
  o.cvpLen = (window.__cvp||'').length;
  o.err = (window.__h && window.__h.err || []).slice(0,10);
  return JSON.stringify(o);
})()
"""

SIZE = r"""
(function(){
  var el = document.getElementById('captcha-element');
  el.style.cssText = 'position:relative;display:block;width:360px;height:44px;min-height:44px;'
                   + 'left:auto;top:auto;transform:none;margin:40px auto;';
  el.setAttribute('data-force-size','1');
  var r = el.getBoundingClientRect();
  return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)});
})()
"""

INIT = r"""
(function(){
  try {
    window.__initAt = Date.now();
    window.initAliyunCaptcha({
      SceneId: 'vollz84f', mode: 'embed', element: '#captcha-element', button: '#button',
      captchaVerifyCallback: function(p){
        window.__cvp = String(p);
        window.__cvpAt = Date.now();
        try { window.__h.jq.push('CB:'+window.__cvp); } catch(e){}
        return Promise.resolve({captchaResult: true, bizResult: false});
      },
      onBizResultCallback: function(b){ window.__biz = b; },
      getInstance: function(inst){ window.__capInst = inst; window.__instAt = Date.now(); },
      slideStyle: { width: 360, height: 40 }, language: 'cn', immediate: true, rem: 2.5
    });
    return 'init-called';
  } catch(e) { return 'init-err:' + (e && e.message); }
})()
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def idle(dbg, tries=12):
    for i in range(tries):
        try:
            r = dbg.evaluate("1+1", timeout=20)
            if r.get("result") == 2:
                return i
        except Exception as e:
            print("[busy %d] %s" % (i, str(e)[:60]))
        time.sleep(2)
    return -1


def dump(dbg, tag):
    raw = ev(dbg, DIAG)
    print("[%s] %s" % (tag, str(raw)[:2600]))
    try:
        return json.loads(raw)
    except Exception:
        return {}


def main():
    port = 6211
    dbg = FireFoxDebugger(port=port)
    dbg.launch(URL, wait_page=10)
    out = {"port": port}
    try:
        print("[enable]", json.dumps(dbg.enable("aliVal"), ensure_ascii=False)[:160])
        print("[idle-at]", idle(dbg))
        print("[hook]", ev(dbg, HOOK))
        out["A"] = dump(dbg, "A-page-init")

        print("[size]", ev(dbg, SIZE))
        time.sleep(3)
        out["B"] = dump(dbg, "B-after-size")

        empty = (out["B"].get("el") or {}).get("childNodes", 0) == 0 if isinstance(out["B"].get("el"), dict) else True
        if empty:
            print("[init]", ev(dbg, INIT, timeout=60))
            for i in range(6):
                time.sleep(2)
                d = dump(dbg, "C+%ds" % ((i + 1) * 2))
                out["C%d" % i] = d
                if d.get("cvpLen"):
                    break
        else:
            print("[skip init] container already has children")

        out["net"] = ev(dbg, "JSON.stringify(window.__h.net||[])")
        out["dev"] = ev(dbg, "JSON.stringify(window.__h.dev||[])")
    finally:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT)
        dbg.close()


if __name__ == "__main__":
    main()
