#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Histogram shape of `enc`: show per-16-value blocks to reveal step structure."""
import base64, os

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
load = lambda n: open(os.path.join(CFG, n), encoding="utf-8").read().strip()

for name in ("sample_data.b64", "data_from_page.txt"):
    s = load(name)
    enc = base64.b64decode(s + "=" * (-len(s) % 4))[3:]
    h = [0] * 256
    for b in enc:
        h[b] += 1
    print(f"=== {name} len={len(enc)}")
    print("   value blocks (16 values each):")
    for blk in range(16):
        row = h[blk * 16:(blk + 1) * 16]
        print(f"   {blk*16:02x}-{blk*16+15:02x}: " + " ".join(f"{v:>3}" for v in row) + f"   | sum={sum(row)}")
    print("   per-value table (0..255):")
    for row_start in range(0, 256, 32):
        print(f"   {row_start:02x}: " + " ".join(f"{h[i]:>3}" for i in range(row_start, row_start + 32)))
    print()
