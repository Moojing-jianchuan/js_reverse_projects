"""rdp_get_cvp.py —— 用 RDP（非 Playwright）驱动 camoufox，让阿里云 FeiLin 滑块渲染并
在真实浏览器里走完一次验证，截获同轮的：

    captchaVerifyParam   （base64(0x25 0x13 0x27 || enc)）
    device_config        （AliyunCaptcha.prototype.deviceConfig，本会话 DeviceConfig）
    deflate_b64          （FeiLin 内部 window.btoa 产出的 deflate 串，eJ 开头）
    certify_id

关键前提（踩坑记录）
-------------------
1. 本机 WinINET 代理 = 127.0.0.1:7897，浏览器走系统代理时访问
   static-captcha.aliyuncs.com 会**永久挂起**（curl 直连 100ms 就 200）。
   SDK 的图片预载 Lr(PuzzleImage)/Lr(Image) 永不 settle，于是
   加载器里的 a() 永不执行 —— 而 a() 才是 `new window.AliyunCaptcha` +
   getInstance 的地方。结果就是：容器一直 0x0、innerHTML 空、getInstance 不回调，
   但 InitCaptcha/PNG 请求都发出去了（看起来"初始化成功"）。
   解决：给调试器一个自带 user.js（network.proxy.type=0）的独立 profile。
2. 页面刚加载时主线程被 FeiLin 的 WebGL 指纹采集占满，evaluate 会 25~60s 超时；
   等 ~10s 后再 attach 就正常。
3. 重复调 initAliyunCaptcha 会让页面卡死；本脚本**不调 init**，直接用页面自己
   已经初始化好的实例（window.captcha / AliyunCaptcha.prototype.config）。
4. 页面 onBizResultCallback 里 `bizResult===true` 会 location.href 跳走，
   false 会 alert 阻塞。所以替换后的 captchaVerifyCallback 返回一个**永不 resolve**
   的 Promise：只拿 param，不触发业务回调，也不打业务接口。
"""
from __future__ import annotations

import base64
import json
import os
import re
import socket
import sys
import tempfile
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger  # noqa: E402

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
PROFILE = r"D:\ds_work\js_reverse_projects\aliVal\static\profile_noproxy"
OUT = r"D:\ds_work\js_reverse_projects\aliVal\config\cvp_capture.json"

USERJS = """user_pref("network.proxy.type", 0);
user_pref("network.proxy.http", "");
user_pref("network.proxy.ssl", "");
user_pref("network.proxy.socks", "");
"""

