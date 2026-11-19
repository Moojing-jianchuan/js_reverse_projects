"""抓取当前版本的真实请求参数（data/deviceToken 等），全程 RDP，不用 Playwright。

流程：launch → enable → 注入 XHR/fetch Hook → 点按钮触发验证码 → 读回 Hook 记录。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\cap_2026-11-13.json"

HOOK = r"""
(function(){
  if (window.__cap_installed) return 'already';
  window.__cap_installed = 1;
  window.__cap = [];
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){
    try { this.__m = m; this.__u = u; } catch(e){}
    return _open.apply(this, arguments);
  };
  var _set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(k, v){
    try { (this.__h = this.__h || {})[k] = v; } catch(e){}
    return _set.apply(this, arguments);
  };
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(b){
    try { window.__cap.push({t:'xhr', m:this.__m, u:this.__u, h:this.__h||{}, b:String(b==null?'':b)}); } catch(e){}
    return _send.apply(this, arguments);
  };
  var _fetch = window.fetch;
  window.fetch = function(input, init){
    try {
      var u = (typeof input === 'string') ? input : (input && input.url);
      var b = (init && init.body) || '';
      window.__cap.push({t:'fetch', m:(init&&init.method)||'GET', u:u, b:String(b)});
    } catch(e){}
    return _fetch.apply(this, arguments);
  };
  return 'installed';
})()
"""


def ev(dbg, expr, timeout=30):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": r.get("result")}
    return r.get("result")


def main():
    dbg = FireFoxDebugger(port=6170)
    dbg.launch(URL, wait_page=8)
    try:
        print("[enable]", json.dumps(dbg.enable("aliVal", ), ensure_ascii=False)[:200])
        print("[hook]", ev(dbg, HOOK))

        # 让验证码显示出来（点击登录按钮）
        print("[click]", ev(dbg, "(function(){var b=document.getElementById('button');"
                                "if(!b) return 'no-button'; b.click(); return 'clicked';})()"))
        time.sleep(3)

        # 如果已有 FeiLin 实例，尝试再触发一次 refresh（会重新走 InitCaptcha）
        print("[refresh]", ev(dbg, "(function(){try{if(window.captcha&&captcha.refresh){captcha.refresh();return 'refreshed';}}catch(e){return 'err:'+e}"
                                ";return 'no-captcha';})()"))
        time.sleep(3)

        caps = ev(dbg, "JSON.stringify((window.__cap||[]).map(function(c){return {t:c.t,m:c.m,u:c.u,h:c.h,bl:(c.b||'').length,"
                       "keys:(c.b||'').split('&').map(function(kv){return kv.split('=')[0]}),b:c.b};}))")
        if isinstance(caps, str):
            data = json.loads(caps)
        else:
            data = []
        print("[captured]", len(data))
        for c in data:
            print("  ", c["t"], c["m"], str(c["u"])[:80], "| len", c["bl"], "| keys", c["keys"][:8])

        with open(OUT, "w", encoding="utf-8") as f:
            json.dump({"url": URL, "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                       "user_agent": ev(dbg, "navigator.userAgent"),
                       "items": data}, f, ensure_ascii=False, indent=2)
        print("[saved]", OUT)
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
