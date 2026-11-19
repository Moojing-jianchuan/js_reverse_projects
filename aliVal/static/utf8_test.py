#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Hypothesis: `enc` is UTF-8 text (20% of its bytes >= 0x80 is exactly the UTF-8
two-byte-sequence rate). Test strict UTF-8 validity and look at the decoded text."""
import base64, os, unicodedata, collections

CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
load = lambda n: open(os.path.join(CFG, n), encoding="utf-8").read().strip()

for name in ("sample_data.b64", "data_sample.txt", "data_fresh.txt", "data_from_page.txt"):
    s = load(name)
    raw = base64.b64decode(s + "=" * (-len(s) % 4))
    enc = raw[3:]
    print(f"=== {name}  enc={len(enc)}")
    try:
        txt = enc.decode("utf-8")
        print(f"    STRICT UTF-8 OK -> {len(txt)} chars")
        cat = collections.Counter(unicodedata.category(c) for c in txt)
        print("    categories:", dict(cat))
        print("    preview:", repr(txt[:120]))
        print("    is all printable:", all(c.isprintable() or c in '\r\n\t' for c in txt))
    except UnicodeDecodeError as e:
        # how far does it get?
        ok = 0
        b = enc
        i = 0
        while i < len(b):
            try:
                b[i:].decode("utf-8")
                ok = len(b); break
            except UnicodeDecodeError as ee:
                # count decodable prefix
                ok = i + ee.start
                break
        print(f"    NOT valid UTF-8: {e}")
        print(f"    decodable prefix: {ok}/{len(enc)} = {ok/len(enc):.1%}")
    print()
