"""抓到 data 的生成调用栈：包 window.btoa，命中 25 13 27 时记录 Error().stack 与入参。

不用断点（console eval 的帧在 debuggee 里看不到），直接用 Error().stack 定位生成者。
复用 rdp_get_cvp.py 的「独立 profile + network.proxy.type=0」方案。
"""
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")

PROFILE = r"D:\ds_work\js_reverse_projects\aliVal\static\profile_noproxy"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\data_stack.json"
URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

USERJS = """user_pref("network.proxy.type", 0);
user_pref("network.proxy.http", "");
user_pref("network.proxy.ssl", "");
user_pref("network.proxy.socks", "");
user_pref("network.proxy.no_proxies_on", "*");
"""

HOOK = r"""
(function(){
  if (window.__ds) return 'already';
  window.__ds = {hits: [], drag: null, cvpLen: 0};
  var _b = window.btoa;
  window.btoa = function(s){
    try {
      var str = String(s);
      if (str.length > 200 && str.charCodeAt(0) === 0x25 && str.charCodeAt(1) === 0x13
          && str.charCodeAt(2) === 0x27) {
        window.__ds.hits.push({len: str.length, b64len: 0,
                               stack: String(new Error().stack || ''),
                               raw: str});
      }
    } catch(e){}
    var out = _b.apply(this, arguments);
    try { if (window.__ds.hits.length) {
            var h = window.__ds.hits[window.__ds.hits.length-1];
            if (!h.b64len) { h.b64len = out.length; h.b64 = out; } } } catch(e){}
    return out;
  };
  // 拿到页面自己的实例后替换回调（不 resolve，避免业务跳转/alert）
  var tries = 0;
  var t = setInterval(function(){
    tries++;
    try {
      var inst = window.captcha || (window.AliyunCaptcha && window.AliyunCaptcha.prototype && window.AliyunCaptcha.prototype.config
                 ? null : null);
      var cfg = window.AliyunCaptcha && window.AliyunCaptcha.prototype && window.AliyunCaptcha.prototype.config;
      var target = inst || cfg;
      if (target && !window.__ds.armed) {
        var keep = function(p){ window.__ds.cvpLen = String(p).length; return new Promise(function(){}); };
        if (inst) { inst.captchaVerifyCallback = keep; window.__ds.armed = 'inst'; }
        else { cfg.captchaVerifyCallback = keep; window.__ds.armed = 'cfg'; }
        clearInterval(t);
      }
    } catch(e){}
    if (tries > 60) clearInterval(t);
  }, 500);
  return 'hooked';
})()
"""

DRAG = r"""
(function(dist){
  var knob = document.querySelector('#aliyunCaptcha-sliding-slider');
  if (!knob) return JSON.stringify({ok:false, why:'no-knob'});
  var r = knob.getBoundingClientRect();
  var sx = r.x + r.width/2, sy = r.y + r.height/2;
  window.__ds.drag = {sx: sx, sy: sy, dist: dist, fired: 0};
  function fire(type, x, y){
    var o = {bubbles:true, cancelable:true, clientX:x, clientY:y, view:window,
             buttons: type==='mouseup'?0:1, button:0, pointerId:1, pointerType:'mouse', isPrimary:true};
    try { knob.dispatchEvent(new PointerEvent(type.replace('mouse','pointer'), o)); } catch(e){}
    knob.dispatchEvent(new MouseEvent(type, o));
    try { document.dispatchEvent(new PointerEvent(type.replace('mouse','pointer'), o)); } catch(e){}
    document.dispatchEvent(new MouseEvent(type, o));
    window.__ds.drag.fired++;
  }
  fire('mousedown', sx, sy);
  var steps = 24;
  for (var i=1;i<=steps;i++){
    var t = i/steps;
    fire('mousemove', sx + dist*t + (i%3)*0.6, sy + Math.sin(t*4)*1.2);
  }
  fire('mouseup', sx + dist, sy);
  return JSON.stringify({ok:true, sx:Math.round(sx), sy:Math.round(sy), dist:dist, fired:window.__ds.drag.fired});
})(__DIST__)
"""

READ = r"""
JSON.stringify({
  armed: window.__ds ? window.__ds.armed : null,
  hits: window.__ds ? window.__ds.hits.map(function(h){
      return {len:h.len, b64len:h.b64len, stack:(h.stack||'').split('\n').slice(0,14), b64:(h.b64||'').slice(0,40)}; }) : [],
  cvpLen: window.__ds ? window.__ds.cvpLen : 0,
  drag: window.__ds ? window.__ds.drag : null,
  inst: typeof window.captcha
})
"""


def ev(dbg, expr, timeout=45):
    return dbg.evaluate(expr, timeout)


def enable_retry(dbg, tries=10, gap=2.0):
    for _ in range(tries):
        try:
            return dbg.enable("aliVal")
        except Exception:
            time.sleep(gap)
    return None


def main():
    from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger
    os.makedirs(PROFILE, exist_ok=True)
    with open(os.path.join(PROFILE, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)
    tempfile.mkdtemp = lambda *a, **k: PROFILE

    dbg = FireFoxDebugger(port=6201)
    dbg.launch(URL, wait_page=10)
    try:
        print("[enable]", bool(enable_retry(dbg)))
        print("[hook]", ev(dbg, HOOK, timeout=60).get("result"))
        # 等实例武装
        for i in range(12):
            time.sleep(3)
            st = ev(dbg, "JSON.stringify({armed: window.__ds&&window.__ds.armed, inst: typeof window.captcha})", timeout=30).get("result")
            print("[arm t+%ds]" % ((i + 1) * 3), st)
            if st and '"armed":"' in st and '"armed":null' not in st:
                break
        print("[drag]", ev(dbg, DRAG.replace("__DIST__", "500"), timeout=45).get("result"))
        for i in range(8):
            time.sleep(2)
            r = ev(dbg, READ, timeout=40).get("result")
            d = json.loads(r) if isinstance(r, str) else {}
            print("[t+%ds] hits=%d cvp=%s" % ((i + 1) * 2, len(d.get("hits") or []), d.get("cvpLen")))
            if d.get("hits"):
                with open(OUT, "w", encoding="utf-8") as f:
                    json.dump(d, f, ensure_ascii=False, indent=1)
                print("[saved]", OUT)
                h = d["hits"][0]
                print("[hit] len=%s b64len=%s" % (h.get("len"), h.get("b64len")))
                print("[stack]")
                for line in (h.get("stack") or [])[:14]:
                    print("    ", line[:160])
                break
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
