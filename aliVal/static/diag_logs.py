"""诊断 2：captcha 实例为什么没创建。

抓：console.error/warn、window.onerror、unhandledrejection、body 上的 DOM 变更（MutationObserver）、
已加载脚本列表（看 pe.*.js 有没有下来）、AliyunCaptcha / FEILIN 全局形状。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\static\diag_logs.json"

PROBE = r"""
(function(){
  if (window.__p) return 'already';
  window.__p = {log: [], mut: [], rej: []};
  ['log','warn','error','info'].forEach(function(lv){
    var o = console[lv];
    console[lv] = function(){
      try{
        var a = [].slice.call(arguments).map(function(x){
          try { return (typeof x === 'string') ? x : JSON.stringify(x); } catch(e){ return String(x); }
        }).join(' ');
        window.__p.log.push(lv + ': ' + a.slice(0, 300));
      }catch(e){}
      return o.apply(console, arguments);
    };
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    window.__p.rej.push(String(r && (r.stack || r.message || r)).slice(0, 400));
  });
  window.addEventListener('error', function(e){
    window.__p.log.push('onerror: ' + String(e.message) + ' @' + String(e.filename) + ':' + e.lineno);
  });
  try {
    var mo = new MutationObserver(function(ms){
      ms.forEach(function(m){
        [].slice.call(m.addedNodes).forEach(function(n){
          if (n.nodeType !== 1) return;
          var b = null;
          try { b = n.getBoundingClientRect(); } catch(e){}
          window.__p.mut.push('+' + n.tagName + '#' + (n.id||'') + '.' + String(n.className||'').slice(0,40)
            + (b ? ' [' + Math.round(b.width) + 'x' + Math.round(b.height) + ']' : ''));
        });
        [].slice.call(m.removedNodes).forEach(function(n){
          if (n.nodeType !== 1) return;
          window.__p.mut.push('-' + n.tagName + '#' + (n.id||'') + '.' + String(n.className||'').slice(0,40));
        });
      });
    });
    mo.observe(document.documentElement, {childList: true, subtree: true});
    window.__mo = mo;
  } catch(e){}
  return 'probe-installed';
})()
"""

READ = r"""
JSON.stringify({
  log: (window.__p&&window.__p.log||[]).slice(-40),
  mut: (window.__p&&window.__p.mut||[]).slice(-40),
  rej: (window.__p&&window.__p.rej||[]).slice(-10),
  aliKeys: window.AliyunCaptcha ? Object.keys(window.AliyunCaptcha).slice(0,40) : null,
  feilKeys: window.FEILIN ? Object.keys(window.FEILIN).slice(0,40) : null,
  captchaT: typeof window.captcha,
  scripts: [].slice.call(document.querySelectorAll('script[src]')).map(function(s){return s.src.split('/').pop();}),
  styles: [].slice.call(document.querySelectorAll('style')).map(function(s){return (s.textContent||'').length;}),
  body: [].slice.call(document.body.children).map(function(e){
     var b=e.getBoundingClientRect();
     return e.tagName+'#'+(e.id||'')+'.'+String(e.className||'').slice(0,30)+'['+Math.round(b.width)+'x'+Math.round(b.height)+']';})
})
"""

CLICK = r"""
(function(){
  var b = document.getElementById('button');
  if (!b) return 'no-button';
  try { b.click(); } catch(e){ return 'click-err:'+e.message; }
  return 'clicked';
})()
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6212)
    dbg.launch(URL, wait_page=10)
    out = {}
    try:
        for i in range(6):
            try:
                print("[enable]", json.dumps(dbg.enable("aliVal"), ensure_ascii=False)[:120])
                break
            except Exception as e:
                print("[enable retry %d] %s" % (i, str(e)[:60]))
                time.sleep(3)
        # 尽快装探针（早于 6s 的忙期就用短超时，失败就重试）
        for i in range(10):
            try:
                if ev(dbg, PROBE, timeout=15) == "probe-installed":
                    print("[probe] at try", i)
                    break
            except Exception as e:
                print("[probe retry %d] %s" % (i, str(e)[:50]))
            time.sleep(1)
        try:
            srcs = [s.get("url") for s in dbg.sources()]
            out["sources"] = [u for u in srcs if u]
            print("[sources]", json.dumps(out["sources"], ensure_ascii=False)[:800])
        except Exception as e:
            print("[sources err]", str(e)[:120])
        time.sleep(12)
        out["t12"] = json.loads(ev(dbg, READ) or "{}")
        print("[t12]", json.dumps(out["t12"], ensure_ascii=False)[:2500])
        print("[click]", ev(dbg, CLICK))
        time.sleep(4)
        out["t16"] = json.loads(ev(dbg, READ) or "{}")
        print("[t16]", json.dumps(out["t16"], ensure_ascii=False)[:2500])
    finally:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT)
        dbg.close()


if __name__ == "__main__":
    main()
