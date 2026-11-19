#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Find the "+'e'" / '+"e"' concat sites in pe.081 — the obfuscator splits method names
like "initEmbe"+"e", "initFloa"+"t", "initDom"… so the call sites are only visible
through these concatenations."""
import os, re

BASE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(BASE, "bundles", "pe.081.a2ede546e341a1b9.js"),
           encoding="utf-8", errors="replace").read()

pats = [r'\+"e"', r'\+"t"', r'\+"d"']
for p in pats:
    print(f"===== {p}")
    for m in re.finditer(p, src):
        o = m.start()
        print(f"  @{o}: {src[max(0,o-140):o+110]!r}")
    print()
