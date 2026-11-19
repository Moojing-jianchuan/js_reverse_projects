#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dump the exact region of the verifyType/mode rewrite plus ep() preconditions."""
import os, sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bundles",
                   "pe.081.a2ede546e341a1b9.js")
src = open(SRC, encoding="utf-8", errors="replace").read()

needles = [
    '"3.0"===o.verifyType',
    '"3.0"===n&&"embed"===this.mode',
    '"3.0"===t.verifyType',
]
for nd in needles:
    i = src.find(nd)
    while i != -1:
        print(f"=== {nd!r} at {i}")
        print(src[max(0, i - 260):i + 320])
        print()
        i = src.find(nd, i + 1)
