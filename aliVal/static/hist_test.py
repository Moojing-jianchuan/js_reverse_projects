#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Is `enc` the base64 text of the deflate with a *partial substitution* applied?
Signature: the frequent byte values of enc should coincide with the base64 alphabet
{A-Z a-z 0-9 + /}, and the rare ones should be high/odd values (the substituted ones)."""
import base64, os, collections, string

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
load = lambda n: open(os.path.join(CFG, n), encoding="utf-8").read().strip()
B64 = set(ord(c) for c in string.ascii_uppercase + string.ascii_lowercase + string.digits + "+/")

for name in ("sample_data.b64", "data_sample.txt", "data_fresh.txt", "data_from_page.txt"):
    s = load(name)
    raw = base64.b64decode(s + "=" * (-len(s) % 4))
    enc = raw[3:]
    h = collections.Counter(enc)
    print(f"=== {name}  enc={len(enc)} distinct={len(h)}")
    inb64 = sum(v for k, v in h.items() if k in B64)
    print(f"    bytes that are base64 alphabet chars: {inb64}/{len(enc)} = {inb64/len(enc):.1%}")
    print(f"    distinct values inside alphabet: {sum(1 for k in h if k in B64)}/64")
    missing = sorted(c for c in B64 if c not in h)
    print(f"    alphabet chars never seen: {bytes(missing)!r}")
    # how concentrated are the top values?
    top = h.most_common(70)
    print("    top-70 values:", " ".join(f"{chr(k) if 32<=k<127 else '\\x%02x'%k}:{v}" for k, v in top[:40]))
    # is the rank order of top-64 frequencies plausible for base64? just report spread
    vals = sorted(h.values(), reverse=True)
    print(f"    freq spread: max={vals[0]} min={vals[-1]} top64_sum={sum(vals[:64])} ({sum(vals[:64])/len(enc):.1%})")
    print(f"    #values with freq>=3: {sum(1 for v in vals if v>=3)}, >=2: {sum(1 for v in vals if v>=2)}")
    print()
