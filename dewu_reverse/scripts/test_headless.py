# -*- coding: utf-8 -*-
"""headless 下诊断：captcha 相关请求是否被 page.on('response') 捕获"""
import sys, time, json
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from camoufox.sync_api import Camoufox

hits = []
with Camoufox(headless=True, locale="zh-CN", i_know_what_im_doing=True) as browser:
    page = browser.new_page()

    def on_response(resp):
        u = resp.url
        if "captcha" in u or "feeds/info" in u:
            rec = {"url": u.split("?")[0][-60:], "status": resp.status}
            if "captcha/call" in u:
                try:
                    j = resp.json()
                    d = j.get("data") or {}
                    rec["bgList"] = len(d.get("bgList") or [])
                    rec["hasBgImage"] = bool(d.get("bgImage"))
                except Exception as e:
                    rec["jsonErr"] = str(e)[:120]
            hits.append(rec)
            print(f"   [resp] {rec}", flush=True)

    page.on("response", on_response)
    page.goto("https://www.dewu.com/", wait_until="domcontentloaded", timeout=40000)
    for i in range(12):
        time.sleep(1.5)
        n = page.evaluate("document.querySelectorAll('img.moveImg').length")
        print(f"   [{i}] moveImg={n} hits={len(hits)}", flush=True)
        if n and any(h.get("bgList") for h in hits):
            break

print("\n=== 汇总 ===")
for h in hits:
    print(" ", h)
