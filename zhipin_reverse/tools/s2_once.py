"""一次性 S2 测试：同源环境 + 立即发送。

流程：
  1. 跑一次浏览器侧（假 seed），把当次会话的指纹/canvas/webgl 写进 config/browser_env.json
  2. 立刻取真实 seed（IPv4 直连，干净出口）
  3. jsdom 用刚采集的环境生成 token
  4. 立刻发送该 token，看 code

用法：
  python tools/s2_once.py
  python tools/s2_once.py --skip-capture    # 直接用现有 config 生成 token（不刷新环境）
"""

import argparse
import json
import pathlib
import subprocess
import sys
import urllib.parse

from curl_cffi import requests
from curl_cffi.const import CurlIpResolve, CurlOpt

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
URL = "https://www.zhipin.com/wapi/zpgeek/search/joblist.json"
BODY = (
    "page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query="
    "&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience="
    "&degree=&industry=&scale=&stage=&scene=1&encryptExpectId="
)
FAKE_SEED = ("YQAP74fSyX0Vv2BbyKpqlOha4SoxsROVXQmXYTPgTlZ3qMkFpkh1zCEJbfbRifV0Tyd8AhJv869B"
             "peO3xNZ7ug==")
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


def post(cookies):
    return requests.post(URL, headers=headers(), data=BODY, cookies=cookies,
                         impersonate="firefox144", timeout=30,
                         curl_options=CURL_OPTS).json()


def capture_env():
    """跑一次浏览器侧，刷新 config/browser_env.json（含 canvas/webgl/CSS 列表）。"""
    sdk = "config/_sdk_6d66a65a.inst.js"
    r = subprocess.run([sys.executable, "tools/stage_run_browser.py", FAKE_SEED, "1794329300000",
                        "tmp_browser_stages.json", sdk], cwd=str(ROOT), capture_output=True, text=True)
    tail = (r.stdout or r.stderr).strip().splitlines()[-1:] or [""]
    print("[capture]", tail[0][:100])


def gen_token(seed, ts):
    r = subprocess.run(["node", "gen_token2.js", "config/_sdk_6d66a65a.js", seed, str(ts)],
                       cwd=str(ROOT), capture_output=True, text=True)
    return (r.stdout or "").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-capture", action="store_true")
    args = ap.parse_args()

    if not args.skip_capture:
        capture_env()

    j = post({"isOHPC": "1", "__g": "-"})
    zp = j.get("zpData") or {}
    print(f"[seed] code={j.get('code')} name={zp.get('name')}")
    if not zp.get("seed"):
        return

    tok = gen_token(zp["seed"], zp["ts"])
    print(f"[token] len={len(tok)}")

    j2 = post({"isOHPC": "1", "__g": "-", "__zp_stoken__": urllib.parse.quote(tok, safe="")})
    jobs = (j2.get("zpData") or {}).get("jobList") or []
    print(f"[send] code={j2.get('code')} jobs={len(jobs)} msg={j2.get('message')}")


if __name__ == "__main__":
    main()
