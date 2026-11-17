"""BOSS 直聘 joblist 采集器（协议取数）。

链路（2026-11-17 用 SDK b9a070d3 实测）：
  1) POST /wapi/zpgeek/search/joblist.json  → {"code":37,"zpData":{seed,name,ts}}
  2) 用同版本 security-js/<name>.js 生成 token：new ABC().z(seed, ts + 60*(480+tzoff)*1000)
  3) POST /wapi/zppassport/set/zpToken（空 body，Referer 带 ?_security_check=1_<ms>）→ code 0
  4) 再 POST joblist → code 0 + 数据；token 可复用多次，直接翻页

token 生成方式（--mint）：
  local      node + jsdom 本地补环境算（离线可跑；服务端目前判 code 38「环境存在异常」）
  browser    本脚本自带 Camoufox 在真实页面里算（实验性，当前同样 38）
  bootstrap  让浏览器自己过挑战，取它的 cookie 罐 + token 交给协议层（实验性）
  auto/session+token-file  两阶段：本脚本只取 seed，token 由外部真实浏览器铸好注入（已验证可用）

用法：
  # A. 已验证可用：两阶段（协议取 seed -> 真实浏览器铸 token -> 协议取数）
  python zhipin_client.py --phase seed --session config/session.json
  python zhipin_client.py --session config/session.json --token-file config/token.txt --pages 3 --out data/jobs.jsonl

  # B. 纯本地（当前会被判 code 38，用于继续研究环境）
  python zhipin_client.py --mint local --pages 1
"""

import argparse
import json
import os
import random
import subprocess
import sys
import time
import urllib.parse

from curl_cffi import requests
from curl_cffi.const import CurlIpResolve, CurlOpt

BASE = "https://www.zhipin.com"
JOBS_URL = BASE + "/web/geek/jobs"
JOBLIST = BASE + "/wapi/zpgeek/search/joblist.json"
SET_TOKEN = BASE + "/wapi/zppassport/set/zpToken"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
IMPERSONATE = "firefox144"
PAGE_SIZE = 15
DEFAULT_CITY, DEFAULT_POSITION = "101210100", "100508"
DEFAULT_SDK = "config/_sdk_b9a070d3.js"
ALPHABET = "0123456789abcdef"

CITY = DEFAULT_CITY
POSITION = DEFAULT_POSITION


def trace_id():
    return "F-" + "".join(random.choice(ALPHABET) for _ in range(23))


def base_cookies():
    now = int(time.time())
    return {
        "isOHPC": "1",
        "__g": "-",
        "__c": str(now),
        "__l": ("l=%2Fwww.zhipin.com%2Fweb%2Fgeek%2Fjobs%3Fquery%3D%26city%3D" + CITY
                + "%26position%3D" + POSITION + "&r=&g=&s=3&friend_source=0"),
        "__a": "%s.%s..%s.1.1.1.1" % (random.randint(10000000, 99999999), now, now),
        "ab_guid": "%08x-%04x-%04x-%04x-%012x" % (random.getrandbits(32), random.getrandbits(16),
                                                  random.getrandbits(16), random.getrandbits(16),
                                                  random.getrandbits(48)),
    }


def headers(referer, no_content_type=False):
    h = {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "x-requested-with": "XMLHttpRequest",
        "traceid": trace_id(),
        "Origin": BASE,
        "Referer": referer,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
    }
    if not no_content_type:
        h["Content-Type"] = "application/x-www-form-urlencoded"
    return h


def form(page, city=None, position=None):
    city = city or CITY
    position = position or POSITION
    return ("page=%d&pageSize=%d&city=%s&position=%s&expectInfo=&query="
            "&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience="
            "&degree=&industry=&scale=&stage=&scene=1&encryptExpectId="
            % (page, PAGE_SIZE, city, position))


