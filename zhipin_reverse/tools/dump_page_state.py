"""在真实 security.html 上 dump「生成 token 那一刻」的页面状态。

用法：python tools/dump_page_state.py
输出：config/page_state.json（含 cookie/storage/timing/globals/token）
"""

import json
import pathlib
import time
import urllib.parse

from camoufox.sync_api import Camoufox
from curl_cffi import requests
from curl_cffi.const import CurlIpResolve, CurlOpt

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
URL = "https://www.zhipin.com/wapi/zpgeek/search/joblist.json"
SEC = "https://www.zhipin.com/web/passport/zp/security.html"
BODY = ("page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query="
        "&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience="
        "&degree=&industry=&scale=&stage=&scene=1&encryptExpectId=")
H = {"User-Agent": UA, "Accept": "application/json, text/plain, */*",
     "Content-Type": "application/x-www-form-urlencoded",
     "x-requested-with": "XMLHttpRequest", "Origin": "https://www.zhipin.com",
     "Referer": "https://www.zhipin.com/web/geek/jobs?city=101040100&position=100101"}
OPTS = {CurlOpt.IPRESOLVE: CurlIpResolve.V4}

DUMP_JS = """
() => {
  const dumpStore = (s) => { const o = {}; try { for (let i = 0; i < s.length; i++) { const k = s.key(i); o[k] = String(s.getItem(k)).slice(0, 300); } } catch (e) {} return o; };
  const t = performance.timing || {};
  const timing = {};
  for (const k in t) { const v = t[k]; if (typeof v === 'number') timing[k] = v; }
  const globals = {};
  for (const g of ['_passportConfig', 'Security', 'SecurityJsHelper', 'BaseMixin', 'UrlHelper',
                   'CookieHelper', 'EnvHelper', 'WhitelistConfig', 'ABC', 'zp_stoken',
                   'webpackJsonp', '__NUXT__']) {
    try { globals[g] = typeof window[g]; } catch (e) { globals[g] = 'err'; }
  }
  const cfgKeys = (() => {
    try { return Object.keys(window._passportConfig || {}).slice(0, 40); } catch (e) { return []; }
  })();
  return {
    href: location.href,
    origin: location.origin,
    title: document.title,
    cookie: document.cookie,
    localStorage: dumpStore(localStorage),
    sessionStorage: dumpStore(sessionStorage),
    timing,
    navigation: performance.navigation ? { type: performance.navigation.type } : null,
    globals, cfgKeys,
    scriptCount: document.scripts.length,
    inlineCount: Array.from(document.scripts).filter(s => !s.src).length,
    hasStoken: document.cookie.indexOf('__zp_stoken__') >= 0,
  };
}
"""


def main():
    j = requests.post(URL, headers=H, data=BODY, cookies={"isOHPC": "1", "__g": "-"},
                      impersonate="firefox144", timeout=30, curl_options=OPTS).json()
    zp = j.get("zpData") or {}
    print("[seed] code:", j.get("code"), "name:", zp.get("name"))
    if not zp.get("seed"):
        return

    cb = urllib.parse.quote("https://www.zhipin.com/web/geek/jobs", safe="")
    url = (f"{SEC}?callbackUrl={cb}&appName=zhipin_geek_spa_web&code=37"
           f"&seed={urllib.parse.quote(zp['seed'], safe='')}&ts={zp['ts']}&name={zp['name']}")

    with Camoufox(headless=True, firefox_user_prefs={"network.dns.disableIPv6": True}) as browser:
        page = browser.new_page()
        page.route("**/web/geek/jobs*", lambda r: r.abort())   # 阻断跳转，保留 token
        try:
            page.goto(url, wait_until="commit", timeout=60000)
        except Exception as e:
            print("[goto]", type(e).__name__)
        deadline = time.time() + 25
        while time.time() < deadline:
            if any(c.get("name") == "__zp_stoken__" for c in page.context.cookies()):
                break
            page.wait_for_timeout(200)
        page.wait_for_timeout(500)
        state = page.evaluate(DUMP_JS)
        toks = [c["value"] for c in page.context.cookies() if c.get("name") == "__zp_stoken__"]
        state["token"] = toks[0] if toks else None
        state["seed"] = zp["seed"]
        state["ts"] = zp["ts"]

    out = ROOT / "config" / "page_state.json"
    out.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    print("[dump] href:", state["href"][:90])
    print("[dump] cookies:", len(state["cookie"].split("; ")), "| localStorage:", len(state["localStorage"]),
          "| sessionStorage:", len(state["sessionStorage"]))
    print("[dump] token len:", len(state["token"] or ""))
    print("[dump] globals:", {k: v for k, v in state["globals"].items() if v != "undefined"})
    print("[dump] written:", out)


if __name__ == "__main__":
    main()
