"""诊断 9：热缓存重载假设。

首次加载把 feilin/pe 打进缓存；再 reload 时设备阶段可能赶在 SDK 的 5s 竞速窗口内完成，
滑块就有机会渲染。reload 后立刻重新 attach 并装探针。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

ARM = r"""
(function(){
  if (window.__g) return 'already';
  var L = window.__g = {fe: [], html: [], btoa: [], cvp: null, inst: null, err: []};
  if (window.FEILIN && window.FEILIN.initFeiLin && !window.FEILIN.__w){
    var _if = window.FEILIN.initFeiLin;
    window.FEILIN.initFeiLin = function(dc, cb){
      try { L.fe.push({dc: dc && Object.keys(dc).join(','), t: Date.now()}); } catch(e){}
      if (typeof cb === 'function'){
        return _if.call(window.FEILIN, dc, function(){
          try { L.fe.push({cb: 'fired', t: Date.now()}); } catch(e){}
          return cb.apply(this, arguments);
        });
      }
      return _if.apply(window.FEILIN, arguments);
    };
    window.FEILIN.__w = 1;
  }
  var _iah = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(pos, html){
    try { L.html.push({target: this.id || String(this.className||''), len: String(html).length}); } catch(e){}
    return _iah.apply(this, arguments);
  };
  var _b = window.btoa;
  window.btoa = function(s){
    var o = _b.apply(this, arguments);
    try { if (typeof o === 'string' && o.length > 150) L.btoa.push({len: o.length, head: o.slice(0,8), t: Date.now()}); } catch(e){}
    return o;
  };
  var _ce = Document.prototype.createElement;
  Document.prototype.createElement = function(tag){
    try { if (L.dom === undefined) L.dom = []; L.dom.push(tag + '@' + (new Error().stack||'').split('\n')[2]); } catch(e){}
    return _ce.apply(this, arguments);
  };
  return 'armed';
})()
"""

READ = r"""
JSON.stringify({
  RMD: typeof window.RMD === 'undefined' ? 'undef' : window.RMD,
  elKids: (document.getElementById('captcha-element')||{childNodes:{length:-1}}).childNodes.length,
  capIds: [].slice.call(document.querySelectorAll('[id^=aliyunCaptcha]')).map(function(e){return e.id;}),
  inst: typeof window.captcha,
  fe: window.__g ? window.__g.fe.slice(-3) : null,
  html: window.__g ? window.__g.html.slice(-3) : null,
  btoa: window.__g ? window.__g.btoa.map(function(x){return x.len;}) : null,
  perf: performance.getEntriesByType('resource').filter(function(e){return /feilin|pe\./.test(e.name);})
        .map(function(e){return e.name.split('/').pop().slice(0,20)+':'+Math.round(e.duration)+'ms';})
})
"""


def ev(dbg, expr, timeout=30):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:200]}
    return r.get("result")


def enable_retry(dbg, tries=10):
    for i in range(tries):
        try:
            dbg.enable("aliVal")
            return True
        except Exception as e:
            print("  [attach retry %d] %s" % (i, str(e)[:40]))
            time.sleep(2)
    return False


def main():
    dbg = FireFoxDebugger(port=6220)
    dbg.launch(URL, wait_page=12)
    try:
        print("[enable1]", enable_retry(dbg))
        print("[reload]", ev(dbg, "location.reload(); 'reloading'", timeout=15))
        time.sleep(3)
        ok = enable_retry(dbg, 12)
        print("[enable2]", ok)
        # 尽快装探针（忙期 evaluate 会超时，重试到成功）
        armed = False
        for i in range(12):
            try:
                r = ev(dbg, ARM, timeout=8)
                if r in ("armed", "already"):
                    print("[arm] at try", i, r)
                    armed = True
                    break
            except Exception as e:
                print("  [arm retry %d] %s" % (i, str(e)[:40]))
            time.sleep(1)
        for i in range(8):
            time.sleep(4)
            print("[t+%ds]" % (4 * (i + 1)), str(ev(dbg, READ, timeout=25))[:900])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
