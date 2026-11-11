"""测出口：给一个代理，看它能不能拿到 seed（code 37 = IP 干净）。

用法：
  python tools/probe_ip.py                          # 直连
  python tools/probe_ip.py --proxy http://127.0.0.1:7897
  python tools/probe_ip.py --proxy socks5://127.0.0.1:1080
  python tools/probe_ip.py --proxy http://user:pass@host:port

判定：
  code 37 → 出口干净（能拿 seed/name，可以继续做 S2 验证）
  code 35 → 该出口 IP 仍在风控里
"""

import argparse
import json

from curl_cffi import requests

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
URL = "https://www.zhipin.com/wapi/zpgeek/search/joblist.json"
BODY = (
    "page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query="
    "&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience="
    "&degree=&industry=&scale=&stage=&scene=1&encryptExpectId="
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-requested-with": "XMLHttpRequest",
    "Origin": "https://www.zhipin.com",
    "Referer": "https://www.zhipin.com/web/geek/jobs?city=101040100&position=100101",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--proxy", help="http://host:port 或 socks5://host:port")
    args = ap.parse_args()

    proxies = None
    if args.proxy:
        proxies = {"http": args.proxy, "https": args.proxy}

    ip = None
    for echo in ("https://myip.ipip.net", "https://ifconfig.me/ip", "https://api.ipify.org"):
        try:
            t = requests.get(echo, proxies=proxies, impersonate="firefox144", timeout=12).text.strip()
            ip = t.replace("\n", " ")[:80]
            break
        except Exception:
            continue
    print("出口 IP:", ip or "（取不到，跳过；直接看下面的 code）")

    try:
        r = requests.post(URL, headers=HEADERS, data=BODY, proxies=proxies,
                          cookies={"isOHPC": "1", "__g": "-"},
                          impersonate="firefox144", timeout=30)
        j = r.json()
        zp = j.get("zpData") or {}
        print("joblist code:", j.get("code"), "| name:", zp.get("name"),
              "| msg:", j.get("message"))
        if j.get("code") == 37:
            print("→ 出口干净：可以拿 seed 做 S2 验证")
            print("   seed:", (zp.get("seed") or "")[:40] + "...")
        elif j.get("code") == 35:
            print("→ 该出口仍被风控（换一个出口）")
    except Exception as e:
        print("请求失败:", type(e).__name__, str(e)[:120])


if __name__ == "__main__":
    main()
