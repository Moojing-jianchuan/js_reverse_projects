"""诊断 initAliyunCaptcha 为何不渲染：错误捕获 + 实例状态 + 请求记录。"""
import json
import sys
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

INSTALL = r"""
(function(){
  if (window.__diag_installed) return 'already';
  window.__diag_installed = 1;
  window.__errs = [];
  var oe = window.onerror;
  window.onerror = function(m, s, l, c, e){ window.__errs.push('onerror: ' + m + ' @' + s + ':' + l); return oe ? oe.apply(this, arguments) : false; };
  window.addEventListener('unhandledrejection', function(ev){ window.__errs.push('reject: ' + String(ev.reason)); });
  ['error','warn'].forEach(function(lv){
    var orig = console[lv];
    console[lv] = function(){ try{ window.__errs.push(lv + ': ' + [].slice.call(arguments).map(String).join(' ').slice(0,300)); }catch(e){}; return orig.apply(console, arguments); };
  });
  window.__caps = [];
  var _f = window.fetch;
  window.fetch = function(input, init){
    try { window.__caps.push('fetch ' + (typeof input === 'string' ? input : input.url)); } catch(e){}
    return _f.apply(this, arguments);
  };
  var _o = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){ try{ window.__caps.push('xhr ' + m + ' ' + u); }catch(e){}; return _o.apply(this, arguments); };
  return 'installed';
})()
"""

STATE = r"""
(function(){
  var o = {};
  o.typeofCaptcha = typeof window.captcha;
  try { o.captchaKeys = window.captcha ? Object.keys(window.captcha) : null; } catch(e){}
  o.typeofInst = typeof window.__capInst;
  try { o.instKeys = window.__capInst ? Object.keys(window.__capInst).slice(0,40) : null; } catch(e){}
  try { o.elHtml = document.getElementById('captcha-element').innerHTML.slice(0,200); } catch(e){}
  try { o.elSize = (function(){var r=document.getElementById('captcha-element').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})(); } catch(e){}
  try { o.errs = window.__errs ? window.__errs.slice(0,15) : null; } catch(e){}
  try { o.caps = window.__caps ? window.__caps.slice(0,25) : null; } catch(e){}
  try { o.bodyChildren = [].slice.call(document.body.children).map(function(e){return e.tagName+'#'+e.id+'.'+String(e.className).slice(0,40)}).slice(0,25); } catch(e){}
  return JSON.stringify(o);
})()
"""


def main():
    dbg = FireFoxDebugger(port=6176)
    dbg.launch(URL, wait_page=8)
    try:
        dbg.enable("aliVal")
        # 在内联脚本执行前装不上，只能装之后再点按钮
        print("[install]", dbg.evaluate(INSTALL).get("result"))
        print("[before-click]", (dbg.evaluate(STATE).get("result") or "")[:900])
        print("[click]", dbg.evaluate("(function(){var b=document.getElementById('button');b&&b.click();return 'clicked';})()").get("result"))
        time.sleep(5)
        print("[after-click]", (dbg.evaluate(STATE).get("result") or "")[:1600])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