# ---------------------------------------------------------------- 注入的钩子
HOOK = r"""
(function(){
  if (window.__cap) return 'already';
  var L = window.__cap = {cvp: null, src: null, ajax: [], xhr: [], btoa: [],
                          dev: null, ajaxParam: [], t0: Date.now(), drag: null};

  // 1) btoa 出口：FeiLin 的 deflate 串（eJ 开头）与 device blob 都会经过这里
  var _btoa = window.btoa;
  window.btoa = function(s){
    var out = _btoa.apply(this, arguments);
    try {
      if (typeof out === 'string' && out.length > 200) {
        L.btoa.push({len: out.length, head: out.slice(0, 12), at: Date.now()});
        if (out.slice(0, 2) === 'eJ') L.deflate = out;
      }
    } catch(e){}
    return out;
  };

  // 2) jQuery.ajax：页面自己的 captchaVerifyCallback 用它提交（兜底路径）
  function wrapJq(){
    if (!window.jQuery || !window.jQuery.ajax || window.jQuery.ajax.__w) return false;
    var _aj = window.jQuery.ajax;
    var w = function(o){
      try {
        var d = o && o.data;
        if (d && typeof d === 'object' && d.captchaVerifyParam) {
          L.ajax.push(String(d.captchaVerifyParam));
          L.ajaxParam.push(String(d.captchaVerifyParam));
        }
      } catch(e){}
      return _aj.apply(window.jQuery, arguments);
    };
    w.__w = 1;
    window.jQuery.ajax = w;
    return true;
  }
  wrapJq(); window.__wrapJq = wrapJq;

  // 3) XHR：兜底从 POST body 抠 captchaVerifyParam；顺带抓 DeviceConfig
  var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){ try{this.__m=m; this.__u=String(u);}catch(e){}; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var s = this, body = String(b == null ? '' : b);
    try {
      if (body.indexOf('captchaVerifyParam') >= 0) {
        var mt = /captchaVerifyParam=([^&]+)/.exec(body);
        if (mt) { L.xhr.push(decodeURIComponent(mt[1])); }
      }
    } catch(e){}
    try {
      this.addEventListener('load', function(){
        try {
          var raw = s.responseText;
          if (!raw && s.responseType === 'json') raw = JSON.stringify(s.response || {});
          var j = JSON.parse(raw || '{}');
          var ro = j && j.ResultObject;
          if (ro && ro.DeviceConfig) { L.dev = String(ro.DeviceConfig); L.devAt = Date.now(); }
        } catch(e){}
      });
    } catch(e){}
    return _send.apply(this, arguments);
  };

  // 3b) fetch / sendBeacon：device SDK 的 Log1 有时走这两条路
  function absorb(text){
    try {
      var j = JSON.parse(text || '{}');
      var ro = j && j.ResultObject;
      if (ro && ro.DeviceConfig) { L.dev = String(ro.DeviceConfig); L.devAt = Date.now(); }
    } catch(e){}
  }
  try {
    var _fetch = window.fetch;
    window.fetch = function(input, init){
      var p = _fetch.apply(this, arguments);
      try {
        var u = String((typeof input === 'string') ? input : (input && input.url) || '');
        if (u.indexOf('aliyuncs.com') >= 0) {
          p.then(function(res){
            try { res.clone().text().then(absorb).catch(function(){}); } catch(e){}
          }).catch(function(){});
        }
      } catch(e){}
      return p;
    };
  } catch(e){}
  try {
    var _sb = navigator.sendBeacon;
    if (_sb) navigator.sendBeacon = function(url, data){
      try { L.beacon = String(url).slice(0, 80); } catch(e){}
      return _sb.apply(navigator, arguments);
    };
  } catch(e){}

  // 4) 保险：禁止 alert 阻塞 / 阻断跳转
  try { window.alert = function(){}; } catch(e){}

  return 'hooked';
})()
"""

