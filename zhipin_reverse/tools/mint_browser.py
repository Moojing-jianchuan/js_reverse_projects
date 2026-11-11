"""在真实 Camoufox 里（非 zhipin 页面）生成 token 并立刻用 python 发送。

用途：区分「token 内容不对」与「SDK 必须跑在 zhipin 页面上下文里」。
"""

import pathlib
import sys
import time
import urllib.parse

from camoufox.sync_api import Camoufox
from curl_cffi import requests
from curl_cffi.const import CurlIpResolve, CurlOpt

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from stage_run_browser import PRELUDE, _serve  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
URL = "https://www.zhipin.com/wapi/zpgeek/search/joblist.json"
BODY = ("page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query="
        "&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience="
        "&degree=&industry=&scale=&stage=&scene=1&encryptExpectId=")
H = {"User-Agent": UA, "Accept": "application/json, text/plain, */*",
     "Content-Type": "application/x-www-form-urlencoded",
     "x-requested-with": "XMLHttpRequest", "Origin": "https://www.zhipin.com",
     "Referer": "https://www.zhipin.com/web/geek/jobs?city=101040100&position=100101"}
OPTS = {CurlOpt.IPRESOLVE: CurlIpResolve.V4}


def main():
    srv = _serve()
    j = requests.post(URL, headers=H, data=BODY, cookies={"isOHPC": "1", "__g": "-"},
                      impersonate="firefox144", timeout=30, curl_options=OPTS).json()
    zp = j.get("zpData") or {}
    print("[seed] code:", j.get("code"))
    if not zp.get("seed"):
        return

    src = (ROOT / "config" / "_sdk_6d66a65a.js").read_text(encoding="utf-8", errors="replace")
    t0 = time.time()
    with Camoufox(headless=True, firefox_user_prefs={"network.dns.disableIPv6": True}) as browser:
        page = browser.new_page()
        page.goto("http://127.0.0.1:8765/", wait_until="load", timeout=20000)
        page.evaluate("(s) => { (0, eval)(s); }", src)
        tok = page.evaluate(
            "([seed, ts]) => { const tz = new Date().getTimezoneOffset();"
            " return new window.ABC().z(seed, ts + (480 + tz) * 60000); }",
            [zp["seed"], zp["ts"]])
    print(f"[browser-mint] len={len(tok)} {(time.time()-t0)*1000:.0f}ms")

    j2 = requests.post(URL, headers=H, data=BODY,
                       cookies={"isOHPC": "1", "__g": "-",
                                "__zp_stoken__": urllib.parse.quote(tok, safe="")},
                       impersonate="firefox144", timeout=30, curl_options=OPTS).json()
    jobs = (j2.get("zpData") or {}).get("jobList") or []
    print(f"[send] code={j2.get('code')} jobs={len(jobs)} msg={j2.get('message')}")


if __name__ == "__main__":
    main()
