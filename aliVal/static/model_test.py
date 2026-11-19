#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Refine the armour model test.

Model M:  enc[i] = (T[i+3] ^ ks7[i]) | (flag[i] << 7)
          ks7 uniform on 0..127, flag ~ Bernoulli(p)
Predictions:
  P(byte < 0x80)          = 1-p
  conditional distribution uniform on 0..127 and on 128..255
  P(byte in base64 alpha) = (1-p) * 64/128 = (1-p)/2
"""
import base64, os, collections

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
load = lambda n: open(os.path.join(CFG, n), encoding="utf-8").read().strip()
B64 = set(ord(c) for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")

def stats(name):
    s = load(name)
    enc = base64.b64decode(s + "=" * (-len(s) % 4))[3:]
    n = len(enc)
    low = [b for b in enc if b < 0x80]
    high = [b for b in enc if b >= 0x80]
    p = len(high) / n
    inb = sum(1 for b in enc if b in B64)
    print("=== %s  n=%d" % (name, n))
    print("    P(high)                = %.4f" % p)
    print("    P(in base64 alphabet)  = %.4f   model predicts (1-p)/2 = %.4f"
          % (inb / n, (1 - p) / 2))
    for label, arr, base in (("low  0x00-0x7f", low, 0), ("high 0x80-0xff", high, 128)):
        if not arr:
            continue
        h = collections.Counter(arr)
        chi = 0.0
        for v in range(128):
            exp = len(arr) / 128.0
            obs = h.get(v + base, 0)
            chi += (obs - exp) ** 2 / exp
        print("    %s: n=%d distinct=%d mean_count=%.2f chi2=%.1f (dof=127, uniform gives ~127)"
              % (label, len(arr), len(h), len(arr) / 128.0, chi))
    hi = [i for i, b in enumerate(enc) if b >= 0x80]
    for m in (5, 10):
        c = collections.Counter(i % m for i in hi)
        exp = len(hi) / float(m)
        chi = sum((c.get(k, 0) - exp) ** 2 / exp for k in range(m))
        print("    high-byte positions mod %d: %s  chi2=%.2f (dof=%d)"
              % (m, dict(sorted(c.items())), chi, m - 1))
    print()

for nm in ("sample_data.b64", "data_sample.txt", "data_fresh.txt", "data_from_page.txt"):
    stats(nm)
