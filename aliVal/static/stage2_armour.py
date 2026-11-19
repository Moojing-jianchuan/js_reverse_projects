#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Stage 2 of the 'armour layer' analysis.

New model (derived from the length arithmetic — see REPORT_A):
    T   = btoa(deflate(payload))                 # ASCII, len 4k
    C   = stream(T, key, nonce)                  # length-preserving binary, len 4k
    buf = 0x25 0x13 0x27 || C[3:]                # 3 armour bytes replace C[0:3]
    data= btoa(buf)                              # len 4k chars

This script inflates the paired deflate sample, extracts the nonce that the SDK
writes as a 32-hex prefix, derives the observed keystream ks = T[3:] ^ enc and
tests a battery of keystream generators.
"""
import base64, zlib, os, hashlib, struct, sys

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")

def load(n):
    return open(os.path.join(CFG, n), encoding="utf-8").read().strip()

def main():
    T = load("sample_deflate.b64")                    # base64(deflate)
    D = base64.b64decode(T + "=" * (-len(T) % 4))     # deflate bytes
    payload = zlib.decompress(D)
    print(f"T (b64 of deflate) len = {len(T)}")
    print(f"deflate bytes          = {len(D)}  head={D[:4].hex()}")
    print(f"payload (inflated)     = {len(payload)} bytes")
    print(f"payload head           = {payload[:120]!r}")

    raw = base64.b64decode(load("sample_data.b64"))
    print(f"\ndata raw = {len(raw)} bytes, magic={raw[:3].hex()}")
    C = raw[3:]
    print(f"enc      = {len(C)} bytes   (expect len(T)-3 = {len(T)-3})")
    if len(C) != len(T) - 3:
        print("!! length mismatch — samples are probably not from the same round")

    # keystream under the model enc[i] == T[i+3] ^ ks[i]
    ks = bytes(a ^ b for a, b in zip(C, T[3:].encode()))
    print(f"ks = {len(ks)} bytes; head = {ks[:32].hex()}")

    # nonce candidate: the 32-hex prefix the SDK writes into the payload
    head = payload[:32].decode("latin1")
    print(f"payload[0:32] = {head!r}  hex?={all(c in '0123456789abcdef' for c in head)}")
    nonce_hex = head
    nonce = bytes.fromhex(nonce_hex)
    print(f"nonce bytes   = {nonce.hex()}")

    # --- test battery ------------------------------------------------------
    def check(name, cand):
        cand = bytes(cand)
        n = min(len(cand), len(ks))
        if n == 0:
            return
        agree = sum(1 for i in range(n) if cand[i] == ks[i])
        print(f"  {name:<52} match {agree}/{n} = {agree/n:.3f}")

    print("\n[1] linear recurrence mod 256: ks[i+1] = a*ks[i]+c  (solve from 2 pairs)")
    for (i, j) in ((0, 1), (1, 2), (5, 6), (100, 101)):
        x, y = ks[i], ks[i + 1]
        z, w = ks[j], ks[j + 1]
        # y = a*x+c ; w = a*z+c  (mod 256)
        dy = (y - x) % 256
        dz = (w - z) % 256
        print(f"    pair ({i},{j}): dy={dy} dz={dz}")

    print("\n[2] RC4 with key candidates")
    def rc4(key, n):
        S = list(range(256)); j = 0
        for i in range(256):
            j = (j + S[i] + key[i % len(key)]) & 0xff
            S[i], S[j] = S[j], S[i]
        out = bytearray(); i = j = 0
        for _ in range(n):
            i = (i + 1) & 0xff; j = (j + S[i]) & 0xff
            S[i], S[j] = S[j], S[i]
            out.append(S[(S[i] + S[j]) & 0xff])
        return bytes(out)
    for label, key in [
        ("nonce(raw16)", nonce), ("nonce(hex32 ascii)", nonce_hex.encode()),
        ("nonce+nonce", nonce + nonce), ("sha256(nonce)[:16]", hashlib.sha256(nonce).digest()[:16]),
        ("md5(nonce)", hashlib.md5(nonce).digest()),
    ]:
        check("RC4 " + label, rc4(key, len(ks)))

    print("\n[3] AES-CTR / MD5-counter style keystreams (pure python, no deps)")
    # MD5 counter mode: block_i = md5(key || counter_i)
    for label, key in [("nonce", nonce), ("nonce_hex", nonce_hex.encode())]:
        for order in ("le", "be"):
            for width in (4, 8):
                out = bytearray()
                for c in range(0, (len(ks) + 15) // 16 + 1):
                    cb = c.to_bytes(width, order)
                    out += hashlib.md5(key + cb).digest()
                check(f"MD5(key={label}+ctr{width}{order})", out[:len(ks)])

    print("\n[4] direct: is ks simply T-derived (e.g. prev byte / self-hash)?")
    check("ks[i] == T[i+3]  (identity => no cipher)", T[3:].encode())
    check("ks[i] == T[i+2]", T[2:-1].encode())

    print("\n[5] byte-frequency sanity of ks")
    import collections
    h = collections.Counter(ks)
    print(f"    distinct={len(h)}  top={h.most_common(5)}")

    print("\n[6] payload field names")
    import re
    print("   ", re.findall(rb'"([A-Za-z_][A-Za-z0-9_]*)"\s*:', payload)[:60])

if __name__ == "__main__":
    main()
