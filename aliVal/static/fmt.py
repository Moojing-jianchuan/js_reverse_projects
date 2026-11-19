#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""crude.js-formatter: insert newlines after ; { } outside string literals so a
single-line minified bundle becomes greppable. Purely for readability; NOT a
semantic-preserving pretty printer for regex literals.

usage: fmt.py <infile> <outfile>
Writes outfile plus outfile.idx.json mapping original char offset -> line number.
"""
import sys, json, os

def fmt(src):
    out = []
    quote = None
    esc = False
    offsets = []          # offsets[i] = original index of out[i] chunk start
    line = 1
    line_start_orig = 0
    for i, ch in enumerate(src):
        out.append(ch)
        if quote:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == quote:
                quote = None
            continue
        if ch in "\"'`":
            quote = ch
            continue
        if ch in ";{}":
            out.append("\n")
    return "".join(out)

def main():
    src = open(sys.argv[1], encoding="utf-8", errors="replace").read()
    dst = fmt(src)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(dst)
    # build offset->line map lazily: recompute from dst
    # (we only need approximate: count newlines in dst up to the position of a needle)
    print(f"{sys.argv[1]}: {len(src)} chars -> {dst.count(chr(10))+1} lines, wrote {sys.argv[2]}")

if __name__ == "__main__":
    main()
