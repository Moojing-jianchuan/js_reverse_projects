#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pairing test: cross-correlate every data sample's enc bytes against the base64
text and the raw deflate bytes of the (only) deflate sample we have, over shifts.
A genuine pair shows a very high match ratio at one shift; unrelated pairs stay at
the base64-alphabet chance level (~1/64)."""
import base64, os, zlib, itertools

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
load = lambda n: open(os.path.join(CFG, n), encoding="utf-8").read().strip()

T = load("sample_deflate.b64")
D = base64.b64decode(T + "=" * (-len(T) % 4))
payload = zlib.decompress(D)
print(f"deflate T={len(T)} chars  D={len(D)} bytes  payload={len(payload)}")

samples = {}
for n in ("sample_data.b64", "data_sample.txt", "data_fresh.txt", "data_from_page.txt"):
    s = load(n)
    raw = base64.b64decode(s + "=" * (-len(s) % 4))
    samples[n] = raw
    print(f"{n}: b64={len(s)} raw={len(raw)} magic={raw[:3].hex()} enc={len(raw)-3}")

def ratio(a, b, shift):
    n = min(len(a), len(b) - shift)
    if n <= 0:
        return 0, 0
    m = sum(1 for i in range(n) if a[i] == b[i + shift])
    return m, n

print("\n=== enc vs b64(deflate) text, shifts -8..8 ===")
for name, raw in samples.items():
    enc = raw[3:]
    best = max(((ratio(enc, T.encode(), s), s) for s in range(-8, 9)), key=lambda x: x[0][0] / x[0][1])
    (m, n), s = best
    print(f"  {name:<20} best shift={s:+d} match={m}/{n} = {m/n:.3f}")

print("\n=== enc vs raw deflate bytes (cast) ===")
for name, raw in samples.items():
    enc = raw[3:]
    if len(D) < len(enc):
        a, b = D, enc
    else:
        a, b = enc, D
    m, n = ratio(a, b, 0)
    print(f"  {name:<20} direct match={m}/{n} = {m/n:.3f}")

print("\n=== payload vs enc: is enc maybe the payload ciphered? (lengths) ===")
print(f"  payload={len(payload)} enc(sample_data)={len(samples['sample_data.b64'])-3}")

print("\n=== does the payload of the deflate sample carry a 32-hex nonce prefix? ===")
print("  ", payload[:32])
print("   followed by:", payload[32:32+80])
