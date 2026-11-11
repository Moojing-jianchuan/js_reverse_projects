import json
import sys

a = json.load(open(sys.argv[1], encoding="utf-8"))
b = json.load(open(sys.argv[2], encoding="utf-8"))
lo, hi = int(sys.argv[3]), int(sys.argv[4])


def picks(d):
    return [r for r in d.get("reads", []) if lo <= r.get("s", -1) <= hi]


ra, rb = picks(a), picks(b)
print(f"browser reads in s[{lo},{hi}]: {len(ra)}")
for r in ra:
    print(f"  s={r['s']} {r['k']:<34} = {str(r['v'])[:50]}")
print(f"\njsdom reads in s[{lo},{hi}]: {len(rb)}")
for r in rb:
    print(f"  s={r['s']} {r['k']:<34} = {str(r['v'])[:50]}")

ka = [(r["k"], r["v"]) for r in ra]
kb = [(r["k"], r["v"]) for r in rb]
print("\nonly-browser:", [k for k, v in ka if (k, v) not in kb][:12])
print("only-jsdom  :", [k for k, v in kb if (k, v) not in ka][:12])
