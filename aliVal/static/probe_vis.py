"""探针：可见性 / rAF 是否在跑 / 验证码图片是否真的加载成功（resource timing）。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\probe_vis.json"

PROBE = r"""
(function(){
  var el = document.getElementById('captcha-element');
  var out = {
    vis: document.visibilityState, hidden: document.hidden, focus: document.hasFocus(),
    innerW: innerWidth, innerH: innerHeight,
    screenX: window.screenX, screenY: window.screenY,
    outerW: outerWidth, outerH: outerHeight,
    elRect: (function(){var r=el.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(),
    hasIO: typeof IntersectionObserver,
    hasRO: typeof ResizeObserver,
    res: []
  };
  try {
    out.res = performance.getEntriesByType('resource')
      .filter(function(e){ return /captcha|aliyuncs|feilin|alicdn/i.test(e.name); })
      .map(function(e){
        return {n: e.name.split('/').pop().slice(0,60), dur: Math.round(e.duration),
                size: e.transferSize, status: e.responseStatus || null, init: e.initiatorType};
      });
  } catch(e){}
  window.__raf = 0;
  var f = function(){ window.__raf++; requestAnimationFrame(f); };
  try { requestAnimationFrame(f); } catch(e){}
  return JSON.stringify(out);
})()
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6213)
    dbg.launch(URL, wait_page=10)
    try:
        for i in range(6):
            try:
                dbg.enable("aliVal")
                break
            except Exception as e:
                print("[enable retry %d] %s" % (i, str(e)[:50]))
                time.sleep(3)
        d = json.loads(ev(dbg, PROBE) or "{}")
        print("[probe]", json.dumps(d, ensure_ascii=False, indent=1)[:2200])
        time.sleep(2)
        print("[raf-after-2s]", ev(dbg, "window.__raf"))
        time.sleep(2)
        print("[raf-after-4s]", ev(dbg, "window.__raf"))
        # 直接把图片拉一次，看是否 200
        print("[img-status]", ev(dbg, r"""
        (function(){
          var urls = performance.getEntriesByType('resource').map(function(e){return e.name;})
                     .filter(function(u){return /static-captcha/.test(u);});
          if (!urls.length) return 'no-urls';
          return new Promise(function(res){
            fetch(urls[0], {cache:'no-store'}).then(function(r){ res(urls[0].split('/').pop()+' -> '+r.status); })
              .catch(function(e){ res('fetch-err:'+e.message); });
          });
        })()""", timeout=40))
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
