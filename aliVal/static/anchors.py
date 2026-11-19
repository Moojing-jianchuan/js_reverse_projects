#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Anchor search across the downloaded bundles. Prints file-relative char offsets + context."""
import os, sys, json

BASE = os.path.dirname(os.path.abspath(__file__))
BD = os.path.join(BASE, "bundles")

ANCHORS = [
    "captchaVerifyParam", "btoa", "atob", "deflate", "inflate", "pako", "zlib",
    "0x25", "0x13", "0x27", "37,19,39", "25,19,39", "Uint8Array", "deviceToken",
    "111jdk439dJJIjd023823201", "222aiJodos2938JDdosko2djd82sf0", "87f879f135f27da7",
    "daye,raolewoba!", "0123456789ABCDEF", "FqJB6iRNVYdEGpwb", "DeviceConfig",
    "initFeiLin", "__ALIYUN_CRYPT", "getRandomValues", "charCodeAt", "fromCharCode",
]

def main():
    files = sorted(f for f in os.listdir(BD) if f.endswith(".js"))
    for fn in files:
        p = os.path.join(BD, fn)
        src = open(p, encoding="utf-8", errors="replace").read()
        print("=" * 100)
        print(f"FILE {fn}  chars={len(src)}")
        for a in ANCHORS:
            idxs = []
            i = src.find(a)
            while i != -1:
                idxs.append(i)
                if len(idxs) >= 12:
                    break
                i = src.find(a, i + 1)
            if idxs:
                print(f"  {a!r:<32} count>={len(idxs)}  at {idxs[:12]}")
            else:
                print(f"  {a!r:<32} 0")

if __name__ == "__main__":
    main()
