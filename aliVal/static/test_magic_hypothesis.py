#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test hypothesis: data = base64( 0x25,0x13,0x27 || ascii( base64(deflate)[3:] ) )
i.e. the encoder swaps the leading 3 base64 chars ('eJz') for the 3 magic bytes.
Try to inflate by restoring candidate prefixes."""
import base64, zlib, sys, os, json, itertools, string

BASE = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.join(os.path.dirname(BASE), "config")

ALPHA = string.ascii_uppercase + string.ascii_lowercase + string.digits + "+/"

def load(name):
    p = os.path.join(CFG, name)
    return open(p, encoding="utf-8", errors="replace").read().strip()

def analyze(tag, data_b64, deflate_b64=None):
    raw = base64.b64decode(data_b64 + "=" * (-len(data_b64) % 4))
    print(f"--- {tag}: data_b64={len(data_b64)} chars -> raw={len(raw)} bytes")
    print(f"    magic = {raw[:3].hex()}  ({list(raw[:3])})")
    enc = raw[3:]
    printable = sum(1 for b in enc if 32 <= b < 127)
    print(f"    enc={len(enc)} bytes, printable={printable} ({printable/max(1,len(enc)):.1%}),"
          f" all-in-b64alpha={all(chr(b) in ALPHA for b in enc)}")
    print(f"    enc[:48] = {enc[:48]!r}")
    if deflate_b64:
        print(f"    deflate_b64={len(deflate_b64)} chars -> bytes={len(base64.b64decode(deflate_b64 + '='*(-len(deflate_b64)%4)))}")
        print(f"    deflate_b64[:12]={deflate_b64[:12]!r}")
    # try to inflate by restoring a 2-3 char prefix
    hits = []
    cands = [""] + [c for c in ALPHA] + [a + b for a in "eJ" for b in ALPHA]
    for pfx in cands:
        s = pfx.encode() + enc
        if len(s) % 4:
            continue
        try:
            blob = base64.b64decode(s)
        except Exception:
            continue
        try:
            out = zlib.decompress(blob)
            hits.append((pfx, len(blob), len(out), out[:200]))
        except Exception:
            pass
    print(f"    inflate candidates that worked: {len(hits)}")
    for pfx, bl, ol, head in hits[:6]:
        print(f"      prefix={pfx!r} blob={bl} out={ol}  head={head[:120]!r}")
    return raw, enc, hits

def main():
    for name in ("sample_data.b64", "data_sample.txt", "data_fresh.txt"):
        try:
            analyze(name, load(name))
        except Exception as e:
            print(f"{name}: {e!r}")
    print()
    print("### paired sample (deflate + data from same round)")
    d = load("sample_deflate.b64")
    analyze("sample_data.b64 (paired test)", load("sample_data.b64"), d)
    # direct structural check: enc == ascii(base64(deflate)[3:])?
    enc = base64.b64decode(load("sample_data.b64"))[3:]
    print("    structural eq with deflate[3:]:", enc == d[3:].encode())

if __name__ == "__main__":
    main()
