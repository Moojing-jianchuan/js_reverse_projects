import json
import sys

a = json.load(open(sys.argv[1], encoding="utf-8"))
b = json.load(open(sys.argv[2], encoding="utf-8"))
la, lb = a["log"], b["log"]
SKIP = {3300, 6443, 3492}  # 时间 / 随机
rows = []
for i in range(min(len(la), len(lb))):
    if la[i]["p"] != lb[i]["p"]:
        rows.append((i, la[i]["p"], "ORDER"))
        break
    if la[i]["r"] != lb[i]["r"] or la[i]["a"] != lb[i]["a"]:
        rows.append((i, la[i]["p"], "VALUE"))
print("divergent stages (ordered by index, time/random excluded):")
n = 0
for i, p, kind in rows:
    if p in SKIP:
        continue
    print(f"\n#{i} p={p} {kind}")
    print("  browser a=", la[i]["a"], "r=", la[i]["r"])
    print("  jsdom   a=", lb[i]["a"], "r=", lb[i]["r"])
    n += 1
    if n >= 3:
        break
