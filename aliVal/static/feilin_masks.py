#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""feilin076: locate the armour candidate by its bit-mask signature.

Hard constraints derived from the samples (see REPORT_A §6.2bis):
  in : T[3:]  -- base64 text, charCode in 43..122, bit7 always 0
  out: enc     -- same length, low 7 bits ~uniform, bit7 set with p~0.2
So the code must contain a 7-bit mask and/or a high-bit set/clear next to a
per-character loop.
"""
import os, re

BASE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(BASE, "bundles",
                 "feilin076.dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1.js")
src = open(P, encoding="utf-8", errors="replace").read()

PATS = {
    "0x7f": re.compile(r"0x7f"),
    "0x80": re.compile(r"0x80"),
    "&127": re.compile(r"&\s*127\b"),
    "&128": re.compile(r"&\s*128\b"),
    "|128": re.compile(r"\|\s*128\b"),
    "<<7": re.compile(r"<<\s*7\b"),
    ">>7": re.compile(r">>\s*7\b"),
    "&0x7f": re.compile(r"&\s*0x7f"),
    "|0x80": re.compile(r"\|\s*0x80"),
    "127)": re.compile(r"[&|^]\s*127\b"),
    "charCodeAt": re.compile(r"charCodeAt"),
    "fromCharCode": re.compile(r"fromCharCode"),
    "Uint8Array": re.compile(r"Uint8Array"),
    "0x25/37": re.compile(r"\b0x25\b|\b37\b"),
    "251327": re.compile(r"251327"),
    "37,19,39": re.compile(r"37\s*,\s*19\s*,\s*39"),
}

for name, rx in PATS.items():
    hits = [m.start() for m in rx.finditer(src)]
    print(f"{name:<14} {len(hits):>5}  {hits[:14]}")
