#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Report the pretty-file line number (fmt.py scheme: newline inserted after ; { })
for a list of original char offsets."""
import os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(BASE, "bundles", "pe.081.a2ede546e341a1b9.js")
src = open(BUNDLE, encoding="utf-8", errors="replace").read()

OFFS = [int(x) for x in sys.argv[1:]] or [
    40048, 194841, 265458, 265621, 265778, 266010, 269899, 305843, 306692,
    306736, 313589, 389393, 396402, 422138, 435921, 443084,
]
line = 1
targets = sorted(OFFS)
res = {}
ti = 0
quote = None
esc = False
for i, ch in enumerate(src):
    while ti < len(targets) and targets[ti] == i:
        res[targets[ti]] = line
        ti += 1
    if ti >= len(targets):
        break
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
for o in OFFS:
    print(f"offset {o:>8}  ->  pe081.pretty.js line {res.get(o, '?')}")
