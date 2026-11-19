"""让验证码真正渲染，并用自带回调截获 captchaVerifyParam（= 加密后的 data）。

做法：用页面同样的完整配置重新 initAliyunCaptcha，把 captchaVerifyCallback 换成
我们自己的函数，这样滑块走完时能直接拿到 FeiLin 生成的密文，且不发业务请求。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\capture_v2.json"

# 1) 用页面同样的配置重新初始化，回调换成我们的探针
REINIT = r"""
(function(){
  window.__cvp = null;
  window.__cvpErr = null;
  try {
    window.initAliyunCaptcha({
      SceneId: 'vollz84f',
      mode: 'embed',
      element: '#captcha-element',
      button: '#button',
      captchaVerifyCallback: function(param){
        try { window.__cvp = String(param); } catch(e){ window.__cvpErr = String(e); }
        return Promise.resolve({captchaResult: true, bizResult: true});
      },
      onBizResultCallback: function(){ return null; },
      getInstance: function(inst){ window.__capInst = inst; },
      slideStyle: { width: 360, height: 40 },
      language: 'cn',
      immediate: true,
      rem: 2.5
    });
    return 'reinit-ok';
  } catch(e) { return 'reinit-err:' + (e && e.message); }
})()
"""

DUMP = r"""
(function(){
  var out = [];
  [].slice.call(document.querySelectorAll('div,span,img,canvas')).forEach(function(e){
    var r = e.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) return;
    if (r.width > 600) return;
    var id = e.id || '', cls = String(e.className || '').slice(0, 60);
    if (!/captcha|slid|puzzle|block|drag|verify/i.test(id + ' ' + cls)) return;
    out.push({tag:e.tagName, id:id, cls:cls, x:Math.round(r.x), y:Math.round(r.y),
              w:Math.round(r.width), h:Math.round(r.height)});
  });
  return JSON.stringify(out.slice(0, 30));
})()
"""

DRAG = r"""
(function(){
  function pick(){
    var cands = [].slice.call(document.querySelectorAll('[class*=slider],[class*=slide],[id*=slider],[id*=slide]'));
    cands = cands.filter(function(e){var r=e.getBoundingClientRect();return r.width>20&&r.width<120&&r.height>20&&r.height<80;});
    return cands[0] || null;
  }
  var knob = pick();
  if (!knob) return JSON.stringify({ok:false, why:'no-knob'});
  var r = knob.getBoundingClientRect();
  var x0 = r.x + r.width/2, y0 = r.y + r.height/2;
  var target = x0 + (window.__dragTo || 200);
  function pe(type, x, y){
    var opts = {bubbles:true, cancelable:true, clientX:x, clientY:y, view:window,
                buttons: type==='mouseup'?0:1, button:0, pointerId:1, pointerType:'mouse',
                isPrimary:true};
    knob.dispatchEvent(new PointerEvent(type.replace('mouse','pointer'), opts));
    knob.dispatchEvent(new MouseEvent(type, opts));
    document.dispatchEvent(new PointerEvent(type.replace('mouse','pointer'), opts));
    document.dispatchEvent(new MouseEvent(type, opts));
  }
  pe('mousedown', x0, y0);
  var steps = 24, span = target - x0;
  for (var i = 1; i <= steps; i++) {
    var t = i / steps;
    var x = x0 + span * t + (i % 3) * 0.7;
    var y = y0 + Math.sin(t * 6) * 1.5;
    pe('mousemove', x, y);
  }
  pe('mouseup', target, y0);
  return JSON.stringify({ok:true, knob:{id:knob.id,cls:String(knob.className).slice(0,60),
                         x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width)},
                         target:Math.round(target)});
})()
"""


def main():
    grab = float(sys.argv[1]) if len(sys.argv) > 1 else 200.0
    dbg = FireFoxDebugger(port=6175)
    dbg.launch(URL, wait_page=10)
    try:
        dbg.enable("aliVal")
        print("[reinit]", dbg.evaluate(REINIT).get("result"))
        time.sleep(3)
        print("[dom]", dbg.evaluate(DUMP).get("result"))
        # 设置目标位移
        dbg.evaluate("window.__dragTo = %f; 'ok'" % grab)
        print("[drag]", dbg.evaluate(DRAG).get("result"))
        time.sleep(3)
        cap = dbg.evaluate("JSON.stringify({cvp: window.__cvp, err: window.__cvpErr, "
                           "len: (window.__cvp||'').length})")
        print("[capture]", (cap.get("result") or "")[:400])
        res = json.loads(cap.get("result") or "{}")
        if res.get("cvp"):
            with open(OUT, "w", encoding="utf-8") as f:
                json.dump({"captchaVerifyParam": res["cvp"],
                           "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                           "ua": dbg.evaluate("navigator.userAgent").get("result")}, f, indent=1)
            print("[saved]", OUT)
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
