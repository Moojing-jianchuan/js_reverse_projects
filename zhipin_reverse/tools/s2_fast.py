"""延迟测试：常驻 node 服务生成 token，尽量贴近「seed → token → 发送」的实时链路。

用法：
  python tools/s2_fast.py
"""

import subprocess
import time
import urllib.parse

from curl_cffi import requests
from curl_cffi.const import CurlIpResolve, CurlOpt

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


class TokenServer:
    def __init__(self):
        self.p = subprocess.Popen(["node", "tools/token_server.js"],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.p.stdout.readline()  # READY

    def token(self, seed, ts):
        t0 = time.time()
        self.p.stdin.write(f"{seed} {ts}\n")
        self.p.stdin.flush()
        tok = self.p.stdout.readline().strip()
        return tok, (time.time() - t0) * 1000

    def close(self):
        try:
            self.p.kill()
        except Exception:
            pass


def main():
    srv = TokenServer()
    try:
        t0 = time.time()
        j = requests.post(URL, headers=H, data=BODY, cookies={"isOHPC": "1", "__g": "-"},
                          impersonate="firefox144", timeout=30, curl_options=OPTS).json()
        seed_t = (time.time() - t0) * 1000
        zp = j.get("zpData") or {}
        print(f"[seed] code={j.get('code')} {seed_t:.0f}ms")
        if not zp.get("seed"):
            return
        tok, gen_ms = srv.token(zp["seed"], zp["ts"])
        print(f"[token] len={len(tok)} {gen_ms:.0f}ms")
        t1 = time.time()
        j2 = requests.post(URL, headers=H, data=BODY,
                           cookies={"isOHPC": "1", "__g": "-",
                                    "__zp_stoken__": urllib.parse.quote(tok, safe="")},
                           impersonate="firefox144", timeout=30, curl_options=OPTS).json()
        print(f"[send] code={j2.get('code')} jobs={len((j2.get('zpData') or {}).get('jobList') or [])} "
              f"{(time.time()-t1)*1000:.0f}ms msg={j2.get('message')}")
        print(f"[total] {(time.time()-t0)*1000:.0f}ms")
    finally:
        srv.close()


if __name__ == "__main__":
    main()
