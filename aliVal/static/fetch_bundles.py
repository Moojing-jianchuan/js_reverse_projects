#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Download the 3 FeiLin 1.5.4 bundles and record version identity (sha256 + bytes)."""
import json, hashlib, os, sys, urllib.request, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "bundles")
os.makedirs(OUT, exist_ok=True)

URLS = [
    "https://g.alicdn.com/captcha-frontend/FeiLin/1.5.4/feilin076.dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1.js",
    "https://g.alicdn.com/captcha-frontend/dynamicJS/3.29.0/pe.081.a2ede546e341a1b9.js",
    "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js",
]

def local_name(url):
    tail = url.rstrip("/").split("/")[-1]
    return tail

def fetch(url, path):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0",
        "Referer": "https://tool.manmanbuy.com/",
        "Accept": "*/*",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        hdrs = dict(r.headers)
    with open(path, "wb") as f:
        f.write(data)
    return data, hdrs

def main():
    recs = []
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
    for url in URLS:
        name = local_name(url)
        path = os.path.join(OUT, name)
        try:
            data, hdrs = fetch(url, path)
            sha = hashlib.sha256(data).hexdigest()
            rec = {
                "url": url,
                "file": os.path.relpath(path, BASE).replace("\\", "/"),
                "bytes": len(data),
                "sha256": sha,
                "fetched_at": now,
                "content_type": hdrs.get("Content-Type"),
                "last_modified": hdrs.get("Last-Modified"),
                "etag": hdrs.get("ETag"),
                "status": "ok",
            }
            print(f"OK  {len(data):>9} B  {sha[:16]}  {name}")
        except Exception as e:
            rec = {"url": url, "file": None, "status": "error", "error": repr(e),
                   "fetched_at": now}
            print(f"ERR {url} -> {e!r}")
        recs.append(rec)
    outp = os.path.join(BASE, "bundles.json")
    with open(outp, "w", encoding="utf-8") as f:
        json.dump({"generated_at": now, "bundles": recs}, f, indent=2, ensure_ascii=False)
    print("wrote", outp)

if __name__ == "__main__":
    main()