def mint_local(sdk_file, seed, raw_ts, cookies=None, page_url=None):
    """用 node + jsdom 本地补环境算 token。"""
    env = dict(os.environ)
    env.pop("ZP_COOKIES", None)
    if cookies:
        env["ZP_COOKIES"] = json.dumps(cookies, ensure_ascii=False)
    cmd = [os.environ.get("NODE", "node"), "--allow-natives-syntax",
           "gen_token2.js", sdk_file, seed, str(raw_ts)]
    if page_url:
        cmd.append(page_url)
    return subprocess.check_output(cmd, text=True, env=env).strip()


class BrowserMinter:
    """开一个 Camoufox，在真实 zhipin 页面里跑官方 SDK 算 token。"""

    def __init__(self, proxy=None):
        from camoufox.sync_api import Camoufox
        kw = {"headless": True, "os": ["windows"], "locale": "zh-CN"}
        if proxy:
            kw["proxy"] = proxy
        self._cm = Camoufox(**kw)
        self.browser = self._cm.__enter__()
        self.page = self.browser.new_page()
        try:
            self.page.goto("%s?query=&city=%s&position=%s" % (JOBS_URL, CITY, POSITION),
                           wait_until="domcontentloaded", timeout=45000)
        except Exception:
            self.page.goto(BASE + "/robots.txt", wait_until="domcontentloaded", timeout=30000)
        # 等页面自己过完挑战（拿到 __zp_stoken__ 且回到业务页）再算 token
        for _ in range(45):
            try:
                ck = self._eval("() => document.cookie", None, 1) or ""
                if "__zp_stoken__" in ck and "/web/geek/jobs" in self.page.url:
                    break
            except Exception:
                pass
            time.sleep(1)

    def _eval(self, expr, arg=None, tries=8):
        """挑战过程会导航，evaluate 可能拿到已销毁的执行上下文，这里重试。"""
        last = None
        for _ in range(tries):
            try:
                if arg is None:
                    return self.page.evaluate(expr)
                return self.page.evaluate(expr, arg)
            except Exception as exc:  # noqa: BLE001
                last = exc
                time.sleep(1.2)
                try:
                    self.page.wait_for_load_state("domcontentloaded", timeout=5000)
                except Exception:
                    pass
        raise RuntimeError("page.evaluate 重试失败: %s" % last)

    def ensure_sdk(self, name):
        if self._eval("() => typeof window.ABC") == "function":
            return
        self._eval(
            """async (name) => {
                 const src = await (await fetch('/web/passport/zp/security-js/' + name + '.js',
                                                {cache: 'no-store'})).text();
                 (0, eval)(src);
               }""", name)
        if self._eval("() => typeof window.ABC") != "function":
            raise RuntimeError("SDK 加载后仍无 window.ABC")

    def mint(self, name, seed, raw_ts):
        self.ensure_sdk(name)
        return self._eval(
            """([seed, ts]) => String(new window.ABC().z(seed,
                   ts + 60 * (480 + new Date().getTimezoneOffset()) * 1000))""", [seed, raw_ts])

    def jar_and_token(self):
        """把浏览器会话的整罐 cookie 与 __zp_stoken__ 交给协议层。"""
        for _ in range(40):
            try:
                ck = {c["name"]: c["value"] for c in self.browser.contexts[0].cookies()}
            except Exception:
                ck = {}
            if ck.get("__zp_stoken__"):
                return ck
            try:
                self._eval("() => document.cookie", None, 1)
            except Exception:
                pass
            time.sleep(1)
        raise RuntimeError("页面未拿到 __zp_stoken__（挑战未完成或被风控）")

    def close(self):
        try:
            self._cm.__exit__(None, None, None)
        except Exception:
            pass


