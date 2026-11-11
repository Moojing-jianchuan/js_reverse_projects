"""控制组：浏览器挑战页生成 token → python 立刻发送，验证出口与链路是否干净。

用法：
  python tools/control_group.py                 # 直连 + 强制 IPv4（默认；本机 IPv6 被封）
  python tools/control_group.py --proxy http://127.0.0.1:7897
  python tools/control_group.py --jsdom         # 额外用 jsdom token 对照

判据：
  控制组 code 0（jobList 有数据）→ 出口/链路正常，此时 jsdom 的 37/38 才是有效证据。
"""

import argparse
import subprocess
import time
import urllib.parse

from camoufox.sync_api import Camoufox
from curl_cffi import requests
from curl_cffi.const import CurlIpResolve, CurlOpt

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
URL = "https://www.zhipin.com/wapi/zpgeek/search/joblist.json"
SEC = "https://www.zhipin.com/passport/zp/security.html"
SEC = "https://www.zhipin.com/web/passport/zp/security.html"
BODY = (
    "page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query="
    "&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience="
    "&degree=&industry=&scale=&stage=&scene=1&encryptExpectId="
)
COOKIES = {"isOHPC": "1", "__g": "-"}
CURL_OPTS = {CurlOpt.IPRESOLVE: CurlIpResolve.V4}


def headers():
    return {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        "x-requested-with": "XMLHttpRequest",
        "Origin": "https://www.zhipin.com",
        "Referer": "https://www.zhipin.com/web/geek/jobs?city=101040100&position=100101",
    }


def post(proxies, cookies):
    return requests.post(URL, headers=headers(), data=BODY, cookies=cookies,
                         impersonate="firefox144", timeout=30, proxies=proxies,
                         curl_options=CURL_OPTS).json()


def get_seed(proxies):
    j = post(proxies, dict(COOKIES))
    zp = j.get("zpData") or {}
    print(f"[seed] code={j.get('code')} name={zp.get('name')} seed={(zp.get('seed') or '')[:24]}...")
    return zp


def send(proxies, token, label):
    cookies = dict(COOKIES)
    cookies["__zp_stoken__"] = urllib.parse.quote(token, safe="")
    j = post(proxies, cookies)
    n = len((j.get("zpData") or {}).get("jobList") or [])
    print(f"[{label}] code={j.get('code')} jobs={n} msg={j.get('message')}")
    return j


def browser_token(zp, proxy, timeout=25):
    url = (f"{SEC}?callbackUrl={urllib.parse.quote('https://www.zhipin.com/web/geek/jobs', safe='')}"
           f"&appName=zhipin_geek_spa_web&code=37&seed={urllib.parse.quote(zp['seed'], safe='')}"
           f"&ts={zp.get('ts')}&name={zp.get('name')}")
    kwargs = {"headless": True, "firefox_user_prefs": {"network.dns.disableIPv6": True}}
    if proxy:
        kwargs["proxy"] = {"server": proxy}
    got = {}

    def handler(route):
        # 页面自己即将用掉 token —— 在它发出去的这一刻截下来，然后阻断这次请求
        try:
            cookie = route.request.headers.get("cookie", "")
            for part in cookie.split(";"):
                k, _, v = part.strip().partition("=")
                if k == "__zp_stoken__" and v:
                    got.setdefault("token", v)
        except Exception:
            pass
        try:
            route.abort()
        except Exception:
            pass

    with Camoufox(**kwargs) as browser:
        page = browser.new_page()
        page.route("**/wapi/zpgeek/search/joblist.json", handler)
        try:
            page.goto(url, wait_until="commit", timeout=60000)
        except Exception as e:
            print("[browser] goto 未完成（继续等 token）:", type(e).__name__)
        deadline = time.time() + timeout
        while time.time() < deadline and "token" not in got:
            page.wait_for_timeout(50)
        tok = got.get("token")
        if tok:
            print(f"[browser] token len={len(tok)} (从页面请求头截获)")
    return tok


def jsdom_token(zp):
    import glob
    sdk = sorted(p for p in glob.glob("config/_sdk_*.js") if ".inst." not in p)[-1]
    out = subprocess.check_output(["node", "gen_token2.js", sdk, zp["seed"], str(zp["ts"])],
                                  text=True).strip()
    print(f"[jsdom] token len={len(out)}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--proxy")
    ap.add_argument("--jsdom", action="store_true")
    args = ap.parse_args()
    proxies = {"http": args.proxy, "https": args.proxy} if args.proxy else None

    zp = get_seed(proxies)
    if not zp.get("seed"):
        print("没有 seed，出口可能仍被风控")
        return
    tok = browser_token(zp, args.proxy)
    if tok:
        send(proxies, tok, "control(browser)")

    if args.jsdom:
        zp2 = get_seed(proxies)
        if zp2.get("seed"):
            send(proxies, jsdom_token(zp2), "experiment(jsdom)")


if __name__ == "__main__":
    main()
