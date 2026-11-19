#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test whether enc (from data) is a per-6-bit-symbol mapping of base64(deflate).

Paired candidate sample: config/sample_deflate.b64 (639 B -> 852 chars)
                        config/sample_data.b64     (852 B total -> 849 enc)
852 - 3 == 849  => consistent with 'enc = f(base64(deflate)) with the first 3 symbols
replaced by magic' OR 'enc = f(base64(deflate)[3:])'.
"""
import base64, os, collections, sys

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")

def load(n):
    return open(os.path.join(CFG, n), encoding="utf-8", errors="strict").read().strip()

def main():
    b64 = load("sample_deflate.b64")
    raw = base64.b64decode(load("sample_data.b64") + "=" * (-len(load("sample_data.b64")) % 4))
    enc = raw[3:]
    print(f"b64(deflate) chars={len(b64)}   enc bytes={len(enc)}")
    for shift in (0, 3, -3):
        n = min(len(enc), len(b64) - max(0, shift))
        m = collections.defaultdict(set)
        for i in range(n):
            j = i + shift
            if j < 0 or j >= len(b64):
                continue
            m[b64[j]].add(enc[i])
        consistent = sum(1 for k, v in m.items() if len(v) == 1)
        print(f"shift={shift:+d}: symbols={len(m)} consistent={consistent} "
              f"avg_targets={sum(len(v) for v in m.values())/len(m):.2f}")

    # Also: is enc a plain XOR of the base64 text with a keystream?
    print("\nkeystream stats (enc[i] ^ ord(b64[i+3])):")
    ks = [enc[i] ^ ord(b64[i + 3]) for i in range(min(len(enc), len(b64) - 3))]
    print("  first 32:", " ".join(f"{b:02x}" for b in ks[:32]))
    c = collections.Counter(ks)
    print("  distinct keystream bytes:", len(c), " top:", c.most_common(8))
    # test if keystream repeats with period p
    for p in (1, 2, 3, 4, 8, 16, 32, 64, 128):
        agree = sum(1 for i in range(len(ks) - p) if ks[i] == ks[i + p])
        print(f"  period {p:>3}: agreement {agree}/{len(ks)-p} = {agree/(len(ks)-p):.3f}")

    # byte histogram of enc
    h = collections.Counter(enc)
    print("\nenc byte histogram: distinct =", len(h))
    print("  low(<0x40):", sum(v for k, v in h.items() if k < 0x40),
          " mid(0x40-0x7f):", sum(v for k, v in h.items() if 0x40 <= k < 0x80),
          " high(>=0x80):", sum(v for k, v in h.items() if k >= 0x80))

if __name__ == "__main__":
    main()