# 用页面已存在的实例，替换回调 + 读出 deviceConfig / CertifyId / 几何信息
ARM_CB = r"""
(function(){
  window.__wrapJq && window.__wrapJq();
  var A = window.AliyunCaptcha, out = {inst: typeof window.captcha};
  // 配置与 deviceConfig 挂在原型上（loader 里：r.config=e; r.deviceConfig=rr）
  try {
    var pc = A && A.prototype && A.prototype.config;
    out.config_keys = pc ? Object.keys(pc).slice(0, 40) : null;
    out.certify = pc ? (pc.CertifyId || null) : null;
    out.device_len = A.prototype.deviceConfig ? String(A.prototype.deviceConfig).length : 0;
    // 真正的 DeviceConfig 在 config.DeviceConfig（大写 D）；prototype.deviceConfig 只是截短的
    var cand = [];
    try { if (pc && pc.DeviceConfig) cand.push(String(pc.DeviceConfig)); } catch(e){}
    try { if (pc && pc.deviceConfig) cand.push(String(pc.deviceConfig)); } catch(e){}
    try { if (A.prototype.deviceConfig) cand.push(String(A.prototype.deviceConfig)); } catch(e){}
    try { if (window.__cap && window.__cap.dev) cand.push(String(window.__cap.dev)); } catch(e){}
    out.dev_candidates = cand.map(function(s){ return {len: s.length, head: s.slice(0, 24)}; });
    // 只认长串（DeviceConfig 是 200~400 的 base64），"[object Object]" 这种直接丢掉
    out.device_config = cand.filter(function(s){ return s.length > 100 && s.indexOf('[object') !== 0; })[0] || '';
    // 深扫 prototype.deviceConfig（FEILIN 把 DeviceConfig/DeviceToken 回填到这个对象里）
    var hits = [];
    (function scan(o, d, path){
      try {
        Object.keys(o || {}).forEach(function(k){
          var v = o[k], p = path ? path + '.' + k : k;
          if (typeof v === 'string') {
            if (v.length > 60 && v.indexOf('http') !== 0) hits.push({p: p, len: v.length, head: v.slice(0, 16), v: v});
          } else if (v && typeof v === 'object' && d > 0) scan(v, d - 1, p);
        });
      } catch(e){}
    })(A && A.prototype && A.prototype.deviceConfig, 2, '');
    out.dev_scan = hits.map(function(h){ return {p: h.p, len: h.len, head: h.head}; });
    out.dev_scan_values = hits;
  } catch(e){ out.pcerr = String(e); }

  // 替换回调：永不 resolve → 不触发 onBizResultCallback（不 alert、不跳转）
  var keep = function(p){
    window.__cap.cvp = String(p);
    window.__cap.src = window.__cap.src || 'callback';
    window.__cap.at = Date.now();
    return new Promise(function(){});
  };
  try {
    if (window.captcha) window.captcha.captchaVerifyCallback = keep;
    if (A && A.prototype && A.prototype.config) A.prototype.config.captchaVerifyCallback = keep;
    if (A && A.prototype) A.prototype.captchaVerifyCallback = keep;
    out.cb_patched = true;
  } catch(e){ out.cb_patched = 'err:' + e.message; }

  // 几何信息
  function rect(sel){
    var e = document.querySelector(sel);
    if (!e) return null;
    var r = e.getBoundingClientRect();
    return {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)};
  }
  out.slider = rect('#aliyunCaptcha-sliding-slider');
  out.body = rect('#aliyunCaptcha-sliding-body');
  out.puzzle = rect('#aliyunCaptcha-puzzle');
  out.img = rect('#aliyunCaptcha-img');
  out.win = rect('#aliyunCaptcha-window-embed');
  try {
    var zoom = getComputedStyle(document.documentElement).getPropertyValue('--aliyun-zoom-ratio');
    out.zoom = zoom ? parseFloat(zoom) : 1;
  } catch(e){ out.zoom = 1; }
  try {
    var pz = document.querySelector('#aliyunCaptcha-puzzle');
    var st = pz ? (pz.getAttribute('style') || '') : '';
    out.puzzle_style = st.slice(0, 200);
    var m = /translate[^(]*\(\s*([-\d.]+)px/.exec(st) || /left:\s*([-\d.]+)px/.exec(st);
    if (m) out.gap_px = Math.round(parseFloat(m[1]));
    else if (out.puzzle && out.img) {
      // 退路：用拼图块与底图的横向偏移估算（设计像素）
      out.gap_px = Math.round((out.puzzle.x - out.img.x) / (out.zoom || 1));
    }
  } catch(e){}
  return JSON.stringify(out);
})()
"""

# 合成拖拽：PointerEvent + MouseEvent 全发，分段移动，最后 mouseup
DRAG = r"""
(function(gapPx){
  var el = document.querySelector('#aliyunCaptcha-sliding-slider');
  if (!el) return 'no-slider';
  var r = el.getBoundingClientRect();
  var sx = Math.round(r.left + r.width / 2), sy = Math.round(r.top + r.height / 2);
  var zoom = 1;
  try {
    var z = getComputedStyle(document.documentElement).getPropertyValue('--aliyun-zoom-ratio');
    zoom = z ? parseFloat(z) : 1;
  } catch(e){}
  var dist = Math.round((gapPx || 200) * zoom);          // 设计像素 → 屏幕像素
  var steps = 24;
  window.__cap.drag = {sx: sx, sy: sy, dist: dist, zoom: zoom, steps: steps, fired: 0};

  function mk(type, x, y, target){
    var opt = {bubbles: true, cancelable: true, view: window, button: 0,
               buttons: (type === 'mouseup' || type === 'pointerup') ? 0 : 1,
               clientX: x, clientY: y, screenX: x, screenY: y};
    try {
      var P = window.PointerEvent;
      if (P){
        var ptype = {mousedown:'pointerdown', mousemove:'pointermove', mouseup:'pointerup'}[type];
        opt.pointerId = 1; opt.pointerType = 'mouse'; opt.isPrimary = true; opt.width = 1; opt.height = 1;
        target.dispatchEvent(new P(ptype, opt));
      }
    } catch(e){}
    target.dispatchEvent(new MouseEvent(type, opt));
    window.__cap.drag.fired++;
  }

  var tgt = el;
  mk('mousedown', sx, sy, tgt);
  var i = 0;
  function step(){
    i++;
    // 加一点抖动，轨迹更像人（服务端不一定过，但前端一定生成 param）
    var x = sx + Math.round(dist * (i / steps)) + (i % 3 === 0 ? 1 : 0);
    var y = sy + (i % 4 === 0 ? 1 : 0);
    mk('mousemove', x, y, document);
    if (i < steps) setTimeout(step, 16 + (i % 5) * 4);
    else setTimeout(function(){ mk('mouseup', x, y, document); }, 60);
  }
  setTimeout(step, 30);
  return 'drag-started';
})()
"""

