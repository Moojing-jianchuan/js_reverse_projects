#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""find.py PATTERN [FILE...]
Search the ORIGINAL bundle and report (orig char offset, pretty-file line, pretty-file col)
so REPORT_A can cite stable coordinates. Also prints a context window."""
import os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))
BD = os.path.join(BASE, "bundles")
WORK = os.path.join(BASE, "work")
PRETTY = {
    "feilin076.dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1.js": "feilin076.pretty.js",
    "pe.081.a2ede546e341a1b9.js": "pe081.pretty.js",
    "AliyunCaptcha.js": "aliyunCaptcha.pretty.js",
}

def pretty_index(src):
    """return array line_of[i] = pretty line number of original char i"""
    n = len(src)
    line_of = [0] * n
    quote = None
    esc = False
    line = 1
    for i, ch in enumerate(src):
        line_of[i] = line
        if quote:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == quote:
                quote = None
            continue
        if ch in "\"'`":
            quote = ch
            continue
        if ch in ";{}":
            line += 1
    return line_of

def main():
    pat = sys.argv[1]
    files = sys.argv[2:] or sorted(PRETTY.keys())
    rx = re.compile(pat)
    for fn in files:
        p = os.path.join(BD, fn) if not os.path.isabs(fn) else fn
        src = open(p, encoding="utf-8", errors="replace").read()
        line_of = pretty_index(src)
        hits = list(rx.finditer(src))
        print(f"--- {os.path.basename(p)}: {len(hits)} hit(s) for {pat!r}  (pretty={PRETTY.get(os.path.basename(p))})")
        for m in hits[:40]:
            s = max(0, m.start() - 80)
            e = min(len(src), m.end() + 80)
            print(f"  off={m.start():>7} line={line_of[m.start()]:>5} | {src[s:e]}")
        if len(hits) > 40:
            print(f"  ... ({len(hits)-40} more)")

if __name__ == "__main__":
    main()
