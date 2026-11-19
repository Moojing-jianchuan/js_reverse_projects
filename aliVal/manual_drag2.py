"""manual_drag2.py —— 真人手拖 + 全程可观测版。

上一版只监视 jQuery.ajax，结果 180 秒 ajax=0，无法区分「事件没到页面」「FeiLin 没生成 data」
「生成了但没提交」。这一版把整条链路的中间状态都暴露到页面横幅上，拖的时候能直接看到
数字有没有动，从而一次定位。

观测点：
  down/move/up   鼠标事件是否到达页面（capture 阶段计数）
  knob           滑块实时屏幕 x / 相对图片的偏移
  piece          拼图块实时偏移（判断是否跟随）
  btoa           页面内部 base64 调用次数（>0 说明 FeiLin 已生成 deflate/data）
  xhr/fetch      网络提交次数
  alert          被静音的弹窗内容
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
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\manual_drag2_result.json"

USERJS = """user_pref("network.proxy.type", 0);
user_pref("network.proxy.http", "");
user_pref("network.proxy.ssl", "");
user_pref("network.proxy.socks", "");
user_pref("network.proxy.no_proxies_on", "*");
"""

SPY = r"""
(function(){
  if (window.__m) return 'already';
  var m = window.__m = {
    down: 0, move: 0, up: 0, trustedDown: 0, trustedMove: 0,
    knob: null, knobStart: null, piece: null, pieceStart: null,
    btoa: 0, btoaLens: [], xhr: [], ajax: [], alert: [], err: []
  };
  document.addEventListener('pointerdown', function(e){ m.down++; if (e.isTrusted) m.trustedDown++; }, true);
  document.addEventListener('mousemove',   function(e){ m.move++; if (e.isTrusted) m.trustedMove++; }, true);
  document.addEventListener('pointerup',   function(e){ m.up++; }, true);
  window.addEventListener('error', function(e){ m.err.push(String(e.message || e).slice(0, 120)); });

  var _btoa = window.btoa;
  window.btoa = function(s){
    try { m.btoa++; if (m.btoaLens.length < 12) m.btoaLens.push(String(s).length); } catch(e){}
    return _btoa.apply(this, arguments);
  };
  var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  // 页面在 bizResult=true 时会 location.href 跳走，内存里的 __m 会随之消失。
  // 所以每次拿到数据都同步写进 localStorage，跳转后新页面仍能读出来。
  function persist(){
    try {
      localStorage.setItem('__m_dump', JSON.stringify({
        at: Date.now(), down: m.down, move: m.move, up: m.up,
        trustedDown: m.trustedDown, trustedMove: m.trustedMove,
        knobStart: m.knobStart, knob: m.knob, pieceStart: m.pieceStart, piece: m.piece,
        btoa: m.btoa, btoaLens: m.btoaLens, xhr: m.xhr, ajax: m.ajax,
        alert: m.alert, err: m.err, href: location.href
      }));
    } catch(e){}
  }
  window.__m_persist = persist;
  XMLHttpRequest.prototype.open = function(mm, u){ try{ this.__u = String(u); }catch(e){}; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var x = this;
    try {
      var rec = {u: x.__u, req: String(b == null ? '' : b), status: null, resp: ''};
      m.xhr.push(rec);
      persist();
      x.addEventListener('load', function(){
        try { rec.status = x.status; rec.resp = (x.responseText || ''); } catch(e){}
        persist();
      });
    } catch(e){}
    return _send.apply(this, arguments);
  };
  function hookAjax(){
    if (!window.jQuery || !jQuery.ajax || jQuery.ajax.__s) return;
    var _a = jQuery.ajax;
    var w = function(o){
      try { m.ajax.push({url: (o && o.url) || '', len: JSON.stringify((o && o.data) || {}).length}); } catch(e){}
      return _a.apply(this, arguments);
    };
    w.__s = true; jQuery.ajax = w;
  }
  hookAjax();
  var _alert = window.alert;
  window.alert = function(msg){ m.alert.push(String(msg).slice(0, 200)); };

  // 实时采样 + 横幅
  var bar = document.createElement('div');
  bar.id = '__mbar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ff3b30;' +
    'color:#fff;font:15px/1.6 -apple-system,Segoe UI,sans-serif;padding:10px 14px;text-align:center;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.4)';
  document.documentElement.appendChild(bar);
  setInterval(function(){
    try {
      hookAjax();
      var k = document.querySelector('#aliyunCaptcha-sliding-slider');
      var p = document.querySelector('#aliyunCaptcha-puzzle');
      var img = document.querySelector('#aliyunCaptcha-img');
      if (k) { var kr = k.getBoundingClientRect(); m.knob = Math.round(kr.x); if (m.knobStart === null) m.knobStart = Math.round(kr.x); }
      if (p && img) {
        var pr = p.getBoundingClientRect(), ir = img.getBoundingClientRect();
        m.piece = Math.round(pr.x - ir.x); if (m.pieceStart === null) m.pieceStart = m.piece;
      }
      bar.textContent = '【请拖动滑块】down=' + m.down + ' move=' + m.move + ' up=' + m.up +
        ' | 滑块x=' + m.knob + ' 拼图偏移=' + m.piece +
        ' | btoa=' + m.btoa + ' xhr=' + m.xhr.length + ' ajax=' + m.ajax.length +
        ' | alert=' + m.alert.length;
    } catch(e){}
  }, 300);
  return 'spy2-installed';
})()
"""

STATE = r"""
(function(){
  var m = window.__m || {};
  return JSON.stringify({
    down: m.down, move: m.move, up: m.up,
    trustedDown: m.trustedDown, trustedMove: m.trustedMove,
    knobStart: m.knobStart, knob: m.knob, pieceStart: m.pieceStart, piece: m.piece,
    btoa: m.btoa, btoaLens: m.btoaLens,
    xhr: (m.xhr || []).slice(-4),
    ajax: (m.ajax || []).slice(-4),
    alert: (m.alert || []).slice(-4),
    err: (m.err || []).slice(-4),
    slider: !!document.querySelector('#aliyunCaptcha-sliding-slider')
  });
})()
"""


def ev(dbg, expr, timeout=30):
    return dbg.evaluate(expr, timeout)


def main():
    from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

    # 关键：每次运行都用**全新 profile**。复用同一目录会让 device SDK 的
    # localStorage/IndexedDB 状态累积，导致页面反复重试/刷新、spy 被冲掉。
    global PROFILE
    PROFILE = tempfile.mkdtemp(prefix="rdp_manual_")
    with open(os.path.join(PROFILE, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)
    tempfile.mkdtemp = lambda *a, **k: PROFILE
    print(">>> profile:", PROFILE, flush=True)

    dbg = FireFoxDebugger(port=6212)
    print(">>> 启动浏览器…", flush=True)
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
                d = json.loads(ev(dbg, STATE, 25).get("result") or "{}")
            except Exception:
                continue
            if d.get("slider"):
                print("[ready] 滑块已渲染 %.0fs" % ((i + 1) * 2), flush=True)
                break
        print("[spy]", ev(dbg, SPY, 40).get("result"), flush=True)
        # 先给用户一个"准备中"的横幅，避免他提前拖（提前拖会在注入完成前就结束）
        ev(dbg, """(function(){var b=document.getElementById('__mbar');
            if(b){b.style.background='#ff9500';b.textContent='【准备中】请等 8 秒，看到绿色提示再拖';}
            return 'ok';})()""", 20)
        time.sleep(8)
        ev(dbg, """(function(){var b=document.getElementById('__mbar');
            if(b){b.style.background='#00a854';b.textContent='【现在可以拖了】用鼠标把滑块拖到缺口，松手即可';}
            return 'ok';})()""", 20)
        print("#" * 68, flush=True)
        print("# 现在可以拖了：切到浏览器窗口，把滑块拖到缺口，松手。", flush=True)
        print("#" * 68, flush=True)

        signal = None
        for i in range(70):   # ~210s
            time.sleep(2)
            # 页面会在初始化过程中导航（新文档没有 spy），每轮都确认 + 必要时重新注入
            try:
                alive = ev(dbg, "typeof window.__m === 'object' && window.__m !== null", 12).get("result")
            except Exception:
                alive = False
            if not alive:
                try:
                    dbg.console = None
                    dbg.enable("aliVal")
                    ev(dbg, SPY, 30)
                    print("[re-inject] spy 重新注入 %ds" % ((i + 1) * 2), flush=True)
                except Exception as e:
                    print("[re-inject fail]", str(e)[:60], flush=True)
                    continue
            try:
                raw = ev(dbg, STATE, 25).get("result")
            except Exception:
                raw = None
            d = {}
            if raw:
                try:
                    d = json.loads(raw)
                except Exception:
                    d = {}
            if not d or d.get("down") is None:
                try:
                    dump = ev(dbg, "localStorage.getItem('__m_dump') || ''", 20).get("result")
                    if dump:
                        d = json.loads(dump)
                        print("[from localStorage] 读到落盘记录", flush=True)
                except Exception:
                    pass
            print("[%3ds] down=%s move=%s up=%s trusted=%s/%s | knob %s→%s piece %s→%s | btoa=%s xhr=%s ajax=%s"
                  % ((i + 1) * 3, d.get("down"), d.get("move"), d.get("up"),
                     d.get("trustedDown"), d.get("trustedMove"),
                     d.get("knobStart"), d.get("knob"), d.get("pieceStart"), d.get("piece"),
                     d.get("btoa"), len(d.get("xhr") or []), len(d.get("ajax") or [])), flush=True)
            if (d.get("xhr") or d.get("ajax") or d.get("alert")):
                signal = d
                break
        if signal:
            with open(OUT, "w", encoding="utf-8") as f:
                json.dump({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "state": signal}, f,
                          ensure_ascii=False, indent=1)
            print("\n=== 终态 ===".encode("utf-8", "ignore").decode("utf-8"), flush=True)
            print(json.dumps(signal, ensure_ascii=False, indent=1)[:1600], flush=True)
        else:
            print("[timeout] 未检测到网络提交；上面的计数说明事件是否到达页面", flush=True)
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
