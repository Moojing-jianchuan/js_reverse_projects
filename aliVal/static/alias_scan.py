#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Where is window.AliyunCaptcha assigned? Any iframe / shadow DOM in the mount path?"""
import os, re

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bundles")
FILES = [
    "AliyunCaptcha.js",
    "pe.081.a2ede546e341a1b9.js",
    "feilin076.dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1.js",
]
PATS = [
    r'window\.AliyunCaptcha',
    r'\.AliyunCaptcha\s*=',
    r'createElement\("iframe"\)',
    r'\biframe\b',
    r'contentWindow',
    r'contentDocument',
    r'postMessage',
    r'attachShadow',
    r'\.initCaptcha\b',
    r'\.getInstance\b',
    r'initCaptcha\s*=',
]
for f in FILES:
    src = open(os.path.join(BASE, f), encoding="utf-8", errors="replace").read()
    print(f"=== {f[:20]}  chars={len(src)}")
    for p in PATS:
        hits = [m.start() for m in re.finditer(p, src)]
        print(f"   {p:<26} {len(hits):>4}  {hits[:6]}")
    for m in re.finditer(r'window\.AliyunCaptcha|AliyunCaptcha\s*=|initCaptcha\s*=|getInstance\s*=', src):
        o = m.start()
        print(f"   >> @{o}: {src[max(0,o-110):o+80]!r}")
    print()