class Zhipin:
    def __init__(self, mint="auto", sdk=DEFAULT_SDK, proxy=None, verbose=True,
                 token_file=None, session=None):
        self.mint_mode = mint
        self.sdk = sdk
        self.proxy = proxy
        self.verbose = verbose
        self.token_file = token_file
        self.session = session
        self.cookies = base_cookies()
        self.token = None
        self.name = None
        self.minter = None
        self.proxies = {"http": proxy, "https": proxy} if proxy else None
        # 本机 IPv6 出口在 BOSS 那边是黑的（code 35），固定走 IPv4 才是干净出口
        self.curl_options = {CurlOpt.IPRESOLVE: CurlIpResolve.V4}

    def log(self, *a):
        if self.verbose:
            print(*a, file=sys.stderr)

    def _referer(self, checked=False):
        r = "%s?query=&city=%s&position=%s" % (JOBS_URL, CITY, POSITION)
        if checked:
            r += "&_security_check=1_%d" % int(time.time() * 1000)
        return r

    def _jar(self):
        ck = dict(self.cookies)
        if self.token:
            ck["__zp_stoken__"] = urllib.parse.quote(self.token, safe="")
        return ck

    def joblist(self, page=1):
        r = requests.post(JOBLIST, headers=headers(self._referer(page > 1)),
                          data=form(page), cookies=self._jar(),
                          impersonate=IMPERSONATE, proxies=self.proxies, timeout=30,
                          curl_options=self.curl_options)
        return r.json()

    def register(self):
        r = requests.post(SET_TOKEN, headers=headers(self._referer(True), no_content_type=True),
                          cookies=self._jar(), impersonate=IMPERSONATE,
                          proxies=self.proxies, timeout=30,
                          curl_options=self.curl_options)
        try:
            return r.json()
        except Exception:
            return {"code": r.status_code, "raw": r.text[:200]}

    def mint_token(self, seed, raw_ts, name):
        if self.mint_mode == "local":
            return mint_local(self.sdk, seed, raw_ts, cookies=self.cookies,
                              page_url=self._referer())
        if self.minter is None:
            self.log("[mint] 启动 Camoufox 算 token ...")
            self.minter = BrowserMinter(proxy=self.proxy)
        return self.minter.mint(name, seed, raw_ts)

    def ensure_token(self):
        # 两阶段模式：cookie 罐与 token 都来自外部（真实浏览器）
        if self.session and self.token_file:
            self.cookies = self.session["cookies"]
            self.token = open(self.token_file, encoding="utf-8").read().strip()
            self.log("[token] 注入 len=%d（seed=%s...）"
                     % (len(self.token), self.session["seed"][:16]))
            reg = self.register()
            self.log("[set/zpToken] code=%s" % reg.get("code"))
            j1 = self.joblist(1)
            if j1.get("code") != 0:
                raise RuntimeError("注入 token 未通过：code=%s %s"
                                   % (j1.get("code"), j1.get("message")))
            return j1

        j = self.joblist(1)
        if j.get("code") == 0:
            return j
        if self.mint_mode == "bootstrap":
            self.log("[bootstrap] 用 Camoufox 建立会话并取 token ...")
            self.minter = BrowserMinter(proxy=self.proxy)
            ck = self.minter.jar_and_token()
            token = ck.pop("__zp_stoken__")
            self.cookies.update(ck)
            self.token = urllib.parse.unquote(token)
            self.log("[bootstrap] cookie %d 项, token_len=%d" % (len(self.cookies), len(self.token)))
            j1 = self.joblist(1)
            if j1.get("code") != 0:
                raise RuntimeError("bootstrap 后仍未通过：code=%s %s"
                                   % (j1.get("code"), j1.get("message")))
            return j1

        zp = j.get("zpData") or {}
        if not zp.get("seed"):
            raise RuntimeError("未拿到 seed: %s" % json.dumps(j, ensure_ascii=False)[:300])
        self.name = zp.get("name")
        self.log("[seed] code=%s name=%s ts=%s" % (j.get("code"), self.name, zp.get("ts")))
        for attempt in (1, 2):
            token = self.mint_token(zp["seed"], int(zp["ts"]), self.name)
            self.token = token
            reg = self.register()
            self.log("[set/zpToken] code=%s token_len=%d" % (reg.get("code"), len(token)))
            j2 = self.joblist(1)
            if j2.get("code") == 0:
                return j2
            self.log("[probe] code=%s %s" % (j2.get("code"), j2.get("message")))
            if self.mint_mode == "auto" and self.minter is None and attempt == 1:
                self.log("[mint] 本地 token 未通过，切换到浏览器算 token")
                continue
            raise RuntimeError("token 未通过：code=%s %s" % (j2.get("code"), j2.get("message")))
        raise RuntimeError("token 生成失败")

    def collect(self, pages=1, out=None):
        first = self.ensure_token()
        jobs, seen = [], set()

        def push(jl):
            for job in jl or []:
                key = job.get("encryptJobId") or job.get("jobId")
                if key and key not in seen:
                    seen.add(key)
                    jobs.append(job)

        first_list = (first.get("zpData") or {}).get("jobList") or []
        push(first_list)
        self.log("[page 1] %d 条" % len(first_list))

        for n in range(2, pages + 1):
            j = self.joblist(n)
            if j.get("code") != 0:
                self.log("[page %d] code=%s %s（停止翻页）" % (n, j.get("code"), j.get("message")))
                break
            jl = (j.get("zpData") or {}).get("jobList") or []
            if not jl:
                self.log("[page %d] 空列表，原始返回: %s"
                         % (n, json.dumps(j, ensure_ascii=False)[:300]))
            push(jl)
            self.log("[page %d] %d 条" % (n, len(jl)))
            if not jl:
                break
            time.sleep(random.uniform(0.8, 1.8))

        if out:
            os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
            with open(out, "w", encoding="utf-8") as f:
                for job in jobs:
                    f.write(json.dumps(job, ensure_ascii=False) + "\n")
            self.log("[saved] %s (%d 条)" % (out, len(jobs)))
        return jobs

    def fetch_seed_phase(self, session_file):
        """第一阶段：用新建 cookie 罐取一次挑战包，落盘供外部算 token。"""
        j = self.joblist(1)
        zp = j.get("zpData") or {}
        data = {"cookies": self.cookies, "code": j.get("code"),
                "seed": zp.get("seed"), "ts": zp.get("ts"), "name": zp.get("name"),
                "savedAt": int(time.time() * 1000)}
        os.makedirs(os.path.dirname(session_file) or ".", exist_ok=True)
        with open(session_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return data

    def close(self):
        if self.minter:
            self.minter.close()


def main():
    global CITY, POSITION
    ap = argparse.ArgumentParser()
    ap.add_argument("--mint", choices=["auto", "local", "browser", "bootstrap"], default="auto")
    ap.add_argument("--sdk", default=DEFAULT_SDK)
    ap.add_argument("--city", default=DEFAULT_CITY)
    ap.add_argument("--position", default=DEFAULT_POSITION)
    ap.add_argument("--pages", type=int, default=1)
    ap.add_argument("--out", default=None)
    ap.add_argument("--proxy", default=os.environ.get("ZP_PROXY"))
    ap.add_argument("--token-file", default=None,
                    help="外部注入 __zp_stoken__（裸 token，不用 percent 编码）")
    ap.add_argument("--session", default=None,
                    help="两阶段会话文件：--phase seed 写入，--phase run 读取（复用同一罐 cookie）")
    ap.add_argument("--phase", choices=["seed", "run"], default="run")
    a = ap.parse_args()

    CITY, POSITION = a.city, a.position
    session = None
    if a.session and a.phase == "run":
        session = json.load(open(a.session, encoding="utf-8"))
    z = Zhipin(mint=a.mint, sdk=a.sdk, proxy=a.proxy, token_file=a.token_file, session=session)

    if a.phase == "seed":
        data = z.fetch_seed_phase(a.session or "config/session.json")
        print(json.dumps({k: data[k] for k in ("code", "name", "ts")}, ensure_ascii=False))
        if data.get("seed"):
            print("SEED=" + data["seed"])
        z.close()
        return

    try:
        jobs = z.collect(pages=a.pages, out=a.out)
        print("共 %d 条职位" % len(jobs))
        for job in jobs[:3]:
            print(" - %s | %s | %s" % (job.get("jobName"), job.get("brandName"), job.get("salaryDesc")))
    finally:
        z.close()


if __name__ == "__main__":
    main()