READ = r"""
JSON.stringify({
  cvpLen: (window.__cap && window.__cap.cvp || '').length,
  src: window.__cap && window.__cap.src,
  ajax: (window.__cap && window.__cap.ajax || []).length,
  xhr: (window.__cap && window.__cap.xhr || []).length,
  btoa: (window.__cap && window.__cap.btoa || []).map(function(b){return b.len + ':' + b.head;}),
  deflateLen: (window.__cap && window.__cap.deflate || '').length,
  drag: window.__cap && window.__cap.drag,
  kids: (document.getElementById('captcha-element')||{childNodes:{length:-1}}).childNodes.length
})
"""


# ---------------------------------------------------------------- 工具函数
def free_port(lo=6200, hi=6400):
    for p in range(lo, hi):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.15)
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    raise RuntimeError("6200-6400 没有空闲端口")


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def enable_retry(dbg, tries=10, gap=2.0):
    for i in range(tries):
        try:
            dbg.enable("aliVal")
            return True
        except Exception as e:
            print("  [attach retry %d] %s" % (i, str(e)[:60]))
            time.sleep(gap)
    return False


def seed_profile():
    os.makedirs(PROFILE, exist_ok=True)
    with open(os.path.join(PROFILE, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)


def b64_head(b64, n=3):
    try:
        raw = base64.b64decode(b64 + "=" * (-len(b64) % 4))[:n]
        return " ".join("0x%02x" % b for b in raw)
    except Exception as e:
        return "decode-err:%s" % e


MAGIC = b"\x25\x13\x27"


def _has_magic(s):
    try:
        return base64.b64decode(s + "=" * (-len(s) % 4))[:3] == MAGIC
    except Exception:
        return False


def extract_blob(cvp):
    """captchaVerifyParam 是 JSON 信封，里面藏着 base64(0x25 0x13 0x27 || enc)。
    返回 (blob, {字段名: 长度})。"""
    fields = {}
    try:
        obj = json.loads(cvp)
    except Exception:
        return None, fields
    if not isinstance(obj, dict):
        return None, fields
    for k, v in obj.items():
        if isinstance(v, str):
            fields[k] = len(v)
            if len(v) > 100 and _has_magic(v):
                return v, fields
    return None, fields


def main():
    seed_profile()
    tempfile.mkdtemp = lambda *a, **k: PROFILE          # 让调试器用我们预置好 user.js 的 profile
    port = free_port()
    print("[port]", port)
    dbg = FireFoxDebugger(port=port)
    dbg.launch(URL, wait_page=12)
    result = {"captchaVerifyParam": "", "device_config": "", "deflate_b64": "",
              "cvp_blob": "", "certify_id": "", "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
              "source": "", "slider": {"gap_px": None, "css_width": 360}, "notes": ""}
    try:
        if not enable_retry(dbg):
            result["notes"] = "attach failed"
            return
        print("[hook]", ev(dbg, HOOK))
        arm = ev(dbg, ARM_CB)
        print("[arm]", str(arm)[:700])
        info = {}
        try:
            info = json.loads(arm) if isinstance(arm, str) else {}
        except Exception:
            pass

        gap = info.get("gap_px") or 200
        result["certify_id"] = info.get("certify") or ""
        result["slider"] = {
            "gap_px": gap,                     # 设计像素下的横向位移（拖动距离的估算基准）
            "css_width": 360,                  # slideStyle.width
            "track_px": (info.get("body") or {}).get("w"),      # 实际渲染宽度（--aliyun-zoom-ratio 之后）
            "knob_px": (info.get("slider") or {}).get("w"),
            "zoom": info.get("zoom"),
        }

        if not info.get("slider"):
            result["notes"] = "slider 元素不存在，渲染未完成"
            print("[fail]", result["notes"])
            return

        print("[drag]", ev(dbg, "(" + DRAG.strip() + ")(%d)" % int(gap)))
        cvp = None
        for i in range(14):
            time.sleep(1.5)
            st = ev(dbg, READ, timeout=25)
            print("[t+%.1fs]" % (1.5 * (i + 1)), str(st)[:420])
            try:
                d = json.loads(st) if isinstance(st, str) else {}
            except Exception:
                d = {}
            if d.get("cvpLen"):
                cvp = ev(dbg, "window.__cap.cvp")
                break

        # 三条路兜底取值
        if not cvp:
            for expr, name in (("window.__cap.cvp", "callback"),
                               ("(window.__cap.ajax||[]).slice(-1)[0]", "ajax"),
                               ("(window.__cap.xhr||[]).slice(-1)[0]", "xhr")):
                v = ev(dbg, expr)
                if isinstance(v, str) and len(v) > 100:
                    cvp, result["source"] = v, name
                    break
        else:
            result["source"] = "callback"

        dev = info.get("device_config") or ""
        if not isinstance(dev, str):
            dev = ""
        scan = info.get("dev_scan_values") or []
        if not dev and isinstance(scan, list):
            # 优先 100~600 长度、非 deviceToken 的串
            cand2 = [h.get("v") for h in scan
                     if isinstance(h, dict) and isinstance(h.get("v"), str)
                     and 100 < len(h["v"]) < 600 and not h["v"].startswith("V0VCI2Fi")]
            if cand2:
                dev = cand2[0]
        if not dev:
            # device SDK 的 Log1 可能在拖拽之后才回来，再等一会儿
            for _ in range(10):
                v = ev(dbg, "(window.__cap && window.__cap.dev) || ''")
                if isinstance(v, str) and len(v) > 100:
                    dev = v
                    break
                time.sleep(1.5)
        result["device_config"] = dev
        result["dev_scan"] = info.get("dev_scan") or []

        df = ev(dbg, "(window.__cap && window.__cap.deflate) || ''")
        result["deflate_b64"] = df if isinstance(df, str) else ""

        btoa_all = ev(dbg, "JSON.stringify((window.__cap&&window.__cap.btoa||[]).map(function(b){return {len:b.len, head:b.head};}))")
        result["btoa_all"] = json.loads(btoa_all) if isinstance(btoa_all, str) and btoa_all.strip().startswith("[") else []

        if cvp:
            result["captchaVerifyParam"] = cvp
            # cvp 是 JSON 信封，里面还有一个 base64(0x25 0x13 0x27 || enc) 的 payload 字段
            blob, fields = extract_blob(cvp)
            if blob:
                result["cvp_blob"] = blob
                result["cvp_blob_prefix"] = b64_head(blob)
            result["cvp_fields"] = fields
            result["notes"] = ("src=%s; cvp_len=%d; cvp_prefix=%s; blob_len=%d; device_len=%d; "
                               "deflate_len=%d; gap_px=%s; zoom=%s; page_own_init=1; init_recalled=0; "
                               "slideAuth_posts=%d"
                               % (result["source"], len(cvp), b64_head(cvp), len(blob or ""),
                                  len(result["device_config"]), len(result["deflate_b64"]),
                                  info.get("gap_px"), info.get("zoom"),
                                  info.get("ajax_posts", 0)))
            print("[OK] cvp len=%d prefix=%s blob=%d device=%d deflate=%d" %
                  (len(cvp), b64_head(cvp), len(blob or ""), len(result["device_config"]),
                   len(result["deflate_b64"])))
        else:
            result["notes"] = "未捕获到 captchaVerifyParam（滑块可能未就绪或拖拽未被识别）"
            print("[MISS]", result["notes"])
    finally:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        print("[saved]", OUT)
        dbg.close()
        time.sleep(1)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.4)
            print("[port free]", s.connect_ex(("127.0.0.1", port)) != 0)


if __name__ == "__main__":
    main()
