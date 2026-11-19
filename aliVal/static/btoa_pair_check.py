#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""btoa_capture.json: are the two btoa outputs from the same round?
Check exact lengths and whether |data_bytes| == |T| - 3 + 3."""
import json, base64, os

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
items = json.load(open(os.path.join(CFG, "btoa_capture.json"), encoding="utf-8"))
for i, it in enumerate(items):
    b = it["b64"]
    pad = "=" * (-len(b) % 4)
    try:
        raw = base64.b64decode(b + pad)
        ok = True
    except Exception as e:
        raw, ok = b"", False
    print(f"[{i}] declared len={it['len']}  b64_chars={len(b)}  decodable={ok} bytes={len(raw)}")
    print(f"     head={b[:24]!r}  tail={b[-12:]!r}")
    if raw:
        print(f"     raw head={raw[:8].hex()}")
    print()

# structural check between item1(T) and item2(data)
T = items[1]["b64"]
D = items[2]["b64"]
print("=== relation test ===")
print(f"|T| = {len(T)} (chars)   => applies to deflate of {len(T)*3//4} bytes")
print(f"|data| = {len(D)} chars => raw {len(D)*3//4} bytes => enc {len(D)*3//4 - 3}")
print(f"model expects enc = |T| - 3 = {len(T)-3}, so data should be {len(T)} bytes = {len(T)*4//3} chars")
print()
# also deviceToken entry (item 0)
print("item0 head (decoded):", base64.b64decode(items[0]["b64"] + "==" * 2)[:60])
