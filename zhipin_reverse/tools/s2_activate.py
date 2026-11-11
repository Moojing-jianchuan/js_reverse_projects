"""尝试「先做一次 _security_check 页面导航激活 token，再调接口」。

流程：取 seed → jsdom 生成 token → GET jobs?_security_check=1_<ms>（带 token）→ POST joblist
"""

import pathlib
import subprocess
import sys
import time
import urllib.parse

from curl_cffi import requests
from curl_cffi.const import CurlIpResolve, CurlOpt

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
API = "https://www.zhipin.com/wapi/zpgeek/search/joblist.json"
PAGE = "https://www.zhipin.com/web/geek/jobs"
BODY = ("page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query="
        "&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience="
        "&degree=&industry=&scale=&stage=&scene=1&encryptExpectId=")
H = {"User-Agent": UA, "Accept": "application/json, text/plain, */*",
     "Accept-Language": "en-US,en;q=0.9",
     "Content-Type": "application/x-www-form-urlencoded",
     "x-requested-with": "XMLHttpRequest", "Origin": "https://www.zhipin.com",
     "Referer": PAGE}
OPTS = {CurlOpt.IPRESOLVE: CurlIpResolve.V4}


def get_seed():
    j = requests.post(API, headers=H, data=BODY, cookies={"isOHPC": "1", "__g": "-"},
                      impersonate="firefox144", timeout=30, curl_options=OPTS).json()
    return j.get("code"), (j.get("zpData") or {})


def mint(seed, ts):
    sdk = "config/_sdk_6d66a65a.js"
    r = subprocess.run(["node", "gen_token2.js", sdk, seed, str(ts)],
                       cwd=str(ROOT), capture_output=True, text=True)
    return (r.stdout or "").strip()


def main():
    code, zp = get_seed()
    print("[seed] code:", code)
    if not zp.get("seed"):
        return
    tok = mint(zp["seed"], zp["ts"])
    print("[token] len:", len(tok))
    ck = {"isOHPC": "1", "__g": "-", "__zp_stoken__": urllib.parse.quote(tok, safe="")}

    ms = int(time.time() * 1000)
    p = requests.get(f"{PAGE}?_security_check=1_{ms}",
                     headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"},
                     cookies=ck, impersonate="firefox144", timeout=30, curl_options=OPTS)
    print(f"[nav] {p.status_code} len={len(p.text)} 含职位页标记={'职位' in p.text[:4000]}")

    j = requests.post(API, headers=H, data=BODY, cookies=ck,
                      impersonate="firefox144", timeout=30, curl_options=OPTS).json()
    jobs = (j.get("zpData") or {}).get("jobList") or []
    print(f"[api] code={j.get('code')} jobs={len(jobs)} msg={j.get('message')}")


if __name__ == "__main__":
    main()
