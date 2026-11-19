#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ctx.py FILE OFF [BEFORE] [AFTER] [WIDTH]
Print the region around char offset OFF, hard-wrapped for readability."""
import sys, os

BASE = os.path.dirname(os.path.abspath(__file__))
BD = os.path.join(BASE, "bundles")

def main():
    fn = sys.argv[1]
    off = int(sys.argv[2])
    before = int(sys.argv[3]) if len(sys.argv) > 3 else 300
    after = int(sys.argv[4]) if len(sys.argv) > 4 else 900
    width = int(sys.argv[5]) if len(sys.argv) > 5 else 160
    p = fn if os.path.isabs(fn) else os.path.join(BD, fn)
    src = open(p, encoding="utf-8", errors="replace").read()
    s = max(0, off - before)
    e = min(len(src), off + after)
    seg = src[s:e]
    print(f"### {os.path.basename(p)} [{s}:{e}] (offset of interest = {off})")
    for i in range(0, len(seg), width):
        print(f"{s+i:>8} | {seg[i:i+width]}")

if __name__ == "__main__":
    main()
