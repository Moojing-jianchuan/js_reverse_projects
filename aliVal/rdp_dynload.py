"""验证 dynamicJS（pe.0xx.js）能否定义 window.AliyunCaptcha。

AliyunCaptcha.js 的实例化条件是：
    "function" == typeof window.AliyunCaptcha && !0 === r.dynamicJSLoaded && a()
实测结果始终是 undefined —— 手动加载一次引擎脚本，看是否是加载环节的问题。
"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, RdpError

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"


def main():
    dbg = FireFoxDebugger(port=6189)
    dbg.launch(URL, wait_page=10)
    try:
        for _ in range(5):
            try:
                dbg.enable("aliVal")
                break
            except RdpError:
                time.sleep(2)
        print("[before]", dbg.evaluate("JSON.stringify({aliyun: typeof window.AliyunCaptcha,"
                                       "feilin: typeof window.FEILIN,"
                                       "pe: [].slice.call(document.querySelectorAll('script[src]'))"
                                       ".map(function(s){return s.src}).filter(function(u){return /dynamicJS/.test(u)})})",
                                       timeout=40).get("result"))

        inject = r"""
        (function(){
          var existing = [].slice.call(document.querySelectorAll('script[src]'))
              .map(function(s){return s.src}).filter(function(u){return /dynamicJS/.test(u)})[0];
          window.__dynState = 'init';
          if (!existing) { window.__dynState = 'no-url'; return 'no-url'; }
          var s = document.createElement('script');
          s.src = existing + (existing.indexOf('?') >= 0 ? '&' : '?') + 'r=' + Date.now();
          s.onload = function(){ window.__dynState = 'loaded:' + (typeof window.AliyunCaptcha); };
          s.onerror = function(e){ window.__dynState = 'error'; };
          document.head.appendChild(s);
          return 'injecting:' + existing.split('/').pop();
        })()
        """
        print("[inject]", dbg.evaluate(inject, timeout=40).get("result"))
        for i in range(6):
            time.sleep(2)
            st = dbg.evaluate("JSON.stringify({state: window.__dynState||null,"
                              "aliyun: typeof window.AliyunCaptcha})", timeout=40).get("result")
            print("[t+%ds]" % ((i + 1) * 2), st)
            if st and '"aliyun":"function"' in st:
                break
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
