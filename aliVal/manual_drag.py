"""manual_drag.py —— 打开可见浏览器，让**真人**用鼠标把滑块拖到缺口，脚本只做记录与判定。

为什么需要它：纯协议 + SendInput 已经把「算法、几何、输入可信、像素级对齐」全部排除，
只剩一条排除证据 —— 真人在同一页面手拖一次是否也是 false。

做法：不替换 SDK 的 captchaVerifyCallback（保持页面自己的业务流程），只旁路记录
jQuery.ajax 的请求与响应，并静音 alert（否则会阻塞页面）。
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")

PROFILE = r"D:\ds_work\js_reverse_projects\aliVal\static\profile_noproxy"
URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\manual_drag_result.json"

USERJS = """user_pref("network.proxy.type", 0);
user_pref("network.proxy.http", "");
user_pref("network.proxy.ssl", "");
user_pref("network.proxy.socks", "");
user_pref("network.proxy.no_proxies_on", "*");
"""

SPY = r"""
(function(){
  if (window.__spy) return 'already';
  window.__spy = {ajax: [], alert: []};
  window.alert = function(m){ window.__spy.alert.push(String(m)); };
  var hook = function(){
    if (!window.jQuery || !jQuery.ajax || jQuery.ajax.__spied) return false;
    var _ajax = jQuery.ajax;
    var wrapped = function(opts){
      var rec = {url: (opts && opts.url) || '', type: (opts && opts.type) || 'GET',
                 reqLen: 0, reqHead: '', status: null, resp: '', at: Date.now()};
      try {
        var s = JSON.stringify((opts && opts.data) || {});
        rec.reqLen = s.length; rec.reqHead = s.slice(0, 120);
      } catch(e){}
      var ok = opts && opts.success;
      if (typeof ok === 'function') {
        opts = Object.assign({}, opts, {success: function(r, st, xh){
          try { rec.status = 'ok'; rec.resp = JSON.stringify(r).slice(0, 300); } catch(e){}
          return ok.apply(this, arguments);
        }});
      }
      try { window.__spy.ajax.push(rec); } catch(e){}
      return _ajax.apply(this, arguments);
    };
    wrapped.__spied = true;
    jQuery.ajax = wrapped;
    return true;
  };
  hook();
  setInterval(hook, 800);
  return 'spy-installed';
})()
"""

STATE = r"""
JSON.stringify({
  slider: !!document.querySelector('#aliyunCaptcha-sliding-slider'),
  embed: !!document.querySelector('#aliyunCaptcha-window-embed'),
  ajax: (window.__spy ? window.__spy.ajax.length : 0),
  alerts: (window.__spy ? window.__spy.alert.length : 0),
  lastAjax: (window.__spy && window.__spy.ajax.length)
      ? window.__spy.ajax[window.__spy.ajax.length - 1] : null,
  inst: typeof window.captcha
})
"""


def ev(dbg, expr, timeout=40):
    return dbg.evaluate(expr, timeout)


def main():
    from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

    os.makedirs(PROFILE, exist_ok=True)
    with open(os.path.join(PROFILE, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)
    tempfile.mkdtemp = lambda *a, **k: PROFILE

    dbg = FireFoxDebugger(port=6211)
    print("=" * 70)
    print("  正在启动浏览器（可见窗口）…… 启动后会提示你手动拖动滑块")
    print("=" * 70, flush=True)
    dbg.launch(URL, wait_page=12)
    try:
        for _ in range(12):
            try:
                dbg.enable("aliVal")
                break
            except Exception:
                time.sleep(2)

        for i in range(20):
            time.sleep(2)
            try:
                st = ev(dbg, STATE, timeout=25)
                d = json.loads(st.get("result") or "{}")
            except Exception:
                continue
            if d.get("slider"):
                print("[ready] 滑块已渲染（%.0fs）" % ((i + 1) * 2), flush=True)
                break
            print("[wait %ds] slider=%s embed=%s inst=%s" % ((i + 1) * 2, d.get("slider"),
                                                             d.get("embed"), d.get("inst")), flush=True)

        print("[spy]", ev(dbg, SPY, timeout=40).get("result"), flush=True)
        banner = r"""
        (function(){
          var id = '__manual_banner';
          var old = document.getElementById(id);
          if (old) old.remove();
          var b = document.createElement('div');
          b.id = id;
          b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
            'background:#ff3b30;color:#fff;font:16px/1.7 -apple-system,Segoe UI,sans-serif;' +
            'padding:12px 16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.4)';
          b.textContent = '【请操作】用鼠标把滑块拖到缺口位置，然后松手。脚本会自动捕获提交结果。';
          document.documentElement.appendChild(b);
          return 'banner-ok';
        })()
        """
        ev(dbg, banner, timeout=20)
        print("", flush=True)
        print("#" * 70)
        print("#  请切换到浏览器窗口，用鼠标把滑块拖到缺口位置，然后松手。")
        print("#  松手后页面会自动提交，脚本会捕获结果（最多等 180 秒）。")
        print("#  注意：这段时间请不要再动命令行窗口，否则会抢走焦点。")
        print("#" * 70, flush=True)

        result = None
        for i in range(60):
            time.sleep(3)
            try:
                st = ev(dbg, STATE, timeout=25)
                d = json.loads(st.get("result") or "{}")
            except Exception:
                continue
            ajax = d.get("ajax") or 0
            if ajax:
                last = d.get("lastAjax") or {}
                print("[hit] 捕获到页面提交：", json.dumps(last, ensure_ascii=False)[:300], flush=True)
                result = d
                break
            if i % 4 == 3:
                print("[waiting %ds] 还没检测到提交（ajax=%d）" % ((i + 1) * 3, ajax), flush=True)

        if result:
            with open(OUT, "w", encoding="utf-8") as f:
                json.dump({"captured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                           "state": result}, f, ensure_ascii=False, indent=1)
            print("[saved]", OUT, flush=True)
            print("", flush=True)
            print("=" * 70)
            print("判定：")
            body = str((result.get("lastAjax") or {}).get("resp") or "")
            if '"captchaVerifyResult":true' in body:
                print("  ★ true —— 真人拖动可以通过 ⇒ 纯协议只差真人动力学，边界 = S2")
            elif '"captchaVerifyResult":false' in body:
                print("  ✗ false —— 真人也过不去 ⇒ 该站点 VerifyCaptcha 通路不出 true（可升级为已证明）")
            else:
                print("  响应:", body[:300])
            print("=" * 70)
        else:
            print("[timeout] 180 秒内没检测到页面提交（可能没拖完/没松手/alert 阻塞）")
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
