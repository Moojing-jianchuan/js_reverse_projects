#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Structural probe of the armour output `enc`.

Facts to explain: enc has ~200+ distinct byte values (so it is NOT a function of the
6-bit symbol alone), yet 40% of its bytes are base64-alphabet chars and only 20% are
>= 0x80 (a uniform stream cipher would give 25% / 50%).

If the armour is a *position-dependent bijection* (rotate/xor with a periodic key),
then values at positions with the same residue class must fall in a small fixed set.
A stream cipher shows no such structure. This test discriminates the two.
"""
import base64, os, collections

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
load = lambda n: open(os.path.join(CFG, n), encoding="utf-8").read().strip()

def enc_of(name):
    s = load(name)
    raw = base64.b64decode(s + "=" * (-len(s) % 4))
    return raw[3:]

for name in ("data_from_page.txt", "sample_data.b64", "data_sample.txt"):
    enc = enc_of(name)
    print(f"=== {name}  len={len(enc)} distinct={len(set(enc))}")
    for m in (1, 2, 4, 8):
        classes = collections.defaultdict(set)
        for i, b in enumerate(enc):
            classes[i % m].add(b)
        sizes = sorted(len(v) for v in classes.values())
        expected_random = 256 * (1 - (1 - 1 / 256) ** (len(enc) / m))
        print(f"    mod {m}: distinct-per-class min={sizes[0]} max={sizes[-1]} "
              f"| random expectation ~{expected_random:.0f}  (64 => rotation key)")
    # high-bit periodicity
    hi = [i for i, b in enumerate(enc) if b >= 0x80]
    print(f"    bytes>=0x80: {len(hi)}/{len(enc)} = {len(hi)/len(enc):.1%}")
    for m in (2, 3, 4, 8):
        c = collections.Counter(i % m for i in hi)
        print(f"      mod {m} distribution: {dict(sorted(c.items()))}")
    # are the >=0x80 bytes contiguous in runs?
    runs = []
    cur = 0
    for b in enc:
        if b >= 0x80:
            cur += 1
        elif cur:
            runs.append(cur); cur = 0
    if cur:
        runs.append(cur)
    print(f"    high-byte runs: n={len(runs)} avg={sum(runs)/max(1,len(runs)):.2f} max={max(runs) if runs else 0}")
