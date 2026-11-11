"""在浏览器里做消融：逐个覆盖环境项，看 p=2726 的 7 元数组哪一位变化。

用法：python tools/ablate_browser.py
"""

import json
import pathlib

from camoufox.sync_api import Camoufox

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = "YQAP74fSyX0Vv2BbyKpqlOha4SoxsROVXQmXYTPgTlZ3qMkFpkh1zCEJbfbRifV0Tyd8AhJv869BpeO3xNZ7ug=="
TS = 1794329300000
TARGET = 2726
PRELUDE = (ROOT / "tools" / "prelude_stage.js").read_text(encoding="utf-8")
SDK = (ROOT / "config" / "_sdk_6d66a65a.inst.js").read_text(encoding="utf-8", errors="replace")

CASES = {
    "baseline": "",
    "plugins=0": "Object.defineProperty(navigator,'plugins',{value:[],configurable:true});",
    "mimeTypes=0": "Object.defineProperty(navigator,'mimeTypes',{value:[],configurable:true});",
    "touch=5": "Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true});",
    "cores=8": "Object.defineProperty(navigator,'hardwareConcurrency',{value:8,configurable:true});",
    "noAudio": "delete window.AudioContext;",
    "noRTC": "delete window.RTCPeerConnection;",
    "canvas_stub": "HTMLCanvasElement.prototype.toDataURL=function(){return 'data:,A';};",
    "webgl_null": "HTMLCanvasElement.prototype.getContext=function(t){return t==='2d'?null:null;};",
    "cookie_clear": "document.cookie.split(';').forEach(function(c){var k=c.split('=')[0].trim();if(k)document.cookie=k+'=; max-age=0; path=/';});",
}

MINT = """([seed, ts]) => {
  const tz = new Date().getTimezoneOffset();
  const tok = String(new window.ABC().z(seed, ts + (480 + tz) * 60000));
  const entry = (window.__stageLog || []).find(e => e.p === %d);
  return { ret: entry ? entry.r : 'missing', len: tok.length };
}""" % TARGET


def main():
    results = {}
    with Camoufox(headless=True) as browser:
        for label, code in CASES.items():
            page = browser.new_page()
            try:
                page.goto("https://www.zhipin.com/robots.txt", wait_until="domcontentloaded", timeout=60000)
                if code:
                    page.evaluate("(src) => { (0, eval)(src); }", code)
                page.evaluate("(src) => { (0, eval)(src); }", PRELUDE)
                page.evaluate("(src) => { (0, eval)(src); }", SDK)
                res = page.evaluate(MINT, [SEED, TS])
                results[label] = res
                print(f"{label:<16} p={TARGET} -> {res['ret']}  token_len={res['len']}")
            except Exception as exc:  # noqa: BLE001
                print(f"{label:<16} ERROR {exc}")
            finally:
                page.close()
    (ROOT / "tmp_ablate_browser.json").write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
