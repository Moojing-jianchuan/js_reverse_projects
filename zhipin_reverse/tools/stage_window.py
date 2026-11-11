import json
import sys

a = json.load(open(sys.argv[1], encoding="utf-8"))
b = json.load(open(sys.argv[2], encoding="utf-8"))
lo, hi = int(sys.argv[3]), int(sys.argv[4])
print(f"{'idx':>4} {'browser':<58} jsdom")
for i in range(lo, hi):
    ea = a["log"][i] if i < len(a["log"]) else None
    eb = b["log"][i] if i < len(b["log"]) else None
    sa = f"p={ea['p']} r={str(ea['r'])[:44]}" if ea else "-"
    sb = f"p={eb['p']} r={str(eb['r'])[:44]}" if eb else "-"
    mark = "" if (ea and eb and ea["p"] == eb["p"] and ea["r"] == eb["r"]) else "  <<"
    print(f"{i:>4} {sa:<58} {sb}{mark}")
