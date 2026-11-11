"""在真实浏览器里跑插桩版 SDK，输出阶段 + API 调用日志。

用法：python tools/stage_run_browser.py <seed> <ts> <out.json> [sdk]
"""

import json
import pathlib
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from camoufox.sync_api import Camoufox

ROOT = pathlib.Path(__file__).resolve().parent.parent


class _Page(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        body = b"<!doctype html><html><head><title>stage</title></head><body></body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # silence
        return


def _serve():
    srv = HTTPServer(("127.0.0.1", 8765), _Page)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
PRELUDE = (ROOT / "tools" / "prelude_stage.js").read_text(encoding="utf-8")

EVAL_FN = "(src) => { (0, eval)(src); }"

MINT_FN = """([seed, ts]) => {
  const tz = new Date().getTimezoneOffset();
  const tok = String(new window.ABC().z(seed, ts + (480 + tz) * 60000));
  return {
    len: tok.length,
    head: tok.slice(0, 60),
    log: window.__stageLog || [],
    api: window.__apiLog || [],
    canvas: window.__lastCanvas || null,
    env: window.__envSnap || {},
    big: window.__bigArrays || {},
    reads: window.__readLog || [],
  };
}"""


ENV_FN = """() => {
  const gl = document.createElement('canvas').getContext('webgl');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const local = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    local[k] = String(localStorage.getItem(k)).slice(0, 200);
  }
  // CSS 原型链名字集合（SDK 会枚举它；顺序必须一致）
  const cs = getComputedStyle(document.body);
  const protoAll = [];
  const protoEnum = [];
  let p = Object.getPrototypeOf(cs);
  while (p && p !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(p)) {
      protoAll.push(n);
      const d = Object.getOwnPropertyDescriptor(p, n);
      if (d && d.enumerable) protoEnum.push(n);
    }
    p = Object.getPrototypeOf(p);
  }
  return {
    cssProtoAll: protoAll,
    cssProtoEnum: protoEnum,
    ua: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages,
    cores: navigator.hardwareConcurrency,
    appVersion: navigator.appVersion,
    oscpu: navigator.oscpu,
    vendor: navigator.vendor,
    productSub: navigator.productSub,
    appName: navigator.appName,
    product: navigator.product,
    maxTouchPoints: navigator.maxTouchPoints,
    webdriver: navigator.webdriver,
    pdfViewerEnabled: navigator.pdfViewerEnabled,
    deviceMemory: navigator.deviceMemory === undefined ? null : navigator.deviceMemory,
    hasAudioContext: typeof AudioContext,
    hasRTC: typeof RTCPeerConnection,
    screen: { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight, cd: screen.colorDepth, pd: screen.pixelDepth },
    win: { iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight, sx: screenX, sy: screenY, dpr: devicePixelRatio },
    webgl: gl ? {
      37445: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      37446: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    } : null,
    exts: gl ? gl.getSupportedExtensions() : [],
    localStorage: local,
    body: document.body ? { oh: document.body.offsetHeight, ch: document.body.clientHeight } : null,
  };
}"""


def main():
    seed = sys.argv[1]
    ts = int(sys.argv[2])
    out = pathlib.Path(sys.argv[3])
    sdk = pathlib.Path(sys.argv[4]) if len(sys.argv) > 4 else ROOT / "config" / "_sdk_6d66a65a.inst.js"
    url = sys.argv[5] if len(sys.argv) > 5 else "https://www.zhipin.com/robots.txt"
    src = sdk.read_text(encoding="utf-8", errors="replace")
    srv = _serve()

    with Camoufox(headless=True) as browser:
        page = browser.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
        except Exception as exc:  # 站点不可达时退回本地 localhost（安全上下文）
            print(f"navigate failed ({type(exc).__name__}), fallback to localhost")
            page.goto("http://127.0.0.1:8765/", wait_until="load")
        page.evaluate(EVAL_FN, PRELUDE)
        page.evaluate(EVAL_FN, src)
        kind = page.evaluate("() => typeof window.ABC")
        if kind != "function":
            raise RuntimeError(f"ABC not defined after eval: {kind}")
        result = page.evaluate(MINT_FN, [seed, ts])
        env = page.evaluate(ENV_FN)

    out.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

    # 把同一次启动的指纹写入 browser_env.json，供 jsdom 复用
    env_path = ROOT / "config" / "browser_env.json"
    merged = json.loads(env_path.read_text(encoding="utf-8")) if env_path.exists() else {}
    merged.update({k: v for k, v in env.items() if k != "body"})
    if env.get("body"):
        merged["body"] = env["body"]
    if result.get("canvas"):
        merged["canvas"] = result["canvas"]
    # SDK 对 CSS 原型链的枚举顺序 = 数组里“首次重复前”的那一段。
    # 直接以它为准，避免再靠猜（Firefox 原型名 1173 个，但 SDK 只看到 1152 个）。
    big = (result.get("big") or {}).get("19458")
    if big:
        seen, prefix = set(), []
        for name in big:
            if name in seen:
                break
            seen.add(name)
            prefix.append(name)
        merged["cssSdkProto"] = prefix
        print("css proto prefix captured:", len(prefix))
    env_path.write_text(json.dumps(merged), encoding="utf-8")

    print("browser stages:", len(result["log"]), "api:", len(result["api"]), "token len:", result["len"])
    print("fingerprint:", env["ua"][:48], "|", env["platform"], "|", env["screen"], "| cores", env["cores"])


if __name__ == "__main__":
    main()
