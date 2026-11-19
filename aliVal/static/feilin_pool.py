#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Locate feilin076's string pool + its decoder."""
import os, re

BASE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(BASE, "bundles",
        "feilin076.dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1.js"),
           encoding="utf-8", errors="replace").read()

needle = '["q2+eg2oYg29"'
i = src.find(needle)
print("pool start", i)
j = src.find("];", i)
print("array end", j, "array len", j - i)
print("before:", repr(src[max(0, i - 300):i]))
print("after :", repr(src[j:j + 1600]))
print()
# how many quoted entries?
seg = src[i:j]
print("entries:", seg.count('","') + 1 if seg else 0)
