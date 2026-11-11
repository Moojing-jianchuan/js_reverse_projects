"""采集指定指纹的真实浏览器环境 → config/browser_env.json，然后用 jsdom 出 token 并单次验证。

用法：
    python capture_env.py                 # 默认 windows / en-US
    python capture_env.py --os macos --locale zh-CN
"""

import argparse
import json
import os
import pathlib
import subprocess
import urllib.parse

from camoufox.sync_api import Camoufox
from curl_cffi import requests

ROOT = pathlib.Path(__file__).resolve().parent
API = "https://www.zhipin.com/wapi/zpgeek/search/joblist.json"
SEC = "https://www.zhipin.com/web/passport/zp/security-js/{name}.js"
SEC_PAGE = "https://www.zhipin.com/web/passport/zp/security.html"
CALLBACK = "https://www.zhipin.com/web/geek/jobs?city=101040100&position=100101"
BODY = (
    "page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query="
    "&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience="
    "&degree=&industry=&scale=&stage=&scene=1&encryptExpectId="
)
DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
H = {
    "User-Agent": DEFAULT_UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-requested-with": "XMLHttpRequest",
    "Origin": "https://www.zhipin.com",
    "Referer": CALLBACK,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
}

CAPTURE_JS = """
async (sdkPath) => {
  const seen = [];
  const orig = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...a) {
    const r = orig.apply(this, a);
    if (r && r.length > 500) seen.push(r);
    return r;
  };
  try {
    if (sdkPath && typeof window.ABC !== 'function') {
      const src = await (await fetch(sdkPath)).text();
      if (!src.trimStart().startsWith('<')) (0, eval)(src);
    }
    if (typeof window.ABC === 'function') new window.ABC().z('seed-for-capture', 1794329300000);
  } finally {
    HTMLCanvasElement.prototype.toDataURL = orig;
  }
  const gl = document.createElement('canvas').getContext('webgl');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const timing = performance.timing;
  return {
    ua: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages,
    cores: navigator.hardwareConcurrency,
    canvas: seen[0] || null,
    exts: gl ? gl.getSupportedExtensions() : [],
    webgl: gl ? {
      37445: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      37446: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    } : null,
    timing: timing ? {
      navigationStart: timing.navigationStart,
      domLoading: timing.domLoading,
      domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
      loadEventEnd: timing.loadEventEnd,
    } : null,
    screen: { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight, cd: screen.colorDepth, pd: screen.pixelDepth },
    win: { iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight, sx: screenX, sy: screenY, dpr: devicePixelRatio },
  };
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--os", default="windows", choices=["auto", "windows", "macos", "linux"])
    ap.add_argument("--locale", default="en-US")
    ap.add_argument("--no-send", action="store_true", help="只采集环境，不发请求")
    args = ap.parse_args()

    j1 = requests.post(API, headers=H, data=BODY, cookies={"isOHPC": "1", "__g": "-"},
                       impersonate="firefox144").json()
    zp = j1.get("zpData") or {}
    print(f"seed: code={j1.get('code')} name={zp.get('name')} msg={json.dumps(j1.get('message'), ensure_ascii=True)}")
    if not zp.get("seed"):
        print("没有拿到 seed（可能被风控限流），本次只采集环境、不发送。")
        args.no_send = True

    name = zp.get("name")
    sdk_path = ROOT / "config" / f"_sdk_{name}.js" if name else None
    if sdk_path and not sdk_path.exists():
        sdk_path.write_bytes(requests.get(SEC.format(name=name), headers={"User-Agent": DEFAULT_UA}, timeout=30).content)

    with Camoufox(headless=True, os=args.os, locale=args.locale) as browser:
        page = browser.new_page()
        page.goto("https://www.zhipin.com/robots.txt", wait_until="domcontentloaded", timeout=60000)
        env = page.evaluate(CAPTURE_JS, f"/web/passport/zp/security-js/{name}.js" if name else "")

    (ROOT / "config" / "browser_env.json").write_text(json.dumps(env), encoding="utf-8")
    print("captured:", env["ua"], "|", env["platform"], "|", env["screen"], "| cores", env["cores"],
          "| exts", len(env["exts"]), "| canvas", len(env["canvas"] or ""))

    if args.no_send:
        return

    page_url = (SEC_PAGE + "?callbackUrl=" + urllib.parse.quote(CALLBACK, safe="")
                + "&appName=zhipin_geek_spa_web&code=37"
                + "&seed=" + urllib.parse.quote(zp["seed"], safe="")
                + "&ts=" + str(zp["ts"]) + "&name=" + name)
    eg = dict(os.environ)
    eg["ZP_COOKIES"] = json.dumps({"__zp_sseed__": zp["seed"], "__zp_sts__": str(zp["ts"]), "__zp_sname__": name})
    token = subprocess.check_output(
        ["node", "gen_token2.js", f"config/_sdk_{name}.js", zp["seed"], str(zp["ts"]), page_url],
        text=True, cwd=str(ROOT), env=eg,
    ).strip()
    val = urllib.parse.quote(token, safe="")
    # HTTP 头必须与采集到的指纹一致（UA / Accept-Language），否则等于自曝不一致
    send_headers = dict(H)
    if env.get("ua"):
        send_headers["User-Agent"] = env["ua"]
    if env.get("languages"):
        send_headers["Accept-Language"] = ",".join(env["languages"]) + ";q=0.9"
    j2 = requests.post(API, headers=send_headers, data=BODY, cookies={"__zp_stoken__": val},
                       impersonate="firefox144").json()
    z2 = j2.get("zpData") or {}
    print("RESULT code:", j2.get("code"), "jobs:", len(z2.get("jobList") or []),
          "msg:", json.dumps(j2.get("message"), ensure_ascii=True), "len:", len(token))


if __name__ == "__main__":
    main()
