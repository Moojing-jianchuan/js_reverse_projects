#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare the local bundle archive (older FeiLin builds) for the armour anchors."""
import os, re

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
FILES = ["feilin002.js", "feilin009.js", "feilin075.js", "pe080.js", "pe_dynamic.js",
         "AliyunCaptcha.js", "AliyunCaptcha_new.js"]
PATS = {
    "magic 37,19,39": re.compile(r"37,\s*19,\s*39|25,\s*13,\s*39|0x25,\s*0x13|251327"),
    "deflate": re.compile(r"deflate"),
    "btoa": re.compile(r"btoa"),
    "pool 139^": re.compile(r"139\^"),
    "32768 subarray": re.compile(r"32768"),
    "fromCharCode apply": re.compile(r"fromCharCode"),
    "Uint8Array": re.compile(r"Uint8Array"),
    "daye salt": re.compile(r"daye,raolewoba"),
    "111jdk439": re.compile(r"111jdk439dJJIjd023823201"),
    "87f879f1": re.compile(r"87f879f135f27da7"),
}
for f in FILES:
    p = os.path.join(CFG, f)
    if not os.path.exists(p):
        continue
    s = open(p, encoding="utf-8", errors="replace").read()
    print(f"=== {f}  chars={len(s)}")
    for k, rx in PATS.items():
        offs = [m.start() for m in rx.finditer(s)][:8]
        print(f"    {k:<20} {offs if offs else 0}")

