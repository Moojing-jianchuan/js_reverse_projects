#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g.py PATTERN [FILE...]  -- regex search across bundles, prints offset + context window."""
import os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))
BD = os.path.join(BASE, "bundles")

def main():
    pat = sys.argv[1]
    files = sys.argv[2:] or sorted(f for f in os.listdir(BD) if f.endswith(".js"))
    rx = re.compile(pat)
    for fn in files:
        p = fn if os.path.isabs(fn) else os.path.join(BD, fn)
        src = open(p, encoding="utf-8", errors="replace").read()
        hits = list(rx.finditer(src))
        print(f"--- {os.path.basename(p)}: {len(hits)} hit(s) for {pat!r}")
        for m in hits[:40]:
            s = max(0, m.start() - 90)
            e = min(len(src), m.end() + 90)
            print(f"  @{m.start():>7}  ...{src[s:e]}...")
        if len(hits) > 40:
            print(f"  ... ({len(hits)-40} more)")

if __name__ == "__main__":
    main()
